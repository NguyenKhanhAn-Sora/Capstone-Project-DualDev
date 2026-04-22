class MessageReaction {
  const MessageReaction({
    required this.emoji,
    required this.count,
    required this.userIds,
  });

  final String emoji;
  final int count;
  final List<String> userIds;

  factory MessageReaction.fromJson(Map<String, dynamic> json) {
    final usersRaw = json['users'];
    final users = usersRaw is List
        ? usersRaw.map((e) => e.toString()).toList()
        : const <String>[];
    final countRaw = json['count'];
    return MessageReaction(
      emoji: (json['emoji'] ?? '').toString(),
      count: countRaw is num ? countRaw.toInt() : users.length,
      userIds: users,
    );
  }
}
