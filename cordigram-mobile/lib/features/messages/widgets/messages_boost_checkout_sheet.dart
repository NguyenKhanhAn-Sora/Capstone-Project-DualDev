import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_web_auth_2/flutter_web_auth_2.dart';

import '../../../core/services/api_service.dart';
import '../../../core/services/accent_color_controller.dart';
import '../../../core/services/language_controller.dart';
import '../../../core/theme/messages_chrome_palette.dart';
import '../messages_shell.dart';
import '../services/messages_boost_service.dart';
import '../utils/messages_boost_format.dart';
import '../utils/messages_navigator.dart';
import 'messages_boost_payment_status_screen.dart';
import 'messages_chrome_builder.dart';

enum BoostCheckoutMode { subscribe, gift }

enum BoostCheckoutStep { plan, billing }

/// Bottom sheet: chọn gói → chu kỳ → Stripe (logic giống web messages).
class MessagesBoostCheckoutSheet extends StatefulWidget {
  const MessagesBoostCheckoutSheet({
    super.key,
    required this.initialMode,
    required this.status,
    required this.onCompleted,
  });

  final BoostCheckoutMode initialMode;
  final MessagesBoostStatus status;
  final VoidCallback onCompleted;

  static Future<void> show(
    BuildContext context, {
    required BoostCheckoutMode mode,
    required MessagesBoostStatus status,
    required VoidCallback onCompleted,
  }) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => MessagesBoostCheckoutSheet(
        initialMode: mode,
        status: status,
        onCompleted: onCompleted,
      ),
    );
  }

  @override
  State<MessagesBoostCheckoutSheet> createState() =>
      _MessagesBoostCheckoutSheetState();
}

class _MessagesBoostCheckoutSheetState extends State<MessagesBoostCheckoutSheet> {
  late BoostCheckoutMode _mode;
  BoostCheckoutStep _step = BoostCheckoutStep.plan;
  String _tier = 'boost';
  String _billingCycle = 'monthly';
  String? _recipientId;
  List<BoostGiftRecipient> _recipients = [];
  bool _loadingRecipients = false;
  bool _checkoutBusy = false;
  String _giftQuery = '';

  String _t(String key, [Map<String, dynamic>? vars]) =>
      LanguageController.instance.t(key, vars);

  @override
  void initState() {
    super.initState();
    unawaited(MessagesBoostFormat.ensureInitialized());
    _mode = widget.initialMode;
    final currentTier = widget.status.tier?.toLowerCase();
    _tier = currentTier == 'basic' ? 'basic' : 'boost';
    if (_mode == BoostCheckoutMode.gift) {
      _tier = 'boost';
      _loadRecipients();
    }
  }

  Future<void> _loadRecipients() async {
    setState(() => _loadingRecipients = true);
    try {
      final list = await MessagesBoostService.fetchGiftRecipients();
      if (mounted) setState(() => _recipients = list);
    } finally {
      if (mounted) setState(() => _loadingRecipients = false);
    }
  }

  String get _title => _step == BoostCheckoutStep.plan
      ? (_mode == BoostCheckoutMode.gift
          ? _t('chat.boostStore.modal.giftTitle')
          : _t('chat.boostStore.modal.planTitle'))
      : _t('chat.boostStore.modal.billingTitle');

