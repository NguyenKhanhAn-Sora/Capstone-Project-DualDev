sealed class InboxForYouItem {
  const InboxForYouItem();

  factory InboxForYouItem.fromJson(Map<String, dynamic> json) {
    var type =
        (json['type'] ?? json['Type'] ?? '').toString().trim().toLowerCase();
    if (type.isEmpty) {
      if (json.containsKey('inviterId') ||
          json.containsKey('inviterDisplay')) {
        type = 'server_invite';
      } else if (json.containsKey('topic') &&
          (json.containsKey('startAt') || json.containsKey('start_at'))) {
        type = 'event';
      } else if (json.containsKey('title') &&
          json.containsKey('content') &&
          json.containsKey('serverId')) {
        type = 'server_notification';
      }
    }
    switch (type) {
      case 'event':
        return InboxEventItem.fromJson(json);
      case 'server_invite':
        return InboxServerInviteItem.fromJson(json);
      case 'server_notification':
        return InboxServerNotificationItem.fromJson(json);
      default:
        return InboxUnknownForYouItem(raw: json);
    }
  }
}

class InboxUnknownForYouItem extends InboxForYouItem {
  const InboxUnknownForYouItem({required this.raw});
  final Map<String, dynamic> raw;
}

class InboxEventItem extends InboxForYouItem {
  const InboxEventItem({
    required this.id,
    required this.serverId,
    required this.serverName,
    this.serverAvatarUrl,
    this.topic,
    required this.startAt,
    required this.endAt,
    this.status,
    this.description,
    this.coverImageUrl,
    required this.createdAt,
    this.seen,
  });

  final String id;
  final String serverId;
  final String serverName;
  final String? serverAvatarUrl;
  final String? topic;
  final String startAt;
  final String endAt;
  final String? status;
  final String? description;
  final String? coverImageUrl;
  final String createdAt;
  final bool? seen;

  factory InboxEventItem.fromJson(Map<String, dynamic> json) {
    return InboxEventItem(
      id: (json['_id'] ?? json['id'] ?? '').toString(),
      serverId: (json['serverId'] ?? '').toString(),
      serverName: (json['serverName'] ?? '').toString(),
      serverAvatarUrl: json['serverAvatarUrl']?.toString(),
      topic: json['topic']?.toString(),
      startAt: (json['startAt'] ?? json['start_at'] ?? '').toString(),
      endAt: (json['endAt'] ?? json['end_at'] ?? '').toString(),
      status: json['status']?.toString(),
      description: json['description']?.toString(),
      coverImageUrl: json['coverImageUrl']?.toString(),
      createdAt: (json['createdAt'] ?? '').toString(),
      seen: json['seen'] as bool?,
    );
  }
}

class InboxServerInviteItem extends InboxForYouItem {
  const InboxServerInviteItem({
    required this.id,
    required this.serverId,
    required this.serverName,
    this.serverAvatarUrl,
    required this.inviterId,
    required this.inviterDisplay,
    required this.createdAt,
    this.seen,
  });

  final String id;
  final String serverId;
  final String serverName;
  final String? serverAvatarUrl;
  final String inviterId;
  final String inviterDisplay;
  final String createdAt;
  final bool? seen;

  factory InboxServerInviteItem.fromJson(Map<String, dynamic> json) {
    return InboxServerInviteItem(
      id: (json['_id'] ?? '').toString(),
      serverId: (json['serverId'] ?? '').toString(),
      serverName: (json['serverName'] ?? '').toString(),
      serverAvatarUrl: json['serverAvatarUrl']?.toString(),
      inviterId: (json['inviterId'] ?? '').toString(),
      inviterDisplay: (json['inviterDisplay'] ?? '').toString(),
      createdAt: (json['createdAt'] ?? '').toString(),
      seen: json['seen'] as bool?,
    );
  }
}

class InboxServerNotificationItem extends InboxForYouItem {
  const InboxServerNotificationItem({
    required this.id,
    required this.serverId,
    required this.serverName,
    this.serverAvatarUrl,
    required this.title,
    required this.content,
    this.targetRoleName,
    required this.createdAt,
    this.seen,
  });

  final String id;
  final String serverId;
  final String serverName;
  final String? serverAvatarUrl;
  final String title;
  final String content;
  final String? targetRoleName;
  final String createdAt;
  final bool? seen;

