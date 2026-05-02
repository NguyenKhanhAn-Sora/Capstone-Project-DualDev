import '../services/dm_livekit_service.dart';

class CallSession {
  const CallSession({
    required this.roomId,
    required this.callToken,
    required this.serverUrl,
    required this.isVideo,
  });

  final String roomId;
  final String callToken;
  final String serverUrl;
  final bool isVideo;
}

class CallsApiService {
  CallsApiService._();

  static Future<CallSession> createDmCall({
    required String peerUserId,
    required String participantName,
    required bool video,
  }) async {
    final roomName = await DmLiveKitService.getDmRoomName(peerUserId);
    final creds = await DmLiveKitService.getLiveKitToken(
      roomName: roomName,
      participantName: participantName,
    );
    return CallSession(
      roomId: roomName,
      callToken: creds['token']!,
      serverUrl: creds['url']!,
      isVideo: video,
    );
  }

  static Future<CallSession> joinCall({
    required String roomId,
    required String participantName,
    required bool video,
  }) async {
    final creds = await DmLiveKitService.getLiveKitToken(
      roomName: roomId,
      participantName: participantName,
    );
    return CallSession(
      roomId: roomId,
      callToken: creds['token']!,
      serverUrl: creds['url']!,
      isVideo: video,
    );
  }
}
