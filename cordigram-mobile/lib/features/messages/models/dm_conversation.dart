class DmConversation {
  const DmConversation({
    required this.userId,
    required this.displayName,
    required this.username,
    required this.lastMessage,
    required this.lastMessageAt,
    required this.unreadCount,
    this.avatarUrl,
    this.isOnline = false,
    this.lastActiveAt,
    this.lastMessageType,
    this.lastCallType,
    this.lastCallStatus,
    this.lastCallDurationSec,
    this.lastCallInitiatorId,
  });

  final String userId;
  final String displayName;
  final String username;
  final String lastMessage;
  final DateTime? lastMessageAt;
  final int unreadCount;
  final String? avatarUrl;
  final bool isOnline;
  final DateTime? lastActiveAt;
  final String? lastMessageType;
  final String? lastCallType;
  final String? lastCallStatus;
  final int? lastCallDurationSec;
  final String? lastCallInitiatorId;

  String get title => displayName.isNotEmpty ? displayName : username;

  factory DmConversation.fromJson(Map<String, dynamic> json) {
    final peer = json['peer'];
    final peerMap = peer is Map ? Map<String, dynamic>.from(peer) : json;
    final lastAt =
        json['lastMessageAt'] ?? json['lastMessageTime'] ?? json['updatedAt'];
    final unreadRaw = json['unreadCount'] ?? json['unread'];

    return DmConversation(
      userId: (peerMap['_id'] ?? peerMap['id'] ?? json['userId'] ?? '')
          .toString(),
      displayName: (peerMap['displayName'] ?? json['displayName'] ?? '')
          .toString(),
      username: (peerMap['username'] ?? json['username'] ?? '').toString(),
      lastMessage: (json['lastMessage'] ?? '').toString(),
      lastMessageType: json['lastMessageType']?.toString(),
      lastCallType: json['lastCallType']?.toString(),
      lastCallStatus: json['lastCallStatus']?.toString(),
      lastCallDurationSec: json['lastCallDuration'] is num
          ? (json['lastCallDuration'] as num).toInt()
          : int.tryParse(json['lastCallDuration']?.toString() ?? ''),
      lastCallInitiatorId: json['lastCallInitiatorId']?.toString(),
      lastMessageAt: DateTime.tryParse(lastAt?.toString() ?? '')?.toLocal(),
      unreadCount: unreadRaw is num ? unreadRaw.toInt() : 0,
      avatarUrl: (peerMap['avatar'] ?? json['avatar'])?.toString(),
      isOnline:
          (peerMap['isOnline'] is bool
              ? peerMap['isOnline'] as bool
              : (json['isOnline'] is bool ? json['isOnline'] as bool : null)) ??
          ((peerMap['email'] ?? json['email'])?.toString().toLowerCase().contains('đang hoạt động') ??
              false),
      lastActiveAt: DateTime.tryParse(
            (json['lastActiveAt'] ?? peerMap['lastActiveAt'])?.toString() ?? '',
          )?.toLocal(),
    );
  }
}
