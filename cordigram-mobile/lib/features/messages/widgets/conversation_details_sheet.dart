import 'dart:async';

import 'package:flutter/material.dart';

import '../models/dm_message.dart';
import '../services/direct_messages_service.dart';
import '../utils/messages_i18n.dart';
import '../../../core/theme/messages_chrome_palette.dart';
import 'messages_chrome_builder.dart';

// ─── Public API ──────────────────────────────────────────────────────────────

class ConversationDetailsSheet extends StatelessWidget {
  const ConversationDetailsSheet._({
    required this.peerUserId,
    required this.peerName,
    required this.peerAvatarUrl,
    required this.messages,
    required this.onJumpToMessage,
    required this.onOpenMediaViewer,
  });

  final String peerUserId;
  final String peerName;
  final String? peerAvatarUrl;
  final List<DmMessage> messages;
  final void Function(String messageId) onJumpToMessage;
  final void Function(List<CdsMediaItem> items, int index) onOpenMediaViewer;

  static Future<void> show(
    BuildContext context, {
    required String peerUserId,
    required String peerName,
    String? peerAvatarUrl,
    required List<DmMessage> messages,
    required void Function(String messageId) onJumpToMessage,
    required void Function(List<CdsMediaItem> items, int index) onOpenMediaViewer,
  }) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      barrierColor: Colors.black54,
      useSafeArea: true,
      builder: (_) => ConversationDetailsSheet._(
        peerUserId: peerUserId,
        peerName: peerName,
        peerAvatarUrl: peerAvatarUrl,
        messages: messages,
        onJumpToMessage: onJumpToMessage,
        onOpenMediaViewer: onOpenMediaViewer,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final mq = MediaQuery.of(context);
    return MessagesChromeBuilder(
      builder: (context, chrome) => DraggableScrollableSheet(
        initialChildSize: 0.92,
        minChildSize: 0.5,
        maxChildSize: 0.97,
        snap: true,
        snapSizes: const [0.5, 0.92, 0.97],
        builder: (ctx, scrollController) => _SheetBody(
          chrome: chrome,
          scrollController: scrollController,
          peerUserId: peerUserId,
          peerName: peerName,
          peerAvatarUrl: peerAvatarUrl,
          messages: messages,
          onJumpToMessage: (id) {
            Navigator.of(context).pop();
            onJumpToMessage(id);
          },
          onOpenMediaViewer: onOpenMediaViewer,
          bottomPadding: mq.padding.bottom,
        ),
      ),
    );
  }
}

/// Simple media item descriptor exposed publicly for the sheet callback.
class CdsMediaItem {
  const CdsMediaItem({required this.url, required this.isVideo});
  final String url;
  final bool isVideo;
}

// ─── Sheet body ──────────────────────────────────────────────────────────────

class _SheetBody extends StatefulWidget {
  const _SheetBody({
    required this.chrome,
    required this.scrollController,
    required this.peerUserId,
    required this.peerName,
    required this.peerAvatarUrl,
    required this.messages,
    required this.onJumpToMessage,
    required this.onOpenMediaViewer,
    required this.bottomPadding,
  });

  final MessagesChromePalette chrome;
  final ScrollController scrollController;
  final String peerUserId;
  final String peerName;
  final String? peerAvatarUrl;
  final List<DmMessage> messages;
  final void Function(String) onJumpToMessage;
  final void Function(List<CdsMediaItem>, int) onOpenMediaViewer;
  final double bottomPadding;

  @override
  State<_SheetBody> createState() => _SheetBodyState();
}

