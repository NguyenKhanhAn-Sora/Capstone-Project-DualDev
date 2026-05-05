/// Mirrors cordigram-web `Role` / `RolePermissions` / members-with-roles.
library;

const List<String> kRolePermissionKeys = [
  'manageServer',
  'manageChannels',
  'manageEvents',
  'manageExpressions',
  'createInvite',
  'changeNickname',
  'manageNicknames',
  'kickMembers',
  'banMembers',
  'timeoutMembers',
  'mentionEveryone',
  'sendMessages',
  'sendMessagesInThreads',
  'embedLinks',
  'attachFiles',
  'addReactions',
  'manageMessages',
  'pinMessages',
  'viewMessageHistory',
  'sendVoiceMessages',
  'createPolls',
  'connect',
  'speak',
  'video',
  'muteMembers',
  'deafenMembers',
  'moveMembers',
  'setVoiceChannelStatus',
];

class RolePermissions {
  RolePermissions([Map<String, bool>? raw]) {
    for (final k in kRolePermissionKeys) {
      _m[k] = raw?[k] ?? false;
    }
  }

  final Map<String, bool> _m = {};

  bool operator [](String key) => _m[key] ?? false;

  void operator []=(String key, bool value) {
    if (kRolePermissionKeys.contains(key)) _m[key] = value;
  }

  /// Bản sao độc lập (chỉnh sửa quyền trên màn vai trò).
  RolePermissions copy() => RolePermissions(Map<String, bool>.from(_m));

  Map<String, dynamic> toJson() {
    final out = <String, dynamic>{};
    for (final k in kRolePermissionKeys) {
      out[k] = _m[k] ?? false;
    }
    return out;
  }

  static RolePermissions fromJson(dynamic raw) {
    if (raw is! Map) return RolePermissions();
    final parsed = <String, bool>{};
    for (final k in kRolePermissionKeys) {
      parsed[k] = raw[k] == true;
    }
    return RolePermissions(parsed);
  }
}

class ServerRole {
  const ServerRole({
    required this.id,
    required this.name,
    required this.color,
    required this.serverId,
    required this.position,
    required this.displaySeparately,
    required this.mentionable,
    required this.isDefault,
    required this.permissions,
    required this.memberIds,
    this.icon,
  });

  final String id;
  final String name;
  final String color;
  final String? icon;
  final String serverId;
  final int position;
  final bool displaySeparately;
  final bool mentionable;
  final bool isDefault;
  final RolePermissions permissions;
  final List<String> memberIds;

  factory ServerRole.fromJson(Map<String, dynamic> json) {
    final rawMembers = json['memberIds'];
    final ids = <String>[];
    if (rawMembers is List) {
      for (final e in rawMembers) {
        ids.add(e.toString());
      }
    }
    return ServerRole(
      id: (json['_id'] ?? json['id'] ?? '').toString(),
      name: (json['name'] ?? '').toString(),
      color: (json['color'] ?? '#99AAB5').toString(),
      icon: json['icon']?.toString(),
      serverId: (json['serverId'] ?? '').toString(),
      position: json['position'] is num ? (json['position'] as num).toInt() : 0,
      displaySeparately: json['displaySeparately'] == true,
      mentionable: json['mentionable'] == true,
      isDefault: json['isDefault'] == true,
      permissions: RolePermissions.fromJson(json['permissions']),
      memberIds: ids,
    );
  }
}

class MemberWithRolesRow {
  const MemberWithRolesRow({
    required this.userId,
    required this.displayName,
    required this.username,
    required this.avatarUrl,
    required this.joinedAt,
    required this.serverMemberRole,
    this.isOwner = false,
    this.nickname,
  });

  final String userId;
  final String displayName;
  final String username;
  final String avatarUrl;
  final String joinedAt;
  final String serverMemberRole;
  final bool isOwner;
  final String? nickname;

  factory MemberWithRolesRow.fromJson(Map<String, dynamic> json) {
    return MemberWithRolesRow(
      userId: (json['userId'] ?? '').toString(),
      displayName: (json['displayName'] ?? '').toString(),
      username: (json['username'] ?? '').toString(),
      avatarUrl: (json['avatarUrl'] ?? '').toString(),
      joinedAt: (json['joinedAt'] ?? '').toString(),
      serverMemberRole: (json['serverMemberRole'] ?? 'member').toString(),
      isOwner: json['isOwner'] == true,
      nickname: json['nickname']?.toString(),
    );
  }
}

class MembersWithRolesResult {
  const MembersWithRolesResult({
    required this.members,
    required this.canKick,
    required this.canBan,
    required this.canTimeout,
    required this.listIsOwner,
  });

  final List<MemberWithRolesRow> members;
  final bool canKick;
  final bool canBan;
  final bool canTimeout;
  final bool listIsOwner;
}
