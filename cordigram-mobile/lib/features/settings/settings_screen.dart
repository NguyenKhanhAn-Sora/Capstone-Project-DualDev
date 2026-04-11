import 'dart:async';
import 'dart:convert';
import 'package:device_info_plus/device_info_plus.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import '../../core/services/auth_storage.dart';
import '../../core/services/api_service.dart';
import '../profile/models/profile_detail.dart';
import '../profile/profile_edit_sheet.dart';
import '../profile/services/profile_service.dart';

enum SettingsTab {
  personalInfo,
  profile,
  creatorVerification,
  passwordSecurity,
}

enum _EmailChangeStep { password, currentOtp, newEmail, newOtp, done }

enum _PasswordChangeStep { otp, form, done }

enum _PasskeyStep { password, otp, form, done }

enum _TwoFactorStep { otp, done }

class _CreatorCriteria {
  const _CreatorCriteria({
    required this.minScore,
    required this.minAccountAgeDays,
    required this.minFollowersCount,
    required this.minPostsCount,
    required this.minActivePostingDays30d,
    required this.minEngagementPerPost30d,
    required this.maxRecentViolations90d,
    required this.cooldownDaysAfterRejected,
  });

  final num minScore;
  final int minAccountAgeDays;
  final int minFollowersCount;
  final int minPostsCount;
  final int minActivePostingDays30d;
  final num minEngagementPerPost30d;
  final int maxRecentViolations90d;
  final int cooldownDaysAfterRejected;

  factory _CreatorCriteria.fromJson(Map<String, dynamic> j) => _CreatorCriteria(
    minScore: (j['minScore'] as num?) ?? 0,
    minAccountAgeDays: (j['minAccountAgeDays'] as num?)?.toInt() ?? 0,
    minFollowersCount: (j['minFollowersCount'] as num?)?.toInt() ?? 0,
    minPostsCount: (j['minPostsCount'] as num?)?.toInt() ?? 0,
    minActivePostingDays30d:
        (j['minActivePostingDays30d'] as num?)?.toInt() ?? 0,
    minEngagementPerPost30d: (j['minEngagementPerPost30d'] as num?) ?? 0,
    maxRecentViolations90d: (j['maxRecentViolations90d'] as num?)?.toInt() ?? 0,
    cooldownDaysAfterRejected:
        (j['cooldownDaysAfterRejected'] as num?)?.toInt() ?? 0,
  );
}

class _CreatorEligibility {
  const _CreatorEligibility({
    required this.score,
    required this.minimumScore,
    required this.accountAgeDays,
    required this.followersCount,
    required this.postsCount,
    required this.activePostingDays30d,
    required this.engagementPerPost30d,
    required this.recentViolations90d,
    required this.eligible,
    required this.failedRequirements,
  });

  final num score;
  final num minimumScore;
  final int accountAgeDays;
  final int followersCount;
  final int postsCount;
  final int activePostingDays30d;
  final num engagementPerPost30d;
  final int recentViolations90d;
  final bool eligible;
  final List<String> failedRequirements;

  factory _CreatorEligibility.fromJson(Map<String, dynamic> j) =>
      _CreatorEligibility(
        score: (j['score'] as num?) ?? 0,
        minimumScore: (j['minimumScore'] as num?) ?? 0,
        accountAgeDays: (j['accountAgeDays'] as num?)?.toInt() ?? 0,
        followersCount: (j['followersCount'] as num?)?.toInt() ?? 0,
        postsCount: (j['postsCount'] as num?)?.toInt() ?? 0,
        activePostingDays30d: (j['activePostingDays30d'] as num?)?.toInt() ?? 0,
        engagementPerPost30d: (j['engagementPerPost30d'] as num?) ?? 0,
        recentViolations90d: (j['recentViolations90d'] as num?)?.toInt() ?? 0,
        eligible: j['eligible'] as bool? ?? false,
        failedRequirements: (j['failedRequirements'] as List<dynamic>? ?? [])
            .map((e) => e.toString())
            .toList(),
      );
}

class _CreatorAccount {
  const _CreatorAccount({
    required this.isCreatorVerified,
    required this.creatorVerifiedAt,
    required this.roles,
  });

  final bool isCreatorVerified;
  final String? creatorVerifiedAt;
  final List<String> roles;

  factory _CreatorAccount.fromJson(Map<String, dynamic> j) => _CreatorAccount(
    isCreatorVerified: j['isCreatorVerified'] as bool? ?? false,
    creatorVerifiedAt: j['creatorVerifiedAt'] as String?,
    roles: (j['roles'] as List<dynamic>? ?? []).map((e) => '$e').toList(),
  );
}

class _CreatorLatestRequest {
  const _CreatorLatestRequest({
    required this.id,
    required this.status,
    required this.requestNote,
    required this.decisionReason,
    required this.reviewedAt,
    required this.cooldownUntil,
    required this.createdAt,
  });

  final String id;
  final String status;
  final String requestNote;
  final String? decisionReason;
  final String? reviewedAt;
  final String? cooldownUntil;
  final String? createdAt;

  factory _CreatorLatestRequest.fromJson(Map<String, dynamic> j) =>
      _CreatorLatestRequest(
        id: j['id'] as String? ?? '',
        status: j['status'] as String? ?? 'pending',
        requestNote: j['requestNote'] as String? ?? '',
        decisionReason: j['decisionReason'] as String?,
        reviewedAt: j['reviewedAt'] as String?,
        cooldownUntil: j['cooldownUntil'] as String?,
        createdAt: j['createdAt'] as String?,
      );
}

class _CreatorStatusResponse {
  const _CreatorStatusResponse({
    required this.criteria,
    required this.eligibility,
    required this.account,
    required this.latestRequest,
    required this.canRequest,
  });

  final _CreatorCriteria criteria;
  final _CreatorEligibility eligibility;
  final _CreatorAccount account;
  final _CreatorLatestRequest? latestRequest;
  final bool canRequest;

