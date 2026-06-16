import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:video_player/video_player.dart';
import 'package:audioplayers/audioplayers.dart';
import '../../../core/services/api_service.dart';
import '../../../core/services/audio_cache_service.dart';
import '../../../core/services/auth_storage.dart';
import '../../../core/services/language_controller.dart';
import '../models/story_models.dart';
import '../services/story_service.dart';
import '../widgets/story_music_picker.dart';
import '../../profile/profile_screen.dart';

class StoryViewerScreen extends StatefulWidget {
  const StoryViewerScreen({
    super.key,
    required this.groups,
    required this.initialGroupIndex,
    required this.viewerId,
  });

  final List<StoryFeedGroup> groups;
  final int initialGroupIndex;
  final String viewerId;

  @override
  State<StoryViewerScreen> createState() => _StoryViewerScreenState();
}

class _StoryViewerScreenState extends State<StoryViewerScreen>
    with TickerProviderStateMixin {
  late int _groupIdx;
  int _storyIdx = 0;
  bool _paused = false;
  bool _showViewers = false;

  AnimationController? _progressCtrl;
  VideoPlayerController? _videoCtrl;
  bool _videoReady = false;
  AudioPlayer? _audioPlayer;

  // True while waiting for audio to buffer before starting progress.
  bool _waitingForAudio = false;
  // Tracks which story the current audio-load belongs to (cancels stale loads).
  String? _audioLoadForStoryId;

  List<StoryViewer> _viewers = [];
  bool _loadingViewers = false;
  final Map<String, bool> _followMap = {};
  final Set<String> _loadingFollow = {};

  // Local overrides so UI updates immediately without waiting for server round-trip
  String? _localVisibility;
  String? _localReaction; // null = no reaction yet / cleared

  @override
  void initState() {
    super.initState();
    _groupIdx = widget.initialGroupIndex;
    _initStory();
    // Clean up stale cached files from previous sessions (fire-and-forget).
    AudioCacheService.instance.evictOld();
  }

  StoryFeedGroup get _group => widget.groups[_groupIdx];
  StoryItem get _story => _group.stories[_storyIdx];
  bool get _isOwn => _group.userId == widget.viewerId;

  // ── Story navigation ──────────────────────────────────────────────────────

  void _initStory() {
    _stopAudio();
    _disposeVideo();
    _disposeProgress();
    _videoReady = false;
    _paused = false;
    _showViewers = false;
    _waitingForAudio = false;
    // Cancel any stale audio load from a previous story.
    _audioLoadForStoryId = null;
    _localVisibility = _story.visibility;
    _localReaction = _story.myReaction;
    StoryService.markViewed(_story.id);

    if (_story.type == 'media' &&
        _story.mediaType == 'video' &&
        _story.mediaUrl != null) {
      _loadVideo(_story.mediaUrl!);
    } else if (_story.music != null && _story.music!.audioUrl.isNotEmpty) {
      // Sync story + music: wait for audio to buffer, then start both together.
      _initMusicPlayerWithSync(_story.music!);
    } else {
      _startProgress();
    }

    // Kick off background prefetch for upcoming stories (fire-and-forget).
    _prefetchUpcoming();
  }

  /// Prefetches music for the next few stories so they play instantly.
  void _prefetchUpcoming() {
    const lookahead = 3;
    var fetched = 0;
    for (var gi = _groupIdx; gi < widget.groups.length && fetched < lookahead; gi++) {
      final group = widget.groups[gi];
      final startSi = (gi == _groupIdx) ? _storyIdx + 1 : 0;
      for (var si = startSi; si < group.stories.length && fetched < lookahead; si++) {
        final url = group.stories[si].music?.audioUrl ?? '';
        if (url.isNotEmpty) {
          AudioCacheService.instance.prefetch(url);
          fetched++;
        }
      }
    }
  }

  /// Plays story music, preferring a locally cached file for instant start.
  /// Falls back to URL streaming if the file is not yet cached.
  Future<void> _initMusicPlayerWithSync(StoryMusic music) async {
    _stopAudio();
    final storyId = _story.id;
    _audioLoadForStoryId = storyId;

    bool stale() => !mounted || _audioLoadForStoryId != storyId;

    setState(() => _waitingForAudio = true);

    // ── 1. Resolve audio source ──────────────────────────────────────────────
    // Hit in-memory / disk cache first — zero latency when prefetched.
    String? localPath = await AudioCacheService.instance.getCached(music.audioUrl);

    if (localPath == null && !stale()) {
      // Not cached yet. Try to download within 3 s; if it completes in time
      // we play from file (instant playback start). If it times out we fall
      // through to URL streaming as before.
      try {
        localPath = await AudioCacheService.instance
            .fetchAndCache(music.audioUrl)
            .timeout(const Duration(seconds: 3));
      } catch (_) {
        localPath = null;
      }
    }

    if (stale()) {
      if (mounted) setState(() => _waitingForAudio = false);
      return;
    }

    // ── 2. Play ──────────────────────────────────────────────────────────────
    final player = AudioPlayer();
    StreamSubscription<PlayerState>? sub;
    bool audioFailed = false;

    try {
      await player.setReleaseMode(ReleaseMode.loop);

      if (stale()) {
        player.dispose();
        if (mounted) setState(() => _waitingForAudio = false);
        return;
      }

      _audioPlayer = player;

      final completer = Completer<void>();
      sub = player.onPlayerStateChanged.listen((state) {
        if (!completer.isCompleted &&
            (state == PlayerState.playing ||
                state == PlayerState.stopped ||
                state == PlayerState.completed)) {
          completer.complete();
        }
      });

      // Fire-and-forget play — do NOT await. If we await player.play() and
      // the network is slow, it can block indefinitely before the 6 s timeout
      // on completer.future even has a chance to fire, which prevents
      // _startProgress() from ever being called and freezes the story.
      // Instead, play() runs in the background; the completer resolves as soon
      // as PlayerState.playing fires (or after the 6 s safety timeout).
      void onPlayError(_) {
        if (!completer.isCompleted) completer.complete();
      }

      if (localPath != null) {
        player.play(DeviceFileSource(localPath)).catchError(onPlayError);
      } else {
        player
            .play(
              UrlSource(music.audioUrl),
              position: music.startTime > 0
                  ? Duration(seconds: music.startTime)
                  : null,
            )
            .catchError(onPlayError);
      }

      await completer.future.timeout(
        const Duration(seconds: 6),
        onTimeout: () {},
      );
    } catch (_) {
      audioFailed = true;
    } finally {
      sub?.cancel();
    }

    if (audioFailed) {
      if (_audioPlayer == player) _audioPlayer = null;
      player.stop().catchError((_) {}).then((_) => player.dispose().catchError((_) {}));
      if (mounted) {
        setState(() => _waitingForAudio = false);
        _startProgress();
      }
      return;
    }

    if (stale()) {
      if (_audioPlayer == player) _audioPlayer = null;
      player.stop().catchError((_) {}).then((_) => player.dispose().catchError((_) {}));
      if (mounted) setState(() => _waitingForAudio = false);
      return;
    }

    if (mounted) {
      setState(() => _waitingForAudio = false);
      _startProgress();
    }
  }

  void _stopAudio() {
    final p = _audioPlayer;
    _audioPlayer = null;
    if (p != null) {
      // Chain stop → dispose so the native player is halted before teardown.
      p.stop().catchError((_) {}).then((_) => p.dispose().catchError((_) {}));
    }
  }

  void _startProgress() {
    _disposeProgress();
    _progressCtrl = AnimationController(
      vsync: this,
      duration: Duration(milliseconds: _story.displayDurationMs),
    )
      ..forward()
      ..addStatusListener((s) {
        if (s == AnimationStatus.completed) _goNext();
      });
    if (mounted) setState(() {});
  }

  Future<void> _loadVideo(String url) async {
    try {
      final ctrl = VideoPlayerController.networkUrl(Uri.parse(url));
      await ctrl.initialize();
      if (!mounted) {
        ctrl.dispose();
        return;
      }
      _videoCtrl = ctrl;
      _videoReady = true;
      await ctrl.play();

      _disposeProgress();
      final ms = ctrl.value.duration.inMilliseconds;
      _progressCtrl = AnimationController(
        vsync: this,
        duration: Duration(milliseconds: ms > 0 ? ms : 5000),
      )
        ..forward()
        ..addStatusListener((s) {
          if (s == AnimationStatus.completed) _goNext();
        });
      setState(() {});
    } catch (_) {
      _startProgress();
    }
  }

  void _goNext() {
    if (_storyIdx < _group.stories.length - 1) {
      setState(() => _storyIdx++);
    } else if (_groupIdx < widget.groups.length - 1) {
      setState(() {
        _groupIdx++;
        _storyIdx = 0;
      });
    } else {
      _close();
      return;
    }
    _initStory();
  }

  void _goPrev() {
    if (_storyIdx > 0) {
      setState(() => _storyIdx--);
    } else if (_groupIdx > 0) {
      setState(() {
        _groupIdx--;
        _storyIdx = 0;
      });
    } else {
      return;
    }
    _initStory();
  }

  void _close() => Navigator.of(context).pop();

  // ── Pause / resume ────────────────────────────────────────────────────────

  void _pause() {
    _paused = true;
    _progressCtrl?.stop();
    _videoCtrl?.pause();
    _audioPlayer?.pause();
    setState(() {});
  }

  void _resume() {
    _paused = false;
    // If still buffering, don't restart progress — the sync routine will do it.
    if (!_waitingForAudio) {
      _progressCtrl?.forward(from: _progressCtrl!.value);
    }
    _videoCtrl?.play();
    _audioPlayer?.resume();
    setState(() {});
  }

  // ── Viewers overlay ───────────────────────────────────────────────────────

  Future<void> _loadViewers() async {
    setState(() => _loadingViewers = true);
    try {
      final result = await StoryService.getViewers(_story.id);
      if (!mounted) return;
      final map = <String, bool>{};
      for (final v in result.viewers) {
        map[v.userId] = v.isFollowing;
      }
      setState(() {
        _viewers = result.viewers;
        _followMap.addAll(map);
        _loadingViewers = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loadingViewers = false);
    }
  }

  Future<void> _toggleFollow(String userId) async {
    if (_loadingFollow.contains(userId)) return;
    final was = _followMap[userId] ?? false;
    setState(() {
      _loadingFollow.add(userId);
      _followMap[userId] = !was;
    });
    try {
      if (!was) {
        await ApiService.post('/users/$userId/follow',
            extraHeaders: {
              'Authorization': 'Bearer ${_tok()}',
            });
      } else {
        await ApiService.delete('/users/$userId/follow',
            extraHeaders: {
              'Authorization': 'Bearer ${_tok()}',
            });
      }
    } catch (_) {
      if (mounted) setState(() => _followMap[userId] = was);
    } finally {
      if (mounted) setState(() => _loadingFollow.remove(userId));
    }
  }

  String _tok() => AuthStorage.accessToken ?? '';

  // ── Reactions ─────────────────────────────────────────────────────────────

  Future<void> _react(String emoji) async {
    final prev = _localReaction;
    final removing = _localReaction == emoji;
    // Optimistic update
    setState(() => _localReaction = removing ? null : emoji);
    try {
      if (removing) {
        await StoryService.removeReaction(_story.id);
      } else {
        await StoryService.reactToStory(_story.id, emoji);
      }
    } catch (_) {
      // Roll back on failure
      if (mounted) setState(() => _localReaction = prev);
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  Future<void> _deleteStory() async {
    _pause();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1A2435),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: const Text('Xóa story',
            style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
        content: const Text(
          'Story này sẽ bị xóa vĩnh viễn và không thể khôi phục.',
          style: TextStyle(color: Color(0xFF7A8BB0), fontSize: 14),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Hủy',
                style: TextStyle(color: Color(0xFF4AA3E4))),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Xóa',
                style: TextStyle(
                    color: Colors.redAccent, fontWeight: FontWeight.w700)),
          ),
        ],
      ),
    );
    if (confirmed != true) {
      if (mounted) _resume();
      return;
    }
    try {
      await StoryService.deleteStory(_story.id);
      if (mounted) _goNext();
    } catch (_) {
      if (mounted) _resume();
    }
  }

  // ── Dispose ───────────────────────────────────────────────────────────────

  void _disposeProgress() {
    _progressCtrl?.dispose();
    _progressCtrl = null;
  }

  void _disposeVideo() {
    _videoCtrl?.dispose();
    _videoCtrl = null;
    _videoReady = false;
  }

  @override
  void dispose() {
    _disposeProgress();
    _disposeVideo();
    _stopAudio();
    super.dispose();
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  static Color _hexColor(String hex) {
    try {
      final s = hex.replaceFirst('#', '');
      if (s.length == 6) return Color(int.parse('FF$s', radix: 16));
      if (s.length == 8) return Color(int.parse(s, radix: 16));
    } catch (_) {}
    return Colors.white;
  }

  // ── Build ─────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    SystemChrome.setSystemUIOverlayStyle(SystemUiOverlayStyle.light);
    return Scaffold(
      backgroundColor: Colors.black,
      body: GestureDetector(
        onLongPressStart: (_) => _pause(),
        onLongPressEnd: (_) {
          if (!_showViewers) _resume();
        },
        child: Stack(
          children: [
            Positioned.fill(child: _buildContent()),
            // Tap areas sit BELOW all interactive controls so that buttons in
            // the top overlay and bottom bar win the gesture arena.
            if (!_showViewers)
              Positioned.fill(child: _buildTapAreas()),
            // Music sticker — positioned using saved stickerX/Y/Width
            // (full screen coordinate system, same as creator canvas).
            if (_story.music != null && !_showViewers)
              Positioned.fill(
                child: LayoutBuilder(builder: (ctx, cs) {
                  final m = _story.music!;
                  return Stack(
                    children: [
                      Positioned(
                        left: (m.stickerX / 100) * cs.maxWidth,
                        top: (m.stickerY / 100) * cs.maxHeight,
                        width: (m.stickerWidth / 100) * cs.maxWidth,
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(16),
                          child: FittedBox(
                            fit: BoxFit.scaleDown,
                            alignment: Alignment.centerLeft,
                            child: StoryMusicSticker(music: m),
                          ),
                        ),
                      ),
                    ],
                  );
                }),
              ),
            // Buffering indicator while waiting for audio to load.
            if (_waitingForAudio)
              Positioned(
                bottom: 80,
                left: 0,
                right: 0,
                child: Center(
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 14, vertical: 8),
                    decoration: BoxDecoration(
                      color: Colors.black54,
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        SizedBox(
                          width: 14,
                          height: 14,
                          child: CircularProgressIndicator(
                            strokeWidth: 1.8,
                            valueColor:
                                AlwaysStoppedAnimation(Colors.white70),
                          ),
                        ),
                        SizedBox(width: 8),
                        Text(
                          'Đang tải nhạc...',
                          style: TextStyle(
                              color: Colors.white70, fontSize: 12),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            // UI controls at the top of Z-order → their buttons take priority.
            Positioned(
              top: 0, left: 0, right: 0,
              child: _buildTopOverlay(),
            ),
            if (!_showViewers)
              Positioned(
                bottom: 0, left: 0, right: 0,
                child: _buildBottomBar(),
              ),
            if (_showViewers)
              Positioned.fill(child: _buildViewersOverlay()),
          ],
        ),
      ),
    );
  }

  // ── Story content ─────────────────────────────────────────────────────────

  Widget _buildContent() {
    final story = _story;
    if (story.type == 'text') {
      return Container(
        decoration: BoxDecoration(
          gradient: parseBackgroundGradient(story.backgroundStyle),
        ),
        child: Center(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 32),
            child: Text(
              story.textContent ?? '',
              style: const TextStyle(
                color: Colors.white,
                fontSize: 28,
                fontWeight: FontWeight.w700,
                height: 1.35,
              ),
              textAlign: TextAlign.center,
            ),
          ),
        ),
      );
    }
    if (story.mediaType == 'video' && _videoReady && _videoCtrl != null) {
      return ColoredBox(
        color: Colors.black,
        child: Center(
          child: AspectRatio(
            aspectRatio: _videoCtrl!.value.aspectRatio,
            child: VideoPlayer(_videoCtrl!),
          ),
        ),
      );
    }
    if (story.mediaUrl != null) {
      return LayoutBuilder(builder: (ctx, cs) {
        final sw = cs.maxWidth;
        final sh = cs.maxHeight;
        return Stack(
          fit: StackFit.expand,
          children: [
            // Image fills full screen (same as creator canvas)
            Image.network(
              story.mediaUrl!,
              fit: BoxFit.cover,
              width: double.infinity,
              height: double.infinity,
              errorBuilder: (_, __, ___) =>
                  Container(color: const Color(0xFF0F1829)),
            ),
            // Text overlays — coordinates as % of full screen
            ...story.textOverlays.map((ov) {
              final fontPx = ((ov.fontSize / 100) * sh).clamp(8.0, 120.0);
              return Positioned(
                left: (ov.x / 100) * sw,
                top: (ov.y / 100) * sh,
                child: FractionalTranslation(
                  translation: const Offset(-0.5, -0.5),
                  child: Text(
                    ov.text,
                    style: TextStyle(
                      color: _hexColor(ov.color),
                      fontSize: fontPx,
                      fontWeight: FontWeight.w700,
                      shadows: const [
                        Shadow(color: Colors.black54, blurRadius: 4),
                      ],
                    ),
                    textAlign: TextAlign.center,
                  ),
                ),
              );
            }),
          ],
        );
      });
    }
    return Container(color: const Color(0xFF0F1829));
  }

  // ── Top overlay ───────────────────────────────────────────────────────────

  Widget _buildTopOverlay() {
    final group = _group;
    final stories = group.stories;
    final ctrl = _progressCtrl;

    return Container(
      padding: EdgeInsets.only(
        top: MediaQuery.of(context).padding.top + 8,
        left: 12, right: 12, bottom: 8,
      ),
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xCC000000), Colors.transparent],
        ),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Progress bars
          Row(
            children: List.generate(stories.length, (i) {
              return Expanded(
                child: Container(
                  height: 2.5,
                  margin: const EdgeInsets.symmetric(horizontal: 2),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(2),
                    child: i < _storyIdx
                        ? const LinearProgressIndicator(
                            value: 1,
                            backgroundColor: Color(0x55FFFFFF),
                            valueColor: AlwaysStoppedAnimation(Colors.white),
                          )
                        : i == _storyIdx && ctrl != null
                            ? AnimatedBuilder(
                                animation: ctrl,
                                builder: (_, __) => LinearProgressIndicator(
                                  value: ctrl.value,
                                  backgroundColor: const Color(0x55FFFFFF),
                                  valueColor: const AlwaysStoppedAnimation(
                                      Colors.white),
                                ),
                              )
                            : const LinearProgressIndicator(
                                value: 0,
                                backgroundColor: Color(0x55FFFFFF),
                                valueColor: AlwaysStoppedAnimation(
                                    Colors.transparent),
                              ),
                  ),
                ),
              );
            }),
          ),
          const SizedBox(height: 10),
          // User row
          Row(
            children: [
              GestureDetector(
                onTap: () => Navigator.of(context).push(MaterialPageRoute(
                  builder: (_) => ProfileScreen(userId: group.userId),
                )),
                child: Container(
                  width: 36,
                  height: 36,
                  decoration: const BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: LinearGradient(
                      colors: [Color(0xFF4AA3E4), Color(0xFF7C3AED)],
                    ),
                  ),
                  padding: const EdgeInsets.all(1.5),
                  child: ClipOval(
                    child: group.avatarUrl.isNotEmpty
                        ? Image.network(group.avatarUrl, fit: BoxFit.cover,
                            errorBuilder: (_, __, ___) => _avatarFallback())
                        : _avatarFallback(),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      group.displayName.isNotEmpty
                          ? group.displayName
                          : '@${group.username}',
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w600,
                        fontSize: 14,
                      ),
                    ),
                    Text(
                      _formatRelative(_story.createdAt),
                      style: const TextStyle(
                          color: Color(0xBBFFFFFF), fontSize: 11),
                    ),
                  ],
                ),
              ),
              // Play / pause toggle — visible for all stories
              IconButton(
                onPressed: _paused ? _resume : _pause,
                icon: Icon(
                  _paused
                      ? Icons.play_arrow_rounded
                      : Icons.pause_rounded,
                  color: Colors.white,
                  size: 22,
                ),
                padding: EdgeInsets.zero,
                constraints: const BoxConstraints(),
              ),
              const SizedBox(width: 4),
              // 3-dot menu only for own stories
              if (_isOwn) ...[
                IconButton(
                  onPressed: _showOptionsMenu,
                  icon: const Icon(Icons.more_horiz_rounded,
                      color: Colors.white, size: 22),
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(),
                ),
                const SizedBox(width: 4),
              ],
              IconButton(
                onPressed: _close,
                icon: const Icon(Icons.close_rounded,
                    color: Colors.white, size: 22),
                padding: EdgeInsets.zero,
                constraints: const BoxConstraints(),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _avatarFallback() => Container(
        color: const Color(0xFF1E2D48),
        child: const Icon(Icons.person_rounded,
            color: Colors.white38, size: 18),
      );

  // ── Tap areas ─────────────────────────────────────────────────────────────

  Widget _buildTapAreas() {
    return Row(
      children: [
        Expanded(
            child: GestureDetector(
          behavior: HitTestBehavior.translucent,
          onTap: _goPrev,
        )),
        Expanded(
            child: GestureDetector(
          behavior: HitTestBehavior.translucent,
          onTap: _goNext,
        )),
      ],
    );
  }

  // ── Bottom bar ────────────────────────────────────────────────────────────

  Widget _buildBottomBar() {
    final t = LanguageController.instance.t;
    return Container(
      padding: EdgeInsets.only(
        left: 16, right: 16,
        bottom: MediaQuery.of(context).padding.bottom + 12,
        top: 12,
      ),
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.bottomCenter,
          end: Alignment.topCenter,
          colors: [Color(0xCC000000), Colors.transparent],
        ),
      ),
      child: Row(
        children: [
          if (_isOwn) ...[
            GestureDetector(
              onTap: () {
                _pause();
                setState(() => _showViewers = true);
                _loadViewers();
              },
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                const Icon(Icons.remove_red_eye_outlined,
                    color: Colors.white, size: 18),
                const SizedBox(width: 6),
                Text(
                  '${_story.viewCount}',
                  style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w600,
                      fontSize: 14),
                ),
              ]),
            ),
            const Spacer(),
          ] else ...[
            Expanded(
              child: Container(
                height: 44,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(22),
                  border: Border.all(color: Colors.white38),
                ),
                child: Material(
                  color: Colors.transparent,
                  child: InkWell(
                    borderRadius: BorderRadius.circular(22),
                    onTap: () {},
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: Align(
                        alignment: Alignment.centerLeft,
                        child: Text(
                          t('story.replyPlaceholder', {
                            'name': _group.displayName.isNotEmpty
                                ? _group.displayName
                                : _group.username,
                          }),
                          style: const TextStyle(
                              color: Colors.white54, fontSize: 14),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
            const SizedBox(width: 10),
          ],
          if (!_isOwn)
            _ReactionButton(
              currentReaction: _localReaction,
              onReact: _react,
            ),
        ],
      ),
    );
  }

  // ── Viewers overlay ───────────────────────────────────────────────────────

  Widget _buildViewersOverlay() {
    final t = LanguageController.instance.t;
    return GestureDetector(
      onTap: () {},
      child: Container(
        color: Colors.black87,
        child: Column(
          children: [
            SafeArea(
              bottom: false,
              child: Padding(
                padding: const EdgeInsets.symmetric(
                    horizontal: 16, vertical: 12),
                child: Row(
                  children: [
                    Text(
                      t('story.viewers',
                          {'count': _story.viewCount}),
                      style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w700,
                          fontSize: 16),
                    ),
                    const Spacer(),
                    IconButton(
                      onPressed: () {
                        setState(() => _showViewers = false);
                        if (!_paused) _resume();
                      },
                      icon: const Icon(Icons.close_rounded,
                          color: Colors.white, size: 22),
                    ),
                  ],
                ),
              ),
            ),
            const Divider(color: Colors.white12, height: 1),
            Expanded(
              child: _loadingViewers
                  ? const Center(
                      child: CircularProgressIndicator(
                          color: Color(0xFF4AA3E4)))
                  : _viewers.isEmpty
                      ? Center(
                          child: Text(t('story.noViewers'),
                              style: const TextStyle(
                                  color: Colors.white54)))
                      : ListView.builder(
                          padding: const EdgeInsets.symmetric(vertical: 8),
                          itemCount: _viewers.length,
                          itemBuilder: (_, i) {
                            final v = _viewers[i];
                            final isMe = v.userId == widget.viewerId;
                            final isFollowing =
                                _followMap[v.userId] ?? v.isFollowing;
                            final isLoading =
                                _loadingFollow.contains(v.userId);
                            return _ViewerTile(
                              viewer: v,
                              isMe: isMe,
                              isFollowing: isFollowing,
                              isLoading: isLoading,
                              onFollow: () => _toggleFollow(v.userId),
                            );
                          },
                        ),
            ),
          ],
        ),
      ),
    );
  }

  // ── Options menu ──────────────────────────────────────────────────────────

  void _showOptionsMenu() {
    _pause();
    final t = LanguageController.instance.t;
    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF1A2435),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (sheetCtx) => SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 6),
            Container(
              width: 36, height: 4,
              decoration: BoxDecoration(
                color: Colors.white24,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(height: 8),
            if (_isOwn) ...[
              // View viewers
              ListTile(
                leading: const Icon(Icons.remove_red_eye_outlined,
                    color: Color(0xFFE8ECF8)),
                title: Text(t('story.viewers', {'count': _story.viewCount}),
                    style: const TextStyle(color: Color(0xFFE8ECF8))),
                onTap: () {
                  Navigator.pop(sheetCtx);
                  setState(() => _showViewers = true);
                  _loadViewers();
                },
              ),
              // Edit visibility
              ListTile(
                leading: const Icon(Icons.tune_rounded,
                    color: Color(0xFFE8ECF8)),
                title: const Text('Chỉnh sửa quyền xem',
                    style: TextStyle(color: Color(0xFFE8ECF8))),
                trailing: _visibilityChip(_localVisibility ?? 'followers'),
                onTap: () {
                  Navigator.pop(sheetCtx);
                  _showVisibilityPicker();
                },
              ),
              // Delete
              ListTile(
                leading: const Icon(Icons.delete_outline_rounded,
                    color: Colors.redAccent),
                title: Text(t('story.deleteStory'),
                    style: const TextStyle(color: Colors.redAccent)),
                onTap: () {
                  Navigator.pop(sheetCtx);
                  _deleteStory();
                },
              ),
            ] else ...[
              ListTile(
                leading: const Icon(Icons.flag_outlined,
                    color: Color(0xFF7A8BB0)),
                title: Text(t('story.report'),
                    style: const TextStyle(color: Color(0xFFE8ECF8))),
                onTap: () => Navigator.pop(sheetCtx),
              ),
            ],
            // Close
            ListTile(
              leading: const Icon(Icons.close_rounded,
                  color: Color(0xFF7A8BB0)),
              title: const Text('Đóng',
                  style: TextStyle(color: Color(0xFF7A8BB0))),
              onTap: () => Navigator.pop(sheetCtx),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    ).then((_) {
      if (!_showViewers && mounted) _resume();
    });
  }

  Widget _visibilityChip(String vis) {
    final label = switch (vis) {
      'public' => 'Công khai',
      'private' => 'Riêng tư',
      _ => 'Người theo dõi',
    };
    final icon = switch (vis) {
      'public' => Icons.public_rounded,
      'private' => Icons.lock_outline_rounded,
      _ => Icons.people_outline_rounded,
    };
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 13, color: const Color(0xFF7A8BB0)),
        const SizedBox(width: 4),
        Text(label,
            style: const TextStyle(color: Color(0xFF7A8BB0), fontSize: 12)),
      ],
    );
  }

  void _showVisibilityPicker() {
    _pause();
    const options = [
      ('followers', 'Người theo dõi', 'Chỉ người theo dõi mới xem được',
          Icons.people_outline_rounded),
      ('public', 'Công khai', 'Tất cả mọi người đều có thể xem',
          Icons.public_rounded),
      ('private', 'Riêng tư', 'Chỉ mình bạn xem được',
          Icons.lock_outline_rounded),
    ];

    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF1A2435),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (sheetCtx) => StatefulBuilder(
        builder: (ctx, setLocal) => SafeArea(
          top: false,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: 6),
              Container(
                width: 36, height: 4,
                decoration: BoxDecoration(
                  color: Colors.white24,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(height: 12),
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 20),
                child: Row(
                  children: [
                    Icon(Icons.tune_rounded,
                        color: Color(0xFF4AA3E4), size: 18),
                    SizedBox(width: 8),
                    Text('Chỉnh sửa quyền xem',
                        style: TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w700,
                            fontSize: 16)),
                  ],
                ),
              ),
              const SizedBox(height: 8),
              ...options.map((opt) {
                final (key, label, desc, icon) = opt;
                final selected = (_localVisibility ?? 'followers') == key;
                return ListTile(
                  leading: Container(
                    width: 40, height: 40,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: selected
                          ? const LinearGradient(
                              colors: [Color(0xFF4AA3E4), Color(0xFF7C3AED)])
                          : null,
                      color: selected ? null : const Color(0xFF253347),
                    ),
                    child: Icon(icon,
                        color: selected ? Colors.white : const Color(0xFF7A8BB0),
                        size: 18),
                  ),
                  title: Text(label,
                      style: TextStyle(
                          color: selected ? Colors.white : const Color(0xFFE8ECF8),
                          fontWeight: FontWeight.w600,
                          fontSize: 14)),
                  subtitle: Text(desc,
                      style: const TextStyle(
                          color: Color(0xFF7A8BB0), fontSize: 12)),
                  trailing: selected
                      ? const Icon(Icons.check_circle_rounded,
                          color: Color(0xFF4AA3E4), size: 22)
                      : null,
                  onTap: () {
                    setLocal(() {});
                    Navigator.pop(sheetCtx);
                    _updateVisibility(key);
                  },
                );
              }),
              const SizedBox(height: 8),
            ],
          ),
        ),
      ),
    ).then((_) {
      if (mounted) _resume();
    });
  }

  Future<void> _updateVisibility(String visibility) async {
    final prev = _localVisibility;
    setState(() => _localVisibility = visibility);
    try {
      await StoryService.updateVisibility(_story.id, visibility);
    } catch (_) {
      if (mounted) setState(() => _localVisibility = prev);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  String _formatRelative(DateTime dt) {
    final t = LanguageController.instance.t;
    final diff = DateTime.now().difference(dt);
    if (diff.inMinutes < 1) return t('story.timeNow');
    if (diff.inMinutes < 60) {
      return t('story.timeMinutes', {'n': diff.inMinutes});
    }
    if (diff.inHours < 24) {
      return t('story.timeHours', {'n': diff.inHours});
    }
    return t('story.timeDays', {'n': diff.inDays});
  }
}

// ── Reaction button ───────────────────────────────────────────────────────────

class _ReactionButton extends StatelessWidget {
  const _ReactionButton({
    required this.currentReaction,
    required this.onReact,
  });

  final String? currentReaction;
  final void Function(String emoji) onReact;

  static const _emojis = ['❤️', '😮', '😂', '😢', '😡', '👍'];

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => _showPicker(context),
      child: Container(
        width: 44, height: 44,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          border: Border.all(color: Colors.white38),
        ),
        child: Center(
          child: Text(
            currentReaction ?? '😊',
            style: const TextStyle(fontSize: 20),
          ),
        ),
      ),
    );
  }

  void _showPicker(BuildContext ctx) {
    showModalBottomSheet(
      context: ctx,
      backgroundColor: const Color(0xFF1A2435),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Wrap(
            spacing: 12,
            runSpacing: 12,
            children: _emojis.map((e) {
              final active = currentReaction == e;
              return GestureDetector(
                onTap: () {
                  Navigator.pop(ctx);
                  onReact(e);
                },
                child: Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(12),
                    color: active
                        ? const Color(0xFF4AA3E4).withValues(alpha: 0.2)
                        : const Color(0xFF253347),
                    border: active
                        ? Border.all(color: const Color(0xFF4AA3E4))
                        : null,
                  ),
                  child: Text(e,
                      style: const TextStyle(fontSize: 28)),
                ),
              );
            }).toList(),
          ),
        ),
      ),
    );
  }
}

