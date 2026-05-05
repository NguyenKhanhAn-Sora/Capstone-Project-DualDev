import 'dart:async';

import 'package:flutter/material.dart';

import '../models/message_thread.dart';
import '../models/server_models.dart';
import '../services/direct_messages_service.dart';
import 'message_search_api.dart';
import 'message_search_query_parser.dart';
import 'message_search_result_filter.dart';
import 'system_channel_names.dart';

/// Servers + channels for @ # ! * quick switch (same idea as web `serversForQuickSwitch`).
class QuickSwitchServerData {
  const QuickSwitchServerData({
    required this.id,
    required this.name,
    required this.textChannels,
    required this.voiceChannels,
  });

  final String id;
  final String name;
  final List<ServerChannel> textChannels;
  final List<ServerChannel> voiceChannels;
}

enum _SheetMode { globalDm, dmConversation, serverChannel }

/// Discord-style message search + quick switch, backed by `GET /search/messages`
/// (same as cordigram-web `MessageSearchPanel` + `serversApi.searchMessages` /
/// `searchDirectMessages`).
class MessageSearchSheet extends StatefulWidget {
  const MessageSearchSheet._({
    required this.mode,
    this.dmPeers = const [],
    this.quickServers = const [],
    this.dmPartnerId,
    this.dmPartnerName,
    this.dmConversationOnly = false,
    this.serverId,
    this.channelId,
    this.channelName,
    this.serverName,
    this.searchUiLanguage = 'vi',
    this.onOpenDm,
    this.onOpenServerChannel,
    this.onPickMessageInThread,
    this.onChannelMessagePick,
  });

  /// Messages home: search all DMs + quick switch @ # ! *.
  factory MessageSearchSheet.globalDm({
    required List<MessageThread> dmPeers,
    required List<QuickSwitchServerData> quickServers,
    required void Function(MessageThread thread) onOpenDm,
    required void Function(String serverId, String? channelId) onOpenServerChannel,
    String searchUiLanguage = 'vi',
  }) {
    return MessageSearchSheet._(
      mode: _SheetMode.globalDm,
      dmPeers: dmPeers,
      quickServers: quickServers,
      searchUiLanguage: searchUiLanguage,
      onOpenDm: onOpenDm,
      onOpenServerChannel: onOpenServerChannel,
    );
  }

  /// Single DM thread: conversation-only (literal `q`, no quick switch).
  factory MessageSearchSheet.dmConversation({
    required String partnerId,
    required String partnerName,
    void Function(String messageId)? onPickMessageInThread,
  }) {
    return MessageSearchSheet._(
      mode: _SheetMode.dmConversation,
      dmPartnerId: partnerId,
      dmPartnerName: partnerName,
      dmConversationOnly: true,
      onPickMessageInThread: onPickMessageInThread,
    );
  }

  /// Server text channel: search in server (optionally pinned to one channel).
  factory MessageSearchSheet.serverChannel({
    required String serverId,
    required String serverName,
    String? channelId,
    String? channelName,
    required void Function(String messageId, String channelId) onPickMessage,
  }) {
    return MessageSearchSheet._(
      mode: _SheetMode.serverChannel,
      serverId: serverId,
      channelId: channelId,
      channelName: channelName,
      serverName: serverName,
      onChannelMessagePick: onPickMessage,
    );
  }

  final _SheetMode mode;
  final List<MessageThread> dmPeers;
  final List<QuickSwitchServerData> quickServers;
  final String? dmPartnerId;
  final String? dmPartnerName;
  final bool dmConversationOnly;
  final String? serverId;
  final String? channelId;
  final String? channelName;
  final String? serverName;
  /// BCP-47-ish code from app settings (web: `useLanguage().language`).
  final String searchUiLanguage;
  final void Function(MessageThread thread)? onOpenDm;
  final void Function(String serverId, String? channelId)? onOpenServerChannel;
  final void Function(String messageId)? onPickMessageInThread;
  final void Function(String messageId, String channelId)? onChannelMessagePick;

  static Future<void> present(
    BuildContext context, {
    required Widget child,
  }) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => child,
    );
  }

  @override
  State<MessageSearchSheet> createState() => _MessageSearchSheetState();
}

class _MessageSearchSheetState extends State<MessageSearchSheet> {
  static const _debounceMs = 300;
  static const _limit = 25;

  final TextEditingController _q = TextEditingController();
  Timer? _debounce;
  bool _loading = false;
  String? _error;
  List<Map<String, dynamic>> _results = const [];
  int _total = 0;
  bool _searched = false;

