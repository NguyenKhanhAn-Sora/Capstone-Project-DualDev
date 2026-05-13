import 'package:flutter/material.dart';

import 'models/server_models.dart';
import 'services/servers_service.dart';

/// Admin duyệt đơn đăng ký — cùng API và luồng chính như web `ServerJoinApplicationsPanel`.
class ServerJoinApplicationsScreen extends StatefulWidget {
  const ServerJoinApplicationsScreen({super.key, required this.server});

  final ServerSummary server;

  @override
  State<ServerJoinApplicationsScreen> createState() =>
      _ServerJoinApplicationsScreenState();
}

class _ServerJoinApplicationsScreenState
    extends State<ServerJoinApplicationsScreen> {
  static const _tabs = ['all', 'pending', 'rejected', 'approved'];

  String _tab = 'pending';
  bool _loading = true;
  String? _listError;
  List<Map<String, dynamic>> _items = const [];
  int _pendingCountFromApi = 0;
  String? _quickBusyUserId;

  String get _ownerNorm => (widget.server.ownerId ?? '').trim();

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _listError = null;
    });
    try {
      final res = await ServersService.listJoinApplications(
        widget.server.id,
        _tab,
      );
      final owner = _ownerNorm;
      var rows = res.items;
      if (owner.isNotEmpty) {
        rows = rows
            .where((e) => (e['userId'] ?? '').toString().trim() != owner)
            .toList();
      }
      if (!mounted) return;
      setState(() {
        _items = rows;
        _pendingCountFromApi =
            _tab == 'pending' ? rows.length : res.pendingCount;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _listError = e.toString();
        _items = const [];
      });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _tabLabel(String key) {
    switch (key) {
      case 'all':
        return 'Tất cả';
      case 'pending':
        final n = _tab == 'pending' ? _items.length : _pendingCountFromApi;
        return n > 0 ? 'Chờ duyệt ($n)' : 'Chờ duyệt';
      case 'rejected':
        return 'Từ chối';
      case 'approved':
        return 'Đã duyệt';
      default:
        return key;
    }
  }

  Future<void> _quickApprove(String userId) async {
    setState(() => _quickBusyUserId = userId);
    try {
      await ServersService.approveServerAccessUser(widget.server.id, userId);
      if (!mounted) return;
      await _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Duyệt thất bại: $e')),
      );
    } finally {
      if (mounted) setState(() => _quickBusyUserId = null);
    }
  }

  Future<void> _quickReject(String userId) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF0E2247),
        title: const Text('Từ chối đơn?', style: TextStyle(color: Colors.white)),
        content: const Text(
          'Người này sẽ không được tham gia máy chủ qua đơn đăng ký này.',
          style: TextStyle(color: Color(0xFFAFC0E2)),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Huỷ'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text(
              'Từ chối',
              style: TextStyle(color: Color(0xFFFF6B6B)),
            ),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    setState(() => _quickBusyUserId = userId);
    try {
      await ServersService.rejectServerAccessUser(widget.server.id, userId);
      if (!mounted) return;
      await _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Từ chối thất bại: $e')),
      );
    } finally {
      if (mounted) setState(() => _quickBusyUserId = null);
    }
  }

  Future<void> _openDetail(Map<String, dynamic> row) async {
    final userId = (row['userId'] ?? '').toString();
    if (userId.isEmpty) return;
    Map<String, dynamic>? detail;
    try {
      detail = await ServersService.getJoinApplicationDetail(
        widget.server.id,
        userId,
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Không tải chi tiết: $e')),
      );
      return;
    }
    if (!mounted) return;
    final d = detail;
    final status = (d['status'] ?? '').toString();
    final pending = status == 'pending';
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF0E2247),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) {
        final qa = d['questionsWithAnswers'];
        final list = qa is List ? qa.whereType<Map>().toList() : <Map>[];
        return SafeArea(
          child: Padding(
            padding: EdgeInsets.only(
              bottom: MediaQuery.viewInsetsOf(ctx).bottom + 16,
              left: 16,
              right: 16,
              top: 12,
            ),
            child: DraggableScrollableSheet(
              expand: false,
              initialChildSize: 0.55,
              minChildSize: 0.35,
              maxChildSize: 0.92,
              builder: (_, scroll) {
                return ListView(
                  controller: scroll,
                  children: [
                    Text(
                      (d['displayName'] ?? row['displayName'] ?? '').toString(),
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    Text(
                      '@${(d['username'] ?? row['username'] ?? '').toString()}',
                      style: const TextStyle(color: Color(0xFFAFC0E2)),
                    ),
                    const SizedBox(height: 12),
                    if (d['acceptedRules'] == true)
                      const Text(
                        'Đã chấp nhận quy định máy chủ',
                        style: TextStyle(color: Color(0xFF7BED9F), fontSize: 13),
                      ),
                    const SizedBox(height: 12),
                    const Text(
                      'Câu trả lời',
                      style: TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 8),
                    if (list.isEmpty)
                      const Text(
                        '—',
                        style: TextStyle(color: Color(0xFFAFC0E2)),
                      )
                    else
                      ...list.map((m) {
                        final map = Map<String, dynamic>.from(m);
                        final title = (map['title'] ?? '').toString();
                        final at = (map['answerText'] ?? '').toString();
                        final opt = (map['selectedOption'] ?? '').toString();
                        final body = at.isNotEmpty ? at : opt;
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 10),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                title,
                                style: const TextStyle(
                                  color: Color(0xFF8EB7FF),
                                  fontSize: 13,
                                ),
                              ),
                              Text(
                                body.isEmpty ? '—' : body,
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 14,
                                ),
                              ),
                            ],
                          ),
                        );
                      }),
                    if (pending) ...[
                      const SizedBox(height: 16),
                      Row(
                        children: [
                          Expanded(
                            child: OutlinedButton(
                              onPressed: () async {
                                Navigator.pop(ctx);
                                await _quickReject(userId);
                              },
                              style: OutlinedButton.styleFrom(
                                foregroundColor: const Color(0xFFFF6B6B),
                                side: const BorderSide(
                                  color: Color(0xFFFF6B6B),
                                ),
                              ),
                              child: const Text('Từ chối'),
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: FilledButton(
                              onPressed: () async {
                                Navigator.pop(ctx);
                                await _quickApprove(userId);
                              },
                              child: const Text('Duyệt'),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ],
                );
              },
            ),
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF08183A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF08183A),
        title: const Text('Đơn tham gia'),
        actions: [
          IconButton(
            tooltip: 'Làm mới',
            onPressed: _loading ? null : _load,
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
            child: Text(
              widget.server.name,
              style: const TextStyle(
                color: Color(0xFFAFC0E2),
                fontSize: 13,
              ),
            ),
          ),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            child: Row(
              children: [
                for (final t in _tabs) ...[
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    child: ChoiceChip(
                      label: Text(_tabLabel(t)),
                      selected: _tab == t,
                      onSelected: (_) {
                        if (_tab == t) return;
                        setState(() => _tab = t);
                        _load();
                      },
                    ),
                  ),
                ],
              ],
            ),
          ),
          if (_listError != null)
            Padding(
              padding: const EdgeInsets.all(12),
              child: Text(
                _listError!,
                style: const TextStyle(color: Color(0xFFFF6B6B)),
              ),
            ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _items.isEmpty
                ? const Center(
                    child: Text(
                      'Không có đơn nào.',
                      style: TextStyle(color: Color(0xFFAFC0E2)),
                    ),
                  )
                : RefreshIndicator(
                    onRefresh: _load,
                    child: ListView.separated(
                      physics: const AlwaysScrollableScrollPhysics(),
                      padding: const EdgeInsets.fromLTRB(8, 0, 8, 24),
                      itemCount: _items.length,
                      separatorBuilder: (_, __) =>
                          const Divider(height: 1, color: Color(0xFF21345D)),
                      itemBuilder: (context, i) {
                        final row = _items[i];
                        final userId = (row['userId'] ?? '').toString();
                        final name =
                            (row['displayName'] ?? '').toString().trim();
                        final user =
                            (row['username'] ?? '').toString().trim();
                        final status = (row['status'] ?? '').toString();
                        final pending = status == 'pending';
                        final busy = _quickBusyUserId == userId;
                        final av = row['avatarUrl']?.toString() ?? '';
                        return ListTile(
                          onTap: () => _openDetail(row),
                          leading: CircleAvatar(
                            backgroundColor: const Color(0xFF1F2D4D),
                            backgroundImage:
                                av.startsWith('http') ? NetworkImage(av) : null,
                            child: av.startsWith('http')
                                ? null
                                : Text(
                                    (name.isNotEmpty ? name : user).isEmpty
                                        ? '?'
                                        : (name.isNotEmpty ? name : user)[0]
                                              .toUpperCase(),
                                  ),
                          ),
                          title: Text(
                            name.isNotEmpty ? name : user,
                            style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          subtitle: Text(
                            user.isNotEmpty ? '@$user' : '',
                            style: const TextStyle(color: Color(0xFFAFC0E2)),
                          ),
                          trailing: pending
                              ? Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    IconButton(
                                      tooltip: 'Duyệt',
                                      onPressed: busy
                                          ? null
                                          : () => _quickApprove(userId),
                                      icon: busy
                                          ? const SizedBox(
                                              width: 18,
                                              height: 18,
                                              child: CircularProgressIndicator(
                                                strokeWidth: 2,
                                              ),
                                            )
                                          : const Icon(
                                              Icons.check_rounded,
                                              color: Color(0xFF7BED9F),
                                            ),
                                    ),
                                    IconButton(
                                      tooltip: 'Từ chối',
                                      onPressed: busy
                                          ? null
                                          : () => _quickReject(userId),
                                      icon: const Icon(
                                        Icons.close_rounded,
                                        color: Color(0xFFFF6B6B),
                                      ),
                                    ),
                                  ],
                                )
                              : Text(
                                  status == 'accepted'
                                      ? 'Đã duyệt'
                                      : status == 'rejected'
                                      ? 'Từ chối'
                                      : status,
                                  style: const TextStyle(
                                    color: Color(0xFFAFC0E2),
                                    fontSize: 12,
                                  ),
                                ),
                        );
                      },
                    ),
                  ),
          ),
        ],
      ),
    );
  }
}