  factory InboxServerNotificationItem.fromJson(Map<String, dynamic> json) {
    return InboxServerNotificationItem(
      id: (json['_id'] ?? '').toString(),
      serverId: (json['serverId'] ?? '').toString(),
      serverName: (json['serverName'] ?? '').toString(),
      serverAvatarUrl: json['serverAvatarUrl']?.toString(),
      title: (json['title'] ?? '').toString(),
      content: (json['content'] ?? '').toString(),
      targetRoleName: json['targetRoleName']?.toString(),
      createdAt: (json['createdAt'] ?? '').toString(),
      seen: json['seen'] as bool?,
    );
  }
}

sealed class InboxUnreadItem {
  const InboxUnreadItem();

  factory InboxUnreadItem.fromJson(Map<String, dynamic> json) {
    var type = (json['type'] ?? json['Type'] ?? '').toString().trim().toLowerCase();
    if (type.isEmpty &&
        json.containsKey('userId') &&
        (json.containsKey('displayName') || json.containsKey('username'))) {
      type = 'dm';
    }
    if (type.isEmpty &&
        json.containsKey('channelId') &&
        json.containsKey('serverId')) {
      type = 'channel';
    }
    if (type == 'dm') {
      return InboxUnreadDmItem.fromJson(json);
    }
    return InboxUnreadChannelItem.fromJson(json);
  }
}

class InboxUnreadDmItem extends InboxUnreadItem {
  const InboxUnreadDmItem({
    required this.userId,
    required this.displayName,
    required this.username,
    required this.lastMessage,
    required this.lastMessageAt,
    required this.unreadCount,
  });

  final String userId;
  final String displayName;
  final String username;
  final String lastMessage;
  final String lastMessageAt;
  final int unreadCount;

  factory InboxUnreadDmItem.fromJson(Map<String, dynamic> json) {
    final uc = json['unreadCount'];
    return InboxUnreadDmItem(
      userId: (json['userId'] ?? '').toString(),
      displayName: (json['displayName'] ?? '').toString(),
      username: (json['username'] ?? '').toString(),
      lastMessage: (json['lastMessage'] ?? '').toString(),
      lastMessageAt: (json['lastMessageAt'] ?? '').toString(),
      unreadCount: uc is num ? uc.toInt() : int.tryParse('$uc') ?? 0,
    );
  }
}

class InboxUnreadChannelItem extends InboxUnreadItem {
  const InboxUnreadChannelItem({
    required this.channelId,
    required this.channelName,
    required this.serverId,
    required this.serverName,
    required this.lastMessage,
    required this.lastMessageAt,
    this.unreadCount,
  });

  final String channelId;
  final String channelName;
  final String serverId;
  final String serverName;
  final String lastMessage;
  final String lastMessageAt;
  final int? unreadCount;

  factory InboxUnreadChannelItem.fromJson(Map<String, dynamic> json) {
    final uc = json['unreadCount'];
    return InboxUnreadChannelItem(
      channelId: (json['channelId'] ?? '').toString(),
      channelName: (json['channelName'] ?? '').toString(),
      serverId: (json['serverId'] ?? '').toString(),
      serverName: (json['serverName'] ?? '').toString(),
      lastMessage: (json['lastMessage'] ?? '').toString(),
      lastMessageAt: (json['lastMessageAt'] ?? '').toString(),
      unreadCount: uc is num ? uc.toInt() : int.tryParse('$uc'),
    );
  }
}

class InboxMentionItem {
  const InboxMentionItem({
    required this.id,
    required this.channelId,
    required this.channelName,
    required this.serverId,
    required this.serverName,
    required this.messageId,
    required this.actorName,
    this.excerpt,
    required this.createdAt,
    this.seen,
  });

  final String id;
  final String channelId;
  final String channelName;
  final String serverId;
  final String serverName;
  final String messageId;
  final String actorName;
  final String? excerpt;
  final String createdAt;
  final bool? seen;

  factory InboxMentionItem.fromJson(Map<String, dynamic> json) {
    return InboxMentionItem(
      id: (json['id'] ?? '').toString(),
      channelId: (json['channelId'] ?? '').toString(),
      channelName: (json['channelName'] ?? '').toString(),
      serverId: (json['serverId'] ?? '').toString(),
      serverName: (json['serverName'] ?? '').toString(),
      messageId: (json['messageId'] ?? json['id'] ?? '').toString(),
      actorName: (json['actorName'] ?? '').toString(),
      excerpt: json['excerpt']?.toString(),
      createdAt: (json['createdAt'] ?? '').toString(),
      seen: json['seen'] as bool?,
    );
  }
}
