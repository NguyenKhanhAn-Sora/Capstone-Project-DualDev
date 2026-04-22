import 'message_reaction.dart';

class ChannelMessage {
  const ChannelMessage({
    required this.id,
    required this.channelId,
    required this.senderId,
    required this.senderName,
    required this.content,
    required this.createdAt,
    this.reactions = const [],
  });

  final String id;
  final String channelId;
  final String senderId;
  final String senderName;
  final String content;
  final DateTime createdAt;
  final List<MessageReaction> reactions;

  factory ChannelMessage.fromJson(Map<String, dynamic> json) {
    final senderRaw = json['sender'];
    final sender = senderRaw is Map
        ? Map<String, dynamic>.from(senderRaw)
        : const <String, dynamic>{};
    final reactionsRaw = json['reactions'];
    return ChannelMessage(
      id: (json['_id'] ?? json['id'] ?? '').toString(),
      channelId: (json['channelId'] ?? '').toString(),
      senderId: (sender['_id'] ?? json['senderId'] ?? '').toString(),
      senderName: (sender['displayName'] ?? sender['username'] ?? '')
          .toString(),
      content: (json['content'] ?? '').toString(),
      createdAt:
          DateTime.tryParse((json['createdAt'] ?? '').toString())?.toLocal() ??
          DateTime.now(),
      reactions: reactionsRaw is List
          ? reactionsRaw
                .whereType<Map>()
                .map(
                  (e) => MessageReaction.fromJson(Map<String, dynamic>.from(e)),
                )
                .toList()
          : const <MessageReaction>[],
    );
  }
}
