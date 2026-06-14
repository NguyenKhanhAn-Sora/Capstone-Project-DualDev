import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:audioplayers/audioplayers.dart';
import '../../../core/services/language_controller.dart';
import '../models/story_models.dart';

const _kClientId = '7a016a16';
const _kApiBase = 'https://api.jamendo.com/v3.0';

// ── Jamendo track model ───────────────────────────────────────────────────────

class JamendoTrack {
  const JamendoTrack({
    required this.id,
    required this.name,
    required this.artistName,
    required this.albumImage,
    required this.audioUrl,
    required this.duration,
  });

  final String id;
  final String name;
  final String artistName;
  final String albumImage;
  final String audioUrl;
  final int duration; // seconds

  factory JamendoTrack.fromJson(Map<String, dynamic> j) => JamendoTrack(
        id: j['id']?.toString() ?? '',
        name: j['name'] as String? ?? '',
        artistName: j['artist_name'] as String? ?? '',
        albumImage: j['album_image'] as String? ?? '',
        audioUrl: j['audio'] as String? ?? '',
        duration: (j['duration'] as num?)?.toInt() ?? 0,
      );

  StoryMusic toStoryMusic() => StoryMusic(
        trackId: id,
        title: name,
        artist: artistName,
        coverUrl: albumImage,
        audioUrl: audioUrl,
      );

  String get formattedDuration {
    final m = duration ~/ 60;
    final s = (duration % 60).toString().padLeft(2, '0');
    return '$m:$s';
  }
}

// ── Public helper to show the picker ─────────────────────────────────────────

Future<void> showStoryMusicPicker({
  required BuildContext context,
  required void Function(StoryMusic?) onResult,
  StoryMusic? selected,
  required bool isDark,
}) {
  return showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _StoryMusicPickerSheet(
      selected: selected,
      onSelect: (m) => onResult(m),
      onRemove: () => onResult(null),
      isDark: isDark,
    ),
  );
}

// ── Sheet widget ──────────────────────────────────────────────────────────────

class _StoryMusicPickerSheet extends StatefulWidget {
  const _StoryMusicPickerSheet({
    required this.selected,
    required this.onSelect,
    required this.onRemove,
    required this.isDark,
  });

  final StoryMusic? selected;
  final void Function(StoryMusic) onSelect;
  final VoidCallback onRemove;
  final bool isDark;

  @override
  State<_StoryMusicPickerSheet> createState() => _StoryMusicPickerSheetState();
}

