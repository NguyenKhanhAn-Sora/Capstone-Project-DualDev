import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/services/api_service.dart';
import 'ads_service.dart';

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
          _error = 'Payment session expired. Please create a new checkout.';
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
        _error = 'Failed to load payment status.';
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
      _error =
          'Verification timeout after 15 minutes. Payment is cancelled on app flow.';
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
    const bg = Color(0xFF0B1020);
    const card = Color(0xFF111827);
    const textPrimary = Color(0xFFE8ECF8);
    const textSecondary = Color(0xFF7A8BB0);
    const accent = Color(0xFF4AA3E4);

    return Scaffold(
      backgroundColor: bg,
      appBar: AppBar(
        backgroundColor: bg,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        iconTheme: const IconThemeData(color: textPrimary),
        title: const Text(
          'Payment status',
          style: TextStyle(color: textPrimary),
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
              border: Border.all(color: const Color(0xFF1E2D48)),
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
                          ? const Color(0xFFFF7A7A)
                          : accent,
                    ),
                    const SizedBox(width: 10),
                    Text(
                      _uiState == _PaymentUiState.success
                          ? 'Payment successful'
                          : _uiState == _PaymentUiState.failed
                          ? 'Payment failed'
                          : _uiState == _PaymentUiState.timedOut
                          ? 'Verification timed out'
                          : 'Checkout returned',
                      style: const TextStyle(
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
                      ? 'Your Stripe payment has been confirmed.'
                      : _uiState == _PaymentUiState.timedOut
                      ? 'No success signal was detected within 15 minutes. Returning to Ads...'
                      : 'We are verifying your Stripe payment. This can take a few seconds.',
                  style: const TextStyle(color: textSecondary, fontSize: 13),
                ),
                const SizedBox(height: 16),
                if (_uiState == _PaymentUiState.verifying)
                  const Center(
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
                      'Auto-cancel in: ${_formatRemaining(_remainingSeconds)}',
                      style: const TextStyle(
                        color: Color(0xFFFFCA7A),
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                if (_error != null)
                  Text(
                    _error!,
                    style: const TextStyle(color: Colors.redAccent),
                  ),
                if (_status != null) ...[
                  _DetailRow(label: 'Session ID', value: _status!.id),
                  _DetailRow(
                    label: 'Payment status',
                    value: _status!.paymentStatus ?? 'unknown',
                  ),
                  _DetailRow(
                    label: 'Amount',
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
                      foregroundColor: const Color(0xFF06162B),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                      padding: const EdgeInsets.symmetric(vertical: 13),
                    ),
                    child: Text(
                      _uiState == _PaymentUiState.verifying
                          ? 'Refresh status'
                          : _uiState == _PaymentUiState.success
                          ? 'Back to Ads Dashboard'
                          : 'Back to Ads',
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
