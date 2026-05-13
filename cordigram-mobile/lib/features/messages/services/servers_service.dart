import '../../../core/services/api_service.dart';
import '../../../core/services/auth_storage.dart';
import '../models/server_models.dart';
import '../models/server_permissions.dart';
import '../models/server_role_models.dart';

class ServersService {
  ServersService._();

  static Map<String, String> get _authHeaders => {
    'Authorization': 'Bearer ${AuthStorage.accessToken ?? ''}',
  };

  static Future<List<ServerSummary>> getMyServers() async {
    final list = await _getListResponse(
      '/servers',
      preferredKeys: const ['servers', 'items', 'data'],
    );
    return list
        .whereType<Map>()
        .map((e) => ServerSummary.fromJson(Map<String, dynamic>.from(e)))
        .where((e) => e.id.isNotEmpty && e.name.isNotEmpty)
        .toList();
  }

  static Future<ServerSummary?> createServer({
    required String name,
    String? description,
    String? avatarUrl,
    String template = 'custom',
    String purpose = 'me-and-friends',
    String language = 'vi',
  }) async {
    final res = await ApiService.post(
      '/servers',
      extraHeaders: _authHeaders,
      body: {
        'name': name,
        if ((description ?? '').trim().isNotEmpty)
          'description': description!.trim(),
        if ((avatarUrl ?? '').trim().isNotEmpty) 'avatarUrl': avatarUrl!.trim(),
        'template': template,
        'purpose': purpose,
        'language': language,
      },
    );
    final raw = res['server'] ?? res['data'] ?? res;
    if (raw is! Map) return null;
    final server = ServerSummary.fromJson(Map<String, dynamic>.from(raw));
    if (server.id.isEmpty) return null;
    return server;
  }

  static Future<List<ServerChannel>> getServerChannels(String serverId) async {
    final list = await _getListResponse(
      '/servers/$serverId/channels',
      preferredKeys: const ['channels', 'items', 'data'],
    );
    final channels = list
        .whereType<Map>()
        .map((e) => ServerChannel.fromJson(Map<String, dynamic>.from(e)))
        .where((e) => e.id.isNotEmpty && e.name.isNotEmpty)
        .toList();
    channels.sort((a, b) => a.position.compareTo(b.position));
    return channels;
  }

  static Future<Map<String, dynamic>> getServerAccessSettings(String serverId) async {
    final res = await ApiService.get(
      '/servers/$serverId/access/settings',
      extraHeaders: _authHeaders,
    );
    return Map<String, dynamic>.from(res);
  }

  /// POST `/servers/:id/join` — same contract as cordigram-web `joinServer`.
  static Future<Map<String, dynamic>> joinServer(
    String serverId, {
    bool? rulesAccepted,
    String? nickname,
    List<Map<String, dynamic>>? applicationAnswers,
  }) async {
    final body = <String, dynamic>{};
    if (rulesAccepted != null) body['rulesAccepted'] = rulesAccepted;
    if (nickname != null && nickname.trim().isNotEmpty) {
      body['nickname'] = nickname.trim();
    }
    if (applicationAnswers != null) {
      body['applicationAnswers'] = applicationAnswers;
    }
    final res = await ApiService.post(
      '/servers/$serverId/join',
      extraHeaders: _authHeaders,
      body: body,
    );
    return Map<String, dynamic>.from(res);
  }

  /// GET `/servers/:id/access/my-status` — gate tuổi, quy định, đơn đăng ký, xác minh.
  static Future<Map<String, dynamic>> getMyAccessStatus(String serverId) async {
    final res = await ApiService.get(
      '/servers/$serverId/access/my-status',
      extraHeaders: _authHeaders,
    );
    return Map<String, dynamic>.from(res);
  }

  /// POST `/servers/:id/access/accept-rules`
  static Future<void> acceptServerRules(String serverId) async {
    await ApiService.post(
      '/servers/$serverId/access/accept-rules',
      extraHeaders: _authHeaders,
      body: const <String, dynamic>{},
    );
  }