// ── Viewer tile ───────────────────────────────────────────────────────────────

class _ViewerTile extends StatelessWidget {
  const _ViewerTile({
    required this.viewer,
    required this.isMe,
    required this.isFollowing,
    required this.isLoading,
    required this.onFollow,
  });

  final StoryViewer viewer;
  final bool isMe;
  final bool isFollowing;
  final bool isLoading;
  final VoidCallback onFollow;

  @override
  Widget build(BuildContext context) {
    final t = LanguageController.instance.t;
    return ListTile(
      contentPadding:
          const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      leading: ClipOval(
        child: SizedBox(
          width: 44, height: 44,
          child: viewer.avatarUrl != null && viewer.avatarUrl!.isNotEmpty
              ? Image.network(viewer.avatarUrl!, fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => _placeholder())
              : _placeholder(),
        ),
      ),
      title: Text(
        viewer.displayName ?? viewer.username ?? t('story.user'),
        style: const TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.w600,
            fontSize: 14),
      ),
      subtitle: viewer.username != null
          ? Text('@${viewer.username}',
              style: const TextStyle(
                  color: Color(0xFF7A8BB0), fontSize: 12))
          : null,
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (viewer.reaction != null)
            Padding(
              padding: const EdgeInsets.only(right: 10),
              child: Text(viewer.reaction!,
                  style: const TextStyle(fontSize: 20)),
            ),
          if (isMe)
            Container(
              padding: const EdgeInsets.symmetric(
                  horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(12),
                color: const Color(0xFF253347),
              ),
              child: Text(t('story.you'),
                  style: const TextStyle(
                      color: Color(0xFF7A8BB0), fontSize: 13)),
            )
          else
            GestureDetector(
              onTap: onFollow,
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                padding: const EdgeInsets.symmetric(
                    horizontal: 14, vertical: 6),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(20),
                  gradient: isFollowing
                      ? null
                      : const LinearGradient(colors: [
                          Color(0xFF4AA3E4),
                          Color(0xFF7C3AED),
                        ]),
                  border: isFollowing
                      ? Border.all(color: const Color(0xFF4AA3E4))
                      : null,
                ),
                child: isLoading
                    ? const SizedBox(
                        width: 14, height: 14,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: Colors.white),
                      )
                    : Text(
                        isFollowing
                            ? t('story.following')
                            : t('story.follow'),
                        style: TextStyle(
                          color: isFollowing
                              ? const Color(0xFF4AA3E4)
                              : Colors.white,
                          fontWeight: FontWeight.w600,
                          fontSize: 13,
                        ),
                      ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _placeholder() => Container(
        color: const Color(0xFF1E2D48),
        child: const Icon(Icons.person_rounded,
            color: Colors.white38, size: 22),
      );
}
