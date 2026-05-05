/// Mirrors web [CurrentUserServerPermissions] / GET `/servers/:id/my-permissions`.
class CurrentUserServerPermissions {
  const CurrentUserServerPermissions({
    required this.isOwner,
    required this.hasCustomRole,
    required this.canKick,
    required this.canBan,
    required this.canTimeout,
    required this.canManageServer,
    required this.canManageChannels,
    required this.canManageEvents,
    required this.canManageExpressions,
    required this.canCreateInvite,
    this.mentionEveryone = false,
  });

  final bool isOwner;
  final bool hasCustomRole;
  final bool canKick;
  final bool canBan;
  final bool canTimeout;
  final bool canManageServer;
  final bool canManageChannels;
  final bool canManageEvents;
  final bool canManageExpressions;
  final bool canCreateInvite;
  final bool mentionEveryone;

  bool get canManageChannelsStructure =>
      isOwner || (canManageServer && canManageChannels);

  bool get canAccessPrivateChannel =>
      isOwner || canManageServer || canManageChannels;

  factory CurrentUserServerPermissions.fromJson(Map<String, dynamic> json) {
    bool b(String k, {bool def = false}) {
      final v = json[k];
      if (v is bool) return v;
      return def;
    }

    return CurrentUserServerPermissions(
      isOwner: b('isOwner'),
      hasCustomRole: b('hasCustomRole'),
      canKick: b('canKick'),
      canBan: b('canBan'),
      canTimeout: b('canTimeout'),
      canManageServer: b('canManageServer'),
      canManageChannels: b('canManageChannels'),
      canManageEvents: b('canManageEvents'),
      canManageExpressions: b('canManageExpressions'),
      canCreateInvite: b('canCreateInvite', def: true),
      mentionEveryone: b('mentionEveryone'),
    );
  }

  /// Owner-only fallback when API fails (same idea as web messages page).
  factory CurrentUserServerPermissions.ownerFallback() {
    return const CurrentUserServerPermissions(
      isOwner: true,
      hasCustomRole: true,
      canKick: true,
      canBan: true,
      canTimeout: true,
      canManageServer: true,
      canManageChannels: true,
      canManageEvents: true,
      canManageExpressions: true,
      canCreateInvite: true,
      mentionEveryone: true,
    );
  }

  factory CurrentUserServerPermissions.memberFallback() {
    return const CurrentUserServerPermissions(
      isOwner: false,
      hasCustomRole: false,
      canKick: false,
      canBan: false,
      canTimeout: false,
      canManageServer: false,
      canManageChannels: false,
      canManageEvents: false,
      canManageExpressions: false,
      canCreateInvite: true,
      mentionEveryone: false,
    );
  }
}
