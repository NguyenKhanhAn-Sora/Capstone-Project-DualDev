import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';

import '../../core/config/app_config.dart';
import '../../core/services/api_service.dart';
import '../../core/services/auth_storage.dart';

class AdsUploadResult {
  const AdsUploadResult({
    required this.url,
    required this.secureUrl,
    required this.resourceType,
    this.width,
    this.height,
    this.bytes,
    this.format,
  });

  final String url;
  final String secureUrl;
  final String resourceType;
  final int? width;
  final int? height;
  final int? bytes;
  final String? format;

  factory AdsUploadResult.fromJson(Map<String, dynamic> json) {
    return AdsUploadResult(
      url: (json['url'] as String?) ?? '',
      secureUrl:
          (json['secureUrl'] as String?) ?? (json['url'] as String?) ?? '',
      resourceType: ((json['resourceType'] as String?) ?? 'image')
          .toLowerCase(),
      width: json['width'] is int ? json['width'] as int : null,
      height: json['height'] is int ? json['height'] as int : null,
      bytes: json['bytes'] is int ? json['bytes'] as int : null,
      format: json['format'] as String?,
    );
  }
}

class AdsCreateStatus {
  const AdsCreateStatus({required this.hasCreatedAds});

  final bool hasCreatedAds;

  factory AdsCreateStatus.fromJson(Map<String, dynamic> json) {
    return AdsCreateStatus(hasCreatedAds: json['hasCreatedAds'] == true);
  }
}

class AdsDashboardSummary {
  const AdsDashboardSummary({
    required this.totalBudget,
    required this.totalSpent,
    required this.impressions,
    required this.reach,
    required this.clicks,
    required this.views,
    required this.likes,
    required this.comments,
    required this.reposts,
    required this.engagements,
    required this.totalDwellMs,
    required this.dwellSamples,
    required this.activeCount,
    required this.ctr,
    required this.averageDwellMs,
    required this.engagementRate,
  });

  final int totalBudget;
  final int totalSpent;
  final int impressions;
  final int reach;
  final int clicks;
  final int views;
  final int likes;
  final int comments;
  final int reposts;
  final int engagements;
  final int totalDwellMs;
  final int dwellSamples;
  final int activeCount;
  final double ctr;
  final double averageDwellMs;
  final double engagementRate;

  factory AdsDashboardSummary.fromJson(Map<String, dynamic> json) {
    int asInt(dynamic value) => value is num ? value.toInt() : 0;
    double asDouble(dynamic value) => value is num ? value.toDouble() : 0;

    return AdsDashboardSummary(
      totalBudget: asInt(json['totalBudget']),
      totalSpent: asInt(json['totalSpent']),
      impressions: asInt(json['impressions']),
      reach: asInt(json['reach']),
      clicks: asInt(json['clicks']),
      views: asInt(json['views']),
      likes: asInt(json['likes']),
      comments: asInt(json['comments']),
      reposts: asInt(json['reposts']),
      engagements: asInt(json['engagements']),
      totalDwellMs: asInt(json['totalDwellMs']),
      dwellSamples: asInt(json['dwellSamples']),
      activeCount: asInt(json['activeCount']),
      ctr: asDouble(json['ctr']),
      averageDwellMs: asDouble(json['averageDwellMs']),
      engagementRate: asDouble(json['engagementRate']),
    );
  }
}

class AdsDashboardTrendItem {
  const AdsDashboardTrendItem({
    required this.day,
    required this.impressions,
    required this.clicks,
  });

  final String day;
  final int impressions;
  final int clicks;

  factory AdsDashboardTrendItem.fromJson(Map<String, dynamic> json) {
    return AdsDashboardTrendItem(
      day: (json['day'] as String?) ?? '',
      impressions: json['impressions'] is num
          ? (json['impressions'] as num).toInt()
          : 0,
      clicks: json['clicks'] is num ? (json['clicks'] as num).toInt() : 0,
    );
  }
}

class AdsDashboardCampaign {
  const AdsDashboardCampaign({
    required this.id,
    required this.promotedPostId,
    required this.campaignName,
    required this.status,
    required this.adminCancelReason,
    required this.budget,
    required this.spent,
    required this.startsAt,
    required this.expiresAt,
    required this.impressions,
    required this.reach,
    required this.clicks,
    required this.ctr,
    required this.views,
    required this.likes,
    required this.comments,
    required this.reposts,
    required this.engagements,
    required this.averageDwellMs,
    required this.totalDwellMs,
    required this.dwellSamples,
    required this.engagementRate,
  });

