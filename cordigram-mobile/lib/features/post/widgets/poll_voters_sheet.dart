import 'package:flutter/material.dart';
import '../models/poll_data.dart';
import '../../messages/services/polls_api_service.dart';

/// Bottom sheet showing the list of users who voted in a poll.
/// Matches the web's PollVotersOverlay: single list + search bar, no option tabs.
class PollVotersSheet extends StatefulWidget {
  const PollVotersSheet({
    super.key,
    required this.poll,
    this.initialOptionIndex,
    this.viewerId,
  });

  final PollData poll;
  final int? initialOptionIndex; // kept for API compat but not used for tabs
  final String? viewerId;

  @override
  State<PollVotersSheet> createState() => _PollVotersSheetState();
}

class _PollVotersSheetState extends State<PollVotersSheet> {
  List<PollVoterItem> _voters = [];
  bool _loading = false;
  bool _hasMore = false;
  String? _cursor;
  String? _error;

  final TextEditingController _searchCtrl = TextEditingController();
  String _searchQuery = '';

  @override
  void initState() {
    super.initState();
    _searchCtrl.addListener(() {
      setState(() => _searchQuery = _searchCtrl.text.trim().toLowerCase());
    });
    _loadVoters(reset: true);
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadVoters({bool reset = false}) async {
    if (_loading) return;
    setState(() {
      _loading = true;
      _error = null;
      if (reset) {
        _voters = [];
        _cursor = null;
        _hasMore = false;
      }
    });
    try {
      final res = await PollsApiService.fetchPollVoters(
        pollId: widget.poll.id,
        limit: 50,
        cursor: reset ? null : _cursor,
      );
      if (!mounted) return;
      final items = (res['items'] as List? ?? [])
          .whereType<Map<String, dynamic>>()
          .map(PollVoterItem.fromJson)
          .toList();
      setState(() {
        _voters = reset ? items : [..._voters, ...items];
        _cursor = res['nextCursor'] as String?;
        _hasMore = _cursor != null && _cursor!.isNotEmpty;
      });
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  List<PollVoterItem> get _filteredVoters {
    if (_searchQuery.isEmpty) return _voters;
    return _voters.where((v) {
      return v.displayName.toLowerCase().contains(_searchQuery) ||
          v.username.toLowerCase().contains(_searchQuery);
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final filtered = _filteredVoters;

    return DraggableScrollableSheet(
      initialChildSize: 0.6,
      minChildSize: 0.3,
      maxChildSize: 0.92,
      expand: false,
      builder: (_, scrollCtrl) {
        return Container(
          decoration: BoxDecoration(
            color: scheme.surface,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
            border: Border.all(color: scheme.outline.withValues(alpha: 0.3)),
          ),
          child: Column(
            children: [
              // Handle bar
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 12),
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: scheme.outline.withValues(alpha: 0.4),
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),

              // Header: title + close
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 8, 12),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        'Lượt bình chọn',
                        style: TextStyle(
                          color: scheme.onSurface,
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.close),
                      onPressed: () => Navigator.of(context).pop(),
                      color: scheme.onSurfaceVariant,
                    ),
                  ],
                ),
              ),

              // Search bar
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                child: TextField(
                  controller: _searchCtrl,
                  style: TextStyle(color: scheme.onSurface, fontSize: 14),
                  decoration: InputDecoration(
                    hintText: 'Tìm tên người dùng',
                    hintStyle: TextStyle(
                      color: scheme.onSurfaceVariant,
                      fontSize: 14,
                    ),
                    prefixIcon: Icon(
                      Icons.search,
                      color: scheme.onSurfaceVariant,
                      size: 20,
                    ),
                    filled: true,
                    fillColor: scheme.surfaceContainerHighest,
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 10,
                    ),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide.none,
                    ),
                  ),
                ),
              ),

              const Divider(height: 1),

              // Voter list
              Expanded(
                child: _error != null
                    ? Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              _error!,
                              style: TextStyle(color: scheme.error, fontSize: 14),
                              textAlign: TextAlign.center,
                            ),
                            const SizedBox(height: 12),
                            TextButton(
                              onPressed: () => _loadVoters(reset: true),
                              child: const Text('Thử lại'),
                            ),
                          ],
                        ),
                      )
                    : _loading && _voters.isEmpty
                    ? const Center(child: CircularProgressIndicator(strokeWidth: 2))
                    : filtered.isEmpty
                    ? Center(
                        child: Text(
                          _searchQuery.isNotEmpty
                              ? 'Không tìm thấy người dùng'
                              : 'Chưa có lượt bình chọn',
                          style: TextStyle(
                            color: scheme.onSurfaceVariant,
                            fontSize: 15,
                          ),
                        ),
                      )
                    : ListView.builder(
                        controller: scrollCtrl,
                        padding: const EdgeInsets.symmetric(vertical: 8),
                        itemCount: filtered.length + (_hasMore ? 1 : 0),
                        itemBuilder: (_, i) {
                          if (i == filtered.length) {
                            return _loading
                                ? const Padding(
                                    padding: EdgeInsets.all(16),
                                    child: Center(
                                      child: CircularProgressIndicator(
                                        strokeWidth: 2,
                                      ),
                                    ),
                                  )
                                : TextButton(
                                    onPressed: _loadVoters,
                                    child: const Text('Tải thêm'),
                                  );
                          }
                          final voter = filtered[i];
                          final isMe = widget.viewerId != null &&
                              voter.userId == widget.viewerId;
                          return _VoterRow(
                            voter: voter,
                            isMe: isMe,
                            scheme: scheme,
                          );
                        },
                      ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _VoterRow extends StatelessWidget {
  const _VoterRow({
    required this.voter,
    required this.isMe,
    required this.scheme,
  });

  final PollVoterItem voter;
  final bool isMe;
  final ColorScheme scheme;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        children: [
          // Avatar
          CircleAvatar(
            radius: 22,
            backgroundColor: scheme.surfaceContainerHighest,
            backgroundImage: voter.avatarUrl.isNotEmpty
                ? NetworkImage(voter.avatarUrl)
                : null,
            child: voter.avatarUrl.isEmpty
                ? Text(
                    voter.displayName.isNotEmpty
                        ? voter.displayName[0].toUpperCase()
                        : '?',
                    style: TextStyle(
                      color: scheme.onSurfaceVariant,
                      fontWeight: FontWeight.w600,
                    ),
                  )
                : null,
          ),
          const SizedBox(width: 12),

          // Name + username
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  voter.displayName.isNotEmpty
                      ? voter.displayName
                      : voter.username,
                  style: TextStyle(
                    color: scheme.onSurface,
                    fontWeight: FontWeight.w600,
                    fontSize: 14,
                  ),
                ),
                if (voter.username.isNotEmpty)
                  Text(
                    '@${voter.username}',
                    style: TextStyle(
                      color: scheme.onSurfaceVariant,
                      fontSize: 13,
                    ),
                  ),
              ],
            ),
          ),

          // "Bạn" badge or nothing
          if (isMe)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
              decoration: BoxDecoration(
                color: scheme.primary,
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(
                'Bạn',
                style: TextStyle(
                  color: scheme.onPrimary,
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
        ],
      ),
    );
  }
}
