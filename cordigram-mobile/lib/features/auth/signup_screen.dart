import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_svg/flutter_svg.dart';

// ---------------------------------------------------------------------------
// SignupScreen – 3-step flow mirroring cordigram-web:
//   Step 0 – Email
//   Step 1 – OTP verification
//   Step 2 – Profile info (display name, username, password, birthdate, gender, bio)
// ---------------------------------------------------------------------------

class SignupScreen extends StatefulWidget {
  const SignupScreen({super.key});

  @override
  State<SignupScreen> createState() => _SignupScreenState();
}

class _SignupScreenState extends State<SignupScreen> {
  int _step = 0; // 0 = email, 1 = otp, 2 = profile

  // ── Step 0 ──
  final _emailController = TextEditingController();
  final _emailFormKey = GlobalKey<FormState>();

  // ── Step 1 ──
  final _otpController = TextEditingController();
  final _otpFormKey = GlobalKey<FormState>();
  int? _cooldown;

  // ── Step 2 ──
  final _profileFormKey = GlobalKey<FormState>();
  final _displayNameController = TextEditingController();
  final _usernameController = TextEditingController();
  final _passwordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();
  final _bioController = TextEditingController();
  bool _showPassword = false;
  bool _showConfirmPassword = false;
  String _gender = '';
  DateTime? _birthdate;

  bool _loading = false; // ignore: prefer_final_fields
  String _error = '';

  @override
  void dispose() {
    _emailController.dispose();
    _otpController.dispose();
    _displayNameController.dispose();
    _usernameController.dispose();
    _passwordController.dispose();
    _confirmPasswordController.dispose();
    _bioController.dispose();
    super.dispose();
  }

  void _showError(String msg) {
    setState(() => _error = msg);
  }

  void _clearError() {
    if (_error.isNotEmpty) setState(() => _error = '');
  }

  void _nextStep() {
    setState(() {
      _error = '';
      _step++;
    });
  }

  void _prevStep() {
    setState(() {
      _error = '';
      _step--;
    });
  }

  // ── Step 0: send OTP ──
  void _handleSendOtp() {
    FocusScope.of(context).unfocus();
    if (!(_emailFormKey.currentState?.validate() ?? false)) return;
    _clearError();

    // TODO: call POST /auth/request-otp
    _nextStep();
  }

  // ── Step 1: verify OTP ──
  void _handleVerifyOtp() {
    FocusScope.of(context).unfocus();
    if (!(_otpFormKey.currentState?.validate() ?? false)) return;
    _clearError();

    // TODO: call POST /auth/verify-otp
    _nextStep();
  }

