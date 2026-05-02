import '../../../core/services/api_service.dart';
import '../../../core/services/auth_storage.dart';

class VoiceLivekitService {
  VoiceLivekitService._();

  static Map<String, String> get _authHeaders => {
    'Authorization': 'Bearer ${AuthStorage.accessToken ?? ''}',
  };

  static Future<String?> getDmRoomName(String peerUserId) async {
    final res = await ApiService.post(
      '/livekit/room-name',
      extraHeaders: _authHeaders,
      body: {'peerUserId': peerUserId},
    );
    return (res['roomName'] ?? res['room'])?.toString();
  }

  static Future<Map<String, String>> getTokenBundle({
    required String roomName,
    required String participantName,
  }) async {
    final res = await ApiService.post(
      '/livekit/token',
      extraHeaders: _authHeaders,
      body: {'roomName': roomName, 'participantName': participantName},
    );
    final token = (res['token'] ?? res['accessToken'] ?? '').toString().trim();
    final url = (res['url'] ?? '').toString().trim();
    if (token.isEmpty || url.isEmpty) {
      throw Exception('Không lấy được token voice channel');
    }
    return {'token': token, 'url': url};
  }

  static Future<String?> getToken({
    required String roomName,
    required String identity,
  }) async {
    final bundle = await getTokenBundle(
      roomName: roomName,
      participantName: identity,
    );
    return bundle['token'];
  }

  static Future<List<Map<String, dynamic>>> getVoiceParticipants({
    required String serverId,
    required String channelId,
  }) async {
    final res = await ApiService.get(
      '/livekit/voice-channel-participants?serverId=$serverId&channelId=$channelId',
      extraHeaders: _authHeaders,
    );
    final list = (res['participants'] ?? res['items'] ?? res['data']) as List?;
    return (list ?? const <dynamic>[])
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();
  }
}
