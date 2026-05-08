import 'dart:async';
import 'dart:convert';
import 'package:device_info_plus/device_info_plus.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import '../../core/config/app_theme.dart';
import '../../core/services/auth_storage.dart';
import '../../core/services/api_service.dart';
import '../../core/services/language_controller.dart';
import '../../core/services/theme_controller.dart';
import '../post/post_detail_screen.dart';
import '../profile/models/profile_detail.dart';
import '../profile/profile_edit_sheet.dart';
import '../profile/profile_screen.dart';
import '../profile/services/profile_service.dart';

enum SettingsTab {
  personalInfo,
  profile,
  creatorVerification,
  passwordSecurity,
  content,
  violations,
  notifications,
  system,
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

class _NotificationCategorySettingsState {
  const _NotificationCategorySettingsState({
    required this.enabled,
    required this.mutedUntil,
    required this.mutedIndefinitely,
  });

  final bool enabled;
  final String? mutedUntil;
  final bool mutedIndefinitely;

  factory _NotificationCategorySettingsState.fromJson(Map<String, dynamic> j) {
    return _NotificationCategorySettingsState(
      enabled: j['enabled'] as bool? ?? true,
      mutedUntil: j['mutedUntil'] as String?,
      mutedIndefinitely: j['mutedIndefinitely'] as bool? ?? false,
    );
  }
}

class _NotificationSettingsState {
  const _NotificationSettingsState({
    required this.enabled,
    required this.mutedUntil,
    required this.mutedIndefinitely,
    required this.categories,
  });

  final bool enabled;
  final String? mutedUntil;
  final bool mutedIndefinitely;
  final Map<String, _NotificationCategorySettingsState> categories;

  factory _NotificationSettingsState.fromJson(Map<String, dynamic> j) {
    final rawCategories = j['categories'] as Map<String, dynamic>? ?? {};
    final categories = <String, _NotificationCategorySettingsState>{};
    rawCategories.forEach((key, value) {
      if (value is Map<String, dynamic>) {
        categories[key] = _NotificationCategorySettingsState.fromJson(value);
      }
    });

    return _NotificationSettingsState(
      enabled: j['enabled'] as bool? ?? true,
      mutedUntil: j['mutedUntil'] as String?,
      mutedIndefinitely: j['mutedIndefinitely'] as bool? ?? false,
      categories: categories,
    );
  }
}

class _ContentActivityMeta {
  const _ContentActivityMeta({
    required this.postCaption,
    required this.postMediaUrl,
    required this.postAuthorDisplayName,
    required this.postAuthorUsername,
    required this.commentSnippet,
    required this.targetDisplayName,
    required this.targetUsername,
    required this.targetAvatarUrl,
  });

  final String? postCaption;
  final String? postMediaUrl;
  final String? postAuthorDisplayName;
  final String? postAuthorUsername;
  final String? commentSnippet;
  final String? targetDisplayName;
  final String? targetUsername;
  final String? targetAvatarUrl;

  factory _ContentActivityMeta.fromJson(Map<String, dynamic> j) {
    return _ContentActivityMeta(
      postCaption: j['postCaption'] as String?,
      postMediaUrl: j['postMediaUrl'] as String?,
      postAuthorDisplayName: j['postAuthorDisplayName'] as String?,
      postAuthorUsername: j['postAuthorUsername'] as String?,
      commentSnippet: j['commentSnippet'] as String?,
      targetDisplayName: j['targetDisplayName'] as String?,
      targetUsername: j['targetUsername'] as String?,
      targetAvatarUrl: j['targetAvatarUrl'] as String?,
    );
  }
}

class _ContentActivityItem {
  const _ContentActivityItem({
    required this.id,
    required this.type,
    required this.postId,
    required this.commentId,
    required this.targetUserId,
    required this.createdAt,
    required this.meta,
  });

  final String id;
  final String type;
  final String? postId;
  final String? commentId;
  final String? targetUserId;
  final String? createdAt;
  final _ContentActivityMeta? meta;

  factory _ContentActivityItem.fromJson(Map<String, dynamic> j) {
    return _ContentActivityItem(
      id: (j['id'] as String?) ?? '',
      type: (j['type'] as String?) ?? '',
      postId: j['postId'] as String?,
      commentId: j['commentId'] as String?,
      targetUserId: j['targetUserId'] as String?,
      createdAt: j['createdAt'] as String?,
      meta: j['meta'] is Map<String, dynamic>
          ? _ContentActivityMeta.fromJson(j['meta'] as Map<String, dynamic>)
          : null,
    );
  }
}

class _HiddenPostMedia {
  const _HiddenPostMedia({required this.url});

  final String? url;

  factory _HiddenPostMedia.fromJson(Map<String, dynamic> j) {
    return _HiddenPostMedia(url: j['url'] as String?);
  }
}

class _HiddenPostItem {
  const _HiddenPostItem({
    required this.id,
    required this.content,
    required this.authorDisplayName,
    required this.authorUsername,
    required this.media,
  });

  final String id;
  final String? content;
  final String? authorDisplayName;
  final String? authorUsername;
  final List<_HiddenPostMedia> media;

  factory _HiddenPostItem.fromJson(Map<String, dynamic> j) {
    final rawMedia = (j['media'] as List<dynamic>? ?? [])
        .whereType<Map<String, dynamic>>()
        .map(_HiddenPostMedia.fromJson)
        .toList(growable: false);
    return _HiddenPostItem(
      id: (j['id'] as String?) ?? '',
      content: j['content'] as String?,
      authorDisplayName: j['authorDisplayName'] as String?,
      authorUsername: j['authorUsername'] as String?,
      media: rawMedia,
    );
  }
}

class _BlockedUserItem {
  const _BlockedUserItem({
    required this.userId,
    required this.username,
    required this.displayName,
    required this.avatarUrl,
  });

  final String userId;
  final String? username;
  final String? displayName;
  final String? avatarUrl;

  factory _BlockedUserItem.fromJson(Map<String, dynamic> j) {
    return _BlockedUserItem(
      userId: (j['userId'] as String?) ?? '',
      username: j['username'] as String?,
      displayName: j['displayName'] as String?,
      avatarUrl: j['avatarUrl'] as String?,
    );
  }
}

class _ViolationMediaPreview {
  const _ViolationMediaPreview({required this.type, required this.url});

  final String type;
  final String url;

  factory _ViolationMediaPreview.fromJson(Map<String, dynamic> j) {
    return _ViolationMediaPreview(
      type: (j['type'] as String?) ?? 'image',
      url: (j['url'] as String?) ?? '',
    );
  }
}

class _ViolationRelatedPostPreview {
  const _ViolationRelatedPostPreview({required this.text, required this.media});

  final String? text;
  final _ViolationMediaPreview? media;

  factory _ViolationRelatedPostPreview.fromJson(Map<String, dynamic> j) {
    return _ViolationRelatedPostPreview(
      text: j['text'] as String?,
      media: j['media'] is Map<String, dynamic>
          ? _ViolationMediaPreview.fromJson(j['media'] as Map<String, dynamic>)
          : null,
    );
  }
}

class _ViolationHistoryItem {
  const _ViolationHistoryItem({
    required this.id,
    required this.targetType,
    required this.targetId,
    required this.action,
    required this.category,
    required this.reason,
    required this.severity,
    required this.strikeDelta,
    required this.strikeTotalAfter,
    required this.actionExpiresAt,
    required this.previewText,
    required this.previewMedia,
    required this.relatedPostId,
    required this.relatedPostPreview,
    required this.createdAt,
  });

  final String id;
  final String targetType;
  final String targetId;
  final String action;
  final String category;
  final String reason;
  final String? severity;
  final int strikeDelta;
  final int strikeTotalAfter;
  final String? actionExpiresAt;
  final String? previewText;
  final _ViolationMediaPreview? previewMedia;
  final String? relatedPostId;
  final _ViolationRelatedPostPreview? relatedPostPreview;
  final String? createdAt;

