import 'message_reaction.dart';

class DmLinkPreview {
  const DmLinkPreview({
    required this.url,
    this.canonicalUrl,
    this.domain,
    this.siteName,
    this.title,
    this.description,
    this.image,
    this.favicon,
  });

  final String url;
  final String? canonicalUrl;
  final String? domain;
  final String? siteName;
  final String? title;
  final String? description;
  final String? image;
  final String? favicon;

  factory DmLinkPreview.fromJson(Map<String, dynamic> j) => DmLinkPreview(
        url: (j['url'] ?? '').toString(),
        canonicalUrl: j['canonicalUrl']?.toString(),
        domain: j['domain']?.toString(),
        siteName: j['siteName']?.toString(),
        title: j['title']?.toString(),
        description: j['description']?.toString(),
        image: j['image']?.toString(),
        favicon: j['favicon']?.toString(),
      );
}

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
    this.linkPreviews = const [],
    this.isPinned = false,
    this.pinnedAt,
    this.senderDisplayName,
    this.senderUsername,
    this.senderAvatarUrl,
    this.receiverDisplayName,
    this.receiverUsername,
    this.receiverAvatarUrl,
    this.callType,
    this.callStatus,
    this.callDurationSec,
    this.callInitiatorId,
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
  final List<DmLinkPreview> linkPreviews;
  final bool isPinned;
  final DateTime? pinnedAt;
  final String? senderDisplayName;
  final String? senderUsername;
  final String? senderAvatarUrl;
  final String? receiverDisplayName;
  final String? receiverUsername;
  final String? receiverAvatarUrl;
  final String? callType;
  final String? callStatus;
  final int? callDurationSec;
  final String? callInitiatorId;

  bool get isCallMessage => type == 'call';

  bool isMissedCallFor(String? viewerId) {
    if (!isCallMessage) return false;
    final status = callStatus ?? 'missed';
    if (status != 'missed' &&
        status != 'declined' &&
        status != 'cancelled') {
      return false;
    }
    final initiator = callInitiatorId ?? senderId;
    return viewerId != null && initiator != viewerId;
  }

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

    String? pickDisplayName(dynamic value) {
      if (value is! Map) return null;
      final v = (value['displayName'] ?? value['username'] ?? value['email'])
          ?.toString()
          .trim();
      if (v == null || v.isEmpty) return null;
      return v;
    }

    String? pickUsername(dynamic value) {
      if (value is! Map) return null;
      final v = value['username']?.toString().trim();
      if (v == null || v.isEmpty) return null;
      return v;
    }

    String? pickAvatar(dynamic value) {
      if (value is! Map) return null;
      final v = (value['avatarUrl'] ?? value['avatar'])?.toString().trim();
      if (v == null || v.isEmpty) return null;
      return v;
    }

    final senderRaw = json['senderId'] ?? json['sender'];
    final receiverRaw = json['receiverId'];

    return DmMessage(
      id: (json['_id'] ?? json['id'] ?? '').toString(),
      senderId: pickUserId(senderRaw),
      receiverId: pickUserId(receiverRaw),
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
      linkPreviews: () {
        final raw = json['linkPreviews'];
        if (raw is! List) return const <DmLinkPreview>[];
        return raw
            .whereType<Map>()
            .map((e) => DmLinkPreview.fromJson(Map<String, dynamic>.from(e)))
            .toList();
      }(),
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
      senderDisplayName: pickDisplayName(senderRaw),
      senderUsername: pickUsername(senderRaw),
      senderAvatarUrl: pickAvatar(senderRaw),
      receiverDisplayName: pickDisplayName(receiverRaw),
      receiverUsername: pickUsername(receiverRaw),
      receiverAvatarUrl: pickAvatar(receiverRaw),
      callType: json['callType']?.toString(),
      callStatus: json['callStatus']?.toString(),
      callDurationSec: json['callDuration'] is num
          ? (json['callDuration'] as num).toInt()
          : null,
      callInitiatorId: pickUserId(json['callInitiatorId']),
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