class _StoryMusicPickerSheetState extends State<_StoryMusicPickerSheet>
    with SingleTickerProviderStateMixin {
  late final TabController _tab;
  final TextEditingController _searchCtrl = TextEditingController();
  Timer? _debounce;

  List<JamendoTrack> _trending = [];
  List<JamendoTrack> _searchResults = [];
  bool _loadingTrending = true;
  bool _loadingSearch = false;

  final AudioPlayer _player = AudioPlayer();
  String? _previewingId;
  bool _isPlaying = false;

  @override
  void initState() {
    super.initState();
    _tab = TabController(length: 2, vsync: this);
    _loadTrending();
    _player.onPlayerStateChanged.listen((s) {
      if (mounted) setState(() => _isPlaying = s == PlayerState.playing);
    });
    _player.onPlayerComplete.listen((_) {
      if (mounted) setState(() { _previewingId = null; _isPlaying = false; });
    });
  }

  @override
  void dispose() {
    _tab.dispose();
    _searchCtrl.dispose();
    _debounce?.cancel();
    _player.stop();
    _player.dispose();
    super.dispose();
  }

  Future<List<JamendoTrack>> _fetchTracks(Map<String, String> params) async {
    final uri = Uri.parse('$_kApiBase/tracks/').replace(queryParameters: {
      'client_id': _kClientId,
      'format': 'json',
      'imagesize': '200',
      ...params,
    });
    final res = await http.get(uri).timeout(const Duration(seconds: 10));
    final data = jsonDecode(res.body) as Map<String, dynamic>;
    return (data['results'] as List? ?? [])
        .whereType<Map<String, dynamic>>()
        .map(JamendoTrack.fromJson)
        .toList();
  }

  Future<void> _loadTrending() async {
    setState(() => _loadingTrending = true);
    try {
      final tracks = await _fetchTracks({
        'order': 'popularity_total',
        'limit': '20',
      });
      if (mounted) setState(() { _trending = tracks; _loadingTrending = false; });
    } catch (_) {
      if (mounted) setState(() => _loadingTrending = false);
    }
  }

  Future<void> _loadSearch(String q) async {
    if (q.trim().isEmpty) {
      setState(() { _searchResults = []; _loadingSearch = false; });
      return;
    }
    setState(() => _loadingSearch = true);
    try {
      final tracks = await _fetchTracks({'search': q, 'limit': '20'});
      if (mounted) setState(() { _searchResults = tracks; _loadingSearch = false; });
    } catch (_) {
      if (mounted) setState(() => _loadingSearch = false);
    }
  }

  void _onSearchChanged(String q) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 400), () => _loadSearch(q));
    if (q.isNotEmpty && _tab.index == 0) {
      _tab.animateTo(1);
    }
  }

  Future<void> _togglePreview(JamendoTrack track) async {
    if (_previewingId == track.id) {
      if (_isPlaying) {
        await _player.pause();
      } else {
        await _player.resume();
      }
      return;
    }
    setState(() => _previewingId = track.id);
    await _player.stop();
    if (track.audioUrl.isNotEmpty) {
      await _player.play(UrlSource(track.audioUrl));
    }
  }

  void _selectTrack(JamendoTrack track) {
    _player.stop();
    widget.onSelect(track.toStoryMusic());
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final t = LanguageController.instance.t;
    final isDark = widget.isDark;
    final bg = isDark ? const Color(0xFF0B1120) : Colors.white;

    return SafeArea(
      top: false,
      child: Container(
        height: MediaQuery.of(context).size.height * 0.80,
        decoration: BoxDecoration(
          color: bg,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: Column(
          children: [
            const SizedBox(height: 10),
            // Handle
            Container(
              width: 36, height: 4,
              decoration: BoxDecoration(
                color: isDark
                    ? const Color(0xFF1E2D48)
                    : const Color(0xFFDDE4EF),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(height: 16),

            // Header
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(9),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(12),
                      gradient: const LinearGradient(
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                        colors: [Color(0xFF4AA3E4), Color(0xFF7C3AED)],
                      ),
                    ),
                    child: const Icon(
                      Icons.music_note_rounded,
                      color: Colors.white,
                      size: 20,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Text(
                    t('story.labelMusic'),
                    style: TextStyle(
                      color: isDark
                          ? const Color(0xFFE8ECF8)
                          : const Color(0xFF0F1629),
                      fontWeight: FontWeight.w700,
                      fontSize: 18,
                    ),
                  ),
                  const Spacer(),
                  if (widget.selected != null)
                    GestureDetector(
                      onTap: () {
                        _player.stop();
                        widget.onRemove();
                        Navigator.of(context).pop();
                      },
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 7),
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(14),
                          color: Colors.redAccent.withValues(alpha: 0.1),
                          border: Border.all(
                              color: Colors.redAccent.withValues(alpha: 0.4)),
                        ),
                        child: Text(
                          t('story.btnRemoveMusic'),
                          style: const TextStyle(
                            color: Colors.redAccent,
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 14),

            // Search bar
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Container(
                height: 44,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(14),
                  color: isDark
                      ? const Color(0xFF1A2435)
                      : const Color(0xFFF0F4FA),
                ),
                child: Row(
                  children: [
                    const SizedBox(width: 12),
                    const Icon(Icons.search_rounded,
                        color: Color(0xFF7A8BB0), size: 20),
                    const SizedBox(width: 8),
                    Expanded(
                      child: TextField(
                        controller: _searchCtrl,
                        onChanged: _onSearchChanged,
                        style: TextStyle(
                          color: isDark
                              ? Colors.white
                              : const Color(0xFF0F1629),
                          fontSize: 14,
                        ),
                        decoration: InputDecoration(
                          border: InputBorder.none,
                          hintText: t('story.musicSearchHint'),
                          hintStyle: const TextStyle(
                              color: Color(0xFF7A8BB0), fontSize: 14),
                          isDense: true,
                          contentPadding:
                              const EdgeInsets.symmetric(vertical: 12),
                        ),
                      ),
                    ),
                    if (_searchCtrl.text.isNotEmpty)
                      GestureDetector(
                        onTap: () {
                          _searchCtrl.clear();
                          _loadSearch('');
                          _tab.animateTo(0);
                        },
                        child: const Padding(
                          padding: EdgeInsets.symmetric(horizontal: 10),
                          child: Icon(Icons.close_rounded,
                              color: Color(0xFF7A8BB0), size: 18),
                        ),
                      ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),

            // Tab bar
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Container(
                height: 38,
                padding: const EdgeInsets.all(3),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(14),
                  color: isDark
                      ? const Color(0xFF1A2435)
                      : const Color(0xFFF0F4FA),
                ),
                child: TabBar(
                  controller: _tab,
                  indicator: BoxDecoration(
                    borderRadius: BorderRadius.circular(11),
                    gradient: const LinearGradient(
                      colors: [Color(0xFF4AA3E4), Color(0xFF7C3AED)],
                    ),
                  ),
                  indicatorSize: TabBarIndicatorSize.tab,
                  dividerColor: Colors.transparent,
                  labelColor: Colors.white,
                  unselectedLabelColor: const Color(0xFF7A8BB0),
                  labelStyle: const TextStyle(
                      fontWeight: FontWeight.w600, fontSize: 13),
                  tabs: [
                    Tab(text: t('story.musicTrending')),
                    Tab(text: t('story.musicSearch')),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 8),

            // Track lists
            Expanded(
              child: TabBarView(
                controller: _tab,
                children: [
                  _buildList(_trending, _loadingTrending),
                  _buildList(_searchResults, _loadingSearch),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildList(List<JamendoTrack> tracks, bool loading) {
    final t = LanguageController.instance.t;
    final isDark = widget.isDark;

    if (loading) {
      return const Center(
        child: CircularProgressIndicator(color: Color(0xFF4AA3E4)),
      );
    }
    if (tracks.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.music_off_rounded,
              color: isDark
                  ? const Color(0xFF1E2D48)
                  : const Color(0xFFDDE4EF),
              size: 52,
            ),
            const SizedBox(height: 12),
            Text(
              t('story.musicNoResults'),
              style: const TextStyle(
                  color: Color(0xFF7A8BB0), fontSize: 14),
            ),
          ],
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.only(top: 4, bottom: 20),
      itemCount: tracks.length,
      itemBuilder: (_, i) {
        final track = tracks[i];
        final isSelected = widget.selected?.trackId == track.id;
        final isPreviewing = _previewingId == track.id;
        return _TrackTile(
          track: track,
          isSelected: isSelected,
          isPreviewing: isPreviewing,
          isPlaying: isPreviewing && _isPlaying,
          isDark: isDark,
          onPreview: () => _togglePreview(track),
          onSelect: () => _selectTrack(track),
        );
      },
    );
  }
}

// ── Track tile ────────────────────────────────────────────────────────────────

class _TrackTile extends StatelessWidget {
  const _TrackTile({
    required this.track,
    required this.isSelected,
    required this.isPreviewing,
    required this.isPlaying,
    required this.isDark,
    required this.onPreview,
    required this.onSelect,
  });

  final JamendoTrack track;
  final bool isSelected, isPreviewing, isPlaying, isDark;
  final VoidCallback onPreview, onSelect;

  @override
  Widget build(BuildContext context) {
    final t = LanguageController.instance.t;
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 3),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        color: isSelected
            ? const Color(0xFF4AA3E4).withValues(alpha: 0.08)
            : (isPreviewing
                ? (isDark
                    ? const Color(0xFF1A2435)
                    : const Color(0xFFF5F7FC))
                : Colors.transparent),
        border: isSelected
            ? Border.all(
                color: const Color(0xFF4AA3E4).withValues(alpha: 0.35))
            : null,
      ),
      child: Row(
        children: [
          // Cover art
          ClipRRect(
            borderRadius: BorderRadius.circular(10),
            child: SizedBox(
              width: 50, height: 50,
              child: track.albumImage.isNotEmpty
                  ? Image.network(
                      track.albumImage,
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => _coverFallback(),
                    )
                  : _coverFallback(),
            ),
          ),
          const SizedBox(width: 12),

          // Info
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  track.name,
                  style: TextStyle(
                    color: isSelected
                        ? const Color(0xFF4AA3E4)
                        : (isDark
                            ? const Color(0xFFE8ECF8)
                            : const Color(0xFF0F1629)),
                    fontWeight: FontWeight.w600,
                    fontSize: 14,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 2),
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        track.artistName,
                        style: const TextStyle(
                            color: Color(0xFF7A8BB0), fontSize: 12),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    const SizedBox(width: 6),
                    Text(
                      track.formattedDuration,
                      style: const TextStyle(
                          color: Color(0xFF4A5568), fontSize: 11),
                    ),
                  ],
                ),
                if (isPreviewing && isPlaying) ...[
                  const SizedBox(height: 5),
                  const _WaveAnimation(),
                ],
              ],
            ),
          ),
          const SizedBox(width: 8),

          // Preview button
          GestureDetector(
            onTap: onPreview,
            child: Container(
              width: 36, height: 36,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: isPreviewing
                    ? const Color(0xFF4AA3E4).withValues(alpha: 0.12)
                    : (isDark
                        ? const Color(0xFF1E2D48)
                        : const Color(0xFFE8EEF8)),
                border: isPreviewing
                    ? Border.all(
                        color: const Color(0xFF4AA3E4), width: 1.5)
                    : null,
              ),
              child: Icon(
                (isPlaying && isPreviewing)
                    ? Icons.pause_rounded
                    : Icons.play_arrow_rounded,
                color: isPreviewing
                    ? const Color(0xFF4AA3E4)
                    : const Color(0xFF7A8BB0),
                size: 18,
              ),
            ),
          ),
          const SizedBox(width: 8),

          // Select button
          GestureDetector(
            onTap: onSelect,
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 150),
              padding:
                  const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(20),
                gradient: isSelected
                    ? const LinearGradient(
                        colors: [Color(0xFF4AA3E4), Color(0xFF7C3AED)],
                      )
                    : null,
                border: isSelected
                    ? null
                    : Border.all(
                        color: const Color(0xFF4AA3E4).withValues(alpha: 0.6)),
              ),
              child: Text(
                t('story.musicSelect'),
                style: TextStyle(
                  color:
                      isSelected ? Colors.white : const Color(0xFF4AA3E4),
                  fontWeight: FontWeight.w700,
                  fontSize: 12,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  static Widget _coverFallback() => Container(
        color: const Color(0xFF1E2D48),
        child: const Icon(Icons.music_note_rounded,
            color: Color(0xFF4AA3E4), size: 24),
      );
}

// ── Waveform animation ────────────────────────────────────────────────────────

class _WaveAnimation extends StatefulWidget {
  const _WaveAnimation();

  @override
  State<_WaveAnimation> createState() => _WaveAnimationState();
}

class _WaveAnimationState extends State<_WaveAnimation>
    with TickerProviderStateMixin {
  late final List<AnimationController> _controllers;
  late final List<Animation<double>> _anims;

  @override
  void initState() {
    super.initState();
    _controllers = List.generate(
      5,
      (i) => AnimationController(
        vsync: this,
        duration: Duration(milliseconds: 380 + i * 70),
      )..repeat(reverse: true),
    );
    _anims = _controllers
        .map((c) => Tween<double>(begin: 3, end: 14).animate(
              CurvedAnimation(parent: c, curve: Curves.easeInOut),
            ))
        .toList();
    for (var i = 0; i < _controllers.length; i++) {
      Future.delayed(Duration(milliseconds: i * 55), () {
        if (mounted) { _controllers[i].forward(); }
      });
    }
  }

  @override
  void dispose() {
    for (final c in _controllers) { c.dispose(); }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 16,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.center,
        children: List.generate(5, (i) {
          return AnimatedBuilder(
            animation: _anims[i],
            builder: (_, __) => Container(
              width: 3,
              height: _anims[i].value,
              margin: const EdgeInsets.only(right: 2),
              decoration: BoxDecoration(
                color: const Color(0xFF4AA3E4),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          );
        }),
      ),
    );
  }
}

// ── Music sticker widget (reusable in creator + viewer) ───────────────────────

class StoryMusicSticker extends StatefulWidget {
  const StoryMusicSticker({
    super.key,
    required this.music,
    this.compact = false,
  });

  final StoryMusic music;
  final bool compact;

  @override
  State<StoryMusicSticker> createState() => _StoryMusicStickerState();
}

class _StoryMusicStickerState extends State<StoryMusicSticker>
    with TickerProviderStateMixin {
  late final List<AnimationController> _waveCtrs;
  late final List<Animation<double>> _waveAnims;

  @override
  void initState() {
    super.initState();
    _waveCtrs = List.generate(
      4,
      (i) => AnimationController(
        vsync: this,
        duration: Duration(milliseconds: 350 + i * 80),
      )..repeat(reverse: true),
    );
    _waveAnims = _waveCtrs
        .map((c) => Tween<double>(begin: 2, end: 10).animate(
              CurvedAnimation(parent: c, curve: Curves.easeInOut),
            ))
        .toList();
    for (var i = 0; i < _waveCtrs.length; i++) {
      Future.delayed(Duration(milliseconds: i * 60), () {
        if (mounted) { _waveCtrs[i].forward(); }
      });
    }
  }

  @override
  void dispose() {
    for (final c in _waveCtrs) { c.dispose(); }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final music = widget.music;
    final compact = widget.compact;

    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: compact ? 10 : 12,
        vertical: compact ? 7 : 9,
      ),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(compact ? 12 : 16),
        color: Colors.black.withValues(alpha: 0.55),
        border: Border.all(color: Colors.white.withValues(alpha: 0.15)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.25),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Cover
          if (music.coverUrl.isNotEmpty)
            ClipRRect(
              borderRadius: BorderRadius.circular(compact ? 6 : 8),
              child: SizedBox(
                width: compact ? 26 : 34,
                height: compact ? 26 : 34,
                child: Image.network(
                  music.coverUrl,
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => Container(
                    color: const Color(0xFF1E2D48),
                    child: const Icon(Icons.music_note_rounded,
                        color: Color(0xFF4AA3E4), size: 14),
                  ),
                ),
              ),
            )
          else
            Container(
              width: compact ? 26 : 34,
              height: compact ? 26 : 34,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(compact ? 6 : 8),
                gradient: const LinearGradient(
                  colors: [Color(0xFF4AA3E4), Color(0xFF7C3AED)],
                ),
              ),
              child: const Icon(Icons.music_note_rounded,
                  color: Colors.white, size: 14),
            ),
          const SizedBox(width: 8),

          // Info
          Flexible(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  music.title,
                  style: TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w700,
                    fontSize: compact ? 11 : 12,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                Text(
                  music.artist,
                  style: TextStyle(
                    color: Colors.white70,
                    fontSize: compact ? 10 : 11,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),

          // Waveform
          Row(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.center,
            children: List.generate(4, (i) {
              return AnimatedBuilder(
                animation: _waveAnims[i],
                builder: (_, __) => Container(
                  width: 2.5,
                  height: _waveAnims[i].value,
                  margin: const EdgeInsets.only(right: 2),
                  decoration: BoxDecoration(
                    color: const Color(0xFF4AA3E4),
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              );
            }),
          ),
        ],
      ),
    );
  }
}
