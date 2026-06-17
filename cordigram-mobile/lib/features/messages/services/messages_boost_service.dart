import '../../../core/services/api_service.dart';
import '../../../core/services/auth_storage.dart';
import '../../ads/ads_service.dart';

/// Messages-scope Boost (parity with cordigram-web messages boost store).
class MessagesBoostStatus {
  const MessagesBoostStatus({
    required this.active,
    required this.unlocked,
    this.tier,
    this.expiresAt,
    this.billingCycle,
    this.maxUploadBytes,
  });

  final bool active;
  final bool unlocked;
  final String? tier;
  final DateTime? expiresAt;
  final String? billingCycle;
  final int? maxUploadBytes;

  bool get isUnlocked => unlocked;

  factory MessagesBoostStatus.fromJson(Map<String, dynamic> json) {
    final limits = json['limits'];
    int? maxBytes;
    if (limits is Map) {
      final v = limits['maxUploadBytes'];
      if (v is num && v > 0) maxBytes = v.toInt();
    }
    final active = json['active'] == true;
    final unlocked = json['unlocked'] == true ||
        active ||
        json['accountBoost'] == true;
    return MessagesBoostStatus(
      active: active,
      unlocked: unlocked,
      tier: json['tier']?.toString(),
      expiresAt: DateTime.tryParse((json['expiresAt'] ?? '').toString())
          ?.toLocal(),
      billingCycle: json['billingCycle']?.toString(),
      maxUploadBytes: maxBytes,
    );
  }

  static const empty = MessagesBoostStatus(active: false, unlocked: false);
}

class BoostGiftRecipient {
  const BoostGiftRecipient({
    required this.userId,
    required this.displayName,
    required this.username,
    this.avatarUrl,
  });

  final String userId;
  final String displayName;
  final String username;
  final String? avatarUrl;
}

class MessagesBoostService {
  MessagesBoostService._();

  static Map<String, String> get _authHeaders => {
        'Authorization': 'Bearer ${AuthStorage.accessToken ?? ''}',
      };

  static const _successUrl =
      'cordigram://messages/boost/payment/success?session_id={CHECKOUT_SESSION_ID}';
  static const _cancelUrl = 'cordigram://messages/boost/payment/cancel';

  static Future<MessagesBoostStatus> fetchStatus({
    String scope = 'messages',
  }) async {
    try {
      final json = await ApiService.get(
        '/users/boost-status?scope=$scope',
        extraHeaders: _authHeaders,
      );
      return MessagesBoostStatus.fromJson(json);
    } catch (_) {
      return MessagesBoostStatus.empty;
    }
  }

  static Future<List<BoostGiftRecipient>> fetchGiftRecipients() async {
    final list = await ApiService.getList(
      '/direct-messages/available-users/list',
      extraHeaders: _authHeaders,
    );
    return list.whereType<Map>().map((raw) {
      final map = Map<String, dynamic>.from(raw);
      final userId = (map['userId'] ?? map['_id'] ?? '').toString();
      final displayName = (map['displayName'] ?? '').toString();
      final username = (map['username'] ?? '').toString();
      return BoostGiftRecipient(
        userId: userId,
        displayName: displayName.isNotEmpty
            ? displayName
            : (username.isNotEmpty ? username : userId),
        username: username,
        avatarUrl: (map['avatar'] ?? map['avatarUrl'])?.toString(),
      );
    }).where((u) => u.userId.isNotEmpty).toList();
  }

  static Future<CheckoutSessionResult> createCheckoutSession({
    required String actionType,
    required String boostTier,
    required String billingCycle,
    String? recipientUserId,
  }) async {
    final token = AuthStorage.accessToken;
    if (token == null || token.isEmpty) {
      throw const ApiException('Not authenticated');
    }

    final body = <String, dynamic>{
      'actionType': actionType,
      'boostTier': boostTier,
      'billingCycle': billingCycle,
      'boostScope': 'messages',
      'currency': 'vnd',
      'successUrl': _successUrl,
      'cancelUrl': _cancelUrl,
    };
    if (recipientUserId != null && recipientUserId.isNotEmpty) {
      body['recipientUserId'] = recipientUserId;
    }

    final json = await ApiService.post(
      '/payments/checkout-session',
      body: body,
      extraHeaders: _authHeaders,
    );
    return CheckoutSessionResult.fromJson(json);
  }

  static Future<CheckoutSessionResult> getCheckoutSessionStatus(
    String sessionId,
  ) async {
    return AdsService.getCheckoutSessionStatus(sessionId);
  }
}
