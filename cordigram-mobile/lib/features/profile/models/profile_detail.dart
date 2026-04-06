// ProfileFieldVisibility: "public" | "followers" | "private"
typedef ProfileFieldVisibility = String;

class ProfileVisibility {
  ProfileVisibility({
    this.gender = 'public',
    this.birthdate = 'public',
    this.location = 'public',
    this.workplace = 'public',
    this.bio = 'public',
    this.followers = 'public',
    this.following = 'public',
    this.about = 'public',
    this.profile = 'public',
  });

  factory ProfileVisibility.fromJson(Map<String, dynamic> j) =>
      ProfileVisibility(
        gender: j['gender'] as String? ?? 'public',
        birthdate: j['birthdate'] as String? ?? 'public',
        location: j['location'] as String? ?? 'public',
        workplace: j['workplace'] as String? ?? 'public',
        bio: j['bio'] as String? ?? 'public',
        followers: j['followers'] as String? ?? 'public',
        following: j['following'] as String? ?? 'public',
        about: j['about'] as String? ?? 'public',
        profile: j['profile'] as String? ?? 'public',
      );

  final String gender;
  final String birthdate;
  final String location;
  final String workplace;
  final String bio;
  final String followers;
  final String following;
  final String about;
  final String profile;
}

class ProfileStats {
  ProfileStats({
    this.posts = 0,
    this.reels = 0,
    this.totalPosts = 0,
    this.followers = 0,
    this.following = 0,
  });

  factory ProfileStats.fromJson(Map<String, dynamic> j) => ProfileStats(
    posts: (j['posts'] as num?)?.toInt() ?? 0,
    reels: (j['reels'] as num?)?.toInt() ?? 0,
    totalPosts: (j['totalPosts'] as num?)?.toInt() ?? 0,
    followers: (j['followers'] as num?)?.toInt() ?? 0,
    following: (j['following'] as num?)?.toInt() ?? 0,
  );

  final int posts;
  final int reels;
  final int totalPosts;
  final int followers;
  final int following;
}

class ProfileWorkplace {
  ProfileWorkplace({required this.companyId, required this.companyName});

  factory ProfileWorkplace.fromJson(Map<String, dynamic> j) => ProfileWorkplace(
    companyId: j['companyId'] as String? ?? '',
    companyName: j['companyName'] as String? ?? '',
  );

  final String companyId;
  final String companyName;
}

class ProfileDetail {
  ProfileDetail({
    required this.id,
    required this.userId,
    required this.displayName,
    required this.username,
    required this.avatarUrl,
    required this.stats,
    this.avatarOriginalUrl,
    this.coverUrl,
    this.bio,
    this.gender,
    this.location,
    this.workplace,
    this.birthdate,
    this.visibility,
    this.isCreatorVerified = false,
    this.isFollowing = false,
  });

  factory ProfileDetail.fromJson(Map<String, dynamic> j) => ProfileDetail(
    id: j['id'] as String? ?? '',
    userId: j['userId'] as String? ?? '',
    displayName: j['displayName'] as String? ?? '',
    username: j['username'] as String? ?? '',
    avatarUrl: j['avatarUrl'] as String? ?? '',
    avatarOriginalUrl: j['avatarOriginalUrl'] as String?,
    coverUrl: j['coverUrl'] as String?,
    bio: j['bio'] as String?,
    gender: j['gender'] as String?,
    location: j['location'] as String?,
    workplace: j['workplace'] != null
        ? ProfileWorkplace.fromJson(j['workplace'] as Map<String, dynamic>)
        : null,
    birthdate: j['birthdate'] as String?,
    stats: ProfileStats.fromJson((j['stats'] as Map<String, dynamic>?) ?? {}),
    visibility: j['visibility'] != null
        ? ProfileVisibility.fromJson(j['visibility'] as Map<String, dynamic>)
        : null,
    isCreatorVerified: j['isCreatorVerified'] as bool? ?? false,
    isFollowing: j['isFollowing'] as bool? ?? false,
  );

  final String id;
  final String userId;
  final String displayName;
  final String username;
  final String avatarUrl;
  final String? avatarOriginalUrl;
  final String? coverUrl;
  final String? bio;
  final String? gender;
  final String? location;
  final ProfileWorkplace? workplace;
  final String? birthdate;
  final ProfileStats stats;
  final ProfileVisibility? visibility;
  final bool isCreatorVerified;
  bool isFollowing;

  ProfileDetail copyWith({
    bool? isFollowing,
    ProfileStats? stats,
    String? avatarUrl,
    String? avatarOriginalUrl,
    String? displayName,
    String? username,
    String? bio,
    String? gender,
    String? location,
    ProfileWorkplace? workplace,
    String? birthdate,
  }) => ProfileDetail(
    id: id,
    userId: userId,
    displayName: displayName ?? this.displayName,
    username: username ?? this.username,
    avatarUrl: avatarUrl ?? this.avatarUrl,
    avatarOriginalUrl: avatarOriginalUrl ?? this.avatarOriginalUrl,
    coverUrl: coverUrl ?? this.coverUrl,
    bio: bio ?? this.bio,
    gender: gender ?? this.gender,
    location: location ?? this.location,
    workplace: workplace ?? this.workplace,
    birthdate: birthdate ?? this.birthdate,
    stats: stats ?? this.stats,
    visibility: visibility ?? this.visibility,
    isCreatorVerified: isCreatorVerified,
    isFollowing: isFollowing ?? this.isFollowing,
  );
}
