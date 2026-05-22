enum PresenceStatus { online, idle, offline }

class PresenceState {
  const PresenceState({
    required this.userId,
    required this.status,
    this.lastActiveAt,
  });

  final String userId;
  final PresenceStatus status;
  final DateTime? lastActiveAt;

  factory PresenceState.fromJson(Map<String, dynamic> json) {
    final raw = (json['status'] ?? 'offline').toString().toLowerCase();
    final status = switch (raw) {
      'online' => PresenceStatus.online,
      'idle' => PresenceStatus.idle,
      _ => PresenceStatus.offline,
    };
    final lastRaw = json['lastActiveAt'];
    return PresenceState(
      userId: (json['userId'] ?? '').toString(),
      status: status,
      lastActiveAt: lastRaw == null
          ? null
          : DateTime.tryParse(lastRaw.toString())?.toLocal(),
    );
  }
}
