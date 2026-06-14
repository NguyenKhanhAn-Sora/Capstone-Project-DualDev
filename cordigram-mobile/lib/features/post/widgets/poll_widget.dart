import 'dart:async';
import 'package:flutter/material.dart';
import '../models/poll_data.dart';
import '../../../core/services/language_controller.dart';
import '../../messages/services/polls_api_service.dart';
import 'poll_voters_sheet.dart';

/// Full poll voting widget rendered inside a post card.
/// Mirrors the web `PollBlock` component.
class PollWidget extends StatefulWidget {
  const PollWidget({
    super.key,
    required this.poll,
    required this.postId,
    this.viewerId,
    this.onPollUpdated,
  });

  final PollData poll;
  final String postId;
  final String? viewerId;
  final void Function(PollData updated)? onPollUpdated;

  @override
  State<PollWidget> createState() => _PollWidgetState();
}

class _PollWidgetState extends State<PollWidget> {
  late PollData _poll;
  bool _loadingVotes = false;
  bool _voting = false;
  Set<int> _pendingSelection = {};
  bool _fetchedUserVotes = false;

  // Live countdown
  late String _countdown;
  Timer? _countdownTimer;

  @override
  void initState() {
    super.initState();
    _poll = widget.poll;
    _pendingSelection = Set.from(_poll.userVotes ?? []);
    _countdown = _computeCountdown();
    _startCountdownTimer();
    _maybeLoadUserVotes();
  }

  @override
  void didUpdateWidget(PollWidget old) {
    super.didUpdateWidget(old);
    if (old.poll.id != widget.poll.id) {
      _poll = widget.poll;
      _pendingSelection = Set.from(_poll.userVotes ?? []);
      _fetchedUserVotes = false;
      _countdown = _computeCountdown();
      _restartCountdownTimer();
      _maybeLoadUserVotes();
    }
  }

  @override
  void dispose() {
    _countdownTimer?.cancel();
    super.dispose();
  }

  String _computeCountdown() {
    if (_poll.isExpired) return 'Đã kết thúc';
    final expiresAt = DateTime.tryParse(_poll.expiresAt);
    if (expiresAt == null) {
      final h = _poll.hoursLeft;
      if (h <= 0) return 'Đã kết thúc';
      if (h < 1) return 'Còn ${(h * 60).round()} phút';
      final hInt = h.floor();
      final mInt = ((h - hInt) * 60).round();
      if (mInt == 0) return 'Còn ${hInt}g';
      return 'Còn ${hInt}g ${mInt}p';
    }
    final ms = expiresAt.difference(DateTime.now()).inMilliseconds;
    if (ms <= 0) return 'Đã kết thúc';
    final totalSecs = ms ~/ 1000;
    final h = totalSecs ~/ 3600;
    final m = (totalSecs % 3600) ~/ 60;
    if (h > 0) return 'Còn ${h}g ${m}p';
    return 'Còn $m phút';
  }

  bool get _isExpiredNow {
    if (_poll.isExpired) return true;
    final expiresAt = DateTime.tryParse(_poll.expiresAt);
    if (expiresAt == null) return _poll.hoursLeft <= 0;
    return expiresAt.isBefore(DateTime.now());
  }

  void _startCountdownTimer() {
    if (_isExpiredNow) return;
    _countdownTimer = Timer.periodic(const Duration(seconds: 30), (_) {
      if (!mounted) return;
      setState(() => _countdown = _computeCountdown());
    });
  }

  void _restartCountdownTimer() {
    _countdownTimer?.cancel();
    _startCountdownTimer();
  }

  bool get _isLoggedIn => widget.viewerId != null && widget.viewerId!.isNotEmpty;

  void _maybeLoadUserVotes() {
    if (!_isLoggedIn || _fetchedUserVotes) return;
    if (_poll.userVotes != null) {
      _fetchedUserVotes = true;
      return;
    }
    _fetchUserVotes();
  }

  Future<void> _fetchUserVotes() async {
    if (_loadingVotes) return;
    setState(() => _loadingVotes = true);
    try {
      final votes = await PollsApiService.getMyVote(_poll.id);
      if (!mounted) return;
      final updated = _poll.copyWith(userVotes: votes);
      setState(() {
        _poll = updated;
        _pendingSelection = Set.from(votes);
        _fetchedUserVotes = true;
      });
      widget.onPollUpdated?.call(updated);
    } catch (_) {
      if (mounted) setState(() => _fetchedUserVotes = true);
    } finally {
      if (mounted) setState(() => _loadingVotes = false);
    }
  }

  void _toggleOption(int idx) {
    if (_isExpiredNow || !_isLoggedIn) return;
    if (_poll.allowMultipleAnswers) {
      setState(() {
        if (_pendingSelection.contains(idx)) {
          _pendingSelection.remove(idx);
        } else {
          _pendingSelection.add(idx);
        }
      });
    } else {
      setState(() => _pendingSelection = {idx});
    }
  }

  bool get _hasVoted => (_poll.userVotes?.isNotEmpty ?? false);
  bool get _showResults => _hasVoted || _isExpiredNow;

