import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import '../../core/services/auth_storage.dart';
import '../../core/services/api_service.dart';
import '../profile/models/profile_detail.dart';
import '../profile/profile_edit_sheet.dart';
import '../profile/services/profile_service.dart';

enum SettingsTab { personalInfo, profile, creatorVerification }

enum _EmailChangeStep { password, currentOtp, newEmail, newOtp, done }

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
      if (_currentCooldown <= 0 && _newCooldown <= 0) return;
      setState(() {
        if (_currentCooldown > 0) _currentCooldown -= 1;
        if (_newCooldown > 0) _newCooldown -= 1;
      });
    });
    _loadProfile();
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
    }
  }

  void _openSection(SettingsTab tab) {
    setState(() {
      _selectedTab = tab;
    });
    if (tab == SettingsTab.creatorVerification &&
        _creatorStatus == null &&
        !_creatorLoading) {
      _loadCreatorVerificationStatus();
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
            _selectedTab = null;
          });
          return false;
        }
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
