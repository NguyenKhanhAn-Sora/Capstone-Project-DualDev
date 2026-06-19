import 'package:flutter/material.dart';

import '../../../core/services/language_controller.dart';
import '../../../core/theme/messages_chrome_palette.dart';
import 'chat_expressions_host.dart';
import 'chat_kaomoji_data.dart';
import 'gif_toolbar_icon.dart';
import 'sticker_toolbar_icon.dart';

/// Hub chọn Emoji / Sticker / GIF / Kaomoji — một nút, điều hướng có nút quay lại.
class ChatExpressionsMenu {
  ChatExpressionsMenu._();

  static const _routeHub = '/expressions-hub';
  static const _routeUnicodeEmoji = '/expressions-unicode-emoji';
  static const _routeServerEmoji = '/expressions-server-emoji';
  static const _routeGif = '/expressions-gif';
  static const _routeGiphySticker = '/expressions-giphy-sticker';
  static const _routeServerSticker = '/expressions-server-sticker';
  static const _routeKaomoji = '/expressions-kaomoji';

  static String Function(String key)? _tOverride;

  static String t(String key) {
    final override = _tOverride;
    if (override != null) return override(key);
    return LanguageController.instance.t(key);
  }

  static String Function(String key) _serverTranslator({
    required bool configured,
    required String serverLang,
  }) {
    return (key) => LanguageController.instance.tForServerIfConfigured(
          configured: configured,
          serverLang: serverLang,
          key: key,
        );
  }

  /// Context của [showModalBottomSheet] — dùng để đóng sheet, không phải navigator chat.
  static BuildContext? _modalSheetContext;

  /// Đóng toàn bộ bottom sheet biểu cảm.
  static void closeSheet([BuildContext? context]) {
    final modal = _modalSheetContext;
    if (modal != null && modal.mounted) {
      Navigator.pop(modal);
      return;
    }
    final ctx = context;
    if (ctx != null && ctx.mounted && Navigator.of(ctx).canPop()) {
      Navigator.pop(ctx);
    }
  }

  static Widget sheetHeader({
    required BuildContext context,
    required MessagesChromePalette chrome,
    required String title,
    VoidCallback? onBack,
    bool showClose = true,
  }) {
    return Padding(
      padding: EdgeInsets.fromLTRB(onBack == null ? 16 : 4, 10, 8, 4),
      child: Row(
        children: [
          if (onBack != null)
            IconButton(
              padding: EdgeInsets.zero,
              constraints: const BoxConstraints(minWidth: 40, minHeight: 40),
              tooltip: t('chat.mediaPicker.backToCategories'),
              icon: Icon(Icons.arrow_back_rounded, color: chrome.text),
              onPressed: onBack,
            ),
          Expanded(
            child: Text(
              title,
              style: TextStyle(
                color: chrome.text,
                fontWeight: FontWeight.w700,
                fontSize: 16,
              ),
            ),
          ),
          if (showClose)
            IconButton(
              icon: Icon(Icons.close_rounded, color: chrome.textMuted),
              onPressed: closeSheet,
            ),
        ],
      ),
    );
  }

  static Future<void> show({
    required BuildContext context,
    required MessagesChromePalette chrome,
    required ChatExpressionsHost host,
    bool primaryLanguageConfigured = false,
    String serverLang = 'vi',
  }) {
    final innerNavKey = GlobalKey<NavigatorState>();
    _tOverride = _serverTranslator(
      configured: primaryLanguageConfigured,
      serverLang: serverLang,
    );

    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: chrome.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(14)),
      ),
      builder: (sheetCtx) {
        _modalSheetContext = sheetCtx;
        void popInnerRoute() {
          final nav = innerNavKey.currentState;
          if (nav != null && nav.canPop()) {
            nav.pop();
          }
        }

        return SafeArea(
          child: Navigator(
            key: innerNavKey,
            initialRoute: _routeHub,
            onGenerateRoute: (settings) {
              final routeName = settings.name ?? _routeHub;
              Widget child;
              switch (routeName) {
                case _routeUnicodeEmoji:
                  child = host.buildUnicodeEmoji(sheetCtx, popInnerRoute);
                  break;
                case _routeServerEmoji:
                  child = host.buildServerEmoji(sheetCtx, popInnerRoute);
                  break;
                case _routeGif:
                  child = host.buildGiphy(
                    sheetCtx,
                    popInnerRoute,
                    stickers: false,
                  );
                  break;
                case _routeGiphySticker:
                  child = host.buildGiphy(
                    sheetCtx,
                    popInnerRoute,
                    stickers: true,
                  );
                  break;
                case _routeServerSticker:
                  child = host.buildServerSticker(sheetCtx, popInnerRoute);
                  break;
                case _routeKaomoji:
                  child = _KaomojiPage(
                    chrome: chrome,
                    onBack: popInnerRoute,
                    onSelected: (text) {
                      host.onKaomojiSelected(text);
                      closeSheet();
                    },
                  );
                  break;
                case _routeHub:
                default:
                  child = _HubPage(
                    chrome: chrome,
                    onOpen: (route) {
                      innerNavKey.currentState?.pushNamed(route);
                    },
                  );
              }
              return MaterialPageRoute<void>(
                settings: settings,
                builder: (_) => child,
              );
            },
          ),
        );
      },
    ).whenComplete(() {
      _modalSheetContext = null;
      _tOverride = null;
    });
  }

  static Widget _tile({
    required MessagesChromePalette chrome,
    IconData? icon,
    Widget? iconWidget,
    required String label,
    required VoidCallback onTap,
  }) {
    return ListTile(
      leading: iconWidget ?? Icon(icon, color: chrome.textMuted),
      title: Text(
        label,
        style: TextStyle(
          color: chrome.text,
          fontWeight: FontWeight.w600,
        ),
      ),
      onTap: onTap,
    );
  }
}