  factory _ViolationHistoryItem.fromJson(Map<String, dynamic> j) {
    return _ViolationHistoryItem(
      id: (j['id'] as String?) ?? '',
      targetType: (j['targetType'] as String?) ?? '',
      targetId: (j['targetId'] as String?) ?? '',
      action: (j['action'] as String?) ?? '',
      category: (j['category'] as String?) ?? '',
      reason: (j['reason'] as String?) ?? '',
      severity: j['severity'] as String?,
      strikeDelta: (j['strikeDelta'] as num?)?.toInt() ?? 0,
      strikeTotalAfter: (j['strikeTotalAfter'] as num?)?.toInt() ?? 0,
      actionExpiresAt: j['actionExpiresAt'] as String?,
      previewText: j['previewText'] as String?,
      previewMedia: j['previewMedia'] is Map<String, dynamic>
          ? _ViolationMediaPreview.fromJson(
              j['previewMedia'] as Map<String, dynamic>,
            )
          : null,
      relatedPostId: j['relatedPostId'] as String?,
      relatedPostPreview: j['relatedPostPreview'] is Map<String, dynamic>
          ? _ViolationRelatedPostPreview.fromJson(
              j['relatedPostPreview'] as Map<String, dynamic>,
            )
          : null,
      createdAt: j['createdAt'] as String?,
    );
  }
}

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key, this.initialTab = SettingsTab.personalInfo});

  final SettingsTab initialTab;

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  AppSemanticColors get _tokens =>
      Theme.of(context).extension<AppSemanticColors>() ??
      (Theme.of(context).brightness == Brightness.dark
          ? AppSemanticColors.dark
          : AppSemanticColors.light);

  Color get _bg => _tokens.panel;
  Color get _surface => _tokens.panelMuted;
  Color get _border => _tokens.panelBorder;
  Color get _textPrimary => _tokens.text;
  Color get _textSecondary => _tokens.textMuted;
  Color get _accent => _tokens.primary;
  Color get _filterActiveBg => _tokens.primarySoft;
  Color get _filterActiveText => Theme.of(context).brightness == Brightness.dark
      ? const Color(0xFF103A66)
      : const Color(0xFF0F355F);
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

  static const List<Map<String, String>> _notificationCategories = [
    {
      'key': 'follow',
      'labelKey': 'settings.notifications.categories.follow',
      'descKey': 'settings.notifications.categories.followDesc',
    },
    {
      'key': 'comment',
      'labelKey': 'settings.notifications.categories.comment',
      'descKey': 'settings.notifications.categories.commentDesc',
    },
    {
      'key': 'like',
      'labelKey': 'settings.notifications.categories.like',
      'descKey': 'settings.notifications.categories.likeDesc',
    },
    {
      'key': 'mentions',
      'labelKey': 'settings.notifications.categories.mentions',
      'descKey': 'settings.notifications.categories.mentionsDesc',
    },
    {
      'key': 'system',
      'labelKey': 'settings.notifications.categories.system',
      'descKey': 'settings.notifications.categories.systemDesc',
    },
  ];

  static const List<Map<String, dynamic>> _notificationMuteOptions = [
    {'key': '5m', 'labelKey': 'settings.notifications.muteOptions.5m', 'ms': 5 * 60 * 1000},
    {'key': '10m', 'labelKey': 'settings.notifications.muteOptions.10m', 'ms': 10 * 60 * 1000},
    {'key': '15m', 'labelKey': 'settings.notifications.muteOptions.15m', 'ms': 15 * 60 * 1000},
    {'key': '30m', 'labelKey': 'settings.notifications.muteOptions.30m', 'ms': 30 * 60 * 1000},
    {'key': '1h', 'labelKey': 'settings.notifications.muteOptions.1h', 'ms': 60 * 60 * 1000},
    {'key': '1d', 'labelKey': 'settings.notifications.muteOptions.1d', 'ms': 24 * 60 * 60 * 1000},
    {'key': 'until', 'labelKey': 'settings.notifications.muteOptions.until', 'ms': null},
    {'key': 'custom', 'labelKey': 'settings.notifications.muteOptions.custom', 'ms': null},
  ];

  static const int _contentPageSize = 10;

  static const List<Map<String, String>> _activityFilterOptions = [
    {'key': 'all', 'labelKey': 'settings.content.activityFilter.all'},
    {'key': 'post_like', 'labelKey': 'settings.content.activityFilter.postLike'},
    {'key': 'comment_like', 'labelKey': 'settings.content.activityFilter.commentLike'},
    {'key': 'comment', 'labelKey': 'settings.content.activityFilter.comment'},
    {'key': 'repost', 'labelKey': 'settings.content.activityFilter.repost'},
    {'key': 'save', 'labelKey': 'settings.content.activityFilter.save'},
    {'key': 'follow', 'labelKey': 'settings.content.activityFilter.follow'},
    {'key': 'report_post', 'labelKey': 'settings.content.activityFilter.reportPost'},
    {'key': 'report_user', 'labelKey': 'settings.content.activityFilter.reportUser'},
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

  _NotificationSettingsState? _notificationSettings;
  bool _notificationLoading = false;
  bool _notificationSaving = false;
  String? _notificationError;

  List<_HiddenPostItem> _hiddenPosts = const [];
  bool _hiddenPostsLoading = false;
  String? _hiddenPostsError;
  int _hiddenPostsVisibleCount = _contentPageSize;
  final Map<String, bool> _unhideSubmitting = {};

  List<_BlockedUserItem> _blockedUsers = const [];
  bool _blockedUsersLoading = false;
  String? _blockedUsersError;
  final Map<String, bool> _unblockSubmitting = {};

  List<_ContentActivityItem> _activityItems = const [];
  int _activityVisibleCount = _contentPageSize;
  bool _activityLoading = false;
  bool _activityLoadingMore = false;
  String? _activityError;
  String? _activityCursor;
  String _activityFilter = 'all';

  bool _contentActivityOpen = false;
  bool _contentHiddenOpen = false;
  bool _contentBlockedOpen = false;

  List<_ViolationHistoryItem> _violationItems = const [];
  bool _violationLoading = false;
  String? _violationError;
  int _currentStrikeTotal = 0;

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
    _selectedTab = widget.initialTab == SettingsTab.personalInfo
        ? null
        : widget.initialTab;
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
        _error = LanguageController.instance.t('settings.creator.unableToLoad');
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
      setState(() => _emailError = LanguageController.instance.t('settings.email.enterCurrentPasswordFirst'));
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
          _emailError = LanguageController.instance.t('settings.common.otpSent');
        } else {
          _emailError = e.message;
        }
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _emailError = LanguageController.instance.t('settings.common.unableToSendOtp');
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
      setState(() => _emailError = LanguageController.instance.t('settings.email.enterOtpFirst'));
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
        _emailError = LanguageController.instance.t('settings.common.invalidExpiredOtp');
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
      setState(() => _emailError = LanguageController.instance.t('settings.email.invalidEmail'));
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
          _emailError = LanguageController.instance.t('settings.common.otpSent');
        } else {
          _emailError = e.message;
        }
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _emailError = LanguageController.instance.t('settings.email.unableToSendOtpNew');
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
      setState(() => _emailError = LanguageController.instance.t('settings.email.enterOtpFirst'));
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
        _emailSuccess = LanguageController.instance.t('settings.email.emailUpdatedSuccess');
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
        _emailError = LanguageController.instance.t('settings.common.invalidExpiredOtp');
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
        _creatorError = LanguageController.instance.t('settings.creator.unableToLoad');
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
        _creatorSuccess = LanguageController.instance.t('settings.creator.requestSubmitted');
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
        _creatorError = LanguageController.instance.t('settings.creator.unableToSubmit');
      });
    } finally {
      if (!mounted) return;
      setState(() {
        _creatorSubmitting = false;
      });
    }
  }

  Future<void> _loadNotificationSettings() async {
    setState(() {
      _notificationLoading = true;
      _notificationError = null;
    });
    try {
      final res = await ProfileService.fetchNotificationSettings();
      if (!mounted) return;
      setState(() {
        _notificationSettings = _NotificationSettingsState.fromJson(res);
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _notificationError = e.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _notificationError = LanguageController.instance.t('settings.common.failedToUpdate');
      });
    } finally {
      if (!mounted) return;
      setState(() {
        _notificationLoading = false;
      });
    }
  }

  String _notificationStatusLabel({
    required bool enabled,
    required String? mutedUntil,
    required bool mutedIndefinitely,
  }) {
    final lc = LanguageController.instance;
    if (enabled) return lc.t('settings.notifications.status.enabled');
    if (mutedIndefinitely) return lc.t('settings.notifications.status.mutedIndefinitely');
    if (mutedUntil != null && mutedUntil.isNotEmpty) {
      final dt = DateTime.tryParse(mutedUntil)?.toUtc();
      if (dt != null) {
        final now = DateTime.now().toUtc();
        if (dt.isAfter(now)) {
          final diff = dt.difference(now);
          if (diff.inMinutes < 1) return lc.t('settings.notifications.status.mutedLessThanMinute');
          if (diff.inHours < 1) return lc.t('settings.notifications.status.mutedMinutes', {'n': '${diff.inMinutes}'});
          if (diff.inDays < 1) return lc.t('settings.notifications.status.mutedHours', {'n': '${diff.inHours}'});
          return lc.t('settings.notifications.status.mutedDays', {'n': '${diff.inDays}'});
        }
      }
    }
    return lc.t('settings.notifications.status.muted');
  }

  String? _buildLocalDateTimeIso(String date, String time) {
    if (date.isEmpty || time.isEmpty) return null;
    final dt = DateTime.tryParse('${date}T$time:00');
    if (dt == null) return null;
    return dt.toUtc().toIso8601String();
  }

  Future<String?> _pickNotificationDate(String current) async {
    final now = DateTime.now();
    final seed = DateTime.tryParse(current) ?? now;
    final picked = await showDatePicker(
      context: context,
      initialDate: seed,
      firstDate: DateTime(now.year, now.month, now.day),
      lastDate: DateTime(now.year + 2, 12, 31),
    );
    if (picked == null) return null;
    final y = picked.year.toString().padLeft(4, '0');
    final m = picked.month.toString().padLeft(2, '0');
    final d = picked.day.toString().padLeft(2, '0');
    return '$y-$m-$d';
  }

  Future<String?> _pickNotificationTime(String current) async {
    final now = DateTime.now();
    final pieces = current.split(':');
    final initial = TimeOfDay(
      hour: pieces.isNotEmpty ? int.tryParse(pieces[0]) ?? now.hour : now.hour,
      minute: pieces.length > 1
          ? int.tryParse(pieces[1]) ?? now.minute
          : now.minute,
    );

    final picked = await showTimePicker(
      context: context,
      initialTime: initial,
      builder: (ctx, child) {
        return Theme(
          data: Theme.of(ctx).copyWith(
            colorScheme: Theme.of(
              ctx,
            ).colorScheme.copyWith(primary: _accent, surface: _surface),
            dialogTheme: DialogThemeData(backgroundColor: _surface),
          ),
          child: child ?? const SizedBox.shrink(),
        );
      },
    );

    if (picked == null) return null;
    final h = picked.hour.toString().padLeft(2, '0');
    final m = picked.minute.toString().padLeft(2, '0');
    return '$h:$m';
  }

  Future<void> _updateNotificationSettings({
    String? category,
    bool? enabled,
    String? mutedUntil,
    bool? mutedIndefinitely,
  }) async {
    final res = await ProfileService.updateNotificationSettings(
      category: category,
      enabled: enabled,
      mutedUntil: mutedUntil,
      mutedIndefinitely: mutedIndefinitely,
    );
    if (!mounted) return;
    setState(() {
      _notificationSettings = _NotificationSettingsState.fromJson(res);
    });
  }

  void _toggleContentSection(String key) {
    setState(() {
      if (key == 'activity') {
        _contentActivityOpen = !_contentActivityOpen;
      } else if (key == 'hidden') {
        _contentHiddenOpen = !_contentHiddenOpen;
      } else if (key == 'blocked') {
        _contentBlockedOpen = !_contentBlockedOpen;
      }
    });
  }

  void _resetContentViewState({bool clearData = false}) {
    _contentActivityOpen = false;
    _contentHiddenOpen = false;
    _contentBlockedOpen = false;
    _activityFilter = 'all';
    _activityVisibleCount = _contentPageSize;
    _hiddenPostsVisibleCount = _contentPageSize;
    _activityLoading = false;
    _activityLoadingMore = false;
    _hiddenPostsLoading = false;
    _blockedUsersLoading = false;
    _activityError = null;
    _hiddenPostsError = null;
    _blockedUsersError = null;
    _activityCursor = null;
    _unhideSubmitting.clear();
    _unblockSubmitting.clear();
    if (clearData) {
      _activityItems = const [];
      _hiddenPosts = const [];
      _blockedUsers = const [];
    }
  }

  void _resetViolationsViewState({bool clearData = false}) {
    _violationLoading = false;
    _violationError = null;
    if (clearData) {
      _violationItems = const [];
      _currentStrikeTotal = 0;
    }
  }

  Future<void> _loadViolationCenter() async {
    setState(() {
      _violationLoading = true;
      _violationError = null;
    });
    try {
      final res = await ProfileService.fetchViolationHistory(limit: 100);
      final items = (res['items'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(_ViolationHistoryItem.fromJson)
          .where((item) => item.id.isNotEmpty)
          .toList(growable: false);
      if (!mounted) return;
      setState(() {
        _violationItems = items;
        _currentStrikeTotal = (res['currentStrikeTotal'] as num?)?.toInt() ?? 0;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _violationError = e.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _violationError = LanguageController.instance.t('settings.violations.unableToLoad');
      });
    } finally {
      if (!mounted) return;
      setState(() {
        _violationLoading = false;
      });
    }
  }

  Future<void> _loadContentSettings() async {
    setState(() {
      _hiddenPostsVisibleCount = _contentPageSize;
      _hiddenPostsLoading = true;
      _blockedUsersLoading = true;
      _hiddenPostsError = null;
      _blockedUsersError = null;
    });

    final results = await Future.wait<dynamic>([
      () async {
        try {
          return await ProfileService.fetchHiddenPosts(limit: 50);
        } catch (_) {
          return null;
        }
      }(),
      () async {
        try {
          return await ProfileService.fetchBlockedUsers(limit: 50);
        } catch (_) {
          return null;
        }
      }(),
    ]);

    if (!mounted) return;

    if (results[0] is Map<String, dynamic>) {
      final hiddenRaw = (results[0]['items'] as List<dynamic>? ?? [])
          .whereType<Map<String, dynamic>>()
          .map(_HiddenPostItem.fromJson)
          .where((item) => item.id.isNotEmpty)
          .toList(growable: false);
      setState(() {
        _hiddenPosts = hiddenRaw;
      });
    } else {
      setState(() {
        _hiddenPostsError = LanguageController.instance.t('settings.content.unableToLoadHiddenPosts');
      });
    }

    if (results[1] is Map<String, dynamic>) {
      final blockedRaw = (results[1]['items'] as List<dynamic>? ?? [])
          .whereType<Map<String, dynamic>>()
          .map(_BlockedUserItem.fromJson)
          .where((item) => item.userId.isNotEmpty)
          .toList(growable: false);
      setState(() {
        _blockedUsers = blockedRaw;
      });
    } else {
      setState(() {
        _blockedUsersError = LanguageController.instance.t('settings.content.unableToLoadBlockedUsers');
      });
    }

    if (!mounted) return;
    setState(() {
      _hiddenPostsLoading = false;
      _blockedUsersLoading = false;
    });
  }

  Future<int> _loadActivityLog({bool reset = true}) async {
    if (reset) {
      setState(() {
        _activityLoading = true;
        _activityError = null;
      });
    } else {
      setState(() {
        _activityLoadingMore = true;
      });
    }

    var loadedCount = 0;
    try {
      final res = await ProfileService.fetchActivityLog(
        limit: 30,
        cursor: reset ? null : _activityCursor,
        types: _activityFilter == 'all' ? null : <String>[_activityFilter],
      );
      final fetched = (res['items'] as List<dynamic>? ?? [])
          .whereType<Map<String, dynamic>>()
          .map(_ContentActivityItem.fromJson)
          .where((item) => item.id.isNotEmpty)
          .toList(growable: false);
      loadedCount = fetched.length;
      if (!mounted) return loadedCount;
      setState(() {
        _activityItems = reset
            ? fetched
            : <_ContentActivityItem>[..._activityItems, ...fetched];
        _activityCursor = res['nextCursor'] as String?;
      });
    } on ApiException catch (e) {
      if (!mounted) return loadedCount;
      setState(() {
        _activityError = e.message;
      });
    } catch (_) {
      if (!mounted) return loadedCount;
      setState(() {
        _activityError = LanguageController.instance.t('settings.content.unableToLoadActivity');
      });
    } finally {
      if (!mounted) return loadedCount;
      setState(() {
        if (reset) {
          _activityLoading = false;
        } else {
          _activityLoadingMore = false;
        }
      });
    }
    return loadedCount;
  }

  Future<void> _handleSeeMoreActivity() async {
    if (_activityVisibleCount < _activityItems.length) {
      setState(() {
        _activityVisibleCount += _contentPageSize;
      });
      return;
    }
    if ((_activityCursor == null || _activityCursor!.isEmpty) ||
        _activityLoadingMore) {
      return;
    }
    final loaded = await _loadActivityLog(reset: false);
    if (!mounted) return;
    if (loaded > 0) {
      setState(() {
        _activityVisibleCount += _contentPageSize;
      });
    }
  }

  void _handleSeeMoreHiddenPosts() {
    setState(() {
      _hiddenPostsVisibleCount += _contentPageSize;
    });
  }

  String _cleanSnippetText(String? raw, {required String fallback}) {
    if (raw == null || raw.trim().isEmpty) return fallback;
    final cleaned = raw
        .replaceAll(RegExp(r'\[\[[A-Z0-9_]+\]\]'), ' ')
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim();
    if (cleaned.isEmpty) return fallback;
    return cleaned;
  }

  String _formatViolationSeverityLabel(String? value) {
    final lc = LanguageController.instance;
    if (value == null || value.isEmpty) return lc.t('settings.violations.severity.na');
    if (value == 'high') return lc.t('settings.violations.severity.high');
    if (value == 'medium') return lc.t('settings.violations.severity.medium');
    return lc.t('settings.violations.severity.low');
  }

  String _formatViolationActionLabel(String action) {
    final lc = LanguageController.instance;
    switch (action) {
      case 'remove_post':
        return lc.t('settings.violations.action.removedPost');
      case 'restrict_post':
        return lc.t('settings.violations.action.restrictedPost');
      case 'delete_comment':
        return lc.t('settings.violations.action.deletedComment');
      case 'warn':
      case 'warn_user':
        return lc.t('settings.violations.action.warningIssued');
      case 'mute_interaction':
        return lc.t('settings.violations.action.interactionMuted');
      case 'suspend_user':
        return lc.t('settings.violations.action.accountSuspended');
      case 'limit_account':
        return lc.t('settings.violations.action.accountLimited');
      default:
        return lc.t('settings.violations.action.policyAction');
    }
  }

  bool _isViolationWarnAction(String action) {
    return action == 'warn' || action == 'warn_user';
  }

  String? _formatViolationRemainingHourMinute(String? value) {
    if (value == null || value.isEmpty) return null;
    final expiresAt = DateTime.tryParse(value);
    if (expiresAt == null) return null;
    final totalMinutes = (expiresAt.difference(DateTime.now()).inMinutes).clamp(
      0,
      1 << 30,
    );
    final hours = (totalMinutes / 60).floor();
    final minutes = totalMinutes % 60;
    return '${hours.toString().padLeft(2, '0')}:${minutes.toString().padLeft(2, '0')}';
  }

  bool _canOpenViolationDetail(_ViolationHistoryItem item) {
    return item.targetType != 'user';
  }

  String _violationSubtitle(_ViolationHistoryItem item) {
    final lc = LanguageController.instance;
    if (item.action == 'mute_interaction') {
      final remaining = _formatViolationRemainingHourMinute(
        item.actionExpiresAt,
      );
      return remaining != null
          ? lc.t('settings.violations.subtitle.interactionMutedRemaining', {'time': remaining})
          : lc.t('settings.violations.subtitle.interactionMutedUntilOn');
    }
    if (_isViolationWarnAction(item.action)) {
      return lc.t('settings.violations.subtitle.severityNoStrike', {'severity': _formatViolationSeverityLabel(item.severity)});
    }
    return lc.t('settings.violations.subtitle.severityWithStrike', {
      'severity': _formatViolationSeverityLabel(item.severity),
      'delta': item.strikeDelta,
      'total': item.strikeTotalAfter,
    });
  }

  Future<void> _openViolationDetail(_ViolationHistoryItem item) async {
    if (!_canOpenViolationDetail(item) || !mounted) return;
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => _ViolationDetailScreen(item: item),
      ),
    );
  }

  String _activityTitle(_ContentActivityItem item) {
    final lc = LanguageController.instance;
    final meta = item.meta;
    final authorName = (meta?.postAuthorDisplayName?.trim().isNotEmpty == true)
        ? meta!.postAuthorDisplayName!.trim()
        : (meta?.postAuthorUsername?.trim().isNotEmpty == true)
        ? '@${meta!.postAuthorUsername!.trim()}'
        : lc.t('settings.content.activityType.thisPost');
    final targetName = (meta?.targetDisplayName?.trim().isNotEmpty == true)
        ? meta!.targetDisplayName!.trim()
        : (meta?.targetUsername?.trim().isNotEmpty == true)
        ? '@${meta!.targetUsername!.trim()}'
        : lc.t('settings.content.activityType.thisAccount');

    switch (item.type) {
      case 'post_like':
        return lc.t('settings.content.activityType.likedPost', {'name': authorName});
      case 'comment_like':
        return lc.t('settings.content.activityType.likedComment');
      case 'comment':
        return lc.t('settings.content.activityType.commentedOn', {'name': authorName});
      case 'repost':
        return lc.t('settings.content.activityType.repostedPost', {'name': authorName});
      case 'save':
        return lc.t('settings.content.activityType.savedPost', {'name': authorName});
      case 'follow':
        return lc.t('settings.content.activityType.followedUser', {'name': targetName});
      case 'report_post':
        return lc.t('settings.content.activityType.reportedPost', {'name': authorName});
      case 'report_user':
        return lc.t('settings.content.activityType.reportedUser', {'name': targetName});
      default:
        return lc.t('settings.content.activityType.activity');
    }
  }

  String _activitySubtitle(_ContentActivityItem item) {
    final lc = LanguageController.instance;
    final meta = item.meta;
    final commentSnippet = meta?.commentSnippet?.trim();
    final captionSnippet = meta?.postCaption;
    if (item.type == 'comment_like' || item.type == 'comment') {
      return (commentSnippet != null && commentSnippet.isNotEmpty)
          ? commentSnippet
          : lc.t('settings.content.activityType.comment');
    }
    return _cleanSnippetText(captionSnippet, fallback: lc.t('settings.content.activityType.post'));
  }

  bool _isActivityClickable(_ContentActivityItem item) {
    final hasPost = (item.postId?.isNotEmpty ?? false);
    final hasFollowTarget =
        item.type == 'follow' && (item.targetUserId?.isNotEmpty ?? false);
    return hasPost || hasFollowTarget;
  }

  String? _activityThumbUrl(_ContentActivityItem item) {
    return item.meta?.postMediaUrl ?? item.meta?.targetAvatarUrl;
  }

  String? _priorityCommentIdForActivity(_ContentActivityItem item) {
    if (item.type == 'comment_like' || item.type == 'comment') {
      final id = item.commentId;
      if (id != null && id.isNotEmpty) return id;
    }
    return null;
  }

  Future<void> _openActivityTarget(_ContentActivityItem item) async {
    if (!mounted) return;

    if (item.type == 'follow' && (item.targetUserId?.isNotEmpty ?? false)) {
      await Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => ProfileScreen(userId: item.targetUserId!),
        ),
      );
      return;
    }

    if (item.postId == null || item.postId!.isEmpty) return;
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => PostDetailScreen(
          postId: item.postId!,
          priorityCommentId: _priorityCommentIdForActivity(item),
        ),
      ),
    );
  }

  Future<void> _openHiddenPost(_HiddenPostItem item) async {
    if (item.id.isEmpty || !mounted) return;
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => PostDetailScreen(postId: item.id),
      ),
    );
  }

  Future<void> _handleUnhidePost(String postId) async {
    if (postId.isEmpty) return;
    setState(() {
      _unhideSubmitting[postId] = true;
      _hiddenPostsError = null;
    });
    try {
      await ProfileService.unhidePost(postId: postId);
      if (!mounted) return;
      setState(() {
        _hiddenPosts = _hiddenPosts
            .where((item) => item.id != postId)
            .toList(growable: false);
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _hiddenPostsError = e.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _hiddenPostsError = LanguageController.instance.t('settings.content.unableToUnhide');
      });
    } finally {
      if (!mounted) return;
      setState(() {
        _unhideSubmitting[postId] = false;
      });
    }
  }

  Future<void> _confirmAndUnhide(_HiddenPostItem item) async {
    final lc = LanguageController.instance;
    final postId = item.id;
    if (postId.isEmpty) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: _surface,
        title: Text('Unhide this post?', style: TextStyle(color: _textPrimary)),
        content: Text(
          'This post will appear in your feed again.',
          style: TextStyle(color: _textSecondary),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text(lc.t('common.cancel')),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(lc.t('settings.unhide')),
          ),
        ],
      ),
    );
    if (confirmed == true) {
      await _handleUnhidePost(postId);
    }
  }

  Future<void> _openBlockedUser(_BlockedUserItem item) async {
    if (item.userId.isEmpty || !mounted) return;
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => ProfileScreen(userId: item.userId),
      ),
    );
  }

  Future<void> _handleUnblockUser(String userId) async {
    if (userId.isEmpty) return;
    setState(() {
      _unblockSubmitting[userId] = true;
      _blockedUsersError = null;
    });
    try {
      await ProfileService.unblockUser(userId: userId);
      if (!mounted) return;
      setState(() {
        _blockedUsers = _blockedUsers
            .where((item) => item.userId != userId)
            .toList(growable: false);
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _blockedUsersError = e.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _blockedUsersError = LanguageController.instance.t('settings.content.unableToUnblock');
      });
    } finally {
      if (!mounted) return;
      setState(() {
        _unblockSubmitting[userId] = false;
      });
    }
  }

  Future<void> _confirmAndUnblock(_BlockedUserItem item) async {
    final lc = LanguageController.instance;
    if (item.userId.isEmpty) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: _surface,
        title: Text(
          'Unblock this account?',
          style: TextStyle(color: _textPrimary),
        ),
        content: Text(
          'They will be able to see your profile and content again.',
          style: TextStyle(color: _textSecondary),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text(lc.t('common.cancel')),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(lc.t('settings.unblock')),
          ),
        ],
      ),
    );
    if (confirmed == true) {
      await _handleUnblockUser(item.userId);
    }
  }

  Future<void> _openNotificationMuteOverlay({
    required String title,
    required String subtitle,
    required String? mutedUntil,
    required bool mutedIndefinitely,
    required Future<void> Function(String? until, bool indefinitely) onSave,
  }) async {
    final lc = LanguageController.instance;
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final isDark = theme.brightness == Brightness.dark;
    String selected = '5m';
    String customDate = '';
    String customTime = '';
    String? error;
    bool saving = false;

    if (mutedIndefinitely) {
      selected = 'until';
    } else if (mutedUntil != null && mutedUntil.isNotEmpty) {
      final dt = DateTime.tryParse(mutedUntil)?.toLocal();
      if (dt != null) {
        selected = 'custom';
        final y = dt.year.toString().padLeft(4, '0');
        final m = dt.month.toString().padLeft(2, '0');
        final d = dt.day.toString().padLeft(2, '0');
        final hh = dt.hour.toString().padLeft(2, '0');
        final mm = dt.minute.toString().padLeft(2, '0');
        customDate = '$y-$m-$d';
        customTime = '$hh:$mm';
      }
    }

    await showDialog<void>(
      context: context,
      barrierColor: Colors.black.withValues(alpha: 0.55),
      builder: (dialogCtx) {
        return StatefulBuilder(
          builder: (ctx, setModalState) {
            final quickOptions = _notificationMuteOptions
                .where((opt) {
                  final key = opt['key'] as String;
                  return key != 'until' && key != 'custom';
                })
                .toList(growable: false);
            final endingOptions = _notificationMuteOptions
                .where((opt) {
                  final key = opt['key'] as String;
                  return key == 'until' || key == 'custom';
                })
                .toList(growable: false);

            Widget buildOptionTile(Map<String, dynamic> opt, {double? width}) {
              final key = opt['key'] as String;
              final active = selected == key;
              return GestureDetector(
                onTap: saving
                    ? null
                    : () => setModalState(() {
                        selected = key;
                        error = null;
                      }),
                child: Container(
                  width: width,
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 12,
                  ),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: active
                          ? scheme.primary.withValues(
                              alpha: isDark ? 0.62 : 0.4,
                            )
                          : scheme.outline,
                    ),
                    color: active
                        ? (isDark
                              ? scheme.primary.withValues(alpha: 0.25)
                              : scheme.primaryContainer)
                        : Colors.transparent,
                  ),
                  child: Text(
                    lc.t(opt['labelKey'] as String),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: active
                          ? (isDark
                                ? _tokens.primarySoft
                                : scheme.onPrimaryContainer)
                          : scheme.onSurfaceVariant,
                      fontWeight: FontWeight.w700,
                      fontSize: 13,
                    ),
                  ),
                ),
              );
            }

            return Dialog(
              backgroundColor: scheme.surface,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(18),
                side: BorderSide(color: scheme.outline.withValues(alpha: 0.75)),
              ),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                title,
                                style: TextStyle(
                                  color: scheme.onSurface,
                                  fontSize: 20,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                              const SizedBox(height: 6),
                              Text(
                                subtitle,
                                style: TextStyle(
                                  color: scheme.onSurfaceVariant,
                                  fontSize: 14,
                                ),
                              ),
                            ],
                          ),
                        ),
                        IconButton(
                          onPressed: saving
                              ? null
                              : () => Navigator.of(dialogCtx).pop(),
                          icon: Icon(
                            Icons.close_rounded,
                            color: scheme.onSurfaceVariant,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    LayoutBuilder(
                      builder: (_, constraints) {
                        final itemWidth = (constraints.maxWidth - 8) / 2;
                        return Column(
                          children: [
                            Wrap(
                              spacing: 8,
                              runSpacing: 8,
                              children: quickOptions
                                  .map(
                                    (opt) =>
                                        buildOptionTile(opt, width: itemWidth),
                                  )
                                  .toList(growable: false),
                            ),
                            if (endingOptions.isNotEmpty) ...[
                              const SizedBox(height: 8),
                              Column(
                                children: [
                                  for (
                                    var i = 0;
                                    i < endingOptions.length;
                                    i++
                                  ) ...[
                                    if (i > 0) const SizedBox(height: 8),
                                    buildOptionTile(
                                      endingOptions[i],
                                      width: constraints.maxWidth,
                                    ),
                                  ],
                                ],
                              ),
                            ],
                          ],
                        );
                      },
                    ),
                    if (selected == 'custom') ...[
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          Expanded(
                            child: OutlinedButton.icon(
                              onPressed: saving
                                  ? null
                                  : () async {
                                      final next = await _pickNotificationDate(
                                        customDate,
                                      );
                                      if (next == null) return;
                                      setModalState(() {
                                        customDate = next;
                                        error = null;
                                      });
                                    },
                              icon: Icon(
                                Icons.calendar_today_outlined,
                                size: 16,
                              ),
                              label: Text(
                                customDate.isEmpty ? lc.t('settings.common.selectDate') : customDate,
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: OutlinedButton.icon(
                              onPressed: saving
                                  ? null
                                  : () async {
                                      final next = await _pickNotificationTime(
                                        customTime,
                                      );
                                      if (next == null) return;
                                      setModalState(() {
                                        customTime = next;
                                        error = null;
                                      });
                                    },
                              icon: Icon(Icons.schedule_rounded, size: 16),
                              label: Text(
                                customTime.isEmpty ? lc.t('settings.common.selectTime') : customTime,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                    if (error != null) ...[
                      const SizedBox(height: 10),
                      Text(
                        error!,
                        style: TextStyle(color: scheme.error, fontSize: 13),
                      ),
                    ],
                    const SizedBox(height: 14),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.end,
                      children: [
                        TextButton(
                          onPressed: saving
                              ? null
                              : () => Navigator.of(dialogCtx).pop(),
                          child: Text(lc.t('common.cancel')),
                        ),
                        const SizedBox(width: 8),
                        FilledButton(
                          onPressed: saving
                              ? null
                              : () async {
                                  setModalState(() {
                                    saving = true;
                                    error = null;
                                  });

                                  try {
                                    String? nextMutedUntil;
                                    bool nextMutedIndefinitely = false;
                                    final selectedOpt = _notificationMuteOptions
                                        .firstWhere(
                                          (o) => o['key'] == selected,
                                        );

                                    if (selected == 'until') {
                                      nextMutedIndefinitely = true;
                                    } else if (selected == 'custom') {
                                      final iso = _buildLocalDateTimeIso(
                                        customDate,
                                        customTime,
                                      );
                                      if (iso == null) {
                                        setModalState(() {
                                          saving = false;
                                          error = lc.t('settings.common.pleaseSelectValidDateTime');
                                        });
                                        return;
                                      }
                                      final dt = DateTime.parse(iso);
                                      if (!dt.isAfter(DateTime.now().toUtc())) {
                                        setModalState(() {
                                          saving = false;
                                          error = lc.t('settings.common.pleaseChooseFutureTime');
                                        });
                                        return;
                                      }
                                      nextMutedUntil = iso;
                                    } else {
                                      final ms = selectedOpt['ms'] as int?;
                                      if (ms != null) {
                                        nextMutedUntil = DateTime.now()
                                            .toUtc()
                                            .add(Duration(milliseconds: ms))
                                            .toIso8601String();
                                      } else {
                                        nextMutedIndefinitely = true;
                                      }
                                    }

                                    await onSave(
                                      nextMutedUntil,
                                      nextMutedIndefinitely,
                                    );

                                    if (ctx.mounted) {
                                      Navigator.of(dialogCtx).pop();
                                    }
                                  } catch (e) {
                                    setModalState(() {
                                      saving = false;
                                      error = e is ApiException
                                          ? e.message
                                          : lc.t('settings.common.failedUpdateNotifications');
                                    });
                                  }
                                },
                          child: Text(saving ? lc.t('settings.common.savingDots') : lc.t('common.save')),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
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
          _passwordError = LanguageController.instance.t('settings.common.otpSent');
        } else {
          _passwordError = e.message;
        }
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _passwordError = LanguageController.instance.t('settings.common.unableToSendOtp'));
    } finally {
      if (!mounted) return;
      setState(() => _passwordSubmitting = false);
    }
  }

  Future<void> _verifyPasswordOtp() async {
    final lc = LanguageController.instance;
    final code = _passwordOtp.trim();
    if (code.isEmpty) {
      setState(() => _passwordError = lc.t('settings.email.enterOtpFirst'));
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
      setState(() => _passwordError = lc.t('settings.common.invalidExpiredOtp'));
    } finally {
      if (!mounted) return;
      setState(() => _passwordSubmitting = false);
    }
  }

  Future<void> _confirmPasswordChange() async {
    final lc = LanguageController.instance;
    final current = _passwordCurrent.trim();
    final next = _passwordNew.trim();
    final confirm = _passwordConfirm.trim();

    if (current.isEmpty) {
      setState(() => _passwordError = lc.t('settings.passwordSecurity.enterCurrentPasswordError'));
      return;
    }
    if (next.isEmpty) {
      setState(() => _passwordError = lc.t('settings.passwordSecurity.enterNewPasswordError'));
      return;
    }
    if (next == current) {
      setState(() {
        _passwordError = lc.t('settings.passwordSecurity.passwordSameError');
      });
      return;
    }
    if (!_passwordRegex.hasMatch(next)) {
      setState(() {
        _passwordError = lc.t('settings.passwordSecurity.passwordFormatError');
      });
      return;
    }
    if (next != confirm) {
      setState(() => _passwordError = lc.t('settings.passwordSecurity.passwordMismatchError'));
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
        _passwordSuccess = lc.t('settings.passwordSecurity.passwordUpdatedSuccess');
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
      setState(() => _passwordError = lc.t('settings.passwordSecurity.unableToChangePassword'));
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
      setState(() => _passwordLogoutError = LanguageController.instance.t('settings.passwordSecurity.unableToLogoutDevices'));
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
          _twoFactorError = LanguageController.instance.t('settings.common.otpSent');
        } else {
          _twoFactorError = e.message;
        }
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _twoFactorError = LanguageController.instance.t('settings.common.unableToSendOtp'));
    } finally {
      if (!mounted) return;
      setState(() => _twoFactorSubmitting = false);
    }
  }

  Future<void> _verifyTwoFactorOtp() async {
    final lc = LanguageController.instance;
    final code = _twoFactorOtp.trim();
    if (code.isEmpty) {
      setState(() => _twoFactorError = lc.t('settings.email.enterOtpFirst'));
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
            ? lc.t('settings.passwordSecurity.twoFactor.enabled')
            : lc.t('settings.passwordSecurity.twoFactor.disabled');
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _twoFactorError = e.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _twoFactorError = lc.t('settings.common.invalidExpiredOtp'));
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
    final lc = LanguageController.instance;
    final password = _passkeyPassword.trim();
    if (password.isEmpty) {
      setState(() => _passkeyError = lc.t('settings.email.enterCurrentPasswordFirst'));
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
          _passkeyError = lc.t('settings.common.otpSent');
        } else {
          _passkeyError = e.message;
        }
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _passkeyError = lc.t('settings.common.unableToSendOtp'));
    } finally {
      if (!mounted) return;
      setState(() => _passkeySubmitting = false);
    }
  }

  Future<void> _verifyPasskeyOtp() async {
    final lc = LanguageController.instance;
    final code = _passkeyOtp.trim();
    if (code.isEmpty) {
      setState(() => _passkeyError = lc.t('settings.email.enterOtpFirst'));
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
      setState(() => _passkeyError = lc.t('settings.common.invalidExpiredOtp'));
    } finally {
      if (!mounted) return;
      setState(() => _passkeySubmitting = false);
    }
  }

  Future<void> _confirmPasskey() async {
    final lc = LanguageController.instance;
    final next = _passkeyNew.trim();
    final confirm = _passkeyConfirm.trim();
    if (_hasPasskey && _passkeyCurrent.trim().isEmpty) {
      setState(() => _passkeyError = lc.t('settings.passwordSecurity.passkey.currentPasskeyRequired'));
      return;
    }
    if (next.isEmpty) {
      setState(() => _passkeyError = lc.t('settings.passwordSecurity.passkey.enterNewPasskey'));
      return;
    }
    if (!_passkeyRegex.hasMatch(next)) {
      setState(() => _passkeyError = lc.t('settings.passwordSecurity.passkey.passkeyMustBe6Digits'));
      return;
    }
    if (next != confirm) {
      setState(() => _passkeyError = lc.t('settings.passwordSecurity.passkey.passkeysMismatch'));
      return;
    }
    if (_hasPasskey && next == _passkeyCurrent) {
      setState(() {
        _passkeyError = lc.t('settings.passwordSecurity.passkey.newPasskeySameAsCurrent');
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
        _passkeySuccess = lc.t('settings.passwordSecurity.passkey.passkeyUpdatedSuccess');
        _passkeyOtp = '';
        _passkeyNew = '';
        _passkeyConfirm = '';
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _passkeyError = e.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _passkeyError = lc.t('settings.passwordSecurity.passkey.unableToUpdatePasskey'));
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
      setState(() => _passkeyToggleError = LanguageController.instance.t('settings.passwordSecurity.passkey.unableToUpdatePasskey'));
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
      return LanguageController.instance.t('settings.passwordSecurity.devices.cordigramAppOn', {'os': osLabel});
    }

    if (info.isNotEmpty) return info;
    final parts = <String>[
      if (browser.isNotEmpty) browser,
      if (os.isNotEmpty) os,
    ];
    if (parts.isNotEmpty) return parts.join(' on ');
    return type.isEmpty
        ? LanguageController.instance.t('settings.passwordSecurity.devices.unknownDevice')
        : LanguageController.instance.t('settings.passwordSecurity.devices.typeDevice', {'type': type});
  }

  String _resolveDeviceTime(Map<String, dynamic> device) {
    final raw =
        (device['lastSeenAt'] as String?) ?? (device['firstSeenAt'] as String?);
    final text = _formatRelativeTime(raw);
    if (text.isEmpty) return '';
    return LanguageController.instance.t('settings.common.lastActive', {'time': text});
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
      setState(() => _loginDevicesError = LanguageController.instance.t('settings.passwordSecurity.devices.unableToLogoutDevice'));
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
      setState(() => _loginDevicesError = LanguageController.instance.t('settings.passwordSecurity.devices.unableToLogoutDevice'));
    } finally {
      if (!mounted) return;
      setState(() {
        _logoutDeviceSubmitting.remove(deviceIdHash);
      });
    }
  }

  Future<void> _logoutAllDevices() async {
    if (_loginDevicesCurrent == null || _loginDevicesCurrent!.isEmpty) {
      setState(() => _logoutAllError = LanguageController.instance.t('settings.common.unableDetectDevice'));
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
      setState(() => _logoutAllError = LanguageController.instance.t('settings.passwordSecurity.devices.unableToLogoutAll'));
    } finally {
      if (!mounted) return;
      setState(() => _logoutAllSubmitting = false);
    }
  }

  String _formatRelativeTime(String? value) {
    final lc = LanguageController.instance;
    if (value == null || value.isEmpty) return '';
    final dt = DateTime.tryParse(value);
    if (dt == null) return '';
    final diff = DateTime.now().difference(dt);
    if (diff.inMinutes < 1) return lc.t('settings.common.justNow');
    if (diff.inHours < 1) return lc.t('settings.common.minutesAgo', {'m': diff.inMinutes});
    if (diff.inDays < 1) return lc.t('settings.common.hoursAgo', {'h': diff.inHours});
    if (diff.inDays < 30) return lc.t('settings.common.daysAgo', {'d': diff.inDays});
    final months = (diff.inDays / 30).floor();
    if (months < 12) return lc.t('settings.common.monthsAgo', {'mo': months});
    final years = (diff.inDays / 365).floor();
    return lc.t('settings.common.yearsAgo', {'y': years});
  }

  String _formatRequirementLabel(String value) {
    final lc = LanguageController.instance;
    switch (value) {
      case 'account_age':
        return lc.t('settings.creator.requirementAccountAge');
      case 'followers_count':
        return lc.t('settings.creator.requirementFollowers');
      case 'posts_count':
        return lc.t('settings.creator.requirementPosts');
      case 'active_posting_days_30d':
        return lc.t('settings.creator.requirementActivePostingDays');
      case 'engagement_per_post_30d':
        return lc.t('settings.creator.requirementEngagement');
      case 'recent_violations_90d':
        return lc.t('settings.creator.requirementViolations');
      case 'score':
        return lc.t('settings.creator.requirementScore');
      default:
        return value;
    }
  }

  String _formatNum(num value) {
    if (value % 1 == 0) return value.toInt().toString();
    return value.toStringAsFixed(1);
  }

  String _sectionTitle(SettingsTab tab) {
    final lc = LanguageController.instance;
    switch (tab) {
      case SettingsTab.personalInfo:
        return lc.t('settings.tab.personalInfo');
      case SettingsTab.profile:
        return lc.t('settings.tab.profile');
      case SettingsTab.creatorVerification:
        return lc.t('settings.tab.creatorVerification');
      case SettingsTab.passwordSecurity:
        return lc.t('settings.tab.passwordSecurity');
      case SettingsTab.content:
        return lc.t('settings.tab.content');
      case SettingsTab.violations:
        return lc.t('settings.tab.violations');
      case SettingsTab.notifications:
        return lc.t('settings.tab.notifications');
      case SettingsTab.system:
        return lc.t('settings.tab.system');
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
      case SettingsTab.content:
        return Icons.article_outlined;
      case SettingsTab.violations:
        return Icons.gpp_bad_outlined;
      case SettingsTab.notifications:
        return Icons.notifications_none_rounded;
      case SettingsTab.system:
        return Icons.tune_rounded;
    }
  }

  String _sectionDescription(SettingsTab tab) {
    final lc = LanguageController.instance;
    switch (tab) {
      case SettingsTab.personalInfo:
        return lc.t('settings.tab.personalInfoDesc');
      case SettingsTab.profile:
        return lc.t('settings.tab.profileDesc');
      case SettingsTab.creatorVerification:
        return lc.t('settings.tab.creatorVerificationDesc');
      case SettingsTab.passwordSecurity:
        return lc.t('settings.tab.passwordSecurityDesc');
      case SettingsTab.content:
        return lc.t('settings.tab.contentDesc');
      case SettingsTab.violations:
        return lc.t('settings.tab.violationsDesc');
      case SettingsTab.notifications:
        return lc.t('settings.tab.notificationsDesc');
      case SettingsTab.system:
        return lc.t('settings.tab.systemDesc');
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
      if (previous == SettingsTab.content && tab != SettingsTab.content) {
        _resetContentViewState(clearData: true);
      }
      if (previous == SettingsTab.violations && tab != SettingsTab.violations) {
        _resetViolationsViewState(clearData: true);
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
    if (tab == SettingsTab.notifications &&
        _notificationSettings == null &&
        !_notificationLoading) {
      _loadNotificationSettings();
    }
    if (tab == SettingsTab.content) {
      setState(() {
        _resetContentViewState();
      });
      _loadContentSettings();
      _loadActivityLog(reset: true);
    }
    if (tab == SettingsTab.violations) {
      setState(() {
        _resetViolationsViewState();
      });
      _loadViolationCenter();
    }
  }

  String _toVisibilityLabel(String value) {
    final lc = LanguageController.instance;
    if (value == 'private') return lc.t('settings.visibility.private');
    if (value == 'followers') return lc.t('settings.visibility.followers');
    return lc.t('settings.visibility.public');
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
                        style: TextStyle(color: _textPrimary),
                      ),
                      trailing: option == currentValue
                          ? Icon(Icons.check_rounded, color: _accent)
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
        _visibilityError = LanguageController.instance.t('settings.common.failedUpdateVisibility');
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
    if (text.isEmpty) return LanguageController.instance.t('settings.common.notSet');
    return prefixAt ? '@$text' : text;
  }

  String _displayBirthdate(String? raw) {
    if (raw == null || raw.trim().isEmpty) return LanguageController.instance.t('settings.common.notSet');
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
      itemCount: sections.length,
      separatorBuilder: (_, __) => const SizedBox(height: 10),
      itemBuilder: (context, index) {
        final section = sections[index];
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
                        style: TextStyle(
                          color: _textPrimary,
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        _sectionDescription(section),
                        style: TextStyle(color: _textSecondary, fontSize: 12),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Icon(
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

  Widget _buildSystemTab() {
    final lc = LanguageController.instance;
    return AnimatedBuilder(
      animation: Listenable.merge([ThemeController.instance, lc]),
      builder: (context, _) => Column(
        children: [
          // Appearance toggle
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
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
                  child: Icon(
                    ThemeController.instance.isDarkMode
                        ? Icons.dark_mode_rounded
                        : Icons.light_mode_rounded,
                    color: _accent,
                    size: 20,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        lc.t('settings.system.appearance.title'),
                        style: TextStyle(
                          color: _textPrimary,
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        lc.t('settings.system.appearance.description'),
                        style: TextStyle(color: _textSecondary, fontSize: 12),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 10),
                Switch(
                  value: ThemeController.instance.isDarkMode,
                  activeColor: _accent,
                  onChanged: (value) {
                    ThemeController.instance.setThemeMode(
                      value ? ThemeMode.dark : ThemeMode.light,
                    );
                    setState(() {});
                  },
                ),
              ],
            ),
          ),
          const SizedBox(height: 10),
          // Language picker
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
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
                  child: Icon(
                    Icons.language_rounded,
                    color: _accent,
                    size: 20,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        lc.t('settings.system.language.title'),
                        style: TextStyle(
                          color: _textPrimary,
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        lc.t('settings.system.language.description'),
                        style: TextStyle(color: _textSecondary, fontSize: 12),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 10),
                DropdownButton<String>(
                  value: lc.language,
                  dropdownColor: _surface,
                  underline: const SizedBox.shrink(),
                  style: TextStyle(color: _textPrimary, fontSize: 13),
                  items: LanguageController.supported.map((code) {
                    return DropdownMenuItem(
                      value: code,
                      child: Text(
                        lc.t('settings.system.language.options.$code'),
                        style: TextStyle(color: _textPrimary, fontSize: 13),
                      ),
                    );
                  }).toList(),
                  onChanged: (code) {
                    if (code != null) {
                      lc.setLanguage(code);
                    }
                  },
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSectionDetail() {
    final tab = _selectedTab ?? SettingsTab.personalInfo;
    if (tab == SettingsTab.personalInfo) return _buildPersonalInfoTab();
    if (tab == SettingsTab.profile) return _buildProfileTab();
    if (tab == SettingsTab.passwordSecurity) return _buildPasswordSecurityTab();
    if (tab == SettingsTab.content) return _buildContentTab();
    if (tab == SettingsTab.violations) return _buildViolationsTab();
    if (tab == SettingsTab.notifications) return _buildNotificationsTab();
    if (tab == SettingsTab.system) return _buildSystemTab();
    return _buildCreatorVerificationTab();
  }

  String _stepLabel() {
    final lc = LanguageController.instance;
    switch (_emailStep) {
      case _EmailChangeStep.password:
        return lc.t('settings.emailStep.verifyPassword');
      case _EmailChangeStep.currentOtp:
        return lc.t('settings.emailStep.currentOtp');
      case _EmailChangeStep.newEmail:
        return lc.t('settings.emailStep.enterNewEmail');
      case _EmailChangeStep.newOtp:
        return lc.t('settings.emailStep.newOtp');
      case _EmailChangeStep.done:
        return lc.t('settings.emailStep.completed');
    }
  }

  InputDecoration _emailInputDecoration(String hint) {
    return InputDecoration(
      hintText: hint,
      hintStyle: TextStyle(color: _textSecondary),
      filled: true,
      fillColor: _surface,
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
        borderSide: BorderSide(color: _accent),
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
              disabledBackgroundColor: _border,
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
    final lc = LanguageController.instance;
    final currentEmail = _currentEmail ?? lc.t('common.loading');

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          lc.t('settings.accountEmail'),
          style: TextStyle(
            color: _textPrimary,
            fontSize: 18,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          lc.t('settings.manageSignInEmail'),
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
                          Text(
                            lc.t('settings.currentEmail'),
                            style: TextStyle(
                              color: _textSecondary,
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            currentEmail,
                            style: TextStyle(
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
                      child: Text(lc.t('settings.changeEmail')),
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
                          icon: Icon(
                            Icons.arrow_back_rounded,
                            size: 16,
                            color: _textPrimary,
                          ),
                          label: Text(
                            lc.t('common.back'),
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
                            style: TextStyle(
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
                      Text(
                        lc.t('settings.email.currentPassword'),
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
                        style: TextStyle(color: _textPrimary),
                        decoration: _emailInputDecoration(
                          lc.t('settings.email.enterPassword'),
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        lc.t('settings.email.willSendOtpCurrent'),
                        style: TextStyle(color: _textSecondary, fontSize: 12),
                      ),
                      const SizedBox(height: 12),
                      _buildStepActions(
                        primaryLabel: _emailSubmitting
                            ? lc.t('settings.common.sending')
                            : lc.t('settings.common.sendOtp'),
                        onPrimary: _emailSubmitting ? null : _requestCurrentOtp,
                      ),
                    ],
                    if (_emailStep == _EmailChangeStep.currentOtp) ...[
                      Text(
                        lc.t('settings.email.enterOtpCurrent'),
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
                        style: TextStyle(color: _textPrimary),
                        decoration: _emailInputDecoration(
                          '------',
                        ).copyWith(counterText: ''),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        _currentExpiresSec != null
                            ? lc.t('settings.common.otpExpiresInSec', {'sec': _currentExpiresSec})
                            : lc.t('settings.common.otpExpiresIn5Min'),
                        style: TextStyle(color: _textSecondary, fontSize: 12),
                      ),
                      const SizedBox(height: 12),
                      _buildStepActions(
                        secondaryLabel: _currentCooldown > 0
                            ? lc.t('settings.common.resendWithCooldown', {'sec': _currentCooldown})
                            : lc.t('settings.common.resendOtp'),
                        onSecondary: _requestCurrentOtp,
                        secondaryDisabled:
                            _emailSubmitting || _currentCooldown > 0,
                        primaryLabel: _emailSubmitting
                            ? lc.t('settings.common.verifying')
                            : lc.t('settings.common.verify'),
                        onPrimary: _emailSubmitting ? null : _verifyCurrentOtp,
                      ),
                    ],
                    if (_emailStep == _EmailChangeStep.newEmail) ...[
                      Text(
                        lc.t('settings.email.newEmail'),
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
                        style: TextStyle(color: _textPrimary),
                        decoration: _emailInputDecoration('name@example.com'),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        lc.t('settings.email.willSendOtpNew'),
                        style: TextStyle(color: _textSecondary, fontSize: 12),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        lc.t('settings.email.afterChangeNote'),
                        style: TextStyle(color: _textSecondary, fontSize: 12),
                      ),
                      const SizedBox(height: 12),
                      _buildStepActions(
                        primaryLabel: _emailSubmitting
                            ? lc.t('settings.common.sending')
                            : lc.t('settings.common.sendOtp'),
                        onPrimary: _emailSubmitting ? null : _requestNewOtp,
                      ),
                    ],
                    if (_emailStep == _EmailChangeStep.newOtp) ...[
                      Text(
                        lc.t('settings.email.otpForNewEmail'),
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
                        style: TextStyle(color: _textPrimary),
                        decoration: _emailInputDecoration(
                          '------',
                        ).copyWith(counterText: ''),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        _newExpiresSec != null
                            ? lc.t('settings.common.otpExpiresInSec', {'sec': _newExpiresSec})
                            : lc.t('settings.common.otpExpiresIn5Min'),
                        style: TextStyle(color: _textSecondary, fontSize: 12),
                      ),
                      const SizedBox(height: 12),
                      _buildStepActions(
                        secondaryLabel: _newCooldown > 0
                            ? lc.t('settings.common.resendWithCooldown', {'sec': _newCooldown})
                            : lc.t('settings.common.resendOtp'),
                        onSecondary: _requestNewOtp,
                        secondaryDisabled: _emailSubmitting || _newCooldown > 0,
                        primaryLabel: _emailSubmitting
                            ? lc.t('settings.common.verifying')
                            : lc.t('settings.email.confirm'),
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
                          style: TextStyle(color: _textPrimary),
                        ),
                      ),
                    if (_emailError != null) ...[
                      const SizedBox(height: 10),
                      Text(
                        _emailError!,
                        style: TextStyle(color: _danger, fontSize: 12),
                      ),
                    ],
                    if (_emailSuccess != null &&
                        _emailStep != _EmailChangeStep.done) ...[
                      const SizedBox(height: 10),
                      Text(
                        _emailSuccess!,
                        style: TextStyle(color: _textPrimary, fontSize: 12),
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
                  style: TextStyle(
                    color: _textPrimary,
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 5),
                Text(
                  value,
                  style: TextStyle(color: _textSecondary, fontSize: 13),
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
                  saving ? LanguageController.instance.t('settings.common.saving') : _toVisibilityLabel(currentVisibility!),
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
    final lc = LanguageController.instance;
    final profile = _profile;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildAccountEmailSection(),
        const SizedBox(height: 18),
        Text(
          lc.t('settings.personalInfo'),
          style: TextStyle(
            color: _textPrimary,
            fontSize: 18,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          lc.t('settings.tab.personalInfoDesc'),
          style: TextStyle(color: _textSecondary, fontSize: 13),
        ),
        const SizedBox(height: 14),
        _buildCard(
          children: [
            _buildInfoRow(
              title: lc.t('settings.personalInfo.displayName'),
              value: _valueOrNotSet(profile?.displayName),
            ),
            _buildInfoRow(
              title: lc.t('settings.personalInfo.username'),
              value: _valueOrNotSet(profile?.username, prefixAt: true),
            ),
            _buildInfoRow(
              title: lc.t('settings.personalInfo.birthdate'),
              value: _displayBirthdate(profile?.birthdate),
              field: 'birthdate',
              enabled: profile != null,
            ),
            _buildInfoRow(
              title: lc.t('settings.personalInfo.gender'),
              value: _valueOrNotSet(profile?.gender),
              field: 'gender',
              enabled: profile != null,
            ),
            _buildInfoRow(
              title: lc.t('settings.personalInfo.location'),
              value: _valueOrNotSet(profile?.location),
              field: 'location',
              enabled: profile != null,
            ),
            _buildInfoRow(
              title: lc.t('settings.personalInfo.workplace'),
              value: _valueOrNotSet(profile?.workplace?.companyName),
              field: 'workplace',
              enabled: profile != null,
            ),
            _buildInfoRow(
              title: lc.t('settings.personalInfo.bio'),
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
            style: TextStyle(color: _danger, fontSize: 13),
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
            child: Text(lc.t('settings.editProfile')),
          ),
        ),
      ],
    );
  }

  Widget _buildProfileTab() {
    final lc = LanguageController.instance;
    final profile = _profile;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          lc.t('settings.profileVisibility'),
          style: TextStyle(
            color: _textPrimary,
            fontSize: 18,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          lc.t('settings.controlWhoCanView'),
          style: TextStyle(color: _textSecondary, fontSize: 13),
        ),
        const SizedBox(height: 14),
        _buildCard(
          children: [
            _buildInfoRow(
              title: lc.t('settings.profile.profilePage'),
              value: lc.t('settings.profilePageDesc'),
              field: 'profile',
              enabled: profile != null,
            ),
            _buildInfoRow(
              title: lc.t('settings.profile.aboutThisUser'),
              value: lc.t('settings.aboutThisUserDesc'),
              field: 'about',
              enabled: profile != null,
            ),
            _buildInfoRow(
              title: lc.t('settings.profile.followersList'),
              value: lc.t('settings.followersListDesc'),
              field: 'followers',
              enabled: profile != null,
            ),
            _buildInfoRow(
              title: lc.t('settings.profile.followingList'),
              value: lc.t('settings.followingListDesc'),
              field: 'following',
              enabled: profile != null,
            ),
          ],
        ),
        if (_visibilityError != null) ...[
          const SizedBox(height: 12),
          Text(
            _visibilityError!,
            style: TextStyle(color: _danger, fontSize: 13),
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
                  style: TextStyle(
                    color: _textPrimary,
                    fontWeight: FontWeight.w600,
                    fontSize: 13,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  value,
                  style: TextStyle(color: _textSecondary, fontSize: 13),
                ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Text(
            threshold,
            style: TextStyle(color: _textSecondary, fontSize: 12),
          ),
        ],
      ),
    );
  }

  Widget _buildCreatorLatestRequest(_CreatorLatestRequest request) {
    final lc = LanguageController.instance;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: _surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: _border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(
                lc.t('settings.creator.latestRequest'),
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
                  style: TextStyle(
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
              lc.t('settings.creator.submitted', {'time': _formatRelativeTime(request.createdAt)}),
              style: TextStyle(color: _textSecondary, fontSize: 12),
            ),
          ],
          if ((request.reviewedAt ?? '').isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(
              lc.t('settings.creator.reviewed', {'time': _formatRelativeTime(request.reviewedAt)}),
              style: TextStyle(color: _textSecondary, fontSize: 12),
            ),
          ],
          if ((request.decisionReason ?? '').isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(
              lc.t('settings.creator.reason', {'reason': request.decisionReason}),
              style: TextStyle(color: _textSecondary, fontSize: 12),
            ),
          ],
          if ((request.cooldownUntil ?? '').isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(
              lc.t('settings.creator.canRequestAgain', {'time': _formatRelativeTime(request.cooldownUntil)}),
              style: TextStyle(color: _textSecondary, fontSize: 12),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildCreatorVerificationTab() {
    final lc = LanguageController.instance;
    final status = _creatorStatus;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          lc.t('settings.creator.title'),
          style: TextStyle(
            color: _textPrimary,
            fontSize: 18,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          lc.t('settings.creator.description'),
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
                    Text(
                      lc.t('settings.creator.loadingEligibility'),
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
                        color: _accent.withValues(alpha: 0.14),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(
                          color: _accent.withValues(alpha: 0.45),
                        ),
                      ),
                      child: Text(
                        lc.t('settings.creator.accountVerified'),
                        style: TextStyle(color: _textPrimary),
                      ),
                    ),
                  ],
                  if (status != null && !status.account.isCreatorVerified) ...[
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: _surface,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: _border),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            lc.t('settings.creator.creatorScore'),
                            style: TextStyle(
                              color: _textPrimary,
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            '${_formatNum(status.eligibility.score)} / ${_formatNum(status.eligibility.minimumScore)}',
                            style: TextStyle(
                              color: _textPrimary,
                              fontSize: 20,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const SizedBox(height: 6),
                          Text(
                            status.eligibility.eligible
                                ? lc.t('settings.creator.meetsAllConditions')
                                : lc.t('settings.creator.improveMissing'),
                            style: TextStyle(
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
                          title: lc.t('settings.profile.accountAge'),
                          value: lc.t('settings.creator.accountAgeDays', {'days': status.eligibility.accountAgeDays}),
                          threshold: lc.t('settings.creator.minimum', {'value': status.criteria.minAccountAgeDays}),
                        ),
                        _buildCreatorMetricRow(
                          title: lc.t('settings.creator.followersLabel'),
                          value: '${status.eligibility.followersCount}',
                          threshold: lc.t('settings.creator.minimum', {'value': status.criteria.minFollowersCount}),
                        ),
                        _buildCreatorMetricRow(
                          title: lc.t('settings.profile.publishedPosts'),
                          value: '${status.eligibility.postsCount}',
                          threshold: lc.t('settings.creator.minimum', {'value': status.criteria.minPostsCount}),
                        ),
                        _buildCreatorMetricRow(
                          title: lc.t('settings.creator.activePostingDays'),
                          value: '${status.eligibility.activePostingDays30d}',
                          threshold: lc.t('settings.creator.minimum', {'value': status.criteria.minActivePostingDays30d}),
                        ),
                        _buildCreatorMetricRow(
                          title: lc.t('settings.creator.avgEngagement'),
                          value: _formatNum(
                            status.eligibility.engagementPerPost30d,
                          ),
                          threshold: lc.t('settings.creator.minimum', {'value': _formatNum(status.criteria.minEngagementPerPost30d)}),
                        ),
                        _buildCreatorMetricRow(
                          title: lc.t('settings.creator.recentViolations'),
                          value: '${status.eligibility.recentViolations90d}',
                          threshold: lc.t('settings.creator.maximum', {'value': status.criteria.maxRecentViolations90d}),
                        ),
                      ],
                    ),
                    if (status.eligibility.failedRequirements.isNotEmpty) ...[
                      const SizedBox(height: 10),
                      Text(
                        lc.t('settings.creator.missingRequirements', {'list': status.eligibility.failedRequirements.map(_formatRequirementLabel).join(', ')}),
                        style: TextStyle(color: _danger, fontSize: 12),
                      ),
                    ],
                    if (status.latestRequest != null) ...[
                      const SizedBox(height: 12),
                      _buildCreatorLatestRequest(status.latestRequest!),
                    ],
                    const SizedBox(height: 12),
                    Text(
                      lc.t('settings.creator.requestNote'),
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
                      style: TextStyle(color: _textPrimary),
                      decoration: _emailInputDecoration(
                        lc.t('settings.creator.requestNotePlaceholder'),
                      ),
                    ),
                    if (_creatorError != null) ...[
                      const SizedBox(height: 10),
                      Text(
                        _creatorError!,
                        style: TextStyle(color: _danger, fontSize: 12),
                      ),
                    ],
                    if (_creatorSuccess != null) ...[
                      const SizedBox(height: 10),
                      Text(
                        _creatorSuccess!,
                        style: TextStyle(color: _textPrimary, fontSize: 12),
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
                            child: Text(lc.t('settings.refreshStatus')),
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
                                  ? lc.t('settings.creator.submittingDots')
                                  : lc.t('settings.creator.requestCreator'),
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
                      style: TextStyle(color: _danger, fontSize: 12),
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
    final lc = LanguageController.instance;
    if (_passwordStep == _PasswordChangeStep.otp) return lc.t('settings.emailStep.currentOtp');
    if (_passwordStep == _PasswordChangeStep.form) {
      return lc.t('settings.emailStep.updatePassword');
    }
    return lc.t('settings.emailStep.completed');
  }

  String _passkeyStepLabel() {
    final lc = LanguageController.instance;
    if (_passkeyStep == _PasskeyStep.password) {
      return lc.t('settings.emailStep.verifyPassword');
    }
    if (_passkeyStep == _PasskeyStep.otp) return lc.t('settings.emailStep.currentOtp');
    if (_passkeyStep == _PasskeyStep.form) {
      return _hasPasskey ? lc.t('settings.emailStep.changePasskey') : lc.t('settings.emailStep.setPasskey');
    }
    return lc.t('settings.emailStep.completed');
  }

  Widget _buildActionHeader({
    required VoidCallback? onBack,
    required String stepLabel,
  }) {
    final lc = LanguageController.instance;
    return Row(
      children: [
        TextButton.icon(
          onPressed: onBack,
          icon: Icon(Icons.arrow_back_rounded, size: 16),
          label: Text(lc.t('common.back')),
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
            style: TextStyle(
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
    final lc = LanguageController.instance;
    String sixDigits(String value) {
      final digits = value.replaceAll(RegExp(r'\D'), '');
      return digits.length > 6 ? digits.substring(0, 6) : digits;
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          lc.t('settings.passwordSecurity.title'),
          style: TextStyle(
            color: _textPrimary,
            fontSize: 18,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          lc.t('settings.passwordSecurity.description'),
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
                    Text(
                      lc.t('settings.changePassword'),
                      style: TextStyle(
                        color: _textPrimary,
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      _passwordStatusLoading
                          ? lc.t('settings.passwordSecurity.loadingLastChange')
                          : (_passwordChangedAt != null
                                ? lc.t('settings.passwordSecurity.lastChanged', {'time': _formatRelativeTime(_passwordChangedAt)})
                                : lc.t('settings.passwordSecurity.neverChanged')),
                      style: TextStyle(color: _textSecondary, fontSize: 12),
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
                        child: Text(lc.t('settings.changePassword')),
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
                      Text(
                        lc.t('settings.passwordSecurity.otpForPasswordChange'),
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
                        style: TextStyle(color: _textPrimary),
                        decoration: _emailInputDecoration(
                          '------',
                        ).copyWith(counterText: ''),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        _passwordExpiresSec != null
                            ? lc.t('settings.common.otpExpiresInSec', {'sec': _passwordExpiresSec})
                            : lc.t('settings.common.otpExpiresIn5Min'),
                        style: TextStyle(color: _textSecondary, fontSize: 12),
                      ),
                      const SizedBox(height: 12),
                      _buildStepActions(
                        secondaryLabel: _passwordCooldown > 0
                            ? lc.t('settings.common.resendWithCooldown', {'sec': _passwordCooldown})
                            : lc.t('settings.common.resendOtp'),
                        onSecondary: () => _requestPasswordOtp(),
                        secondaryDisabled:
                            _passwordSubmitting || _passwordCooldown > 0,
                        primaryLabel: _passwordSubmitting
                            ? lc.t('settings.common.verifying')
                            : lc.t('settings.common.verify'),
                        onPrimary: _passwordSubmitting
                            ? null
                            : _verifyPasswordOtp,
                      ),
                    ],
                    if (_passwordStep == _PasswordChangeStep.form) ...[
                      Text(
                        lc.t('settings.passwordSecurity.currentPassword'),
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
                        style: TextStyle(color: _textPrimary),
                        decoration: _emailInputDecoration(
                          lc.t('settings.passwordSecurity.enterCurrentPassword'),
                        ),
                      ),
                      const SizedBox(height: 10),
                      Text(
                        lc.t('settings.passwordSecurity.newPassword'),
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
                        style: TextStyle(color: _textPrimary),
                        decoration: _emailInputDecoration(
                          lc.t('settings.passwordSecurity.createNewPassword'),
                        ),
                      ),
                      const SizedBox(height: 10),
                      Text(
                        lc.t('settings.passwordSecurity.confirmNewPassword'),
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
                        style: TextStyle(color: _textPrimary),
                        decoration: _emailInputDecoration(
                          lc.t('settings.passwordSecurity.reEnterNewPassword'),
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        lc.t('settings.passwordSecurity.passwordRequirements'),
                        style: TextStyle(color: _textSecondary, fontSize: 12),
                      ),
                      const SizedBox(height: 12),
                      _buildStepActions(
                        primaryLabel: _passwordSubmitting
                            ? 'Updating...'
                            : lc.t('settings.changePassword'),
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
                          _passwordSuccess ?? lc.t('settings.passwordSecurity.passwordUpdatedSuccess'),
                          style: TextStyle(color: _textPrimary),
                        ),
                      ),
                      if (_passwordLogoutPrompt) ...[
                        const SizedBox(height: 12),
                        Text(
                          lc.t('settings.passwordSecurity.logoutOtherDevices'),
                          style: TextStyle(color: _textSecondary, fontSize: 12),
                        ),
                        if (_passwordLogoutError != null) ...[
                          const SizedBox(height: 8),
                          Text(
                            _passwordLogoutError!,
                            style: TextStyle(color: _danger, fontSize: 12),
                          ),
                        ],
                        const SizedBox(height: 10),
                        _buildStepActions(
                          secondaryLabel: lc.t('settings.passwordSecurity.noKeepSignedIn'),
                          onSecondary: () {
                            setState(() {
                              _passwordLogoutPrompt = false;
                            });
                          },
                          secondaryDisabled: _passwordLogoutSubmitting,
                          primaryLabel: _passwordLogoutSubmitting
                              ? lc.t('settings.passwordSecurity.loggingOutDots')
                              : lc.t('settings.passwordSecurity.yesLogOutOthers'),
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
                        style: TextStyle(color: _danger, fontSize: 12),
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
                    Text(
                      lc.t('settings.passwordSecurity.twoFactor.title'),
                      style: TextStyle(
                        color: _textPrimary,
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      lc.t('settings.passwordSecurity.twoFactor.description'),
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
                              ? lc.t('common.loading')
                              : (_twoFactorEnabled ? lc.t('settings.passwordSecurity.twoFactor.disableLabel') : lc.t('settings.passwordSecurity.twoFactor.enableLabel')),
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
                          ? lc.t('settings.emailStep.currentOtp')
                          : lc.t('settings.emailStep.completed'),
                    ),
                    const SizedBox(height: 8),
                    if (_twoFactorStep == _TwoFactorStep.otp) ...[
                      Text(
                        _twoFactorTarget
                            ? lc.t('settings.passwordSecurity.twoFactor.otpToEnable')
                            : lc.t('settings.passwordSecurity.twoFactor.otpToDisable'),
                        style: TextStyle(
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
                        style: TextStyle(color: _textPrimary),
                        decoration: _emailInputDecoration(
                          '------',
                        ).copyWith(counterText: ''),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        _twoFactorExpiresSec != null
                            ? lc.t('settings.common.otpExpiresInSec', {'sec': _twoFactorExpiresSec})
                            : lc.t('settings.common.otpExpiresIn5Min'),
                        style: TextStyle(color: _textSecondary, fontSize: 12),
                      ),
                      const SizedBox(height: 12),
                      _buildStepActions(
                        secondaryLabel: _twoFactorCooldown > 0
                            ? lc.t('settings.common.resendWithCooldown', {'sec': _twoFactorCooldown})
                            : lc.t('settings.common.resendOtp'),
                        onSecondary: () =>
                            _requestTwoFactorOtp(_twoFactorTarget),
                        secondaryDisabled:
                            _twoFactorSubmitting || _twoFactorCooldown > 0,
                        primaryLabel: _twoFactorSubmitting
                            ? lc.t('settings.common.verifying')
                            : (_twoFactorTarget ? lc.t('settings.passwordSecurity.twoFactor.enableLabel') : lc.t('settings.passwordSecurity.twoFactor.disableLabel')),
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
                          _twoFactorSuccess ?? lc.t('settings.passwordSecurity.twoFactor.updated'),
                          style: TextStyle(color: _textPrimary),
                        ),
                      ),
                    if (_twoFactorError != null) ...[
                      const SizedBox(height: 10),
                      Text(
                        _twoFactorError!,
                        style: TextStyle(color: _danger, fontSize: 12),
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
                  Text(
                    lc.t('settings.passwordSecurity.passkey.title'),
                    style: TextStyle(
                      color: _textPrimary,
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    lc.t('settings.passwordSecurity.passkey.description'),
                    style: TextStyle(color: _textSecondary, fontSize: 12),
                  ),
                  if (_hasPasskey) ...[
                    const SizedBox(height: 6),
                    Text(
                      _passkeyEnabled
                          ? lc.t('settings.passwordSecurity.passkey.statusEnabled')
                          : lc.t('settings.passwordSecurity.passkey.statusDisabled'),
                      style: TextStyle(color: _textSecondary, fontSize: 12),
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
                                ? lc.t('settings.passwordSecurity.passkey.updating')
                                : (_passkeyEnabled
                                    ? lc.t('settings.passwordSecurity.twoFactor.disableLabel')
                                    : lc.t('settings.passwordSecurity.twoFactor.enableLabel')),
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
                              ? lc.t('common.loading')
                              : (_hasPasskey
                                    ? lc.t('settings.passwordSecurity.passkey.changePasskey')
                                    : lc.t('settings.passwordSecurity.passkey.setPasskey')),
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
                  style: TextStyle(color: _danger, fontSize: 12),
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
                      Text(
                        lc.t('settings.passwordSecurity.currentPassword'),
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
                        style: TextStyle(color: _textPrimary),
                        decoration: _emailInputDecoration(
                          lc.t('settings.email.enterPassword'),
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        lc.t('settings.passwordSecurity.passkey.willSendOtpPasskey'),
                        style: TextStyle(color: _textSecondary, fontSize: 12),
                      ),
                      const SizedBox(height: 12),
                      _buildStepActions(
                        primaryLabel: _passkeySubmitting
                            ? lc.t('settings.common.sending')
                            : lc.t('settings.common.sendOtp'),
                        onPrimary: _passkeySubmitting
                            ? null
                            : _requestPasskeyOtp,
                      ),
                    ],
                    if (_passkeyStep == _PasskeyStep.otp) ...[
                      Text(
                        lc.t('settings.passwordSecurity.passkey.otpForPasskey'),
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
                        style: TextStyle(color: _textPrimary),
                        decoration: _emailInputDecoration(
                          '------',
                        ).copyWith(counterText: ''),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        _passkeyExpiresSec != null
                            ? lc.t('settings.common.otpExpiresInSec', {'sec': _passkeyExpiresSec})
                            : lc.t('settings.common.otpExpiresIn5Min'),
                        style: TextStyle(color: _textSecondary, fontSize: 12),
                      ),
                      const SizedBox(height: 12),
                      _buildStepActions(
                        secondaryLabel: _passkeyCooldown > 0
                            ? lc.t('settings.common.resendWithCooldown', {'sec': _passkeyCooldown})
                            : lc.t('settings.common.resendOtp'),
                        onSecondary: _requestPasskeyOtp,
                        secondaryDisabled:
                            _passkeySubmitting || _passkeyCooldown > 0,
                        primaryLabel: _passkeySubmitting
                            ? lc.t('settings.common.verifying')
                            : lc.t('settings.common.verify'),
                        onPrimary: _passkeySubmitting
                            ? null
                            : _verifyPasskeyOtp,
                      ),
                    ],
                    if (_passkeyStep == _PasskeyStep.form) ...[
                      if (_hasPasskey) ...[
                        Text(
                          lc.t('settings.passwordSecurity.passkey.currentPasskey'),
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
                            color: _surface,
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
                                  style: TextStyle(color: _textPrimary),
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
                      Text(
                        lc.t('settings.passwordSecurity.passkey.newPasskey'),
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
                        style: TextStyle(color: _textPrimary),
                        decoration: _emailInputDecoration(
                          lc.t('settings.passwordSecurity.passkey.enter6Digit'),
                        ).copyWith(counterText: ''),
                      ),
                      const SizedBox(height: 10),
                      Text(
                        lc.t('settings.passwordSecurity.passkey.confirmPasskey'),
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
                        style: TextStyle(color: _textPrimary),
                        decoration: _emailInputDecoration(
                          lc.t('settings.passwordSecurity.passkey.reEnterPasskey'),
                        ).copyWith(counterText: ''),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        lc.t('settings.passwordSecurity.passkey.passkeyMust6Digits'),
                        style: TextStyle(color: _textSecondary, fontSize: 12),
                      ),
                      const SizedBox(height: 12),
                      _buildStepActions(
                        primaryLabel: _passkeySubmitting ? lc.t('settings.common.savingDots') : lc.t('common.save'),
                        onPrimary: _passkeySubmitting ? null : _confirmPasskey,
                      ),
                    ],
                    if (_passkeyStep == _PasskeyStep.done)
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: _accent.withValues(alpha: 0.14),
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(
                            color: _accent.withValues(alpha: 0.4),
                          ),
                        ),
                        child: Text(
                          _passkeySuccess ?? lc.t('settings.passwordSecurity.passkey.passkeyUpdatedSuccess'),
                          style: TextStyle(color: _textPrimary),
                        ),
                      ),
                    if (_passkeyError != null) ...[
                      const SizedBox(height: 10),
                      Text(
                        _passkeyError!,
                        style: TextStyle(color: _danger, fontSize: 12),
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
                  Text(
                    lc.t('settings.passwordSecurity.devices.title'),
                    style: TextStyle(
                      color: _textPrimary,
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    lc.t('settings.passwordSecurity.devices.description'),
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
                      child: Text(lc.t('settings.viewDevices')),
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
                      Padding(
                        padding: EdgeInsets.only(bottom: 8),
                        child: Text(
                          lc.t('settings.passwordSecurity.devices.loadingDevices'),
                          style: TextStyle(color: _textSecondary, fontSize: 12),
                        ),
                      ),
                    if (_loginDevicesError != null)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Text(
                          _loginDevicesError!,
                          style: TextStyle(color: _danger, fontSize: 12),
                        ),
                      ),
                    if (!_loginDevicesLoading && _loginDevices.isEmpty)
                      Padding(
                        padding: EdgeInsets.only(bottom: 8),
                        child: Text(
                          lc.t('settings.passwordSecurity.devices.noDevicesFound'),
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
                          color: _surface,
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
                                    style: TextStyle(
                                      color: _textPrimary,
                                      fontSize: 13,
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    _resolveDeviceTime(device),
                                    style: TextStyle(
                                      color: _textSecondary,
                                      fontSize: 12,
                                    ),
                                  ),
                                  if (isCurrent)
                                    Padding(
                                      padding: EdgeInsets.only(top: 4),
                                      child: Text(
                                        lc.t('settings.passwordSecurity.devices.currentDevice'),
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
                                  isSubmitting
                                      ? lc.t('settings.passwordSecurity.devices.loggingOut')
                                      : lc.t('settings.passwordSecurity.devices.logOut'),
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
                            style: TextStyle(color: _danger, fontSize: 12),
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
                                ? lc.t('settings.passwordSecurity.devices.loggingOutAll')
                                : lc.t('settings.passwordSecurity.devices.logOutAllOthers'),
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

  Widget _buildContentTab() {
    final lc = LanguageController.instance;
    final visibleActivityItems = _activityItems
        .take(_activityVisibleCount)
        .toList(growable: false);
    final canSeeMoreActivity =
        _activityVisibleCount < _activityItems.length ||
        (_activityCursor?.isNotEmpty ?? false);

    final visibleHiddenPosts = _hiddenPosts
        .take(_hiddenPostsVisibleCount)
        .toList(growable: false);
    final canSeeMoreHiddenPosts =
        _hiddenPostsVisibleCount < _hiddenPosts.length;

    Widget buildAccordionHeader({
      required String title,
      required String desc,
      required bool isOpen,
      required VoidCallback onTap,
    }) {
      return InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: TextStyle(
                        color: _textPrimary,
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      desc,
                      style: TextStyle(color: _textSecondary, fontSize: 12),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Icon(
                isOpen ? Icons.expand_less_rounded : Icons.expand_more_rounded,
                color: _textSecondary,
              ),
            ],
          ),
        ),
      );
    }

    Widget buildDivider() => Divider(
      color: Colors.white.withValues(alpha: 0.06),
      height: 1,
      thickness: 1,
    );

    IconData activityIcon(String type) {
      switch (type) {
        case 'post_like':
        case 'comment_like':
          return Icons.thumb_up_alt_rounded;
        case 'comment':
          return Icons.mode_comment_outlined;
        case 'repost':
          return Icons.repeat_rounded;
        case 'save':
          return Icons.bookmark_rounded;
        case 'follow':
          return Icons.person_add_alt_1_rounded;
        case 'report_post':
        case 'report_user':
          return Icons.flag_rounded;
        default:
          return Icons.bolt_rounded;
      }
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          lc.t('settings.content.title'),
          style: TextStyle(
            color: _textPrimary,
            fontSize: 18,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          lc.t('settings.content.description'),
          style: TextStyle(color: _textSecondary, fontSize: 13),
        ),
        const SizedBox(height: 14),

        _buildCard(
          children: [
            buildAccordionHeader(
              title: lc.t('settings.activity.activityLog'),
              desc: lc.t('settings.content.activityLogDesc'),
              isOpen: _contentActivityOpen,
              onTap: () => _toggleContentSection('activity'),
            ),
            if (_contentActivityOpen) ...[
              buildDivider(),
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
                child: Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: _activityFilterOptions
                      .map((option) {
                        final key = option['key']!;
                        final active = _activityFilter == key;
                        return ChoiceChip(
                          label: Text(lc.t(option['labelKey']!)),
                          selected: active,
                          showCheckmark: false,
                          onSelected: (_) {
                            if (_activityFilter == key) return;
                            setState(() {
                              _activityFilter = key;
                              _activityVisibleCount = _contentPageSize;
                            });
                            _loadActivityLog(reset: true);
                          },
                          selectedColor: _filterActiveBg,
                          labelStyle: TextStyle(
                            color: active ? _filterActiveText : _textSecondary,
                            fontWeight: active
                                ? FontWeight.w700
                                : FontWeight.w500,
                            fontSize: 12,
                          ),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(18),
                            side: BorderSide(
                              color: active ? _filterActiveBg : _border,
                            ),
                          ),
                          backgroundColor: _surface,
                        );
                      })
                      .toList(growable: false),
                ),
              ),
              if (_activityLoading)
                Padding(
                  padding: EdgeInsets.fromLTRB(14, 0, 14, 12),
                  child: Text(
                    'Loading activity...',
                    style: TextStyle(color: _textSecondary, fontSize: 12),
                  ),
                ),
              if (_activityError != null)
                Padding(
                  padding: const EdgeInsets.fromLTRB(14, 0, 14, 12),
                  child: Text(
                    _activityError!,
                    style: TextStyle(color: _danger, fontSize: 12),
                  ),
                ),
              if (!_activityLoading && visibleActivityItems.isEmpty)
                Padding(
                  padding: EdgeInsets.fromLTRB(14, 0, 14, 14),
                  child: Text(
                    'No activity yet.',
                    style: TextStyle(color: _textSecondary, fontSize: 12),
                  ),
                ),
              if (visibleActivityItems.isNotEmpty)
                ...visibleActivityItems.map((item) {
                  final thumbUrl = _activityThumbUrl(item);
                  final clickable = _isActivityClickable(item);
                  return InkWell(
                    onTap: clickable ? () => _openActivityTarget(item) : null,
                    child: Container(
                      padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
                      decoration: BoxDecoration(
                        border: Border(
                          top: BorderSide(
                            color: Colors.white.withValues(alpha: 0.04),
                          ),
                        ),
                      ),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Container(
                            width: 28,
                            height: 28,
                            decoration: BoxDecoration(
                              color: _accent.withValues(alpha: 0.14),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Icon(
                              activityIcon(item.type),
                              color: _accent,
                              size: 16,
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  _activityTitle(item),
                                  style: TextStyle(
                                    color: _textPrimary,
                                    fontSize: 13,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  _activitySubtitle(item),
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                    color: _textSecondary,
                                    fontSize: 12,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  _formatRelativeTime(item.createdAt),
                                  style: TextStyle(
                                    color: _textSecondary,
                                    fontSize: 11,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 8),
                          if (thumbUrl != null && thumbUrl.isNotEmpty)
                            ClipRRect(
                              borderRadius: BorderRadius.circular(8),
                              child: Image.network(
                                thumbUrl,
                                width: 36,
                                height: 36,
                                fit: BoxFit.cover,
                                errorBuilder: (_, __, ___) => Container(
                                  width: 36,
                                  height: 36,
                                  decoration: BoxDecoration(
                                    color: _surface,
                                    borderRadius: BorderRadius.circular(8),
                                  ),
                                ),
                              ),
                            )
                          else
                            Container(
                              width: 36,
                              height: 36,
                              decoration: BoxDecoration(
                                color: _surface,
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: const Center(
                                child: Text(
                                  '📝',
                                  style: TextStyle(fontSize: 14),
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                  );
                }),
              if (canSeeMoreActivity)
                Padding(
                  padding: const EdgeInsets.fromLTRB(14, 10, 14, 14),
                  child: OutlinedButton(
                    onPressed: _activityLoadingMore
                        ? null
                        : _handleSeeMoreActivity,
                    child: Text(
                      _activityLoadingMore ? lc.t('common.loading') : lc.t('common.seeMore'),
                    ),
                  ),
                ),
            ],
          ],
        ),

        const SizedBox(height: 12),

        _buildCard(
          children: [
            buildAccordionHeader(
              title: lc.t('settings.activity.hiddenPosts'),
              desc:
                  'Posts you hide are removed from your feed. You can unhide them anytime.',
              isOpen: _contentHiddenOpen,
              onTap: () => _toggleContentSection('hidden'),
            ),
            if (_contentHiddenOpen) ...[
              buildDivider(),
              if (_hiddenPostsLoading)
                Padding(
                  padding: EdgeInsets.fromLTRB(14, 12, 14, 12),
                  child: Text(
                    'Loading hidden posts...',
                    style: TextStyle(color: _textSecondary, fontSize: 12),
                  ),
                ),
              if (_hiddenPostsError != null)
                Padding(
                  padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
                  child: Text(
                    _hiddenPostsError!,
                    style: TextStyle(color: _danger, fontSize: 12),
                  ),
                ),
              if (!_hiddenPostsLoading && visibleHiddenPosts.isEmpty)
                Padding(
                  padding: EdgeInsets.fromLTRB(14, 12, 14, 14),
                  child: Text(
                    'No hidden posts.',
                    style: TextStyle(color: _textSecondary, fontSize: 12),
                  ),
                ),
              ...visibleHiddenPosts.map((post) {
                final authorName =
                    (post.authorDisplayName?.trim().isNotEmpty == true)
                    ? post.authorDisplayName!.trim()
                    : (post.authorUsername?.trim().isNotEmpty == true)
                    ? '@${post.authorUsername!.trim()}'
                    : 'Unknown';
                final caption = _cleanSnippetText(
                  post.content,
                  fallback: 'No caption',
                );
                final thumbUrl = post.media.isNotEmpty
                    ? post.media.first.url
                    : null;
                final isSubmitting = _unhideSubmitting[post.id] == true;

                return InkWell(
                  onTap: () => _openHiddenPost(post),
                  child: Container(
                    padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
                    decoration: BoxDecoration(
                      border: Border(
                        top: BorderSide(
                          color: Colors.white.withValues(alpha: 0.04),
                        ),
                      ),
                    ),
                    child: Row(
                      children: [
                        ClipRRect(
                          borderRadius: BorderRadius.circular(8),
                          child: thumbUrl != null && thumbUrl.isNotEmpty
                              ? Image.network(
                                  thumbUrl,
                                  width: 42,
                                  height: 42,
                                  fit: BoxFit.cover,
                                  errorBuilder: (_, __, ___) => Container(
                                    width: 42,
                                    height: 42,
                                    color: _surface,
                                    alignment: Alignment.center,
                                    child: Text('📝'),
                                  ),
                                )
                              : Container(
                                  width: 42,
                                  height: 42,
                                  color: _surface,
                                  alignment: Alignment.center,
                                  child: Text('📝'),
                                ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                authorName,
                                style: TextStyle(
                                  color: _textPrimary,
                                  fontSize: 13,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                caption,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  color: _textSecondary,
                                  fontSize: 12,
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 8),
                        OutlinedButton(
                          onPressed: isSubmitting
                              ? null
                              : () => _confirmAndUnhide(post),
                          child: Text(isSubmitting ? '${lc.t('settings.unhide')}...' : lc.t('settings.unhide')),
                        ),
                      ],
                    ),
                  ),
                );
              }),
              if (canSeeMoreHiddenPosts)
                Padding(
                  padding: const EdgeInsets.fromLTRB(14, 10, 14, 14),
                  child: OutlinedButton(
                    onPressed: _handleSeeMoreHiddenPosts,
                    child: Text(lc.t('common.seeMore')),
                  ),
                ),
            ],
          ],
        ),

        const SizedBox(height: 12),

        _buildCard(
          children: [
            buildAccordionHeader(
              title: lc.t('settings.activity.blockedUsers'),
              desc: 'People you block cannot view your profile or content.',
              isOpen: _contentBlockedOpen,
              onTap: () => _toggleContentSection('blocked'),
            ),
            if (_contentBlockedOpen) ...[
              buildDivider(),
              if (_blockedUsersLoading)
                Padding(
                  padding: EdgeInsets.fromLTRB(14, 12, 14, 12),
                  child: Text(
                    'Loading blocked users...',
                    style: TextStyle(color: _textSecondary, fontSize: 12),
                  ),
                ),
              if (_blockedUsersError != null)
                Padding(
                  padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
                  child: Text(
                    _blockedUsersError!,
                    style: TextStyle(color: _danger, fontSize: 12),
                  ),
                ),
              if (!_blockedUsersLoading && _blockedUsers.isEmpty)
                Padding(
                  padding: EdgeInsets.fromLTRB(14, 12, 14, 14),
                  child: Text(
                    'No blocked users.',
                    style: TextStyle(color: _textSecondary, fontSize: 12),
                  ),
                ),
              ..._blockedUsers.map((user) {
                final label = (user.displayName?.trim().isNotEmpty == true)
                    ? user.displayName!.trim()
                    : (user.username?.trim().isNotEmpty == true)
                    ? '@${user.username!.trim()}'
                    : 'Unknown';
                final handle = (user.username?.trim().isNotEmpty == true)
                    ? '@${user.username!.trim()}'
                    : 'Unknown';
                final isSubmitting = _unblockSubmitting[user.userId] == true;

                return InkWell(
                  onTap: () => _openBlockedUser(user),
                  child: Container(
                    padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
                    decoration: BoxDecoration(
                      border: Border(
                        top: BorderSide(
                          color: Colors.white.withValues(alpha: 0.04),
                        ),
                      ),
                    ),
                    child: Row(
                      children: [
                        CircleAvatar(
                          radius: 20,
                          backgroundColor: _surface,
                          backgroundImage:
                              (user.avatarUrl != null &&
                                  user.avatarUrl!.isNotEmpty)
                              ? NetworkImage(user.avatarUrl!)
                              : null,
                          child:
                              (user.avatarUrl == null ||
                                  user.avatarUrl!.isEmpty)
                              ? Text(
                                  label.isNotEmpty
                                      ? label[0].toUpperCase()
                                      : '?',
                                  style: TextStyle(color: _textPrimary),
                                )
                              : null,
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                label,
                                style: TextStyle(
                                  color: _textPrimary,
                                  fontSize: 13,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                handle,
                                style: TextStyle(
                                  color: _textSecondary,
                                  fontSize: 12,
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 8),
                        OutlinedButton(
                          onPressed: isSubmitting
                              ? null
                              : () => _confirmAndUnblock(user),
                          child: Text(
                            isSubmitting ? '${lc.t('settings.unblock')}...' : lc.t('settings.unblock'),
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              }),
            ],
          ],
        ),
      ],
    );
  }

  Widget _buildViolationsTab() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Violation Center',
          style: TextStyle(
            color: _textPrimary,
            fontSize: 18,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          'Review moderation actions and your strike history.',
          style: TextStyle(color: _textSecondary, fontSize: 13),
        ),
        const SizedBox(height: 14),

        _buildCard(
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Current strike total',
                          style: TextStyle(color: _textSecondary, fontSize: 12),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          '$_currentStrikeTotal',
                          style: TextStyle(
                            color: _textPrimary,
                            fontSize: 22,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                  ),
                  OutlinedButton(
                    onPressed: _violationLoading ? null : _loadViolationCenter,
                    child: Text(
                      _violationLoading ? 'Refreshing...' : 'Refresh',
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),

        const SizedBox(height: 12),

        _buildCard(
          children: [
            if (_violationLoading)
              Padding(
                padding: EdgeInsets.fromLTRB(14, 12, 14, 12),
                child: Text(
                  'Loading violation history...',
                  style: TextStyle(color: _textSecondary, fontSize: 12),
                ),
              ),
            if (_violationError != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
                child: Text(
                  _violationError!,
                  style: TextStyle(color: _danger, fontSize: 12),
                ),
              ),
            if (!_violationLoading && _violationItems.isEmpty)
              Padding(
                padding: EdgeInsets.fromLTRB(14, 12, 14, 14),
                child: Text(
                  'No violations found.',
                  style: TextStyle(color: _textSecondary, fontSize: 12),
                ),
              ),
            ..._violationItems.map((item) {
              final canOpen = _canOpenViolationDetail(item);
              final timeLabel = _formatRelativeTime(item.createdAt);
              return InkWell(
                onTap: canOpen ? () => _openViolationDetail(item) : null,
                child: Container(
                  padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
                  decoration: BoxDecoration(
                    border: Border(
                      top: BorderSide(
                        color: Colors.white.withValues(alpha: 0.04),
                      ),
                    ),
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        width: 28,
                        height: 28,
                        decoration: BoxDecoration(
                          color: _accent.withValues(alpha: 0.14),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Icon(
                          Icons.flag_rounded,
                          color: _accent,
                          size: 16,
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              '${_formatViolationActionLabel(item.action)} · ${item.targetType.toUpperCase()}',
                              style: TextStyle(
                                color: _textPrimary,
                                fontSize: 13,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              _violationSubtitle(item),
                              style: TextStyle(
                                color: _textSecondary,
                                fontSize: 12,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              'Reason: ${item.reason.isEmpty ? 'No reason provided.' : item.reason}',
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                color: _textSecondary,
                                fontSize: 12,
                              ),
                            ),
                            if (timeLabel.isNotEmpty) ...[
                              const SizedBox(height: 2),
                              Text(
                                timeLabel,
                                style: TextStyle(
                                  color: _textSecondary,
                                  fontSize: 11,
                                ),
                              ),
                            ],
                            if (canOpen) ...[
                              const SizedBox(height: 3),
                              Text(
                                'Tap to view violated content',
                                style: TextStyle(
                                  color: _textSecondary,
                                  fontSize: 11,
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              );
            }),
          ],
        ),
      ],
    );
  }

  Widget _buildNotificationsTab() {
    final lc = LanguageController.instance;
    final settings = _notificationSettings;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    Widget buildRow({
      required String title,
      required String status,
      required String hint,
      required bool enabled,
      required VoidCallback? onMute,
      required VoidCallback? onEnable,
    }) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        decoration: BoxDecoration(
          border: Border(
            bottom: BorderSide(color: Colors.white.withValues(alpha: 0.06)),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              title,
              style: TextStyle(
                color: _textPrimary,
                fontSize: 14,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 4),
            Text(status, style: TextStyle(color: _textSecondary, fontSize: 13)),
            const SizedBox(height: 5),
            Text(hint, style: TextStyle(color: _textSecondary, fontSize: 12)),
            const SizedBox(height: 10),
            Align(
              alignment: Alignment.centerRight,
              child: Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  OutlinedButton(
                    onPressed: (_notificationLoading || _notificationSaving)
                        ? null
                        : onMute,
                    style: OutlinedButton.styleFrom(
                      foregroundColor: _textPrimary,
                      side: BorderSide(
                        color: isDark
                            ? _border
                            : _textSecondary.withValues(alpha: 0.45),
                      ),
                    ),
                    child: Text(enabled ? 'Mute' : 'Edit'),
                  ),
                  if (!enabled)
                    ElevatedButton(
                      onPressed: (_notificationLoading || _notificationSaving)
                          ? null
                          : onEnable,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: _accent,
                        foregroundColor: Colors.white,
                      ),
                      child: Text(lc.t('common.enable')),
                    ),
                ],
              ),
            ),
          ],
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Notifications',
          style: TextStyle(
            color: _textPrimary,
            fontSize: 18,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          'Control when you receive notification alerts.',
          style: TextStyle(color: _textSecondary, fontSize: 13),
        ),
        const SizedBox(height: 14),

        _buildCard(
          children: [
            buildRow(
              title: lc.t('settings.notifications.pushNotifications'),
              status: _notificationLoading
                  ? lc.t('common.loading')
                  : _notificationStatusLabel(
                      enabled: settings?.enabled ?? true,
                      mutedUntil: settings?.mutedUntil,
                      mutedIndefinitely: settings?.mutedIndefinitely ?? false,
                    ),
              hint:
                  'When muted, new notifications are still saved but won\'t alert you in real time.',
              enabled: settings?.enabled ?? true,
              onMute: settings == null
                  ? null
                  : () => _openNotificationMuteOverlay(
                      title: lc.t('settings.notifications.muteNotifications'),
                      subtitle:
                          'Choose how long to pause alerts for your account.',
                      mutedUntil: settings.mutedUntil,
                      mutedIndefinitely: settings.mutedIndefinitely,
                      onSave: (until, indefinitely) async {
                        setState(() {
                          _notificationSaving = true;
                          _notificationError = null;
                        });
                        try {
                          await _updateNotificationSettings(
                            mutedUntil: until,
                            mutedIndefinitely: indefinitely,
                          );
                        } finally {
                          if (mounted) {
                            setState(() {
                              _notificationSaving = false;
                            });
                          }
                        }
                      },
                    ),
              onEnable: settings == null
                  ? null
                  : () async {
                      setState(() {
                        _notificationSaving = true;
                        _notificationError = null;
                      });
                      try {
                        await _updateNotificationSettings(enabled: true);
                      } on ApiException catch (e) {
                        if (!mounted) return;
                        setState(() {
                          _notificationError = e.message;
                        });
                      } catch (_) {
                        if (!mounted) return;
                        setState(() {
                          _notificationError =
                              'Unable to update notifications.';
                        });
                      } finally {
                        if (mounted) {
                          setState(() {
                            _notificationSaving = false;
                          });
                        }
                      }
                    },
            ),
            if (_notificationError != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 10, 14, 14),
                child: Text(
                  _notificationError!,
                  style: TextStyle(color: _danger, fontSize: 12),
                ),
              ),
          ],
        ),

        const SizedBox(height: 12),

        _buildCard(
          children: [
            for (var i = 0; i < _notificationCategories.length; i++)
              Builder(
                builder: (_) {
                  final category = _notificationCategories[i];
                  final key = category['key']!;
                  final label = lc.t(category['labelKey']!);
                  final description = lc.t(category['descKey']!);
                  final categorySettings = settings?.categories[key];
                  final enabled = categorySettings?.enabled ?? true;

                  return buildRow(
                    title: label,
                    status: _notificationLoading
                        ? lc.t('common.loading')
                        : _notificationStatusLabel(
                            enabled: categorySettings?.enabled ?? true,
                            mutedUntil: categorySettings?.mutedUntil,
                            mutedIndefinitely:
                                categorySettings?.mutedIndefinitely ?? false,
                          ),
                    hint: description,
                    enabled: enabled,
                    onMute: categorySettings == null
                        ? null
                        : () => _openNotificationMuteOverlay(
                            title: lc.t('settings.notifications.muteNotifications'),
                            subtitle: lc.t('settings.notifications.chooseHowLongCategory', {'label': label}),
                            mutedUntil: categorySettings.mutedUntil,
                            mutedIndefinitely:
                                categorySettings.mutedIndefinitely,
                            onSave: (until, indefinitely) async {
                              setState(() {
                                _notificationSaving = true;
                                _notificationError = null;
                              });
                              try {
                                await _updateNotificationSettings(
                                  category: key,
                                  mutedUntil: until,
                                  mutedIndefinitely: indefinitely,
                                );
                              } finally {
                                if (mounted) {
                                  setState(() {
                                    _notificationSaving = false;
                                  });
                                }
                              }
                            },
                          ),
                    onEnable: categorySettings == null
                        ? null
                        : () async {
                            setState(() {
                              _notificationSaving = true;
                              _notificationError = null;
                            });
                            try {
                              await _updateNotificationSettings(
                                category: key,
                                enabled: true,
                              );
                            } on ApiException catch (e) {
                              if (!mounted) return;
                              setState(() {
                                _notificationError = e.message;
                              });
                            } catch (_) {
                              if (!mounted) return;
                              setState(() {
                                _notificationError =
                                    'Unable to update notifications.';
                              });
                            } finally {
                              if (mounted) {
                                setState(() {
                                  _notificationSaving = false;
                                });
                              }
                            }
                          },
                  );
                },
              ),
          ],
        ),
      ],
    );
  }

  Widget _buildContent() {
    final lc = LanguageController.instance;
    if (_loading) {
      return Center(child: CircularProgressIndicator(color: _accent));
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
                style: TextStyle(color: _danger, fontSize: 14),
              ),
              const SizedBox(height: 12),
              ElevatedButton(onPressed: _loadProfile, child: Text(lc.t('common.retry'))),
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
        if (_selectedTab == SettingsTab.notifications) {
          await _loadNotificationSettings();
          return;
        }
        if (_selectedTab == SettingsTab.violations) {
          await _loadViolationCenter();
          return;
        }
        if (_selectedTab == SettingsTab.content) {
          await _loadContentSettings();
          await _loadActivityLog(reset: true);
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
            if (_selectedTab == SettingsTab.content) {
              _resetContentViewState(clearData: true);
            }
            if (_selectedTab == SettingsTab.violations) {
              _resetViolationsViewState(clearData: true);
            }
            _selectedTab = null;
          });
          return false;
        }
        _resetContentViewState(clearData: true);
        _resetViolationsViewState(clearData: true);
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
            style: TextStyle(color: _textPrimary, fontWeight: FontWeight.w700),
          ),
          iconTheme: IconThemeData(color: _textPrimary),
          leading: _selectedTab == null
              ? null
              : IconButton(
                  icon: Icon(Icons.arrow_back_rounded),
                  onPressed: () {
                    setState(() {
                      if (_selectedTab == SettingsTab.passwordSecurity) {
                        _resetPasswordSecurityViewState();
                      }
                      if (_selectedTab == SettingsTab.content) {
                        _resetContentViewState(clearData: true);
                      }
                      if (_selectedTab == SettingsTab.violations) {
                        _resetViolationsViewState(clearData: true);
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

class _ViolationDetailScreen extends StatelessWidget {
  const _ViolationDetailScreen({required this.item});

  final _ViolationHistoryItem item;

  AppSemanticColors _tokens(BuildContext context) {
    return Theme.of(context).extension<AppSemanticColors>() ??
        (Theme.of(context).brightness == Brightness.dark
            ? AppSemanticColors.dark
            : AppSemanticColors.light);
  }

  String _cleanSnippetText(String? raw, {required String fallback}) {
    if (raw == null || raw.trim().isEmpty) return fallback;
    final cleaned = raw
        .replaceAll(RegExp(r'\[\[[A-Z0-9_]+\]\]'), ' ')
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim();
    if (cleaned.isEmpty) return fallback;
    return cleaned;
  }

  String _formatActionLabel(String action) {
    switch (action) {
      case 'remove_post':
        return 'Removed post';
      case 'restrict_post':
        return 'Restricted post';
      case 'delete_comment':
        return 'Deleted comment';
      case 'warn':
      case 'warn_user':
        return 'Warning issued';
      case 'mute_interaction':
        return 'Interaction muted';
      case 'suspend_user':
        return 'Account suspended';
      case 'limit_account':
        return 'Account limited';
      default:
        return 'Policy action';
    }
  }

  String _formatSeverityLabel(String? value) {
    if (value == null || value.isEmpty) return 'N/A';
    if (value == 'high') return 'High';
    if (value == 'medium') return 'Medium';
    return 'Low';
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

  Widget _buildCard(BuildContext context, {required List<Widget> children}) {
    final tokens = _tokens(context);
    return Container(
      decoration: BoxDecoration(
        color: tokens.panelMuted,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: tokens.panelBorder),
      ),
      child: Column(children: children),
    );
  }

  Widget _buildMediaPreview(
    BuildContext context,
    _ViolationMediaPreview media,
  ) {
    final tokens = _tokens(context);
    final isVideo = media.type == 'video';
    if (!isVideo) {
      return Container(
        width: double.infinity,
        constraints: const BoxConstraints(maxHeight: 320),
        decoration: BoxDecoration(
          color: tokens.panel,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: tokens.panelBorder),
        ),
        clipBehavior: Clip.antiAlias,
        child: Image.network(
          media.url,
          fit: BoxFit.contain,
          width: double.infinity,
          errorBuilder: (_, __, ___) => Container(
            width: double.infinity,
            height: 140,
            color: tokens.panel,
            alignment: Alignment.center,
            child: Text(
              'Unable to load preview image',
              style: TextStyle(color: tokens.textMuted, fontSize: 12),
            ),
          ),
        ),
      );
    }

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 18),
      decoration: BoxDecoration(
        color: tokens.panel,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: tokens.panelBorder),
      ),
      child: Text(
        'Video preview is available for this violation.',
        style: TextStyle(color: tokens.textMuted, fontSize: 12),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final lc = LanguageController.instance;
    final tokens = _tokens(context);
    final recordedAt = _formatRelativeTime(item.createdAt);
    final severityText = _formatSeverityLabel(item.severity);
    final reasonText = item.reason.trim().isEmpty
        ? 'No reason provided.'
        : item.reason.trim();
    final contentText = _cleanSnippetText(
      item.previewText,
      fallback: 'No text content captured.',
    );
    final parentText = _cleanSnippetText(
      item.relatedPostPreview?.text,
      fallback: 'No captured.',
    );

    return Scaffold(
      backgroundColor: tokens.panel,
      appBar: AppBar(
        backgroundColor: tokens.panel,
        elevation: 0,
        iconTheme: IconThemeData(color: tokens.text),
        title: Text(
          'Violated content',
          style: TextStyle(color: tokens.text, fontWeight: FontWeight.w700),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
        children: [
          _buildCard(
            context,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 14, 14, 14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${_formatActionLabel(item.action)} · ${item.targetType.toUpperCase()}',
                      style: TextStyle(
                        color: tokens.text,
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Severity $severityText · Strike +${item.strikeDelta} (Total ${item.strikeTotalAfter})',
                      style: TextStyle(color: tokens.textMuted, fontSize: 12),
                    ),
                    if (recordedAt.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        'Recorded $recordedAt',
                        style: TextStyle(color: tokens.textMuted, fontSize: 12),
                      ),
                    ],
                    const SizedBox(height: 8),
                    Text(
                      'Reason: $reasonText',
                      style: TextStyle(color: tokens.textMuted, fontSize: 12),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          _buildCard(
            context,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (item.targetType == 'comment')
                      Text(
                        'Your violated comment',
                        style: TextStyle(color: tokens.textMuted, fontSize: 11),
                      ),
                    if (item.targetType == 'comment') const SizedBox(height: 4),
                    Text(
                      contentText,
                      style: TextStyle(color: tokens.text, fontSize: 13),
                    ),
                    if (item.previewMedia != null) ...[
                      const SizedBox(height: 12),
                      _buildMediaPreview(context, item.previewMedia!),
                    ],
                  ],
                ),
              ),
            ],
          ),
          if (item.targetType == 'comment' &&
              item.relatedPostPreview != null) ...[
            const SizedBox(height: 12),
            _buildCard(
              context,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Parent post context',
                        style: TextStyle(color: tokens.textMuted, fontSize: 11),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        parentText,
                        style: TextStyle(color: tokens.text, fontSize: 13),
                      ),
                      if (item.relatedPostPreview?.media != null) ...[
                        const SizedBox(height: 12),
                        _buildMediaPreview(
                          context,
                          item.relatedPostPreview!.media!,
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ),
          ],
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: () => Navigator.of(context).pop(),
              icon: Icon(Icons.close_rounded),
              label: Text(lc.t('common.close')),
            ),
          ),
        ],
      ),
    );
  }
}