  // ── Step 2: complete profile ──
  void _handleCompleteProfile() {
    FocusScope.of(context).unfocus();
    if (!(_profileFormKey.currentState?.validate() ?? false)) return;
    if (_gender.isEmpty) {
      _showError('Please select your gender');
      return;
    }
    _clearError();

    // TODO: call POST /auth/complete-profile
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Signup UI ready – API wiring is next.')),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xFF1F4F7A), Color(0xFF3470A2), Color(0xFFF4F7FB)],
            stops: [0.0, 0.35, 0.75],
          ),
        ),
        child: SafeArea(
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 430),
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const SizedBox(height: 12),
                    const _BrandPanel(),
                    const SizedBox(height: 16),
                    _StepIndicator(currentStep: _step, totalSteps: 3),
                    const SizedBox(height: 16),
                    _buildCard(),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildCard() {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 18, 16, 16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: const [
          BoxShadow(
            color: Color(0x2A0F2F4A),
            blurRadius: 26,
            offset: Offset(0, 10),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _buildStepHeader(),
          const SizedBox(height: 18),
          if (_step == 0) _buildEmailStep(),
          if (_step == 1) _buildOtpStep(),
          if (_step == 2) _buildProfileStep(),
          if (_error.isNotEmpty) ...[
            const SizedBox(height: 12),
            _ErrorBanner(message: _error),
          ],
        ],
      ),
    );
  }

  Widget _buildStepHeader() {
    final titles = ['Create account', 'Verify email', 'Profile info'];
    final subtitles = [
      'Enter your email to get started',
      'Enter the OTP sent to ${_emailController.text}',
      'Complete your account details',
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (_step > 0)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: GestureDetector(
              onTap: _prevStep,
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(
                    Icons.arrow_back_ios_new_rounded,
                    size: 14,
                    color: Color(0xFF3470A2),
                  ),
                  const SizedBox(width: 4),
                  Text(
                    'Back',
                    style: const TextStyle(
                      color: Color(0xFF3470A2),
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
          ),
        Text(
          titles[_step],
          style: const TextStyle(
            fontSize: 22,
            fontWeight: FontWeight.w800,
            color: Color(0xFF0F172A),
          ),
        ),
        const SizedBox(height: 4),
        Text(
          subtitles[_step],
          style: const TextStyle(fontSize: 13, color: Color(0xFF64748B)),
        ),
      ],
    );
  }

  // ────────────────────────────── STEP 0: EMAIL ──────────────────────────────

  Widget _buildEmailStep() {
    return Form(
      key: _emailFormKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _InputField(
            controller: _emailController,
            label: 'Email address',
            hint: 'email@example.com',
            icon: Icons.mail_outline_rounded,
            keyboardType: TextInputType.emailAddress,
            autofillHints: const [AutofillHints.email],
            onChanged: (_) => _clearError(),
            validator: (v) {
              final s = (v ?? '').trim();
              if (s.isEmpty) return 'Please enter your email';
              if (!RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(s)) {
                return 'Invalid email address';
              }
              return null;
            },
          ),
          const SizedBox(height: 18),
          _PrimaryButton(
            label: _loading ? 'Sending...' : 'Send OTP',
            onPressed: _loading ? null : _handleSendOtp,
          ),
          const SizedBox(height: 14),
          _GoogleSignupButton(),
          const SizedBox(height: 14),
          Center(
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text(
                  'Already have an account? ',
                  style: TextStyle(fontSize: 13, color: Color(0xFF64748B)),
                ),
                TextButton(
                  onPressed: () => Navigator.of(context).pop(),
                  child: const Text(
                    'Sign in',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: Color(0xFF3470A2),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // ────────────────────────────── STEP 1: OTP ────────────────────────────────

  Widget _buildOtpStep() {
    return Form(
      key: _otpFormKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _OtpField(
            controller: _otpController,
            onChanged: (_) => _clearError(),
          ),
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              TextButton(
                onPressed: _prevStep,
                child: const Text(
                  'Change email',
                  style: TextStyle(fontSize: 13, color: Color(0xFF3470A2)),
                ),
              ),
              TextButton(
                onPressed: _cooldown != null
                    ? null
                    : () {
                        // TODO: resend OTP
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('OTP resent')),
                        );
                      },
                child: Text(
                  _cooldown != null ? 'Resend in ${_cooldown}s' : 'Resend code',
                  style: const TextStyle(
                    fontSize: 13,
                    color: Color(0xFF3470A2),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          _PrimaryButton(
            label: _loading ? 'Verifying...' : 'Verify',
            onPressed: _loading ? null : _handleVerifyOtp,
          ),
        ],
      ),
    );
  }

  // ────────────────────────────── STEP 2: PROFILE ────────────────────────────

  Widget _buildProfileStep() {
    return Form(
      key: _profileFormKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Display name + Username side-by-side on wider screens, stacked on narrow
          _InputField(
            controller: _displayNameController,
            label: 'Display name',
            hint: 'E.g. Cordigrammer',
            icon: Icons.badge_outlined,
            onChanged: (_) => _clearError(),
            validator: (v) {
              final s = (v ?? '').trim();
              if (s.isEmpty) return 'Display name is required';
              if (s.length < 3 || s.length > 30) {
                return 'Between 3 and 30 characters';
              }
              if (!RegExp(r'^[\p{L}\s]+$', unicode: true).hasMatch(s)) {
                return 'Only letters and spaces allowed';
              }
              return null;
            },
          ),
          const SizedBox(height: 12),
          _InputField(
            controller: _usernameController,
            label: 'Username',
            hint: 'username',
            icon: Icons.alternate_email_rounded,
            onChanged: (_) => _clearError(),
            inputFormatters: [
              FilteringTextInputFormatter.allow(RegExp(r'[a-z0-9_.]')),
              LengthLimitingTextInputFormatter(30),
            ],
            validator: (v) {
              final s = (v ?? '').trim();
              if (s.isEmpty) return 'Username is required';
              if (s.length < 3) return 'At least 3 characters';
              if (!RegExp(r'^[a-z0-9_.]{3,30}$').hasMatch(s)) {
                return 'Letters, numbers, _ and . only';
              }
              return null;
            },
          ),
          const SizedBox(height: 12),
          _PasswordField(
            controller: _passwordController,
            label: 'Password',
            hint: 'At least 8 characters',
            show: _showPassword,
            onToggle: () => setState(() => _showPassword = !_showPassword),
            onChanged: (_) => _clearError(),
            validator: (v) {
              final s = (v ?? '').trim();
              if (s.isEmpty) return 'Password is required';
              if (s.length < 8) return 'At least 8 characters';
              return null;
            },
          ),
          const SizedBox(height: 12),
          _PasswordField(
            controller: _confirmPasswordController,
            label: 'Confirm password',
            hint: 'Re-enter to confirm',
            show: _showConfirmPassword,
            onToggle: () =>
                setState(() => _showConfirmPassword = !_showConfirmPassword),
            onChanged: (_) => _clearError(),
            validator: (v) {
              if ((v ?? '') != _passwordController.text) {
                return 'Passwords do not match';
              }
              return null;
            },
          ),
          const SizedBox(height: 12),
          _BirthdatePicker(
            value: _birthdate,
            onChanged: (date) => setState(() => _birthdate = date),
          ),
          const SizedBox(height: 12),
          _GenderSelector(
            value: _gender,
            onChanged: (val) => setState(() {
              _gender = val;
              _clearError();
            }),
          ),
          const SizedBox(height: 12),
          _InputField(
            controller: _bioController,
            label: 'Short bio (optional)',
            hint: 'Share a little about yourself',
            icon: Icons.edit_note_rounded,
            maxLines: 3,
            maxLength: 300,
            onChanged: (_) {},
          ),
          const SizedBox(height: 18),
          _PrimaryButton(
            label: _loading ? 'Creating account...' : 'Create account',
            onPressed: _loading ? null : _handleCompleteProfile,
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────────── BRAND PANEL ───────────────────────────────

class _BrandPanel extends StatelessWidget {
  const _BrandPanel();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        children: [
          Image.asset(
            'assets/images/cordigram-logo.png',
            width: 100,
            height: 100,
          ),
          const SizedBox(height: 10),
          const Text(
            'CORDIGRAM',
            style: TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w700,
              letterSpacing: 2,
              fontSize: 14,
            ),
          ),
        ],
      ),
    );
  }
}

// ──────────────────────────── STEP INDICATOR ───────────────────────────────

class _StepIndicator extends StatelessWidget {
  const _StepIndicator({required this.currentStep, required this.totalSteps});

  final int currentStep;
  final int totalSteps;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: List.generate(totalSteps * 2 - 1, (i) {
        if (i.isOdd) {
          // connector line
          final stepIdx = i ~/ 2;
          final active = stepIdx < currentStep;
          return Expanded(
            child: Container(
              height: 2,
              color: active ? Colors.white : Colors.white30,
            ),
          );
        }
        final stepIdx = i ~/ 2;
        final done = stepIdx < currentStep;
        final active = stepIdx == currentStep;
        return AnimatedContainer(
          duration: const Duration(milliseconds: 250),
          width: 28,
          height: 28,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: done
                ? Colors.white
                : active
                ? Colors.white
                : Colors.white24,
          ),
          child: Center(
            child: done
                ? const Icon(
                    Icons.check_rounded,
                    size: 14,
                    color: Color(0xFF3470A2),
                  )
                : Text(
                    '${stepIdx + 1}',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: active ? const Color(0xFF3470A2) : Colors.white60,
                    ),
                  ),
          ),
        );
      }),
    );
  }
}

