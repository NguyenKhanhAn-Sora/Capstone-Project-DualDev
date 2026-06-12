import 'package:emoji_picker_flutter/emoji_picker_flutter.dart';
import 'package:flutter/material.dart';

import '../../../core/config/app_config.dart';
import '../../../core/theme/messages_chrome_palette.dart';
import '../services/giphy_search_service.dart';
import '../services/server_media_service.dart';
import 'chat_expressions_host.dart';
import 'chat_expressions_menu.dart';

class ChannelChatExpressionsHost extends ChatExpressionsHost {
  ChannelChatExpressionsHost({
    required this.inputController,
    required this.chrome,
    required this.serverId,
    required this.serverEmojiMap,
    required this.chatBlocked,
    required this.onSendGiphy,
    required this.onSendServerSticker,
  });

  final TextEditingController inputController;
  final MessagesChromePalette chrome;
  final String serverId;
  final Map<String, String> serverEmojiMap;
  final bool chatBlocked;
  final Future<void> Function(GiphySearchItem item, bool stickers) onSendGiphy;
  final Future<void> Function(
    ServerStickerItem sticker,
    ServerStickerGroup group,
  ) onSendServerSticker;

  double _sheetHeight(BuildContext context) =>
      (MediaQuery.sizeOf(context).height * 0.55).clamp(320.0, 560.0);

