import '../../../core/services/api_service.dart';
import '../../../core/services/auth_storage.dart';

/// Mirrors `cordigram-web/lib/livekit-api.ts` — `getDMRoomName`.
class DmLiveKitService {
  DmLiveKitService._();

  static Map<String, String> get _authHeaders => {
    'Authorization': 'Bearer ${AuthStorage.accessToken ?? ''}',
  };

  static Future<String> getDmRoomName(String friendId) async {
    final res = await ApiService.post(
      '/livekit/room-name',
      body: {'friendId': friendId},
      extraHeaders: _authHeaders,
    );
    final name = (res['roomName'] ?? res['room'] ?? '').toString();
    if (name.isEmpty) {
      throw Exception('Không lấy được tên phòng gọi');
    }
    return name;
  }

  static Future<Map<String, String>> getLiveKitToken({
    required String roomName,
    required String participantName,
  }) async {
    final res = await ApiService.post(
      '/livekit/token',
      body: {
        'roomName': roomName,
        'participantName': participantName,
      },
      extraHeaders: _authHeaders,
    );
    final token = (res['token'] ?? '').toString().trim();
    final url = (res['url'] ?? '').toString().trim();
    if (token.isEmpty || url.isEmpty) {
      throw Exception('Không lấy được LiveKit token');
    }
    return {
      'token': token,
      'url': url,
    };
  }
}
