import 'dart:math' as math;
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_web_auth_2/flutter_web_auth_2.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/config/app_theme.dart';
import '../../core/services/api_service.dart';
import '../../core/services/language_controller.dart';
import 'ads_payment_status_screen.dart';
import 'ads_service.dart';

const int _mediaEditLockUniqueViews = 100;
const int _dayMs = 24 * 60 * 60 * 1000;

AppSemanticColors _appTokens(BuildContext context) {
  final theme = Theme.of(context);
  return theme.extension<AppSemanticColors>() ??
      (theme.brightness == Brightness.dark
          ? AppSemanticColors.dark
          : AppSemanticColors.light);
}

class AdsCampaignDetailScreen extends StatefulWidget {
  const AdsCampaignDetailScreen({super.key, required this.campaignId});

  final String campaignId;

  @override
  State<AdsCampaignDetailScreen> createState() =>
      _AdsCampaignDetailScreenState();
}

class _EditDraft {
  const _EditDraft({
    required this.campaignName,
    required this.objective,
    required this.adFormat,
    required this.primaryText,
    required this.headline,
    required this.adDescription,
    required this.destinationUrl,
    required this.cta,
    required this.locationText,
    required this.ageMin,
    required this.ageMax,
    required this.interests,
    required this.mediaUrls,
  });

  final String campaignName;
  final String objective;
  final String adFormat;
  final String primaryText;
  final String headline;
  final String adDescription;
  final String destinationUrl;
  final String cta;
  final String locationText;
  final String ageMin;
  final String ageMax;
  final List<String> interests;
  final List<String> mediaUrls;

  _EditDraft copyWith({
    String? campaignName,
    String? objective,
    String? adFormat,
    String? primaryText,
    String? headline,
    String? adDescription,
    String? destinationUrl,
    String? cta,
    String? locationText,
    String? ageMin,
    String? ageMax,
    List<String>? interests,
    List<String>? mediaUrls,
  }) {
    return _EditDraft(
      campaignName: campaignName ?? this.campaignName,
      objective: objective ?? this.objective,
      adFormat: adFormat ?? this.adFormat,
      primaryText: primaryText ?? this.primaryText,
      headline: headline ?? this.headline,
      adDescription: adDescription ?? this.adDescription,
      destinationUrl: destinationUrl ?? this.destinationUrl,
      cta: cta ?? this.cta,
      locationText: locationText ?? this.locationText,
      ageMin: ageMin ?? this.ageMin,
      ageMax: ageMax ?? this.ageMax,
      interests: interests ?? this.interests,
      mediaUrls: mediaUrls ?? this.mediaUrls,
    );
  }
}

class _BoostPackage {
  const _BoostPackage({
    required this.id,
    required this.title,
    required this.level,
    required this.price,
    this.highlight,
  });

  final String id;
  final String title;
  final String level;
  final int price;
  final String? highlight;
}

class _DurationPackage {
  const _DurationPackage({
    required this.id,
    required this.days,
    required this.price,
    required this.note,
  });

  final String id;
  final int days;
  final int price;
  final String note;
}

class _AdsCampaignDetailScreenState extends State<AdsCampaignDetailScreen> {
  static const List<_BoostPackage> _boostPackages = [
    _BoostPackage(
      id: 'light',
      title: 'Light Boost',
      level: 'Low competition',
      price: 79000,
      highlight: 'Best for first ad',
    ),
    _BoostPackage(
      id: 'standard',
      title: 'Standard Boost',
      level: 'Medium competition',
      price: 149000,
      highlight: 'Most chosen',
    ),
    _BoostPackage(
      id: 'strong',
      title: 'Strong Boost',
      level: 'High competition',
      price: 299000,
      highlight: 'High visibility',
    ),
  ];

  static const List<_DurationPackage> _durationPackages = [
    _DurationPackage(id: 'none', days: 0, price: 0, note: 'No extension'),
    _DurationPackage(id: 'd3', days: 3, price: 29000, note: 'Short burst'),
    _DurationPackage(id: 'd7', days: 7, price: 59000, note: 'One week run'),
    _DurationPackage(
      id: 'd14',
      days: 14,
      price: 99000,
      note: 'Sustained delivery',
    ),
    _DurationPackage(
      id: 'd30',
      days: 30,
      price: 179000,
      note: 'Full month coverage',
    ),
  ];

  final TextEditingController _interestCtrl = TextEditingController();
  final ImagePicker _picker = ImagePicker();

