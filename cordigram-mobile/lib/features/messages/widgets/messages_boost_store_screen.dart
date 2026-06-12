import 'dart:async';

import 'package:flutter/material.dart';

import '../../../core/services/accent_color_controller.dart';
import '../../../core/services/language_controller.dart';
import '../../../core/theme/messages_chrome_palette.dart';
import '../services/messages_boost_service.dart';
import '../services/messages_media_service.dart';
import '../utils/messages_boost_format.dart';
import '../utils/messages_navigator.dart';
import 'messages_boost_checkout_sheet.dart';
import 'messages_chrome_builder.dart';

/// Cửa hàng Boost Messages — tương đương view Boost trên web (sidebar DM, không chọn chat).
class MessagesBoostStoreScreen extends StatefulWidget {
  const MessagesBoostStoreScreen({super.key});

  static Future<void> open(BuildContext context) {
    return context.pushMessages(const MessagesBoostStoreScreen());
  }

  @override
  State<MessagesBoostStoreScreen> createState() =>
      _MessagesBoostStoreScreenState();
}

class _MessagesBoostStoreScreenState extends State<MessagesBoostStoreScreen> {
  MessagesBoostStatus _status = MessagesBoostStatus.empty;
  bool _loading = true;

  String _t(String key, [Map<String, dynamic>? vars]) =>
      LanguageController.instance.t(key, vars);

  @override
  void initState() {
    super.initState();
    unawaited(MessagesBoostFormat.ensureInitialized());
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final status = await MessagesBoostService.fetchStatus();
    await MessagesMediaService.refreshBoostStatus(force: true);
    if (!mounted) return;
    setState(() {
      _status = status;
      _loading = false;
    });
  }

  void _openCheckout(MessagesChromePalette chrome, BoostCheckoutMode mode) {
    MessagesBoostCheckoutSheet.show(
      context,
      mode: mode,
      status: _status,
      onCompleted: () async {
        await _load();
        await AccentColorController.instance.enforceBoostPolicy(
          boostUnlocked: MessagesMediaService.isBoostMediaOptimizationEnabled,
        );
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(_t('chat.boostStore.payment.successBody')),
            backgroundColor: chrome.accent.withValues(alpha: 0.85),
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return MessagesChromeBuilder(
      builder: (context, chrome) => Scaffold(
        backgroundColor: chrome.bg,
        appBar: AppBar(
          backgroundColor: chrome.bg,
          elevation: 0,
          scrolledUnderElevation: 0,
          surfaceTintColor: Colors.transparent,
          leading: IconButton(
            icon: Icon(Icons.close_rounded, color: chrome.text),
            onPressed: () => Navigator.of(context).pop(),
          ),
          title: Text(
            _t('chat.boostStore.tabs.store'),
            style: TextStyle(
              color: chrome.text,
              fontWeight: FontWeight.w800,
              fontSize: 17,
            ),
          ),
        ),
        body: _loading
            ? Center(child: CircularProgressIndicator(color: chrome.accent))
            : RefreshIndicator(
                color: chrome.accent,
                onRefresh: _load,
                child: ListView(
                  padding: EdgeInsets.fromLTRB(
                    16,
                    8,
                    16,
                    MediaQuery.paddingOf(context).bottom + 24,
                  ),
                  children: [
                    _heroCard(chrome),
                    const SizedBox(height: 20),
                    _perksSection(chrome),
                    const SizedBox(height: 24),
                    _primaryActions(chrome),
                  ],
                ),
              ),
      ),
    );
  }

  Widget _heroCard(MessagesChromePalette chrome) {
    final expires = _status.expiresAt;
    final tierLabel = _status.tier == 'basic'
        ? _t('chat.boostStore.plans.basic.name')
        : _status.tier == 'boost'
            ? _t('chat.boostStore.plans.boost.name')
            : null;

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: chrome.border),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color.lerp(chrome.surface, chrome.accent, 0.18)!,
            chrome.surface,
          ],
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (_status.active && expires != null)
            Container(
              margin: const EdgeInsets.only(bottom: 12),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: chrome.surfaceMuted,
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: chrome.border),
              ),
              child: Text(
                MessagesBoostFormat.expiresBadgeText(
                  expiresAt: expires,
                  tierLabel: tierLabel,
                ),
                style: TextStyle(
                  color: chrome.textMuted,
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ShaderMask(
            shaderCallback: (bounds) => LinearGradient(
              colors: [chrome.accent, chrome.accentHover],
            ).createShader(bounds),
            child: Text(
              _t('chat.boostStore.heroTitle'),
              style: TextStyle(
                color: chrome.text,
                fontSize: 26,
                fontWeight: FontWeight.w900,
                height: 1.1,
                letterSpacing: 0.3,
              ),
            ),
          ),
          const SizedBox(height: 10),
          Text(
            _t('chat.boostStore.app.heroSubtitle'),
            style: TextStyle(
              color: chrome.textMuted,
              fontSize: 14,
              height: 1.45,
            ),
          ),
        ],
      ),
    );
  }

  Widget _perksSection(MessagesChromePalette chrome) {
    final perks = [
      _t('chat.boostStore.plans.boost.feature1'),
      _t('chat.boostStore.plans.boost.feature4'),
      _t('chat.boostStore.plans.boost.feature5'),
      _t('chat.boostStore.plans.basic.feature2'),
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          _t('chat.boostStore.app.perksTitle'),
          style: TextStyle(
            color: chrome.textMuted,
            fontSize: 12,
            fontWeight: FontWeight.w800,
            letterSpacing: 0.5,
          ),
        ),
        const SizedBox(height: 10),
        ...perks.map(
          (p) => Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.star_rounded, size: 18, color: chrome.accent),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    p,
                    style: TextStyle(
                      color: chrome.text,
                      fontSize: 14,
                      height: 1.35,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _primaryActions(MessagesChromePalette chrome) {
    final renew = _status.active;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        FilledButton.icon(
          onPressed: () => _openCheckout(chrome, BoostCheckoutMode.subscribe),
          icon: Icon(Icons.rocket_launch_rounded, color: chrome.onAccent),
          label: Text(
            renew
                ? _t('chat.boostStore.buttons.renew')
                : _t('chat.boostStore.buttons.subscribe'),
          ),
          style: FilledButton.styleFrom(
            backgroundColor: chrome.accent,
            foregroundColor: chrome.onAccent,
            padding: const EdgeInsets.symmetric(vertical: 14),
            textStyle: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
          ),
        ),
        const SizedBox(height: 10),
        OutlinedButton.icon(
          onPressed: () => _openCheckout(chrome, BoostCheckoutMode.gift),
          icon: Icon(Icons.card_giftcard_rounded, color: chrome.text),
          label: Text(_t('chat.boostStore.buttons.gift')),
          style: OutlinedButton.styleFrom(
            foregroundColor: chrome.text,
            side: BorderSide(color: chrome.border),
            padding: const EdgeInsets.symmetric(vertical: 14),
            textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
          ),
        ),
      ],
    );
  }
}