// ─────────────────────────────── OTP FIELD ────────────────────────────────

class _OtpField extends StatelessWidget {
  const _OtpField({required this.controller, required this.onChanged});

  final TextEditingController controller;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: controller,
      keyboardType: TextInputType.number,
      inputFormatters: [
        FilteringTextInputFormatter.digitsOnly,
        LengthLimitingTextInputFormatter(6),
      ],
      textAlign: TextAlign.center,
      style: const TextStyle(
        fontSize: 28,
        fontWeight: FontWeight.w700,
        letterSpacing: 12,
        color: Color(0xFF0F172A),
      ),
      decoration: InputDecoration(
        labelText: 'OTP code',
        hintText: '• • • • • •',
        hintStyle: const TextStyle(
          letterSpacing: 8,
          color: Color(0xFFCBD5E1),
          fontSize: 22,
        ),
        filled: true,
        fillColor: const Color(0xFFF8FBFF),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 14,
          vertical: 18,
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: Color(0xFFD7E5F2)),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: Color(0xFFD7E5F2)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: Color(0xFF3470A2), width: 1.4),
        ),
      ),
      onChanged: onChanged,
      validator: (v) {
        final s = (v ?? '').trim();
        if (s.isEmpty) return 'Please enter the OTP';
        if (s.length < 4) return 'Invalid OTP code';
        return null;
      },
    );
  }
}

