import 'dart:math' as math;
import 'package:flutter/material.dart';

// ── StoryMusic ───────────────────────────────────────────────────────────────

class StoryMusic {
  const StoryMusic({
    required this.trackId,
    required this.title,
    required this.artist,
    required this.coverUrl,
    required this.audioUrl,
    this.startTime = 0,
    this.duration = 180,
    this.stickerX = 5,
    this.stickerY = 72,
    this.stickerWidth = 90,
  });

  final String trackId;
  final String title;
  final String artist;
  final String coverUrl;
  final String audioUrl;
  final int startTime;
  final int duration; // total track length in seconds
  final double stickerX;
  final double stickerY;
  final double stickerWidth;

  factory StoryMusic.fromJson(Map<String, dynamic> j) => StoryMusic(
        trackId: j['trackId'] as String? ?? '',
        title: j['title'] as String? ?? '',
        artist: j['artist'] as String? ?? '',
        coverUrl: j['coverUrl'] as String? ?? '',
        audioUrl: j['audioUrl'] as String? ?? '',
        startTime: (j['startTime'] as num?)?.toInt() ?? 0,
        duration: (j['duration'] as num?)?.toInt() ?? 180,
        stickerX: (j['stickerX'] as num?)?.toDouble() ?? 5,
        stickerY: (j['stickerY'] as num?)?.toDouble() ?? 72,
        stickerWidth: (j['stickerWidth'] as num?)?.toDouble() ?? 90,
      );

  Map<String, dynamic> toJson() => {
        'trackId': trackId,
        'title': title,
        'artist': artist,
        'coverUrl': coverUrl,
        'audioUrl': audioUrl,
        'startTime': startTime,
        'stickerX': stickerX,
        'stickerY': stickerY,
        'stickerWidth': stickerWidth,
      };

  StoryMusic copyWith({
    String? trackId,
    String? title,
    String? artist,
    String? coverUrl,
    String? audioUrl,
    int? startTime,
    int? duration,
    double? stickerX,
    double? stickerY,
    double? stickerWidth,
  }) =>
      StoryMusic(
        trackId: trackId ?? this.trackId,
        title: title ?? this.title,
        artist: artist ?? this.artist,
        coverUrl: coverUrl ?? this.coverUrl,
        audioUrl: audioUrl ?? this.audioUrl,
        startTime: startTime ?? this.startTime,
        duration: duration ?? this.duration,
        stickerX: stickerX ?? this.stickerX,
        stickerY: stickerY ?? this.stickerY,
        stickerWidth: stickerWidth ?? this.stickerWidth,
      );
}

// ── StoryTextOverlay ─────────────────────────────────────────────────────────

class StoryTextOverlay {
  const StoryTextOverlay({
    required this.id,
    required this.text,
    required this.x,
    required this.y,
    required this.fontSize,
    required this.color,
  });

  final String id;
  final String text;
  final double x;
  final double y;
  final double fontSize;
  final String color;

  factory StoryTextOverlay.fromJson(Map<String, dynamic> j) =>
      StoryTextOverlay(
        id: j['id'] as String? ?? '',
        text: j['text'] as String? ?? '',
        x: (j['x'] as num?)?.toDouble() ?? 0,
        y: (j['y'] as num?)?.toDouble() ?? 0,
        fontSize: (j['fontSize'] as num?)?.toDouble() ?? 24,
        color: j['color'] as String? ?? '#ffffff',
      );
}

// ── StoryItem ────────────────────────────────────────────────────────────────

class StoryItem {
  const StoryItem({
    required this.id,
    required this.type,
    this.mediaType,
    this.mediaUrl,
    this.mediaDurationMs,
    this.trimStartMs,
    this.trimEndMs,
    this.textContent,
    this.backgroundStyle,
    this.textOverlays = const [],
    this.location,
    this.music,
    required this.viewCount,
    required this.reactionCount,
    required this.viewed,
    this.myReaction,
    required this.createdAt,
    required this.expiresAt,
    this.visibility = 'followers',
  });

