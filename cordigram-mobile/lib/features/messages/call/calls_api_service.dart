import '../services/dm_livekit_service.dart';

/// Immutable result used by the native call screen. Carries everything the
/// `livekit_client` SDK needs — no URL / browser session required.
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

/// Thin wrapper around the **existing** backend endpoints that the web app
/// already uses successfully:
///
///   - `POST /livekit/room-name` → deterministic DM room id from two user ids
///   - `POST /livekit/token`     → LiveKit JWT + server URL
///
/// Why these and not `/calls/create`?
///   The new `/calls/*` controller is a nice-to-have, but it has to ship with
///   the running backend to work; the web flow has proven `/livekit/*` works
///   in production, and mobile ↔ web interop is automatic because both sides
///   derive the same `roomName` from the same pair of user ids and mint their
///   own tokens against the same LiveKit server.
class CallsApiService {
  CallsApiService._();

  /// Caller side: compute the room id + mint a token for the current user.
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

  /// Callee side / "answer" path: we already know the roomId (peer told us),
  /// so just mint a token against it.
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