  bool _loading = true;
  bool _saving = false;
  bool _editSaving = false;
  String? _error;
  String? _success;
  String? _editError;
  AdsCampaignDetail? _detail;
  _EditDraft? _editDraft;
  bool _editOpen = false;
  bool _uploadingMedia = false;
  bool _creatingUpgradeCheckout = false;
  String _selectedBoostUpgradeId = 'standard';
  String _selectedDurationUpgradeId = 'none';
  String? _upgradeError;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _interestCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final detail = await AdsService.getAdsCampaignDetail(widget.campaignId);
      if (!mounted) return;
      setState(() {
        _detail = detail;
        _selectedBoostUpgradeId =
            _boostPackages.any((item) => item.id == detail.boostPackageId)
            ? detail.boostPackageId
            : _boostPackages[1].id;
        _selectedDurationUpgradeId = 'none';
        _upgradeError = null;
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
        _error = LanguageController.instance.t('ads.detail.errorLoad');
        _loading = false;
      });
    }
  }

  String _intFmt(int value) {
    final s = value.toString();
    final chars = s.split('').reversed.toList();
    final chunks = <String>[];
    for (int i = 0; i < chars.length; i += 3) {
      chunks.add(chars.skip(i).take(3).toList().reversed.join());
    }
    return chunks.reversed.join(',');
  }

  String _money(int value) => '${_intFmt(value)} VND';

  String _pct(double value) => '${value.toStringAsFixed(2)}%';

  String _statusLabel(String status) {
    final lc = LanguageController.instance;
    switch (status) {
      case 'active':
        return lc.t('ads.status.active');
      case 'hidden':
        return lc.t('ads.status.hidden');
      case 'paused':
        return lc.t('ads.status.paused');
      case 'canceled':
        return lc.t('ads.status.canceled');
      default:
        return lc.t('ads.status.completed');
    }
  }

  String _hiddenReasonLabel(String? reason) {
    final lc = LanguageController.instance;
    if (reason == null || reason.isEmpty) return lc.t('ads.detail.hiddenReasonVisible');
    if (reason == 'paused') return lc.t('ads.detail.hiddenReasonHidden');
    if (reason == 'canceled') return lc.t('ads.detail.hiddenReasonCanceled');
    if (reason == 'expired') return lc.t('ads.detail.hiddenReasonExpired');
    return reason;
  }

  bool _isVideoUrl(String url) {
    final lower = url.toLowerCase();
    return lower.endsWith('.mp4') ||
        lower.endsWith('.mov') ||
        lower.endsWith('.webm') ||
        lower.endsWith('.mkv') ||
        lower.contains('.mp4?') ||
        lower.contains('.mov?') ||
        lower.contains('.webm?') ||
        lower.contains('.mkv?');
  }

  int _uniqueViews(AdsCampaignDetail detail) {
    if (detail.reach > 0) return detail.reach;
    return detail.views;
  }

  Color _statusBg(String status) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    switch (status) {
      case 'active':
        return isDark ? const Color(0x1F10B981) : const Color(0xFFE9F8F0);
      case 'hidden':
        return isDark ? const Color(0x3364758B) : const Color(0xFFF1F4F8);
      case 'paused':
        return isDark ? const Color(0x3394A3B8) : const Color(0xFFF1F4F8);
      case 'canceled':
        return isDark ? const Color(0x33DC2626) : const Color(0xFFFDECED);
      default:
        return isDark ? const Color(0x3338BDF8) : const Color(0xFFEAF1FB);
    }
  }

  Color _statusFg(String status) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    switch (status) {
      case 'active':
        return isDark ? const Color(0xFF63E6B2) : const Color(0xFF1E7A4D);
      case 'hidden':
      case 'paused':
        return isDark ? const Color(0xFFCBD5E1) : const Color(0xFF5F6B7A);
      case 'canceled':
        return isDark ? const Color(0xFFFCA5A5) : const Color(0xFFB4232D);
      default:
        return isDark ? const Color(0xFFBAE6FD) : const Color(0xFF245A95);
    }
  }

  ({int elapsed, int remaining, int total}) _timeline(AdsCampaignDetail d) {
    final startMs =
        d.startsAt?.millisecondsSinceEpoch ??
        DateTime.now().millisecondsSinceEpoch;
    final endMs = d.expiresAt?.millisecondsSinceEpoch ?? startMs;
    final nowMs = DateTime.now().millisecondsSinceEpoch;
    final total = math.max(1, ((endMs - startMs) / _dayMs).ceil());

    int elapsed = 0;
    if (nowMs > startMs) {
      final clamped = math.min(nowMs, endMs);
      elapsed = math.max(0, ((clamped - startMs) / _dayMs).ceil());
    }

    final remaining = nowMs >= endMs
        ? 0
        : math.max(0, ((endMs - nowMs) / _dayMs).ceil());
    return (elapsed: elapsed, remaining: remaining, total: total);
  }

  _EditDraft _draftFromDetail(AdsCampaignDetail d) {
    return _EditDraft(
      campaignName: d.campaignName,
      objective: d.objective,
      adFormat: d.adFormat.isEmpty ? 'single' : d.adFormat,
      primaryText: d.primaryText,
      headline: d.headline,
      adDescription: d.adDescription,
      destinationUrl: d.destinationUrl,
      cta: d.cta,
      locationText: d.locationText,
      ageMin: d.ageMin?.toString() ?? '',
      ageMax: d.ageMax?.toString() ?? '',
      interests: List<String>.from(d.interests),
      mediaUrls: List<String>.from(d.mediaUrls),
    );
  }

  Map<String, dynamic> _normalizedDraft(_EditDraft d) {
    return {
      'campaignName': d.campaignName.trim(),
      'objective': d.objective.trim(),
      'adFormat': d.adFormat.trim(),
      'primaryText': d.primaryText.trim(),
      'headline': d.headline.trim(),
      'adDescription': d.adDescription.trim(),
      'destinationUrl': d.destinationUrl.trim(),
      'cta': d.cta.trim(),
      'locationText': d.locationText.trim(),
      'ageMin': d.ageMin.trim(),
      'ageMax': d.ageMax.trim(),
      'interests': d.interests
          .map((e) => e.trim())
          .where((e) => e.isNotEmpty)
          .toList(),
      'mediaUrls': d.mediaUrls
          .map((e) => e.trim())
          .where((e) => e.isNotEmpty)
          .toList(),
    };
  }

  bool _hasEditChanges() {
    final d = _detail;
    final draft = _editDraft;
    if (d == null || draft == null) return false;
    final before = _normalizedDraft(_draftFromDetail(d));
    final after = _normalizedDraft(draft);
    return before.toString() != after.toString();
  }

  void _openEdit() {
    final detail = _detail;
    if (detail == null) return;
    setState(() {
      _editDraft = _draftFromDetail(detail);
      _editError = null;
      _interestCtrl.clear();
      _editOpen = true;
    });
  }

  void _closeEdit() {
    if (_editSaving) return;
    setState(() {
      _editOpen = false;
      _editError = null;
      _interestCtrl.clear();
      _uploadingMedia = false;
    });
  }

  Future<void> _uploadEditMedia() async {
    final draft = _editDraft;
    final detail = _detail;
    if (draft == null || detail == null) return;

    final uniqueViews = _uniqueViews(detail);
    if (uniqueViews > _mediaEditLockUniqueViews) {
      setState(() {
        _editError =
            LanguageController.instance.t('ads.detail.errorMediaLocked', {'n': _mediaEditLockUniqueViews});
      });
      return;
    }

    setState(() {
      _editError = null;
    });

    try {
      List<XFile> picked = const [];
      if (draft.adFormat == 'video') {
        final file = await _picker.pickVideo(source: ImageSource.gallery);
        if (file == null) return;
        picked = [file];
      } else if (draft.adFormat == 'single') {
        final file = await _picker.pickImage(
          source: ImageSource.gallery,
          imageQuality: 85,
        );
        if (file == null) return;
        picked = [file];
      } else {
        picked = await _picker.pickMultiImage(limit: 5, imageQuality: 85);
        if (picked.isEmpty) return;
      }

      final maxMedia = draft.adFormat == 'carousel' ? 5 : 1;
      final remaining = math.max(maxMedia - draft.mediaUrls.length, 0);
      if (remaining <= 0) {
        setState(() {
          _editError = LanguageController.instance.t('ads.detail.errorMediaLimit');
        });
        return;
      }

      final files = picked.take(remaining).map((x) => File(x.path)).toList();
      setState(() {
        _uploadingMedia = true;
      });

      final uploaded = <String>[];
      for (final file in files) {
        final up = await AdsService.uploadMedia(file);
        final url = up.secureUrl.isNotEmpty ? up.secureUrl : up.url;
        if (url.isNotEmpty) uploaded.add(url);
      }

      setState(() {
        final current = List<String>.from(_editDraft!.mediaUrls);
        current.addAll(uploaded);
        _editDraft = _editDraft!.copyWith(
          mediaUrls: draft.adFormat == 'carousel'
              ? current.take(5).toList()
              : current.take(1).toList(),
        );
      });
    } on ApiException catch (e) {
      setState(() {
        _editError = e.message;
      });
    } catch (_) {
      setState(() {
        _editError = LanguageController.instance.t('ads.detail.errorUploadMedia');
      });
    } finally {
      if (mounted) {
        setState(() {
          _uploadingMedia = false;
        });
      }
    }
  }

  void _removeMediaUrl(String url) {
    final draft = _editDraft;
    final detail = _detail;
    if (draft == null || detail == null) return;

    final uniqueViews = _uniqueViews(detail);
    if (uniqueViews > _mediaEditLockUniqueViews) {
      setState(() {
        _editError =
            LanguageController.instance.t('ads.detail.errorMediaLocked', {'n': _mediaEditLockUniqueViews});
      });
      return;
    }

    setState(() {
      _editDraft = draft.copyWith(
        mediaUrls: draft.mediaUrls.where((item) => item != url).toList(),
      );
    });
  }

  Future<void> _saveEdit() async {
    final draft = _editDraft;
    final detail = _detail;
    if (draft == null || detail == null || !_hasEditChanges()) return;

    setState(() {
      _editSaving = true;
      _editError = null;
      _success = null;
    });

    final normalized = _normalizedDraft(draft);
    final original = _normalizedDraft(_draftFromDetail(detail));
    final uniqueViews = _uniqueViews(detail);
    final isMediaEditLocked = uniqueViews > _mediaEditLockUniqueViews;
    final effectiveMediaUrls = isMediaEditLocked
        ? (original['mediaUrls'] as List<String>)
        : (normalized['mediaUrls'] as List<String>);

    try {
      final updated = await AdsService.performAdsCampaignAction(
        campaignId: widget.campaignId,
        payload: AdsCampaignActionPayload(
          action: 'update_details',
          campaignName: normalized['campaignName'] as String,
          objective: normalized['objective'] as String,
          adFormat: normalized['adFormat'] as String,
          primaryText: normalized['primaryText'] as String,
          headline: normalized['headline'] as String,
          adDescription: normalized['adDescription'] as String,
          destinationUrl: normalized['destinationUrl'] as String,
          cta: normalized['cta'] as String,
          interests: normalized['interests'] as List<String>,
          placement: 'home_feed',
          mediaUrls: effectiveMediaUrls,
        ),
      );

      if (!mounted) return;
      setState(() {
        _detail = updated;
        _editOpen = false;
        _success = LanguageController.instance.t('ads.detail.successUpdate');
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _editError = e.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _editError = LanguageController.instance.t('ads.detail.errorSaveDetails');
      });
    } finally {
      if (mounted) {
        setState(() {
          _editSaving = false;
        });
      }
    }
  }

  _BoostPackage _currentBoostPackage(AdsCampaignDetail detail) {
    for (final pkg in _boostPackages) {
      if (pkg.id == detail.boostPackageId) return pkg;
    }
    return _boostPackages[1];
  }

  _BoostPackage _selectedBoostPackage(_BoostPackage currentBoost) {
    for (final pkg in _boostPackages) {
      if (pkg.id == _selectedBoostUpgradeId) return pkg;
    }
    return currentBoost;
  }

  _DurationPackage _selectedDurationPackage() {
    for (final pkg in _durationPackages) {
      if (pkg.id == _selectedDurationUpgradeId) return pkg;
    }
    return _durationPackages.first;
  }

  Future<void> _startUpgradeCheckout() async {
    final detail = _detail;
    if (detail == null) return;

    final currentBoost = _currentBoostPackage(detail);
    final selectedBoost = _selectedBoostPackage(currentBoost);
    final selectedDuration = _selectedDurationPackage();

    final boostUpgradeDelta = math.max(
      selectedBoost.price - currentBoost.price,
      0,
    );
    final durationUpgradeCost = selectedDuration.price;
    final upgradeTotalCost = boostUpgradeDelta + durationUpgradeCost;
    if (upgradeTotalCost <= 0) {
      setState(() {
        _upgradeError = LanguageController.instance.t('ads.detail.errorUpgradeSelect');
      });
      return;
    }

    setState(() {
      _creatingUpgradeCheckout = true;
      _upgradeError = null;
      _error = null;
      _success = null;
    });

    try {
      final session = await AdsService.createStripeUpgradeCheckoutSession(
        targetCampaignId: widget.campaignId,
        amount: upgradeTotalCost,
        campaignName: '${detail.campaignName} Upgrade',
        description:
            '${currentBoost.title} -> ${selectedBoost.title} + ${selectedDuration.days} day extension',
        boostPackageId: selectedBoost.id,
        durationPackageId: selectedDuration.id,
      );

      final checkoutUrl = (session.url ?? '').trim();
      if (checkoutUrl.isEmpty || session.id.trim().isEmpty) {
        setState(() {
          _upgradeError = LanguageController.instance.t('ads.detail.errorUpgradeCheckout');
        });
        return;
      }

      final startedAt = DateTime.now().millisecondsSinceEpoch;
      await FlutterWebAuth2.authenticate(
        url: checkoutUrl,
        callbackUrlScheme: 'cordigram',
      );
      if (!mounted) return;

      final paid = await Navigator.of(context).push<bool>(
        MaterialPageRoute(
          builder: (_) => AdsPaymentStatusScreen(
            sessionId: session.id,
            checkoutStartedAtMs: startedAt,
          ),
        ),
      );

      if (!mounted) return;
      if (paid == true) {
        setState(() {
          _success = LanguageController.instance.t('ads.detail.successUpgradePayment');
        });
        await _load();
      }
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _upgradeError = e.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _upgradeError = LanguageController.instance.t('ads.detail.errorStartCheckout');
      });
    } finally {
      if (mounted) {
        setState(() {
          _creatingUpgradeCheckout = false;
        });
      }
    }
  }

  Future<void> _runLifecycleAction(String action) async {
    final detail = _detail;
    if (detail == null) return;

    if (action == 'resume_campaign' &&
        detail.actions.requiresExtendBeforeResume) {
      setState(() {
        _error = LanguageController.instance.t('ads.detail.expiredError');
        _upgradeError = LanguageController.instance.t('ads.detail.expiredUpgradeError');
        _success = null;
      });
      return;
    }

    setState(() {
      _saving = true;
      _error = null;
      _success = null;
    });

    try {
      final updated = await AdsService.performAdsCampaignAction(
        campaignId: widget.campaignId,
        payload: AdsCampaignActionPayload(action: action),
      );
      if (!mounted) return;
      setState(() {
        _detail = updated;
        _success = action == 'pause_campaign'
            ? LanguageController.instance.t('ads.detail.successHide')
            : LanguageController.instance.t('ads.detail.successReopen');
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        if (action == 'resume_campaign' &&
            RegExp(
              r'expired|extend',
              caseSensitive: false,
            ).hasMatch(e.message)) {
          _upgradeError = LanguageController.instance.t('ads.detail.resumeUpgradeError');
        }
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = LanguageController.instance.t('ads.detail.errorUpdate');
      });
    } finally {
      if (mounted) {
        setState(() {
          _saving = false;
        });
      }
    }
  }

  String _boostTitle(String id) {
    final lc = LanguageController.instance;
    switch (id) {
      case 'light': return lc.t('ads.detail.boostLightTitle');
      case 'strong': return lc.t('ads.detail.boostStrongTitle');
      default: return lc.t('ads.detail.boostStandardTitle');
    }
  }

  String _boostLevel(String id) {
    final lc = LanguageController.instance;
    switch (id) {
      case 'light': return lc.t('ads.detail.boostLightLevel');
      case 'strong': return lc.t('ads.detail.boostStrongLevel');
      default: return lc.t('ads.detail.boostStandardLevel');
    }
  }

  String _boostHighlight(String id) {
    final lc = LanguageController.instance;
    switch (id) {
      case 'light': return lc.t('ads.detail.boostLightHighlight');
      case 'strong': return lc.t('ads.detail.boostStrongHighlight');
      default: return lc.t('ads.detail.boostStandardHighlight');
    }
  }

  Future<void> _confirmLifecycleAction({
    required String action,
    required String title,
    required String body,
    required String confirmLabel,
  }) async {
    final tokens = _appTokens(context);
    final shouldProceed = await showDialog<bool>(
      context: context,
      barrierDismissible: !_saving,
      builder: (dialogContext) {
        return AlertDialog(
          backgroundColor: tokens.panelMuted,
          title: Text(title, style: TextStyle(color: tokens.text)),
          content: Text(
            body,
            style: TextStyle(color: tokens.textMuted, height: 1.35),
          ),
          actions: [
            TextButton(
              onPressed: _saving
                  ? null
                  : () => Navigator.of(dialogContext).pop(false),
              child: Text(LanguageController.instance.t('ads.detail.cancelBtn')),
            ),
            FilledButton(
              onPressed: _saving
                  ? null
                  : () => Navigator.of(dialogContext).pop(true),
              child: Text(confirmLabel),
            ),
          ],
        );
      },
    );

    if (shouldProceed == true) {
      await _runLifecycleAction(action);
    }
  }

  void _openMediaPreview(String url) {
    final isVideo = _isVideoUrl(url);
    showDialog<void>(
      context: context,
      barrierColor: Colors.black.withOpacity(0.84),
      builder: (context) {
        return GestureDetector(
          onTap: () => Navigator.of(context).pop(),
          child: Dialog(
            backgroundColor: Colors.transparent,
            insetPadding: const EdgeInsets.all(14),
            child: GestureDetector(
              onTap: () {},
              child: ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: Container(
                  color: Colors.black,
                  child: AspectRatio(
                    aspectRatio: 16 / 9,
                    child: isVideo
                        ? Center(
                            child: Text(
                              LanguageController.instance.t('ads.detail.videoPreviewUnavailable'),
                              style: const TextStyle(color: Color(0xFFE8ECF8)),
                            ),
                          )
                        : Image.network(
                            url,
                            fit: BoxFit.contain,
                            errorBuilder: (_, __, ___) => const Center(
                              child: Icon(
                                Icons.broken_image_rounded,
                                color: Color(0xFFE8ECF8),
                              ),
                            ),
                          ),
                  ),
                ),
              ),
            ),
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final tokens =
        theme.extension<AppSemanticColors>() ??
        (theme.brightness == Brightness.dark
            ? AppSemanticColors.dark
            : AppSemanticColors.light);
    final card = tokens.panelMuted;
    final textPrimary = tokens.text;
    final textSecondary = tokens.textMuted;
    final accent = tokens.primary;

    final detail = _detail;
    final currentBoostPackage = detail == null
        ? _boostPackages[1]
        : _currentBoostPackage(detail);
    final selectedBoostPackage = _selectedBoostPackage(currentBoostPackage);
    final selectedDurationPackage = _selectedDurationPackage();
    final boostUpgradeDelta = math.max(
      selectedBoostPackage.price - currentBoostPackage.price,
      0,
    );
    final durationUpgradeCost = selectedDurationPackage.price;
    final upgradeTotalCost = boostUpgradeDelta + durationUpgradeCost;
    final projectedBudget = (detail?.budget ?? 0) + upgradeTotalCost;
    final hasUpgradeSelection = upgradeTotalCost > 0;

    return Scaffold(
      backgroundColor: theme.scaffoldBackgroundColor,
      appBar: AppBar(
        backgroundColor: scheme.surface,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        iconTheme: IconThemeData(color: scheme.onSurface),
        title: Text(LanguageController.instance.t('ads.detail.appBar'), style: TextStyle(color: scheme.onSurface)),
      ),
      body: SafeArea(
        child: _loading
            ? Center(
                child: CircularProgressIndicator(color: accent, strokeWidth: 2),
              )
            : detail == null
            ? Center(
                child: Text(
                  _error ?? LanguageController.instance.t('ads.detail.campaignNotFound'),
                  style: TextStyle(color: scheme.error),
                ),
              )
            : RefreshIndicator(
                color: accent,
                onRefresh: _load,
                child: SingleChildScrollView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: card,
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: tokens.panelBorder),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        detail.campaignName,
                                        style: TextStyle(
                                          color: textPrimary,
                                          fontSize: 22,
                                          fontWeight: FontWeight.w700,
                                        ),
                                      ),
                                      const SizedBox(height: 4),
                                      Text(
                                        '${detail.startsAt?.toLocal().toString().split(' ').first ?? '--'} - ${detail.expiresAt?.toLocal().toString().split(' ').first ?? '--'}',
                                        style: TextStyle(
                                          color: textSecondary,
                                          fontSize: 12.5,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 10,
                                    vertical: 5,
                                  ),
                                  decoration: BoxDecoration(
                                    color: _statusBg(detail.status),
                                    borderRadius: BorderRadius.circular(999),
                                  ),
                                  child: Text(
                                    _statusLabel(detail.status),
                                    style: TextStyle(
                                      color: _statusFg(detail.status),
                                      fontSize: 11,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 12),
                            GridView.count(
                              crossAxisCount: 2,
                              crossAxisSpacing: 8,
                              mainAxisSpacing: 8,
                              childAspectRatio: 1.45,
                              shrinkWrap: true,
                              physics: const NeverScrollableScrollPhysics(),
                              children: [
                                _MetricCard(
                                  label: LanguageController.instance.t('ads.detail.metricSpent'),
                                  value: _money(detail.spent),
                                ),
                                _MetricCard(
                                  label: LanguageController.instance.t('ads.detail.metricImpressions'),
                                  value: _intFmt(detail.impressions),
                                ),
                                _MetricCard(
                                  label: LanguageController.instance.t('ads.detail.metricClicks'),
                                  value: _intFmt(detail.clicks),
                                ),
                                _MetricCard(
                                  label: LanguageController.instance.t('ads.detail.metricCtr'),
                                  value: _pct(detail.ctr),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 12),
                      _SectionCard(
                        title: LanguageController.instance.t('ads.detail.sectionPerformance'),
                        child: GridView.count(
                          crossAxisCount: 2,
                          crossAxisSpacing: 8,
                          mainAxisSpacing: 8,
                          childAspectRatio: 1.7,
                          shrinkWrap: true,
                          physics: const NeverScrollableScrollPhysics(),
                          children: [
                            _BreakdownItem(
                              label: LanguageController.instance.t('ads.detail.metricReach'),
                              value: _intFmt(detail.reach),
                            ),
                            _BreakdownItem(
                              label: LanguageController.instance.t('ads.detail.metricViews'),
                              value: _intFmt(detail.views),
                            ),
                            _BreakdownItem(
                              label: LanguageController.instance.t('ads.detail.metricEngagements'),
                              value: _intFmt(detail.engagements),
                            ),
                            _BreakdownItem(
                              label: LanguageController.instance.t('ads.detail.metricEngagementRate'),
                              value: _pct(detail.engagementRate),
                            ),
                            _BreakdownItem(
                              label: LanguageController.instance.t('ads.detail.metricAvgDwell'),
                              value:
                                  '${_intFmt(detail.averageDwellMs.round())} ms',
                            ),
                            _BreakdownItem(
                              label: LanguageController.instance.t('ads.detail.metricBudgetUsage'),
                              value: detail.budget > 0
                                  ? _pct((detail.spent / detail.budget) * 100)
                                  : LanguageController.instance.t('ads.detail.notAvailable'),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 12),
                      _SectionCard(
                        title: LanguageController.instance.t('ads.detail.sectionConfig'),
                        child: Column(
                          children: [
                            _DetailRow(
                              label: LanguageController.instance.t('ads.detail.configObjective'),
                              value: detail.objective.isEmpty
                                  ? LanguageController.instance.t('ads.detail.notAvailable')
                                  : detail.objective,
                            ),
                            _DetailRow(
                              label: LanguageController.instance.t('ads.detail.configAdFormat'),
                              value: detail.adFormat.isEmpty
                                  ? LanguageController.instance.t('ads.detail.notAvailable')
                                  : detail.adFormat,
                            ),
                            _DetailRow(
                              label: LanguageController.instance.t('ads.detail.configBoostPackage'),
                              value: detail.boostPackageId.isEmpty
                                  ? LanguageController.instance.t('ads.detail.notAvailable')
                                  : _boostTitle(detail.boostPackageId),
                            ),
                            _DetailRow(
                              label: LanguageController.instance.t('ads.detail.configDurationDays'),
                              value: detail.durationDays > 0
                                  ? LanguageController.instance.t('ads.detail.configDurationValue', {'count': detail.durationDays})
                                  : LanguageController.instance.t('ads.detail.notAvailable'),
                            ),
                            _DetailRow(
                              label: LanguageController.instance.t('ads.detail.configDeliveryState'),
                              value: _hiddenReasonLabel(detail.hiddenReason),
                            ),
                            if (detail.status == 'canceled' &&
                                (detail.adminCancelReason ?? '')
                                    .trim()
                                    .isNotEmpty)
                              _DetailRow(
                                label: LanguageController.instance.t('ads.detail.configAdminCancel'),
                                value: detail.adminCancelReason!.trim(),
                              ),
                            Builder(
                              builder: (_) {
                                final t = _timeline(detail);
                                return _DetailRow(
                                  label: LanguageController.instance.t('ads.detail.configElapsed'),
                                  value: LanguageController.instance.t('ads.detail.configElapsedValue', {'elapsed': t.elapsed, 'total': t.total}),
                                );
                              },
                            ),
                            _DetailRow(
                              label: LanguageController.instance.t('ads.detail.configReactions'),
                              value: LanguageController.instance.t('ads.detail.configReactionsValue', {'likes': _intFmt(detail.likes), 'comments': _intFmt(detail.comments), 'reposts': _intFmt(detail.reposts)}),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 12),
                      _SectionCard(
                        title: LanguageController.instance.t('ads.detail.sectionCreative'),
                        action: ElevatedButton.icon(
                          onPressed: _openEdit,
                          icon: const Icon(Icons.edit_rounded, size: 18),
                          label: Text(
                            LanguageController.instance.t('ads.detail.editBtn'),
                            style: const TextStyle(fontWeight: FontWeight.w700),
                          ),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF4AA3E4),
                            foregroundColor: const Color(0xFF041325),
                            padding: const EdgeInsets.symmetric(
                              horizontal: 12,
                              vertical: 9,
                            ),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(10),
                            ),
                          ),
                        ),
                        child: Column(
                          children: [
                            _DetailRow(
                              label: LanguageController.instance.t('ads.detail.creativeText'),
                              value: detail.primaryText.trim().isEmpty
                                  ? LanguageController.instance.t('ads.detail.notAvailable')
                                  : detail.primaryText.trim(),
                            ),
                            _DetailRow(
                              label: LanguageController.instance.t('ads.detail.creativeHeadline'),
                              value: detail.headline.trim().isEmpty
                                  ? LanguageController.instance.t('ads.detail.notAvailable')
                                  : detail.headline.trim(),
                            ),
                            _DetailRow(
                              label: LanguageController.instance.t('ads.detail.creativeDescription'),
                              value: detail.adDescription.trim().isEmpty
                                  ? LanguageController.instance.t('ads.detail.notAvailable')
                                  : detail.adDescription.trim(),
                            ),
                            _DetailRow(
                              label: LanguageController.instance.t('ads.detail.creativeCta'),
                              value: detail.cta.trim().isEmpty
                                  ? LanguageController.instance.t('ads.detail.notAvailable')
                                  : detail.cta.trim(),
                            ),
                            _DetailRow(
                              label: LanguageController.instance.t('ads.detail.creativeUrl'),
                              value: detail.destinationUrl.trim().isEmpty
                                  ? LanguageController.instance.t('ads.detail.notAvailable')
                                  : detail.destinationUrl.trim(),
                            ),
                            _DetailRow(
                              label: LanguageController.instance.t('ads.detail.creativeLocation'),
                              value: detail.locationText.trim().isEmpty
                                  ? LanguageController.instance.t('ads.detail.notAvailable')
                                  : detail.locationText.trim(),
                            ),
                            _DetailRow(
                              label: LanguageController.instance.t('ads.detail.creativeAge'),
                              value:
                                  detail.ageMin != null && detail.ageMax != null
                                  ? '${detail.ageMin} - ${detail.ageMax}'
                                  : LanguageController.instance.t('ads.detail.notAvailable'),
                            ),
                            _DetailRow(
                              label: LanguageController.instance.t('ads.detail.creativeInterests'),
                              value: detail.interests.isEmpty
                                  ? LanguageController.instance.t('ads.detail.notAvailable')
                                  : detail.interests.join(' · '),
                            ),
                            const SizedBox(height: 8),
                            Align(
                              alignment: Alignment.centerLeft,
                              child: Text(
                                LanguageController.instance.t('ads.detail.mediaTitle'),
                                style: TextStyle(
                                  color: textSecondary,
                                  fontSize: 12,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ),
                            const SizedBox(height: 8),
                            if (detail.mediaUrls.isEmpty)
                              Text(
                                LanguageController.instance.t('ads.detail.noMedia'),
                                style: TextStyle(color: textSecondary),
                              )
                            else
                              GridView.builder(
                                itemCount: detail.mediaUrls.length,
                                shrinkWrap: true,
                                physics: const NeverScrollableScrollPhysics(),
                                gridDelegate:
                                    const SliverGridDelegateWithFixedCrossAxisCount(
                                      crossAxisCount: 2,
                                      mainAxisSpacing: 8,
                                      crossAxisSpacing: 8,
                                      childAspectRatio: 1.5,
                                    ),
                                itemBuilder: (_, index) {
                                  final url = detail.mediaUrls[index];
                                  final isVideo = _isVideoUrl(url);
                                  return InkWell(
                                    onTap: () => _openMediaPreview(url),
                                    borderRadius: BorderRadius.circular(10),
                                    child: Ink(
                                      decoration: BoxDecoration(
                                        borderRadius: BorderRadius.circular(10),
                                        border: Border.all(
                                          color: tokens.panelBorder,
                                        ),
                                        color: tokens.panel,
                                      ),
                                      child: isVideo
                                          ? Center(
                                              child: Icon(
                                                Icons
                                                    .play_circle_outline_rounded,
                                                color: tokens.textMuted,
                                                size: 30,
                                              ),
                                            )
                                          : ClipRRect(
                                              borderRadius:
                                                  BorderRadius.circular(9),
                                              child: Image.network(
                                                url,
                                                fit: BoxFit.contain,
                                                errorBuilder: (_, __, ___) =>
                                                    Icon(
                                                      Icons
                                                          .broken_image_rounded,
                                                      color: tokens.textMuted,
                                                    ),
                                              ),
                                            ),
                                    ),
                                  );
                                },
                              ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 12),
                      _SectionCard(
                        title: LanguageController.instance.t('ads.detail.sectionActions'),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              LanguageController.instance.t('ads.detail.actionsSubtitle'),
                              style: TextStyle(
                                color: textSecondary,
                                fontSize: 13,
                              ),
                            ),
                            const SizedBox(height: 10),
                            Text(
                              LanguageController.instance.t('ads.detail.boostStrength'),
                              style: TextStyle(
                                color: textPrimary,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            const SizedBox(height: 8),
                            Column(
                              children: _boostPackages.map((item) {
                                final isDowngrade =
                                    item.price < currentBoostPackage.price;
                                final disabled =
                                    _saving ||
                                    _creatingUpgradeCheckout ||
                                    isDowngrade ||
                                    !detail.actions.canChangeBoost;
                                final selected =
                                    item.id == _selectedBoostUpgradeId;
                                return _ActionPackageOptionCard(
                                  title: _boostTitle(item.id),
                                  subtitle: isDowngrade
                                      ? LanguageController.instance.t('ads.detail.notAvailableDowngrade')
                                      : _boostLevel(item.id),
                                  priceLabel: _money(item.price),
                                  selected: selected,
                                  disabled: disabled,
                                  highlight: _boostHighlight(item.id),
                                  onTap: () {
                                    setState(() {
                                      _selectedBoostUpgradeId = item.id;
                                      _upgradeError = null;
                                    });
                                  },
                                );
                              }).toList(),
                            ),
                            const SizedBox(height: 12),
                            Text(
                              LanguageController.instance.t('ads.detail.extendDays'),
                              style: TextStyle(
                                color: textPrimary,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            const SizedBox(height: 8),
                            Wrap(
                              spacing: 8,
                              runSpacing: 8,
                              children: _durationPackages.map((item) {
                                final active =
                                    item.id == _selectedDurationUpgradeId;
                                final disabled =
                                    _saving ||
                                    _creatingUpgradeCheckout ||
                                    !detail.actions.canExtend;
                                return _ActionDurationOptionChip(
                                  label: item.days > 0
                                      ? LanguageController.instance.t('ads.detail.dayCount', {'count': item.days})
                                      : LanguageController.instance.t('ads.detail.noExtension'),
                                  priceLabel: _money(item.price),
                                  selected: active,
                                  disabled: disabled,
                                  onTap: () {
                                    setState(() {
                                      _selectedDurationUpgradeId = item.id;
                                      _upgradeError = null;
                                    });
                                  },
                                );
                              }).toList(),
                            ),
                            const SizedBox(height: 12),
                            Container(
                              width: double.infinity,
                              padding: const EdgeInsets.all(12),
                              decoration: BoxDecoration(
                                color: tokens.panel,
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(color: tokens.panelBorder),
                              ),
                              child: Column(
                                children: [
                                  _DetailRow(
                                    label: LanguageController.instance.t('ads.detail.upgradeCurrentBoost'),
                                    value: _boostTitle(currentBoostPackage.id),
                                  ),
                                  _DetailRow(
                                    label: LanguageController.instance.t('ads.detail.upgradeBoostDiff'),
                                    value: _money(boostUpgradeDelta),
                                  ),
                                  _DetailRow(
                                    label: LanguageController.instance.t('ads.detail.upgradeExtendDays'),
                                    value: _money(durationUpgradeCost),
                                  ),
                                  _DetailRow(
                                    label: LanguageController.instance.t('ads.detail.upgradeNeedToPay'),
                                    value: _money(upgradeTotalCost),
                                  ),
                                  _DetailRow(
                                    label: LanguageController.instance.t('ads.detail.upgradeNewBudget'),
                                    value: _money(projectedBudget),
                                  ),
                                ],
                              ),
                            ),
                            if (_upgradeError != null) ...[
                              const SizedBox(height: 8),
                              Text(
                                _upgradeError!,
                                style: TextStyle(color: scheme.error),
                              ),
                            ],
                            const SizedBox(height: 10),
                            SizedBox(
                              width: double.infinity,
                              child: ElevatedButton(
                                onPressed:
                                    _saving ||
                                        _creatingUpgradeCheckout ||
                                        !hasUpgradeSelection ||
                                        (!detail.actions.canChangeBoost &&
                                            !detail.actions.canExtend)
                                    ? null
                                    : _startUpgradeCheckout,
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: accent,
                                  foregroundColor: scheme.onPrimary,
                                ),
                                child: Text(
                                  _creatingUpgradeCheckout
                                      ? LanguageController.instance.t('ads.detail.creatingCheckout')
                                      : LanguageController.instance.t('ads.detail.payWithStripe'),
                                ),
                              ),
                            ),
                            const SizedBox(height: 14),
                            Divider(color: tokens.panelBorder, height: 1),
                            const SizedBox(height: 14),
                            Text(
                              LanguageController.instance.t('ads.detail.lifecycleTitle'),
                              style: TextStyle(
                                color: textPrimary,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            const SizedBox(height: 6),
                            Text(
                              LanguageController.instance.t('ads.detail.lifecycleSubtitle'),
                              style: TextStyle(
                                color: textSecondary,
                                fontSize: 13,
                              ),
                            ),
                            const SizedBox(height: 10),
                            Row(
                              children: [
                                if (detail.actions.canPause)
                                  Expanded(
                                    child: OutlinedButton(
                                      onPressed: _saving
                                          ? null
                                          : () => _confirmLifecycleAction(
                                              action: 'pause_campaign',
                                              title: LanguageController.instance.t('ads.detail.hideDialogTitle'),
                                              body: LanguageController.instance.t('ads.detail.hideDialogBody'),
                                              confirmLabel: LanguageController.instance.t('ads.detail.hideDialogConfirm'),
                                            ),
                                      style: OutlinedButton.styleFrom(
                                        side: BorderSide(
                                          color: tokens.panelBorder,
                                        ),
                                        foregroundColor: tokens.text,
                                      ),
                                      child: Text(LanguageController.instance.t('ads.detail.hideCampaign')),
                                    ),
                                  ),
                                if (detail.actions.canPause &&
                                    detail.actions.canResume)
                                  const SizedBox(width: 8),
                                if (!detail.actions.canPause &&
                                    detail.actions.canResume)
                                  Expanded(
                                    child: ElevatedButton(
                                      onPressed: _saving
                                          ? null
                                          : () => _confirmLifecycleAction(
                                              action: 'resume_campaign',
                                              title: LanguageController.instance.t('ads.detail.reopenDialogTitle'),
                                              body: detail.actions.requiresExtendBeforeResume
                                                  ? LanguageController.instance.t('ads.detail.reopenDialogBodyExpired')
                                                  : LanguageController.instance.t('ads.detail.reopenDialogBody'),
                                              confirmLabel: LanguageController.instance.t('ads.detail.reopenDialogConfirm'),
                                            ),
                                      style: ElevatedButton.styleFrom(
                                        backgroundColor: accent,
                                        foregroundColor: scheme.onPrimary,
                                      ),
                                      child: Text(LanguageController.instance.t('ads.detail.reopenCampaign')),
                                    ),
                                  ),
                              ],
                            ),
                          ],
                        ),
                      ),
                      if (_success != null) ...[
                        const SizedBox(height: 10),
                        Text(
                          _success!,
                          style: const TextStyle(color: Color(0xFF55D49C)),
                        ),
                      ],
                      if (_error != null) ...[
                        const SizedBox(height: 10),
                        Text(_error!, style: TextStyle(color: scheme.error)),
                      ],
                    ],
                  ),
                ),
              ),
      ),
      bottomSheet: _editOpen && _editDraft != null
          ? _EditBottomSheet(
              draft: _editDraft!,
              interestCtrl: _interestCtrl,
              loading: _editSaving,
              uploadingMedia: _uploadingMedia,
              mediaEditLocked: _detail != null
                  ? _uniqueViews(_detail!) > _mediaEditLockUniqueViews
                  : false,
              onClose: _closeEdit,
              onDraftChanged: (next) => setState(() => _editDraft = next),
              onAddInterest: () {
                final value = _interestCtrl.text.trim();
                if (value.isEmpty) return;
                final exists = _editDraft!.interests.any(
                  (item) => item.toLowerCase() == value.toLowerCase(),
                );
                if (exists) {
                  _interestCtrl.clear();
                  return;
                }
                setState(() {
                  _editDraft = _editDraft!.copyWith(
                    interests: [..._editDraft!.interests, value],
                  );
                  _interestCtrl.clear();
                });
              },
              onRemoveInterest: (interest) {
                setState(() {
                  _editDraft = _editDraft!.copyWith(
                    interests: _editDraft!.interests
                        .where((i) => i != interest)
                        .toList(),
                  );
                });
              },
              onRemoveMedia: _removeMediaUrl,
              onPickMedia: _uploadEditMedia,
              onSave: _saveEdit,
              hasChanges: _hasEditChanges(),
              error: _editError,
            )
          : null,
    );
  }
}

class _SectionCard extends StatelessWidget {
  const _SectionCard({required this.title, required this.child, this.action});

  final String title;
  final Widget child;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final tokens =
        theme.extension<AppSemanticColors>() ??
        (theme.brightness == Brightness.dark
            ? AppSemanticColors.dark
            : AppSemanticColors.light);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      decoration: BoxDecoration(
        color: tokens.panelMuted,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: tokens.panelBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  title,
                  style: TextStyle(
                    color: tokens.text,
                    fontWeight: FontWeight.w700,
                    fontSize: 16,
                  ),
                ),
              ),
              if (action != null) action!,
            ],
          ),
          const SizedBox(height: 10),
          child,
        ],
      ),
    );
  }
}

class _MetricCard extends StatelessWidget {
  const _MetricCard({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final tokens =
        theme.extension<AppSemanticColors>() ??
        (theme.brightness == Brightness.dark
            ? AppSemanticColors.dark
            : AppSemanticColors.light);

    return Container(
      padding: const EdgeInsets.fromLTRB(10, 10, 10, 10),
      decoration: BoxDecoration(
        color: tokens.panel,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: tokens.panelBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: TextStyle(color: tokens.textMuted, fontSize: 11)),
          const SizedBox(height: 5),
          Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: tokens.text,
              fontWeight: FontWeight.w800,
              fontSize: 17,
            ),
          ),
        ],
      ),
    );
  }
}

class _BreakdownItem extends StatelessWidget {
  const _BreakdownItem({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final tokens =
        theme.extension<AppSemanticColors>() ??
        (theme.brightness == Brightness.dark
            ? AppSemanticColors.dark
            : AppSemanticColors.light);

    return Container(
      padding: const EdgeInsets.fromLTRB(10, 10, 10, 10),
      decoration: BoxDecoration(
        color: tokens.panel,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: tokens.panelBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: TextStyle(color: tokens.textMuted, fontSize: 11)),
          const SizedBox(height: 4),
          Text(
            value,
            style: TextStyle(
              color: tokens.text,
              fontWeight: FontWeight.w700,
              fontSize: 14,
            ),
          ),
        ],
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
    final theme = Theme.of(context);
    final tokens =
        theme.extension<AppSemanticColors>() ??
        (theme.brightness == Brightness.dark
            ? AppSemanticColors.dark
            : AppSemanticColors.light);

    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 132,
            child: Text(
              label,
              style: TextStyle(color: tokens.textMuted, fontSize: 12),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: TextStyle(
                color: tokens.text,
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

class _EditBottomSheet extends StatelessWidget {
  const _EditBottomSheet({
    required this.draft,
    required this.interestCtrl,
    required this.loading,
    required this.uploadingMedia,
    required this.mediaEditLocked,
    required this.onClose,
    required this.onDraftChanged,
    required this.onAddInterest,
    required this.onRemoveInterest,
    required this.onRemoveMedia,
    required this.onPickMedia,
    required this.onSave,
    required this.hasChanges,
    required this.error,
  });

  final _EditDraft draft;
  final TextEditingController interestCtrl;
  final bool loading;
  final bool uploadingMedia;
  final bool mediaEditLocked;
  final VoidCallback onClose;
  final ValueChanged<_EditDraft> onDraftChanged;
  final VoidCallback onAddInterest;
  final ValueChanged<String> onRemoveInterest;
  final ValueChanged<String> onRemoveMedia;
  final VoidCallback onPickMedia;
  final VoidCallback onSave;
  final bool hasChanges;
  final String? error;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final tokens = _appTokens(context);
    final textPrimary = tokens.text;
    final textSecondary = tokens.textMuted;

    return Container(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.92,
      ),
      decoration: BoxDecoration(
        color: tokens.panelMuted,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(18)),
      ),
      child: SafeArea(
        top: false,
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      LanguageController.instance.t('ads.detail.editTitle'),
                      style: TextStyle(
                        color: textPrimary,
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  IconButton(
                    onPressed: loading ? null : onClose,
                    icon: Icon(Icons.close_rounded, color: textPrimary),
                  ),
                ],
              ),
              _EditField(
                label: LanguageController.instance.t('ads.detail.editCampaignName'),
                child: TextField(
                  controller: TextEditingController(text: draft.campaignName)
                    ..selection = TextSelection.fromPosition(
                      TextPosition(offset: draft.campaignName.length),
                    ),
                  onChanged: (v) =>
                      onDraftChanged(draft.copyWith(campaignName: v)),
                  style: TextStyle(color: textPrimary),
                  decoration: _editInputDecoration(context),
                ),
              ),
              _EditField(
                label: LanguageController.instance.t('ads.detail.editObjective'),
                helper: LanguageController.instance.t('ads.detail.editObjectiveLocked'),
                child: _SelectPillRow(
                  values: const [
                    'awareness',
                    'traffic',
                    'engagement',
                    'leads',
                    'sales',
                    'messages',
                  ],
                  selected: draft.objective,
                  enabled: false,
                  onSelected: (v) =>
                      onDraftChanged(draft.copyWith(objective: v)),
                ),
              ),
              _EditField(
                label: LanguageController.instance.t('ads.detail.editAdFormat'),
                helper: LanguageController.instance.t('ads.detail.editAdFormatLocked'),
                child: _SelectPillRow(
                  values: const ['single', 'carousel', 'video'],
                  selected: draft.adFormat,
                  enabled: false,
                  onSelected: (v) {
                    final keep = v == 'carousel'
                        ? draft.mediaUrls.take(5).toList()
                        : draft.mediaUrls.take(1).toList();
                    onDraftChanged(
                      draft.copyWith(adFormat: v, mediaUrls: keep),
                    );
                  },
                ),
              ),
              _EditField(
                label: LanguageController.instance.t('ads.detail.editPrimaryText'),
                child: TextField(
                  controller: TextEditingController(text: draft.primaryText)
                    ..selection = TextSelection.fromPosition(
                      TextPosition(offset: draft.primaryText.length),
                    ),
                  onChanged: (v) =>
                      onDraftChanged(draft.copyWith(primaryText: v)),
                  minLines: 3,
                  maxLines: 6,
                  style: TextStyle(color: textPrimary),
                  decoration: _editInputDecoration(context),
                ),
              ),
              _EditField(
                label: LanguageController.instance.t('ads.detail.editHeadline'),
                child: TextField(
                  controller: TextEditingController(text: draft.headline)
                    ..selection = TextSelection.fromPosition(
                      TextPosition(offset: draft.headline.length),
                    ),
                  onChanged: (v) => onDraftChanged(draft.copyWith(headline: v)),
                  style: TextStyle(color: textPrimary),
                  decoration: _editInputDecoration(context),
                ),
              ),
              _EditField(
                label: LanguageController.instance.t('ads.detail.editCta'),
                child: _SelectPillRow(
                  values: const [
                    'Shop Now',
                    'Learn More',
                    'Sign Up',
                    'Book Now',
                    'Contact Us',
                    'Get Offer',
                    'Watch More',
                  ],
                  selected: draft.cta,
                  onSelected: (v) => onDraftChanged(draft.copyWith(cta: v)),
                ),
              ),
              _EditField(
                label: LanguageController.instance.t('ads.detail.editDescription'),
                child: TextField(
                  controller: TextEditingController(text: draft.adDescription)
                    ..selection = TextSelection.fromPosition(
                      TextPosition(offset: draft.adDescription.length),
                    ),
                  onChanged: (v) =>
                      onDraftChanged(draft.copyWith(adDescription: v)),
                  style: TextStyle(color: textPrimary),
                  decoration: _editInputDecoration(context),
                ),
              ),
              _EditField(
                label: LanguageController.instance.t('ads.detail.editDestinationUrl'),
                child: TextField(
                  controller: TextEditingController(text: draft.destinationUrl)
                    ..selection = TextSelection.fromPosition(
                      TextPosition(offset: draft.destinationUrl.length),
                    ),
                  onChanged: (v) =>
                      onDraftChanged(draft.copyWith(destinationUrl: v)),
                  style: TextStyle(color: textPrimary),
                  decoration: _editInputDecoration(context, hint: 'https://'),
                ),
              ),
              _EditField(
                label: LanguageController.instance.t('ads.detail.editLocation'),
                helper: LanguageController.instance.t('ads.detail.editLocationLocked'),
                child: TextField(
                  enabled: false,
                  controller: TextEditingController(text: draft.locationText),
                  style: TextStyle(color: textSecondary),
                  decoration: _editInputDecoration(context),
                ),
              ),
              _EditField(
                label: LanguageController.instance.t('ads.detail.editAgeRange'),
                helper: LanguageController.instance.t('ads.detail.editAgeRangeLocked'),
                child: Row(
                  children: [
                    Expanded(
                      child: TextField(
                        enabled: false,
                        controller: TextEditingController(text: draft.ageMin),
                        style: TextStyle(color: textSecondary),
                        decoration: _editInputDecoration(context),
                      ),
                    ),
                    Padding(
                      padding: EdgeInsets.symmetric(horizontal: 8),
                      child: Text(LanguageController.instance.t('ads.detail.editAgeTo'), style: TextStyle(color: textSecondary)),
                    ),
                    Expanded(
                      child: TextField(
                        enabled: false,
                        controller: TextEditingController(text: draft.ageMax),
                        style: TextStyle(color: textSecondary),
                        decoration: _editInputDecoration(context),
                      ),
                    ),
                  ],
                ),
              ),
              _EditField(
                label: LanguageController.instance.t('ads.detail.editInterests'),
                child: Column(
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: interestCtrl,
                            style: TextStyle(color: textPrimary),
                            decoration: _editInputDecoration(
                              context,
                              hint: LanguageController.instance.t('ads.detail.editInterestHint'),
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        TextButton(
                          onPressed: onAddInterest,
                          style: TextButton.styleFrom(
                            backgroundColor: tokens.panel,
                            foregroundColor: textPrimary,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(10),
                            ),
                            padding: const EdgeInsets.symmetric(
                              horizontal: 14,
                              vertical: 11,
                            ),
                          ),
                          child: Text(LanguageController.instance.t('ads.detail.editAdd')),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: draft.interests
                          .map(
                            (i) => InputChip(
                              label: Text(i),
                              onDeleted: () => onRemoveInterest(i),
                              backgroundColor: tokens.panel,
                              side: BorderSide(color: tokens.panelBorder),
                              labelStyle: TextStyle(color: textPrimary),
                              deleteIconColor: textSecondary,
                            ),
                          )
                          .toList(),
                    ),
                  ],
                ),
              ),
              _EditField(
                label: LanguageController.instance.t('ads.detail.editCreativeMedia'),
                helper: mediaEditLocked
                    ? LanguageController.instance.t('ads.detail.editMediaLocked')
                    : null,
                child: Column(
                  children: [
                    Align(
                      alignment: Alignment.centerLeft,
                      child: OutlinedButton(
                        onPressed: loading || mediaEditLocked
                            ? null
                            : onPickMedia,
                        style: OutlinedButton.styleFrom(
                          foregroundColor: textPrimary,
                          backgroundColor: tokens.panel,
                          side: BorderSide(color: tokens.panelBorder),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                          padding: const EdgeInsets.symmetric(
                            horizontal: 14,
                            vertical: 11,
                          ),
                        ),
                        child: Text(
                          uploadingMedia
                              ? LanguageController.instance.t('ads.detail.editUploading')
                              : LanguageController.instance.t('ads.detail.editChooseFiles'),
                        ),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: draft.mediaUrls
                          .map(
                            (url) => SizedBox(
                              width: 110,
                              child: Column(
                                children: [
                                  Container(
                                    width: 110,
                                    height: 72,
                                    decoration: BoxDecoration(
                                      color: tokens.panel,
                                      borderRadius: BorderRadius.circular(10),
                                      border: Border.all(
                                        color: tokens.panelBorder,
                                      ),
                                    ),
                                    child: ClipRRect(
                                      borderRadius: BorderRadius.circular(9),
                                      child: url.toLowerCase().contains('.mp4')
                                          ? Icon(
                                              Icons.play_circle_outline_rounded,
                                              color: textSecondary,
                                              size: 26,
                                            )
                                          : Image.network(
                                              url,
                                              fit: BoxFit.contain,
                                              errorBuilder: (_, __, ___) =>
                                                  Icon(
                                                    Icons.broken_image_rounded,
                                                    color: textSecondary,
                                                  ),
                                            ),
                                    ),
                                  ),
                                  const SizedBox(height: 5),
                                  TextButton(
                                    onPressed: (loading || mediaEditLocked)
                                        ? null
                                        : () => onRemoveMedia(url),
                                    style: TextButton.styleFrom(
                                      foregroundColor: scheme.error,
                                      minimumSize: const Size(0, 28),
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 8,
                                      ),
                                    ),
                                    child: Text(LanguageController.instance.t('ads.detail.editRemove')),
                                  ),
                                ],
                              ),
                            ),
                          )
                          .toList(),
                    ),
                  ],
                ),
              ),
              if (error != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Text(error!, style: TextStyle(color: scheme.error)),
                ),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: loading ? null : onClose,
                      style: OutlinedButton.styleFrom(
                        foregroundColor: textPrimary,
                        backgroundColor: tokens.panel,
                        side: BorderSide(color: tokens.panelBorder),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                      child: Text(LanguageController.instance.t('ads.detail.editCancel')),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: ElevatedButton(
                      onPressed: (!hasChanges || loading || uploadingMedia)
                          ? null
                          : onSave,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: tokens.primary,
                        foregroundColor: scheme.onPrimary,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                      child: Text(loading
                          ? LanguageController.instance.t('ads.detail.editSaving')
                          : LanguageController.instance.t('ads.detail.editSaveChanges')),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  InputDecoration _editInputDecoration(BuildContext context, {String? hint}) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final tokens = _appTokens(context);

    return InputDecoration(
      hintText: hint,
      hintStyle: TextStyle(color: tokens.textMuted),
      filled: true,
      fillColor: tokens.panel,
      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: tokens.panelBorder),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: tokens.panelBorder),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: scheme.primary),
      ),
      disabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: tokens.panelBorder),
      ),
    );
  }
}

