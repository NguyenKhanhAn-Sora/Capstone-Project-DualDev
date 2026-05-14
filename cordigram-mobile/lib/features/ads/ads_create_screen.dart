import 'dart:io';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_web_auth_2/flutter_web_auth_2.dart';
import 'package:http/http.dart' as http;
import 'package:image_picker/image_picker.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/config/app_config.dart';
import '../../core/config/app_theme.dart';
import '../../core/services/api_service.dart';
import '../../core/services/auth_storage.dart';
import '../../core/services/language_controller.dart';
import 'ads_dashboard_screen.dart';
import 'ads_payment_status_screen.dart';
import 'ads_service.dart';

AppSemanticColors _appTokens(BuildContext context) {
  final theme = Theme.of(context);
  return theme.extension<AppSemanticColors>() ??
      (theme.brightness == Brightness.dark
          ? AppSemanticColors.dark
          : AppSemanticColors.light);
}

enum _Objective { awareness, traffic, engagement, leads, sales, messages }

enum _AdFormat { single, carousel, video }

enum _Cta { learnMore, shopNow, signUp, bookNow, contactUs }

class _BoostPackage {
  const _BoostPackage({
    required this.id,
    required this.title,
    required this.price,
  });

  final String id;
  final String title;
  final int price;
}

class _DurationPackage {
  const _DurationPackage({
    required this.id,
    required this.days,
    required this.price,
  });

  final String id;
  final int days;
  final int price;
}

class AdsCreateScreen extends StatefulWidget {
  const AdsCreateScreen({super.key});

  @override
  State<AdsCreateScreen> createState() => _AdsCreateScreenState();
}

class _AdsCreateScreenState extends State<AdsCreateScreen> {
  static const List<String> _fallbackCountries = [
    'United States',
    'United Kingdom',
    'Canada',
    'Australia',
    'Germany',
    'France',
    'Italy',
    'Spain',
    'Netherlands',
    'Sweden',
    'Norway',
    'Denmark',
    'Switzerland',
    'Japan',
    'South Korea',
    'Singapore',
    'India',
    'Indonesia',
    'Thailand',
    'Malaysia',
    'Vietnam',
    'Philippines',
    'China',
    'Brazil',
    'Mexico',
    'Argentina',
    'Chile',
    'Colombia',
    'South Africa',
    'United Arab Emirates',
    'Saudi Arabia',
    'Turkey',
    'Egypt',
    'New Zealand',
    'Ireland',
  ];

  static const List<_BoostPackage> _boosts = [
    _BoostPackage(id: 'light', title: 'Light Boost', price: 79000),
    _BoostPackage(id: 'standard', title: 'Standard Boost', price: 149000),
    _BoostPackage(id: 'strong', title: 'Strong Boost', price: 299000),
  ];

  static const List<_DurationPackage> _durations = [
    _DurationPackage(id: 'd3', days: 3, price: 29000),
    _DurationPackage(id: 'd7', days: 7, price: 59000),
    _DurationPackage(id: 'd14', days: 14, price: 99000),
    _DurationPackage(id: 'd30', days: 30, price: 179000),
  ];

  final _campaignNameCtrl = TextEditingController(
    text: 'Student Promotion Campaign',
  );
  final _primaryTextCtrl = TextEditingController(
    text:
        'Upgrade your setup with our newest collection. Limited launch offer available now.',
  );
  final _headlineCtrl = TextEditingController(
    text: 'Launch Offer - Save 30% Today',
  );
  final _descriptionCtrl = TextEditingController(
    text: 'Premium quality products with fast nationwide shipping.',
  );
  final _destinationCtrl = TextEditingController(text: 'https://example.com');
  final _locationCtrl = TextEditingController(text: 'Vietnam');
  final _interestCtrl = TextEditingController();

  final ImagePicker _picker = ImagePicker();
  final List<String> _interests = ['Technology', 'Online Shopping'];
  final List<File> _pickedFiles = [];
  final List<AdsUploadResult> _uploadedMedia = [];

  _Objective _objective = _Objective.traffic;
  _AdFormat _adFormat = _AdFormat.single;
  _Cta _cta = _Cta.shopNow;
  String _boostId = 'standard';
  String _durationId = 'd7';
  int _ageMin = 18;
  int _ageMax = 35;

  bool _uploading = false;
  bool _submitting = false;
  String? _error;
  String? _previewDisplayName;
  String? _previewUsername;
  String? _previewAvatarUrl;
  bool _countriesLoading = true;
  List<String> _countryOptions = _fallbackCountries;

  _BoostPackage get _selectedBoost =>
      _boosts.firstWhere((e) => e.id == _boostId);
  _DurationPackage get _selectedDuration =>
      _durations.firstWhere((e) => e.id == _durationId);

  @override
  void initState() {
    super.initState();
    _campaignNameCtrl.addListener(_onPreviewChanged);
    _primaryTextCtrl.addListener(_onPreviewChanged);
    _headlineCtrl.addListener(_onPreviewChanged);
    _descriptionCtrl.addListener(_onPreviewChanged);
    _loadPreviewProfile();
    _loadPopularCountries();
  }

  void _onPreviewChanged() {
    if (!mounted) return;
    setState(() {});
  }

  Future<void> _loadPreviewProfile() async {
    final token = AuthStorage.accessToken;
    if (token == null || token.isEmpty) return;

    try {
      final data = await ApiService.get(
        '/profiles/me',
        extraHeaders: {'Authorization': 'Bearer $token'},
      );
      if (!mounted) return;
      setState(() {
        _previewDisplayName = data['displayName'] as String?;
        _previewUsername = data['username'] as String?;
        _previewAvatarUrl = data['avatarUrl'] as String?;
      });
    } catch (_) {
      // Keep fallback values for preview.
    }
  }