  final String id;
  final String promotedPostId;
  final String campaignName;
  final String status;
  final String? adminCancelReason;
  final int budget;
  final int spent;
  final DateTime? startsAt;
  final DateTime? expiresAt;
  final int impressions;
  final int reach;
  final int clicks;
  final double ctr;
  final int views;
  final int likes;
  final int comments;
  final int reposts;
  final int engagements;
  final double averageDwellMs;
  final int totalDwellMs;
  final int dwellSamples;
  final double engagementRate;

  factory AdsDashboardCampaign.fromJson(Map<String, dynamic> json) {
    int asInt(dynamic value) => value is num ? value.toInt() : 0;
    double asDouble(dynamic value) => value is num ? value.toDouble() : 0;

    return AdsDashboardCampaign(
      id: (json['id'] as String?) ?? '',
      promotedPostId: (json['promotedPostId'] as String?) ?? '',
      campaignName: (json['campaignName'] as String?) ?? 'Ads Campaign',
      status: (json['status'] as String?) ?? 'completed',
      adminCancelReason: json['adminCancelReason'] as String?,
      budget: asInt(json['budget']),
      spent: asInt(json['spent']),
      startsAt: DateTime.tryParse((json['startsAt'] as String?) ?? ''),
      expiresAt: DateTime.tryParse((json['expiresAt'] as String?) ?? ''),
      impressions: asInt(json['impressions']),
      reach: asInt(json['reach']),
      clicks: asInt(json['clicks']),
      ctr: asDouble(json['ctr']),
      views: asInt(json['views']),
      likes: asInt(json['likes']),
      comments: asInt(json['comments']),
      reposts: asInt(json['reposts']),
      engagements: asInt(json['engagements']),
      averageDwellMs: asDouble(json['averageDwellMs']),
      totalDwellMs: asInt(json['totalDwellMs']),
      dwellSamples: asInt(json['dwellSamples']),
      engagementRate: asDouble(json['engagementRate']),
    );
  }
}

class AdsDashboardResponse {
  const AdsDashboardResponse({
    required this.summary,
    required this.campaigns,
    required this.trend,
  });

  final AdsDashboardSummary summary;
  final List<AdsDashboardCampaign> campaigns;
  final List<AdsDashboardTrendItem> trend;

  factory AdsDashboardResponse.fromJson(Map<String, dynamic> json) {
    final rawCampaigns = json['campaigns'];
    final rawTrend = json['trend'];

    return AdsDashboardResponse(
      summary: AdsDashboardSummary.fromJson(
        (json['summary'] as Map<String, dynamic>?) ?? <String, dynamic>{},
      ),
      campaigns: rawCampaigns is List
          ? rawCampaigns
                .whereType<Map<String, dynamic>>()
                .map(AdsDashboardCampaign.fromJson)
                .toList()
          : const <AdsDashboardCampaign>[],
      trend: rawTrend is List
          ? rawTrend
                .whereType<Map<String, dynamic>>()
                .map(AdsDashboardTrendItem.fromJson)
                .toList()
          : const <AdsDashboardTrendItem>[],
    );
  }
}

class AdsCampaignActions {
  const AdsCampaignActions({
    required this.canChangeBoost,
    required this.canExtend,
    required this.canPause,
    required this.canResume,
    required this.canCancel,
    required this.requiresExtendBeforeResume,
  });

  final bool canChangeBoost;
  final bool canExtend;
  final bool canPause;
  final bool canResume;
  final bool canCancel;
  final bool requiresExtendBeforeResume;

  factory AdsCampaignActions.fromJson(Map<String, dynamic> json) {
    bool asBool(dynamic value) => value == true;
    return AdsCampaignActions(
      canChangeBoost: asBool(json['canChangeBoost']),
      canExtend: asBool(json['canExtend']),
      canPause: asBool(json['canPause']),
      canResume: asBool(json['canResume']),
      canCancel: asBool(json['canCancel']),
      requiresExtendBeforeResume: asBool(json['requiresExtendBeforeResume']),
    );
  }
}