// ─────────────────────────── REUSABLE INPUT FIELD ──────────────────────────

class _InputField extends StatelessWidget {
  const _InputField({
    required this.controller,
    required this.label,
    required this.hint,
    required this.icon,
    this.keyboardType,
    this.autofillHints,
    this.maxLines = 1,
    this.maxLength,
    this.inputFormatters,
    this.validator,
    this.onChanged,
  });

  final TextEditingController controller;
  final String label;
  final String hint;
  final IconData icon;
  final TextInputType? keyboardType;
  final Iterable<String>? autofillHints;
  final int maxLines;
  final int? maxLength;
  final List<TextInputFormatter>? inputFormatters;
  final FormFieldValidator<String>? validator;
  final ValueChanged<String>? onChanged;

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: controller,
      keyboardType: keyboardType,
      autofillHints: autofillHints,
      maxLines: maxLines,
      maxLength: maxLength,
      inputFormatters: inputFormatters,
      decoration: InputDecoration(
        labelText: label,
        hintText: hint,
        prefixIcon: Icon(icon, size: 20),
        filled: true,
        fillColor: const Color(0xFFF8FBFF),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 14,
          vertical: 14,
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: Color(0xFFD7E5F2)),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: Color(0xFFD7E5F2)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: Color(0xFF3470A2), width: 1.4),
        ),
        counterText: maxLength != null ? null : '',
      ),
      validator: validator,
      onChanged: onChanged,
    );
  }
}

// ─────────────────────────── PASSWORD FIELD ────────────────────────────────

class _PasswordField extends StatelessWidget {
  const _PasswordField({
    required this.controller,
    required this.label,
    required this.hint,
    required this.show,
    required this.onToggle,
    this.validator,
    this.onChanged,
  });

  final TextEditingController controller;
  final String label;
  final String hint;
  final bool show;
  final VoidCallback onToggle;
  final FormFieldValidator<String>? validator;
  final ValueChanged<String>? onChanged;

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: controller,
      obscureText: !show,
      decoration: InputDecoration(
        labelText: label,
        hintText: hint,
        prefixIcon: const Icon(Icons.lock_outline_rounded, size: 20),
        suffixIcon: IconButton(
          icon: Icon(
            show ? Icons.visibility_off_outlined : Icons.visibility_outlined,
            size: 20,
            color: const Color(0xFF94A3B8),
          ),
          onPressed: onToggle,
        ),
        filled: true,
        fillColor: const Color(0xFFF8FBFF),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 14,
          vertical: 14,
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: Color(0xFFD7E5F2)),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: Color(0xFFD7E5F2)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: Color(0xFF3470A2), width: 1.4),
        ),
      ),
      validator: validator,
      onChanged: onChanged,
    );
  }
}

// ─────────────────────────── BIRTHDATE PICKER ─────────────────────────────

class _BirthdatePicker extends StatelessWidget {
  const _BirthdatePicker({required this.value, required this.onChanged});

  final DateTime? value;
  final ValueChanged<DateTime> onChanged;

