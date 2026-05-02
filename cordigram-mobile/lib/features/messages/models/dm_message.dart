import 'message_reaction.dart';

class DmMessage {
  const DmMessage({
    required this.id,
    required this.senderId,
    required this.receiverId,
    required this.content,
    required this.createdAt,
    required this.type,
    required this.read,
    this.voiceUrl,
    this.voiceDurationSec,
    this.giphyId,
    this.replyTo,
    this.attachments = const [],
    this.reactions = const [],
  });

  final String id;
  final String senderId;
  final String receiverId;
  final String content;
  final DateTime createdAt;
  final String type;
  final bool read;
  final String? voiceUrl;
  final int? voiceDurationSec;
  final String? giphyId;
  final DmReplyMessage? replyTo;
  final List<String> attachments;
  final List<MessageReaction> reactions;

  bool isMine(String? viewerId) => viewerId != null && senderId == viewerId;

  factory DmMessage.fromJson(Map<String, dynamic> json) {
    final reactionsRaw = json['reactions'];
    final attachmentsRaw = json['attachments'];
    final createdAtRaw = json['createdAt'] ?? json['timestamp'];

    String pickUserId(dynamic value) {
      if (value is Map) {
        final id = value['_id'] ?? value['id'] ?? value['userId'];
        return id?.toString() ?? '';
      }
      return value?.toString() ?? '';
    }

    return DmMessage(
      id: (json['_id'] ?? json['id'] ?? '').toString(),
      senderId: pickUserId(json['senderId'] ?? json['sender']),
      receiverId: pickUserId(json['receiverId']),
      content: (json['content'] ?? '').toString(),
      createdAt:
          DateTime.tryParse(createdAtRaw?.toString() ?? '')?.toLocal() ??
          DateTime.now(),
      type: (json['type'] ?? 'text').toString(),
      read: (json['read'] == true || json['isRead'] == true),
      voiceUrl: json['voiceUrl']?.toString(),
      voiceDurationSec: json['voiceDuration'] is num
          ? (json['voiceDuration'] as num).toInt()
          : null,
      giphyId: json['giphyId']?.toString(),
      replyTo: json['replyTo'] is Map
          ? DmReplyMessage.fromJson(Map<String, dynamic>.from(json['replyTo']))
          : null,
      attachments: attachmentsRaw is List
          ? attachmentsRaw.map((e) => e.toString()).toList()
          : const <String>[],
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

class DmReplyMessage {
  const DmReplyMessage({
    required this.id,
    required this.content,
    required this.senderId,
    this.senderName,
    this.type,
    this.voiceUrl,
    this.voiceDurationSec,
  });

  final String id;
  final String content;
  final String senderId;
  final String? senderName;
  final String? type;
  final String? voiceUrl;
  final int? voiceDurationSec;

  factory DmReplyMessage.fromJson(Map<String, dynamic> json) {
    final sender = json['senderId'];
    final senderId = sender is Map
        ? (sender['_id'] ?? sender['id'] ?? sender['userId'] ?? '').toString()
        : (sender?.toString() ?? '');
    final senderName = sender is Map
        ? (sender['displayName'] ?? sender['username'] ?? sender['email'])
              ?.toString()
              .trim()
        : null;
    return DmReplyMessage(
      id: (json['_id'] ?? json['id'] ?? '').toString(),
      content: (json['content'] ?? '').toString(),
      senderId: senderId,
      senderName: senderName?.isEmpty == true ? null : senderName,
      type: json['type']?.toString(),
      voiceUrl: json['voiceUrl']?.toString(),
      voiceDurationSec: json['voiceDuration'] is num
          ? (json['voiceDuration'] as num).toInt()
          : null,
    );
  }
}
