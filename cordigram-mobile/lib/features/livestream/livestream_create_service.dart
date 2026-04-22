import '../../core/services/api_service.dart';
import '../../core/services/auth_storage.dart';

enum LivestreamLatencyMode { adaptive, balanced, low }

enum LivestreamSourceMode { screen, camera }

enum LivestreamVisibility { public, followers, private }

enum LivestreamRole { host, viewer }

extension LivestreamLatencyModeValue on LivestreamLatencyMode {
  String get value {
    switch (this) {
      case LivestreamLatencyMode.adaptive:
        return 'adaptive';
      case LivestreamLatencyMode.balanced:
        return 'balanced';
      case LivestreamLatencyMode.low:
        return 'low';
    }
  }
}

extension LivestreamVisibilityValue on LivestreamVisibility {
  String get value {
    switch (this) {
      case LivestreamVisibility.public:
        return 'public';
      case LivestreamVisibility.followers:
        return 'followers';
      case LivestreamVisibility.private:
        return 'private';
    }
  }

  String get label {
    switch (this) {
      case LivestreamVisibility.public:
        return 'Public';
      case LivestreamVisibility.followers:
        return 'Friends / Following';
      case LivestreamVisibility.private:
        return 'Private';
    }
  }
}

class LivestreamItem {
  const LivestreamItem({
    required this.id,
    required this.title,
    required this.description,
    required this.pinnedComment,
    required this.location,
    required this.mentionUsernames,
    required this.visibility,
    required this.latencyMode,
    required this.hostName,
    required this.status,
    required this.roomName,
    required this.hostUserId,
    required this.provider,
    required this.startedAt,
    required this.endedAt,
    required this.maxViewers,
    required this.viewerCount,
    this.hostUsername,
    this.hostAvatarUrl,
    this.ivsPlaybackUrl,
  });

  final String id;
  final String title;
  final String description;
  final String pinnedComment;
  final String location;
  final List<String> mentionUsernames;
  final LivestreamVisibility visibility;
  final LivestreamLatencyMode latencyMode;
  final String hostName;
  final String status;
  final String roomName;
  final String hostUserId;
  final String provider;
  final String? ivsPlaybackUrl;
  final DateTime? startedAt;
  final DateTime? endedAt;
  final int maxViewers;
  final int viewerCount;
  final String? hostUsername;
  final String? hostAvatarUrl;

  bool get isLive => status == 'live';

  LivestreamItem copyWith({
    String? title,
    String? description,
    String? pinnedComment,
    String? location,
    List<String>? mentionUsernames,
    LivestreamVisibility? visibility,
    LivestreamLatencyMode? latencyMode,
    String? hostName,
    String? status,
    String? provider,
    String? ivsPlaybackUrl,
    DateTime? startedAt,
    DateTime? endedAt,
    int? maxViewers,
    int? viewerCount,
    String? hostUsername,
    String? hostAvatarUrl,
  }) {
    return LivestreamItem(
      id: id,
      title: title ?? this.title,
      description: description ?? this.description,
      pinnedComment: pinnedComment ?? this.pinnedComment,
      location: location ?? this.location,
      mentionUsernames: mentionUsernames ?? this.mentionUsernames,
      visibility: visibility ?? this.visibility,
      latencyMode: latencyMode ?? this.latencyMode,
      hostName: hostName ?? this.hostName,
      status: status ?? this.status,
      roomName: roomName,
      hostUserId: hostUserId,
      provider: provider ?? this.provider,
      ivsPlaybackUrl: ivsPlaybackUrl ?? this.ivsPlaybackUrl,
      startedAt: startedAt ?? this.startedAt,
      endedAt: endedAt ?? this.endedAt,
      maxViewers: maxViewers ?? this.maxViewers,
      viewerCount: viewerCount ?? this.viewerCount,
      hostUsername: hostUsername ?? this.hostUsername,
      hostAvatarUrl: hostAvatarUrl ?? this.hostAvatarUrl,
    );
  }

  static LivestreamLatencyMode _parseLatencyMode(String? raw) {
    switch ((raw ?? '').toLowerCase()) {
      case 'balanced':
        return LivestreamLatencyMode.balanced;
      case 'low':
        return LivestreamLatencyMode.low;
      case 'adaptive':
      default:
        return LivestreamLatencyMode.adaptive;
    }
  }

