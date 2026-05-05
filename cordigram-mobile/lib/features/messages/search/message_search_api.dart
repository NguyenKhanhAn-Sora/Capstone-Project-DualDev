import '../../../core/services/api_service.dart';
import '../../../core/services/auth_storage.dart';

/// Uses unified `GET /search/messages` (same contract as cordigram-web).
class MessageSearchApi {
  MessageSearchApi._();

  static Map<String, String> get _authHeaders => {
        'Authorization': 'Bearer ${AuthStorage.accessToken ?? ''}',
      };

  static Future<Map<String, dynamic>> search({
    required bool dm,
    String? q,
    String? serverId,
    String? channelId,
    String? partnerUserId,
    int limit = 25,
    int offset = 0,
    bool fuzzy = true,
    bool parseQuery = true,
  }) async {
    final params = <String, String>{
      'limit': '$limit',
      'offset': '$offset',
    };
    if (dm) params['dm'] = 'true';
    if (q != null && q.trim().isNotEmpty) params['q'] = q.trim();
    if (serverId != null && serverId.trim().isNotEmpty) {
      params['serverId'] = serverId.trim();
    }
    if (channelId != null && channelId.trim().isNotEmpty) {
      params['channelId'] = channelId.trim();
    }
    if (partnerUserId != null && partnerUserId.trim().isNotEmpty) {
      params['partnerUserId'] = partnerUserId.trim();
    }
    if (fuzzy) params['fuzzy'] = 'true';
    if (!parseQuery) params['parseQuery'] = 'false';

    final qs = Uri(queryParameters: params).query;
    return ApiService.get('/search/messages?$qs', extraHeaders: _authHeaders);
  }
}