class AdsCampaignDetail {
  const AdsCampaignDetail({
    required this.id,
    required this.promotedPostId,
    required this.campaignName,
    required this.status,
    required this.adminCancelReason,
    required this.budget,
    required this.spent,
    required this.startsAt,
    required this.expiresAt,
    required this.impressions,
    required this.reach,
    required this.clicks,
    required this.ctr,
    required this.views,
    required this.likes,
    required this.comments,
    required this.reposts,
    required this.engagements,
    required this.averageDwellMs,
    required this.totalDwellMs,
    required this.dwellSamples,
    required this.engagementRate,
    required this.objective,
    required this.adFormat,
    required this.primaryText,
    required this.headline,
    required this.adDescription,
    required this.destinationUrl,
    required this.cta,
    required this.interests,
    required this.locationText,
    required this.ageMin,
    required this.ageMax,
    required this.placement,
    required this.mediaUrls,
    required this.boostPackageId,
    required this.durationPackageId,
    required this.durationDays,
    required this.boostWeight,
    required this.hiddenReason,
    required this.actions,
  });

  final String id;
  final String promotedPostId;
  final String campaignName;
  final String status;
  final String? adminCancelReason;
  final int budget;
  final int spent;
  final DateTime? startsAt;
  final DateTime? expiresAt;
  final int impressions;
  final int reach;
  final int clicks;
  final double ctr;
  final int views;
  final int likes;
  final int comments;
  final int reposts;
  final int engagements;
  final double averageDwellMs;
  final int totalDwellMs;
  final int dwellSamples;
  final double engagementRate;
  final String objective;
  final String adFormat;
  final String primaryText;
  final String headline;
  final String adDescription;
  final String destinationUrl;
  final String cta;
  final List<String> interests;
  final String locationText;
  final int? ageMin;
  final int? ageMax;
  final String placement;
  final List<String> mediaUrls;
  final String boostPackageId;
  final String durationPackageId;
  final int durationDays;
  final double boostWeight;
  final String? hiddenReason;
  final AdsCampaignActions actions;

  factory AdsCampaignDetail.fromJson(Map<String, dynamic> json) {
    int asInt(dynamic value) => value is num ? value.toInt() : 0;
    double asDouble(dynamic value) => value is num ? value.toDouble() : 0;

    return AdsCampaignDetail(
      id: (json['id'] as String?) ?? '',
      promotedPostId: (json['promotedPostId'] as String?) ?? '',
      campaignName: (json['campaignName'] as String?) ?? 'Ads Campaign',
      status: (json['status'] as String?) ?? 'completed',
      adminCancelReason: json['adminCancelReason'] as String?,
      budget: asInt(json['budget']),
      spent: asInt(json['spent']),
      startsAt: DateTime.tryParse((json['startsAt'] as String?) ?? ''),
      expiresAt: DateTime.tryParse((json['expiresAt'] as String?) ?? ''),
      impressions: asInt(json['impressions']),
      reach: asInt(json['reach']),
      clicks: asInt(json['clicks']),
      ctr: asDouble(json['ctr']),
      views: asInt(json['views']),
      likes: asInt(json['likes']),
      comments: asInt(json['comments']),
      reposts: asInt(json['reposts']),
      engagements: asInt(json['engagements']),
      averageDwellMs: asDouble(json['averageDwellMs']),
      totalDwellMs: asInt(json['totalDwellMs']),
      dwellSamples: asInt(json['dwellSamples']),
      engagementRate: asDouble(json['engagementRate']),
      objective: (json['objective'] as String?) ?? '',
      adFormat: (json['adFormat'] as String?) ?? '',
      primaryText: (json['primaryText'] as String?) ?? '',
      headline: (json['headline'] as String?) ?? '',
      adDescription: (json['adDescription'] as String?) ?? '',
      destinationUrl: (json['destinationUrl'] as String?) ?? '',
      cta: (json['cta'] as String?) ?? '',
      interests: (json['interests'] is List)
          ? (json['interests'] as List)
                .map((e) => e.toString().trim())
                .where((e) => e.isNotEmpty)
                .toList()
          : const <String>[],
      locationText: (json['locationText'] as String?) ?? '',
      ageMin: json['ageMin'] is num ? (json['ageMin'] as num).toInt() : null,
      ageMax: json['ageMax'] is num ? (json['ageMax'] as num).toInt() : null,
      placement: (json['placement'] as String?) ?? 'home_feed',
      mediaUrls: (json['mediaUrls'] is List)
          ? (json['mediaUrls'] as List)
                .map((e) => e.toString().trim())
                .where((e) => e.isNotEmpty)
                .toList()
          : const <String>[],
      boostPackageId: (json['boostPackageId'] as String?) ?? '',
      durationPackageId: (json['durationPackageId'] as String?) ?? '',
      durationDays: asInt(json['durationDays']),
      boostWeight: asDouble(json['boostWeight']),
      hiddenReason: json['hiddenReason'] as String?,
      actions: AdsCampaignActions.fromJson(
        (json['actions'] as Map<String, dynamic>?) ?? <String, dynamic>{},
      ),
    );
  }
}