  static Future<Map<String, dynamic>> getDiscoveryEligibility(String serverId) async {
    final res = await ApiService.get(
      '/servers/$serverId/discovery-eligibility',
      extraHeaders: _authHeaders,
    );
    return Map<String, dynamic>.from(res);
  }

  /// Nhãn hiển thị mặc định (tên / username) từ [GET /profiles/me].
  static Future<String> getMyDefaultDisplayLabel() async {
    try {
      final res = await ApiService.get(
        '/profiles/me',
        extraHeaders: _authHeaders,
      );
      final dn = (res['displayName'] ?? '').toString().trim();
      if (dn.isNotEmpty) return dn;
      final un = (res['username'] ?? '').toString().trim();
      return un.isNotEmpty ? un : 'Người dùng';
    } catch (_) {
      return 'Người dùng';
    }
  }

  /// Tuổi đầy đủ từ [GET /profiles/me] (`birthdate` ISO yyyy-MM-dd hoặc ISO đầy đủ).
  /// Null nếu chưa có ngày sinh hoặc không parse được.
  static Future<int?> getMyAgeYearsFromProfile() async {
    try {
      final res = await ApiService.get(
        '/profiles/me',
        extraHeaders: _authHeaders,
      );
      final raw = res['birthdate']?.toString();
      return ageYearsFromBirthdateString(raw);
    } catch (_) {
      return null;
    }
  }

  /// Parse tuổi (số năm đầy đủ) từ chuỗi ngày sinh — dùng chung cho gate tuổi.
  static int? ageYearsFromBirthdateString(String? raw) {
    if (raw == null) return null;
    final s = raw.trim();
    if (s.isEmpty) return null;
    DateTime? d = DateTime.tryParse(s);
    d ??= _tryParseYmdPrefix(s);
    if (d == null) return null;
    final now = DateTime.now();
    var age = now.year - d.year;
    if (now.month < d.month ||
        (now.month == d.month && now.day < d.day)) {
      age--;
    }
    return age;
  }

  static DateTime? _tryParseYmdPrefix(String s) {
    final m = RegExp(r'^(\d{4})-(\d{2})-(\d{2})').firstMatch(s.trim());
    if (m == null) return null;
    final y = int.tryParse(m.group(1)!);
    final mo = int.tryParse(m.group(2)!);
    final day = int.tryParse(m.group(3)!);
    if (y == null || mo == null || day == null) return null;
    if (mo < 1 || mo > 12 || day < 1 || day > 31) return null;
    return DateTime(y, mo, day);
  }

  /// Sau khi đã [joinServer], xác nhận đã đọc cảnh báo máy chủ giới hạn độ tuổi (NSFW).
  static Future<void> acknowledgeServerAgeRestriction(String serverId) async {
    await ApiService.post(
      '/servers/$serverId/access/acknowledge-age',
      extraHeaders: _authHeaders,
    );
  }

  static Future<void> acceptServerInvite(String inviteId) async {
    await ApiService.post(
      '/server-invites/$inviteId/accept',
      extraHeaders: _authHeaders,
    );
  }

  static Future<void> declineServerInvite(String inviteId) async {
    await ApiService.post(
      '/server-invites/$inviteId/decline',
      extraHeaders: _authHeaders,
    );
  }

  /// POST `/server-invites` — same as cordigram-web `createServerInvite`.
  static Future<Map<String, dynamic>> createServerInvite(
    String serverId,
    String toUserId,
  ) async {
    final res = await ApiService.post(
      '/server-invites',
      extraHeaders: _authHeaders,
      body: {'serverId': serverId, 'toUserId': toUserId},
    );
    return Map<String, dynamic>.from(res);
  }

  /// GET join-applications list (status: all | pending | rejected | approved).
  static Future<({int pendingCount, List<Map<String, dynamic>> items})>
      listJoinApplications(
    String serverId,
    String status,
  ) async {
    final res = await ApiService.get(
      '/servers/$serverId/access/join-applications?status=${Uri.encodeQueryComponent(status)}',
      extraHeaders: _authHeaders,
    );
    final pendingRaw = res['pendingCount'];
    final pendingCount = pendingRaw is num ? pendingRaw.toInt() : 0;
    final raw = res['items'];
    final items = raw is List
        ? raw
            .whereType<Map>()
            .map((e) => Map<String, dynamic>.from(e))
            .toList()
        : <Map<String, dynamic>>[];
    return (pendingCount: pendingCount, items: items);
  }