  final String id;
  final String type; // 'media' | 'text'
  final String? mediaType; // 'image' | 'video' | null
  final String? mediaUrl;
  final int? mediaDurationMs;
  final int? trimStartMs;
  final int? trimEndMs;
  final String? textContent;
  final String? backgroundStyle;
  final List<StoryTextOverlay> textOverlays;
  final String? location;
  final StoryMusic? music;
  final int viewCount;
  final int reactionCount;
  final bool viewed;
  final String? myReaction;
  final DateTime createdAt;
  final DateTime expiresAt;
  final String? visibility;

  /// Display duration for progress bar (ms)
  int get displayDurationMs {
    if (type == 'media' && mediaType == 'video') {
      final end = trimEndMs ?? mediaDurationMs ?? 10000;
      final start = trimStartMs ?? 0;
      return (end - start).clamp(1000, 30000);
    }
    return 10000; // match web default (10s for image/text stories)
  }

  factory StoryItem.fromJson(Map<String, dynamic> j) {
    final overlaysRaw = j['textOverlays'];
    final overlays = overlaysRaw is List
        ? overlaysRaw.whereType<Map<String, dynamic>>().map(StoryTextOverlay.fromJson).toList()
        : <StoryTextOverlay>[];

    return StoryItem(
      id: j['id'] as String? ?? '',
      type: j['type'] as String? ?? 'media',
      mediaType: j['mediaType'] as String?,
      mediaUrl: j['mediaUrl'] as String?,
      mediaDurationMs: (j['mediaDurationMs'] as num?)?.toInt(),
      trimStartMs: (j['trimStartMs'] as num?)?.toInt(),
      trimEndMs: (j['trimEndMs'] as num?)?.toInt(),
      textContent: j['textContent'] as String?,
      backgroundStyle: j['backgroundStyle'] as String?,
      textOverlays: overlays,
      location: j['location'] as String?,
      music: j['music'] is Map<String, dynamic>
          ? StoryMusic.fromJson(j['music'] as Map<String, dynamic>)
          : null,
      viewCount: (j['viewCount'] as num?)?.toInt() ?? 0,
      reactionCount: (j['reactionCount'] as num?)?.toInt() ?? 0,
      viewed: j['viewed'] as bool? ?? false,
      myReaction: j['myReaction'] as String?,
      createdAt: DateTime.tryParse(j['createdAt'] as String? ?? '') ?? DateTime.now(),
      expiresAt: DateTime.tryParse(j['expiresAt'] as String? ?? '') ?? DateTime.now(),
      visibility: j['visibility'] as String? ?? 'followers',
    );
  }
}

// ── StoryFeedGroup ───────────────────────────────────────────────────────────

class StoryFeedGroup {
  const StoryFeedGroup({
    required this.userId,
    required this.username,
    required this.displayName,
    required this.avatarUrl,
    this.isCreatorVerified = false,
    required this.stories,
    required this.hasUnviewed,
    required this.latestStoryAt,
  });

  final String userId;
  final String username;
  final String displayName;
  final String avatarUrl;
  final bool isCreatorVerified;
  final List<StoryItem> stories;
  final bool hasUnviewed;
  final DateTime latestStoryAt;

  factory StoryFeedGroup.fromJson(Map<String, dynamic> j) {
    final storiesRaw = j['stories'];
    final stories = storiesRaw is List
        ? storiesRaw.whereType<Map<String, dynamic>>().map(StoryItem.fromJson).toList()
        : <StoryItem>[];
    return StoryFeedGroup(
      userId: j['userId'] as String? ?? '',
      username: j['username'] as String? ?? '',
      displayName: j['displayName'] as String? ?? '',
      avatarUrl: j['avatarUrl'] as String? ?? '',
      isCreatorVerified: j['isCreatorVerified'] as bool? ?? false,
      stories: stories,
      hasUnviewed: j['hasUnviewed'] as bool? ?? false,
      latestStoryAt: DateTime.tryParse(j['latestStoryAt'] as String? ?? '') ?? DateTime.now(),
    );
  }
}