class _EditField extends StatelessWidget {
  const _EditField({required this.label, required this.child, this.helper});

  final String label;
  final Widget child;
  final String? helper;

  @override
  Widget build(BuildContext context) {
    final tokens = _appTokens(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: TextStyle(
              color: tokens.text,
              fontSize: 13,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 6),
          child,
          if (helper != null) ...[
            const SizedBox(height: 4),
            Text(
              helper!,
              style: TextStyle(color: tokens.textMuted, fontSize: 11.5),
            ),
          ],
        ],
      ),
    );
  }
}

class _SelectPillRow extends StatelessWidget {
  const _SelectPillRow({
    required this.values,
    required this.selected,
    this.enabled = true,
    required this.onSelected,
  });

  final List<String> values;
  final String selected;
  final bool enabled;
  final ValueChanged<String> onSelected;

  @override
  Widget build(BuildContext context) {
    final tokens = _appTokens(context);
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: values
          .map(
            (value) => InkWell(
              borderRadius: BorderRadius.circular(12),
              onTap: enabled ? () => onSelected(value) : null,
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 10,
                ),
                decoration: BoxDecoration(
                  color: selected == value ? tokens.primarySoft : tokens.panel,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: selected == value
                        ? tokens.primary
                        : tokens.panelBorder,
                  ),
                ),
                child: Text(
                  value,
                  style: TextStyle(
                    color: enabled
                        ? (selected == value ? tokens.text : tokens.textMuted)
                        : tokens.textMuted,
                    fontWeight: FontWeight.w700,
                    fontSize: 13,
                  ),
                ),
              ),
            ),
          )
          .toList(),
    );
  }
}