  @override
  Widget buildUnicodeEmoji(BuildContext context, VoidCallback onBack) {
    final viewH = _sheetHeight(context);
    return SizedBox(
      height: viewH,
      child: Column(
        children: [
          ChatExpressionsMenu.sheetHeader(
            context: context,
            chrome: chrome,
            title: ChatExpressionsMenu.t('chat.mediaPicker.tabEmoji'),
            onBack: onBack,
          ),
          Expanded(
            child: EmojiPicker(
              textEditingController: inputController,
              onEmojiSelected: (_, __) {},
              config: Config(
                emojiViewConfig: EmojiViewConfig(
                  backgroundColor: chrome.surface,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget buildServerEmoji(BuildContext context, VoidCallback onBack) {
    final viewH = _sheetHeight(context);
    return SizedBox(
      height: viewH,
      child: Column(
        children: [
          ChatExpressionsMenu.sheetHeader(
            context: context,
            chrome: chrome,
            title: ChatExpressionsMenu.t('chat.mediaPicker.tabServerEmoji'),
            onBack: onBack,
          ),
          Expanded(
            child: FutureBuilder<List<ServerEmojiGroup>>(
              future: ServerMediaService.getEmojiPickerGroups(
                contextServerId: serverId,
              ),
              builder: (context, snap) {
                if (snap.connectionState != ConnectionState.done) {
                  return const Center(child: CircularProgressIndicator());
                }
                final groups = snap.data ?? const <ServerEmojiGroup>[];
                return ListView(
                  padding: const EdgeInsets.all(12),
                  children: [
                    for (final group in groups) ...[
                      Text(
                        group.serverName,
                        style: TextStyle(color: chrome.textMuted),
                      ),
                      const SizedBox(height: 6),
                      GridView.builder(
                        shrinkWrap: true,
                        physics: const NeverScrollableScrollPhysics(),
                        itemCount: group.emojis.length,
                        gridDelegate:
                            const SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: 6,
                          mainAxisSpacing: 6,
                          crossAxisSpacing: 6,
                        ),
                        itemBuilder: (_, index) {
                          final emoji = group.emojis[index];
                          return InkWell(
                            onTap: group.locked
                                ? null
                                : () {
                                    inputController.text += ':${emoji.name}:';
                                    inputController.selection =
                                        TextSelection.collapsed(
                                      offset: inputController.text.length,
                                    );
                                    serverEmojiMap[emoji.name.toLowerCase()] =
                                        emoji.imageUrl;
                                    ChatExpressionsMenu.closeSheet(context);
                                  },
                            child: Opacity(
                              opacity: group.locked ? 0.45 : 1,
                              child: Image.network(
                                emoji.imageUrl,
                                width: 24,
                                height: 24,
                              ),
                            ),
                          );
                        },
                      ),
                      const SizedBox(height: 12),
                    ],
                  ],
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget buildGiphy(
    BuildContext context,
    VoidCallback onBack, {
    required bool stickers,
  }) {
    if (chatBlocked) {
      return _blockedHeader(context, onBack, stickers);
    }
    return _ChannelGiphyExpressionsBody(
      chrome: chrome,
      stickers: stickers,
      onBack: onBack,
      sheetHeight: _sheetHeight(context),
      onPick: (item) async {
        ChatExpressionsMenu.closeSheet(context);
        await onSendGiphy(item, stickers);
      },
    );
  }

  @override
  Widget buildServerSticker(BuildContext context, VoidCallback onBack) {
    if (chatBlocked) {
      return _blockedHeader(
        context,
        onBack,
        false,
        title: ChatExpressionsMenu.t('chat.mediaPicker.tabServerSticker'),
      );
    }
    final viewH = _sheetHeight(context);
    return SizedBox(
      height: viewH,
      child: Column(
        children: [
          ChatExpressionsMenu.sheetHeader(
            context: context,
            chrome: chrome,
            title: ChatExpressionsMenu.t('chat.mediaPicker.tabServerSticker'),
            onBack: onBack,
          ),
          Expanded(
            child: FutureBuilder<List<ServerStickerGroup>>(
              future: ServerMediaService.getStickerPickerGroups(
                contextServerId: serverId,
              ),
              builder: (context, snap) {
                if (snap.connectionState != ConnectionState.done) {
                  return const Center(child: CircularProgressIndicator());
                }
                final groups = snap.data ?? const <ServerStickerGroup>[];
                return ListView(
                  padding: const EdgeInsets.all(12),
                  children: [
                    for (final group in groups) ...[
                      Text(
                        group.serverName,
                        style: TextStyle(color: chrome.textMuted),
                      ),
                      const SizedBox(height: 6),
                      GridView.builder(
                        shrinkWrap: true,
                        physics: const NeverScrollableScrollPhysics(),
                        itemCount: group.stickers.length,
                        gridDelegate:
                            const SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: 2,
                          mainAxisSpacing: 6,
                          crossAxisSpacing: 6,
                          childAspectRatio: 1.15,
                        ),
                        itemBuilder: (_, index) {
                          final sticker = group.stickers[index];
                          return InkWell(
                            onTap: group.locked
                                ? null
                                : () async {
                                    ChatExpressionsMenu.closeSheet(context);
                                    await onSendServerSticker(sticker, group);
                                  },
                            child: Opacity(
                              opacity: group.locked ? 0.45 : 1,
                              child: ClipRRect(
                                borderRadius: BorderRadius.circular(8),
                                child: Image.network(
                                  sticker.imageUrl,
                                  fit: BoxFit.cover,
                                ),
                              ),
                            ),
                          );
                        },
                      ),
                      const SizedBox(height: 12),
                    ],
                  ],
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _blockedHeader(
    BuildContext context,
    VoidCallback onBack,
    bool stickers, {
    String? title,
  }) {
    return SizedBox(
      height: 120,
      child: ChatExpressionsMenu.sheetHeader(
        context: context,
        chrome: chrome,
        title: title ??
            (stickers
                ? ChatExpressionsMenu.t('chat.mediaPicker.tabSticker')
                : 'GIF'),
        onBack: onBack,
      ),
    );
  }

  @override
  void onKaomojiSelected(String text) {
    inputController.text = '${inputController.text}$text';
    inputController.selection =
        TextSelection.collapsed(offset: inputController.text.length);
  }
}

class _ChannelGiphyExpressionsBody extends StatefulWidget {
  const _ChannelGiphyExpressionsBody({
    required this.chrome,
    required this.stickers,
    required this.onBack,
    required this.sheetHeight,
    required this.onPick,
  });

  final MessagesChromePalette chrome;
  final bool stickers;
  final VoidCallback onBack;
  final double sheetHeight;
  final Future<void> Function(GiphySearchItem item) onPick;

  @override
  State<_ChannelGiphyExpressionsBody> createState() =>
      _ChannelGiphyExpressionsBodyState();
}

class _ChannelGiphyExpressionsBodyState extends State<_ChannelGiphyExpressionsBody> {
  late final TextEditingController _searchCtrl;
  late Future<List<GiphySearchItem>> _itemsFuture;

  @override
  void initState() {
    super.initState();
    _searchCtrl = TextEditingController();
    _itemsFuture = widget.stickers
        ? GiphySearchService.trendingStickers()
        : GiphySearchService.trendingGifs();
    if (AppConfig.giphyApiKey.isEmpty) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Thiếu Giphy API key')),
        );
      });
    }
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final title = widget.stickers
        ? ChatExpressionsMenu.t('chat.mediaPicker.tabSticker')
        : 'GIF';
    return SizedBox(
      height: widget.sheetHeight,
      child: Column(
        children: [
          ChatExpressionsMenu.sheetHeader(
            context: context,
            chrome: widget.chrome,
            title: title,
            onBack: widget.onBack,
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 6),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _searchCtrl,
                    style: TextStyle(color: widget.chrome.text),
                    onSubmitted: (_) => _search(),
                  ),
                ),
                IconButton(
                  onPressed: _search,
                  icon: Icon(Icons.search, color: widget.chrome.text),
                ),
              ],
            ),
          ),
          Expanded(
            child: FutureBuilder<List<GiphySearchItem>>(
              future: _itemsFuture,
              builder: (context, snap) {
                if (snap.connectionState != ConnectionState.done) {
                  return const Center(child: CircularProgressIndicator());
                }
                final items = snap.data ?? const <GiphySearchItem>[];
                return GridView.builder(
                  padding: const EdgeInsets.all(8),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 2,
                    childAspectRatio: 1.1,
                    crossAxisSpacing: 6,
                    mainAxisSpacing: 6,
                  ),
                  itemCount: items.length,
                  itemBuilder: (_, i) {
                    final g = items[i];
                    return InkWell(
                      onTap: () => widget.onPick(g),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(8),
                        child: g.previewUrl.isEmpty
                            ? ColoredBox(color: widget.chrome.surfaceMuted)
                            : Image.network(g.previewUrl, fit: BoxFit.cover),
                      ),
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  void _search() {
    setState(() {
      _itemsFuture = widget.stickers
          ? GiphySearchService.searchStickers(_searchCtrl.text)
          : GiphySearchService.searchGifs(_searchCtrl.text);
    });
  }
}