  Future<void> _loadPopularCountries() async {
    try {
      setState(() => _countriesLoading = true);
      final response = await http
          .get(
            Uri.parse(
              'https://restcountries.com/v3.1/all?fields=name,population,region',
            ),
          )
          .timeout(const Duration(seconds: 15));

      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw Exception('Failed to fetch countries');
      }

      final rows = jsonDecode(response.body) as List<dynamic>;
      final list =
          rows
              .whereType<Map<String, dynamic>>()
              .map((item) {
                final nameObj = item['name'];
                final region = item['region'];
                String name = '';
                if (nameObj is Map<String, dynamic>) {
                  name = (nameObj['common'] as String?)?.trim() ?? '';
                }
                final population = item['population'] is num
                    ? (item['population'] as num).toInt()
                    : 0;
                return (
                  name: name,
                  population: population,
                  region: region is String ? region : '',
                );
              })
              .where(
                (item) => item.name.isNotEmpty && item.region != 'Antarctic',
              )
              .toList()
            ..sort((a, b) => b.population.compareTo(a.population));

      final picked = list.take(45).map((e) => e.name).toSet().toList()
        ..sort((a, b) => a.toLowerCase().compareTo(b.toLowerCase()));

      if (!mounted) return;
      setState(() {
        _countryOptions = picked.isEmpty ? _fallbackCountries : picked;
        _countriesLoading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _countryOptions = _fallbackCountries;
        _countriesLoading = false;
      });
    }
  }

  @override
  void dispose() {
    _campaignNameCtrl.removeListener(_onPreviewChanged);
    _primaryTextCtrl.removeListener(_onPreviewChanged);
    _headlineCtrl.removeListener(_onPreviewChanged);
    _descriptionCtrl.removeListener(_onPreviewChanged);
    _campaignNameCtrl.dispose();
    _primaryTextCtrl.dispose();
    _headlineCtrl.dispose();
    _descriptionCtrl.dispose();
    _destinationCtrl.dispose();
    _locationCtrl.dispose();
    _interestCtrl.dispose();
    super.dispose();
  }

  String _objectiveValue(_Objective v) => v.name;
  String _adFormatValue(_AdFormat v) => v.name;

  String _objectiveLabel(_Objective v) {
    final lc = LanguageController.instance;
    switch (v) {
      case _Objective.awareness: return lc.t('ads.create.objectiveAwareness');
      case _Objective.traffic:   return lc.t('ads.create.objectiveTraffic');
      case _Objective.engagement: return lc.t('ads.create.objectiveEngagement');
      case _Objective.leads:     return lc.t('ads.create.objectiveLeads');
      case _Objective.sales:     return lc.t('ads.create.objectiveSales');
      case _Objective.messages:  return lc.t('ads.create.objectiveMessages');
    }
  }

  String _ctaValue(_Cta value) {
    switch (value) {
      case _Cta.learnMore:
        return 'Learn More';
      case _Cta.shopNow:
        return 'Shop Now';
      case _Cta.signUp:
        return 'Sign Up';
      case _Cta.bookNow:
        return 'Book Now';
      case _Cta.contactUs:
        return 'Contact Us';
    }
  }

  int get _totalBudget {
    final boost = _selectedBoost.price;
    final duration = _selectedDuration.price;
    return boost + duration;
  }

  Future<void> _pickMedia() async {
    setState(() => _error = null);
    if (_adFormat == _AdFormat.video) {
      final x = await _picker.pickVideo(source: ImageSource.gallery);
      if (x == null) return;
      final picked = [File(x.path)];
      await _replaceAndUploadPickedMedia(picked);
      return;
    }

    if (_adFormat == _AdFormat.single) {
      final x = await _picker.pickImage(
        source: ImageSource.gallery,
        imageQuality: 85,
      );
      if (x == null) return;
      final picked = [File(x.path)];
      await _replaceAndUploadPickedMedia(picked);
      return;
    }

    final picked = await _picker.pickMultiImage(limit: 5, imageQuality: 85);
    if (picked.isEmpty) return;
    await _replaceAndUploadPickedMedia(
      picked.take(5).map((x) => File(x.path)).toList(),
    );
  }

  Future<void> _replaceAndUploadPickedMedia(List<File> files) async {
    if (files.isEmpty) {
      setState(() => _error = LanguageController.instance.t('ads.create.validationSelectMedia'));
      return;
    }

    setState(() {
      _uploading = true;
      _error = null;
      _pickedFiles
        ..clear()
        ..addAll(files);
      _uploadedMedia.clear();
    });

    try {
      for (final file in files) {
        final uploaded = await AdsService.uploadMedia(file);
        _uploadedMedia.add(uploaded);
      }
      if (!mounted) return;
      setState(() => _uploading = false);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _uploading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = LanguageController.instance.t('ads.create.uploadError');
        _uploading = false;
      });
    }
  }

  void _removePickedMediaAt(int index) {
    if (index < 0 || index >= _pickedFiles.length) return;
    setState(() {
      _pickedFiles.removeAt(index);
      if (index < _uploadedMedia.length) {
        _uploadedMedia.removeAt(index);
      }
    });
  }

  bool _validate() {
    final p = _primaryTextCtrl.text.trim();
    final h = _headlineCtrl.text.trim();
    final u = _destinationCtrl.text.trim();

    if (p.isEmpty) {
      setState(() => _error = LanguageController.instance.t('ads.create.validationPrimaryText'));
      return false;
    }
    if (h.isEmpty) {
      setState(() => _error = LanguageController.instance.t('ads.create.validationHeadline'));
      return false;
    }
    if (u.isEmpty) {
      setState(() => _error = LanguageController.instance.t('ads.create.validationDestinationUrl'));
      return false;
    }

    final parsed = Uri.tryParse(u);
    final ok =
        parsed != null && (parsed.scheme == 'http' || parsed.scheme == 'https');
    if (!ok) {
      setState(
        () => _error = LanguageController.instance.t('ads.create.validationDestinationUrlFormat'),
      );
      return false;
    }

    if (_uploadedMedia.isEmpty) {
      setState(() => _error = LanguageController.instance.t('ads.create.validationMediaRequired'));
      return false;
    }

    return true;
  }

  Future<void> _startCheckout() async {
    if (_submitting) return;
    if (!_validate()) return;

    final acceptedTerms = await _showStripeConfirmPaymentDialog();
    if (acceptedTerms != true) return;

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      final promotedPostId = await AdsService.createAdCreativePost(
        primaryText: _primaryTextCtrl.text,
        headline: _headlineCtrl.text,
        description: _descriptionCtrl.text,
        destinationUrl: _destinationCtrl.text,
        cta: _ctaValue(_cta),
        uploadedMedia: _uploadedMedia,
      );

      final durationDays = _durations
          .firstWhere((e) => e.id == _durationId)
          .days;
      final boostTitle = _boosts.firstWhere((e) => e.id == _boostId).title;

      final checkout = await AdsService.createStripeCheckoutSession(
        amount: _totalBudget,
        campaignName: _campaignNameCtrl.text.trim().isEmpty
            ? 'Cordigram Ads Campaign'
            : _campaignNameCtrl.text.trim(),
        description: '$boostTitle + $durationDays days',
        objective: _objectiveValue(_objective),
        adFormat: _adFormatValue(_adFormat),
        boostPackageId: _boostId,
        durationPackageId: _durationId,
        promotedPostId: promotedPostId,
        primaryText: _primaryTextCtrl.text.trim(),
        headline: _headlineCtrl.text.trim(),
        adDescription: _descriptionCtrl.text.trim(),
        destinationUrl: _destinationCtrl.text.trim(),
        cta: _ctaValue(_cta),
        interests: _interests.where((e) => e.trim().isNotEmpty).toList(),
        locationText: _locationCtrl.text.trim(),
        ageMin: _ageMin,
        ageMax: _ageMax,
        mediaUrls: _uploadedMedia
            .map(
              (item) => item.secureUrl.isNotEmpty ? item.secureUrl : item.url,
            )
            .where((e) => e.isNotEmpty)
            .toList(),
      );

      final checkoutUrl = checkout.url;
      if (checkout.id.isEmpty || checkoutUrl == null || checkoutUrl.isEmpty) {
        throw const ApiException('Unable to create Stripe checkout session.');
      }

      final checkoutStartedAtMs = DateTime.now().millisecondsSinceEpoch;

      final callbackUrl = await FlutterWebAuth2.authenticate(
        url: checkoutUrl,
        callbackUrlScheme: 'cordigram',
      );

      if (callbackUrl.isEmpty) {
        throw const ApiException('Did not receive payment callback.');
      }

      if (!mounted) return;
      final result = await Navigator.of(context).push<bool>(
        MaterialPageRoute(
          builder: (_) => AdsPaymentStatusScreen(
            sessionId: checkout.id,
            checkoutStartedAtMs: checkoutStartedAtMs,
          ),
        ),
      );

      if (!mounted) return;
      if (result == true) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(LanguageController.instance.t('ads.create.paymentVerified')),
            backgroundColor: const Color(0xFF1E7F54),
          ),
        );
        await Navigator.of(context).pushAndRemoveUntil(
          MaterialPageRoute(builder: (_) => const AdsDashboardScreen()),
          (route) => route.isFirst,
        );
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(LanguageController.instance.t('ads.create.paymentNotConfirmed')),
            backgroundColor: const Color(0xFF8B2D34),
          ),
        );
      }
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = LanguageController.instance.t('ads.create.errorCheckout'));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  String _formatVndSymbol(int value) {
    return 'đ${_formatVnd(value).replaceAll(' VND', '')}';
  }

  Future<void> _openTermsPage() async {
    final uri = Uri.parse('${AppConfig.webBaseUrl}/terms');
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  Future<bool?> _showStripeConfirmPaymentDialog() {
    var accepted = false;

    return showDialog<bool>(
      context: context,
      barrierDismissible: !_submitting,
      builder: (dialogContext) {
        return StatefulBuilder(
          builder: (context, setLocalState) {
            return Dialog(
              backgroundColor: const Color(0xFF081734),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(18),
                side: BorderSide(
                  color: const Color(0xFF1D4E7C).withValues(alpha: 0.6),
                ),
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
                          child: Text(
                            LanguageController.instance.t('ads.create.paymentDialogTitle'),
                            style: const TextStyle(
                              color: Color(0xFFE8ECF8),
                              fontSize: 28,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                        InkWell(
                          borderRadius: BorderRadius.circular(999),
                          onTap: () => Navigator.of(dialogContext).pop(false),
                          child: Container(
                            width: 36,
                            height: 36,
                            decoration: BoxDecoration(
                              color: const Color(0xFF263956),
                              borderRadius: BorderRadius.circular(999),
                            ),
                            child: const Icon(
                              Icons.close_rounded,
                              color: Color(0xFFD7E6FF),
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    Text(
                      LanguageController.instance.t('ads.create.paymentDialogBody'),
                      style: const TextStyle(color: Color(0xFFA9B9D4), fontSize: 13),
                    ),
                    const SizedBox(height: 12),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
                      decoration: BoxDecoration(
                        color: const Color(0xFF0F2A4D),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: const Color(0xFF2A6A9A).withValues(alpha: 0.7),
                        ),
                      ),
                      child: Column(
                        children: [
                          _InvoiceLine(
                            label: LanguageController.instance.t('ads.create.invoiceBoost'),
                            value:
                                '${_selectedBoost.title} • ${_formatVndSymbol(_selectedBoost.price)}',
                          ),
                          const SizedBox(height: 6),
                          _InvoiceLine(
                            label: LanguageController.instance.t('ads.create.invoiceDuration'),
                            value: LanguageController.instance.t('ads.create.invoiceDurationValue', {'days': _selectedDuration.days, 'price': _formatVndSymbol(_selectedDuration.price)}),
                          ),
                          const Padding(
                            padding: EdgeInsets.symmetric(vertical: 10),
                            child: Divider(color: Color(0xFF2A5D87), height: 1),
                          ),
                          _InvoiceLine(
                            label: LanguageController.instance.t('ads.create.invoiceTotal'),
                            value: _formatVndSymbol(_totalBudget),
                            emphasis: true,
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 10),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Checkbox(
                          value: accepted,
                          visualDensity: VisualDensity.compact,
                          side: const BorderSide(color: Color(0xFF7CA5CE)),
                          activeColor: const Color(0xFF31C3E8),
                          onChanged: (value) {
                            setLocalState(() {
                              accepted = value == true;
                            });
                          },
                        ),
                        Expanded(
                          child: Padding(
                            padding: const EdgeInsets.only(top: 10),
                            child: RichText(
                              text: TextSpan(
                                style: const TextStyle(
                                  color: Color(0xFFAFC0DA),
                                  fontSize: 13,
                                  height: 1.3,
                                ),
                                children: [
                                  TextSpan(text: '${LanguageController.instance.t('ads.create.termsAgree')} '),
                                  WidgetSpan(
                                    alignment: PlaceholderAlignment.baseline,
                                    baseline: TextBaseline.alphabetic,
                                    child: GestureDetector(
                                      onTap: _openTermsPage,
                                      child: Text(
                                        LanguageController.instance.t('ads.create.termsTerm'),
                                        style: const TextStyle(
                                          color: Color(0xFF7FD8FF),
                                          fontSize: 13,
                                          fontWeight: FontWeight.w700,
                                          decoration: TextDecoration.underline,
                                          decorationColor: Color(0xFF7FD8FF),
                                        ),
                                      ),
                                    ),
                                  ),
                                  TextSpan(
                                    text: ' ${LanguageController.instance.t('ads.create.termsAnd')}',
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.end,
                      children: [
                        TextButton(
                          onPressed: () =>
                              Navigator.of(dialogContext).pop(false),
                          style: TextButton.styleFrom(
                            foregroundColor: const Color(0xFFD4E0F3),
                            backgroundColor: const Color(0xFF0D2343),
                            padding: const EdgeInsets.symmetric(
                              horizontal: 18,
                              vertical: 12,
                            ),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                              side: BorderSide(
                                color: const Color(
                                  0xFF2A4C77,
                                ).withValues(alpha: 0.8),
                              ),
                            ),
                          ),
                          child: Text(
                            LanguageController.instance.t('ads.create.backBtn'),
                            style: const TextStyle(fontWeight: FontWeight.w700),
                          ),
                        ),
                        const SizedBox(width: 10),
                        ElevatedButton(
                          onPressed: accepted
                              ? () => Navigator.of(dialogContext).pop(true)
                              : null,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF3BC7E8),
                            disabledBackgroundColor: const Color(0xFF2C5D77),
                            foregroundColor: const Color(0xFF062137),
                            disabledForegroundColor: const Color(0xFF89A6BC),
                            padding: const EdgeInsets.symmetric(
                              horizontal: 18,
                              vertical: 12,
                            ),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                          ),
                          child: Text(
                            LanguageController.instance.t('ads.create.payWithStripe'),
                            style: const TextStyle(fontWeight: FontWeight.w700),
                          ),
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

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final tokens = _appTokens(context);
    final textPrimary = tokens.text;
    final textSecondary = tokens.textMuted;

    return Scaffold(
      backgroundColor: theme.scaffoldBackgroundColor,
      appBar: AppBar(
        backgroundColor: scheme.surface,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        iconTheme: IconThemeData(color: scheme.onSurface),
        title: Text(
          LanguageController.instance.t('ads.create.appBar'),
          style: TextStyle(color: scheme.onSurface),
        ),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
          child: Column(
            children: [
              _Card(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _Heading(LanguageController.instance.t('ads.create.sectionObjective')),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: _Objective.values
                          .map(
                            (v) => _SelectablePill(
                              label: _objectiveLabel(v),
                              selected: _objective == v,
                              onTap: () => setState(() => _objective = v),
                            ),
                          )
                          .toList(),
                    ),
                    const SizedBox(height: 14),
                    _Heading(LanguageController.instance.t('ads.create.sectionCampaignName')),
                    _Input(controller: _campaignNameCtrl),
                    const SizedBox(height: 14),
                    const SizedBox(height: 14),
                    _Heading(LanguageController.instance.t('ads.create.sectionPrimaryText')),
                    _Input(
                      controller: _primaryTextCtrl,
                      minLines: 3,
                      maxLines: 6,
                    ),
                    const SizedBox(height: 12),
                    _Heading(LanguageController.instance.t('ads.create.sectionHeadline')),
                    _Input(controller: _headlineCtrl),
                    const SizedBox(height: 12),
                    _Heading(LanguageController.instance.t('ads.create.sectionDescription')),
                    _Input(
                      controller: _descriptionCtrl,
                      minLines: 2,
                      maxLines: 4,
                    ),
                    const SizedBox(height: 12),
                    _Heading(LanguageController.instance.t('ads.create.sectionDestinationUrl')),
                    _Input(controller: _destinationCtrl),
                    const SizedBox(height: 12),
                    _Heading(LanguageController.instance.t('ads.create.sectionCta')),
                    DropdownButtonFormField<_Cta>(
                      value: _cta,
                      decoration: _fieldDecoration(context),
                      dropdownColor: tokens.panelMuted,
                      style: TextStyle(color: tokens.text),
                      items: _Cta.values
                          .map(
                            (v) => DropdownMenuItem(
                              value: v,
                              child: Text(_ctaValue(v)),
                            ),
                          )
                          .toList(),
                      onChanged: (v) {
                        if (v != null) setState(() => _cta = v);
                      },
                    ),
                    const SizedBox(height: 14),
                    _Heading(LanguageController.instance.t('ads.create.sectionAdFormat')),
                    Row(
                      children: [
                        Expanded(
                          child: _FormatTab(
                            label: LanguageController.instance.t('ads.create.formatSingleImage'),
                            selected: _adFormat == _AdFormat.single,
                            onTap: () {
                              setState(() {
                                _adFormat = _AdFormat.single;
                                _pickedFiles.clear();
                                _uploadedMedia.clear();
                              });
                            },
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: _FormatTab(
                            label: LanguageController.instance.t('ads.create.formatCarousel'),
                            selected: _adFormat == _AdFormat.carousel,
                            onTap: () {
                              setState(() {
                                _adFormat = _AdFormat.carousel;
                                _pickedFiles.clear();
                                _uploadedMedia.clear();
                              });
                            },
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: _FormatTab(
                            label: LanguageController.instance.t('ads.create.formatVideo'),
                            selected: _adFormat == _AdFormat.video,
                            onTap: () {
                              setState(() {
                                _adFormat = _AdFormat.video;
                                _pickedFiles.clear();
                                _uploadedMedia.clear();
                              });
                            },
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    SizedBox(
                      width: double.infinity,
                      child: OutlinedButton.icon(
                        onPressed: _uploading ? null : _pickMedia,
                        style: OutlinedButton.styleFrom(
                          side: BorderSide(color: tokens.panelBorder),
                          foregroundColor: tokens.text,
                          backgroundColor: tokens.panel,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                          padding: const EdgeInsets.symmetric(vertical: 12),
                        ),
                        icon: _uploading
                            ? const SizedBox(
                                width: 14,
                                height: 14,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                ),
                              )
                            : const Icon(Icons.photo_library_outlined),
                        label: Text(_uploading
                            ? LanguageController.instance.t('ads.create.uploading')
                            : LanguageController.instance.t('ads.create.pickMedia')),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      LanguageController.instance.t('ads.create.mediaCounter', {'picked': _pickedFiles.length, 'uploaded': _uploadedMedia.length}),
                      style: TextStyle(color: textSecondary, fontSize: 12),
                    ),
                    if (_pickedFiles.isNotEmpty) ...[
                      const SizedBox(height: 10),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: List.generate(_pickedFiles.length, (index) {
                          final isVideo = _adFormat == _AdFormat.video;
                          return Stack(
                            clipBehavior: Clip.none,
                            children: [
                              Container(
                                width: 72,
                                height: 72,
                                decoration: BoxDecoration(
                                  color: tokens.panel,
                                  borderRadius: BorderRadius.circular(10),
                                  border: Border.all(color: tokens.panelBorder),
                                ),
                                child: ClipRRect(
                                  borderRadius: BorderRadius.circular(9),
                                  child: isVideo
                                      ? Center(
                                          child: Icon(
                                            Icons.play_circle_outline_rounded,
                                            color: textSecondary,
                                            size: 26,
                                          ),
                                        )
                                      : Image.file(
                                          _pickedFiles[index],
                                          fit: BoxFit.cover,
                                        ),
                                ),
                              ),
                              Positioned(
                                right: -6,
                                top: -6,
                                child: GestureDetector(
                                  onTap: () => _removePickedMediaAt(index),
                                  child: Container(
                                    width: 22,
                                    height: 22,
                                    decoration: BoxDecoration(
                                      color: const Color(0xFF8B1E2C),
                                      borderRadius: BorderRadius.circular(999),
                                      border: Border.all(
                                        color: const Color(0xFFCD4457),
                                      ),
                                    ),
                                    child: const Icon(
                                      Icons.close_rounded,
                                      size: 14,
                                      color: Color(0xFFFCE8EC),
                                    ),
                                  ),
                                ),
                              ),
                            ],
                          );
                        }),
                      ),
                    ],
                    const SizedBox(height: 14),
                    _Heading(LanguageController.instance.t('ads.create.sectionAdPreview')),
                    _AdPreviewCard(
                      campaignName: _campaignNameCtrl.text.trim(),
                      displayName: _previewDisplayName,
                      username: _previewUsername,
                      avatarUrl: _previewAvatarUrl,
                      headline: _headlineCtrl.text.trim(),
                      primaryText: _primaryTextCtrl.text.trim(),
                      description: _descriptionCtrl.text.trim(),
                      ctaLabel: _ctaValue(_cta),
                      networkImages: _uploadedMedia
                          .where((item) => item.resourceType != 'video')
                          .map((item) => item.secureUrl)
                          .where((url) => url.isNotEmpty)
                          .toList(),
                      localImages: _pickedFiles,
                      adFormat: _adFormat,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              _Card(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _Heading(LanguageController.instance.t('ads.create.sectionTargeting')),
                    const SizedBox(height: 8),
                    _Heading(LanguageController.instance.t('ads.create.sectionLocation')),
                    DropdownButtonFormField<String>(
                      value: _countryOptions.contains(_locationCtrl.text.trim())
                          ? _locationCtrl.text.trim()
                          : null,
                      decoration: _fieldDecoration(context).copyWith(
                        hintText: _countriesLoading
                            ? LanguageController.instance.t('ads.create.loadingCountries')
                            : LanguageController.instance.t('ads.create.selectLocation'),
                      ),
                      dropdownColor: tokens.panelMuted,
                      style: TextStyle(color: tokens.text),
                      items: _countryOptions
                          .map(
                            (country) => DropdownMenuItem(
                              value: country,
                              child: Text(country),
                            ),
                          )
                          .toList(),
                      onChanged: _countriesLoading
                          ? null
                          : (value) {
                              if (value == null) return;
                              setState(() {
                                _locationCtrl.text = value;
                              });
                            },
                    ),
                    const SizedBox(height: 6),
                    Text(
                      LanguageController.instance.t('ads.create.locationHint'),
                      style: TextStyle(color: textSecondary, fontSize: 11.5),
                    ),
                    const SizedBox(height: 12),
                    _Heading(LanguageController.instance.t('ads.create.sectionInterests')),
                    Row(
                      children: [
                        Expanded(
                          child: _Input(
                            controller: _interestCtrl,
                            hint: LanguageController.instance.t('ads.create.addInterestHint'),
                          ),
                        ),
                        const SizedBox(width: 8),
                        TextButton(
                          onPressed: () {
                            final value = _interestCtrl.text.trim();
                            if (value.isEmpty) return;
                            if (_interests.any(
                              (e) => e.toLowerCase() == value.toLowerCase(),
                            )) {
                              _interestCtrl.clear();
                              return;
                            }
                            setState(() {
                              _interests.add(value);
                              _interestCtrl.clear();
                            });
                          },
                          style: TextButton.styleFrom(
                            backgroundColor: tokens.panel,
                            foregroundColor: tokens.text,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(10),
                            ),
                            padding: const EdgeInsets.symmetric(
                              horizontal: 14,
                              vertical: 11,
                            ),
                          ),
                          child: Text(LanguageController.instance.t('ads.create.addBtn')),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: _interests
                          .map(
                            (i) => Chip(
                              backgroundColor: tokens.panel,
                              side: BorderSide(color: tokens.panelBorder),
                              labelStyle: TextStyle(
                                color: tokens.text,
                                fontWeight: FontWeight.w600,
                              ),
                              deleteIconColor: tokens.textMuted,
                              label: Text(i),
                              onDeleted: () =>
                                  setState(() => _interests.remove(i)),
                            ),
                          )
                          .toList(),
                    ),
                    const SizedBox(height: 12),
                    _Heading(LanguageController.instance.t('ads.create.sectionAgeRange')),
                    Row(
                      children: [
                        Expanded(
                          child: Slider(
                            value: _ageMin.toDouble(),
                            min: 13,
                            max: 120,
                            divisions: 107,
                            label: '$_ageMin',
                            onChanged: (v) => setState(() {
                              _ageMin = v.round();
                              if (_ageMin > _ageMax) _ageMax = _ageMin;
                            }),
                          ),
                        ),
                        Text(
                          '$_ageMin',
                          style: TextStyle(color: textSecondary),
                        ),
                      ],
                    ),
                    Row(
                      children: [
                        Expanded(
                          child: Slider(
                            value: _ageMax.toDouble(),
                            min: 13,
                            max: 120,
                            divisions: 107,
                            label: '$_ageMax',
                            onChanged: (v) => setState(() {
                              _ageMax = v.round();
                              if (_ageMax < _ageMin) _ageMin = _ageMax;
                            }),
                          ),
                        ),
                        Text(
                          '$_ageMax',
                          style: TextStyle(color: textSecondary),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    _Heading(LanguageController.instance.t('ads.create.sectionBoostPackage')),
                    Column(
                      children: _boosts
                          .map(
                            (b) => _PackageOptionCard(
                              title: b.title,
                              subtitle: b.id == 'light'
                                  ? LanguageController.instance.t('ads.create.boostSubtitleLight')
                                  : b.id == 'standard'
                                  ? LanguageController.instance.t('ads.create.boostSubtitleStandard')
                                  : LanguageController.instance.t('ads.create.boostSubtitleStrong'),
                              priceLabel: _formatVnd(b.price),
                              selected: _boostId == b.id,
                              highlight: b.id == 'standard'
                                  ? LanguageController.instance.t('ads.create.boostHighlight')
                                  : null,
                              onTap: () => setState(() => _boostId = b.id),
                            ),
                          )
                          .toList(),
                    ),
                    const SizedBox(height: 12),
                    _Heading(LanguageController.instance.t('ads.create.sectionDurationPackage')),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: _durations
                          .map(
                            (d) => _DurationOptionChip(
                              days: d.days,
                              priceLabel: _formatVnd(d.price),
                              selected: _durationId == d.id,
                              onTap: () => setState(() => _durationId = d.id),
                            ),
                          )
                          .toList(),
                    ),
                    const SizedBox(height: 14),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: tokens.panel,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: tokens.panelBorder),
                      ),
                      child: Text(
                        LanguageController.instance.t('ads.create.totalBudget', {'amount': _formatVnd(_totalBudget)}),
                        style: TextStyle(
                          color: textPrimary,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              if (_error != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: Text(_error!, style: TextStyle(color: scheme.error)),
                  ),
                ),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: _submitting ? null : _startCheckout,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: tokens.primary,
                    foregroundColor: scheme.onPrimary,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                  child: _submitting
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : Text(
                          LanguageController.instance.t('ads.create.payWithStripe'),
                          style: const TextStyle(fontWeight: FontWeight.w700),
                        ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  InputDecoration _fieldDecoration(BuildContext context) {
    final tokens = _appTokens(context);
    final scheme = Theme.of(context).colorScheme;

    return InputDecoration(
      filled: true,
      fillColor: tokens.panel,
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
    );
  }
}

class _Card extends StatelessWidget {
  const _Card({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final tokens = _appTokens(context);
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: tokens.panelMuted,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: tokens.panelBorder),
      ),
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 14),
      child: child,
    );
  }
}

class _Heading extends StatelessWidget {
  const _Heading(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    final tokens = _appTokens(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Text(
        text,
        style: TextStyle(
          color: tokens.text,
          fontSize: 13,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

class _Input extends StatelessWidget {
  const _Input({
    required this.controller,
    this.hint,
    this.minLines,
    this.maxLines = 1,
  });

  final TextEditingController controller;
  final String? hint;
  final int? minLines;
  final int? maxLines;

  @override
  Widget build(BuildContext context) {
    final tokens = _appTokens(context);
    final scheme = Theme.of(context).colorScheme;

    return TextField(
      controller: controller,
      minLines: minLines,
      maxLines: maxLines,
      style: TextStyle(color: tokens.text),
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: TextStyle(color: tokens.textMuted),
        filled: true,
        fillColor: tokens.panel,
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
      ),
    );
  }
}

String _formatVnd(int value) {
  final s = value.toString();
  final chars = <String>[];
  for (int i = 0; i < s.length; i++) {
    final reversedIndex = s.length - i;
    chars.add(s[i]);
    if (reversedIndex > 1 && reversedIndex % 3 == 1) {
      chars.add(',');
    }
  }
  return '${chars.join()} VND';
}

class _SelectablePill extends StatelessWidget {
  const _SelectablePill({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final tokens = _appTokens(context);
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: selected ? tokens.primarySoft : tokens.panel,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: selected ? tokens.primary : tokens.panelBorder,
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: selected ? tokens.text : tokens.textMuted,
            fontWeight: FontWeight.w700,
            fontSize: 13,
          ),
        ),
      ),
    );
  }
}

class _FormatTab extends StatelessWidget {
  const _FormatTab({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final tokens = _appTokens(context);
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 11),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: selected ? tokens.primarySoft : tokens.panel,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: selected ? tokens.primary : tokens.panelBorder,
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: selected ? tokens.text : tokens.textMuted,
            fontWeight: FontWeight.w700,
            fontSize: 13,
          ),
        ),
      ),
    );
  }
}

class _InvoiceLine extends StatelessWidget {
  const _InvoiceLine({
    required this.label,
    required this.value,
    this.emphasis = false,
  });

  final String label;
  final String value;
  final bool emphasis;

  @override
  Widget build(BuildContext context) {
    final tokens = _appTokens(context);
    final labelStyle = TextStyle(
      color: emphasis ? tokens.text : tokens.textMuted,
      fontSize: emphasis ? 16 : 14,
      fontWeight: emphasis ? FontWeight.w700 : FontWeight.w600,
    );
    final valueStyle = TextStyle(
      color: emphasis ? tokens.primary : tokens.text,
      fontSize: emphasis ? 18 : 14,
      fontWeight: emphasis ? FontWeight.w800 : FontWeight.w700,
    );

    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        SizedBox(
          width: 122,
          child: Text(label, style: labelStyle, maxLines: 2, softWrap: true),
        ),
        const SizedBox(width: 10),
        Expanded(
          flex: emphasis ? 2 : 3,
          child: Align(
            alignment: Alignment.centerRight,
            child: FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerRight,
              child: Text(
                value,
                maxLines: 1,
                softWrap: false,
                textAlign: TextAlign.right,
                style: valueStyle,
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _PackageOptionCard extends StatelessWidget {
  const _PackageOptionCard({
    required this.title,
    required this.subtitle,
    required this.priceLabel,
    required this.selected,
    required this.onTap,
    this.highlight,
  });

  final String title;
  final String subtitle;
  final String priceLabel;
  final bool selected;
  final VoidCallback onTap;
  final String? highlight;

  @override
  Widget build(BuildContext context) {
    final tokens = _appTokens(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
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
    );
  }
}

class _DurationOptionChip extends StatelessWidget {
  const _DurationOptionChip({
    required this.days,
    required this.priceLabel,
    required this.selected,
    required this.onTap,
  });

  final int days;
  final String priceLabel;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final tokens = _appTokens(context);
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: onTap,
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
              LanguageController.instance.t('ads.detail.dayCount', {'count': days}),
              style: TextStyle(color: tokens.text, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 2),
            Text(
              priceLabel,
              style: TextStyle(color: tokens.textMuted, fontSize: 12),
            ),
          ],
        ),
      ),
    );
  }
}

class _AdPreviewCard extends StatefulWidget {
  const _AdPreviewCard({
    required this.campaignName,
    required this.displayName,
    required this.username,
    required this.avatarUrl,
    required this.headline,
    required this.primaryText,
    required this.description,
    required this.ctaLabel,
    required this.networkImages,
    required this.localImages,
    required this.adFormat,
  });

  final String campaignName;
  final String? displayName;
  final String? username;
  final String? avatarUrl;
  final String headline;
  final String primaryText;
  final String description;
  final String ctaLabel;
  final List<String> networkImages;
  final List<File> localImages;
  final _AdFormat adFormat;

  @override
  State<_AdPreviewCard> createState() => _AdPreviewCardState();
}

class _AdPreviewCardState extends State<_AdPreviewCard> {
  late final PageController _controller;
  int _index = 0;

  @override
  void initState() {
    super.initState();
    _controller = PageController();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _goTo(int value) {
    if (value < 0 || value >= _mediaCount) return;
    _controller.animateToPage(
      value,
      duration: const Duration(milliseconds: 240),
      curve: Curves.easeInOut,
    );
  }

  int get _mediaCount {
    if (widget.adFormat == _AdFormat.video) return 1;
    final maxCount = widget.networkImages.isNotEmpty
        ? widget.networkImages.length
        : widget.localImages.length;
    return maxCount > 0 ? maxCount : 1;
  }

  @override
  Widget build(BuildContext context) {
    final tokens = _appTokens(context);
    final displayName = (widget.displayName ?? '').trim().isNotEmpty
        ? widget.displayName!.trim()
        : (widget.campaignName.isEmpty ? 'Cordigram Ads' : widget.campaignName);
    final username = (widget.username ?? '').trim().isEmpty
        ? 'username'
        : widget.username!.trim();
    final avatarLetter = displayName.trim().isEmpty
        ? 'A'
        : displayName.trim().substring(0, 1).toUpperCase();
    final bool showNav =
        widget.adFormat == _AdFormat.carousel && _mediaCount > 1;

    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: tokens.panel,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: tokens.panelBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 8),
            child: Row(
              children: [
                CircleAvatar(
                  radius: 17,
                  backgroundColor: tokens.primarySoft,
                  backgroundImage:
                      (widget.avatarUrl != null && widget.avatarUrl!.isNotEmpty)
                      ? NetworkImage(widget.avatarUrl!)
                      : null,
                  child:
                      (widget.avatarUrl != null && widget.avatarUrl!.isNotEmpty)
                      ? null
                      : Text(
                          avatarLetter,
                          style: TextStyle(
                            color: tokens.text,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        displayName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: tokens.text,
                          fontWeight: FontWeight.w700,
                          fontSize: 13,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        '@$username • Sponsored',
                        style: TextStyle(
                          color: tokens.textMuted,
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
                Icon(Icons.more_horiz_rounded, color: tokens.textMuted),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
            child: Text(
              widget.primaryText.isEmpty
                  ? 'Primary text preview'
                  : widget.primaryText,
              style: TextStyle(color: tokens.text, fontSize: 13, height: 1.35),
            ),
          ),
          ClipRRect(
            borderRadius: const BorderRadius.vertical(top: Radius.circular(0)),
            child: AspectRatio(
              aspectRatio: 4 / 3,
              child: Stack(
                children: [
                  PageView.builder(
                    controller: _controller,
                    itemCount: _mediaCount,
                    onPageChanged: (value) => setState(() => _index = value),
                    itemBuilder: (_, i) => _buildMedia(i),
                  ),
                  if (showNav && _index > 0)
                    _PreviewNavButton(
                      alignment: Alignment.centerLeft,
                      icon: Icons.chevron_left_rounded,
                      onTap: () => _goTo(_index - 1),
                    ),
                  if (showNav && _index < _mediaCount - 1)
                    _PreviewNavButton(
                      alignment: Alignment.centerRight,
                      icon: Icons.chevron_right_rounded,
                      onTap: () => _goTo(_index + 1),
                    ),
                  if (showNav)
                    Positioned(
                      right: 10,
                      bottom: 10,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 3,
                        ),
                        decoration: BoxDecoration(
                          color: Colors.black.withValues(alpha: 0.5),
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Text(
                          '${_index + 1}/$_mediaCount',
                          style: TextStyle(
                            color: tokens.text,
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            widget.headline.isEmpty
                                ? 'Headline'
                                : widget.headline,
                            style: TextStyle(
                              color: tokens.text,
                              fontSize: 15,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            widget.description.isEmpty
                                ? 'Description'
                                : widget.description,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              color: tokens.textMuted,
                              fontSize: 12,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 10),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 9,
                      ),
                      decoration: BoxDecoration(
                        color: tokens.primary,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text(
                        widget.ctaLabel,
                        style: TextStyle(
                          color: Theme.of(context).colorScheme.onPrimary,
                          fontWeight: FontWeight.w700,
                          fontSize: 12,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMedia(int index) {
    final tokens = _appTokens(context);
    if (widget.adFormat == _AdFormat.video) {
      return Container(
        height: 210,
        color: tokens.panelMuted,
        child: Center(
          child: Icon(
            Icons.play_circle_outline_rounded,
            color: tokens.textMuted,
            size: 48,
          ),
        ),
      );
    }

    if (widget.networkImages.isNotEmpty &&
        index < widget.networkImages.length) {
      return SizedBox(
        height: double.infinity,
        width: double.infinity,
        child: DecoratedBox(
          decoration: BoxDecoration(color: tokens.panelMuted),
          child: Image.network(
            widget.networkImages[index],
            fit: BoxFit.contain,
          ),
        ),
      );
    }

    if (widget.localImages.isNotEmpty && index < widget.localImages.length) {
      return SizedBox(
        height: double.infinity,
        width: double.infinity,
        child: DecoratedBox(
          decoration: BoxDecoration(color: tokens.panelMuted),
          child: Image.file(widget.localImages[index], fit: BoxFit.contain),
        ),
      );
    }

    return Container(
      color: tokens.panelMuted,
      alignment: Alignment.center,
      child: Icon(Icons.image_outlined, color: tokens.textMuted, size: 42),
    );
  }
}

class _PreviewNavButton extends StatelessWidget {
  const _PreviewNavButton({
    required this.alignment,
    required this.icon,
    required this.onTap,
  });

  final Alignment alignment;
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final tokens = _appTokens(context);
    return Align(
      alignment: alignment,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8),
        child: GestureDetector(
          onTap: onTap,
          child: Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: Colors.black.withValues(alpha: 0.45),
              shape: BoxShape.circle,
              border: Border.all(color: Colors.white.withValues(alpha: 0.2)),
            ),
            child: Icon(icon, color: tokens.text, size: 20),
          ),
        ),
      ),
    );
  }
}
