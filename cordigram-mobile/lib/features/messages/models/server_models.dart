class ServerSummary {
  const ServerSummary({
    required this.id,
    required this.name,
    this.description,
    this.avatarUrl,
    this.memberCount = 0,
    this.unreadCount = 0,
  });

  final String id;
  final String name;
  final String? description;
  final String? avatarUrl;
  final int memberCount;
  final int unreadCount;

  factory ServerSummary.fromJson(Map<String, dynamic> json) {
    return ServerSummary(
      id: (json['_id'] ?? json['id'] ?? '').toString(),
      name: (json['name'] ?? '').toString(),
      description: json['description']?.toString(),
      avatarUrl: json['avatarUrl']?.toString(),
      memberCount: json['memberCount'] is num
          ? (json['memberCount'] as num).toInt()
          : 0,
      unreadCount: json['unreadCount'] is num
          ? (json['unreadCount'] as num).toInt()
          : 0,
    );
  }
}

class ServerCategory {
  const ServerCategory({
    required this.id,
    required this.name,
    required this.position,
    this.type = 'mixed',
  });

  final String id;
  final String name;
  final int position;
  final String type;

  factory ServerCategory.fromJson(Map<String, dynamic> json) {
    return ServerCategory(
      id: (json['_id'] ?? json['id'] ?? '').toString(),
      name: (json['name'] ?? '').toString(),
      position: json['position'] is num ? (json['position'] as num).toInt() : 0,
      type: (json['type'] ?? 'mixed').toString(),
    );
  }
}

class ServerChannel {
  const ServerChannel({
    required this.id,
    required this.serverId,
    required this.name,
    required this.type,
    this.description,
    this.category,
    this.categoryId,
    this.position = 0,
    this.isPrivate = false,
    this.unreadCount = 0,
  });

  final String id;
  final String serverId;
  final String name;
  final String type;
  final String? description;
  final String? category;
  final String? categoryId;
  final int position;
  final bool isPrivate;
  final int unreadCount;

  bool get isText => type == 'text';
  bool get isVoice => type == 'voice';

  factory ServerChannel.fromJson(Map<String, dynamic> json) {
    return ServerChannel(
      id: (json['_id'] ?? json['id'] ?? '').toString(),
      serverId: (json['serverId'] ?? '').toString(),
      name: (json['name'] ?? '').toString(),
      type: (json['type'] ?? 'text').toString(),
      description: json['description']?.toString(),
      category: json['category']?.toString(),
      categoryId: json['categoryId']?.toString(),
      position: json['position'] is num ? (json['position'] as num).toInt() : 0,
      isPrivate: json['isPrivate'] == true,
      unreadCount: json['unreadCount'] is num
          ? (json['unreadCount'] as num).toInt()
          : 0,
    );
  }
}
