import 'message_reaction.dart';

class ChannelMessage {
  const ChannelMessage({
    required this.id,
    required this.channelId,
    required this.senderId,
    required this.senderName,
    required this.content,
    required this.createdAt,
    this.type = 'text',
    this.voiceUrl,
    this.voiceDurationSec,
    this.giphyId,
    this.customStickerUrl,
    this.attachments = const [],
    this.reactions = const [],
    this.isPinned = false,
    this.pinnedAt,
    this.replyTo,
  });

  final String id;
  final String channelId;
  final String senderId;
  final String senderName;
  final String content;
  final DateTime createdAt;
  final String type;
  final String? voiceUrl;
  final int? voiceDurationSec;
  final String? giphyId;
  final String? customStickerUrl;
  final List<String> attachments;
  final List<MessageReaction> reactions;
  final bool isPinned;
  final DateTime? pinnedAt;
  final ChannelReplyMessage? replyTo;

  factory ChannelMessage.fromJson(Map<String, dynamic> json) {
    final senderRaw = json['sender'] ?? json['senderId'];
    final sender = senderRaw is Map
        ? Map<String, dynamic>.from(senderRaw)
        : const <String, dynamic>{};
    final reactionsRaw = json['reactions'];
    return ChannelMessage(
      id: (json['_id'] ?? json['id'] ?? '').toString(),
      channelId: (json['channelId'] is Map
              ? (json['channelId'] as Map)['_id']
              : json['channelId'])?.toString() ??
          '',
      senderId: (sender['_id'] ?? json['senderId'] ?? '').toString(),
      senderName: (sender['displayName'] ?? sender['username'] ?? '')
          .toString(),
      content: (json['content'] ?? '').toString(),
      type: (json['messageType'] ?? json['type'] ?? 'text').toString(),
      voiceUrl: (() {
        final v = json['voiceUrl']?.toString().trim();
        if ((v ?? '').isNotEmpty) return v;
        final content = (json['content'] ?? '').toString().trim();
        if (content.startsWith('http://') || content.startsWith('https://')) {
          return content;
        }
        return null;
      })(),
      voiceDurationSec: json['voiceDuration'] is num
          ? (json['voiceDuration'] as num).toInt()
          : null,
      giphyId: json['giphyId']?.toString(),
      customStickerUrl: json['customStickerUrl']?.toString(),
      attachments: (json['attachments'] as List?)
              ?.map((e) => e?.toString() ?? '')
              .where((e) => e.isNotEmpty)
              .toList() ??
          const <String>[],
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
      isPinned: json['isPinned'] == true,
      pinnedAt: DateTime.tryParse((json['pinnedAt'] ?? '').toString())?.toLocal(),
      replyTo: json['replyTo'] is Map
          ? ChannelReplyMessage.fromJson(
              Map<String, dynamic>.from(json['replyTo']),
            )
          : null,
    );
  }
}

class ChannelReplyMessage {
  const ChannelReplyMessage({
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

  factory ChannelReplyMessage.fromJson(Map<String, dynamic> json) {
    final sender = json['senderId'];
    final senderId = sender is Map
        ? (sender['_id'] ?? sender['id'] ?? sender['userId'] ?? '').toString()
        : (sender?.toString() ?? '');
    final senderName = sender is Map
        ? (sender['displayName'] ?? sender['username'] ?? sender['email'])
              ?.toString()
              .trim()
        : null;
    return ChannelReplyMessage(
      id: (json['_id'] ?? json['id'] ?? '').toString(),
      content: (json['content'] ?? '').toString(),
      senderId: senderId,
      senderName: senderName?.isEmpty == true ? null : senderName,
      type: json['messageType']?.toString(),
      voiceUrl: json['voiceUrl']?.toString(),
      voiceDurationSec: json['voiceDuration'] is num
          ? (json['voiceDuration'] as num).toInt()
          : null,
    );
  }
}
