class NotificationActor {
  const NotificationActor({
    required this.id,
    required this.displayName,
    required this.username,
    required this.avatarUrl,
  });

  final String id;
  final String displayName;
  final String username;
  final String avatarUrl;

  factory NotificationActor.fromJson(Map<String, dynamic>? json) {
    final data = json ?? const <String, dynamic>{};
    return NotificationActor(
      id: (data['id'] as String?) ?? '',
      displayName: (data['displayName'] as String?) ?? '',
      username: (data['username'] as String?) ?? '',
      avatarUrl: (data['avatarUrl'] as String?) ?? '',
    );
  }
}

class AppNotificationItem {
  const AppNotificationItem({
    required this.id,
    required this.type,
    required this.actor,
    required this.postKind,
    required this.likeCount,
    required this.commentCount,
    required this.mentionCount,
    required this.mentionSource,
    required this.readAt,
    required this.createdAt,
    required this.activityAt,
    this.isOwnPost,
    this.postMutedUntil,
    this.postMutedIndefinitely,
    this.postId,
    this.commentId,
    this.reportAudience,
    this.reportOutcome,
    this.moderationDecision,
    this.systemNoticeTitle,
    this.systemNoticeBody,
    this.systemNoticeLevel,
  });

  final String id;
  final String type;
  final NotificationActor actor;
  final String? postId;
  final String? commentId;
  final String postKind;
  final int likeCount;
  final int commentCount;
  final int mentionCount;
  final String mentionSource;
  final bool? isOwnPost;
  final String? postMutedUntil;
  final bool? postMutedIndefinitely;
  final String? reportAudience;
  final String? reportOutcome;
  final String? moderationDecision;
  final String? systemNoticeTitle;
  final String? systemNoticeBody;
  final String? systemNoticeLevel;
  final String? readAt;
  final String createdAt;
  final String activityAt;

  bool get isUnread => readAt == null;

  AppNotificationItem copyWith({
    String? readAt,
    bool resetReadAt = false,
    String? postMutedUntil,
    bool? postMutedIndefinitely,
  }) {
    return AppNotificationItem(
      id: id,
      type: type,
      actor: actor,
      postKind: postKind,
      likeCount: likeCount,
      commentCount: commentCount,
      mentionCount: mentionCount,
      mentionSource: mentionSource,
      isOwnPost: isOwnPost,
      postMutedUntil: postMutedUntil ?? this.postMutedUntil,
      postMutedIndefinitely:
          postMutedIndefinitely ?? this.postMutedIndefinitely,
      readAt: resetReadAt ? null : (readAt ?? this.readAt),
      createdAt: createdAt,
      activityAt: activityAt,
      postId: postId,
      commentId: commentId,
      reportAudience: reportAudience,
      reportOutcome: reportOutcome,
      moderationDecision: moderationDecision,
      systemNoticeTitle: systemNoticeTitle,
      systemNoticeBody: systemNoticeBody,
      systemNoticeLevel: systemNoticeLevel,
    );
  }

  factory AppNotificationItem.fromJson(Map<String, dynamic> json) {
    int asInt(dynamic value) => (value as num?)?.toInt() ?? 0;

    return AppNotificationItem(
      id: (json['id'] as String?) ?? '',
      type: (json['type'] as String?) ?? 'system_notice',
      actor: NotificationActor.fromJson(json['actor'] as Map<String, dynamic>?),
      postId: (json['postId'] ?? json['post_id']) as String?,
      commentId: (json['commentId'] ?? json['comment_id']) as String?,
      postKind: (json['postKind'] ?? json['post_kind']) as String? ?? 'post',
      likeCount: asInt(json['likeCount']),
      commentCount: asInt(json['commentCount']),
      mentionCount: asInt(json['mentionCount']),
      mentionSource: (json['mentionSource'] as String?) ?? 'post',
      isOwnPost: (json['isOwnPost'] ?? json['is_own_post']) as bool?,
      postMutedUntil:
          (json['postMutedUntil'] ?? json['post_muted_until']) as String?,
      postMutedIndefinitely:
          (json['postMutedIndefinitely'] ?? json['post_muted_indefinitely'])
              as bool?,
      reportAudience: json['reportAudience'] as String?,
      reportOutcome: json['reportOutcome'] as String?,
      moderationDecision: json['moderationDecision'] as String?,
      systemNoticeTitle: json['systemNoticeTitle'] as String?,
      systemNoticeBody: json['systemNoticeBody'] as String?,
      systemNoticeLevel: json['systemNoticeLevel'] as String?,
      readAt: json['readAt'] as String?,
      createdAt: (json['createdAt'] as String?) ?? '',
      activityAt:
          (json['activityAt'] as String?) ??
          (json['createdAt'] as String?) ??
          '',
    );
  }
}