class _HubPage extends StatelessWidget {
  const _HubPage({
    required this.chrome,
    required this.onOpen,
  });

  final MessagesChromePalette chrome;
  final void Function(String route) onOpen;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        ChatExpressionsMenu.sheetHeader(
          context: context,
          chrome: chrome,
          title: ChatExpressionsMenu.t('chat.mediaPicker.expressionsHub'),
        ),
        _HubTile(
          chrome: chrome,
          icon: Icons.tag_faces_rounded,
          label: ChatExpressionsMenu.t('chat.mediaPicker.tabEmoji'),
          route: ChatExpressionsMenu._routeUnicodeEmoji,
          onOpen: onOpen,
        ),
        _HubTile(
          chrome: chrome,
          icon: Icons.emoji_emotions_outlined,
          label: ChatExpressionsMenu.t('chat.mediaPicker.tabServerEmoji'),
          route: ChatExpressionsMenu._routeServerEmoji,
          onOpen: onOpen,
        ),
        _HubTile(
          chrome: chrome,
          iconWidget: const GifToolbarIcon(size: 22),
          label: 'GIF',
          route: ChatExpressionsMenu._routeGif,
          onOpen: onOpen,
        ),
        _HubTile(
          chrome: chrome,
          iconWidget: const GifToolbarIcon(size: 22),
          label: ChatExpressionsMenu.t('chat.mediaPicker.tabSticker'),
          route: ChatExpressionsMenu._routeGiphySticker,
          onOpen: onOpen,
        ),
        _HubTile(
          chrome: chrome,
          iconWidget: const StickerToolbarIcon(size: 22),
          label: ChatExpressionsMenu.t('chat.mediaPicker.tabServerSticker'),
          route: ChatExpressionsMenu._routeServerSticker,
          onOpen: onOpen,
        ),
        _HubTile(
          chrome: chrome,
          icon: Icons.emoji_symbols_outlined,
          label: ChatExpressionsMenu.t('chat.mediaPicker.tabKaomoji'),
          route: ChatExpressionsMenu._routeKaomoji,
          onOpen: onOpen,
        ),
        const SizedBox(height: 8),
      ],
    );
  }
}

class _HubTile extends StatelessWidget {
  const _HubTile({
    required this.chrome,
    this.icon,
    this.iconWidget,
    required this.label,
    required this.route,
    required this.onOpen,
  });

  final MessagesChromePalette chrome;
  final IconData? icon;
  final Widget? iconWidget;
  final String label;
  final String route;
  final void Function(String route) onOpen;

  @override
  Widget build(BuildContext context) {
    return ChatExpressionsMenu._tile(
      chrome: chrome,
      icon: icon,
      iconWidget: iconWidget,
      label: label,
      onTap: () => onOpen(route),
    );
  }
}

class _KaomojiPage extends StatelessWidget {
  const _KaomojiPage({
    required this.chrome,
    required this.onBack,
    required this.onSelected,
  });

  final MessagesChromePalette chrome;
  final VoidCallback onBack;
  final void Function(String text) onSelected;

  @override
  Widget build(BuildContext context) {
    final viewH = (MediaQuery.sizeOf(context).height * 0.42).clamp(260.0, 480.0);

    return SizedBox(
      height: viewH,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ChatExpressionsMenu.sheetHeader(
            context: context,
            chrome: chrome,
            title: ChatExpressionsMenu.t('chat.mediaPicker.tabKaomoji'),
            onBack: onBack,
          ),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 16),
              children: [
                for (final cat in chatKaomojiCategories) ...[
                  Text(
                    cat.label,
                    style: TextStyle(
                      color: chrome.textMuted,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      for (final k in cat.items)
                        Material(
                          color: chrome.surfaceMuted,
                          borderRadius: BorderRadius.circular(8),
                          child: InkWell(
                            borderRadius: BorderRadius.circular(8),
                            onTap: () => onSelected(k),
                            child: Padding(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 10,
                                vertical: 8,
                              ),
                              child: Text(
                                k,
                                style: TextStyle(
                                  color: chrome.text,
                                  fontSize: 16,
                                ),
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 16),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