class _SheetBodyState extends State<_SheetBody>
    with SingleTickerProviderStateMixin {
  MessagesChromePalette get _c => widget.chrome;

  // ── tabs ─────────────────────────────────────────────────────────────
  late final TabController _tabController;
  static const _tabs = ['search', 'pinned', 'media', 'files'];

  // ── search ───────────────────────────────────────────────────────────
  final _searchCtrl = TextEditingController();
  List<DmMessage> _searchResults = [];
  bool _searching = false;
  Timer? _debounce;

  // ── pinned ───────────────────────────────────────────────────────────
  bool _pinnedLoading = false;
  List<DmMessage> _pinnedMessages = [];
  bool _pinnedLoaded = false;

  // ── media ────────────────────────────────────────────────────────────
  final _mediaPageSize = 20;
  int _mediaPage = 1;

  // ── files search ─────────────────────────────────────────────────────
  final _fileSearchCtrl = TextEditingController();
  String _fileQuery = '';

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: _tabs.length, vsync: this);
    _tabController.addListener(_onTabChange);
    _searchCtrl.addListener(_onSearchChanged);
    _fileSearchCtrl.addListener(
      () => setState(() => _fileQuery = _fileSearchCtrl.text),
    );
  }

  @override
  void dispose() {
    _tabController
      ..removeListener(_onTabChange)
      ..dispose();
    _debounce?.cancel();
    _searchCtrl.dispose();
    _fileSearchCtrl.dispose();
    super.dispose();
  }

  void _onTabChange() {
    if (!_tabController.indexIsChanging) {
      if (_tabs[_tabController.index] == 'pinned' && !_pinnedLoaded) {
        _loadPinned();
      }
      setState(() {});
    }
  }

  void _onSearchChanged() {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 280), _runSearch);
  }

  void _runSearch() {
    final q = _searchCtrl.text.trim().toLowerCase();
    if (q.isEmpty) {
      setState(() {
        _searchResults = [];
        _searching = false;
      });
      return;
    }
    setState(() {
      _searching = true;
      _searchResults = widget.messages
          .where((m) => m.content.toLowerCase().contains(q))
          .toList()
          .reversed
          .toList();
      _searching = false;
    });
  }

  Future<void> _loadPinned() async {
    setState(() => _pinnedLoading = true);
    try {
      final msgs = await DirectMessagesService.getPinnedMessages(
        widget.peerUserId,
      );
      if (mounted) setState(() => _pinnedMessages = msgs);
    } catch (_) {
    } finally {
      if (mounted) {
        setState(() {
          _pinnedLoading = false;
          _pinnedLoaded = true;
        });
      }
    }
  }

  // ── helpers ──────────────────────────────────────────────────────────

  String _t(String key, [Map<String, dynamic>? vars]) =>
      MessagesI18n.t(key, vars);

  String _cd(String key, [Map<String, dynamic>? vars]) =>
      _t('chat.conversationDetails.$key', vars);

  static String _normalizeUrl(String url) =>
      url.startsWith('http://') ? 'https://${url.substring(7)}' : url;

  List<CdsMediaItem> get _allMedia {
    final items = <CdsMediaItem>[];
    final seen = <String>{};
    for (final m in widget.messages) {
      final text = m.content.trim();
      if (text.startsWith('📷 [Image]:') || text.startsWith('🎬 [Video]:')) {
        final rawUrl = text.substring(text.indexOf(':') + 1).trim();
        final url = _normalizeUrl(rawUrl);
        if (seen.add(url)) {
          items.add(CdsMediaItem(url: url, isVideo: text.startsWith('🎬')));
        }
      }
      for (final att in m.attachments) {
        final url = _normalizeUrl(att.trim());
        if (url.isEmpty) continue;
        if (seen.add(url)) {
          final isVid = url.endsWith('.mp4') ||
              url.endsWith('.webm') ||
              url.endsWith('.mov');
          items.add(CdsMediaItem(url: url, isVideo: isVid));
        }
      }
    }
    return items;
  }

  List<CdsMediaItem> get _visibleMedia =>
      _allMedia.take(_mediaPage * _mediaPageSize).toList();

  /// Groups media by date label
  List<({String label, List<CdsMediaItem> items})> _groupMediaByDate(
    List<CdsMediaItem> items,
  ) {
    final map = <String, List<CdsMediaItem>>{};
    final messages = widget.messages;
    for (final item in items) {
      // Find the message date for this item
      DateTime? dt;
      for (final m in messages) {
        if (m.content.contains(item.url) ||
            m.attachments.any((a) => _normalizeUrl(a) == item.url)) {
          dt = m.createdAt;
          break;
        }
      }
      dt ??= DateTime.now();
      final label = _dateLabel(dt);
      map.putIfAbsent(label, () => []).add(item);
    }
    return map.entries
        .map((e) => (label: e.key, items: e.value))
        .toList();
  }

  String _dateLabel(DateTime dt) {
    final now = DateTime.now();
    final diff = now.difference(dt);
    if (diff.inDays == 0) return _cd('today');
    if (diff.inDays == 1) return _cd('yesterday');
    return '${dt.day}/${dt.month}/${dt.year}';
  }

  List<({String url, String name, DateTime ts})> get _allFiles {
    final items = <({String url, String name, DateTime ts})>[];
    final seen = <String>{};
    for (final m in widget.messages) {
      for (final att in m.attachments) {
        final url = _normalizeUrl(att.trim());
        if (url.isEmpty) continue;
        final isMedia = url.endsWith('.jpg') ||
            url.endsWith('.jpeg') ||
            url.endsWith('.png') ||
            url.endsWith('.gif') ||
            url.endsWith('.webp') ||
            url.endsWith('.mp4') ||
            url.endsWith('.webm') ||
            url.endsWith('.mov');
        if (!isMedia && seen.add(url)) {
          final name = Uri.tryParse(url)?.pathSegments.lastOrNull ?? url;
          items.add((url: url, name: name, ts: m.createdAt));
        }
      }
    }
    return items;
  }

  // ── build ─────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: _c.bg,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: Column(
        children: [
          // Handle
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 10),
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: _c.text.withValues(alpha: 0.3),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          // Avatar + name
          _buildHeader(),
          const SizedBox(height: 4),
          // Tabs
          _buildTabBar(),
          Divider(height: 1, thickness: 1, color: _c.border),
          // Tab views
          Expanded(
            child: TabBarView(
              controller: _tabController,
              children: [
                _buildSearchTab(),
                _buildPinnedTab(),
                _buildMediaTab(),
                _buildFilesTab(),
              ],
            ),
          ),
          SizedBox(height: widget.bottomPadding),
        ],
      ),
    );
  }

  Widget _buildHeader() {
    final initials = widget.peerName.isNotEmpty
        ? widget.peerName.trim()[0].toUpperCase()
        : '?';
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Row(
        children: [
          // Avatar
          Container(
            width: 52,
            height: 52,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: const Color(0xFF1B2A4A),
              image: (widget.peerAvatarUrl?.isNotEmpty == true)
                  ? DecorationImage(
                      image: NetworkImage(
                        _normalizeUrl(widget.peerAvatarUrl!),
                      ),
                      fit: BoxFit.cover,
                    )
                  : null,
            ),
            child: (widget.peerAvatarUrl?.isNotEmpty == true)
                ? null
                : Center(
                    child: Text(
                      initials,
                      style: TextStyle(
                        color: _c.text,
                        fontSize: 20,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  widget.peerName,
                  style: TextStyle(
                    color: _c.text,
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 3),
                Row(
                  children: [
                    Icon(
                      Icons.lock_outline_rounded,
                      size: 11,
                      color: const Color(0xFF4CAF50),
                    ),
                    const SizedBox(width: 4),
                    Text(
                      _cd('encrypted'),
                      style: const TextStyle(
                        color: Color(0xFF4CAF50),
                        fontSize: 11,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTabBar() {
    final labels = [
      _cd('search'),
      _cd('pinnedMessages'),
      _cd('sharedMedia'),
      _cd('sharedFiles'),
    ];
    return TabBar(
      controller: _tabController,
      labelColor: _c.accent,
      unselectedLabelColor: _c.text.withValues(alpha: 0.5),
      indicatorColor: _c.accent,
      indicatorSize: TabBarIndicatorSize.label,
      labelStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
      unselectedLabelStyle: const TextStyle(fontSize: 12),
      isScrollable: true,
      tabAlignment: TabAlignment.start,
      tabs: labels.map((l) => Tab(text: l)).toList(),
    );
  }

  // ── Search tab ────────────────────────────────────────────────────────

  Widget _buildSearchTab() {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 8),
          child: _SearchField(
            controller: _searchCtrl,
            hintText: _cd('searchPlaceholder'),
            textColor: _c.text,
            hintColor: _c.text.withValues(alpha: 0.4),
            borderColor: const Color(0xFF233358),
          ),
        ),
        Expanded(
          child: _searching
              ? const Center(child: CircularProgressIndicator())
              : _searchCtrl.text.trim().isEmpty
                  ? Center(
                      child: Text(
                        _cd('searchPlaceholder'),
                        style: TextStyle(
                          color: _c.text.withValues(alpha: 0.4),
                          fontSize: 13,
                        ),
                      ),
                    )
                  : _searchResults.isEmpty
                      ? Center(
                          child: Text(
                            _cd('noResults'),
                            style: TextStyle(
                              color: _c.text.withValues(alpha: 0.5),
                              fontSize: 13,
                            ),
                          ),
                        )
                      : ListView.separated(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 14,
                            vertical: 4,
                          ),
                          itemCount: _searchResults.length,
                          separatorBuilder: (_, __) =>
                              const Divider(height: 1, color: Color(0xFF1E2D4B)),
                          itemBuilder: (ctx, i) {
                            final m = _searchResults[i];
                            return _SearchResultTile(
                              message: m,
                              query: _searchCtrl.text.trim(),
                              textColor: _c.text,
                              onTap: () => widget.onJumpToMessage(m.id),
                            );
                          },
                        ),
        ),
      ],
    );
  }

  // ── Pinned tab ────────────────────────────────────────────────────────

  Widget _buildPinnedTab() {
    if (_pinnedLoading) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const CircularProgressIndicator(),
            const SizedBox(height: 10),
            Text(
              _cd('loading'),
              style: TextStyle(color: _c.text.withValues(alpha: 0.5)),
            ),
          ],
        ),
      );
    }
    if (_pinnedMessages.isEmpty) {
      return Center(
        child: Text(
          _cd('noPinned'),
          style: TextStyle(
            color: _c.text.withValues(alpha: 0.5),
            fontSize: 13,
          ),
        ),
      );
    }
    return ListView.separated(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
      itemCount: _pinnedMessages.length,
      separatorBuilder: (_, __) =>
          const Divider(height: 1, color: Color(0xFF1E2D4B)),
      itemBuilder: (ctx, i) {
        final m = _pinnedMessages[i];
        return _PinnedMessageTile(
          message: m,
          textColor: _c.text,
          onTap: () => widget.onJumpToMessage(m.id),
        );
      },
    );
  }

  // ── Media tab ─────────────────────────────────────────────────────────

  Widget _buildMediaTab() {
    final allMedia = _allMedia;
    final visible = _visibleMedia;
    final groups = _groupMediaByDate(visible);

    if (allMedia.isEmpty) {
      return Center(
        child: Text(
          _cd('noMedia'),
          style: TextStyle(
            color: _c.text.withValues(alpha: 0.5),
            fontSize: 13,
          ),
        ),
      );
    }

    return ListView(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
      children: [
        for (final group in groups) ...[
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Text(
              group.label,
              style: TextStyle(
                color: _c.text.withValues(alpha: 0.55),
                fontSize: 11,
                fontWeight: FontWeight.w600,
                letterSpacing: 0.5,
              ),
            ),
          ),
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 3,
              crossAxisSpacing: 4,
              mainAxisSpacing: 4,
            ),
            itemCount: group.items.length,
            itemBuilder: (ctx, i) {
              final item = group.items[i];
              final allItems = _allMedia;
              final idx = allItems.indexOf(item);
              return _MediaThumb(
                item: item,
                onTap: () => widget.onOpenMediaViewer(allItems, idx < 0 ? 0 : idx),
              );
            },
          ),
        ],
        if (visible.length < allMedia.length)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: TextButton(
              onPressed: () => setState(() => _mediaPage++),
              child: Text(
                _cd('loadMore', {
                  'n': '${allMedia.length - visible.length}',
                }),
                style: TextStyle(color: _c.accent),
              ),
            ),
          ),
      ],
    );
  }

  // ── Files tab ─────────────────────────────────────────────────────────

  Widget _buildFilesTab() {
    final allFiles = _allFiles;
    final filtered = _fileQuery.trim().isEmpty
        ? allFiles
        : allFiles
            .where((f) =>
                f.name.toLowerCase().contains(_fileQuery.toLowerCase()))
            .toList();

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 8),
          child: _SearchField(
            controller: _fileSearchCtrl,
            hintText: _cd('searchFiles'),
            textColor: _c.text,
            hintColor: _c.text.withValues(alpha: 0.4),
            borderColor: const Color(0xFF233358),
          ),
        ),
        Expanded(
          child: allFiles.isEmpty
              ? Center(
                  child: Text(
                    _cd('noFiles'),
                    style: TextStyle(
                      color: _c.text.withValues(alpha: 0.5),
                      fontSize: 13,
                    ),
                  ),
                )
              : filtered.isEmpty
                  ? Center(
                      child: Text(
                        _cd('noFilesFound'),
                        style: TextStyle(
                          color: _c.text.withValues(alpha: 0.5),
                          fontSize: 13,
                        ),
                      ),
                    )
                  : ListView.separated(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 14,
                        vertical: 4,
                      ),
                      itemCount: filtered.length,
                      separatorBuilder: (_, __) => const Divider(
                        height: 1,
                        color: Color(0xFF1E2D4B),
                      ),
                      itemBuilder: (ctx, i) {
                        final f = filtered[i];
                        return _FileTile(
                          file: f,
                          accentColor: _c.accent,
                          textColor: _c.text,
                        );
                      },
                    ),
        ),
      ],
    );
  }
}