  Future<bool> _confirmActivePeriod(MessagesChromePalette chrome) async {
    if (_mode != BoostCheckoutMode.subscribe) return true;
    if (!widget.status.active || widget.status.expiresAt == null) return true;
    final body = MessagesBoostFormat.activePeriodWarningBody(
      widget.status.expiresAt!,
    );
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: chrome.surface,
        title: Text(
          _t('chat.boostStore.warnings.activeTitle'),
          style: TextStyle(
            color: chrome.text,
            fontWeight: FontWeight.w800,
          ),
        ),
        content: Text(
          body,
          style: TextStyle(color: chrome.textMuted, height: 1.45),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text(
              _t('chat.boostStore.actions.abort'),
              style: TextStyle(color: chrome.textMuted),
            ),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(
              backgroundColor: chrome.accent,
              foregroundColor: chrome.onAccent,
            ),
            child: Text(_t('chat.boostStore.actions.continue')),
          ),
        ],
      ),
    );
    return ok == true;
  }

  Future<bool> _confirmTierSwitch(MessagesChromePalette chrome) async {
    if (_mode != BoostCheckoutMode.subscribe) return true;
    if (!widget.status.active || widget.status.tier == null) return true;
    if (widget.status.tier == _tier) return true;
    final currentLabel = widget.status.tier == 'basic'
        ? _t('chat.boostStore.plans.basic.name')
        : _t('chat.boostStore.plans.boost.name');
    final nextLabel = _tier == 'basic'
        ? _t('chat.boostStore.plans.basic.name')
        : _t('chat.boostStore.plans.boost.name');
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: chrome.surface,
        title: Text(
          _t('chat.boostStore.warnings.switchTitle'),
          style: TextStyle(
            color: chrome.text,
            fontWeight: FontWeight.w800,
          ),
        ),
        content: Text(
          '${_t('chat.boostStore.warnings.switchBodyPrefix')} $currentLabel ${_t('chat.boostStore.warnings.switchBodyMiddle')} $nextLabel. ${_t('chat.boostStore.warnings.switchBodySuffix')} ${_t('chat.boostStore.warnings.switchBodyStrong')}.',
          style: TextStyle(color: chrome.textMuted, height: 1.45),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text(
              _t('chat.boostStore.actions.abort'),
              style: TextStyle(color: chrome.textMuted),
            ),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(
              backgroundColor: chrome.accent,
              foregroundColor: chrome.onAccent,
            ),
            child: Text(_t('chat.boostStore.checkout.cta')),
          ),
        ],
      ),
    );
    return ok == true;
  }

  Future<void> _goToBilling(MessagesChromePalette chrome) async {
    if (_mode == BoostCheckoutMode.gift && (_recipientId ?? '').isEmpty) {
      return;
    }
    if (!await _confirmActivePeriod(chrome)) return;
    setState(() => _step = BoostCheckoutStep.billing);
  }

  Future<void> _submitCheckout(MessagesChromePalette chrome) async {
    if (!await _confirmTierSwitch(chrome)) return;
    setState(() => _checkoutBusy = true);
    try {
      final session = await MessagesBoostService.createCheckoutSession(
        actionType:
            _mode == BoostCheckoutMode.gift ? 'boost_gift' : 'boost_subscribe',
        boostTier: _tier,
        billingCycle: _billingCycle,
        recipientUserId: _recipientId,
      );
      final url = (session.url ?? '').trim();
      if (url.isEmpty || session.id.isEmpty) {
        throw const ApiException('Checkout URL missing');
      }
      final startedAt = DateTime.now().millisecondsSinceEpoch;
      final navContext =
          MessagesShell.navigatorKey.currentContext ?? context;
      if (!mounted) return;
      Navigator.of(context).pop();

      final callbackUrl = await FlutterWebAuth2.authenticate(
        url: url,
        callbackUrlScheme: 'cordigram',
      );
      if (callbackUrl.isEmpty) return;
      if (!navContext.mounted) return;

      final success = await navContext.pushMessages<bool>(
        MessagesBoostPaymentStatusScreen(
          sessionId: session.id,
          checkoutStartedAtMs: startedAt,
        ),
      );
      if (success == true) {
        await AccentColorController.instance.enforceBoostPolicy(
          boostUnlocked: true,
        );
        widget.onCompleted();
      }
    } on ApiException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.message)),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('$e')),
        );
      }
    } finally {
      if (mounted) setState(() => _checkoutBusy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return MessagesChromeBuilder(
      builder: (context, chrome) {
        final bottom = MediaQuery.paddingOf(context).bottom;
        final maxH = MediaQuery.sizeOf(context).height * 0.92;
        final handleColor = chrome.textMuted.withValues(alpha: 0.35);

        return Container(
          constraints: BoxConstraints(maxHeight: maxH),
          decoration: BoxDecoration(
            color: chrome.bg,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
            border: Border(top: BorderSide(color: chrome.border)),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: 10),
              Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: handleColor,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 8, 8),
                child: Row(
                  children: [
                    if (_step == BoostCheckoutStep.billing)
                      IconButton(
                        icon: Icon(Icons.arrow_back_rounded, color: chrome.text),
                        onPressed: () =>
                            setState(() => _step = BoostCheckoutStep.plan),
                      ),
                    Expanded(
                      child: Text(
                        _title,
                        style: TextStyle(
                          color: chrome.text,
                          fontSize: 18,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                    IconButton(
                      icon: Icon(Icons.close_rounded, color: chrome.textMuted),
                      onPressed: () => Navigator.pop(context),
                    ),
                  ],
                ),
              ),
              Flexible(
                child: SingleChildScrollView(
                  padding: EdgeInsets.fromLTRB(16, 0, 16, bottom + 16),
                  child: _step == BoostCheckoutStep.plan
                      ? _buildPlanStep(chrome)
                      : _buildBillingStep(chrome),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildPlanStep(MessagesChromePalette chrome) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _planCard(
          chrome: chrome,
          tier: 'boost',
          name: _t('chat.boostStore.plans.boost.name'),
          price: _t('chat.boostStore.plans.boost.priceMonthly'),
          features: [
            _t('chat.boostStore.plans.boost.feature1'),
            _t('chat.boostStore.plans.boost.feature2'),
            _t('chat.boostStore.plans.boost.feature3'),
            _t('chat.boostStore.plans.boost.feature4'),
            _t('chat.boostStore.plans.boost.feature5'),
          ],
        ),
        const SizedBox(height: 10),
        _planCard(
          chrome: chrome,
          tier: 'basic',
          name: _t('chat.boostStore.plans.basic.name'),
          price: _t('chat.boostStore.plans.basic.priceMonthly'),
          features: [
            _t('chat.boostStore.plans.basic.feature1'),
            _t('chat.boostStore.plans.basic.feature2'),
            _t('chat.boostStore.plans.basic.feature3'),
          ],
        ),
        if (_mode == BoostCheckoutMode.gift) ...[
          const SizedBox(height: 16),
          TextField(
            style: TextStyle(color: chrome.text),
            decoration: InputDecoration(
              hintText: _t('chat.boostStore.giftSearchPlaceholder'),
              hintStyle: TextStyle(color: chrome.textMuted),
              filled: true,
              fillColor: chrome.chatInput,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: chrome.border),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: chrome.border),
              ),
            ),
            onChanged: (v) => setState(() => _giftQuery = v.trim().toLowerCase()),
          ),
          const SizedBox(height: 8),
          if (_loadingRecipients)
            Padding(
              padding: const EdgeInsets.all(20),
              child: Center(
                child: CircularProgressIndicator(color: chrome.accent),
              ),
            )
          else
            ..._filteredRecipients().map((u) => _recipientTile(chrome, u)),
        ],
        const SizedBox(height: 16),
        Row(
          children: [
            Expanded(
              child: OutlinedButton(
                onPressed: () => Navigator.pop(context),
                style: OutlinedButton.styleFrom(
                  foregroundColor: chrome.text,
                  side: BorderSide(color: chrome.border),
                ),
                child: Text(_t('chat.boostStore.actions.cancel')),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              flex: 2,
              child: FilledButton(
                onPressed: (_mode == BoostCheckoutMode.gift &&
                        (_recipientId ?? '').isEmpty)
                    ? null
                    : () => _goToBilling(chrome),
                style: FilledButton.styleFrom(
                  backgroundColor: chrome.accent,
                  foregroundColor: chrome.onAccent,
                  disabledBackgroundColor: chrome.accent.withValues(alpha: 0.35),
                ),
                child: Text(_t('chat.boostStore.actions.continue')),
              ),
            ),
          ],
        ),
      ],
    );
  }

  List<BoostGiftRecipient> _filteredRecipients() {
    if (_giftQuery.isEmpty) return _recipients.take(40).toList();
    return _recipients
        .where((u) {
          return u.displayName.toLowerCase().contains(_giftQuery) ||
              u.username.toLowerCase().contains(_giftQuery);
        })
        .take(40)
        .toList();
  }

  Widget _recipientTile(MessagesChromePalette chrome, BoostGiftRecipient u) {
    final active = u.userId == _recipientId;
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Material(
        color: active ? chrome.panelHover : chrome.surface,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: () => setState(() => _recipientId = u.userId),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            child: Row(
              children: [
                CircleAvatar(
                  radius: 18,
                  backgroundColor: chrome.surfaceMuted,
                  child: Text(
                    u.displayName.isNotEmpty
                        ? u.displayName.substring(0, 1).toUpperCase()
                        : '?',
                    style: TextStyle(
                      color: chrome.text,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        u.displayName,
                        style: TextStyle(
                          color: chrome.text,
                          fontWeight: FontWeight.w600,
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
                      if (u.username.isNotEmpty)
                        Text(
                          '@${u.username}',
                          style: TextStyle(
                            color: chrome.textMuted,
                            fontSize: 12,
                          ),
                        ),
                    ],
                  ),
                ),
                if (active)
                  Icon(Icons.check_circle_rounded, color: chrome.accent),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _planCard({
    required MessagesChromePalette chrome,
    required String tier,
    required String name,
    required String price,
    required List<String> features,
  }) {
    final selected = _tier == tier;
    return Material(
      color: chrome.surface,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: () => setState(() => _tier = tier),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: selected ? chrome.accent : chrome.border,
              width: selected ? 2 : 1,
            ),
            gradient: selected
                ? LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [
                      chrome.accentSoft.withValues(alpha: 0.35),
                      chrome.surface,
                    ],
                  )
                : null,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                name,
                style: TextStyle(
                  color: chrome.text,
                  fontSize: 22,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                price,
                style: TextStyle(color: chrome.textMuted, fontSize: 13),
              ),
              const SizedBox(height: 8),
              ...features.map(
                (f) => Padding(
                  padding: const EdgeInsets.only(bottom: 4),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('• ', style: TextStyle(color: chrome.textMuted)),
                      Expanded(
                        child: Text(
                          f,
                          style: TextStyle(
                            color: chrome.text,
                            fontSize: 12,
                            height: 1.35,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildBillingStep(MessagesChromePalette chrome) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _billingCard(
          chrome: chrome,
          cycle: 'monthly',
          title: _t('chat.boostStore.billing.monthlyTitle'),
          subtitle: _t('chat.boostStore.billing.monthlySubtitle'),
        ),
        const SizedBox(height: 10),
        _billingCard(
          chrome: chrome,
          cycle: 'yearly',
          title: _t('chat.boostStore.billing.yearlyTitle'),
          subtitle: _t('chat.boostStore.billing.yearlySubtitle'),
        ),
        const SizedBox(height: 16),
        Row(
          children: [
            Expanded(
              child: OutlinedButton(
                onPressed: _checkoutBusy
                    ? null
                    : () => setState(() => _step = BoostCheckoutStep.plan),
                style: OutlinedButton.styleFrom(
                  foregroundColor: chrome.text,
                  side: BorderSide(color: chrome.border),
                ),
                child: Text(_t('chat.boostStore.actions.back')),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              flex: 2,
              child: FilledButton(
                onPressed: _checkoutBusy ? null : () => _submitCheckout(chrome),
                style: FilledButton.styleFrom(
                  backgroundColor: chrome.accent,
                  foregroundColor: chrome.onAccent,
                  disabledBackgroundColor: chrome.accent.withValues(alpha: 0.35),
                ),
                child: _checkoutBusy
                    ? Text(_t('chat.boostStore.checkout.redirecting'))
                    : Text(_t('chat.boostStore.checkout.cta')),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _billingCard({
    required MessagesChromePalette chrome,
    required String cycle,
    required String title,
    required String subtitle,
  }) {
    final selected = _billingCycle == cycle;
    return Material(
      color: chrome.surface,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: () => setState(() => _billingCycle = cycle),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: selected ? chrome.accent : chrome.border,
              width: selected ? 2 : 1,
            ),
            gradient: selected
                ? LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [
                      chrome.accentSoft.withValues(alpha: 0.35),
                      chrome.surface,
                    ],
                  )
                : null,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: TextStyle(
                  color: chrome.text,
                  fontSize: 20,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                subtitle,
                style: TextStyle(color: chrome.textMuted, fontSize: 13),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
