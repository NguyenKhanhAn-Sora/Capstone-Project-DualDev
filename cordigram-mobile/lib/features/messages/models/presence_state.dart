enum PresenceStatus { online, idle, offline }

class PresenceState {
  const PresenceState({required this.userId, required this.status});

  final String userId;
  final PresenceStatus status;

  factory PresenceState.fromJson(Map<String, dynamic> json) {
    final raw = (json['status'] ?? 'offline').toString().toLowerCase();
    final status = switch (raw) {
      'online' => PresenceStatus.online,
      'idle' => PresenceStatus.idle,
      _ => PresenceStatus.offline,
    };
    return PresenceState(
      userId: (json['userId'] ?? '').toString(),
      status: status,
    );
  }
}