class _ActionPackageOptionCard extends StatelessWidget {
  const _ActionPackageOptionCard({
    required this.title,
    required this.subtitle,
    required this.priceLabel,
    required this.selected,
    required this.disabled,
    required this.onTap,
    this.highlight,
  });

  final String title;
  final String subtitle;
  final String priceLabel;
  final bool selected;
  final bool disabled;
  final VoidCallback onTap;
  final String? highlight;

  @override
  Widget build(BuildContext context) {
    final tokens = _appTokens(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: disabled ? null : onTap,
        child: Opacity(
          opacity: disabled ? 0.56 : 1,
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
            decoration: BoxDecoration(
              color: selected ? tokens.primarySoft : tokens.panel,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                color: selected ? tokens.primary : tokens.panelBorder,
                width: selected ? 1.4 : 1,
              ),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Text(
                            title,
                            style: TextStyle(
                              color: tokens.text,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          if (highlight != null) ...[
                            const SizedBox(width: 8),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 8,
                                vertical: 3,
                              ),
                              decoration: BoxDecoration(
                                color: tokens.panelMuted,
                                borderRadius: BorderRadius.circular(999),
                              ),
                              child: Text(
                                highlight!,
                                style: TextStyle(
                                  color: tokens.primary,
                                  fontWeight: FontWeight.w700,
                                  fontSize: 11,
                                ),
                              ),
                            ),
                          ],
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(
                        subtitle,
                        style: TextStyle(color: tokens.textMuted, fontSize: 12),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      priceLabel,
                      style: TextStyle(
                        color: tokens.text,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      selected ? 'Selected' : 'Tap to choose',
                      style: TextStyle(
                        color: selected ? tokens.primary : tokens.textMuted,
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _ActionDurationOptionChip extends StatelessWidget {
  const _ActionDurationOptionChip({
    required this.label,
    required this.priceLabel,
    required this.selected,
    required this.disabled,
    required this.onTap,
  });

  final String label;
  final String priceLabel;
  final bool selected;
  final bool disabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final tokens = _appTokens(context);
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: disabled ? null : onTap,
      child: Opacity(
        opacity: disabled ? 0.56 : 1,
        child: Container(
          width: 150,
          padding: const EdgeInsets.fromLTRB(10, 10, 10, 10),
          decoration: BoxDecoration(
            color: selected ? tokens.primarySoft : tokens.panel,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: selected ? tokens.primary : tokens.panelBorder,
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: TextStyle(
                  color: tokens.text,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                priceLabel,
                style: TextStyle(color: tokens.textMuted, fontSize: 12),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