  static Future<Map<String, dynamic>> getJoinApplicationDetail(
    String serverId,
    String applicantUserId,
  ) async {
    final res = await ApiService.get(
      '/servers/$serverId/access/join-applications/${Uri.encodeComponent(applicantUserId)}',
      extraHeaders: _authHeaders,
    );
    return Map<String, dynamic>.from(res);
  }

  static Future<void> approveServerAccessUser(
    String serverId,
    String userId,
  ) async {
    await ApiService.post(
      '/servers/$serverId/access/approve',
      extraHeaders: _authHeaders,
      body: {'userId': userId},
    );
  }

  static Future<void> rejectServerAccessUser(
    String serverId,
    String userId,
  ) async {
    await ApiService.post(
      '/servers/$serverId/access/reject',
      extraHeaders: _authHeaders,
      body: {'userId': userId},
    );
  }

  static Future<CurrentUserServerPermissions> getCurrentUserPermissions(
    String serverId, {
    String? ownerId,
    String? currentUserId,
  }) async {
    try {
      final res = await ApiService.get(
        '/servers/$serverId/my-permissions',
        extraHeaders: _authHeaders,
      );
      return CurrentUserServerPermissions.fromJson(
        Map<String, dynamic>.from(res),
      );
    } catch (_) {
      if (ownerId != null &&
          currentUserId != null &&
          ownerId.isNotEmpty &&
          ownerId == currentUserId) {
        return CurrentUserServerPermissions.ownerFallback();
      }
      return CurrentUserServerPermissions.memberFallback();
    }
  }

  static Future<void> leaveServer(String serverId) async {
    await ApiService.post(
      '/servers/$serverId/leave',
      extraHeaders: _authHeaders,
    );
  }

  static Future<Map<String, dynamic>> createChannel({
    required String serverId,
    required String name,
    required String type, // text | voice
    String? description,
    bool isPrivate = false,
    String? categoryId,
  }) async {
    final res = await ApiService.post(
      '/servers/$serverId/channels',
      extraHeaders: _authHeaders,
      body: {
        'name': name,
        'type': type,
        if ((description ?? '').trim().isNotEmpty) 'description': description!.trim(),
        'isPrivate': isPrivate,
        if (categoryId != null && categoryId.isNotEmpty) 'categoryId': categoryId,
      },
    );
    return Map<String, dynamic>.from(res);
  }

  static Future<Map<String, dynamic>> createCategory({
    required String serverId,
    required String name,
    String type = 'mixed',
  }) async {
    final res = await ApiService.post(
      '/servers/$serverId/channels/categories',
      extraHeaders: _authHeaders,
      body: {'name': name, 'type': type},
    );
    return Map<String, dynamic>.from(res);
  }

  static Future<Map<String, dynamic>> updateChannel({
    required String serverId,
    required String channelId,
    String? name,
    String? description,
  }) async {
    final body = <String, dynamic>{};
    if (name != null) body['name'] = name;
    if (description != null) body['description'] = description;
    final res = await ApiService.patch(
      '/servers/$serverId/channels/$channelId',
      extraHeaders: _authHeaders,
      body: body,
    );
    return Map<String, dynamic>.from(res);
  }

  static Future<void> deleteChannel({
    required String serverId,
    required String channelId,
  }) async {
    await ApiService.delete(
      '/servers/$serverId/channels/$channelId',
      extraHeaders: _authHeaders,
    );
  }

