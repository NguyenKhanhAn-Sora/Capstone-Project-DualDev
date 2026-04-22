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

  static Future<String?> getToken({
    required String roomName,
    required String identity,
  }) async {
    final res = await ApiService.post(
      '/livekit/token',
      extraHeaders: _authHeaders,
      body: {'roomName': roomName, 'identity': identity},
    );
    return (res['token'] ?? res['accessToken'])?.toString();
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