  String get _displayText {
    if (value == null) return 'Select birthdate';
    return '${value!.day.toString().padLeft(2, '0')}/'
        '${value!.month.toString().padLeft(2, '0')}/'
        '${value!.year}';
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () async {
        final today = DateTime.now();
        final picked = await showDatePicker(
          context: context,
          initialDate:
              value ?? DateTime(today.year - 18, today.month, today.day),
          firstDate: DateTime(1900),
          lastDate: today,
          builder: (ctx, child) => Theme(
            data: Theme.of(ctx).copyWith(
              colorScheme: const ColorScheme.light(primary: Color(0xFF3470A2)),
            ),
            child: child!,
          ),
        );
        if (picked != null) onChanged(picked);
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        decoration: BoxDecoration(
          color: const Color(0xFFF8FBFF),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: const Color(0xFFD7E5F2)),
        ),
        child: Row(
          children: [
            const Icon(Icons.cake_outlined, size: 20, color: Color(0xFF94A3B8)),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                _displayText,
                style: TextStyle(
                  fontSize: 16,
                  color: value == null
                      ? const Color(0xFF94A3B8)
                      : const Color(0xFF0F172A),
                ),
              ),
            ),
            const Icon(
              Icons.calendar_today_outlined,
              size: 16,
              color: Color(0xFF94A3B8),
            ),
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────── GENDER SELECTOR ──────────────────────────────

class _GenderSelector extends StatelessWidget {
  const _GenderSelector({required this.value, required this.onChanged});

  final String value;
  final ValueChanged<String> onChanged;

  static const _options = [
    ('male', 'Male'),
    ('female', 'Female'),
    ('other', 'Other'),
    ('prefer_not_to_say', 'Prefer not to say'),
  ];

  String get _label {
    for (final (val, lbl) in _options) {
      if (val == value) return lbl;
    }
    return 'Select gender';
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () {
        showModalBottomSheet<String>(
          context: context,
          shape: const RoundedRectangleBorder(
            borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
          ),
          builder: (_) => Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 36,
                  height: 4,
                  decoration: BoxDecoration(
                    color: const Color(0xFFE2E8F0),
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
                const SizedBox(height: 14),
                const Text(
                  'Select gender',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: Color(0xFF0F172A),
                  ),
                ),
                const SizedBox(height: 12),
                ..._options.map(
                  (opt) => ListTile(
                    title: Text(opt.$2),
                    trailing: opt.$1 == value
                        ? const Icon(
                            Icons.check_rounded,
                            color: Color(0xFF3470A2),
                          )
                        : null,
                    onTap: () {
                      Navigator.pop(context, opt.$1);
                    },
                  ),
                ),
              ],
            ),
          ),
        ).then((picked) {
          if (picked != null) onChanged(picked);
        });
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        decoration: BoxDecoration(
          color: const Color(0xFFF8FBFF),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: const Color(0xFFD7E5F2)),
        ),
        child: Row(
          children: [
            const Icon(
              Icons.person_outline_rounded,
              size: 20,
              color: Color(0xFF94A3B8),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                _label,
                style: TextStyle(
                  fontSize: 16,
                  color: value.isEmpty
                      ? const Color(0xFF94A3B8)
                      : const Color(0xFF0F172A),
                ),
              ),
            ),
            const Icon(
              Icons.expand_more_rounded,
              size: 20,
              color: Color(0xFF94A3B8),
            ),
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────── PRIMARY BUTTON ───────────────────────────────

class _PrimaryButton extends StatelessWidget {
  const _PrimaryButton({required this.label, required this.onPressed});

  final String label;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 50,
      child: FilledButton(
        onPressed: onPressed,
        style: FilledButton.styleFrom(
          backgroundColor: const Color(0xFF3470A2),
          disabledBackgroundColor: const Color(0xFFB0C4D8),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
        ),
        child: Text(
          label,
          style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
        ),
      ),
    );
  }
}

// ─────────────────────────── GOOGLE SIGNUP BUTTON ─────────────────────────

class _GoogleSignupButton extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 50,
      child: OutlinedButton.icon(
        onPressed: () {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Google sign-up coming soon.')),
          );
        },
        icon: SvgPicture.string(
          '''<svg xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" width="30" height="30" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"></path><path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"></path><path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"></path><path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"></path></svg>''',
          width: 22,
          height: 22,
        ),
        label: const Text('Continue with Google'),
        style: OutlinedButton.styleFrom(
          side: const BorderSide(color: Color(0xFFD7E5F2)),
          foregroundColor: const Color(0xFF1F2937),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
        ),
      ),
    );
  }
}

// ───────────────────────────── ERROR BANNER ───────────────────────────────

class _ErrorBanner extends StatelessWidget {
  const _ErrorBanner({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: const Color(0xFFFEF2F2),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: const Color(0xFFFCA5A5)),
      ),
      child: Row(
        children: [
          const Icon(
            Icons.error_outline_rounded,
            size: 16,
            color: Color(0xFFDC2626),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              message,
              style: const TextStyle(fontSize: 13, color: Color(0xFFDC2626)),
            ),
          ),
        ],
      ),
    );
  }
}