class AdsCampaignActionPayload {
  const AdsCampaignActionPayload({
    required this.action,
    this.boostPackageId,
    this.extendDays,
    this.campaignName,
    this.objective,
    this.adFormat,
    this.primaryText,
    this.headline,
    this.adDescription,
    this.destinationUrl,
    this.cta,
    this.interests,
    this.locationText,
    this.ageMin,
    this.ageMax,
    this.placement,
    this.mediaUrls,
  });

  final String action;
  final String? boostPackageId;
  final int? extendDays;
  final String? campaignName;
  final String? objective;
  final String? adFormat;
  final String? primaryText;
  final String? headline;
  final String? adDescription;
  final String? destinationUrl;
  final String? cta;
  final List<String>? interests;
  final String? locationText;
  final int? ageMin;
  final int? ageMax;
  final String? placement;
  final List<String>? mediaUrls;

  Map<String, dynamic> toJson() {
    return {
      'action': action,
      if (boostPackageId != null) 'boostPackageId': boostPackageId,
      if (extendDays != null) 'extendDays': extendDays,
      if (campaignName != null) 'campaignName': campaignName,
      if (objective != null) 'objective': objective,
      if (adFormat != null) 'adFormat': adFormat,
      if (primaryText != null) 'primaryText': primaryText,
      if (headline != null) 'headline': headline,
      if (adDescription != null) 'adDescription': adDescription,
      if (destinationUrl != null) 'destinationUrl': destinationUrl,
      if (cta != null) 'cta': cta,
      if (interests != null) 'interests': interests,
      if (locationText != null) 'locationText': locationText,
      if (ageMin != null) 'ageMin': ageMin,
      if (ageMax != null) 'ageMax': ageMax,
      if (placement != null) 'placement': placement,
      if (mediaUrls != null) 'mediaUrls': mediaUrls,
    };
  }
}

class CheckoutSessionResult {
  const CheckoutSessionResult({
    required this.id,
    required this.url,
    required this.status,
    required this.paymentStatus,
    required this.amountTotal,
    required this.currency,
  });

  final String id;
  final String? url;
  final String? status;
  final String? paymentStatus;
  final int? amountTotal;
  final String? currency;

  factory CheckoutSessionResult.fromJson(Map<String, dynamic> json) {
    final rawAmount = json['amountTotal'];
    return CheckoutSessionResult(
      id: (json['id'] as String?) ?? '',
      url: json['url'] as String?,
      status: json['status'] as String?,
      paymentStatus: json['paymentStatus'] as String?,
      amountTotal: rawAmount is num ? rawAmount.toInt() : null,
      currency: json['currency'] as String?,
    );
  }
}

class AdsService {
  static final http.Client _client = http.Client();

  static String _mimeFromPath(String path) {
    final ext = path.split('.').last.toLowerCase();
    switch (ext) {
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      case 'gif':
        return 'image/gif';
      case 'webp':
        return 'image/webp';
      case 'mp4':
        return 'video/mp4';
      case 'mov':
        return 'video/quicktime';
      case 'avi':
        return 'video/x-msvideo';
      case 'webm':
        return 'video/webm';
      default:
        return 'application/octet-stream';
    }
  }