  static LivestreamVisibility _parseVisibility(String? raw) {
    switch ((raw ?? '').toLowerCase()) {
      case 'followers':
        return LivestreamVisibility.followers;
      case 'private':
        return LivestreamVisibility.private;
      case 'public':
      default:
        return LivestreamVisibility.public;
    }
  }

  factory LivestreamItem.fromJson(Map<String, dynamic> json) {
    final host = json['host'];
    final hostMap = host is Map<String, dynamic> ? host : null;

    String? pickNonEmpty(List<String?> values) {
      for (final value in values) {
        final v = value?.trim();
        if (v != null && v.isNotEmpty) return v;
      }
      return null;
    }

    return LivestreamItem(
      id: (json['id'] as String?) ?? '',
      title: (json['title'] as String?) ?? '',
      description: (json['description'] as String?) ?? '',
      pinnedComment: (json['pinnedComment'] as String?) ?? '',
      location: (json['location'] as String?) ?? '',
      mentionUsernames:
          (json['mentionUsernames'] as List?)?.whereType<String>().toList() ??
          const [],
      visibility: _parseVisibility(json['visibility'] as String?),
      latencyMode: _parseLatencyMode(json['latencyMode'] as String?),
      hostName: (json['hostName'] as String?) ?? 'Host',
      status: (json['status'] as String?) ?? 'live',
      roomName: (json['roomName'] as String?) ?? '',
      hostUserId: (json['hostUserId'] as String?) ?? '',
      provider: (json['provider'] as String?) ?? 'livekit',
      hostUsername: pickNonEmpty([
        json['hostUsername'] as String?,
        hostMap?['username'] as String?,
      ]),
      hostAvatarUrl: pickNonEmpty([
        json['hostAvatarUrl'] as String?,
        json['avatarUrl'] as String?,
        hostMap?['avatarUrl'] as String?,
      ]),
      ivsPlaybackUrl:
          (json['ivsPlaybackUrl'] as String?)?.trim().isEmpty ?? true
          ? null
          : (json['ivsPlaybackUrl'] as String),
      startedAt: DateTime.tryParse((json['startedAt'] as String?) ?? ''),
      endedAt: DateTime.tryParse((json['endedAt'] as String?) ?? ''),
      maxViewers: (json['maxViewers'] as num?)?.toInt() ?? 0,
      viewerCount: (json['viewerCount'] as num?)?.toInt() ?? 0,
    );
  }
}

class LivestreamListResponse {
  const LivestreamListResponse({
    required this.maxConcurrentLivestreams,
    required this.maxViewersPerRoom,
    required this.activeCount,
    required this.items,
  });

  final int maxConcurrentLivestreams;
  final int maxViewersPerRoom;
  final int activeCount;
  final List<LivestreamItem> items;

  factory LivestreamListResponse.fromJson(Map<String, dynamic> json) {
    return LivestreamListResponse(
      maxConcurrentLivestreams:
          (json['maxConcurrentLivestreams'] as num?)?.toInt() ?? 0,
      maxViewersPerRoom: (json['maxViewersPerRoom'] as num?)?.toInt() ?? 0,
      activeCount: (json['activeCount'] as num?)?.toInt() ?? 0,
      items:
          (json['items'] as List?)
              ?.whereType<Map<String, dynamic>>()
              .map(LivestreamItem.fromJson)
              .toList() ??
          const [],
    );
  }
}

class JoinLivestreamResponse {
  const JoinLivestreamResponse({
    required this.token,
    required this.url,
    required this.stream,
    required this.role,
  });

  final String token;
  final String url;
  final LivestreamItem stream;
  final LivestreamRole role;

  factory JoinLivestreamResponse.fromJson(Map<String, dynamic> json) {
    final roleRaw = (json['role'] as String?) ?? 'viewer';
    return JoinLivestreamResponse(
      token: (json['token'] as String?) ?? '',
      url: (json['url'] as String?) ?? '',
      stream: LivestreamItem.fromJson(
        (json['stream'] as Map<String, dynamic>?) ?? const {},
      ),
      role: roleRaw == 'host' ? LivestreamRole.host : LivestreamRole.viewer,
    );
  }
}