  static Future<List<ServerCategory>> getServerCategories(String serverId) async {
    final list = await _getListResponse(
      '/servers/$serverId/channels/categories/list',
      preferredKeys: const ['categories', 'items', 'data'],
    );
    final categories = list
        .whereType<Map>()
        .map((e) => ServerCategory.fromJson(Map<String, dynamic>.from(e)))
        .where((e) => e.id.isNotEmpty && e.name.isNotEmpty)
        .toList();
    categories.sort((a, b) => a.position.compareTo(b.position));
    return categories;
  }

  /// GET `/servers/:id` — full server doc (profile, banner, traits, members for invite UI).
  static Future<Map<String, dynamic>> getServerById(String serverId) async {
    final res = await ApiService.get(
      '/servers/$serverId',
      extraHeaders: _authHeaders,
    );
    return Map<String, dynamic>.from(res);
  }

  /// PATCH `/servers/:id` — same body as cordigram-web `serversApi.updateServer`.
  static Future<Map<String, dynamic>> updateServer({
    required String serverId,
    String? name,
    String? description,
    String? avatarUrl,
    String? bannerUrl,
    String? bannerImageUrl,
    String? bannerColor,
    List<Map<String, String>>? profileTraits,
    bool? isPublic,
  }) async {
    final body = <String, dynamic>{};
    if (name != null) body['name'] = name;
    if (description != null) body['description'] = description;
    if (avatarUrl != null) body['avatarUrl'] = avatarUrl;
    if (bannerUrl != null) body['bannerUrl'] = bannerUrl;
    if (bannerImageUrl != null) body['bannerImageUrl'] = bannerImageUrl;
    if (bannerColor != null) body['bannerColor'] = bannerColor;
    if (profileTraits != null) body['profileTraits'] = profileTraits;
    if (isPublic != null) body['isPublic'] = isPublic;
    final res = await ApiService.patch(
      '/servers/$serverId',
      extraHeaders: _authHeaders,
      body: body,
    );
    return Map<String, dynamic>.from(res);
  }

  /// GET `/servers/:id/events` — active + upcoming (same as web).
  static Future<({
    List<Map<String, dynamic>> active,
    List<Map<String, dynamic>> upcoming,
  })> getServerEvents(String serverId) async {
    final res = await ApiService.get(
      '/servers/$serverId/events',
      extraHeaders: _authHeaders,
    );
    List<Map<String, dynamic>> parse(String key) {
      final v = res[key];
      if (v is! List) return [];
      return v
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
    }

    return (
      active: parse('active'),
      upcoming: parse('upcoming'),
    );
  }

  /// POST `/servers/:id/events` — body matches `CreateEventDto` / web `createServerEvent`.
  static Future<Map<String, dynamic>> createServerEvent({
    required String serverId,
    required String topic,
    required String startAt,
    required String frequency,
    required String locationType,
    String? endAt,
    String? channelId,
    String? description,
    String? coverImageUrl,
  }) async {
    final body = <String, dynamic>{
      'topic': topic,
      'startAt': startAt,
      'frequency': frequency,
      'locationType': locationType,
    };
    if (endAt != null && endAt.isNotEmpty) body['endAt'] = endAt;
    if (channelId != null && channelId.isNotEmpty) body['channelId'] = channelId;
    if (description != null && description.isNotEmpty) {
      body['description'] = description;
    }
    if (coverImageUrl != null && coverImageUrl.isNotEmpty) {
      body['coverImageUrl'] = coverImageUrl;
    }
    final res = await ApiService.post(
      '/servers/$serverId/events',
      extraHeaders: _authHeaders,
      body: body,
    );
    return Map<String, dynamic>.from(res);
  }

  // ── Roles (web `serversApi` roles API) ─────────────────────────────

