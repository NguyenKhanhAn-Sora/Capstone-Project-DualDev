import 'dart:async';
import 'package:flutter/material.dart';
import '../../core/services/api_service.dart';
import '../../core/services/language_controller.dart';
import 'login_screen.dart';

// Password must be ≥8 chars, contain at least one letter and one digit.
String? _validatePassword(String? v) {
  final s = (v ?? '').trim();
  if (s.isEmpty) return 'Password is required';
  if (s.length < 8) return 'At least 8 characters';
  if (!RegExp(r'[a-zA-Z]').hasMatch(s))
    return 'Must contain at least one letter';
  if (!RegExp(r'[0-9]').hasMatch(s)) return 'Must contain at least one number';
  return null;
}

class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  // ── state ──
  int _step = 0; // 0=email, 1=otp, 2=reset
  bool _loading = false;
  String _error = '';

  // ── step 0 – email ──
  final _emailFormKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();

  // ── step 1 – OTP ──
  final _otpFormKey = GlobalKey<FormState>();
  final _otpController = TextEditingController();
  int _cooldown = 0;
  Timer? _cooldownTimer;

  // ── step 2 – new password ──
  final _resetFormKey = GlobalKey<FormState>();
  final _newPasswordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();
  bool _showNew = false;
  bool _showConfirm = false;

  @override
  void dispose() {
    _emailController.dispose();
    _otpController.dispose();
    _newPasswordController.dispose();
    _confirmPasswordController.dispose();
    _cooldownTimer?.cancel();
    super.dispose();
  }

  // ── cooldown timer ──
  void _startCooldown() {
    _cooldownTimer?.cancel();
    setState(() => _cooldown = 60);
    _cooldownTimer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (_cooldown <= 1) {
        t.cancel();
        setState(() => _cooldown = 0);
      } else {
        setState(() => _cooldown--);
      }
    });
  }

  // ── POST /auth/password/forgot ──
  Future<void> _sendOtp() async {
    if (!(_emailFormKey.currentState?.validate() ?? false)) return;
    setState(() {
      _loading = true;
      _error = '';
    });
    try {
      await ApiService.post(
        '/auth/password/forgot',
        body: {'email': _emailController.text.trim().toLowerCase()},
      );
      _startCooldown();
      setState(() {
        _step = 1;
        _loading = false;
      });
    } on ApiException catch (e) {
      setState(() {
        _error = e.message;
        _loading = false;
      });
    } catch (_) {
      setState(() {
        _error = 'Could not connect. Please try again.';
        _loading = false;
      });
    }
  }

  // resend (same endpoint)
  Future<void> _resendOtp() async {
    if (_cooldown > 0 || _loading) return;
    setState(() {
      _loading = true;
      _error = '';
    });
    try {
      await ApiService.post(
        '/auth/password/forgot',
        body: {'email': _emailController.text.trim().toLowerCase()},
      );
      _startCooldown();
      setState(() {
        _loading = false;
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(LanguageController.instance.t('auth.forgotPassword.otpResent'))),
        );
      }
    } on ApiException catch (e) {
      setState(() {
        _error = e.message;
        _loading = false;
      });
    } catch (_) {
      setState(() {
        _error = 'Could not connect. Please try again.';
        _loading = false;
      });
    }
  }

  // ── POST /auth/password/verify ──
  Future<void> _verifyOtp() async {
    if (!(_otpFormKey.currentState?.validate() ?? false)) return;
    setState(() {
      _loading = true;
      _error = '';
    });
    try {
      await ApiService.post(
        '/auth/password/verify',
        body: {
          'email': _emailController.text.trim().toLowerCase(),
          'otp': _otpController.text.trim(),
        },
      );
      setState(() {
        _step = 2;
        _loading = false;
      });
    } on ApiException catch (e) {
      setState(() {
        _error = e.message;
        _loading = false;
      });
    } catch (_) {
      setState(() {
        _error = 'Could not connect. Please try again.';
        _loading = false;
      });
    }
  }

  // ── POST /auth/password/reset ──
  Future<void> _resetPassword() async {
    if (!(_resetFormKey.currentState?.validate() ?? false)) return;
    setState(() {
      _loading = true;
      _error = '';
    });
    try {
      await ApiService.post(
        '/auth/password/reset',
        body: {
          'email': _emailController.text.trim().toLowerCase(),
          'otp': _otpController.text.trim(),
          'newPassword': _newPasswordController.text.trim(),
        },
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Password updated! Please sign in.')),
      );
      Navigator.of(
        context,
      ).pushReplacement(MaterialPageRoute(builder: (_) => const LoginScreen()));
    } on ApiException catch (e) {
      setState(() {
        _error = e.message;
        _loading = false;
      });
    } catch (_) {
      setState(() {
        _error = 'Could not connect. Please try again.';
        _loading = false;
      });
    }
  }

  // ── shared widgets ──
  Widget _errorBanner() => _error.isEmpty
      ? const SizedBox.shrink()
      : Container(
          width: double.infinity,
          margin: const EdgeInsets.only(bottom: 14),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
            color: Colors.red.shade50,
            border: Border.all(color: Colors.red.shade200),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Text(
            _error,
            style: TextStyle(color: Colors.red.shade700, fontSize: 13),
          ),
        );

  InputDecoration _fieldDecoration({
    required String label,
    required String hint,
    required IconData icon,
    Widget? suffix,
  }) => InputDecoration(
    labelText: label,
    hintText: hint,
    prefixIcon: Icon(icon, size: 20),
    suffixIcon: suffix,
    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
    contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
  );

  // ─────────── STEPS ───────────

  Widget _buildEmailStep() => Form(
    key: _emailFormKey,
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Enter the email address associated with your account and we will send you a one-time verification code.',
          style: TextStyle(fontSize: 14, color: Color(0xFF6B7280)),
        ),
        const SizedBox(height: 20),
        _errorBanner(),
        TextFormField(
          controller: _emailController,
          decoration: _fieldDecoration(
            label: 'Email',
            hint: 'you@example.com',
            icon: Icons.email_outlined,
          ),
          keyboardType: TextInputType.emailAddress,
          textInputAction: TextInputAction.done,
          onFieldSubmitted: (_) => _sendOtp(),
          validator: (v) {
            final s = (v ?? '').trim();
            if (s.isEmpty) return 'Email is required';
            if (!RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(s)) {
              return 'Enter a valid email';
            }
            return null;
          },
        ),
        const SizedBox(height: 20),
        SizedBox(
          width: double.infinity,
          height: 50,
          child: FilledButton(
            onPressed: _loading ? null : _sendOtp,
            style: FilledButton.styleFrom(
              backgroundColor: const Color(0xFF3470A2),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14),
              ),
            ),
            child: _loading
                ? const SizedBox(
                    width: 22,
                    height: 22,
                    child: CircularProgressIndicator(
                      strokeWidth: 2.5,
                      valueColor: AlwaysStoppedAnimation(Colors.white),
                    ),
                  )
                : const Text(
                    'Send verification code',
                    style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
                  ),
          ),
        ),
      ],
    ),
  );

  Widget _buildOtpStep() => Form(
    key: _otpFormKey,
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        RichText(
          text: TextSpan(
            style: const TextStyle(fontSize: 14, color: Color(0xFF6B7280)),
            children: [
              const TextSpan(text: 'We sent a 6-digit code to '),
              TextSpan(
                text: _emailController.text.trim(),
                style: const TextStyle(
                  fontWeight: FontWeight.w600,
                  color: Color(0xFF1F2937),
                ),
              ),
              const TextSpan(text: '. It expires in 5 minutes.'),
            ],
          ),
        ),
        const SizedBox(height: 20),
        _errorBanner(),
        TextFormField(
          controller: _otpController,
          decoration: _fieldDecoration(
            label: 'Verification code',
            hint: '6-digit code',
            icon: Icons.lock_outline_rounded,
          ),
          keyboardType: TextInputType.number,
          textInputAction: TextInputAction.done,
          onFieldSubmitted: (_) => _verifyOtp(),
          validator: (v) {
            if ((v ?? '').trim().isEmpty) return 'Code is required';
            return null;
          },
        ),
        const SizedBox(height: 12),
        // Resend row
        Row(
          mainAxisAlignment: MainAxisAlignment.end,
          children: [
            if (_cooldown > 0)
              Text(
                'Resend in ${_cooldown}s',
                style: const TextStyle(fontSize: 13, color: Color(0xFF6B7280)),
              )
            else
              TextButton(
                onPressed: _loading ? null : _resendOtp,
                style: TextButton.styleFrom(
                  padding: EdgeInsets.zero,
                  minimumSize: Size.zero,
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
                child: const Text('Resend code'),
              ),
          ],
        ),
        const SizedBox(height: 20),
        SizedBox(
          width: double.infinity,
          height: 50,
          child: FilledButton(
            onPressed: _loading ? null : _verifyOtp,
            style: FilledButton.styleFrom(
              backgroundColor: const Color(0xFF3470A2),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14),
              ),
            ),
            child: _loading
                ? const SizedBox(
                    width: 22,
                    height: 22,
                    child: CircularProgressIndicator(
                      strokeWidth: 2.5,
                      valueColor: AlwaysStoppedAnimation(Colors.white),
                    ),
                  )
                : const Text(
                    'Verify code',
                    style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
                  ),
          ),
        ),
      ],
    ),
  );

  Widget _buildResetStep() => Form(
    key: _resetFormKey,
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Choose a new password. It must be at least 8 characters and contain both letters and numbers.',
          style: TextStyle(fontSize: 14, color: Color(0xFF6B7280)),
        ),
        const SizedBox(height: 20),
        _errorBanner(),
        TextFormField(
          controller: _newPasswordController,
          obscureText: !_showNew,
          decoration: _fieldDecoration(
            label: 'New password',
            hint: 'At least 8 characters',
            icon: Icons.lock_outline_rounded,
            suffix: IconButton(
              icon: Icon(
                _showNew
                    ? Icons.visibility_off_outlined
                    : Icons.visibility_outlined,
                size: 20,
              ),
              onPressed: () => setState(() => _showNew = !_showNew),
            ),
          ),
          textInputAction: TextInputAction.next,
          validator: _validatePassword,
        ),
        const SizedBox(height: 14),
        TextFormField(
          controller: _confirmPasswordController,
          obscureText: !_showConfirm,
          decoration: _fieldDecoration(
            label: 'Confirm password',
            hint: 'Re-enter to confirm',
            icon: Icons.lock_outline_rounded,
            suffix: IconButton(
              icon: Icon(
                _showConfirm
                    ? Icons.visibility_off_outlined
                    : Icons.visibility_outlined,
                size: 20,
              ),
              onPressed: () => setState(() => _showConfirm = !_showConfirm),
            ),
          ),
          textInputAction: TextInputAction.done,
          onFieldSubmitted: (_) => _resetPassword(),
          validator: (v) {
            if ((v ?? '') != _newPasswordController.text) {
              return 'Passwords do not match';
            }
            return null;
          },
        ),
        const SizedBox(height: 20),
        SizedBox(
          width: double.infinity,
          height: 50,
          child: FilledButton(
            onPressed: _loading ? null : _resetPassword,
            style: FilledButton.styleFrom(
              backgroundColor: const Color(0xFF3470A2),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14),
              ),
            ),
            child: _loading
                ? const SizedBox(
                    width: 22,
                    height: 22,
                    child: CircularProgressIndicator(
                      strokeWidth: 2.5,
                      valueColor: AlwaysStoppedAnimation(Colors.white),
                    ),
                  )
                : const Text(
                    'Reset password',
                    style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
                  ),
          ),
        ),
      ],
    ),
  );

  // ── step indicator ──
  Widget _stepIndicator() {
    const steps = ['Email', 'Verify', 'Reset'];
    return Row(
      children: List.generate(steps.length, (i) {
        final done = i < _step;
        final active = i == _step;
        return Expanded(
          child: Row(
            children: [
              Expanded(
                child: Column(
                  children: [
                    AnimatedContainer(
                      duration: const Duration(milliseconds: 250),
                      width: 28,
                      height: 28,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: done || active
                            ? const Color(0xFF3470A2)
                            : const Color(0xFFE5E7EB),
                      ),
                      child: Center(
                        child: done
                            ? const Icon(
                                Icons.check,
                                size: 14,
                                color: Colors.white,
                              )
                            : Text(
                                '${i + 1}',
                                style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w700,
                                  color: active
                                      ? Colors.white
                                      : const Color(0xFF9CA3AF),
                                ),
                              ),
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      steps[i],
                      style: TextStyle(
                        fontSize: 11,
                        color: active
                            ? const Color(0xFF3470A2)
                            : const Color(0xFF9CA3AF),
                        fontWeight: active
                            ? FontWeight.w600
                            : FontWeight.normal,
                      ),
                    ),
                  ],
                ),
              ),
              if (i < steps.length - 1)
                Expanded(
                  child: Container(
                    height: 2,
                    margin: const EdgeInsets.only(bottom: 18),
                    color: i < _step
                        ? const Color(0xFF3470A2)
                        : const Color(0xFFE5E7EB),
                  ),
                ),
            ],
          ),
        );
      }),
    );
  }

  @override
  Widget build(BuildContext context) {
    final titles = ['Forgot password', 'Check your email', 'New password'];
    return Scaffold(
      backgroundColor: const Color(0xFFF8FAFC),
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: BackButton(
          onPressed: () {
            if (_step > 0) {
              setState(() {
                _step--;
                _error = '';
              });
            } else {
              Navigator.of(context).pop();
            }
          },
        ),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 8, 24, 32),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _stepIndicator(),
              const SizedBox(height: 28),
              Text(
                titles[_step],
                style: const TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.w800,
                  color: Color(0xFF1F2937),
                ),
              ),
              const SizedBox(height: 6),
              const Divider(height: 20),
              AnimatedSwitcher(
                duration: const Duration(milliseconds: 220),
                transitionBuilder: (child, anim) => FadeTransition(
                  opacity: anim,
                  child: SlideTransition(
                    position: Tween<Offset>(
                      begin: const Offset(0.04, 0),
                      end: Offset.zero,
                    ).animate(anim),
                    child: child,
                  ),
                ),
                child: KeyedSubtree(
                  key: ValueKey(_step),
                  child: _step == 0
                      ? _buildEmailStep()
                      : _step == 1
                      ? _buildOtpStep()
                      : _buildResetStep(),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