// ─── Sub-widgets ─────────────────────────────────────────────────────────────

class _SearchField extends StatelessWidget {
  const _SearchField({
    required this.controller,
    required this.hintText,
    required this.textColor,
    required this.hintColor,
    required this.borderColor,
  });

  final TextEditingController controller;
  final String hintText;
  final Color textColor;
  final Color hintColor;
  final Color borderColor;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      style: TextStyle(color: textColor, fontSize: 14),
      decoration: InputDecoration(
        hintText: hintText,
        hintStyle: TextStyle(color: hintColor, fontSize: 13),
        prefixIcon: Icon(Icons.search_rounded, color: hintColor, size: 18),
        contentPadding: const EdgeInsets.symmetric(vertical: 10, horizontal: 12),
        filled: true,
        fillColor: const Color(0xFF0E1E3F),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: borderColor),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: borderColor),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: Color(0xFF3D63DD), width: 1.5),
        ),
      ),
    );
  }
}

class _SearchResultTile extends StatelessWidget {
  const _SearchResultTile({
    required this.message,
    required this.query,
    required this.textColor,
    required this.onTap,
  });

  final DmMessage message;
  final String query;
  final Color textColor;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final text = message.content;
    final q = query.toLowerCase();
    final lower = text.toLowerCase();
    final idx = lower.indexOf(q);