// ── StoryViewer (for who-viewed overlay) ────────────────────────────────────

class StoryViewer {
  const StoryViewer({
    required this.userId,
    required this.viewedAt,
    this.username,
    this.displayName,
    this.avatarUrl,
    this.reaction,
    required this.isFollowing,
  });

  final String userId;
  final DateTime viewedAt;
  final String? username;
  final String? displayName;
  final String? avatarUrl;
  final String? reaction;
  final bool isFollowing;

  factory StoryViewer.fromJson(Map<String, dynamic> j) => StoryViewer(
        userId: j['userId'] as String? ?? '',
        viewedAt: DateTime.tryParse(j['viewedAt'] as String? ?? '') ?? DateTime.now(),
        username: j['username'] as String?,
        displayName: j['displayName'] as String?,
        avatarUrl: j['avatarUrl'] as String?,
        reaction: j['reaction'] as String?,
        isFollowing: j['isFollowing'] as bool? ?? false,
      );

  StoryViewer copyWith({bool? isFollowing}) => StoryViewer(
        userId: userId,
        viewedAt: viewedAt,
        username: username,
        displayName: displayName,
        avatarUrl: avatarUrl,
        reaction: reaction,
        isFollowing: isFollowing ?? this.isFollowing,
      );
}

// ── Background gradient helpers ──────────────────────────────────────────────

/// Parse a CSS-like linear-gradient string into a Flutter LinearGradient.
/// Falls back to a default if unparseable.
LinearGradient parseBackgroundGradient(String? css) {
  if (css == null || css.isEmpty) {
    return const LinearGradient(
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
      colors: [Color(0xFF1a1a2e), Color(0xFF16213e)],
    );
  }
  try {
    // Extract colors using regex
    final colorPattern = RegExp(r'#[0-9a-fA-F]{6}');
    final matches = colorPattern.allMatches(css).toList();
    if (matches.isEmpty) return _defaultGradient;

    final colors = matches.map((m) {
      final hex = m.group(0)!.replaceFirst('#', '');
      return Color(int.parse('FF$hex', radix: 16));
    }).toList();

    if (colors.length == 1) {
      return LinearGradient(colors: [colors[0], colors[0]]);
    }

    // Parse angle
    final angleMatch = RegExp(r'(\d+)deg').firstMatch(css);
    final angleDeg = angleMatch != null ? double.parse(angleMatch.group(1)!) : 135.0;
    final rad = angleDeg * 3.14159265 / 180;
    final begin = Alignment(-math.cos(rad + math.pi / 2), -math.sin(rad + math.pi / 2));
    final end = Alignment(math.cos(rad + math.pi / 2), math.sin(rad + math.pi / 2));

    return LinearGradient(begin: begin, end: end, colors: colors);
  } catch (_) {
    return _defaultGradient;
  }
}

const _defaultGradient = LinearGradient(
  begin: Alignment.topLeft,
  end: Alignment.bottomRight,
  colors: [Color(0xFF1a1a2e), Color(0xFF16213e)],
);

/// Predefined story background options
const kStoryBgOptions = [
  'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
  'linear-gradient(135deg, #e11d48 0%, #7c3aed 100%)',
  'linear-gradient(135deg, #0ea5e9 0%, #7c3aed 100%)',
  'linear-gradient(135deg, #f97316 0%, #ec4899 100%)',
  'linear-gradient(135deg, #22c55e 0%, #14b8a6 100%)',
  'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)',
  'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
  'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
  'linear-gradient(135deg, #064e3b 0%, #065f46 100%)',
  'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)',
];