class LivestreamCreateService {
  static Future<LivestreamItem> createLivestream({
    required String title,
    String? description,
    String? pinnedComment,
    String? location,
    required LivestreamVisibility visibility,
    required LivestreamLatencyMode latencyMode,
    List<String> mentions = const [],
  }) async {
    final token = AuthStorage.accessToken;
    if (token == null) throw const ApiException('Not authenticated');

    final payload = <String, dynamic>{
      'title': title,
      if (description != null && description.trim().isNotEmpty)
        'description': description.trim(),
      if (pinnedComment != null && pinnedComment.trim().isNotEmpty)
        'pinnedComment': pinnedComment.trim(),
      if (location != null && location.trim().isNotEmpty)
        'location': location.trim(),
      'visibility': visibility.value,
      'latencyMode': latencyMode.value,
      if (mentions.isNotEmpty) 'mentions': mentions,
    };

    final response = await ApiService.post(
      '/livestreams',
      body: payload,
      extraHeaders: {'Authorization': 'Bearer $token'},
    );

    final streamJson = response['stream'];
    if (streamJson is! Map<String, dynamic>) {
      throw const ApiException('Invalid livestream response payload');
    }

    return LivestreamItem.fromJson(streamJson);
  }

  static Future<LivestreamListResponse> listLiveLivestreams() async {
    final token = AuthStorage.accessToken;
    if (token == null) throw const ApiException('Not authenticated');

    final response = await ApiService.get(
      '/livestreams/live',
      extraHeaders: {'Authorization': 'Bearer $token'},
    );

    return LivestreamListResponse.fromJson(response);
  }

  static Future<JoinLivestreamResponse> joinLivestreamToken(
    String streamId, {
    bool asHost = false,
    String? participantName,
  }) async {
    final token = AuthStorage.accessToken;
    if (token == null) throw const ApiException('Not authenticated');

    final response = await ApiService.post(
      '/livestreams/${Uri.encodeComponent(streamId)}/join-token',
      body: {
        'asHost': asHost,
        if (participantName != null && participantName.trim().isNotEmpty)
          'participantName': participantName.trim(),
      },
      extraHeaders: {'Authorization': 'Bearer $token'},
    );

    return JoinLivestreamResponse.fromJson(response);
  }

  static Future<LivestreamItem> getLivestreamById(String streamId) async {
    final token = AuthStorage.accessToken;
    if (token == null) throw const ApiException('Not authenticated');

    final response = await ApiService.get(
      '/livestreams/${Uri.encodeComponent(streamId)}',
      extraHeaders: {'Authorization': 'Bearer $token'},
    );

    final streamJson = response['stream'];
    if (streamJson is! Map<String, dynamic>) {
      throw const ApiException('Invalid livestream payload');
    }
    return LivestreamItem.fromJson(streamJson);
  }

  static Future<LivestreamItem> updateLivestream(
    String streamId, {
    String? title,
    String? description,
    String? pinnedComment,
    String? location,
    LivestreamLatencyMode? latencyMode,
  }) async {
    final token = AuthStorage.accessToken;
    if (token == null) throw const ApiException('Not authenticated');

    final payload = <String, dynamic>{
      if (title != null) 'title': title.trim(),
      if (description != null) 'description': description.trim(),
      if (pinnedComment != null) 'pinnedComment': pinnedComment.trim(),
      if (location != null) 'location': location.trim(),
      if (latencyMode != null) 'latencyMode': latencyMode.value,
    };

    final response = await ApiService.patch(
      '/livestreams/${Uri.encodeComponent(streamId)}',
      body: payload,
      extraHeaders: {'Authorization': 'Bearer $token'},
    );

    final streamJson = response['stream'];
    if (streamJson is! Map<String, dynamic>) {
      throw const ApiException('Invalid livestream payload');
    }
    return LivestreamItem.fromJson(streamJson);
  }

  static Future<void> endLivestream(String streamId) async {
    final token = AuthStorage.accessToken;
    if (token == null) throw const ApiException('Not authenticated');

    await ApiService.post(
      '/livestreams/${Uri.encodeComponent(streamId)}/end',
      extraHeaders: {'Authorization': 'Bearer $token'},
    );
  }
}
