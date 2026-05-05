class ServerSummary {
  const ServerSummary({
    required this.id,
    required this.name,
    this.description,
    this.avatarUrl,
    this.memberCount = 0,
    this.unreadCount = 0,
    this.ownerId,
    this.communityEnabled = false,
  });

  final String id;
  final String name;
  final String? description;
  final String? avatarUrl;
  final int memberCount;
  final int unreadCount;
  final String? ownerId;
  /// `communitySettings.enabled` từ API (GET server / danh sách server).
  final bool communityEnabled;

  factory ServerSummary.fromJson(Map<String, dynamic> json) {
    final rawOwner = json['ownerId'];
    String? oid;
    if (rawOwner is Map) {
      oid = (rawOwner['_id'] ?? rawOwner['id'])?.toString();
    } else if (rawOwner != null) {
      oid = rawOwner.toString();
    }
    final cs = json['communitySettings'];
    final communityOn =
        cs is Map ? cs['enabled'] == true : json['communityEnabled'] == true;
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
      ownerId: oid,
      communityEnabled: communityOn,
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
    this.isDefault = false,
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
  final bool isDefault;

  bool get isText => type.trim().toLowerCase() == 'text';

  bool get isVoice => type.trim().toLowerCase() == 'voice';

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
      isDefault: json['isDefault'] == true,
    );
  }
}