  @override
  void dispose() {
    _debounce?.cancel();
    _q.dispose();
    super.dispose();
  }

  bool get _quickSwitchEnabled =>
      widget.mode == _SheetMode.globalDm ||
      (widget.mode == _SheetMode.serverChannel && widget.quickServers.isNotEmpty);

  bool get _includeStar => widget.mode == _SheetMode.globalDm;

  void _scheduleSearch() {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: _debounceMs), _runSearch);
  }

  Future<void> _runSearch() async {
    final raw = _q.text;
    final qs = parseQuickSwitchPrefix(
      raw,
      enableQuickSwitch: _quickSwitchEnabled,
      includeStarQuickSwitch: _includeStar,
    );
    if (qs.kind.isNotEmpty) {
      setState(() {
        _loading = false;
        _results = const [];
        _total = 0;
        _searched = false;
        _error = null;
      });
      return;
    }

    final parsed = widget.mode == _SheetMode.dmConversation && widget.dmConversationOnly
        ? ParsedMessageSearch(
            text: raw.trim(),
            filters: const ParsedMessageSearchFilters(),
          )
        : (widget.mode == _SheetMode.dmConversation
            ? parseMessageSearchQueryForDm(raw)
            : parseMessageSearchQuery(raw));

    final hasSignal = widget.mode == _SheetMode.dmConversation && widget.dmConversationOnly
        ? raw.trim().isNotEmpty
        : raw.trim().isNotEmpty ||
            (parsed.filters.from?.isNotEmpty ?? false) ||
            (parsed.filters.inChannel?.isNotEmpty ?? false) ||
            parsed.filters.has != null;

    if (!hasSignal) {
      setState(() {
        _results = const [];
        _total = 0;
        _searched = false;
        _error = null;
        _loading = false;
      });
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      late final Map<String, dynamic> res;
      if (widget.mode == _SheetMode.serverChannel) {
        res = await MessageSearchApi.search(
          dm: false,
          q: raw.trim().isEmpty ? null : raw,
          serverId: widget.serverId,
          channelId: widget.channelId,
          limit: _limit,
          offset: 0,
          fuzzy: true,
          parseQuery: true,
        );
      } else {
        res = await MessageSearchApi.search(
          dm: true,
          q: raw.trim().isEmpty ? null : raw,
          partnerUserId: widget.mode == _SheetMode.dmConversation
              ? widget.dmPartnerId
              : null,
          limit: _limit,
          offset: 0,
          fuzzy: true,
          parseQuery: !(widget.dmConversationOnly),
        );
      }
      final list = res['results'];
      final viewer = DirectMessagesService.currentUserId;
      final results = list is List
          ? list
                .whereType<Map>()
                .map((e) => Map<String, dynamic>.from(e))
                .where((e) => messageSearchResultIsVisibleForViewer(e, viewer))
                .toList()
          : <Map<String, dynamic>>[];
      final total = (res['totalCount'] is int)
          ? res['totalCount'] as int
          : int.tryParse('${res['totalCount'] ?? 0}') ?? 0;
      if (!mounted) return;
      setState(() {
        _results = results;
        _total = total;
        _searched = true;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
        _searched = true;
      });
    }
  }

  Future<void> _loadMore() async {
    if (_loading || _results.length >= _total) return;
    setState(() => _loading = true);
    try {
      final raw = _q.text;
      final res = await MessageSearchApi.search(
        dm: widget.mode != _SheetMode.serverChannel,
        q: raw.trim().isEmpty ? null : raw,
        serverId: widget.serverId,
        channelId: widget.channelId,
        partnerUserId:
            widget.mode == _SheetMode.dmConversation ? widget.dmPartnerId : null,
        limit: _limit,
        offset: _results.length,
        fuzzy: true,
        parseQuery: !(widget.dmConversationOnly),
      );
      final list = res['results'];
      final viewer = DirectMessagesService.currentUserId;
      final more = list is List
          ? list
                .whereType<Map>()
                .map((e) => Map<String, dynamic>.from(e))
                .where((e) => messageSearchResultIsVisibleForViewer(e, viewer))
                .toList()
          : <Map<String, dynamic>>[];
      if (!mounted) return;
      setState(() {
        _results = [..._results, ...more];
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _messageId(Map m) =>
      (m['_id'] ?? m['id'] ?? '').toString();

  String? _dmPeerForResult(Map m) {
    final my = DirectMessagesService.currentUserId;
    dynamic sid = m['senderId'];
    dynamic rid = m['receiverId'];
    String? sI = sid is Map ? sid['_id']?.toString() : sid?.toString();
    String? rI = rid is Map ? rid['_id']?.toString() : rid?.toString();
    if (my == null || my.isEmpty) return sI ?? rI;
    if (sI == my) return rI;
    if (rI == my) return sI;
    return sI ?? rI;
  }

  /// Same as web `MessageSearchPanel`: sender display, not raw ObjectId.
  String _senderDisplayName(Map m) {
    final raw = m['senderId'];
    if (raw is Map) {
      final s = Map<String, dynamic>.from(raw);
      final dn = (s['displayName'] ?? s['display_name'] ?? '').toString().trim();
      if (dn.isNotEmpty) return dn;
      final un = (s['username'] ?? s['user_name'] ?? '').toString().trim();
      if (un.isNotEmpty) return un;
      final em = (s['email'] ?? '').toString().trim();
      if (em.isNotEmpty) return em;
      final id = (s['_id'] ?? s['id'] ?? '').toString();
      if (id.isNotEmpty) {
        if (widget.mode == _SheetMode.dmConversation &&
            widget.dmPartnerId != null) {
          if (id == widget.dmPartnerId) {
            final pn = (widget.dmPartnerName ?? '').trim();
            if (pn.isNotEmpty) return pn;
          } else {
            return 'Bạn';
          }
        }
        if (widget.mode == _SheetMode.globalDm) {
          for (final t in widget.dmPeers) {
            if (t.id == id) return t.name;
          }
        }
      }
    } else if (raw != null && raw.toString().trim().isNotEmpty) {
      final id = raw.toString().trim();
      if (widget.mode == _SheetMode.globalDm) {
        for (final t in widget.dmPeers) {
          if (t.id == id) return t.name;
        }
      }
      if (widget.mode == _SheetMode.dmConversation && widget.dmPartnerId != null) {
        if (id == widget.dmPartnerId) {
          final pn = (widget.dmPartnerName ?? '').trim();
          if (pn.isNotEmpty) return pn;
        } else {
          return 'Bạn';
        }
      }
    }
    return '?';
  }

  String _searchResultSubtitle(Map m) {
    final sender = _senderDisplayName(m);
    if (widget.mode == _SheetMode.serverChannel) {
      dynamic ch = m['channelId'];
      var chName = '';
      if (ch is Map) {
        chName = (ch['name'] ?? '').toString().trim();
      }
      if (chName.isNotEmpty &&
          (widget.channelId == null || widget.channelId!.isEmpty)) {
        final disp = translateChannelName(chName, widget.searchUiLanguage);
        return '$sender · #$disp';
      }
      return sender;
    }
    return sender;
  }

  String _snippet(Map m) {
    final c = (m['content'] ?? '').toString().trim();
    if (c.isEmpty) return '(Không có nội dung)';
    return c.length > 120 ? '${c.substring(0, 120)}…' : c;
  }

  String _serverNameFor(String sid) {
    for (final s in widget.quickServers) {
      if (s.id == sid) return s.name;
    }
    return sid;
  }

  Widget _buildQuickSwitch() {
    final raw = _q.text;
    final qs = parseQuickSwitchPrefix(
      raw,
      enableQuickSwitch: _quickSwitchEnabled,
      includeStarQuickSwitch: _includeStar,
    );
    if (qs.kind.isEmpty) return const SizedBox.shrink();

    if (qs.kind == '@') {
      final peers = widget.dmPeers.where((t) {
        return matchesNeedle(qs.needle, [t.name, t.lastMessage, t.id]);
      }).toList();
      if (peers.isEmpty) {
        return const Padding(
          padding: EdgeInsets.all(16),
          child: Text(
            'Không tìm thấy cuộc trò chuyện',
            style: TextStyle(color: Color(0xFFAFC0E2)),
          ),
        );
      }
      return ListView.builder(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        itemCount: peers.length,
        itemBuilder: (_, i) {
          final t = peers[i];
          return ListTile(
            leading: const Icon(Icons.person_rounded, color: Color(0xFF7FB6FF)),
            title: Text(t.name, style: const TextStyle(color: Colors.white)),
            subtitle: Text(
              t.lastMessage,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(color: Color(0xFF8EA3CC), fontSize: 12),
            ),
            onTap: () {
              Navigator.of(context).pop();
              widget.onOpenDm?.call(t);
            },
          );
        },
      );
    }

    if (qs.kind == '#') {
      final rows = <({String sid, ServerChannel ch})>[];
      for (final s in widget.quickServers) {
        for (final c in s.textChannels) {
          final nameFields = channelQuickSwitchMatchFields(
            c.name,
            widget.searchUiLanguage,
          );
          if (matchesNeedle(qs.needle, [...nameFields, s.name])) {
            rows.add((sid: s.id, ch: c));
          }
        }
      }
      if (rows.isEmpty) {
        return const Padding(
          padding: EdgeInsets.all(16),
          child: Text(
            'Không tìm thấy kênh',
            style: TextStyle(color: Color(0xFFAFC0E2)),
          ),
        );
      }
      return ListView.builder(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        itemCount: rows.length.clamp(0, 40),
        itemBuilder: (_, i) {
          final r = rows[i];
          return ListTile(
            leading: const Icon(Icons.tag_rounded, color: Color(0xFF7FB6FF)),
            title: Text(
              '# ${translateChannelName(r.ch.name, widget.searchUiLanguage)}',
              style: const TextStyle(color: Colors.white),
            ),
            subtitle: Text(
              _serverNameFor(r.sid),
              style: const TextStyle(color: Color(0xFF8EA3CC), fontSize: 11),
            ),
            onTap: () {
              Navigator.of(context).pop();
              widget.onOpenServerChannel?.call(r.sid, r.ch.id);
            },
          );
        },
      );
    }

    if (qs.kind == '!') {
      final rows = <({String sid, ServerChannel ch})>[];
      for (final s in widget.quickServers) {
        for (final c in s.voiceChannels) {
          final nameFields = channelQuickSwitchMatchFields(
            c.name,
            widget.searchUiLanguage,
          );
          if (matchesNeedle(qs.needle, [...nameFields, s.name])) {
            rows.add((sid: s.id, ch: c));
          }
        }
      }
      if (rows.isEmpty) {
        return const Padding(
          padding: EdgeInsets.all(16),
          child: Text(
            'Không tìm thấy kênh thoại',
            style: TextStyle(color: Color(0xFFAFC0E2)),
          ),
        );
      }
      return ListView.builder(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        itemCount: rows.length.clamp(0, 40),
        itemBuilder: (_, i) {
          final r = rows[i];
          return ListTile(
            leading: const Icon(Icons.headset_mic_rounded, color: Color(0xFF7FB6FF)),
            title: Text(
              translateChannelName(r.ch.name, widget.searchUiLanguage),
              style: const TextStyle(color: Colors.white),
            ),
            onTap: () {
              Navigator.of(context).pop();
              widget.onOpenServerChannel?.call(r.sid, r.ch.id);
            },
          );
        },
      );
    }

    if (qs.kind == '*') {
      final servers = widget.quickServers.where((s) {
        return matchesNeedle(qs.needle, [s.name]);
      }).toList();
      if (servers.isEmpty) {
        return const Padding(
          padding: EdgeInsets.all(16),
          child: Text(
            'Không tìm thấy server',
            style: TextStyle(color: Color(0xFFAFC0E2)),
          ),
        );
      }
      return ListView.builder(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        itemCount: servers.length,
        itemBuilder: (_, i) {
          final s = servers[i];
          return ListTile(
            leading: const Icon(Icons.dns_rounded, color: Color(0xFF7FB6FF)),
            title: Text(s.name, style: const TextStyle(color: Colors.white)),
            onTap: () {
              Navigator.of(context).pop();
              widget.onOpenServerChannel?.call(s.id, null);
            },
          );
        },
      );
    }

    return const SizedBox.shrink();
  }

  @override
  Widget build(BuildContext context) {
    final title = switch (widget.mode) {
      _SheetMode.globalDm => 'Tìm hoặc bắt đầu cuộc trò chuyện',
      _SheetMode.dmConversation =>
        'Tìm trong ${widget.dmPartnerName ?? 'trò chuyện'}',
      _SheetMode.serverChannel =>
        'Tìm tin nhắn${widget.channelName != null ? ' · #${widget.channelName}' : ''}',
    };

    final hint = switch (widget.mode) {
      _SheetMode.globalDm => 'from: @ # ! * · Gợi ý: bắt đầu bằng @ # ! *',
      _SheetMode.dmConversation => 'Chỉ nội dung tin nhắn trong cuộc trò chuyện này',
      _SheetMode.serverChannel => 'from: in: has: · Nội dung…',
    };

    return Material(
      color: const Color(0xFF0F1B37),
      borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: EdgeInsets.only(
            bottom: MediaQuery.viewInsetsOf(context).bottom,
          ),
          child: SizedBox(
            height: MediaQuery.sizeOf(context).height * 0.88,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(8, 6, 4, 0),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          title,
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w700,
                            fontSize: 16,
                          ),
                        ),
                      ),
                      IconButton(
                        onPressed: () => Navigator.of(context).pop(),
                        icon: const Icon(Icons.close_rounded, color: Colors.white),
                      ),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
                  child: TextField(
                    controller: _q,
                    autofocus: true,
                    style: const TextStyle(color: Colors.white),
                    decoration: InputDecoration(
                      hintText: hint,
                      hintStyle: const TextStyle(
                        color: Color(0xFF8EA3CC),
                        fontSize: 13,
                      ),
                      filled: true,
                      fillColor: const Color(0xFF152447),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: const BorderSide(color: Color(0xFF2C3A5A)),
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: const BorderSide(color: Color(0xFF2C3A5A)),
                      ),
                    ),
                    onChanged: (_) => _scheduleSearch(),
                  ),
                ),
                if (_loading && !_searched)
                  const LinearProgressIndicator(minHeight: 2),
                if (_error != null)
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    child: Text(
                      _error!,
                      style: const TextStyle(color: Color(0xFFFF9CAB)),
                    ),
                  ),
                Expanded(
                  child: Builder(
                    builder: (context) {
                      final qs = parseQuickSwitchPrefix(
                        _q.text,
                        enableQuickSwitch: _quickSwitchEnabled,
                        includeStarQuickSwitch: _includeStar,
                      );
                      if (qs.kind.isNotEmpty) {
                        return _buildQuickSwitch();
                      }
                      if (!_searched) {
                        return const Center(
                          child: Text(
                            'Nhập từ khóa hoặc bộ lọc from:/in:/has:',
                            style: TextStyle(color: Color(0xFFAFC0E2)),
                          ),
                        );
                      }
                      if (_results.isEmpty) {
                        return const Center(
                          child: Text(
                            'Không có kết quả',
                            style: TextStyle(color: Color(0xFFAFC0E2)),
                          ),
                        );
                      }
                      return ListView.separated(
                        padding: const EdgeInsets.fromLTRB(8, 0, 8, 12),
                        itemCount: _results.length + (_results.length < _total ? 1 : 0),
                        separatorBuilder: (_, __) => const Divider(
                          height: 1,
                          color: Color(0xFF2C3A5A),
                        ),
                        itemBuilder: (_, i) {
                          if (i == _results.length) {
                            return TextButton(
                              onPressed: _loading ? null : _loadMore,
                              child: Text(
                                _loading
                                    ? 'Đang tải…'
                                    : 'Tải thêm (${_total - _results.length})',
                              ),
                            );
                          }
                          final m = _results[i];
                          final id = _messageId(m);
                          dynamic ch = m['channelId'];
                          final chId = ch is Map
                              ? ch['_id']?.toString()
                              : ch?.toString();
                          return ListTile(
                            title: Text(
                              _snippet(m),
                              maxLines: 3,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(color: Colors.white, fontSize: 14),
                            ),
                            subtitle: Text(
                              _searchResultSubtitle(m),
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                color: Color(0xFF8EA3CC),
                                fontSize: 11,
                              ),
                            ),
                            onTap: () {
                              Navigator.of(context).pop();
                              if (widget.mode == _SheetMode.globalDm) {
                                final peer = _dmPeerForResult(m);
                                if (peer != null && peer.isNotEmpty) {
                                  MessageThread? found;
                                  for (final t in widget.dmPeers) {
                                    if (t.id == peer) {
                                      found = t;
                                      break;
                                    }
                                  }
                                  if (found != null) {
                                    widget.onOpenDm?.call(found);
                                  }
                                }
                              } else if (widget.mode == _SheetMode.dmConversation) {
                                widget.onPickMessageInThread?.call(id);
                              } else if (widget.mode == _SheetMode.serverChannel) {
                                final cid = (widget.channelId ?? chId ?? '').trim();
                                if (cid.isNotEmpty) {
                                  widget.onChannelMessagePick?.call(id, cid);
                                }
                              }
                            },
                          );
                        },
                      );
                    },
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