    final h = message.createdAt;
    final timeStr =
        '${h.hour.toString().padLeft(2, '0')}:${h.minute.toString().padLeft(2, '0')}';

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 10),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(Icons.chat_bubble_outline_rounded,
                size: 16, color: textColor.withValues(alpha: 0.4)),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  idx < 0
                      ? Text(
                          text,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(color: textColor, fontSize: 13),
                        )
                      : RichText(
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          text: TextSpan(
                            children: [
                              TextSpan(
                                text: text.substring(0, idx),
                                style: TextStyle(
                                    color: textColor, fontSize: 13),
                              ),
                              TextSpan(
                                text: text.substring(idx, idx + query.length),
                                style: TextStyle(
                                  color: textColor,
                                  fontSize: 13,
                                  backgroundColor:
                                      const Color(0xFF3D63DD).withValues(alpha: 0.35),
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                              TextSpan(
                                text: text.substring(idx + query.length),
                                style: TextStyle(
                                    color: textColor, fontSize: 13),
                              ),
                            ],
                          ),
                        ),
                  const SizedBox(height: 2),
                  Text(
                    timeStr,
                    style: TextStyle(
                      color: textColor.withValues(alpha: 0.4),
                      fontSize: 11,
                    ),
                  ),
                ],
              ),
            ),
            Icon(Icons.chevron_right_rounded,
                size: 16, color: textColor.withValues(alpha: 0.3)),
          ],
        ),
      ),
    );
  }
}

