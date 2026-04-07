import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:flutter_web_auth_2/flutter_web_auth_2.dart';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import 'package:image_cropper/image_cropper.dart';
import 'package:image_picker/image_picker.dart';
import '../../core/config/app_config.dart';
import '../../core/services/api_service.dart';
import '../../core/services/auth_storage.dart';
import '../home/home_screen.dart';

// ---------------------------------------------------------------------------
// SignupScreen – 4-step flow mirroring cordigram-web:
//   Step 0 – Email
//   Step 1 – OTP verification
//   Step 2 – Profile info (display name, username, password, birthdate, gender, bio)
//   Step 3 – Avatar selection
// ---------------------------------------------------------------------------

class SignupScreen extends StatefulWidget {
  /// Standard email-based signup flow (starts at step 0).
  const SignupScreen({super.key})
    : googleSignupToken = null,
      googleEmail = null;

  /// Google-based signup flow: skips email + OTP, starts at step 2 (profile).
  const SignupScreen.google({
    super.key,
    required String signupToken,
    String? email,
  }) : googleSignupToken = signupToken,
       googleEmail = email;

  final String? googleSignupToken;
  final String? googleEmail;

  bool get isGoogleSignup => googleSignupToken != null;

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
  String _lastSentEmail = ''; // email đã gửi OTP gần nhất

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

  // ── Step 3 ──
  String? _avatarOriginalPath;
  String? _avatarCroppedPath;
  Uint8List? _avatarPreviewBytes;

  // field-level email error (shown inline beneath email field)
  String _emailError = '';
  // field-level username error (shown inline beneath username field)
  String _usernameError = '';
  // ignore: unused_field
  String _signupToken =
      ''; // token nhận được sau khi verify OTP thành công, dùng ở complete-profile

  bool _loading = false; // ignore: prefer_final_fields
  String _error = '';

  @override
  void initState() {
    super.initState();
    if (widget.googleSignupToken != null) {
      _step = 2;
      _signupToken = widget.googleSignupToken!;
      _lastSentEmail = widget.googleEmail ?? '';
    }
  }

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

  void _startCooldown([int seconds = 60]) {
    setState(() => _cooldown = seconds);
    _tickCooldown();
  }

  void _tickCooldown() {
    if (_cooldown == null || _cooldown! <= 0) return;
    Future.delayed(const Duration(seconds: 1), () {
      if (!mounted) return;
      setState(
        () => _cooldown = (_cooldown ?? 1) - 1 <= 0 ? null : _cooldown! - 1,
      );
      _tickCooldown();
    });
  }

  void _nextStep() {
    setState(() {
      _error = '';
      _loading = false;
      _step++;
    });
    // Xoá OTP cũ mỗi khi chuyển sang bước verify email
    if (_step == 1) _otpController.clear();
  }

  void _prevStep() {
    setState(() {
      _error = '';
      _emailError = '';
      _loading = false;
      _step--;
    });
  }

  // ── Step 0: send OTP ──
  Future<void> _handleSendOtp() async {
    FocusScope.of(context).unfocus();
    if (!(_emailFormKey.currentState?.validate() ?? false)) return;

    final email = _emailController.text.trim().toLowerCase();

    // Cùng email, còn cooldown → chuyển thẳng sang bước OTP (không gọi API)
    if (email == _lastSentEmail && _cooldown != null && _cooldown! > 0) {
      _nextStep();
      return;
    }

    setState(() {
      _loading = true;
      _error = '';
      _emailError = '';
    });

    try {
      await ApiService.post('/auth/request-otp', body: {'email': email});
      _lastSentEmail = email;
      _startCooldown(60);
      _nextStep();
    } on ApiException catch (e) {
      if (e.retryAfterSec != null) {
        // Server trả về retryAfterSec → dùng giá trị đó
        _lastSentEmail = email;
        _startCooldown(e.retryAfterSec!);
        _nextStep();
      } else if (e.message.toLowerCase().contains('email') ||
          e.message.toLowerCase().contains('already') ||
          e.message.toLowerCase().contains('existed') ||
          e.message.toLowerCase().contains('reserved') ||
          e.message.toLowerCase().contains('banned')) {
        setState(() {
          _emailError = e.message;
          _loading = false;
        });
      } else {
        setState(() {
          _error = e.message;
          _loading = false;
        });
      }
    } catch (_) {
      setState(() {
        _error = 'Could not connect to server. Please try again.';
        _loading = false;
      });
    }
  }

