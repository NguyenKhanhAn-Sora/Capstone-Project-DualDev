import 'dart:math' as math;
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_web_auth_2/flutter_web_auth_2.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/services/api_service.dart';
import 'ads_payment_status_screen.dart';
import 'ads_service.dart';

const int _mediaEditLockUniqueViews = 100;
const int _dayMs = 24 * 60 * 60 * 1000;

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
  static const List<String> _objectiveOptions = [
    'awareness',
    'traffic',
    'engagement',
    'leads',
    'sales',
    'messages',
  ];

  static const List<String> _adFormatOptions = ['single', 'carousel', 'video'];

  static const List<String> _ctaOptions = [
    'Shop Now',
    'Learn More',
    'Sign Up',
    'Book Now',
    'Contact Us',
    'Get Offer',
    'Watch More',
  ];

  static const Map<String, String> _boostLabel = {
    'light': 'Light Boost',
    'standard': 'Standard Boost',
    'strong': 'Strong Boost',
  };

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
        _error = 'Failed to load campaign details.';
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
    switch (status) {
      case 'active':
        return 'Active';
      case 'hidden':
        return 'Hidden';
      case 'paused':
        return 'Paused';
      case 'canceled':
        return 'Canceled';
      default:
        return 'Completed';
    }
  }

  String _hiddenReasonLabel(String? reason) {
    if (reason == null || reason.isEmpty) return 'Visible';
    if (reason == 'paused') return 'Hidden manually';
    if (reason == 'canceled') return 'Canceled manually';
    if (reason == 'expired') return 'Expired';
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
    switch (status) {
      case 'active':
        return const Color(0x1F10B981);
      case 'hidden':
        return const Color(0x3364758B);
      case 'paused':
        return const Color(0x3394A3B8);
      case 'canceled':
        return const Color(0x33DC2626);
      default:
        return const Color(0x3338BDF8);
    }
  }

  Color _statusFg(String status) {
    switch (status) {
      case 'active':
        return const Color(0xFF63E6B2);
      case 'hidden':
      case 'paused':
        return const Color(0xFFCBD5E1);
      case 'canceled':
        return const Color(0xFFFCA5A5);
      default:
        return const Color(0xFFBAE6FD);
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
            'Media cannot be edited after unique views exceed $_mediaEditLockUniqueViews.';
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
          _editError = 'Media limit reached for current ad format.';
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
        _editError = 'Failed to upload media.';
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
            'Media cannot be edited after unique views exceed $_mediaEditLockUniqueViews.';
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
        _success = 'Campaign details updated successfully.';
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _editError = e.message;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _editError = 'Failed to save campaign details.';
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
        _upgradeError = 'Please select an upgrade package before checkout.';
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
          _upgradeError = 'Unable to create Stripe checkout session.';
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
          _success = 'Upgrade payment completed. Campaign details refreshed.';
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
        _upgradeError = 'Failed to start checkout session.';
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
        _error =
            'This campaign has expired. Please purchase an extension package before reopening.';
        _upgradeError =
            'Select an extension package, complete payment, then reopen the campaign.';
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
            ? 'Campaign has been hidden successfully.'
            : 'Campaign has been reopened successfully.';
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
          _upgradeError =
              'Please extend campaign days first, then reopen the campaign.';
        }
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'Failed to update campaign.';
      });
    } finally {
      if (mounted) {
        setState(() {
          _saving = false;
        });
      }
    }
  }

  Future<void> _confirmLifecycleAction({
    required String action,
    required String title,
    required String body,
    required String confirmLabel,
  }) async {
    final shouldProceed = await showDialog<bool>(
      context: context,
      barrierDismissible: !_saving,
      builder: (dialogContext) {
        return AlertDialog(
          backgroundColor: const Color(0xFF111827),
          title: Text(title, style: const TextStyle(color: Color(0xFFE8ECF8))),
          content: Text(
            body,
            style: const TextStyle(color: Color(0xFFBFD5F3), height: 1.35),
          ),
          actions: [
            TextButton(
              onPressed: _saving
                  ? null
                  : () => Navigator.of(dialogContext).pop(false),
              child: const Text('Cancel'),
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
                        ? const Center(
                            child: Text(
                              'Video preview is not enabled in lightbox yet.',
                              style: TextStyle(color: Color(0xFFE8ECF8)),
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
    const bg = Color(0xFF0B1020);
    const card = Color(0xFF111827);
    const textPrimary = Color(0xFFE8ECF8);
    const textSecondary = Color(0xFF7A8BB0);
    const accent = Color(0xFF4AA3E4);

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
      backgroundColor: bg,
      appBar: AppBar(
        backgroundColor: bg,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        iconTheme: const IconThemeData(color: textPrimary),
        title: const Text('Ad Details', style: TextStyle(color: textPrimary)),
      ),
      body: SafeArea(
        child: _loading
            ? const Center(
                child: CircularProgressIndicator(color: accent, strokeWidth: 2),
              )
            : detail == null
            ? Center(
                child: Text(
                  _error ?? 'Campaign not found.',
                  style: const TextStyle(color: Colors.redAccent),
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
                          border: Border.all(color: const Color(0xFF1E2D48)),
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
                                        style: const TextStyle(
                                          color: textPrimary,
                                          fontSize: 22,
                                          fontWeight: FontWeight.w700,
                                        ),
                                      ),
                                      const SizedBox(height: 4),
                                      Text(
                                        '${detail.startsAt?.toLocal().toString().split(' ').first ?? '--'} - ${detail.expiresAt?.toLocal().toString().split(' ').first ?? '--'}',
                                        style: const TextStyle(
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
                                  label: 'Spent',
                                  value: _money(detail.spent),
                                ),
                                _MetricCard(
                                  label: 'Impressions',
                                  value: _intFmt(detail.impressions),
                                ),
                                _MetricCard(
                                  label: 'Clicks',
                                  value: _intFmt(detail.clicks),
                                ),
                                _MetricCard(
                                  label: 'CTR',
                                  value: _pct(detail.ctr),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 12),
                      _SectionCard(
                        title: 'Performance Breakdown',
                        child: GridView.count(
                          crossAxisCount: 2,
                          crossAxisSpacing: 8,
                          mainAxisSpacing: 8,
                          childAspectRatio: 1.7,
                          shrinkWrap: true,
                          physics: const NeverScrollableScrollPhysics(),
                          children: [
                            _BreakdownItem(
                              label: 'Reach',
                              value: _intFmt(detail.reach),
                            ),
                            _BreakdownItem(
                              label: 'Views',
                              value: _intFmt(detail.views),
                            ),
                            _BreakdownItem(
                              label: 'Engagements',
                              value: _intFmt(detail.engagements),
                            ),
                            _BreakdownItem(
                              label: 'Engagement rate',
                              value: _pct(detail.engagementRate),
                            ),
                            _BreakdownItem(
                              label: 'Avg dwell',
                              value:
                                  '${_intFmt(detail.averageDwellMs.round())} ms',
                            ),
                            _BreakdownItem(
                              label: 'Budget usage',
                              value: detail.budget > 0
                                  ? _pct((detail.spent / detail.budget) * 100)
                                  : 'N/A',
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 12),
                      _SectionCard(
                        title: 'Campaign Configuration',
                        child: Column(
                          children: [
                            _DetailRow(
                              label: 'Objective',
                              value: detail.objective.isEmpty
                                  ? 'N/A'
                                  : detail.objective,
                            ),
                            _DetailRow(
                              label: 'Ad format',
                              value: detail.adFormat.isEmpty
                                  ? 'N/A'
                                  : detail.adFormat,
                            ),
                            _DetailRow(
                              label: 'Boost package',
                              value:
                                  _boostLabel[detail.boostPackageId] ??
                                  (detail.boostPackageId.isEmpty
                                      ? 'N/A'
                                      : detail.boostPackageId),
                            ),
                            _DetailRow(
                              label: 'Duration days',
                              value: detail.durationDays > 0
                                  ? '${detail.durationDays} days'
                                  : 'N/A',
                            ),
                            _DetailRow(
                              label: 'Delivery state reason',
                              value: _hiddenReasonLabel(detail.hiddenReason),
                            ),
                            if (detail.status == 'canceled' &&
                                (detail.adminCancelReason ?? '')
                                    .trim()
                                    .isNotEmpty)
                              _DetailRow(
                                label: 'Admin cancellation reason',
                                value: detail.adminCancelReason!.trim(),
                              ),
                            Builder(
                              builder: (_) {
                                final t = _timeline(detail);
                                return _DetailRow(
                                  label: 'Elapsed / total',
                                  value: '${t.elapsed} / ${t.total} days',
                                );
                              },
                            ),
                            _DetailRow(
                              label: 'Reactions split',
                              value:
                                  '${_intFmt(detail.likes)} likes · ${_intFmt(detail.comments)} comments · ${_intFmt(detail.reposts)} reposts',
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 12),
                      _SectionCard(
                        title: 'Ad Creative & Audience',
                        action: ElevatedButton.icon(
                          onPressed: _openEdit,
                          icon: const Icon(Icons.edit_rounded, size: 18),
                          label: const Text(
                            'Edit',
                            style: TextStyle(fontWeight: FontWeight.w700),
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
                              label: 'Primary text',
                              value: detail.primaryText.trim().isEmpty
                                  ? 'N/A'
                                  : detail.primaryText.trim(),
                            ),
                            _DetailRow(
                              label: 'Headline',
                              value: detail.headline.trim().isEmpty
                                  ? 'N/A'
                                  : detail.headline.trim(),
                            ),
                            _DetailRow(
                              label: 'Description',
                              value: detail.adDescription.trim().isEmpty
                                  ? 'N/A'
                                  : detail.adDescription.trim(),
                            ),
                            _DetailRow(
                              label: 'CTA button',
                              value: detail.cta.trim().isEmpty
                                  ? 'N/A'
                                  : detail.cta.trim(),
                            ),
                            _DetailRow(
                              label: 'Destination URL',
                              value: detail.destinationUrl.trim().isEmpty
                                  ? 'N/A'
                                  : detail.destinationUrl.trim(),
                            ),
                            _DetailRow(
                              label: 'Location targeting',
                              value: detail.locationText.trim().isEmpty
                                  ? 'N/A'
                                  : detail.locationText.trim(),
                            ),
                            _DetailRow(
                              label: 'Age targeting',
                              value:
                                  detail.ageMin != null && detail.ageMax != null
                                  ? '${detail.ageMin} - ${detail.ageMax}'
                                  : 'N/A',
                            ),
                            _DetailRow(
                              label: 'Interests',
                              value: detail.interests.isEmpty
                                  ? 'N/A'
                                  : detail.interests.join(' · '),
                            ),
                            const SizedBox(height: 8),
                            Align(
                              alignment: Alignment.centerLeft,
                              child: Text(
                                'Creative Media',
                                style: const TextStyle(
                                  color: textSecondary,
                                  fontSize: 12,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ),
                            const SizedBox(height: 8),
                            if (detail.mediaUrls.isEmpty)
                              const Text(
                                'No media available for this campaign.',
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
                                          color: const Color(0xFF20365A),
                                        ),
                                        color: const Color(0xFF0F1B33),
                                      ),
                                      child: isVideo
                                          ? const Center(
                                              child: Icon(
                                                Icons
                                                    .play_circle_outline_rounded,
                                                color: Color(0xFFBFD5F3),
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
                                                    const Icon(
                                                      Icons
                                                          .broken_image_rounded,
                                                      color: Color(0xFFBFD5F3),
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
                        title: 'Campaign Actions',
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'Upgrade boost and extend duration, then manage lifecycle state.',
                              style: TextStyle(
                                color: textSecondary,
                                fontSize: 13,
                              ),
                            ),
                            const SizedBox(height: 10),
                            const Text(
                              '1. Boost strength',
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
                                  title: item.title,
                                  subtitle: isDowngrade
                                      ? 'Not available for downgrade'
                                      : item.level,
                                  priceLabel: _money(item.price),
                                  selected: selected,
                                  disabled: disabled,
                                  highlight: item.highlight,
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
                            const Text(
                              '2. Extend campaign days',
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
                                      ? '${item.days} days'
                                      : 'No extension',
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
                                color: const Color(0xFF0D1A30),
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(
                                  color: const Color(0xFF1D3658),
                                ),
                              ),
                              child: Column(
                                children: [
                                  _DetailRow(
                                    label: 'Current boost',
                                    value: currentBoostPackage.title,
                                  ),
                                  _DetailRow(
                                    label: 'Boost upgrade difference',
                                    value: _money(boostUpgradeDelta),
                                  ),
                                  _DetailRow(
                                    label: 'Extend days package',
                                    value: _money(durationUpgradeCost),
                                  ),
                                  _DetailRow(
                                    label: 'Need to pay now',
                                    value: _money(upgradeTotalCost),
                                  ),
                                  _DetailRow(
                                    label: 'New total budget',
                                    value: _money(projectedBudget),
                                  ),
                                ],
                              ),
                            ),
                            if (_upgradeError != null) ...[
                              const SizedBox(height: 8),
                              Text(
                                _upgradeError!,
                                style: const TextStyle(color: Colors.redAccent),
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
                                  foregroundColor: const Color(0xFF041325),
                                ),
                                child: Text(
                                  _creatingUpgradeCheckout
                                      ? 'Creating checkout...'
                                      : 'Pay with Stripe',
                                ),
                              ),
                            ),
                            const SizedBox(height: 14),
                            const Divider(color: Color(0xFF1E2D48), height: 1),
                            const SizedBox(height: 14),
                            const Text(
                              'Lifecycle Management',
                              style: TextStyle(
                                color: textPrimary,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            const SizedBox(height: 6),
                            const Text(
                              'Hide the campaign temporarily or reopen it when delivery should resume.',
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
                                              title: 'Hide this campaign?',
                                              body:
                                                  'All reposts of this ads post will be removed. Before removal, all repost likes and views will be merged into the original ads post.',
                                              confirmLabel: 'Confirm hide',
                                            ),
                                      style: OutlinedButton.styleFrom(
                                        side: const BorderSide(
                                          color: Color(0xFF355A88),
                                        ),
                                        foregroundColor: const Color(
                                          0xFFBFD5F3,
                                        ),
                                      ),
                                      child: const Text('Hide Campaign'),
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
                                              title: 'Reopen this campaign?',
                                              body:
                                                  detail
                                                      .actions
                                                      .requiresExtendBeforeResume
                                                  ? 'This campaign has expired. Purchase an extension package first, then confirm reopen.'
                                                  : 'The campaign will resume delivery with the latest settings.',
                                              confirmLabel: 'Confirm reopen',
                                            ),
                                      style: ElevatedButton.styleFrom(
                                        backgroundColor: accent,
                                        foregroundColor: const Color(
                                          0xFF041325,
                                        ),
                                      ),
                                      child: const Text('Reopen Campaign'),
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
                        Text(
                          _error!,
                          style: const TextStyle(color: Colors.redAccent),
                        ),
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
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      decoration: BoxDecoration(
        color: const Color(0xFF111827),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFF1E2D48)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  title,
                  style: const TextStyle(
                    color: Color(0xFFE8ECF8),
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
    return Container(
      padding: const EdgeInsets.fromLTRB(10, 10, 10, 10),
      decoration: BoxDecoration(
        color: const Color(0xFF0F1B33),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: const Color(0xFF20365A)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(color: Color(0xFF7A8BB0), fontSize: 11),
          ),
          const SizedBox(height: 5),
          Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: Color(0xFFE8ECF8),
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
    return Container(
      padding: const EdgeInsets.fromLTRB(10, 10, 10, 10),
      decoration: BoxDecoration(
        color: const Color(0xFF0F1B33),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: const Color(0xFF20365A)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(color: Color(0xFF7A8BB0), fontSize: 11),
          ),
          const SizedBox(height: 4),
          Text(
            value,
            style: const TextStyle(
              color: Color(0xFFE8ECF8),
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
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 132,
            child: Text(
              label,
              style: const TextStyle(color: Color(0xFF7A8BB0), fontSize: 12),
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
    const textPrimary = Color(0xFFE8ECF8);
    const textSecondary = Color(0xFF7A8BB0);

    return Container(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.92,
      ),
      decoration: const BoxDecoration(
        color: Color(0xFF111827),
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
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
                  const Expanded(
                    child: Text(
                      'Edit Campaign Details',
                      style: TextStyle(
                        color: textPrimary,
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  IconButton(
                    onPressed: loading ? null : onClose,
                    icon: const Icon(Icons.close_rounded, color: textPrimary),
                  ),
                ],
              ),
              _EditField(
                label: 'Campaign name',
                child: TextField(
                  controller: TextEditingController(text: draft.campaignName)
                    ..selection = TextSelection.fromPosition(
                      TextPosition(offset: draft.campaignName.length),
                    ),
                  onChanged: (v) =>
                      onDraftChanged(draft.copyWith(campaignName: v)),
                  style: const TextStyle(color: textPrimary),
                  decoration: _editInputDecoration(),
                ),
              ),
              _EditField(
                label: 'Objective',
                helper: 'Objective is locked after campaign creation.',
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
                label: 'Ad format',
                helper: 'Ad format is locked after campaign creation.',
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
                label: 'Primary text',
                child: TextField(
                  controller: TextEditingController(text: draft.primaryText)
                    ..selection = TextSelection.fromPosition(
                      TextPosition(offset: draft.primaryText.length),
                    ),
                  onChanged: (v) =>
                      onDraftChanged(draft.copyWith(primaryText: v)),
                  minLines: 3,
                  maxLines: 6,
                  style: const TextStyle(color: textPrimary),
                  decoration: _editInputDecoration(),
                ),
              ),
              _EditField(
                label: 'Headline',
                child: TextField(
                  controller: TextEditingController(text: draft.headline)
                    ..selection = TextSelection.fromPosition(
                      TextPosition(offset: draft.headline.length),
                    ),
                  onChanged: (v) => onDraftChanged(draft.copyWith(headline: v)),
                  style: const TextStyle(color: textPrimary),
                  decoration: _editInputDecoration(),
                ),
              ),
              _EditField(
                label: 'CTA',
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
                label: 'Description',
                child: TextField(
                  controller: TextEditingController(text: draft.adDescription)
                    ..selection = TextSelection.fromPosition(
                      TextPosition(offset: draft.adDescription.length),
                    ),
                  onChanged: (v) =>
                      onDraftChanged(draft.copyWith(adDescription: v)),
                  style: const TextStyle(color: textPrimary),
                  decoration: _editInputDecoration(),
                ),
              ),
              _EditField(
                label: 'Destination URL',
                child: TextField(
                  controller: TextEditingController(text: draft.destinationUrl)
                    ..selection = TextSelection.fromPosition(
                      TextPosition(offset: draft.destinationUrl.length),
                    ),
                  onChanged: (v) =>
                      onDraftChanged(draft.copyWith(destinationUrl: v)),
                  style: const TextStyle(color: textPrimary),
                  decoration: _editInputDecoration(hint: 'https://'),
                ),
              ),
              _EditField(
                label: 'Location',
                helper: 'Location cannot be edited after ad creation.',
                child: TextField(
                  enabled: false,
                  controller: TextEditingController(text: draft.locationText),
                  style: const TextStyle(color: textSecondary),
                  decoration: _editInputDecoration(),
                ),
              ),
              _EditField(
                label: 'Age range',
                helper: 'Age range cannot be edited after ad creation.',
                child: Row(
                  children: [
                    Expanded(
                      child: TextField(
                        enabled: false,
                        controller: TextEditingController(text: draft.ageMin),
                        style: const TextStyle(color: Color(0xFF607091)),
                        decoration: _editInputDecoration(),
                      ),
                    ),
                    const Padding(
                      padding: EdgeInsets.symmetric(horizontal: 8),
                      child: Text('to', style: TextStyle(color: textSecondary)),
                    ),
                    Expanded(
                      child: TextField(
                        enabled: false,
                        controller: TextEditingController(text: draft.ageMax),
                        style: const TextStyle(color: Color(0xFF607091)),
                        decoration: _editInputDecoration(),
                      ),
                    ),
                  ],
                ),
              ),
              _EditField(
                label: 'Interests',
                child: Column(
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: interestCtrl,
                            style: const TextStyle(color: textPrimary),
                            decoration: _editInputDecoration(
                              hint: 'Type interest and click Add',
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        TextButton(
                          onPressed: onAddInterest,
                          style: TextButton.styleFrom(
                            backgroundColor: const Color(0xFF1A2E4B),
                            foregroundColor: const Color(0xFFBFD5F3),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(10),
                            ),
                            padding: const EdgeInsets.symmetric(
                              horizontal: 14,
                              vertical: 11,
                            ),
                          ),
                          child: const Text('Add'),
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
                              backgroundColor: const Color(0xFF1A2E4B),
                              side: const BorderSide(color: Color(0xFF2A4C77)),
                              labelStyle: const TextStyle(
                                color: Color(0xFFBFD5F3),
                              ),
                              deleteIconColor: const Color(0xFF9FC6F0),
                            ),
                          )
                          .toList(),
                    ),
                  ],
                ),
              ),
              _EditField(
                label: 'Creative media',
                helper: mediaEditLocked
                    ? 'Media is locked because unique views exceeded 100.'
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
                          foregroundColor: const Color(0xFFBFD5F3),
                          backgroundColor: const Color(0xFF12213D),
                          side: const BorderSide(color: Color(0xFF2A4C77)),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                          padding: const EdgeInsets.symmetric(
                            horizontal: 14,
                            vertical: 11,
                          ),
                        ),
                        child: Text(
                          uploadingMedia ? 'Uploading...' : 'Choose files',
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
                                      color: const Color(0xFF0F1B33),
                                      borderRadius: BorderRadius.circular(10),
                                      border: Border.all(
                                        color: const Color(0xFF20365A),
                                      ),
                                    ),
                                    child: ClipRRect(
                                      borderRadius: BorderRadius.circular(9),
                                      child: url.toLowerCase().contains('.mp4')
                                          ? const Icon(
                                              Icons.play_circle_outline_rounded,
                                              color: Color(0xFFBFD5F3),
                                              size: 26,
                                            )
                                          : Image.network(
                                              url,
                                              fit: BoxFit.contain,
                                              errorBuilder: (_, __, ___) =>
                                                  const Icon(
                                                    Icons.broken_image_rounded,
                                                    color: Color(0xFFBFD5F3),
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
                                      foregroundColor: const Color(0xFFFCA5A5),
                                      minimumSize: const Size(0, 28),
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 8,
                                      ),
                                    ),
                                    child: const Text('Remove'),
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
                  child: Text(
                    error!,
                    style: const TextStyle(color: Colors.redAccent),
                  ),
                ),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: loading ? null : onClose,
                      style: OutlinedButton.styleFrom(
                        foregroundColor: const Color(0xFFBFD5F3),
                        backgroundColor: const Color(0xFF12213D),
                        side: const BorderSide(color: Color(0xFF2A4C77)),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                      child: const Text('Cancel'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: ElevatedButton(
                      onPressed: (!hasChanges || loading || uploadingMedia)
                          ? null
                          : onSave,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF1B3A63),
                        foregroundColor: const Color(0xFFDDEBFF),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                        padding: const EdgeInsets.symmetric(vertical: 12),
                      ),
                      child: Text(loading ? 'Saving...' : 'Save changes'),
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

  InputDecoration _editInputDecoration({String? hint}) {
    return InputDecoration(
      hintText: hint,
      hintStyle: const TextStyle(color: Color(0xFF607091)),
      filled: true,
      fillColor: const Color(0xFF131F36),
      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: Color(0xFF1E2D48)),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: Color(0xFF1E2D48)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: Color(0xFF4AA3E4)),
      ),
      disabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: Color(0xFF1E2D48)),
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
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(
              color: Color(0xFFE8ECF8),
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
              style: const TextStyle(color: Color(0xFF7A8BB0), fontSize: 11.5),
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
                  color: selected == value
                      ? const Color(0xFF21456F)
                      : const Color(0xFF13203A),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: selected == value
                        ? const Color(0xFF4B78A8)
                        : const Color(0xFF254269),
                  ),
                ),
                child: Text(
                  value,
                  style: TextStyle(
                    color: enabled
                        ? (selected == value
                              ? const Color(0xFFEAF3FF)
                              : const Color(0xFFD5E2F6))
                        : const Color(0xFF8DA2C8),
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
              color: selected
                  ? const Color(0xFF183056)
                  : const Color(0xFF12213D),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                color: selected
                    ? const Color(0xFF62A5E4)
                    : const Color(0xFF26466F),
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
                            style: const TextStyle(
                              color: Color(0xFFE8ECF8),
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
                                color: const Color(0xFF0F3A63),
                                borderRadius: BorderRadius.circular(999),
                              ),
                              child: Text(
                                highlight!,
                                style: const TextStyle(
                                  color: Color(0xFFA7D3FF),
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
                        style: const TextStyle(
                          color: Color(0xFF8DA2C8),
                          fontSize: 12,
                        ),
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
                      style: const TextStyle(
                        color: Color(0xFFE8ECF8),
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      selected ? 'Selected' : 'Tap to choose',
                      style: TextStyle(
                        color: selected
                            ? const Color(0xFF9FCAF2)
                            : const Color(0xFF6A84AC),
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
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: disabled ? null : onTap,
      child: Opacity(
        opacity: disabled ? 0.56 : 1,
        child: Container(
          width: 150,
          padding: const EdgeInsets.fromLTRB(10, 10, 10, 10),
          decoration: BoxDecoration(
            color: selected ? const Color(0xFF173055) : const Color(0xFF12213D),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: selected
                  ? const Color(0xFF62A5E4)
                  : const Color(0xFF26466F),
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: const TextStyle(
                  color: Color(0xFFE8ECF8),
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                priceLabel,
                style: const TextStyle(color: Color(0xFFA8BEDF), fontSize: 12),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