  Future<void> _submitVote() async {
    if (_voting || _pendingSelection.isEmpty) return;
    setState(() => _voting = true);
    try {
      await PollsApiService.votePoll(
        pollId: _poll.id,
        optionIndexes: _pendingSelection.toList()..sort(),
      );
      final results = await PollsApiService.getPollResults(_poll.id);
      if (!mounted) return;
      final updated = PollData.fromJson(results).copyWith(
        userVotes: _pendingSelection.toList()..sort(),
      );
      setState(() => _poll = updated);
      widget.onPollUpdated?.call(updated);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('${LanguageController.instance.t('post.create.voteFailed')}: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _voting = false);
    }
  }

  void _openVoters({int? optionIndex}) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => PollVotersSheet(
        poll: _poll,
        initialOptionIndex: optionIndex,
        viewerId: widget.viewerId,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final expired = _isExpiredNow;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Options
        ...List.generate(_poll.options.length, (i) {
          final option = _poll.options[i];
          final imgUrl = _poll.hasImages && i < _poll.optionImages.length
              ? _poll.optionImages[i]
              : '';
          final isSelected = _pendingSelection.contains(i);
          final isVoted = _poll.userVotes?.contains(i) ?? false;
          final result = _showResults && i < _poll.results.length
              ? _poll.results[i]
              : null;

          return Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: _PollOption(
              index: i,
              label: option,
              imageUrl: imgUrl.isNotEmpty ? imgUrl : null,
              selected: isSelected,
              voted: isVoted,
              showResults: _showResults,
              result: result,
              totalVotes: _poll.totalVotes,
              isExpired: expired,
              onTap: expired || !_isLoggedIn ? null : () => _toggleOption(i),
              onVotersTap: _showResults && _poll.totalVotes > 0
                  ? () => _openVoters(optionIndex: i)
                  : null,
              isDark: isDark,
              scheme: scheme,
            ),
          );
        }),

        const SizedBox(height: 8),

        // Footer row: vote count + countdown badge + optional submit
        Row(
          children: [
            Expanded(
              child: GestureDetector(
                onTap: _poll.totalVotes > 0 ? () => _openVoters() : null,
                child: Text(
                  _poll.uniqueVoters == 0
                      ? 'Chưa có lượt bình chọn'
                      : '${_poll.uniqueVoters} lượt bình chọn',
                  style: TextStyle(
                    color: _poll.totalVotes > 0
                        ? scheme.primary
                        : scheme.onSurfaceVariant,
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                    decoration: _poll.totalVotes > 0
                        ? TextDecoration.underline
                        : null,
                  ),
                ),
              ),
            ),
            // Multi-vote submit button
            if (_isLoggedIn && !_showResults && !expired && _poll.allowMultipleAnswers) ...[
              _buildSubmitButton(scheme),
              const SizedBox(width: 8),
            ],
            // Countdown badge
            _CountdownBadge(
              countdown: _countdown,
              isExpired: expired,
              isDark: isDark,
            ),
          ],
        ),

        // Single-choice submit button
        if (_isLoggedIn && !_showResults && !expired && !_poll.allowMultipleAnswers) ...[
          const SizedBox(height: 10),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed:
                  _pendingSelection.isNotEmpty && !_voting ? _submitVote : null,
              style: FilledButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 10),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10),
                ),
              ),
              child: _voting
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Text('Bình chọn', style: TextStyle(fontSize: 14)),
            ),
          ),
        ],
      ],
    );
  }

  Widget _buildSubmitButton(ColorScheme scheme) {
    return GestureDetector(
      onTap: _pendingSelection.isNotEmpty && !_voting ? _submitVote : null,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            colors: [Color(0xFF4AA3E4), Color(0xFF22D3EE)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          borderRadius: BorderRadius.circular(10),
        ),
        child: _voting
            ? const SizedBox(
                width: 14,
                height: 14,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: Colors.white,
                ),
              )
            : const Text(
                'Bình chọn',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                ),
              ),
      ),
    );
  }
}

/// Animated countdown badge — green pill with pulsing dot when active,
/// gray pill when expired. Matches the web's `.footerBadgeLive` / `.footerBadgeClosed`.
class _CountdownBadge extends StatefulWidget {
  const _CountdownBadge({
    required this.countdown,
    required this.isExpired,
    required this.isDark,
  });

  final String countdown;
  final bool isExpired;
  final bool isDark;

  @override
  State<_CountdownBadge> createState() => _CountdownBadgeState();
}