  factory _CreatorStatusResponse.fromJson(Map<String, dynamic> j) =>
      _CreatorStatusResponse(
        criteria: _CreatorCriteria.fromJson(
          (j['criteria'] as Map<String, dynamic>? ?? {}),
        ),
        eligibility: _CreatorEligibility.fromJson(
          (j['eligibility'] as Map<String, dynamic>? ?? {}),
        ),
        account: _CreatorAccount.fromJson(
          (j['account'] as Map<String, dynamic>? ?? {}),
        ),
        latestRequest: j['latestRequest'] is Map<String, dynamic>
            ? _CreatorLatestRequest.fromJson(
                j['latestRequest'] as Map<String, dynamic>,
              )
            : null,
        canRequest: j['canRequest'] as bool? ?? false,
      );
}

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key, this.initialTab = SettingsTab.personalInfo});

  final SettingsTab initialTab;

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  static const Color _bg = Color(0xFF0F1829);
  static const Color _surface = Color(0xFF131F33);
  static const Color _border = Color(0xFF1E2D48);
  static const Color _textPrimary = Color(0xFFE8ECF8);
  static const Color _textSecondary = Color(0xFF7A8BB0);
  static const Color _accent = Color(0xFF4AA3E4);
  static const Color _danger = Color(0xFFE53935);
  static final RegExp _emailRegex = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$');
  static final RegExp _passwordRegex = RegExp(
    r'^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$',
  );
  static final RegExp _passkeyRegex = RegExp(r'^\d{6}$');

  static const List<String> _visibilityOptions = [
    'public',
    'followers',
    'private',
  ];

  Timer? _cooldownTicker;
  SettingsTab? _selectedTab;

  ProfileDetail? _profile;
  bool _loading = true;
  String? _error;
  String? _visibilityError;
  String? _currentEmail;
  bool _showChangeEmail = false;
  _EmailChangeStep _emailStep = _EmailChangeStep.password;
  String _password = '';
  String _currentOtp = '';
  String _newEmail = '';
  String _newOtp = '';
  bool _emailSubmitting = false;
  String? _emailError;
  String? _emailSuccess;
  int _currentCooldown = 0;
  int _newCooldown = 0;
  int? _currentExpiresSec;
  int? _newExpiresSec;
  _CreatorStatusResponse? _creatorStatus;
  bool _creatorLoading = false;
  bool _creatorSubmitting = false;
  String? _creatorError;
  String? _creatorSuccess;
  String _creatorNote = '';

  bool _showChangePassword = false;
  _PasswordChangeStep _passwordStep = _PasswordChangeStep.otp;
  String _passwordOtp = '';
  String _passwordCurrent = '';
  String _passwordNew = '';
  String _passwordConfirm = '';
  bool _passwordSubmitting = false;
  String? _passwordError;
  String? _passwordSuccess;
  int _passwordCooldown = 0;
  int? _passwordExpiresSec;
  String? _passwordChangedAt;
  bool _passwordStatusLoading = false;
  bool _passwordLogoutPrompt = false;
  bool _passwordLogoutSubmitting = false;
  String? _passwordLogoutError;

  bool _twoFactorEnabled = false;
  bool _twoFactorLoading = false;
  bool _showTwoFactorFlow = false;
  _TwoFactorStep _twoFactorStep = _TwoFactorStep.otp;
  bool _twoFactorTarget = true;
  String _twoFactorOtp = '';
  bool _twoFactorSubmitting = false;
  String? _twoFactorError;
  String? _twoFactorSuccess;
  int _twoFactorCooldown = 0;
  int? _twoFactorExpiresSec;

  bool _hasPasskey = false;
  bool _passkeyEnabled = false;
  bool _passkeyStatusLoading = false;
  bool _showPasskeyFlow = false;
  _PasskeyStep _passkeyStep = _PasskeyStep.password;
  String _passkeyPassword = '';
  String _passkeyOtp = '';
  String _passkeyCurrent = '';
  String _passkeyNew = '';
  String _passkeyConfirm = '';
  bool _showCurrentPasskey = false;
  bool _passkeySubmitting = false;
  String? _passkeyError;
  String? _passkeySuccess;
  int _passkeyCooldown = 0;
  int? _passkeyExpiresSec;
  bool _passkeyToggleSubmitting = false;
  String? _passkeyToggleError;

  bool _showLoginDevices = false;
  bool _loginDevicesLoading = false;
  String? _loginDevicesError;
  final List<Map<String, dynamic>> _loginDevices = [];
  String? _loginDevicesCurrent;
  String? _localDeviceName;
  final Set<String> _logoutDeviceSubmitting = {};
  bool _logoutAllSubmitting = false;
  String? _logoutAllError;
  final Map<String, bool> _visibilitySaving = {
    'gender': false,
    'birthdate': false,
    'location': false,
    'workplace': false,
    'bio': false,
    'followers': false,
    'following': false,
    'about': false,
    'profile': false,
  };

  @override
  void initState() {
    super.initState();
    _selectedTab = null;
    _currentEmail = _decodeEmailFromToken(AuthStorage.accessToken);
    _cooldownTicker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      if (_currentCooldown <= 0 &&
          _newCooldown <= 0 &&
          _passwordCooldown <= 0 &&
          _passkeyCooldown <= 0 &&
          _twoFactorCooldown <= 0) {
        return;
      }
      setState(() {
        if (_currentCooldown > 0) _currentCooldown -= 1;
        if (_newCooldown > 0) _newCooldown -= 1;
        if (_passwordCooldown > 0) _passwordCooldown -= 1;
        if (_passkeyCooldown > 0) _passkeyCooldown -= 1;
        if (_twoFactorCooldown > 0) _twoFactorCooldown -= 1;
      });
    });
    _loadLocalDeviceName();
    _loadProfile();
  }

  Future<void> _loadLocalDeviceName() async {
    try {
      final plugin = DeviceInfoPlugin();
      String? label;
      switch (defaultTargetPlatform) {
        case TargetPlatform.android:
          final info = await plugin.androidInfo;
          final brand = info.brand.trim();
          final model = info.model.trim();
          final parts = <String>[
            if (brand.isNotEmpty) brand,
            if (model.isNotEmpty) model,
          ];
          if (parts.isNotEmpty) label = parts.join(' ');
          break;
        case TargetPlatform.iOS:
          final info = await plugin.iosInfo;
          final name = info.name.trim();
          final model = info.model.trim();
          final parts = <String>[
            if (name.isNotEmpty) name,
            if (model.isNotEmpty && model.toLowerCase() != name.toLowerCase())
              model,
          ];
          if (parts.isNotEmpty) label = parts.join(' ');
          break;
        default:
          break;
      }

      if (!mounted || label == null || label.isEmpty) return;
      setState(() => _localDeviceName = label);
    } catch (_) {
      // Keep backend-provided label if local device info cannot be resolved.
    }
  }

  @override
  void dispose() {
    _cooldownTicker?.cancel();
    super.dispose();
  }

  Future<void> _loadProfile() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final profile = await ProfileService.fetchMyProfile();
      if (!mounted) return;
      setState(() {
        _profile = profile;
        _loading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'Unable to load profile details.';
        _loading = false;
      });
    }
  }

  String? _decodeEmailFromToken(String? token) {
    if (token == null || token.isEmpty) return null;
    try {
      final parts = token.split('.');
      if (parts.length < 2) return null;
      var payload = parts[1].replaceAll('-', '+').replaceAll('_', '/');
      while (payload.length % 4 != 0) {
        payload += '=';
      }
      final json = jsonDecode(utf8.decode(base64Decode(payload)));
      if (json is! Map) return null;
      final email = (json['email'] as String?)?.trim();
      if (email == null || email.isEmpty) return null;
      return email;
    } catch (_) {
      return null;
    }
  }

  void _resetEmailFlow() {
    _emailStep = _EmailChangeStep.password;
    _password = '';
    _currentOtp = '';
    _newEmail = '';
    _newOtp = '';
    _emailSubmitting = false;
    _emailError = null;
    _emailSuccess = null;
    _currentCooldown = 0;
    _newCooldown = 0;
    _currentExpiresSec = null;
    _newExpiresSec = null;
  }

  void _openChangeEmail() {
    setState(() {
      _resetEmailFlow();
      _showChangeEmail = true;
    });
  }

  void _handleEmailBack() {
    setState(() {
      _emailError = null;
      _emailSuccess = null;
      switch (_emailStep) {
        case _EmailChangeStep.password:
          _showChangeEmail = false;
          _resetEmailFlow();
          break;
        case _EmailChangeStep.currentOtp:
          _emailStep = _EmailChangeStep.password;
          break;
        case _EmailChangeStep.newEmail:
          _emailStep = _EmailChangeStep.currentOtp;
          break;
        case _EmailChangeStep.newOtp:
          _emailStep = _EmailChangeStep.newEmail;
          break;
        case _EmailChangeStep.done:
          _showChangeEmail = false;
          _resetEmailFlow();
          break;
      }
    });
  }

  Future<void> _requestCurrentOtp() async {
    final password = _password.trim();
    if (password.isEmpty) {
      setState(() => _emailError = 'Please enter your current password.');
      return;
    }

    setState(() {
      _emailSubmitting = true;
      _emailError = null;
      _emailSuccess = null;
    });

    try {
      final res = await ProfileService.requestChangeEmailCurrentOtp(
        password: password,
      );
      if (!mounted) return;
      setState(() {
        _currentExpiresSec = (res['expiresSec'] as num?)?.toInt();
        _currentCooldown = 60;
        _password = '';
        _emailStep = _EmailChangeStep.currentOtp;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        if (e.retryAfterSec != null && e.retryAfterSec! > 0) {
          _currentCooldown = e.retryAfterSec!;
          _emailError = 'OTP was just sent. Please wait before retrying.';
        } else {
          _emailError = e.message;
        }
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _emailError = 'Unable to send OTP.';
      });
    } finally {
      if (!mounted) return;
      setState(() {
        _emailSubmitting = false;
      });
    }
  }

  Future<void> _verifyCurrentOtp() async {
    final code = _currentOtp.trim();
    if (code.isEmpty) {
      setState(() => _emailError = 'Please enter the OTP.');
      return;
    }

    setState(() {
      _emailSubmitting = true;
      _emailError = null;
      _emailSuccess = null;
    });

    try {
      await ProfileService.verifyChangeEmailCurrentOtp(code: code);
      if (!mounted) return;
      setState(() {
        _emailStep = _EmailChangeStep.newEmail;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _emailError = e.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _emailError = 'Invalid or expired OTP.';
      });
    } finally {
      if (!mounted) return;
      setState(() {
        _emailSubmitting = false;
      });
    }
  }

  Future<void> _requestNewOtp() async {
    final newEmail = _newEmail.trim().toLowerCase();
    if (newEmail.isEmpty || !_emailRegex.hasMatch(newEmail)) {
      setState(() => _emailError = 'The new email address is invalid.');
      return;
    }

    setState(() {
      _emailSubmitting = true;
      _emailError = null;
      _emailSuccess = null;
    });

    try {
      final res = await ProfileService.requestChangeEmailNewOtp(
        newEmail: newEmail,
      );
      if (!mounted) return;
      setState(() {
        _newExpiresSec = (res['expiresSec'] as num?)?.toInt();
        _newCooldown = 60;
        _emailStep = _EmailChangeStep.newOtp;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        if (e.retryAfterSec != null && e.retryAfterSec! > 0) {
          _newCooldown = e.retryAfterSec!;
          _emailError = 'OTP was just sent. Please wait before retrying.';
        } else {
          _emailError = e.message;
        }
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _emailError = 'Unable to send OTP to the new email.';
      });
    } finally {
      if (!mounted) return;
      setState(() {
        _emailSubmitting = false;
      });
    }
  }

  Future<void> _verifyNewOtp() async {
    final code = _newOtp.trim();
    if (code.isEmpty) {
      setState(() => _emailError = 'Please enter the OTP.');
      return;
    }

    setState(() {
      _emailSubmitting = true;
      _emailError = null;
      _emailSuccess = null;
    });

    try {
      final res = await ProfileService.verifyChangeEmailNewOtp(code: code);
      final nextToken = res['accessToken'] as String?;
      final nextEmail = (res['email'] as String?)?.trim();
      if (nextToken != null && nextToken.isNotEmpty) {
        await AuthStorage.saveAccessToken(nextToken);
      }
      if (!mounted) return;
      setState(() {
        if (nextEmail != null && nextEmail.isNotEmpty) {
          _currentEmail = nextEmail;
        }
        _emailStep = _EmailChangeStep.done;
        _emailSuccess = 'Email updated successfully.';
      });
      Future.delayed(const Duration(milliseconds: 1200), () {
        if (!mounted) return;
        setState(() {
          _showChangeEmail = false;
          _resetEmailFlow();
        });
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _emailError = e.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _emailError = 'Invalid or expired OTP.';
      });
    } finally {
      if (!mounted) return;
      setState(() {
        _emailSubmitting = false;
      });
    }
  }

  Future<void> _loadCreatorVerificationStatus() async {
    setState(() {
      _creatorLoading = true;
      _creatorError = null;
    });
    try {
      final res = await ProfileService.fetchCreatorVerificationStatus();
      if (!mounted) return;
      setState(() {
        _creatorStatus = _CreatorStatusResponse.fromJson(res);
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _creatorError = e.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _creatorError = 'Unable to load creator verification status.';
      });
    } finally {
      if (!mounted) return;
      setState(() {
        _creatorLoading = false;
      });
    }
  }

  Future<void> _submitCreatorVerification() async {
    setState(() {
      _creatorSubmitting = true;
      _creatorError = null;
      _creatorSuccess = null;
    });
    try {
      await ProfileService.submitCreatorVerificationRequest(
        note: _creatorNote.trim().isEmpty ? null : _creatorNote.trim(),
      );
      if (!mounted) return;
      setState(() {
        _creatorNote = '';
        _creatorSuccess =
            'Your creator verification request has been submitted.';
      });
      await _loadCreatorVerificationStatus();
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _creatorError = e.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _creatorError = 'Unable to submit creator verification request.';
      });
    } finally {
      if (!mounted) return;
      setState(() {
        _creatorSubmitting = false;
      });
    }
  }

  Future<void> _loadPasswordSecurityStatus() async {
    setState(() {
      _passwordStatusLoading = true;
      _twoFactorLoading = true;
      _passkeyStatusLoading = true;
    });
    try {
      final results = await Future.wait([
        ProfileService.fetchPasswordChangeStatus(),
        ProfileService.fetchTwoFactorStatus(),
        ProfileService.fetchPasskeyStatus(),
      ]);
      if (!mounted) return;
      final password = results[0];
      final twoFactor = results[1];
      final passkey = results[2];
      setState(() {
        _passwordChangedAt = password['lastChangedAt'] as String?;
        _twoFactorEnabled = twoFactor['enabled'] as bool? ?? false;
        _hasPasskey = passkey['hasPasskey'] as bool? ?? false;
        _passkeyEnabled = _hasPasskey
            ? (passkey['enabled'] as bool? ?? false)
            : false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _passwordChangedAt = null;
        _twoFactorEnabled = false;
        _hasPasskey = false;
        _passkeyEnabled = false;
      });
    } finally {
      if (!mounted) return;
      setState(() {
        _passwordStatusLoading = false;
        _twoFactorLoading = false;
        _passkeyStatusLoading = false;
      });
    }
  }

  void _resetPasswordFlow() {
    _passwordStep = _PasswordChangeStep.otp;
    _passwordOtp = '';
    _passwordCurrent = '';
    _passwordNew = '';
    _passwordConfirm = '';
    _passwordSubmitting = false;
    _passwordError = null;
    _passwordSuccess = null;
    _passwordCooldown = 0;
    _passwordExpiresSec = null;
    _passwordLogoutPrompt = false;
    _passwordLogoutSubmitting = false;
    _passwordLogoutError = null;
  }

  Future<void> _openChangePassword() async {
    setState(() {
      _resetPasswordFlow();
      _showChangePassword = true;
    });
    await _requestPasswordOtp(silent: true);
  }

  void _handlePasswordBack() {
    setState(() {
      if (_passwordStep == _PasswordChangeStep.otp) {
        _showChangePassword = false;
        _resetPasswordFlow();
        return;
      }
      if (_passwordStep == _PasswordChangeStep.form) {
        _passwordStep = _PasswordChangeStep.otp;
        return;
      }
      _showChangePassword = false;
      _resetPasswordFlow();
    });
  }

  Future<void> _requestPasswordOtp({bool silent = false}) async {
    if (!silent) {
      setState(() {
        _passwordError = null;
        _passwordSuccess = null;
      });
    }
    setState(() => _passwordSubmitting = true);
    try {
      final res = await ProfileService.requestPasswordChangeOtp();
      if (!mounted) return;
      setState(() {
        _passwordExpiresSec = (res['expiresSec'] as num?)?.toInt();
        _passwordCooldown = 60;
        _passwordStep = _PasswordChangeStep.otp;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        if (e.retryAfterSec != null && e.retryAfterSec! > 0) {
          _passwordCooldown = e.retryAfterSec!;
          _passwordError = 'OTP was just sent. Please wait before retrying.';
        } else {
          _passwordError = e.message;
        }
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _passwordError = 'Unable to send OTP.');
    } finally {
      if (!mounted) return;
      setState(() => _passwordSubmitting = false);
    }
  }

  Future<void> _verifyPasswordOtp() async {
    final code = _passwordOtp.trim();
    if (code.isEmpty) {
      setState(() => _passwordError = 'Please enter the OTP.');
      return;
    }
    setState(() {
      _passwordSubmitting = true;
      _passwordError = null;
      _passwordSuccess = null;
    });
    try {
      await ProfileService.verifyPasswordChangeOtp(code: code);
      if (!mounted) return;
      setState(() => _passwordStep = _PasswordChangeStep.form);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _passwordError = e.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _passwordError = 'Invalid or expired OTP.');
    } finally {
      if (!mounted) return;
      setState(() => _passwordSubmitting = false);
    }
  }

  Future<void> _confirmPasswordChange() async {
    final current = _passwordCurrent.trim();
    final next = _passwordNew.trim();
    final confirm = _passwordConfirm.trim();

    if (current.isEmpty) {
      setState(() => _passwordError = 'Please enter your current password.');
      return;
    }
    if (next.isEmpty) {
      setState(() => _passwordError = 'Please enter a new password.');
      return;
    }
    if (next == current) {
      setState(() {
        _passwordError =
            'New password must be different from your current password.';
      });
      return;
    }
    if (!_passwordRegex.hasMatch(next)) {
      setState(() {
        _passwordError =
            'Password must be at least 8 characters and include uppercase, lowercase, and a number.';
      });
      return;
    }
    if (next != confirm) {
      setState(() => _passwordError = 'New passwords do not match.');
      return;
    }

    setState(() {
      _passwordSubmitting = true;
      _passwordError = null;
      _passwordSuccess = null;
    });
    try {
      await ProfileService.confirmPasswordChange(
        currentPassword: current,
        newPassword: next,
      );
      if (!mounted) return;
      setState(() {
        _passwordChangedAt = DateTime.now().toIso8601String();
        _passwordStep = _PasswordChangeStep.done;
        _passwordSuccess = 'Password updated successfully.';
        _passwordLogoutPrompt = true;
        _passwordCurrent = '';
        _passwordNew = '';
        _passwordConfirm = '';
        _passwordOtp = '';
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _passwordError = e.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _passwordError = 'Unable to change password.');
    } finally {
      if (!mounted) return;
      setState(() => _passwordSubmitting = false);
    }
  }

  Future<void> _logoutOtherDevicesAfterPassword() async {
    setState(() {
      _passwordLogoutSubmitting = true;
      _passwordLogoutError = null;
    });
    try {
      await ProfileService.logoutAllDevices(deviceId: AuthStorage.deviceId);
      if (!mounted) return;
      setState(() {
        _passwordLogoutPrompt = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _passwordLogoutError = e.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _passwordLogoutError = 'Unable to log out other devices.');
    } finally {
      if (!mounted) return;
      setState(() => _passwordLogoutSubmitting = false);
    }
  }

  void _resetTwoFactorFlow() {
    _twoFactorStep = _TwoFactorStep.otp;
    _twoFactorOtp = '';
    _twoFactorError = null;
    _twoFactorSuccess = null;
    _twoFactorSubmitting = false;
    _twoFactorCooldown = 0;
    _twoFactorExpiresSec = null;
  }

  Future<void> _openTwoFactorFlow(bool enable) async {
    setState(() {
      _resetTwoFactorFlow();
      _twoFactorTarget = enable;
      _showTwoFactorFlow = true;
    });
    await _requestTwoFactorOtp(enable, silent: true);
  }

  Future<void> _requestTwoFactorOtp(bool enable, {bool silent = false}) async {
    if (!silent) {
      setState(() {
        _twoFactorError = null;
        _twoFactorSuccess = null;
      });
    }
    setState(() => _twoFactorSubmitting = true);
    try {
      final res = await ProfileService.requestTwoFactorOtp(enable: enable);
      if (!mounted) return;
      setState(() {
        _twoFactorExpiresSec = (res['expiresSec'] as num?)?.toInt();
        _twoFactorCooldown = 60;
        _twoFactorStep = _TwoFactorStep.otp;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        if (e.retryAfterSec != null && e.retryAfterSec! > 0) {
          _twoFactorCooldown = e.retryAfterSec!;
          _twoFactorError = 'OTP was just sent. Please wait before retrying.';
        } else {
          _twoFactorError = e.message;
        }
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _twoFactorError = 'Unable to send OTP.');
    } finally {
      if (!mounted) return;
      setState(() => _twoFactorSubmitting = false);
    }
  }

  Future<void> _verifyTwoFactorOtp() async {
    final code = _twoFactorOtp.trim();
    if (code.isEmpty) {
      setState(() => _twoFactorError = 'Please enter the OTP.');
      return;
    }
    setState(() {
      _twoFactorSubmitting = true;
      _twoFactorError = null;
      _twoFactorSuccess = null;
    });
    try {
      final res = await ProfileService.verifyTwoFactorOtp(
        code: code,
        enable: _twoFactorTarget,
      );
      if (!mounted) return;
      final enabled = res['enabled'] as bool? ?? _twoFactorTarget;
      setState(() {
        _twoFactorEnabled = enabled;
        _twoFactorStep = _TwoFactorStep.done;
        _twoFactorSuccess = enabled
            ? 'Two-factor authentication enabled.'
            : 'Two-factor authentication disabled.';
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _twoFactorError = e.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _twoFactorError = 'Invalid or expired OTP.');
    } finally {
      if (!mounted) return;
      setState(() => _twoFactorSubmitting = false);
    }
  }

  void _handleTwoFactorBack() {
    setState(() {
      _showTwoFactorFlow = false;
      _resetTwoFactorFlow();
    });
  }

  void _resetPasskeyFlow() {
    _passkeyStep = _PasskeyStep.password;
    _passkeyPassword = '';
    _passkeyOtp = '';
    _passkeyCurrent = '';
    _passkeyNew = '';
    _passkeyConfirm = '';
    _showCurrentPasskey = false;
    _passkeySubmitting = false;
    _passkeyError = null;
    _passkeySuccess = null;
    _passkeyCooldown = 0;
    _passkeyExpiresSec = null;
  }

  void _resetPasswordSecurityViewState({bool keepStatus = false}) {
    _showChangePassword = false;
    _resetPasswordFlow();

    _showTwoFactorFlow = false;
    _resetTwoFactorFlow();

    _showPasskeyFlow = false;
    _resetPasskeyFlow();
    _passkeyToggleSubmitting = false;
    _passkeyToggleError = null;

    _showLoginDevices = false;
    _loginDevicesLoading = false;
    _loginDevicesError = null;
    _loginDevices..clear();
    _loginDevicesCurrent = null;
    _logoutDeviceSubmitting.clear();
    _logoutAllSubmitting = false;
    _logoutAllError = null;

    if (!keepStatus) {
      _passwordStatusLoading = false;
      _twoFactorLoading = false;
      _passkeyStatusLoading = false;
      _passwordChangedAt = null;
      _twoFactorEnabled = false;
      _hasPasskey = false;
      _passkeyEnabled = false;
    }
  }

  void _openPasskeyFlow() {
    setState(() {
      _resetPasskeyFlow();
      _showPasskeyFlow = true;
    });
  }

  void _handlePasskeyBack() {
    setState(() {
      if (_passkeyStep == _PasskeyStep.password) {
        _showPasskeyFlow = false;
        _resetPasskeyFlow();
        return;
      }
      if (_passkeyStep == _PasskeyStep.otp) {
        _passkeyStep = _PasskeyStep.password;
        return;
      }
      if (_passkeyStep == _PasskeyStep.form) {
        _passkeyStep = _PasskeyStep.otp;
        return;
      }
      _showPasskeyFlow = false;
      _resetPasskeyFlow();
    });
  }

  Future<void> _requestPasskeyOtp() async {
    final password = _passkeyPassword.trim();
    if (password.isEmpty) {
      setState(() => _passkeyError = 'Please enter your current password.');
      return;
    }

    setState(() {
      _passkeySubmitting = true;
      _passkeyError = null;
      _passkeySuccess = null;
    });
    try {
      final res = await ProfileService.requestPasskeyOtp(password: password);
      if (!mounted) return;
      setState(() {
        _passkeyExpiresSec = (res['expiresSec'] as num?)?.toInt();
        _passkeyCooldown = 60;
        _passkeyStep = _PasskeyStep.otp;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        if (e.retryAfterSec != null && e.retryAfterSec! > 0) {
          _passkeyCooldown = e.retryAfterSec!;
          _passkeyError = 'OTP was just sent. Please wait before retrying.';
        } else {
          _passkeyError = e.message;
        }
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _passkeyError = 'Unable to send OTP.');
    } finally {
      if (!mounted) return;
      setState(() => _passkeySubmitting = false);
    }
  }

  Future<void> _verifyPasskeyOtp() async {
    final code = _passkeyOtp.trim();
    if (code.isEmpty) {
      setState(() => _passkeyError = 'Please enter the OTP.');
      return;
    }

    setState(() {
      _passkeySubmitting = true;
      _passkeyError = null;
      _passkeySuccess = null;
    });
    try {
      final res = await ProfileService.verifyPasskeyOtp(code: code);
      if (!mounted) return;
      setState(() {
        _hasPasskey = res['hasPasskey'] as bool? ?? false;
        _passkeyCurrent = (res['currentPasskey'] as String?) ?? '';
        _passkeyStep = _PasskeyStep.form;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _passkeyError = e.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _passkeyError = 'Invalid or expired OTP.');
    } finally {
      if (!mounted) return;
      setState(() => _passkeySubmitting = false);
    }
  }

  Future<void> _confirmPasskey() async {
    final next = _passkeyNew.trim();
    final confirm = _passkeyConfirm.trim();
    if (_hasPasskey && _passkeyCurrent.trim().isEmpty) {
      setState(() => _passkeyError = 'Current passkey is required.');
      return;
    }
    if (next.isEmpty) {
      setState(() => _passkeyError = 'Please enter a new passkey.');
      return;
    }
    if (!_passkeyRegex.hasMatch(next)) {
      setState(() => _passkeyError = 'Passkey must be exactly 6 digits.');
      return;
    }
    if (next != confirm) {
      setState(() => _passkeyError = 'Passkeys do not match.');
      return;
    }
    if (_hasPasskey && next == _passkeyCurrent) {
      setState(() {
        _passkeyError = 'New passkey must be different from current passkey.';
      });
      return;
    }

    setState(() {
      _passkeySubmitting = true;
      _passkeyError = null;
      _passkeySuccess = null;
    });
    try {
      await ProfileService.confirmPasskey(
        currentPasskey: _hasPasskey ? _passkeyCurrent : null,
        newPasskey: next,
      );
      if (!mounted) return;
      setState(() {
        _hasPasskey = true;
        _passkeyEnabled = true;
        _passkeyCurrent = next;
        _passkeyStep = _PasskeyStep.done;
        _passkeySuccess = 'Passkey updated successfully.';
        _passkeyOtp = '';
        _passkeyNew = '';
        _passkeyConfirm = '';
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _passkeyError = e.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _passkeyError = 'Unable to update passkey.');
    } finally {
      if (!mounted) return;
      setState(() => _passkeySubmitting = false);
    }
  }

  Future<void> _togglePasskey() async {
    setState(() {
      _passkeyToggleSubmitting = true;
      _passkeyToggleError = null;
    });
    try {
      final res = await ProfileService.togglePasskey(enabled: !_passkeyEnabled);
      if (!mounted) return;
      setState(() {
        _passkeyEnabled = res['enabled'] as bool? ?? !_passkeyEnabled;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _passkeyToggleError = e.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _passkeyToggleError = 'Unable to update passkey.');
    } finally {
      if (!mounted) return;
      setState(() => _passkeyToggleSubmitting = false);
    }
  }

  String _resolveDeviceName(Map<String, dynamic> device) {
    final userAgent = (device['userAgent'] as String?)?.trim() ?? '';
    final loginMethod =
        ((device['loginMethod'] as String?)?.trim().toLowerCase() ?? '');
    final uaLower = userAgent.toLowerCase();
    final info = (device['deviceInfo'] as String?)?.trim() ?? '';
    final infoLower = info.toLowerCase();
    final browser = (device['browser'] as String?)?.trim() ?? '';
    final os = (device['os'] as String?)?.trim() ?? '';
    final browserLower = browser.toLowerCase();
    final type = (device['deviceType'] as String?)?.trim().toLowerCase() ?? '';

    final looksLikeMobileApp =
        infoLower.contains('cordigram') ||
        infoLower.contains('flutter') ||
        uaLower.contains('cordigramapp') ||
        uaLower.contains('dart/') ||
        (type == 'mobile' &&
            loginMethod == 'password' &&
            (browserLower == 'chrome' || browserLower == 'unknown'));

    if (looksLikeMobileApp) {
      final hasSpecificModel =
          info.isNotEmpty &&
          !infoLower.contains('cordigram mobile app') &&
          !infoLower.contains('cordigram app');
      if (hasSpecificModel) return info;
      final osLabel = (os.isNotEmpty && os.toLowerCase() != 'unknown')
          ? os
          : 'Mobile';
      return 'Cordigram App on $osLabel';
    }

    if (info.isNotEmpty) return info;
    final parts = <String>[
      if (browser.isNotEmpty) browser,
      if (os.isNotEmpty) os,
    ];
    if (parts.isNotEmpty) return parts.join(' on ');
    return type.isEmpty ? 'Unknown device' : '$type device';
  }

  String _resolveDeviceTime(Map<String, dynamic> device) {
    final raw =
        (device['lastSeenAt'] as String?) ?? (device['firstSeenAt'] as String?);
    final text = _formatRelativeTime(raw);
    if (text.isEmpty) return '';
    return 'Last active $text.';
  }

  bool get _hasOtherLoginDevices {
    if (_loginDevicesCurrent == null || _loginDevices.isEmpty) return false;
    return _loginDevices.any(
      (d) => (d['deviceIdHash'] as String?) != _loginDevicesCurrent,
    );
  }

  Future<void> _openLoginDevices() async {
    setState(() {
      _showLoginDevices = true;
      _loginDevicesError = null;
      _logoutAllError = null;
    });
    await _loadLoginDevices();
  }

  Future<void> _loadLoginDevices() async {
    setState(() => _loginDevicesLoading = true);
    try {
      final res = await ProfileService.fetchLoginDevices(
        deviceId: AuthStorage.deviceId,
      );
      final devices = (res['devices'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .toList();
      if (!mounted) return;
      setState(() {
        _loginDevices
          ..clear()
          ..addAll(devices);
        _loginDevicesCurrent = res['currentDeviceIdHash'] as String?;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _loginDevicesError = e.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _loginDevicesError = 'Unable to load login devices.');
    } finally {
      if (!mounted) return;
      setState(() => _loginDevicesLoading = false);
    }
  }

  Future<void> _logoutDevice(String deviceIdHash) async {
    setState(() {
      _logoutDeviceSubmitting.add(deviceIdHash);
    });
    try {
      await ProfileService.logoutLoginDevice(deviceIdHash: deviceIdHash);
      if (!mounted) return;
      setState(() {
        _loginDevices.removeWhere((d) => d['deviceIdHash'] == deviceIdHash);
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _loginDevicesError = e.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _loginDevicesError = 'Unable to log out this device.');
    } finally {
      if (!mounted) return;
      setState(() {
        _logoutDeviceSubmitting.remove(deviceIdHash);
      });
    }
  }

  Future<void> _logoutAllDevices() async {
    if (_loginDevicesCurrent == null || _loginDevicesCurrent!.isEmpty) {
      setState(() => _logoutAllError = 'Unable to detect this device.');
      return;
    }
    setState(() {
      _logoutAllSubmitting = true;
      _logoutAllError = null;
    });
    try {
      final res = await ProfileService.logoutAllDevices(
        deviceId: AuthStorage.deviceId,
      );
      if (!mounted) return;
      final currentHash =
          (res['currentDeviceIdHash'] as String?) ?? _loginDevicesCurrent;
      setState(() {
        _loginDevicesCurrent = currentHash;
        _loginDevices.removeWhere(
          (d) => (d['deviceIdHash'] as String?) != currentHash,
        );
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _logoutAllError = e.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _logoutAllError = 'Unable to log out devices.');
    } finally {
      if (!mounted) return;
      setState(() => _logoutAllSubmitting = false);
    }
  }

  String _formatRelativeTime(String? value) {
    if (value == null || value.isEmpty) return '';
    final dt = DateTime.tryParse(value);
    if (dt == null) return '';
    final diff = DateTime.now().difference(dt);
    if (diff.inMinutes < 1) return 'just now';
    if (diff.inHours < 1) return '${diff.inMinutes}m ago';
    if (diff.inDays < 1) return '${diff.inHours}h ago';
    if (diff.inDays < 30) return '${diff.inDays}d ago';
    final months = (diff.inDays / 30).floor();
    if (months < 12) return '${months}mo ago';
    final years = (diff.inDays / 365).floor();
    return '${years}y ago';
  }

  String _formatRequirementLabel(String value) {
    switch (value) {
      case 'account_age':
        return 'Account age';
      case 'followers_count':
        return 'Followers';
      case 'posts_count':
        return 'Posts';
      case 'active_posting_days_30d':
        return 'Active posting days (30d)';
      case 'engagement_per_post_30d':
        return 'Average engagement/post (30d)';
      case 'recent_violations_90d':
        return 'Recent violations (90d)';
      case 'score':
        return 'Creator score';
      default:
        return value;
    }
  }

  String _formatNum(num value) {
    if (value % 1 == 0) return value.toInt().toString();
    return value.toStringAsFixed(1);
  }

  String _sectionTitle(SettingsTab tab) {
    switch (tab) {
      case SettingsTab.personalInfo:
        return 'Personal info';
      case SettingsTab.profile:
        return 'Profile';
      case SettingsTab.creatorVerification:
        return 'Creator verification';
      case SettingsTab.passwordSecurity:
        return 'Password & Security';
    }
  }

  IconData _sectionIcon(SettingsTab tab) {
    switch (tab) {
      case SettingsTab.personalInfo:
        return Icons.person_outline_rounded;
      case SettingsTab.profile:
        return Icons.account_circle_outlined;
      case SettingsTab.creatorVerification:
        return Icons.verified_outlined;
      case SettingsTab.passwordSecurity:
        return Icons.lock_outline_rounded;
    }
  }

  String _sectionDescription(SettingsTab tab) {
    switch (tab) {
      case SettingsTab.personalInfo:
        return 'Account email and personal details shown on your profile.';
      case SettingsTab.profile:
        return 'Control who can view profile sections and follower lists.';
      case SettingsTab.creatorVerification:
        return 'Check eligibility and request creator badge verification.';
      case SettingsTab.passwordSecurity:
        return 'Manage password, two-factor, passkey, and login devices.';
    }
  }

  void _openSection(SettingsTab tab) {
    final previous = _selectedTab;
    setState(() {
      if (tab == SettingsTab.passwordSecurity) {
        _resetPasswordSecurityViewState();
      }
      if (previous == SettingsTab.passwordSecurity &&
          tab != SettingsTab.passwordSecurity) {
        _resetPasswordSecurityViewState();
      }
      _selectedTab = tab;
    });
    if (tab == SettingsTab.creatorVerification &&
        _creatorStatus == null &&
        !_creatorLoading) {
      _loadCreatorVerificationStatus();
    }
    if (tab == SettingsTab.passwordSecurity &&
        !_passwordStatusLoading &&
        !_twoFactorLoading &&
        !_passkeyStatusLoading) {
      _loadPasswordSecurityStatus();
    }
  }

  String _toVisibilityLabel(String value) {
    if (value == 'private') return 'Private';
    if (value == 'followers') return 'Followers';
    return 'Public';
  }

  String _visibilityOf(String key) {
    final vis = _profile?.visibility;
    if (vis == null) return 'public';
    switch (key) {
      case 'gender':
        return vis.gender;
      case 'birthdate':
        return vis.birthdate;
      case 'location':
        return vis.location;
      case 'workplace':
        return vis.workplace;
      case 'bio':
        return vis.bio;
      case 'followers':
        return vis.followers;
      case 'following':
        return vis.following;
      case 'about':
        return vis.about;
      case 'profile':
        return vis.profile;
      default:
        return 'public';
    }
  }

  ProfileVisibility _applyVisibility(
    ProfileVisibility? current,
    String field,
    String value,
  ) {
    final base = current ?? ProfileVisibility();
    return ProfileVisibility(
      gender: field == 'gender' ? value : base.gender,
      birthdate: field == 'birthdate' ? value : base.birthdate,
      location: field == 'location' ? value : base.location,
      workplace: field == 'workplace' ? value : base.workplace,
      bio: field == 'bio' ? value : base.bio,
      followers: field == 'followers' ? value : base.followers,
      following: field == 'following' ? value : base.following,
      about: field == 'about' ? value : base.about,
      profile: field == 'profile' ? value : base.profile,
    );
  }

  Future<void> _pickVisibility(String field, String currentValue) async {
    final selected = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: Colors.transparent,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        return SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(10, 0, 10, 10),
            child: Container(
              decoration: BoxDecoration(
                color: _surface,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: _border),
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const SizedBox(height: 10),
                  Container(
                    width: 36,
                    height: 4,
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.2),
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                  const SizedBox(height: 6),
                  for (final option in _visibilityOptions)
                    ListTile(
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 18,
                        vertical: 2,
                      ),
                      title: Text(
                        _toVisibilityLabel(option),
                        style: const TextStyle(color: _textPrimary),
                      ),
                      trailing: option == currentValue
                          ? const Icon(Icons.check_rounded, color: _accent)
                          : null,
                      onTap: () => Navigator.pop(ctx, option),
                    ),
                  const SizedBox(height: 10),
                ],
              ),
            ),
          ),
        );
      },
    );

    if (selected == null || selected == currentValue) return;
    await _updateVisibility(field, selected);
  }

  Future<void> _updateVisibility(String field, String value) async {
    final prev = _profile;
    if (prev == null) return;

    final payloadKey = {
      'gender': 'genderVisibility',
      'birthdate': 'birthdateVisibility',
      'location': 'locationVisibility',
      'workplace': 'workplaceVisibility',
      'bio': 'bioVisibility',
      'followers': 'followersVisibility',
      'following': 'followingVisibility',
      'about': 'aboutVisibility',
      'profile': 'profileVisibility',
    }[field];

    if (payloadKey == null) return;

    final optimistic = prev.copyWith(
      visibility: _applyVisibility(prev.visibility, field, value),
    );

    setState(() {
      _visibilityError = null;
      _profile = optimistic;
      _visibilitySaving[field] = true;
    });

    try {
      final updated = await ProfileService.updateProfile({payloadKey: value});
      if (!mounted) return;
      setState(() {
        _profile = updated;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _profile = prev;
        _visibilityError = e.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _profile = prev;
        _visibilityError = 'Unable to update visibility setting.';
      });
    } finally {
      if (!mounted) return;
      setState(() {
        _visibilitySaving[field] = false;
      });
    }
  }

  String _valueOrNotSet(String? value, {bool prefixAt = false}) {
    final text = value?.trim() ?? '';
    if (text.isEmpty) return 'Not set';
    return prefixAt ? '@$text' : text;
  }

  String _displayBirthdate(String? raw) {
    if (raw == null || raw.trim().isEmpty) return 'Not set';
    try {
      final dt = DateTime.parse(raw);
      const months = [
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec',
      ];
      return '${months[dt.month - 1]} ${dt.day}, ${dt.year}';
    } catch (_) {
      return raw;
    }
  }

  Widget _buildSettingsMenu() {
    final sections = SettingsTab.values;
    return ListView.separated(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
      itemCount: sections.length + 1,
      separatorBuilder: (_, __) => const SizedBox(height: 10),
      itemBuilder: (context, index) {
        if (index == 0) {
          return const Padding(
            padding: EdgeInsets.only(bottom: 6),
            child: Text(
              '',
              style: TextStyle(
                color: _textPrimary,
                fontSize: 20,
                fontWeight: FontWeight.w700,
              ),
            ),
          );
        }
        final section = sections[index - 1];
        return InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: () => _openSection(section),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
            decoration: BoxDecoration(
              color: _surface,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: _border),
            ),
            child: Row(
              children: [
                Container(
                  width: 38,
                  height: 38,
                  decoration: BoxDecoration(
                    color: _accent.withValues(alpha: 0.14),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(_sectionIcon(section), color: _accent, size: 20),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        _sectionTitle(section),
                        style: const TextStyle(
                          color: _textPrimary,
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        _sectionDescription(section),
                        style: const TextStyle(
                          color: _textSecondary,
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                const Icon(
                  Icons.chevron_right_rounded,
                  color: _textSecondary,
                  size: 22,
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildSectionDetail() {
    final tab = _selectedTab ?? SettingsTab.personalInfo;
    if (tab == SettingsTab.personalInfo) return _buildPersonalInfoTab();
    if (tab == SettingsTab.profile) return _buildProfileTab();
    if (tab == SettingsTab.passwordSecurity) return _buildPasswordSecurityTab();
    return _buildCreatorVerificationTab();
  }

  String _stepLabel() {
    switch (_emailStep) {
      case _EmailChangeStep.password:
        return 'Step 1 · Verify password';
      case _EmailChangeStep.currentOtp:
        return 'Step 2 · Current email OTP';
      case _EmailChangeStep.newEmail:
        return 'Step 3 · Enter new email';
      case _EmailChangeStep.newOtp:
        return 'Step 4 · New email OTP';
      case _EmailChangeStep.done:
        return 'Completed';
    }
  }

  InputDecoration _emailInputDecoration(String hint) {
    return InputDecoration(
      hintText: hint,
      hintStyle: const TextStyle(color: _textSecondary),
      filled: true,
      fillColor: const Color(0xFF0F1A2F),
      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: _border.withValues(alpha: 0.9)),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: _border.withValues(alpha: 0.9)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: _accent),
      ),
    );
  }

  Widget _buildStepActions({
    String? secondaryLabel,
    VoidCallback? onSecondary,
    bool secondaryDisabled = false,
    required String primaryLabel,
    required VoidCallback? onPrimary,
  }) {
    return Row(
      children: [
        if (secondaryLabel != null && onSecondary != null)
          Expanded(
            child: OutlinedButton(
              onPressed: secondaryDisabled ? null : onSecondary,
              style: OutlinedButton.styleFrom(
                foregroundColor: _textPrimary,
                disabledForegroundColor: _textSecondary,
                side: BorderSide(color: _border),
                padding: const EdgeInsets.symmetric(vertical: 12),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10),
                ),
              ),
              child: Text(secondaryLabel),
            ),
          ),
        if (secondaryLabel != null && onSecondary != null)
          const SizedBox(width: 8),
        Expanded(
          child: ElevatedButton(
            onPressed: onPrimary,
            style: ElevatedButton.styleFrom(
              backgroundColor: _accent,
              foregroundColor: Colors.white,
              disabledBackgroundColor: const Color(0xFF2C456A),
              disabledForegroundColor: _textPrimary,
              padding: const EdgeInsets.symmetric(vertical: 12),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(10),
              ),
            ),
            child: Text(primaryLabel),
          ),
        ),
      ],
    );
  }

  Widget _buildAccountEmailSection() {
    final currentEmail = _currentEmail ?? 'Loading...';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Account email',
          style: TextStyle(
            color: _textPrimary,
            fontSize: 18,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 6),
        const Text(
          'Manage your sign-in email and verification steps.',
          style: TextStyle(color: _textSecondary, fontSize: 13),
        ),
        const SizedBox(height: 14),
        if (!_showChangeEmail)
          _buildCard(
            children: [
              Padding(
                padding: const EdgeInsets.all(14),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Current email',
                            style: TextStyle(
                              color: _textSecondary,
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            currentEmail,
                            style: const TextStyle(
                              color: _textPrimary,
                              fontSize: 14,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 10),
                    ElevatedButton(
                      onPressed: _openChangeEmail,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: _accent,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(
                          horizontal: 14,
                          vertical: 10,
                        ),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(10),
                        ),
                      ),
                      child: const Text('Change email'),
                    ),
                  ],
                ),
              ),
            ],
          )
        else
          _buildCard(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        TextButton.icon(
                          onPressed: _emailSubmitting ? null : _handleEmailBack,
                          icon: const Icon(
                            Icons.arrow_back_rounded,
                            size: 16,
                            color: _textPrimary,
                          ),
                          label: const Text(
                            'Back',
                            style: TextStyle(color: _textPrimary),
                          ),
                        ),
                        const Spacer(),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 6,
                          ),
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.06),
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: Text(
                            _stepLabel(),
                            style: const TextStyle(
                              color: _textSecondary,
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    if (_emailStep == _EmailChangeStep.password) ...[
                      const Text(
                        'Current password',
                        style: TextStyle(
                          color: _textPrimary,
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 8),
                      TextField(
                        key: const ValueKey('email-change-password-input'),
                        obscureText: true,
                        enableSuggestions: false,
                        autocorrect: false,
                        onChanged: (v) => _password = v,
                        style: const TextStyle(color: _textPrimary),
                        decoration: _emailInputDecoration(
                          'Enter your password',
                        ),
                      ),
                      const SizedBox(height: 8),
                      const Text(
                        'We\'ll send a 6-digit OTP to your current email.',
                        style: TextStyle(color: _textSecondary, fontSize: 12),
                      ),
                      const SizedBox(height: 12),
                      _buildStepActions(
                        primaryLabel: _emailSubmitting
                            ? 'Sending...'
                            : 'Send OTP',
                        onPrimary: _emailSubmitting ? null : _requestCurrentOtp,
                      ),
                    ],
                    if (_emailStep == _EmailChangeStep.currentOtp) ...[
                      const Text(
                        'Enter OTP from current email',
                        style: TextStyle(
                          color: _textPrimary,
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 8),
                      TextField(
                        key: const ValueKey('email-change-current-otp-input'),
                        keyboardType: TextInputType.number,
                        maxLength: 6,
                        onChanged: (v) =>
                            _currentOtp = v.replaceAll(RegExp(r'\D'), ''),
                        style: const TextStyle(color: _textPrimary),
                        decoration: _emailInputDecoration(
                          '------',
                        ).copyWith(counterText: ''),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        _currentExpiresSec != null
                            ? 'OTP expires in ${_currentExpiresSec}s.'
                            : 'OTP expires in 5 minutes.',
                        style: const TextStyle(
                          color: _textSecondary,
                          fontSize: 12,
                        ),
                      ),
                      const SizedBox(height: 12),
                      _buildStepActions(
                        secondaryLabel: _currentCooldown > 0
                            ? 'Resend (${_currentCooldown}s)'
                            : 'Resend OTP',
                        onSecondary: _requestCurrentOtp,
                        secondaryDisabled:
                            _emailSubmitting || _currentCooldown > 0,
                        primaryLabel: _emailSubmitting
                            ? 'Verifying...'
                            : 'Verify',
                        onPrimary: _emailSubmitting ? null : _verifyCurrentOtp,
                      ),
                    ],
                    if (_emailStep == _EmailChangeStep.newEmail) ...[
                      const Text(
                        'New email',
                        style: TextStyle(
                          color: _textPrimary,
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 8),
                      TextField(
                        key: const ValueKey('email-change-new-email-input'),
                        keyboardType: TextInputType.emailAddress,
                        onChanged: (v) => _newEmail = v,
                        style: const TextStyle(color: _textPrimary),
                        decoration: _emailInputDecoration('name@example.com'),
                      ),
                      const SizedBox(height: 8),
                      const Text(
                        'We\'ll send a 6-digit OTP to the new email.',
                        style: TextStyle(color: _textSecondary, fontSize: 12),
                      ),
                      const SizedBox(height: 4),
                      const Text(
                        'After this change, your old email is removed and sign-in uses the new email.',
                        style: TextStyle(color: _textSecondary, fontSize: 12),
                      ),
                      const SizedBox(height: 12),
                      _buildStepActions(
                        primaryLabel: _emailSubmitting
                            ? 'Sending...'
                            : 'Send OTP',
                        onPrimary: _emailSubmitting ? null : _requestNewOtp,
                      ),
                    ],
                    if (_emailStep == _EmailChangeStep.newOtp) ...[
                      const Text(
                        'OTP for new email',
                        style: TextStyle(
                          color: _textPrimary,
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 8),
                      TextField(
                        key: const ValueKey('email-change-new-otp-input'),
                        keyboardType: TextInputType.number,
                        maxLength: 6,
                        onChanged: (v) =>
                            _newOtp = v.replaceAll(RegExp(r'\D'), ''),
                        style: const TextStyle(color: _textPrimary),
                        decoration: _emailInputDecoration(
                          '------',
                        ).copyWith(counterText: ''),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        _newExpiresSec != null
                            ? 'OTP expires in ${_newExpiresSec}s.'
                            : 'OTP expires in 5 minutes.',
                        style: const TextStyle(
                          color: _textSecondary,
                          fontSize: 12,
                        ),
                      ),
                      const SizedBox(height: 12),
                      _buildStepActions(
                        secondaryLabel: _newCooldown > 0
                            ? 'Resend (${_newCooldown}s)'
                            : 'Resend OTP',
                        onSecondary: _requestNewOtp,
                        secondaryDisabled: _emailSubmitting || _newCooldown > 0,
                        primaryLabel: _emailSubmitting
                            ? 'Verifying...'
                            : 'Confirm',
                        onPrimary: _emailSubmitting ? null : _verifyNewOtp,
                      ),
                    ],
                    if (_emailStep == _EmailChangeStep.done)
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: const Color(0xFF1A2B4A),
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(
                            color: _accent.withValues(alpha: 0.4),
                          ),
                        ),
                        child: Text(
                          _emailSuccess ?? 'Email updated successfully.',
                          style: const TextStyle(color: _textPrimary),
                        ),
                      ),
                    if (_emailError != null) ...[
                      const SizedBox(height: 10),
                      Text(
                        _emailError!,
                        style: const TextStyle(color: _danger, fontSize: 12),
                      ),
                    ],
                    if (_emailSuccess != null &&
                        _emailStep != _EmailChangeStep.done) ...[
                      const SizedBox(height: 10),
                      Text(
                        _emailSuccess!,
                        style: const TextStyle(
                          color: _textPrimary,
                          fontSize: 12,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
      ],
    );
  }

  Widget _buildInfoRow({
    required String title,
    required String value,
    String? field,
    bool enabled = true,
  }) {
    final currentVisibility = field != null ? _visibilityOf(field) : null;
    final saving = field != null ? (_visibilitySaving[field] ?? false) : false;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      decoration: BoxDecoration(
        border: Border(
          bottom: BorderSide(color: Colors.white.withValues(alpha: 0.06)),
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    color: _textPrimary,
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 5),
                Text(
                  value,
                  style: const TextStyle(color: _textSecondary, fontSize: 13),
                ),
              ],
            ),
          ),
          if (field != null)
            Padding(
              padding: const EdgeInsets.only(left: 10),
              child: OutlinedButton(
                onPressed: (!enabled || saving)
                    ? null
                    : () => _pickVisibility(field, currentVisibility!),
                style: OutlinedButton.styleFrom(
                  foregroundColor: _textPrimary,
                  disabledForegroundColor: _textSecondary,
                  side: BorderSide(
                    color: saving ? _border : _accent.withValues(alpha: 0.6),
                  ),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(10),
                  ),
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 8,
                  ),
                  minimumSize: const Size(0, 36),
                  backgroundColor: saving
                      ? Colors.white.withValues(alpha: 0.04)
                      : Colors.transparent,
                ),
                child: Text(
                  saving ? 'Saving...' : _toVisibilityLabel(currentVisibility!),
                  style: TextStyle(
                    fontSize: 12,
                    color: (!enabled || saving) ? _textSecondary : _textPrimary,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildCard({required List<Widget> children}) {
    return Container(
      decoration: BoxDecoration(
        color: _surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: _border),
      ),
      child: Column(children: children),
    );
  }

  Widget _buildPersonalInfoTab() {
    final profile = _profile;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildAccountEmailSection(),
        const SizedBox(height: 18),
        const Text(
          'Personal info',
          style: TextStyle(
            color: _textPrimary,
            fontSize: 18,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 6),
        const Text(
          'Details shown on your profile.',
          style: TextStyle(color: _textSecondary, fontSize: 13),
        ),
        const SizedBox(height: 14),
        _buildCard(
          children: [
            _buildInfoRow(
              title: 'Display name',
              value: _valueOrNotSet(profile?.displayName),
            ),
            _buildInfoRow(
              title: 'Username',
              value: _valueOrNotSet(profile?.username, prefixAt: true),
            ),
            _buildInfoRow(
              title: 'Birthdate',
              value: _displayBirthdate(profile?.birthdate),
              field: 'birthdate',
              enabled: profile != null,
            ),
            _buildInfoRow(
              title: 'Gender',
              value: _valueOrNotSet(profile?.gender),
              field: 'gender',
              enabled: profile != null,
            ),
            _buildInfoRow(
              title: 'Location',
              value: _valueOrNotSet(profile?.location),
              field: 'location',
              enabled: profile != null,
            ),
            _buildInfoRow(
              title: 'Workplace',
              value: _valueOrNotSet(profile?.workplace?.companyName),
              field: 'workplace',
              enabled: profile != null,
            ),
            _buildInfoRow(
              title: 'Bio',
              value: _valueOrNotSet(profile?.bio),
              field: 'bio',
              enabled: profile != null,
            ),
          ],
        ),
        if (_visibilityError != null) ...[
          const SizedBox(height: 12),
          Text(
            _visibilityError!,
            style: const TextStyle(color: _danger, fontSize: 13),
          ),
        ],
        const SizedBox(height: 14),
        SizedBox(
          width: double.infinity,
          child: ElevatedButton(
            onPressed: profile == null
                ? null
                : () {
                    showProfileEditSheet(
                      context,
                      profile: profile,
                      onSaved: (updated) => setState(() => _profile = updated),
                    );
                  },
            style: ElevatedButton.styleFrom(
              backgroundColor: _accent,
              foregroundColor: Colors.white,
              disabledBackgroundColor: _border,
              padding: const EdgeInsets.symmetric(vertical: 12),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
            child: const Text('Edit profile'),
          ),
        ),
      ],
    );
  }

  Widget _buildProfileTab() {
    final profile = _profile;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Profile visibility',
          style: TextStyle(
            color: _textPrimary,
            fontSize: 18,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 6),
        const Text(
          'Control who can view your profile, About section, and follower lists.',
          style: TextStyle(color: _textSecondary, fontSize: 13),
        ),
        const SizedBox(height: 14),
        _buildCard(
          children: [
            _buildInfoRow(
              title: 'Profile page',
              value: 'Who can view your profile page and tabs.',
              field: 'profile',
              enabled: profile != null,
            ),
            _buildInfoRow(
              title: 'About this user',
              value: 'Who can open the About overlay on your profile.',
              field: 'about',
              enabled: profile != null,
            ),
            _buildInfoRow(
              title: 'Followers list',
              value: 'Who can view your followers list.',
              field: 'followers',
              enabled: profile != null,
            ),
            _buildInfoRow(
              title: 'Following list',
              value: 'Who can view the accounts you follow.',
              field: 'following',
              enabled: profile != null,
            ),
          ],
        ),
        if (_visibilityError != null) ...[
          const SizedBox(height: 12),
          Text(
            _visibilityError!,
            style: const TextStyle(color: _danger, fontSize: 13),
          ),
        ],
      ],
    );
  }

  Color _creatorStatusPillBg(String status) {
    final normalized = status.toLowerCase();
    if (normalized == 'approved') return const Color(0xFF164F32);
    if (normalized == 'rejected') return const Color(0xFF61252B);
    return const Color(0xFF2E3A58);
  }

  Widget _buildCreatorMetricRow({
    required String title,
    required String value,
    required String threshold,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        border: Border(
          bottom: BorderSide(color: Colors.white.withValues(alpha: 0.06)),
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    color: _textPrimary,
                    fontWeight: FontWeight.w600,
                    fontSize: 13,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  value,
                  style: const TextStyle(color: _textSecondary, fontSize: 13),
                ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Text(
            threshold,
            style: const TextStyle(color: _textSecondary, fontSize: 12),
          ),
        ],
      ),
    );
  }

  Widget _buildCreatorLatestRequest(_CreatorLatestRequest request) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFF101D35),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: _border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Text(
                'Latest request',
                style: TextStyle(
                  color: _textPrimary,
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: _creatorStatusPillBg(request.status),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  request.status,
                  style: const TextStyle(
                    color: _textPrimary,
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
          if ((request.createdAt ?? '').isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(
              'Submitted ${_formatRelativeTime(request.createdAt)}',
              style: const TextStyle(color: _textSecondary, fontSize: 12),
            ),
          ],
          if ((request.reviewedAt ?? '').isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(
              'Reviewed ${_formatRelativeTime(request.reviewedAt)}',
              style: const TextStyle(color: _textSecondary, fontSize: 12),
            ),
          ],
          if ((request.decisionReason ?? '').isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(
              'Reason: ${request.decisionReason}',
              style: const TextStyle(color: _textSecondary, fontSize: 12),
            ),
          ],
          if ((request.cooldownUntil ?? '').isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(
              'You can request again ${_formatRelativeTime(request.cooldownUntil)}',
              style: const TextStyle(color: _textSecondary, fontSize: 12),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildCreatorVerificationTab() {
    final status = _creatorStatus;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Creator verification',
          style: TextStyle(
            color: _textPrimary,
            fontSize: 18,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 6),
        const Text(
          'Apply for the blue creator badge and unlock creator privileges once your account meets quality requirements.',
          style: TextStyle(color: _textSecondary, fontSize: 13),
        ),
        const SizedBox(height: 14),
        _buildCard(
          children: [
            Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (_creatorLoading)
                    const Text(
                      'Loading creator eligibility...',
                      style: TextStyle(color: _textSecondary, fontSize: 13),
                    ),
                  if (status != null && status.account.isCreatorVerified) ...[
                    if (status.latestRequest != null)
                      _buildCreatorLatestRequest(status.latestRequest!),
                    const SizedBox(height: 10),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: const Color(0xFF17344F),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(
                          color: _accent.withValues(alpha: 0.45),
                        ),
                      ),
                      child: const Text(
                        'Your account is creator verified.',
                        style: TextStyle(color: _textPrimary),
                      ),
                    ),
                  ],
                  if (status != null && !status.account.isCreatorVerified) ...[
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: const Color(0xFF101D35),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: _border),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Creator score',
                            style: TextStyle(
                              color: _textPrimary,
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            '${_formatNum(status.eligibility.score)} / ${_formatNum(status.eligibility.minimumScore)}',
                            style: const TextStyle(
                              color: _textPrimary,
                              fontSize: 20,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            status.eligibility.eligible
                                ? 'Your account currently meets all conditions.'
                                : 'Improve the missing conditions below to become eligible.',
                            style: const TextStyle(
                              color: _textSecondary,
                              fontSize: 12,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                    _buildCard(
                      children: [
                        _buildCreatorMetricRow(
                          title: 'Account age',
                          value: '${status.eligibility.accountAgeDays} days',
                          threshold:
                              'Minimum ${status.criteria.minAccountAgeDays} days',
                        ),
                        _buildCreatorMetricRow(
                          title: 'Followers',
                          value: '${status.eligibility.followersCount}',
                          threshold:
                              'Minimum ${status.criteria.minFollowersCount}',
                        ),
                        _buildCreatorMetricRow(
                          title: 'Published posts',
                          value: '${status.eligibility.postsCount}',
                          threshold: 'Minimum ${status.criteria.minPostsCount}',
                        ),
                        _buildCreatorMetricRow(
                          title: 'Active posting days (30d)',
                          value: '${status.eligibility.activePostingDays30d}',
                          threshold:
                              'Minimum ${status.criteria.minActivePostingDays30d}',
                        ),
                        _buildCreatorMetricRow(
                          title: 'Avg engagement/post (30d)',
                          value: _formatNum(
                            status.eligibility.engagementPerPost30d,
                          ),
                          threshold:
                              'Minimum ${_formatNum(status.criteria.minEngagementPerPost30d)}',
                        ),
                        _buildCreatorMetricRow(
                          title: 'Recent violations (90d)',
                          value: '${status.eligibility.recentViolations90d}',
                          threshold:
                              'Maximum ${status.criteria.maxRecentViolations90d}',
                        ),
                      ],
                    ),
                    if (status.eligibility.failedRequirements.isNotEmpty) ...[
                      const SizedBox(height: 10),
                      Text(
                        'Missing requirements: ${status.eligibility.failedRequirements.map(_formatRequirementLabel).join(', ')}',
                        style: const TextStyle(color: _danger, fontSize: 12),
                      ),
                    ],
                    if (status.latestRequest != null) ...[
                      const SizedBox(height: 12),
                      _buildCreatorLatestRequest(status.latestRequest!),
                    ],
                    const SizedBox(height: 12),
                    const Text(
                      'Request note (optional)',
                      style: TextStyle(
                        color: _textPrimary,
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 8),
                    TextField(
                      key: const ValueKey('creator-request-note-input'),
                      minLines: 4,
                      maxLines: 4,
                      onChanged: (v) => _creatorNote = v,
                      style: const TextStyle(color: _textPrimary),
                      decoration: _emailInputDecoration(
                        'Share details that help admin understand your creator journey.',
                      ),
                    ),
                    if (_creatorError != null) ...[
                      const SizedBox(height: 10),
                      Text(
                        _creatorError!,
                        style: const TextStyle(color: _danger, fontSize: 12),
                      ),
                    ],
                    if (_creatorSuccess != null) ...[
                      const SizedBox(height: 10),
                      Text(
                        _creatorSuccess!,
                        style: const TextStyle(
                          color: _textPrimary,
                          fontSize: 12,
                        ),
                      ),
                    ],
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton(
                            onPressed: (_creatorLoading || _creatorSubmitting)
                                ? null
                                : _loadCreatorVerificationStatus,
                            style: OutlinedButton.styleFrom(
                              foregroundColor: _textPrimary,
                              disabledForegroundColor: _textSecondary,
                              side: BorderSide(color: _border),
                              padding: const EdgeInsets.symmetric(vertical: 12),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(10),
                              ),
                            ),
                            child: const Text('Refresh status'),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: ElevatedButton(
                            onPressed:
                                (_creatorSubmitting ||
                                    _creatorLoading ||
                                    !status.canRequest)
                                ? null
                                : _submitCreatorVerification,
                            style: ElevatedButton.styleFrom(
                              backgroundColor: _accent,
                              foregroundColor: Colors.white,
                              disabledBackgroundColor: const Color(0xFF2C456A),
                              disabledForegroundColor: _textPrimary,
                              padding: const EdgeInsets.symmetric(vertical: 12),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(10),
                              ),
                            ),
                            child: Text(
                              _creatorSubmitting
                                  ? 'Submitting...'
                                  : 'Request creator',
                              textAlign: TextAlign.center,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                  if (_creatorError != null && status == null)
                    Text(
                      _creatorError!,
                      style: const TextStyle(color: _danger, fontSize: 12),
                    ),
                ],
              ),
            ),
          ],
        ),
      ],
    );
  }

  String _passwordStepLabel() {
    if (_passwordStep == _PasswordChangeStep.otp) return 'Step 1 · Email OTP';
    if (_passwordStep == _PasswordChangeStep.form) {
      return 'Step 2 · Update password';
    }
    return 'Completed';
  }

  String _passkeyStepLabel() {
    if (_passkeyStep == _PasskeyStep.password)
      return 'Step 1 · Verify password';
    if (_passkeyStep == _PasskeyStep.otp) return 'Step 2 · Email OTP';
    if (_passkeyStep == _PasskeyStep.form) {
      return _hasPasskey ? 'Step 3 · Change passkey' : 'Step 3 · Set passkey';
    }
    return 'Completed';
  }

  Widget _buildActionHeader({
    required VoidCallback? onBack,
    required String stepLabel,
  }) {
    return Row(
      children: [
        TextButton.icon(
          onPressed: onBack,
          icon: const Icon(Icons.arrow_back_rounded, size: 16),
          label: const Text('Back'),
          style: TextButton.styleFrom(foregroundColor: _textPrimary),
        ),
        const Spacer(),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.06),
            borderRadius: BorderRadius.circular(999),
          ),
          child: Text(
            stepLabel,
            style: const TextStyle(
              color: _textSecondary,
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildPasswordSecurityTab() {
    String sixDigits(String value) {
      final digits = value.replaceAll(RegExp(r'\D'), '');
      return digits.length > 6 ? digits.substring(0, 6) : digits;
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Password & Security',
          style: TextStyle(
            color: _textPrimary,
            fontSize: 18,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 6),
        const Text(
          'Manage your login protection and password updates.',
          style: TextStyle(color: _textSecondary, fontSize: 13),
        ),
        const SizedBox(height: 14),

        _buildCard(
          children: [
            if (!_showChangePassword)
              Padding(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Change password',
                      style: TextStyle(
                        color: _textPrimary,
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      _passwordStatusLoading
                          ? 'Loading last password change...'
                          : (_passwordChangedAt != null
                                ? 'Last changed ${_formatRelativeTime(_passwordChangedAt)}'
                                : 'Password has not been changed yet.'),
                      style: const TextStyle(
                        color: _textSecondary,
                        fontSize: 12,
                      ),
                    ),
                    const SizedBox(height: 12),
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton(
                        onPressed: _openChangePassword,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: _accent,
                          foregroundColor: Colors.white,
                        ),
                        child: const Text('Change password'),
                      ),
                    ),
                  ],
                ),
              )
            else
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _buildActionHeader(
                      onBack: _passwordSubmitting ? null : _handlePasswordBack,
                      stepLabel: _passwordStepLabel(),
                    ),
                    const SizedBox(height: 8),
                    if (_passwordStep == _PasswordChangeStep.otp) ...[
                      const Text(
                        'OTP for password change',
                        style: TextStyle(
                          color: _textPrimary,
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 8),
                      TextField(
                        key: const ValueKey('password-change-otp-input'),
                        keyboardType: TextInputType.number,
                        maxLength: 6,
                        onChanged: (v) =>
                            _passwordOtp = v.replaceAll(RegExp(r'\D'), ''),
                        style: const TextStyle(color: _textPrimary),
                        decoration: _emailInputDecoration(
                          '------',
                        ).copyWith(counterText: ''),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        _passwordExpiresSec != null
                            ? 'OTP expires in ${_passwordExpiresSec}s.'
                            : 'OTP expires in 5 minutes.',
                        style: const TextStyle(
                          color: _textSecondary,
                          fontSize: 12,
                        ),
                      ),
                      const SizedBox(height: 12),
                      _buildStepActions(
                        secondaryLabel: _passwordCooldown > 0
                            ? 'Resend (${_passwordCooldown}s)'
                            : 'Resend OTP',
                        onSecondary: () => _requestPasswordOtp(),
                        secondaryDisabled:
                            _passwordSubmitting || _passwordCooldown > 0,
                        primaryLabel: _passwordSubmitting
                            ? 'Verifying...'
                            : 'Verify',
                        onPrimary: _passwordSubmitting
                            ? null
                            : _verifyPasswordOtp,
                      ),
                    ],
                    if (_passwordStep == _PasswordChangeStep.form) ...[
                      const Text(
                        'Current password',
                        style: TextStyle(
                          color: _textPrimary,
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 8),
                      TextField(
                        key: const ValueKey('password-change-current-input'),
                        obscureText: true,
                        enableSuggestions: false,
                        autocorrect: false,
                        onChanged: (v) => _passwordCurrent = v,
                        style: const TextStyle(color: _textPrimary),
                        decoration: _emailInputDecoration(
                          'Enter current password',
                        ),
                      ),
                      const SizedBox(height: 10),
                      const Text(
                        'New password',
                        style: TextStyle(
                          color: _textPrimary,
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 8),
                      TextField(
                        key: const ValueKey('password-change-new-input'),
                        obscureText: true,
                        enableSuggestions: false,
                        autocorrect: false,
                        onChanged: (v) => _passwordNew = v,
                        style: const TextStyle(color: _textPrimary),
                        decoration: _emailInputDecoration(
                          'Create a new password',
                        ),
                      ),
                      const SizedBox(height: 10),
                      const Text(
                        'Confirm new password',
                        style: TextStyle(
                          color: _textPrimary,
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 8),
                      TextField(
                        key: const ValueKey('password-change-confirm-input'),
                        obscureText: true,
                        enableSuggestions: false,
                        autocorrect: false,
                        onChanged: (v) => _passwordConfirm = v,
                        style: const TextStyle(color: _textPrimary),
                        decoration: _emailInputDecoration(
                          'Re-enter new password',
                        ),
                      ),
                      const SizedBox(height: 8),
                      const Text(
                        'Password must be at least 8 characters and include uppercase, lowercase, and a number.',
                        style: TextStyle(color: _textSecondary, fontSize: 12),
                      ),
                      const SizedBox(height: 12),
                      _buildStepActions(
                        primaryLabel: _passwordSubmitting
                            ? 'Updating...'
                            : 'Change password',
                        onPrimary: _passwordSubmitting
                            ? null
                            : _confirmPasswordChange,
                      ),
                    ],
                    if (_passwordStep == _PasswordChangeStep.done) ...[
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: const Color(0xFF1A2B4A),
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(
                            color: _accent.withValues(alpha: 0.4),
                          ),
                        ),
                        child: Text(
                          _passwordSuccess ?? 'Password updated successfully.',
                          style: const TextStyle(color: _textPrimary),
                        ),
                      ),
                      if (_passwordLogoutPrompt) ...[
                        const SizedBox(height: 12),
                        const Text(
                          'Do you want to log out of all other devices?',
                          style: TextStyle(color: _textSecondary, fontSize: 12),
                        ),
                        if (_passwordLogoutError != null) ...[
                          const SizedBox(height: 8),
                          Text(
                            _passwordLogoutError!,
                            style: const TextStyle(
                              color: _danger,
                              fontSize: 12,
                            ),
                          ),
                        ],
                        const SizedBox(height: 10),
                        _buildStepActions(
                          secondaryLabel: 'No, keep signed in',
                          onSecondary: () {
                            setState(() {
                              _passwordLogoutPrompt = false;
                            });
                          },
                          secondaryDisabled: _passwordLogoutSubmitting,
                          primaryLabel: _passwordLogoutSubmitting
                              ? 'Logging out...'
                              : 'Yes, log out others',
                          onPrimary: _passwordLogoutSubmitting
                              ? null
                              : _logoutOtherDevicesAfterPassword,
                        ),
                      ],
                    ],
                    if (_passwordError != null) ...[
                      const SizedBox(height: 10),
                      Text(
                        _passwordError!,
                        style: const TextStyle(color: _danger, fontSize: 12),
                      ),
                    ],
                  ],
                ),
              ),
          ],
        ),

        const SizedBox(height: 12),
        _buildCard(
          children: [
            if (!_showTwoFactorFlow)
              Padding(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Two-factor authentication',
                      style: TextStyle(
                        color: _textPrimary,
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 6),
                    const Text(
                      'Require an email OTP each time you sign in.',
                      style: TextStyle(color: _textSecondary, fontSize: 12),
                    ),
                    const SizedBox(height: 12),
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton(
                        onPressed: _twoFactorLoading
                            ? null
                            : () => _openTwoFactorFlow(!_twoFactorEnabled),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: _accent,
                          foregroundColor: Colors.white,
                        ),
                        child: Text(
                          _twoFactorLoading
                              ? 'Loading...'
                              : (_twoFactorEnabled ? 'Disable' : 'Enable'),
                        ),
                      ),
                    ),
                  ],
                ),
              )
            else
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _buildActionHeader(
                      onBack: _twoFactorSubmitting
                          ? null
                          : _handleTwoFactorBack,
                      stepLabel: _twoFactorStep == _TwoFactorStep.otp
                          ? 'Step 1 - Email OTP'
                          : 'Completed',
                    ),
                    const SizedBox(height: 8),
                    if (_twoFactorStep == _TwoFactorStep.otp) ...[
                      Text(
                        _twoFactorTarget
                            ? 'OTP to enable two-factor'
                            : 'OTP to disable two-factor',
                        style: const TextStyle(
                          color: _textPrimary,
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 8),
                      TextField(
                        key: const ValueKey('two-factor-otp-input'),
                        keyboardType: TextInputType.number,
                        maxLength: 6,
                        onChanged: (v) =>
                            _twoFactorOtp = v.replaceAll(RegExp(r'\D'), ''),
                        style: const TextStyle(color: _textPrimary),
                        decoration: _emailInputDecoration(
                          '------',
                        ).copyWith(counterText: ''),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        _twoFactorExpiresSec != null
                            ? 'OTP expires in ${_twoFactorExpiresSec}s.'
                            : 'OTP expires in 5 minutes.',
                        style: const TextStyle(
                          color: _textSecondary,
                          fontSize: 12,
                        ),
                      ),
                      const SizedBox(height: 12),
                      _buildStepActions(
                        secondaryLabel: _twoFactorCooldown > 0
                            ? 'Resend (${_twoFactorCooldown}s)'
                            : 'Resend OTP',
                        onSecondary: () =>
                            _requestTwoFactorOtp(_twoFactorTarget),
                        secondaryDisabled:
                            _twoFactorSubmitting || _twoFactorCooldown > 0,
                        primaryLabel: _twoFactorSubmitting
                            ? 'Verifying...'
                            : (_twoFactorTarget ? 'Enable' : 'Disable'),
                        onPrimary: _twoFactorSubmitting
                            ? null
                            : _verifyTwoFactorOtp,
                      ),
                    ],
                    if (_twoFactorStep == _TwoFactorStep.done)
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: const Color(0xFF1A2B4A),
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(
                            color: _accent.withValues(alpha: 0.4),
                          ),
                        ),
                        child: Text(
                          _twoFactorSuccess ?? 'Two-factor updated.',
                          style: const TextStyle(color: _textPrimary),
                        ),
                      ),
                    if (_twoFactorError != null) ...[
                      const SizedBox(height: 10),
                      Text(
                        _twoFactorError!,
                        style: const TextStyle(color: _danger, fontSize: 12),
                      ),
                    ],
                  ],
                ),
              ),
          ],
        ),

        const SizedBox(height: 12),
        _buildCard(
          children: [
            Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Passkeys',
                    style: TextStyle(
                      color: _textPrimary,
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    'Use a 6-digit passkey for quick verification.',
                    style: TextStyle(color: _textSecondary, fontSize: 12),
                  ),
                  if (_hasPasskey) ...[
                    const SizedBox(height: 6),
                    Text(
                      _passkeyEnabled ? 'Status: Enabled' : 'Status: Disabled',
                      style: const TextStyle(
                        color: _textSecondary,
                        fontSize: 12,
                      ),
                    ),
                  ],
                  if (!_showPasskeyFlow) ...[
                    const SizedBox(height: 12),
                    if (_hasPasskey) ...[
                      SizedBox(
                        width: double.infinity,
                        child: OutlinedButton(
                          onPressed:
                              (_passkeyStatusLoading ||
                                  _passkeyToggleSubmitting)
                              ? null
                              : _togglePasskey,
                          style: OutlinedButton.styleFrom(
                            foregroundColor: _textPrimary,
                            side: BorderSide(color: _border),
                          ),
                          child: Text(
                            _passkeyToggleSubmitting
                                ? 'Updating...'
                                : (_passkeyEnabled ? 'Disable' : 'Enable'),
                          ),
                        ),
                      ),
                      const SizedBox(height: 8),
                    ],
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton(
                        onPressed: _passkeyStatusLoading
                            ? null
                            : _openPasskeyFlow,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: _accent,
                          foregroundColor: Colors.white,
                        ),
                        child: Text(
                          _passkeyStatusLoading
                              ? 'Loading...'
                              : (_hasPasskey
                                    ? 'Change passkey'
                                    : 'Set passkey'),
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
            if (_passkeyToggleError != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 0, 14, 12),
                child: Text(
                  _passkeyToggleError!,
                  style: const TextStyle(color: _danger, fontSize: 12),
                ),
              ),
            if (_showPasskeyFlow)
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _buildActionHeader(
                      onBack: _passkeySubmitting ? null : _handlePasskeyBack,
                      stepLabel: _passkeyStepLabel(),
                    ),
                    const SizedBox(height: 8),
                    if (_passkeyStep == _PasskeyStep.password) ...[
                      const Text(
                        'Current password',
                        style: TextStyle(
                          color: _textPrimary,
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 8),
                      TextField(
                        key: const ValueKey('passkey-password-input'),
                        obscureText: true,
                        onChanged: (v) => _passkeyPassword = v,
                        style: const TextStyle(color: _textPrimary),
                        decoration: _emailInputDecoration(
                          'Enter your password',
                        ),
                      ),
                      const SizedBox(height: 8),
                      const Text(
                        'We\'ll send a 6-digit OTP to confirm your passkey change.',
                        style: TextStyle(color: _textSecondary, fontSize: 12),
                      ),
                      const SizedBox(height: 12),
                      _buildStepActions(
                        primaryLabel: _passkeySubmitting
                            ? 'Sending...'
                            : 'Send OTP',
                        onPrimary: _passkeySubmitting
                            ? null
                            : _requestPasskeyOtp,
                      ),
                    ],
                    if (_passkeyStep == _PasskeyStep.otp) ...[
                      const Text(
                        'OTP for passkey setup',
                        style: TextStyle(
                          color: _textPrimary,
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 8),
                      TextField(
                        key: const ValueKey('passkey-otp-input'),
                        keyboardType: TextInputType.number,
                        maxLength: 6,
                        onChanged: (v) =>
                            _passkeyOtp = v.replaceAll(RegExp(r'\D'), ''),
                        style: const TextStyle(color: _textPrimary),
                        decoration: _emailInputDecoration(
                          '------',
                        ).copyWith(counterText: ''),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        _passkeyExpiresSec != null
                            ? 'OTP expires in ${_passkeyExpiresSec}s.'
                            : 'OTP expires in 5 minutes.',
                        style: const TextStyle(
                          color: _textSecondary,
                          fontSize: 12,
                        ),
                      ),
                      const SizedBox(height: 12),
                      _buildStepActions(
                        secondaryLabel: _passkeyCooldown > 0
                            ? 'Resend (${_passkeyCooldown}s)'
                            : 'Resend OTP',
                        onSecondary: _requestPasskeyOtp,
                        secondaryDisabled:
                            _passkeySubmitting || _passkeyCooldown > 0,
                        primaryLabel: _passkeySubmitting
                            ? 'Verifying...'
                            : 'Verify',
                        onPrimary: _passkeySubmitting
                            ? null
                            : _verifyPasskeyOtp,
                      ),
                    ],
                    if (_passkeyStep == _PasskeyStep.form) ...[
                      if (_hasPasskey) ...[
                        const Text(
                          'Current passkey',
                          style: TextStyle(
                            color: _textPrimary,
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 12,
                            vertical: 12,
                          ),
                          decoration: BoxDecoration(
                            color: const Color(0xFF0F1A2F),
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(
                              color: _border.withValues(alpha: 0.9),
                            ),
                          ),
                          child: Row(
                            children: [
                              Expanded(
                                child: Text(
                                  _showCurrentPasskey
                                      ? _passkeyCurrent
                                      : ('*' * _passkeyCurrent.length),
                                  style: const TextStyle(color: _textPrimary),
                                ),
                              ),
                              IconButton(
                                onPressed: () {
                                  setState(() {
                                    _showCurrentPasskey = !_showCurrentPasskey;
                                  });
                                },
                                icon: Icon(
                                  _showCurrentPasskey
                                      ? Icons.visibility_off_outlined
                                      : Icons.visibility_outlined,
                                  color: _textSecondary,
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 10),
                      ],
                      const Text(
                        'New passkey',
                        style: TextStyle(
                          color: _textPrimary,
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 8),
                      TextField(
                        key: const ValueKey('passkey-new-input'),
                        keyboardType: TextInputType.number,
                        maxLength: 6,
                        obscureText: true,
                        onChanged: (v) => _passkeyNew = sixDigits(v),
                        style: const TextStyle(color: _textPrimary),
                        decoration: _emailInputDecoration(
                          'Enter 6-digit passkey',
                        ).copyWith(counterText: ''),
                      ),
                      const SizedBox(height: 10),
                      const Text(
                        'Confirm passkey',
                        style: TextStyle(
                          color: _textPrimary,
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 8),
                      TextField(
                        key: const ValueKey('passkey-confirm-input'),
                        keyboardType: TextInputType.number,
                        maxLength: 6,
                        obscureText: true,
                        onChanged: (v) => _passkeyConfirm = sixDigits(v),
                        style: const TextStyle(color: _textPrimary),
                        decoration: _emailInputDecoration(
                          'Re-enter passkey',
                        ).copyWith(counterText: ''),
                      ),
                      const SizedBox(height: 8),
                      const Text(
                        'Passkey must be exactly 6 digits.',
                        style: TextStyle(color: _textSecondary, fontSize: 12),
                      ),
                      const SizedBox(height: 12),
                      _buildStepActions(
                        primaryLabel: _passkeySubmitting ? 'Saving...' : 'Save',
                        onPrimary: _passkeySubmitting ? null : _confirmPasskey,
                      ),
                    ],
                    if (_passkeyStep == _PasskeyStep.done)
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: const Color(0xFF1A2B4A),
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(
                            color: _accent.withValues(alpha: 0.4),
                          ),
                        ),
                        child: Text(
                          _passkeySuccess ?? 'Passkey updated successfully.',
                          style: const TextStyle(color: _textPrimary),
                        ),
                      ),
                    if (_passkeyError != null) ...[
                      const SizedBox(height: 10),
                      Text(
                        _passkeyError!,
                        style: const TextStyle(color: _danger, fontSize: 12),
                      ),
                    ],
                  ],
                ),
              ),
          ],
        ),

        const SizedBox(height: 12),
        _buildCard(
          children: [
            Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Where you\'re logged in',
                    style: TextStyle(
                      color: _textPrimary,
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    'Review devices that have accessed your account.',
                    style: TextStyle(color: _textSecondary, fontSize: 12),
                  ),
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: _openLoginDevices,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: _accent,
                        foregroundColor: Colors.white,
                      ),
                      child: const Text('View devices'),
                    ),
                  ),
                ],
              ),
            ),
            if (_showLoginDevices)
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (_loginDevicesLoading)
                      const Padding(
                        padding: EdgeInsets.only(bottom: 8),
                        child: Text(
                          'Loading devices...',
                          style: TextStyle(color: _textSecondary, fontSize: 12),
                        ),
                      ),
                    if (_loginDevicesError != null)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Text(
                          _loginDevicesError!,
                          style: const TextStyle(color: _danger, fontSize: 12),
                        ),
                      ),
                    if (!_loginDevicesLoading && _loginDevices.isEmpty)
                      const Padding(
                        padding: EdgeInsets.only(bottom: 8),
                        child: Text(
                          'No login devices found.',
                          style: TextStyle(color: _textSecondary, fontSize: 12),
                        ),
                      ),
                    ..._loginDevices.map((device) {
                      final hash = (device['deviceIdHash'] as String?) ?? '';
                      final isCurrent =
                          hash.isNotEmpty && hash == _loginDevicesCurrent;
                      final isSubmitting = _logoutDeviceSubmitting.contains(
                        hash,
                      );
                      final resolvedName =
                          (isCurrent &&
                              _localDeviceName != null &&
                              _localDeviceName!.isNotEmpty)
                          ? _localDeviceName!
                          : _resolveDeviceName(device);
                      return Container(
                        margin: const EdgeInsets.only(bottom: 8),
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: const Color(0xFF101D35),
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: _border),
                        ),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    resolvedName,
                                    style: const TextStyle(
                                      color: _textPrimary,
                                      fontSize: 13,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    _resolveDeviceTime(device),
                                    style: const TextStyle(
                                      color: _textSecondary,
                                      fontSize: 12,
                                    ),
                                  ),
                                  if (isCurrent)
                                    const Padding(
                                      padding: EdgeInsets.only(top: 4),
                                      child: Text(
                                        'Current device',
                                        style: TextStyle(
                                          color: _accent,
                                          fontSize: 11,
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                    ),
                                ],
                              ),
                            ),
                            if (!isCurrent && hash.isNotEmpty)
                              TextButton(
                                onPressed: isSubmitting
                                    ? null
                                    : () => _logoutDevice(hash),
                                style: TextButton.styleFrom(
                                  foregroundColor: _danger,
                                ),
                                child: Text(
                                  isSubmitting ? 'Logging out...' : 'Log out',
                                ),
                              ),
                          ],
                        ),
                      );
                    }),
                    if (_hasOtherLoginDevices) ...[
                      if (_logoutAllError != null)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: Text(
                            _logoutAllError!,
                            style: const TextStyle(
                              color: _danger,
                              fontSize: 12,
                            ),
                          ),
                        ),
                      SizedBox(
                        width: double.infinity,
                        child: OutlinedButton(
                          onPressed: _logoutAllSubmitting
                              ? null
                              : _logoutAllDevices,
                          style: OutlinedButton.styleFrom(
                            foregroundColor: _textPrimary,
                            side: BorderSide(color: _border),
                            padding: const EdgeInsets.symmetric(vertical: 12),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(10),
                            ),
                          ),
                          child: Text(
                            _logoutAllSubmitting
                                ? 'Logging out...'
                                : 'Log out all other devices',
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
          ],
        ),
      ],
    );
  }

  Widget _buildContent() {
    if (_loading) {
      return const Center(child: CircularProgressIndicator(color: _accent));
    }

    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 22),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                _error!,
                textAlign: TextAlign.center,
                style: const TextStyle(color: _danger, fontSize: 14),
              ),
              const SizedBox(height: 12),
              ElevatedButton(
                onPressed: _loadProfile,
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
      );
    }

    if (_selectedTab == null) {
      return _buildSettingsMenu();
    }

    return RefreshIndicator(
      onRefresh: () async {
        if (_selectedTab == SettingsTab.creatorVerification) {
          await _loadCreatorVerificationStatus();
          return;
        }
        if (_selectedTab == SettingsTab.passwordSecurity) {
          await _loadPasswordSecurityStatus();
          if (_showLoginDevices) {
            await _loadLoginDevices();
          }
          return;
        }
        await _loadProfile();
      },
      color: _accent,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
        children: [_buildSectionDetail()],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return WillPopScope(
      onWillPop: () async {
        if (_selectedTab != null) {
          setState(() {
            if (_selectedTab == SettingsTab.passwordSecurity) {
              _resetPasswordSecurityViewState();
            }
            _selectedTab = null;
          });
          return false;
        }
        _resetPasswordSecurityViewState();
        return true;
      },
      child: Scaffold(
        backgroundColor: _bg,
        appBar: AppBar(
          backgroundColor: _bg,
          elevation: 0,
          title: Text(
            _selectedTab == null ? 'Settings' : _sectionTitle(_selectedTab!),
            style: const TextStyle(
              color: _textPrimary,
              fontWeight: FontWeight.w700,
            ),
          ),
          iconTheme: const IconThemeData(color: _textPrimary),
          leading: _selectedTab == null
              ? null
              : IconButton(
                  icon: const Icon(Icons.arrow_back_rounded),
                  onPressed: () {
                    setState(() {
                      if (_selectedTab == SettingsTab.passwordSecurity) {
                        _resetPasswordSecurityViewState();
                      }
                      _selectedTab = null;
                    });
                  },
                ),
        ),
        body: _buildContent(),
      ),
    );
  }
}