class _PinnedMessageTile extends StatelessWidget {
  const _PinnedMessageTile({
    required this.message,
    required this.textColor,
    required this.onTap,
  });

  final DmMessage message;
  final Color textColor;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final h = message.createdAt;
    final timeStr =
        '${h.day}/${h.month} ${h.hour.toString().padLeft(2, '0')}:${h.minute.toString().padLeft(2, '0')}';

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 10),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(Icons.push_pin_rounded,
                size: 14, color: const Color(0xFF3D63DD)),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    message.senderDisplayName ?? message.senderUsername ?? '—',
                    style: TextStyle(
                      color: const Color(0xFF3D63DD),
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    message.content.isEmpty ? '📎 Media' : message.content,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(color: textColor, fontSize: 13),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    timeStr,
                    style: TextStyle(
                      color: textColor.withValues(alpha: 0.4),
                      fontSize: 11,
                    ),
                  ),
                ],
              ),
            ),
            Icon(Icons.chevron_right_rounded,
                size: 16, color: textColor.withValues(alpha: 0.3)),
          ],
        ),
      ),
    );
  }
}

class _MediaThumb extends StatelessWidget {
  const _MediaThumb({required this.item, required this.onTap});

  final CdsMediaItem item;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(6),
        child: Stack(
          fit: StackFit.expand,
          children: [
            item.isVideo
                ? Container(
                    color: const Color(0xFF0E1E3F),
                    child: const Icon(
                      Icons.play_circle_filled_rounded,
                      color: Colors.white70,
                      size: 32,
                    ),
                  )
                : Image.network(
                    item.url,
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => Container(
                      color: const Color(0xFF0E1E3F),
                      child: const Icon(
                        Icons.broken_image_rounded,
                        color: Colors.white38,
                      ),
                    ),
                  ),
            if (item.isVideo)
              Positioned(
                bottom: 4,
                right: 4,
                child: Container(
                  padding: const EdgeInsets.all(2),
                  decoration: BoxDecoration(
                    color: Colors.black54,
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: const Icon(
                    Icons.videocam_rounded,
                    size: 12,
                    color: Colors.white,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _FileTile extends StatelessWidget {
  const _FileTile({
    required this.file,
    required this.accentColor,
    required this.textColor,
  });

  final ({String url, String name, DateTime ts}) file;
  final Color accentColor;
  final Color textColor;

  IconData _iconFor(String name) {
    final ext = name.split('.').lastOrNull?.toLowerCase() ?? '';
    if (['pdf'].contains(ext)) return Icons.picture_as_pdf_rounded;
    if (['doc', 'docx'].contains(ext)) return Icons.description_rounded;
    if (['xls', 'xlsx'].contains(ext)) return Icons.table_chart_rounded;
    if (['zip', 'rar', '7z'].contains(ext)) return Icons.folder_zip_rounded;
    return Icons.insert_drive_file_rounded;
  }

  @override
  Widget build(BuildContext context) {
    final h = file.ts;
    final dateStr = '${h.day}/${h.month}/${h.year}';

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: accentColor.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(_iconFor(file.name), size: 20, color: accentColor),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  file.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: textColor,
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                Text(
                  dateStr,
                  style: TextStyle(
                    color: textColor.withValues(alpha: 0.4),
                    fontSize: 11,
                  ),
                ),
              ],
            ),
          ),
          IconButton(
            icon: Icon(Icons.download_rounded, size: 18, color: accentColor),
            onPressed: () {
              // Open URL for download
              // launchUrl is called via url_launcher if needed; for now we just hint the browser
            },
            padding: EdgeInsets.zero,
            constraints: const BoxConstraints(minWidth: 36, minHeight: 36),
          ),
        ],
      ),
    );
  }
}