  static Future<AdsCreateStatus> getMyAdsCreationStatus() async {
    final token = AuthStorage.accessToken;
    if (token == null || token.isEmpty) {
      throw const ApiException('Not authenticated');
    }

    final json = await ApiService.get(
      '/payments/me/ads-created',
      extraHeaders: {'Authorization': 'Bearer $token'},
    );
    return AdsCreateStatus.fromJson(json);
  }

  static Future<AdsUploadResult> uploadMedia(File file) async {
    final token = AuthStorage.accessToken;
    if (token == null || token.isEmpty) {
      throw const ApiException('Not authenticated');
    }

    final uri = Uri.parse('${AppConfig.apiBaseUrl}/posts/upload');
    final request = http.MultipartRequest('POST', uri)
      ..headers['Authorization'] = 'Bearer $token';

    request.files.add(
      await http.MultipartFile.fromPath(
        'file',
        file.path,
        contentType: MediaType.parse(_mimeFromPath(file.path)),
      ),
    );

    final streamed = await _client
        .send(request)
        .timeout(const Duration(seconds: 120));
    final response = await http.Response.fromStream(streamed);
    final body = response.body;

    if (response.statusCode < 200 || response.statusCode >= 300) {
      String message = 'Upload failed (${response.statusCode})';
      if (body.isNotEmpty) {
        try {
          final decoded = jsonDecode(body) as Map<String, dynamic>;
          final msg = decoded['message'];
          if (msg is String && msg.trim().isNotEmpty) {
            message = msg.trim();
          } else if (msg is List && msg.isNotEmpty) {
            message = msg.first.toString();
          }
        } catch (_) {
          message = body;
        }
      }
      throw ApiException(message);
    }

    final decoded = body.isNotEmpty
        ? (jsonDecode(body) as Map<String, dynamic>)
        : <String, dynamic>{};
    return AdsUploadResult.fromJson(decoded);
  }

  static Future<String> createAdCreativePost({
    required String primaryText,
    required String headline,
    required String description,
    required String destinationUrl,
    required String cta,
    required List<AdsUploadResult> uploadedMedia,
  }) async {
    final token = AuthStorage.accessToken;
    if (token == null || token.isEmpty) {
      throw const ApiException('Not authenticated');
    }

    final creativeContent = [
      '[[AD_PRIMARY_TEXT]]',
      primaryText.trim(),
      '[[/AD_PRIMARY_TEXT]]',
      '',
      '[[AD_HEADLINE]]',
      headline.trim(),
      '[[/AD_HEADLINE]]',
      '',
      '[[AD_DESCRIPTION]]',
      description.trim(),
      '[[/AD_DESCRIPTION]]',
      '',
      '[[AD_CTA]]',
      cta.trim(),
      '[[/AD_CTA]]',
      '',
      '[[AD_URL]]',
      destinationUrl.trim(),
      '[[/AD_URL]]',
    ].join('\n');

    final media = uploadedMedia
        .map(
          (item) => <String, dynamic>{
            'type': item.resourceType == 'video' ? 'video' : 'image',
            'url': item.secureUrl,
            'metadata': <String, dynamic>{
              if (item.width != null) 'width': item.width,
              if (item.height != null) 'height': item.height,
              if (item.bytes != null) 'bytes': item.bytes,
              if (item.format != null) 'format': item.format,
            },
          },
        )
        .toList();

    final created = await ApiService.post(
      '/posts',
      body: {
        'content': creativeContent.length > 2200
            ? creativeContent.substring(0, 2200)
            : creativeContent,
        'media': media,
        'visibility': 'private',
        'allowComments': true,
        'allowDownload': false,
        'hideLikeCount': false,
      },
      extraHeaders: {'Authorization': 'Bearer $token'},
    );

    final id = (created['id'] as String?) ?? '';
    if (id.isEmpty) {
      throw const ApiException('Failed to prepare ad creative for checkout.');
    }
    return id;
  }