  // ── Resend OTP ──
  Future<void> _handleResendOtp() async {
    setState(() {
      _loading = true;
      _error = '';
    });
    try {
      await ApiService.post(
        '/auth/request-otp',
        body: {'email': _lastSentEmail},
      );
      setState(() => _loading = false);
      _startCooldown(60);
    } on ApiException catch (e) {
      if (e.retryAfterSec != null) {
        setState(() => _loading = false);
        _startCooldown(e.retryAfterSec!);
      } else {
        setState(() {
          _error = e.message;
          _loading = false;
        });
      }
    } catch (_) {
      setState(() {
        _error = 'Could not connect to server. Please try again.';
        _loading = false;
      });
    }
  }

  // ── Step 1: verify OTP ──
  Future<void> _handleVerifyOtp() async {
    FocusScope.of(context).unfocus();
    if (!(_otpFormKey.currentState?.validate() ?? false)) return;
    setState(() {
      _loading = true;
      _error = '';
    });

    try {
      final res = await ApiService.post(
        '/auth/verify-otp',
        body: {'email': _lastSentEmail, 'code': _otpController.text.trim()},
      );
      _signupToken = res['signupToken'] as String? ?? '';
      _nextStep();
    } on ApiException catch (e) {
      setState(() {
        _error = e.message;
        _loading = false;
      });
    } catch (_) {
      setState(() {
        _error = 'Could not connect to server. Please try again.';
        _loading = false;
      });
    }
  }

  // ── Step 2: complete profile ──
  Future<void> _handleCompleteProfile() async {
    FocusScope.of(context).unfocus();
    if (!(_profileFormKey.currentState?.validate() ?? false)) return;
    if (_gender.isEmpty) {
      _showError('Please select your gender');
      return;
    }
    _clearError();

    // Kiểm tra username trên server
    setState(() => _loading = true);
    try {
      final res = await ApiService.get(
        '/profiles/check-username?username=${Uri.encodeComponent(_usernameController.text.trim())}',
      );
      final available = res['available'] as bool? ?? true;
      if (!available) {
        setState(() {
          _loading = false;
          _usernameError = 'Username already taken';
        });
        return;
      }
    } on ApiException catch (e) {
      setState(() {
        _loading = false;
        _error = e.message;
      });
      return;
    } catch (_) {
      // Nếu API lỗi không chặn, tiếp tục
      setState(() => _loading = false);
    }

    setState(() => _loading = false);
    _nextStep(); // đến bước chọn avatar
  }

  // ── Step 3: pick from gallery + native crop ──
  Future<void> _pickAndCropAvatar() async {
    try {
      final picker = ImagePicker();
      final picked = await picker.pickImage(
        source: ImageSource.gallery,
        imageQuality: 90,
        maxWidth: 2048,
        maxHeight: 2048,
      );
      if (picked == null || !mounted) return;

      final cropped = await ImageCropper().cropImage(
        sourcePath: picked.path,
        aspectRatio: const CropAspectRatio(ratioX: 1, ratioY: 1),
        uiSettings: [
          AndroidUiSettings(
            toolbarTitle: 'Crop photo',
            toolbarColor: const Color(0xFF1F4F7A),
            toolbarWidgetColor: Colors.white,
            activeControlsWidgetColor: const Color(0xFF3470A2),
            initAspectRatio: CropAspectRatioPreset.square,
            lockAspectRatio: true,
          ),
          IOSUiSettings(
            title: 'Crop photo',
            aspectRatioLockEnabled: true,
            resetAspectRatioEnabled: false,
          ),
        ],
      );
      if (cropped == null || !mounted) return;

      final bytes = await File(cropped.path).readAsBytes();
      setState(() {
        _avatarOriginalPath = picked.path;
        _avatarCroppedPath = cropped.path;
        _avatarPreviewBytes = bytes;
      });
    } catch (_) {
      if (mounted)
        setState(() => _error = 'Could not access photos. Please try again.');
    }
  }