  static Future<List<ServerRole>> getRoles(String serverId) async {
    final direct = await ApiService.getList(
      '/servers/$serverId/roles',
      extraHeaders: _authHeaders,
    );
    return direct
        .whereType<Map>()
        .map((e) => ServerRole.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  static Future<ServerRole> createRole({
    required String serverId,
    required String name,
    String color = '#99AAB5',
  }) async {
    final res = await ApiService.post(
      '/servers/$serverId/roles',
      extraHeaders: _authHeaders,
      body: {'name': name, 'color': color},
    );
    return ServerRole.fromJson(Map<String, dynamic>.from(res));
  }

  static Future<ServerRole> updateRole({
    required String serverId,
    required String roleId,
    String? name,
    String? color,
    bool? displaySeparately,
    bool? mentionable,
    Map<String, dynamic>? permissions,
  }) async {
    final body = <String, dynamic>{};
    if (name != null) body['name'] = name;
    if (color != null) body['color'] = color;
    if (displaySeparately != null) {
      body['displaySeparately'] = displaySeparately;
    }
    if (mentionable != null) body['mentionable'] = mentionable;
    if (permissions != null) body['permissions'] = permissions;
    final res = await ApiService.patch(
      '/servers/$serverId/roles/$roleId',
      extraHeaders: _authHeaders,
      body: body,
    );
    return ServerRole.fromJson(Map<String, dynamic>.from(res));
  }

  static Future<void> deleteRole({
    required String serverId,
    required String roleId,
  }) async {
    await ApiService.delete(
      '/servers/$serverId/roles/$roleId',
      extraHeaders: _authHeaders,
    );
  }

  static Future<void> addMemberToRole({
    required String serverId,
    required String roleId,
    required String memberId,
  }) async {
    await ApiService.post(
      '/servers/$serverId/roles/$roleId/members/$memberId',
      extraHeaders: _authHeaders,
    );
  }

  static Future<void> removeMemberFromRole({
    required String serverId,
    required String roleId,
    required String memberId,
  }) async {
    await ApiService.delete(
      '/servers/$serverId/roles/$roleId/members/$memberId',
      extraHeaders: _authHeaders,
    );
  }

  // ── Members with roles ────────────────────────────────────────────

  static Future<MembersWithRolesResult> getServerMembersWithRoles(
    String serverId,
  ) async {
    final res = await ApiService.get(
      '/servers/$serverId/members-with-roles',
      extraHeaders: _authHeaders,
    );
    final list = res['members'];
    final out = <MemberWithRolesRow>[];
    if (list is List) {
      for (final e in list) {
        if (e is Map) {
          out.add(
            MemberWithRolesRow.fromJson(
              Map<String, dynamic>.from(e),
            ),
          );
        }
      }
    }
    final cup = res['currentUserPermissions'];
    var canKick = false;
    var canBan = false;
    var canTimeout = false;
    var listIsOwner = false;
    if (cup is Map) {
      canKick = cup['canKick'] == true;
      canBan = cup['canBan'] == true;
      canTimeout = cup['canTimeout'] == true;
      listIsOwner = cup['isOwner'] == true;
    }
    return MembersWithRolesResult(
      members: out,
      canKick: canKick,
      canBan: canBan,
      canTimeout: canTimeout,
      listIsOwner: listIsOwner,
    );
  }

  /// Owner-only list fallback (web `getServerMembers`).
  static Future<List<Map<String, dynamic>>> getServerMembersRaw(
    String serverId,
  ) async {
    final list = await ApiService.getList(
      '/servers/$serverId/members',
      extraHeaders: _authHeaders,
    );
    return list.map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  // ── Moderation ────────────────────────────────────────────────────

  static Future<void> kickMember(
    String serverId,
    String memberId, {
    String? reason,
  }) async {
    await ApiService.post(
      '/servers/$serverId/kick/$memberId',
      extraHeaders: _authHeaders,
      body: reason != null ? {'reason': reason} : null,
    );
  }

  static Future<void> banMember(
    String serverId,
    String memberId, {
    String? reason,
    int? deleteMessageDays,
  }) async {
    await ApiService.post(
      '/servers/$serverId/ban/$memberId',
      extraHeaders: _authHeaders,
      body: {
        if (reason != null) 'reason': reason,
        if (deleteMessageDays != null) 'deleteMessageDays': deleteMessageDays,
      },
    );
  }

  static Future<void> timeoutMember(
    String serverId,
    String memberId,
    int durationSeconds, {
    String? reason,
  }) async {
    await ApiService.post(
      '/servers/$serverId/timeout/$memberId',
      extraHeaders: _authHeaders,
      body: {
        'durationSeconds': durationSeconds,
        if (reason != null && reason.isNotEmpty) 'reason': reason,
      },
    );
  }

  // ── Profile stats / interaction / safety / access (web servers-api) ──

  static Future<Map<String, dynamic>> getServerProfileStats(String serverId) async {
    final res = await ApiService.get(
      '/servers/$serverId/profile-stats',
      extraHeaders: _authHeaders,
    );
    return Map<String, dynamic>.from(res);
  }

  static Future<Map<String, dynamic>> getInteractionSettings(String serverId) async {
    final res = await ApiService.get(
      '/servers/$serverId/interaction-settings',
      extraHeaders: _authHeaders,
    );
    return Map<String, dynamic>.from(res);
  }

  static Future<Map<String, dynamic>> patchInteractionSettings(
    String serverId,
    Map<String, dynamic> body,
  ) async {
    return ApiService.patch(
      '/servers/$serverId/interaction-settings',
      body: body,
      extraHeaders: _authHeaders,
    );
  }

  static Future<Map<String, dynamic>> postRoleNotification(
    String serverId, {
    required String title,
    required String content,
    required String targetType,
    String? roleId,
  }) async {
    return ApiService.post(
      '/servers/$serverId/role-notifications',
      extraHeaders: _authHeaders,
      body: {
        'title': title,
        'content': content,
        'targetType': targetType,
        if (roleId != null && roleId.isNotEmpty) 'roleId': roleId,
      },
    );
  }

  static Future<Map<String, dynamic>> getServerSafetySettings(String serverId) async {
    final res = await ApiService.get(
      '/servers/$serverId/safety-settings',
      extraHeaders: _authHeaders,
    );
    return Map<String, dynamic>.from(res);
  }

  static Future<Map<String, dynamic>> patchServerSafetySettings(
    String serverId,
    Map<String, dynamic> patch,
  ) async {
    return ApiService.patch(
      '/servers/$serverId/safety-settings',
      body: patch,
      extraHeaders: _authHeaders,
    );
  }

  static Future<Map<String, dynamic>> patchServerAccessSettings(
    String serverId, {
    String? accessMode,
    bool? isAgeRestricted,
    bool? hasRules,
  }) async {
    final body = <String, dynamic>{};
    if (accessMode != null) body['accessMode'] = accessMode;
    if (isAgeRestricted != null) body['isAgeRestricted'] = isAgeRestricted;
    if (hasRules != null) body['hasRules'] = hasRules;
    return ApiService.patch(
      '/servers/$serverId/access/settings',
      body: body,
      extraHeaders: _authHeaders,
    );
  }

  static Future<Map<String, dynamic>> postAccessRule(
    String serverId,
    String content,
  ) async {
    final res = await ApiService.post(
      '/servers/$serverId/access/rules',
      extraHeaders: _authHeaders,
      body: {'content': content},
    );
    return Map<String, dynamic>.from(res);
  }

  static Future<Map<String, dynamic>> getJoinApplicationForm(String serverId) async {
    final res = await ApiService.get(
      '/servers/$serverId/access/join-form',
      extraHeaders: _authHeaders,
    );
    return Map<String, dynamic>.from(res);
  }

  static Future<Map<String, dynamic>> patchJoinApplicationForm(
    String serverId,
    Map<String, dynamic> body,
  ) async {
    return ApiService.patch(
      '/servers/$serverId/access/join-form',
      body: body,
      extraHeaders: _authHeaders,
    );
  }

  static Future<List<Map<String, dynamic>>> getBannedUsers(String serverId) async {
    try {
      final list = await ApiService.getList(
        '/servers/$serverId/bans',
        extraHeaders: _authHeaders,
      );
      return list.map((e) => Map<String, dynamic>.from(e as Map)).toList();
    } catch (_) {
      final res = await ApiService.get(
        '/servers/$serverId/bans',
        extraHeaders: _authHeaders,
      );
      final map = Map<String, dynamic>.from(res);
      final list = map['bans'] ?? map['items'] ?? map['data'];
      if (list is List) {
        return list.map((e) => Map<String, dynamic>.from(e as Map)).toList();
      }
      return [];
    }
  }

  static Future<void> unbanMember(String serverId, String memberId) async {
    await ApiService.post(
      '/servers/$serverId/unban/$memberId',
      extraHeaders: _authHeaders,
    );
  }

  static Future<Map<String, dynamic>> getServerEmojisManage(String serverId) async {
    final res = await ApiService.get(
      '/servers/$serverId/emojis/manage',
      extraHeaders: _authHeaders,
    );
    return Map<String, dynamic>.from(res);
  }

  static Future<Map<String, dynamic>> addServerEmoji(
    String serverId, {
    required String imageUrl,
    String? name,
    bool? animated,
  }) async {
    final res = await ApiService.post(
      '/servers/$serverId/emojis',
      extraHeaders: _authHeaders,
      body: {
        'imageUrl': imageUrl,
        if (name != null && name.isNotEmpty) 'name': name,
        if (animated != null) 'animated': animated,
      },
    );
    return Map<String, dynamic>.from(res);
  }

  static Future<Map<String, dynamic>> getServerStickersManage(String serverId) async {
    final res = await ApiService.get(
      '/servers/$serverId/stickers/manage',
      extraHeaders: _authHeaders,
    );
    return Map<String, dynamic>.from(res);
  }

  static Future<Map<String, dynamic>> addServerSticker(
    String serverId, {
    required String imageUrl,
    String? name,
    bool? animated,
  }) async {
    final res = await ApiService.post(
      '/servers/$serverId/stickers',
      extraHeaders: _authHeaders,
      body: {
        'imageUrl': imageUrl,
        if (name != null && name.isNotEmpty) 'name': name,
        if (animated != null) 'animated': animated,
      },
    );
    return Map<String, dynamic>.from(res);
  }

  static Future<Map<String, dynamic>> setServerStickerBoostTier(
    String serverId, {
    required String? tier,
  }) async {
    return ApiService.patch(
      '/servers/sticker-boost/$serverId',
      body: {'tier': tier},
      extraHeaders: _authHeaders,
    );
  }

  static Future<Map<String, dynamic>> getCommunitySettings(String serverId) async {
    final res = await ApiService.get(
      '/servers/$serverId/community',
      extraHeaders: _authHeaders,
    );
    return Map<String, dynamic>.from(res);
  }

  static Future<Map<String, dynamic>> activateCommunity(
    String serverId, {
    Map<String, dynamic>? body,
  }) async {
    final res = await ApiService.post(
      '/servers/$serverId/community/activate',
      extraHeaders: _authHeaders,
      body: body ?? {},
    );
    return Map<String, dynamic>.from(res);
  }

  static Future<Map<String, dynamic>> updateCommunityOverview(
    String serverId, {
    String? rulesChannelId,
    String? primaryLanguage,
    String? description,
  }) async {
    final b = <String, dynamic>{};
    if (rulesChannelId != null) b['rulesChannelId'] = rulesChannelId;
    if (primaryLanguage != null) b['primaryLanguage'] = primaryLanguage;
    if (description != null) b['description'] = description;
    final res = await ApiService.post(
      '/servers/$serverId/community/overview',
      extraHeaders: _authHeaders,
      body: b,
    );
    return Map<String, dynamic>.from(res);
  }

  static Future<void> deleteServer(String serverId) async {
    await ApiService.delete(
      '/servers/$serverId',
      extraHeaders: _authHeaders,
    );
  }

  static Future<List<dynamic>> _getListResponse(
    String path, {
    required List<String> preferredKeys,
  }) async {
    try {
      final res = await ApiService.get(path, extraHeaders: _authHeaders);
      for (final key in preferredKeys) {
        final candidate = res[key];
        if (candidate is List) return candidate;
      }
      return const <dynamic>[];
    } on TypeError {
      // Some backend endpoints return array JSON as root.
      return ApiService.getList(path, extraHeaders: _authHeaders);
    }
  }
}
