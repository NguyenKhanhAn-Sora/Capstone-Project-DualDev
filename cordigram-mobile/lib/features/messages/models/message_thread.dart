class MessageThread {
  const MessageThread({
    required this.id,
    required this.name,
    required this.lastMessage,
    required this.lastActiveLabel,
    required this.unreadCount,
    this.avatarUrl,
    this.isOnline = false,
    this.isPinned = false,
  });

  final String id;
  final String name;
  final String lastMessage;
  final String lastActiveLabel;
  final int unreadCount;
  final String? avatarUrl;
  final bool isOnline;
  final bool isPinned;
}