  static Future<CheckoutSessionResult> createStripeCheckoutSession({
    required int amount,
    required String campaignName,
    required String description,
    required String objective,
    required String adFormat,
    required String boostPackageId,
    required String durationPackageId,
    required String promotedPostId,
    required String primaryText,
    required String headline,
    required String adDescription,
    required String destinationUrl,
    required String cta,
    required List<String> interests,
    required String locationText,
    required int ageMin,
    required int ageMax,
    required List<String> mediaUrls,
  }) async {
    final token = AuthStorage.accessToken;
    if (token == null || token.isEmpty) {
      throw const ApiException('Not authenticated');
    }

    final json = await ApiService.post(
      '/payments/checkout-session',
      body: {
        'amount': amount,
        'currency': 'vnd',
        'successUrl':
            'cordigram://ads/payment/success?session_id={CHECKOUT_SESSION_ID}',
        'cancelUrl': 'cordigram://ads/payment/cancel',
        'campaignName': campaignName,
        'description': description,
        'objective': objective,
        'adFormat': adFormat,
        'boostPackageId': boostPackageId,
        'durationPackageId': durationPackageId,
        'promotedPostId': promotedPostId,
        'primaryText': primaryText,
        'headline': headline,
        'adDescription': adDescription,
        'destinationUrl': destinationUrl,
        'cta': cta,
        'interests': interests,
        'locationText': locationText,
        'ageMin': ageMin,
        'ageMax': ageMax,
        'placement': 'home_feed',
        'mediaUrls': mediaUrls,
      },
      extraHeaders: {'Authorization': 'Bearer $token'},
    );

    return CheckoutSessionResult.fromJson(json);
  }

  static Future<CheckoutSessionResult> createStripeUpgradeCheckoutSession({
    required String targetCampaignId,
    required int amount,
    required String campaignName,
    required String description,
    required String boostPackageId,
    required String durationPackageId,
  }) async {
    final token = AuthStorage.accessToken;
    if (token == null || token.isEmpty) {
      throw const ApiException('Not authenticated');
    }

    final json = await ApiService.post(
      '/payments/checkout-session',
      body: {
        'actionType': 'campaign_upgrade',
        'targetCampaignId': targetCampaignId,
        'amount': amount,
        'currency': 'vnd',
        'successUrl':
            'cordigram://ads/payment/success?session_id={CHECKOUT_SESSION_ID}',
        'cancelUrl': 'cordigram://ads/payment/cancel',
        'campaignName': campaignName,
        'description': description,
        'boostPackageId': boostPackageId,
        'durationPackageId': durationPackageId,
      },
      extraHeaders: {'Authorization': 'Bearer $token'},
    );

    return CheckoutSessionResult.fromJson(json);
  }

  static Future<CheckoutSessionResult> getCheckoutSessionStatus(
    String sessionId,
  ) async {
    final token = AuthStorage.accessToken;
    if (token == null || token.isEmpty) {
      throw const ApiException('Not authenticated');
    }

    final json = await ApiService.get(
      '/payments/checkout-session/${Uri.encodeComponent(sessionId)}',
      extraHeaders: {'Authorization': 'Bearer $token'},
    );

    return CheckoutSessionResult.fromJson(json);
  }

  static Future<AdsDashboardResponse> getAdsDashboard() async {
    final token = AuthStorage.accessToken;
    if (token == null || token.isEmpty) {
      throw const ApiException('Not authenticated');
    }

    final json = await ApiService.get(
      '/payments/ads/dashboard',
      extraHeaders: {'Authorization': 'Bearer $token'},
    );

    return AdsDashboardResponse.fromJson(json);
  }

  static Future<AdsCampaignDetail> getAdsCampaignDetail(
    String campaignId,
  ) async {
    final token = AuthStorage.accessToken;
    if (token == null || token.isEmpty) {
      throw const ApiException('Not authenticated');
    }

    final json = await ApiService.get(
      '/payments/ads/campaigns/${Uri.encodeComponent(campaignId)}',
      extraHeaders: {'Authorization': 'Bearer $token'},
    );

    return AdsCampaignDetail.fromJson(json);
  }

  static Future<AdsCampaignDetail> performAdsCampaignAction({
    required String campaignId,
    required AdsCampaignActionPayload payload,
  }) async {
    final token = AuthStorage.accessToken;
    if (token == null || token.isEmpty) {
      throw const ApiException('Not authenticated');
    }

    final json = await ApiService.post(
      '/payments/ads/campaigns/${Uri.encodeComponent(campaignId)}/action',
      body: payload.toJson(),
      extraHeaders: {'Authorization': 'Bearer $token'},
    );

    return AdsCampaignDetail.fromJson(json);
  }
}
