import 'message_reaction.dart';
import 'dm_message.dart' show DmLinkPreview;

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
    this.senderAvatarUrl,
    this.stickerReplyWelcomeEnabled = true,
    this.welcomeWaveDismissedByMe = false,
    this.linkPreviews = const [],
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
  final String? senderAvatarUrl;

  /// Server interaction setting; only used when [type] is `welcome`.
  final bool stickerReplyWelcomeEnabled;

  /// True when the current viewer already waved at this welcome message.
  final bool welcomeWaveDismissedByMe;

  /// Pre-fetched link previews (fetched server-side on message send).
  final List<DmLinkPreview> linkPreviews;

  ChannelMessage copyWith({
    String? id,
    String? channelId,
    String? senderId,
    String? senderName,
    String? content,
    DateTime? createdAt,
    String? type,
    String? voiceUrl,
    int? voiceDurationSec,
    String? giphyId,
    String? customStickerUrl,
    List<String>? attachments,
    List<MessageReaction>? reactions,
    bool? isPinned,
    DateTime? pinnedAt,
    ChannelReplyMessage? replyTo,
    String? senderAvatarUrl,
    bool? stickerReplyWelcomeEnabled,
    bool? welcomeWaveDismissedByMe,
    List<DmLinkPreview>? linkPreviews,
  }) {
    return ChannelMessage(
      id: id ?? this.id,
      channelId: channelId ?? this.channelId,
      senderId: senderId ?? this.senderId,
      senderName: senderName ?? this.senderName,
      content: content ?? this.content,
      createdAt: createdAt ?? this.createdAt,
      type: type ?? this.type,
      voiceUrl: voiceUrl ?? this.voiceUrl,
      voiceDurationSec: voiceDurationSec ?? this.voiceDurationSec,
      giphyId: giphyId ?? this.giphyId,
      customStickerUrl: customStickerUrl ?? this.customStickerUrl,
      attachments: attachments ?? this.attachments,
      reactions: reactions ?? this.reactions,
      isPinned: isPinned ?? this.isPinned,
      pinnedAt: pinnedAt ?? this.pinnedAt,
      replyTo: replyTo ?? this.replyTo,
      senderAvatarUrl: senderAvatarUrl ?? this.senderAvatarUrl,
      stickerReplyWelcomeEnabled:
          stickerReplyWelcomeEnabled ?? this.stickerReplyWelcomeEnabled,
      welcomeWaveDismissedByMe:
          welcomeWaveDismissedByMe ?? this.welcomeWaveDismissedByMe,
      linkPreviews: linkPreviews ?? this.linkPreviews,
    );
  }

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
      senderAvatarUrl: (() {
        final v = (sender['avatarUrl'] ?? sender['avatar'])?.toString().trim();
        if (v == null || v.isEmpty) return null;
        return v;
      })(),
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
      stickerReplyWelcomeEnabled: json['stickerReplyWelcomeEnabled'] != false,
      welcomeWaveDismissedByMe: json['welcomeWaveDismissedByMe'] == true,
      linkPreviews: () {
        final raw = json['linkPreviews'];
        if (raw is! List) return const <DmLinkPreview>[];
        return raw
            .whereType<Map>()
            .map((e) => DmLinkPreview.fromJson(Map<String, dynamic>.from(e)))
            .toList();
      }(),
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