  // ── POST /auth/complete-profile (called from both finish and skip) ──
  Future<void> _completeSignup({Map<String, dynamic>? avatarData}) async {
    final body = <String, dynamic>{
      'email': _lastSentEmail,
      'displayName': _displayNameController.text.trim(),
      'username': _usernameController.text.trim(),
    };
    final password = _passwordController.text;
    if (password.isNotEmpty) body['password'] = password;
    if (_birthdate != null) body['birthdate'] = _birthdate!.toIso8601String();
    final bio = _bioController.text.trim();
    if (bio.isNotEmpty) body['bio'] = bio;
    if (_gender.isNotEmpty) body['gender'] = _gender;
    if (avatarData != null) body.addAll(avatarData);

    final result = await ApiService.postAuth(
      '/auth/complete-profile',
      body: body,
      extraHeaders: {'Authorization': 'Bearer $_signupToken'},
    );
    final token = result.body['accessToken'] as String?;
    if (token != null) {
      await AuthStorage.saveTokens(
        accessToken: token,
        refreshToken: result.refreshToken,
      );
    }
    if (!mounted) return;
    Navigator.of(
      context,
    ).pushReplacement(MaterialPageRoute(builder: (_) => const HomeScreen()));
  }

  // ── Step 3: upload original + cropped, then complete profile ──
  Future<void> _handleAvatarFinish() async {
    setState(() {
      _loading = true;
      _error = '';
    });
    try {
      Map<String, dynamic>? avatarData;
      if (_avatarOriginalPath != null && _avatarCroppedPath != null) {
        final uri = Uri.parse('${AppConfig.apiBaseUrl}/auth/upload-avatar');
        final request = http.MultipartRequest('POST', uri)
          ..headers['Authorization'] = 'Bearer $_signupToken';
        request.files.add(
          await http.MultipartFile.fromPath(
            'original',
            _avatarOriginalPath!,
            contentType: MediaType('image', 'jpeg'),
          ),
        );
        request.files.add(
          await http.MultipartFile.fromPath(
            'cropped',
            _avatarCroppedPath!,
            contentType: MediaType('image', 'jpeg'),
          ),
        );
        final streamed = await request.send().timeout(
          const Duration(seconds: 30),
        );
        final responseBody = await streamed.stream.bytesToString();
        if (streamed.statusCode < 200 || streamed.statusCode >= 300) {
          String msg = 'Avatar upload failed';
          try {
            final json = jsonDecode(responseBody) as Map<String, dynamic>;
            final m = json['message'];
            if (m is String) msg = m;
          } catch (_) {}
          throw ApiException(msg);
        }
        avatarData = jsonDecode(responseBody) as Map<String, dynamic>;
      }
      await _completeSignup(avatarData: avatarData);
    } on ApiException catch (e) {
      setState(() {
        _error = e.message;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  // ── Step 3: skip avatar → send default URL so DB is never empty ──
  static const _defaultAvatarUrl =
      'https://res.cloudinary.com/doicocgeo/image/upload/v1765850274/user-avatar-default_gfx5bs.jpg';

  Future<void> _handleAvatarSkip() async {
    setState(() {
      _loading = true;
      _error = '';
    });
    try {
      await _completeSignup(avatarData: {'avatarUrl': _defaultAvatarUrl});
    } on ApiException catch (e) {
      setState(() {
        _error = e.message;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
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
                    _StepIndicator(currentStep: _step, totalSteps: 4),
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
          if (_step == 3) _buildAvatarStep(),
          if (_error.isNotEmpty) ...[
            const SizedBox(height: 12),
            _ErrorBanner(message: _error),
          ],
        ],
      ),
    );
  }

  Widget _buildStepHeader() {
    final titles = [
      'Create account',
      'Verify email',
      'Profile info',
      'Choose avatar',
    ];
    final subtitles = [
      'Enter your email to get started',
      'Enter the OTP sent to ${_emailController.text}',
      'Complete your account details',
      'Add a profile photo (optional)',
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
            onChanged: (_) {
              _clearError();
              if (_emailError.isNotEmpty) setState(() => _emailError = '');
            },
            validator: (v) {
              final s = (v ?? '').trim();
              if (s.isEmpty) return 'Please enter your email';
              if (!RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(s)) {
                return 'Invalid email address';
              }
              return null;
            },
          ),
          if (_emailError.isNotEmpty) ...[
            const SizedBox(height: 6),
            _FieldError(message: _emailError),
          ],
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
                onPressed: _cooldown != null ? null : _handleResendOtp,
                child: Text(
                  _cooldown != null
                      ? 'Resend code (${_cooldown}s)'
                      : 'Resend code',
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
            onChanged: (_) {
              _clearError();
              if (_usernameError.isNotEmpty) {
                setState(() => _usernameError = '');
              }
            },
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
          if (_usernameError.isNotEmpty) ...[
            const SizedBox(height: 6),
            _FieldError(message: _usernameError),
          ],
          if (!widget.isGoogleSignup) ...[
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
                if (!RegExp(r'[a-zA-Z]').hasMatch(s))
                  return 'Must contain at least one letter';
                if (!RegExp(r'[0-9]').hasMatch(s))
                  return 'Must contain at least one number';
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
          ],
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

  // ────────────────────────────── STEP 3: AVATAR ─────────────────────────────

  Widget _buildAvatarStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Center(
          child: Container(
            width: 120,
            height: 120,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: const Color(0xFFEAF0F6),
              border: Border.all(color: const Color(0xFFB0C4D8), width: 2),
            ),
            child: ClipOval(
              child: _avatarPreviewBytes != null
                  ? Image.memory(_avatarPreviewBytes!, fit: BoxFit.cover)
                  : const Icon(
                      Icons.person_rounded,
                      size: 60,
                      color: Color(0xFFB0C4D8),
                    ),
            ),
          ),
        ),
        const SizedBox(height: 8),
        Center(
          child: Text(
            _avatarPreviewBytes == null
                ? 'No photo selected — a default avatar will be used'
                : 'Photo ready. Tap below to change.',
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 12, color: Color(0xFF94A3B8)),
          ),
        ),
        const SizedBox(height: 20),
        OutlinedButton.icon(
          onPressed: _loading ? null : _pickAndCropAvatar,
          icon: const Icon(Icons.photo_library_outlined, size: 18),
          label: const Text('Choose from gallery'),
          style: OutlinedButton.styleFrom(
            side: const BorderSide(color: Color(0xFFD7E5F2)),
            foregroundColor: const Color(0xFF3470A2),
            padding: const EdgeInsets.symmetric(vertical: 14),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(14),
            ),
          ),
        ),
        const SizedBox(height: 24),
        Row(
          children: [
            Expanded(
              child: OutlinedButton(
                onPressed: _loading ? null : _handleAvatarSkip,
                style: OutlinedButton.styleFrom(
                  side: const BorderSide(color: Color(0xFFD7E5F2)),
                  foregroundColor: const Color(0xFF64748B),
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                ),
                child: const Text(
                  'Skip',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              flex: 2,
              child: _PrimaryButton(
                label: _loading ? 'Finishing...' : 'Finish',
                onPressed: _loading ? null : _handleAvatarFinish,
              ),
            ),
          ],
        ),
      ],
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
        showDialog<String>(
          context: context,
          builder: (ctx) => Dialog(
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(20),
            ),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 20, 16, 8),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text(
                    'Select gender',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: Color(0xFF0F172A),
                    ),
                  ),
                  const SizedBox(height: 8),
                  ..._options.map(
                    (opt) => ListTile(
                      contentPadding: const EdgeInsets.symmetric(horizontal: 8),
                      title: Text(opt.$2),
                      trailing: opt.$1 == value
                          ? const Icon(
                              Icons.check_rounded,
                              color: Color(0xFF3470A2),
                            )
                          : null,
                      onTap: () => Navigator.pop(ctx, opt.$1),
                    ),
                  ),
                  const SizedBox(height: 8),
                ],
              ),
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

class _GoogleSignupButton extends StatefulWidget {
  @override
  State<_GoogleSignupButton> createState() => _GoogleSignupButtonState();
}

class _GoogleSignupButtonState extends State<_GoogleSignupButton> {
  bool _loading = false;

  String _decodeEmailFromToken(String token) {
    try {
      final parts = token.split('.');
      if (parts.length < 2) return '';
      final payload = parts[1];
      final padded = payload + '=' * ((4 - payload.length % 4) % 4);
      final bytes = base64Url.decode(padded);
      final map = jsonDecode(utf8.decode(bytes)) as Map<String, dynamic>;
      return (map['email'] as String? ?? '').toLowerCase();
    } catch (_) {
      return '';
    }
  }

  Future<void> _handleGoogleSignup() async {
    setState(() => _loading = true);
    try {
      final deviceId = AuthStorage.deviceId;
      final uri = Uri.parse('${AppConfig.apiBaseUrl}/auth/google/mobile')
          .replace(
            queryParameters: deviceId != null ? {'deviceId': deviceId} : {},
          );

      final result = await FlutterWebAuth2.authenticate(
        url: uri.toString(),
        callbackUrlScheme: 'cordigram',
      );

      final callbackUri = Uri.parse(result);
      final accessToken = callbackUri.queryParameters['accessToken'];
      final signupToken = callbackUri.queryParameters['signupToken'];
      final refreshToken = callbackUri.queryParameters['refreshToken'];
      final needsProfile = callbackUri.queryParameters['needsProfile'] == '1';

      if (accessToken != null && !needsProfile) {
        await AuthStorage.saveTokens(
          accessToken: accessToken,
          refreshToken: refreshToken,
        );
        if (!mounted) return;
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(builder: (_) => const HomeScreen()),
        );
      } else if (signupToken != null && needsProfile) {
        final email = _decodeEmailFromToken(signupToken);
        if (!mounted) return;
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(
            builder: (_) =>
                SignupScreen.google(signupToken: signupToken, email: email),
          ),
        );
      } else {
        setState(() => _loading = false);
      }
    } on PlatformException catch (e) {
      if (e.code != 'CANCELED' && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Google sign-in failed. Please try again.'),
          ),
        );
      }
      if (mounted) setState(() => _loading = false);
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Google sign-in failed. Please try again.'),
          ),
        );
        setState(() => _loading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 50,
      child: OutlinedButton.icon(
        onPressed: _loading ? null : _handleGoogleSignup,
        icon: _loading
            ? const SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  valueColor: AlwaysStoppedAnimation(Color(0xFF1F2937)),
                ),
              )
            : SvgPicture.string(
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

// ── Inline field-level error (below input, no background) ──────────────────

class _FieldError extends StatelessWidget {
  const _FieldError({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        const Icon(
          Icons.error_outline_rounded,
          size: 14,
          color: Color(0xFFDC2626),
        ),
        const SizedBox(width: 4),
        Expanded(
          child: Text(
            message,
            style: const TextStyle(fontSize: 12, color: Color(0xFFDC2626)),
          ),
        ),
      ],
    );
  }
}
