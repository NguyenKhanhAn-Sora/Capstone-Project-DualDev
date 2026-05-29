// Server-driven DM call session snapshot (cross-device), mirrors web
// call-session-sync.ts.

class DmCallSessionSyncItem {
  const DmCallSessionSyncItem({
    required this.peerId,
    required this.role,
    required this.phase,
    required this.type,
  });

  final String peerId;
  final String role; // initiator | callee
  final String phase; // ringing | connected
  final String type; // audio | video
}

class DmCallSessionsSyncPayload {
  const DmCallSessionsSyncPayload({
    required this.sessions,
    required this.at,
  });

  final List<DmCallSessionSyncItem> sessions;
  final int at;
}

DmCallSessionsSyncPayload? parseCallSessionsSyncPayload(dynamic raw) {
  if (raw is! Map) return null;
  final data = Map<String, dynamic>.from(raw);
  final list = data['sessions'];
  if (list is! List) return null;
  final sessions = <DmCallSessionSyncItem>[];
  for (final item in list) {
    if (item is! Map) continue;
    final row = Map<String, dynamic>.from(item);
    final peerId = (row['peerId'] ?? '').toString().trim();
    if (peerId.isEmpty) continue;
    sessions.add(
      DmCallSessionSyncItem(
        peerId: peerId,
        role: row['role']?.toString() == 'callee' ? 'callee' : 'initiator',
        phase: row['phase']?.toString() == 'connected' ? 'connected' : 'ringing',
        type: row['type']?.toString() == 'audio' ? 'audio' : 'video',
      ),
    );
  }
  final atRaw = data['at'];
  final at = atRaw is int
      ? atRaw
      : (atRaw is num ? atRaw.toInt() : DateTime.now().millisecondsSinceEpoch);
  return DmCallSessionsSyncPayload(sessions: sessions, at: at);
}

bool isBusyWithPeer(List<DmCallSessionSyncItem> sessions, String peerId) {
  final id = peerId.trim();
  return sessions.any((s) => s.peerId == id);
}

bool canMobileInitiateCall(List<DmCallSessionSyncItem> sessions) {
  return sessions.isEmpty;
}
