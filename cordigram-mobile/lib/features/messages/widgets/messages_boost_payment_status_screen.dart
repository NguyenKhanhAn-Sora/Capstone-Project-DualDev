import 'dart:async';

import 'package:flutter/material.dart';

import '../../../core/services/language_controller.dart';
import '../../ads/ads_service.dart';
import '../services/messages_boost_service.dart';
import '../services/messages_media_service.dart';
import 'messages_chrome_builder.dart';

class MessagesBoostPaymentStatusScreen extends StatefulWidget {
  const MessagesBoostPaymentStatusScreen({
    super.key,
    required this.sessionId,
    required this.checkoutStartedAtMs,
  });

  final String sessionId;
  final int checkoutStartedAtMs;

  @override
  State<MessagesBoostPaymentStatusScreen> createState() =>
      _MessagesBoostPaymentStatusScreenState();
}

enum _BoostPaymentUiState { verifying, success, failed, timedOut }

class _MessagesBoostPaymentStatusScreenState
    extends State<MessagesBoostPaymentStatusScreen> {
  static const Duration _maxVerifyWindow = Duration(minutes: 15);

  _BoostPaymentUiState _uiState = _BoostPaymentUiState.verifying;
  Timer? _countdownTimer;
  Timer? _pollingTimer;
  int _remainingSeconds = 0;

  String _t(String key, [Map<String, dynamic>? vars]) =>
      LanguageController.instance.t(key, vars);

  @override
  void initState() {
    super.initState();
    _remainingSeconds = _computeRemainingSeconds();
    if (_remainingSeconds <= 0) {
      _finish(false);
      return;
    }
    _startTimers();
    _refreshStatus();
  }

  @override
  void dispose() {
    _countdownTimer?.cancel();
    _pollingTimer?.cancel();
    super.dispose();
  }

  int _computeRemainingSeconds() {
    final startedAt = DateTime.fromMillisecondsSinceEpoch(
      widget.checkoutStartedAtMs,
    );
    final deadline = startedAt.add(_maxVerifyWindow);
    return deadline.difference(DateTime.now()).inSeconds.clamp(0, 9999);
  }

  bool _isSuccess(CheckoutSessionResult r) =>
      r.paymentStatus == 'paid' ||
      r.paymentStatus == 'no_payment_required' ||
      r.status == 'complete';

  void _startTimers() {
    _pollingTimer = Timer.periodic(const Duration(seconds: 3), (_) {
      if (_uiState == _BoostPaymentUiState.verifying) _refreshStatus();
    });
    _countdownTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted || _uiState != _BoostPaymentUiState.verifying) return;
      final remaining = _computeRemainingSeconds();
      if (remaining <= 0) {
        setState(() => _uiState = _BoostPaymentUiState.timedOut);
        _finish(false);
        return;
      }
      setState(() => _remainingSeconds = remaining);
    });
  }

  Future<void> _refreshStatus() async {
    try {
      final result = await MessagesBoostService.getCheckoutSessionStatus(
        widget.sessionId,
      );
      if (!mounted) return;
      if (_isSuccess(result)) {
        await MessagesMediaService.refreshBoostStatus(force: true);
        setState(() => _uiState = _BoostPaymentUiState.success);
        _finish(true);
      } else if (result.status == 'expired') {
        setState(() => _uiState = _BoostPaymentUiState.failed);
        _finish(false);
      }
    } catch (_) {}
  }

  void _finish(bool success) {
    _pollingTimer?.cancel();
    _countdownTimer?.cancel();
    Future<void>.delayed(const Duration(milliseconds: 900), () {
      if (mounted) Navigator.of(context).pop(success);
    });
  }

  @override
  Widget build(BuildContext context) {
    return MessagesChromeBuilder(
      builder: (context, chrome) {
        final title = switch (_uiState) {
          _BoostPaymentUiState.success =>
            _t('chat.boostStore.payment.successTitle'),
          _BoostPaymentUiState.failed ||
          _BoostPaymentUiState.timedOut =>
            _t('chat.boostStore.payment.failedTitle'),
          _ => _t('chat.boostStore.payment.verifyingTitle'),
        };
        final subtitle = switch (_uiState) {
          _BoostPaymentUiState.success =>
            _t('chat.boostStore.payment.successBody'),
          _BoostPaymentUiState.failed =>
            _t('chat.boostStore.payment.failedBody'),
          _BoostPaymentUiState.timedOut =>
            _t('chat.boostStore.payment.timeoutBody'),
          _ => _t('chat.boostStore.payment.verifyingBody'),
        };

        return Scaffold(
          backgroundColor: chrome.bg,
          appBar: AppBar(
            backgroundColor: chrome.bg,
            elevation: 0,
            title: Text(
              _t('chat.boostStore.tabs.store'),
              style: TextStyle(
                color: chrome.text,
                fontWeight: FontWeight.w800,
                fontSize: 17,
              ),
            ),
          ),
          body: Center(
            child: Padding(
              padding: const EdgeInsets.all(28),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (_uiState == _BoostPaymentUiState.verifying)
                    SizedBox(
                      width: 48,
                      height: 48,
                      child: CircularProgressIndicator(
                        strokeWidth: 3,
                        color: chrome.accent,
                      ),
                    )
                  else
                    Icon(
                      _uiState == _BoostPaymentUiState.success
                          ? Icons.check_circle_rounded
                          : Icons.error_outline_rounded,
                      size: 56,
                      color: _uiState == _BoostPaymentUiState.success
                          ? const Color(0xFF3BA55D)
                          : const Color(0xFFED4245),
                    ),
                  const SizedBox(height: 20),
                  Text(
                    title,
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: chrome.text,
                      fontSize: 20,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 10),
                  Text(
                    subtitle,
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: chrome.textMuted,
                      fontSize: 14,
                      height: 1.45,
                    ),
                  ),
                  if (_uiState == _BoostPaymentUiState.verifying) ...[
                    const SizedBox(height: 16),
                    Text(
                      _t(
                        'chat.boostStore.payment.countdown',
                        {'seconds': _remainingSeconds},
                      ),
                      style: TextStyle(
                        color: chrome.textMuted,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}
