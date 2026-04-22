import 'livestream_create_service.dart';

class PendingLivestreamSession {
  const PendingLivestreamSession({
    required this.streamId,
    required this.title,
    required this.sourceMode,
    required this.latencyMode,
    required this.viewerDelaySeconds,
    this.cameraDeviceName,
    this.isFrontCamera,
  });

  final String streamId;
  final String title;
  final LivestreamSourceMode sourceMode;
  final LivestreamLatencyMode latencyMode;
  final int viewerDelaySeconds;
  final String? cameraDeviceName;
  final bool? isFrontCamera;
}

class LivestreamPendingSessionStore {
  static PendingLivestreamSession? _pending;

  static void setPending(PendingLivestreamSession session) {
    _pending = session;
  }

  static PendingLivestreamSession? getPending() => _pending;

  static void clear() {
    _pending = null;
  }
}
