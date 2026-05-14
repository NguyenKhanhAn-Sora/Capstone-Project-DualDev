import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/config/app_theme.dart';
import '../../core/services/api_service.dart';
import '../../core/services/language_controller.dart';
import 'ads_service.dart';

AppSemanticColors _appTokens(BuildContext context) {
  final theme = Theme.of(context);
  return theme.extension<AppSemanticColors>() ??
      (theme.brightness == Brightness.dark
          ? AppSemanticColors.dark
          : AppSemanticColors.light);
}

class AdsPaymentStatusScreen extends StatefulWidget {
  const AdsPaymentStatusScreen({
    super.key,
    required this.sessionId,
    required this.checkoutStartedAtMs,
  });

  final String sessionId;
  final int checkoutStartedAtMs;

  @override
  State<AdsPaymentStatusScreen> createState() => _AdsPaymentStatusScreenState();
}

enum _PaymentUiState { verifying, success, failed, timedOut }

class _AdsPaymentStatusScreenState extends State<AdsPaymentStatusScreen> {
  static const Duration _maxVerifyWindow = Duration(minutes: 15);

  _PaymentUiState _uiState = _PaymentUiState.verifying;
  String? _error;
  CheckoutSessionResult? _status;
  Timer? _countdownTimer;
  Timer? _pollingTimer;
  int _remainingSeconds = 0;
  bool _returnScheduled = false;

  @override
  void initState() {
    super.initState();
    _remainingSeconds = _computeRemainingSeconds();
    if (_remainingSeconds <= 0) {
      _markTimedOutAndReturn();
      return;
    }
    _startCountdown();
    _startPolling();
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
    final remaining = deadline.difference(DateTime.now()).inSeconds;
    return remaining > 0 ? remaining : 0;
  }

  bool _isSuccess(CheckoutSessionResult result) {
    return result.paymentStatus == 'paid' ||
        result.paymentStatus == 'no_payment_required' ||
        result.status == 'complete';
  }

  bool _isHardFailure(CheckoutSessionResult result) {
    return result.status == 'expired';
  }

  void _startPolling() {
    _pollingTimer?.cancel();
    _pollingTimer = Timer.periodic(const Duration(seconds: 3), (_) {
      if (_uiState == _PaymentUiState.verifying) {
        _refreshStatus();
      }
    });
  }