class _CountdownBadgeState extends State<_CountdownBadge>
    with SingleTickerProviderStateMixin {
  late AnimationController _pulseCtrl;
  late Animation<double> _pulseAnim;

  @override
  void initState() {
    super.initState();
    _pulseCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1600),
    );
    _pulseAnim = Tween<double>(begin: 1.0, end: 0.35).animate(
      CurvedAnimation(parent: _pulseCtrl, curve: Curves.easeInOut),
    );
    if (!widget.isExpired) {
      _pulseCtrl.repeat(reverse: true);
    }
  }

  @override
  void didUpdateWidget(_CountdownBadge old) {
    super.didUpdateWidget(old);
    if (widget.isExpired && !old.isExpired) {
      _pulseCtrl.stop();
    } else if (!widget.isExpired && old.isExpired) {
      _pulseCtrl.repeat(reverse: true);
    }
  }

  @override
  void dispose() {
    _pulseCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.isExpired) {
      // Gray closed badge
      final scheme = Theme.of(context).colorScheme;
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
        decoration: BoxDecoration(
          color: scheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(999),
        ),
        child: Text(
          widget.countdown, // "Đã kết thúc"
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.5,
            color: scheme.onSurfaceVariant,
          ),
        ),
      );
    }

    // Green live badge with pulsing dot
    const green = Color(0xFF22C55E);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
      decoration: BoxDecoration(
        color: const Color(0xFF22C55E).withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(
          color: const Color(0xFF22C55E).withValues(alpha: 0.22),
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          FadeTransition(
            opacity: _pulseAnim,
            child: Container(
              width: 6,
              height: 6,
              decoration: const BoxDecoration(
                color: green,
                shape: BoxShape.circle,
              ),
            ),
          ),
          const SizedBox(width: 5),
          Text(
            widget.countdown,
            style: const TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.5,
              color: green,
            ),
          ),
        ],
      ),
    );
  }
}

class _PollOption extends StatelessWidget {
  const _PollOption({
    required this.index,
    required this.label,
    this.imageUrl,
    required this.selected,
    required this.voted,
    required this.showResults,
    this.result,
    required this.totalVotes,
    required this.isExpired,
    this.onTap,
    this.onVotersTap,
    required this.isDark,
    required this.scheme,
  });

  final int index;
  final String label;
  final String? imageUrl;
  final bool selected;
  final bool voted;
  final bool showResults;
  final PollOptionResult? result;
  final int totalVotes;
  final bool isExpired;
  final VoidCallback? onTap;
  final VoidCallback? onVotersTap;
  final bool isDark;
  final ColorScheme scheme;

  @override
  Widget build(BuildContext context) {
    final pct = result?.percentage ?? 0;
    final isWinner = showResults &&
        result != null &&
        totalVotes > 0 &&
        result!.voteCount > 0;

    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: voted
                ? scheme.primary
                : selected
                ? scheme.primary.withValues(alpha: 0.6)
                : scheme.outline.withValues(alpha: 0.4),
            width: voted || selected ? 1.5 : 1,
          ),
          color: voted
              ? scheme.primary.withValues(alpha: isDark ? 0.18 : 0.08)
              : selected
              ? scheme.primary.withValues(alpha: isDark ? 0.10 : 0.05)
              : scheme.surface,
        ),
        clipBehavior: Clip.hardEdge,
        child: Stack(
          children: [
            // Progress bar fill
            if (showResults && pct > 0)
              Positioned.fill(
                child: FractionallySizedBox(
                  alignment: Alignment.centerLeft,
                  widthFactor: pct / 100,
                  child: Container(
                    decoration: BoxDecoration(
                      color: (isWinner ? scheme.primary : scheme.onSurface)
                          .withValues(alpha: isDark ? 0.14 : 0.08),
                    ),
                  ),
                ),
              ),

            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              child: Row(
                children: [
                  // Option image
                  if (imageUrl != null) ...[
                    ClipRRect(
                      borderRadius: BorderRadius.circular(6),
                      child: Image.network(
                        imageUrl!,
                        width: 40,
                        height: 40,
                        fit: BoxFit.cover,
                        errorBuilder: (_, __, ___) => const SizedBox(
                          width: 40,
                          height: 40,
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                  ],

                  // Label
                  Expanded(
                    child: Text(
                      label,
                      style: TextStyle(
                        color: scheme.onSurface,
                        fontSize: 14,
                        fontWeight:
                            voted ? FontWeight.w600 : FontWeight.w400,
                      ),
                    ),
                  ),

                  // Right side: pct or checkbox/radio
                  if (showResults) ...[
                    if (voted) ...[
                      Container(
                        width: 7,
                        height: 7,
                        margin: const EdgeInsets.only(right: 6),
                        decoration: BoxDecoration(
                          color: scheme.primary,
                          shape: BoxShape.circle,
                        ),
                      ),
                    ],
                    GestureDetector(
                      onTap: onVotersTap,
                      child: Text(
                        '$pct%',
                        style: TextStyle(
                          color: isWinner
                              ? scheme.primary
                              : scheme.onSurfaceVariant,
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          decoration: onVotersTap != null
                              ? TextDecoration.underline
                              : null,
                        ),
                      ),
                    ),
                  ] else ...[
                    AnimatedSwitcher(
                      duration: const Duration(milliseconds: 150),
                      child: selected
                          ? Icon(
                              Icons.check_circle_rounded,
                              key: const ValueKey('checked'),
                              color: scheme.primary,
                              size: 20,
                            )
                          : Icon(
                              Icons.radio_button_unchecked,
                              key: const ValueKey('unchecked'),
                              color: scheme.outline,
                              size: 20,
                            ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