  void _startCountdown() {
    _countdownTimer?.cancel();
    _countdownTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      if (_uiState != _PaymentUiState.verifying) return;

      final remaining = _computeRemainingSeconds();
      if (remaining <= 0) {
        _markTimedOutAndReturn();
        return;
      }

      setState(() {
        _remainingSeconds = remaining;
      });
    });
  }

  Future<void> _refreshStatus() async {
    try {
      final result = await AdsService.getCheckoutSessionStatus(
        widget.sessionId,
      );
      if (!mounted) return;

      if (_isSuccess(result)) {
        _pollingTimer?.cancel();
        _countdownTimer?.cancel();
        setState(() {
          _status = result;
          _uiState = _PaymentUiState.success;
          _error = null;
        });
        return;
      }

      if (_isHardFailure(result)) {
        _pollingTimer?.cancel();
        _countdownTimer?.cancel();
        setState(() {
          _status = result;
          _uiState = _PaymentUiState.failed;
          _error = LanguageController.instance.t('ads.payment.errorExpired');
        });
        return;
      }

      setState(() {
        _status = result;
        _uiState = _PaymentUiState.verifying;
        _error = null;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = LanguageController.instance.t('ads.payment.errorLoad');
      });
    }
  }

  void _markTimedOutAndReturn() {
    if (!mounted) return;
    _pollingTimer?.cancel();
    _countdownTimer?.cancel();
    setState(() {
      _remainingSeconds = 0;
      _uiState = _PaymentUiState.timedOut;
      _error = LanguageController.instance.t('ads.payment.errorTimeout');
    });

    if (_returnScheduled) return;
    _returnScheduled = true;
    Future<void>.delayed(const Duration(seconds: 2), () {
      if (!mounted) return;
      Navigator.of(context).pop(false);
    });
  }

  String _formatRemaining(int seconds) {
    final m = (seconds ~/ 60).toString().padLeft(2, '0');
    final s = (seconds % 60).toString().padLeft(2, '0');
    return '$m:$s';
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final tokens = _appTokens(context);
    final card = tokens.panelMuted;
    final textPrimary = tokens.text;
    final textSecondary = tokens.textMuted;
    final accent = tokens.primary;

    return Scaffold(
      backgroundColor: theme.scaffoldBackgroundColor,
      appBar: AppBar(
        backgroundColor: scheme.surface,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        iconTheme: IconThemeData(color: scheme.onSurface),
        title: Text(
          LanguageController.instance.t('ads.payment.appBar'),
          style: TextStyle(color: scheme.onSurface),
        ),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
          child: Container(
            width: double.infinity,
            decoration: BoxDecoration(
              color: card,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: tokens.panelBorder),
            ),
            padding: const EdgeInsets.fromLTRB(18, 20, 18, 20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(
                      _uiState == _PaymentUiState.success
                          ? Icons.verified_rounded
                          : _uiState == _PaymentUiState.failed ||
                                _uiState == _PaymentUiState.timedOut
                          ? Icons.error_outline_rounded
                          : Icons.check_circle_outline_rounded,
                      color: _uiState == _PaymentUiState.success
                          ? const Color(0xFF55D49C)
                          : _uiState == _PaymentUiState.failed ||
                                _uiState == _PaymentUiState.timedOut
                          ? scheme.error
                          : accent,
                    ),
                    const SizedBox(width: 10),
                    Text(
                      _uiState == _PaymentUiState.success
                          ? LanguageController.instance.t('ads.payment.titleSuccess')
                          : _uiState == _PaymentUiState.failed
                          ? LanguageController.instance.t('ads.payment.titleFailed')
                          : _uiState == _PaymentUiState.timedOut
                          ? LanguageController.instance.t('ads.payment.titleTimedOut')
                          : LanguageController.instance.t('ads.payment.titleVerifying'),
                      style: TextStyle(
                        color: textPrimary,
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  _uiState == _PaymentUiState.success
                      ? LanguageController.instance.t('ads.payment.subtitleSuccess')
                      : _uiState == _PaymentUiState.timedOut
                      ? LanguageController.instance.t('ads.payment.subtitleTimedOut')
                      : LanguageController.instance.t('ads.payment.subtitleVerifying'),
                  style: TextStyle(color: textSecondary, fontSize: 13),
                ),
                const SizedBox(height: 16),
                if (_uiState == _PaymentUiState.verifying)
                  Center(
                    child: Padding(
                      padding: EdgeInsets.symmetric(vertical: 12),
                      child: CircularProgressIndicator(
                        color: accent,
                        strokeWidth: 2,
                      ),
                    ),
                  ),
                if (_uiState == _PaymentUiState.verifying)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Text(
                      LanguageController.instance.t('ads.payment.autoCancel', {'time': _formatRemaining(_remainingSeconds)}),
                      style: const TextStyle(
                        color: Color(0xFFF4B35E),
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                if (_error != null)
                  Text(_error!, style: TextStyle(color: scheme.error)),
                if (_status != null) ...[
                  _DetailRow(label: LanguageController.instance.t('ads.payment.labelSessionId'), value: _status!.id),
                  _DetailRow(
                    label: LanguageController.instance.t('ads.payment.labelPaymentStatus'),
                    value: _status!.paymentStatus ?? 'unknown',
                  ),
                  _DetailRow(
                    label: LanguageController.instance.t('ads.payment.labelAmount'),
                    value:
                        '${(_status!.amountTotal ?? 0).toString()} ${(_status!.currency ?? '').toUpperCase()}',
                  ),
                ],
                const SizedBox(height: 18),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: _uiState == _PaymentUiState.verifying
                        ? _refreshStatus
                        : () => Navigator.of(
                            context,
                          ).pop(_uiState == _PaymentUiState.success),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: accent,
                      foregroundColor: scheme.onPrimary,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                      padding: const EdgeInsets.symmetric(vertical: 13),
                    ),
                    child: Text(
                      _uiState == _PaymentUiState.verifying
                          ? LanguageController.instance.t('ads.payment.btnRefresh')
                          : _uiState == _PaymentUiState.success
                          ? LanguageController.instance.t('ads.payment.btnBackDashboard')
                          : LanguageController.instance.t('ads.payment.btnBackAds'),
                      style: TextStyle(fontWeight: FontWeight.w700),
                    ),
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

class _DetailRow extends StatelessWidget {
  const _DetailRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 120,
            child: Text(
              label,
              style: const TextStyle(color: Color(0xFF7A8BB0), fontSize: 13),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(
                color: Color(0xFFE8ECF8),
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
