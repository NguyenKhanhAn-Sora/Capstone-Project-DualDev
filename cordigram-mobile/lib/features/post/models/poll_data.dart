class PollOptionResult {
  const PollOptionResult({
    required this.option,
    required this.voteCount,
    required this.percentage,
  });

  final String option;
  final int voteCount;
  final int percentage;

  factory PollOptionResult.fromJson(Map<String, dynamic> json) =>
      PollOptionResult(
        option: (json['option'] as String?) ?? '',
        voteCount: (json['voteCount'] as num?)?.toInt() ?? 0,
        percentage: (json['percentage'] as num?)?.toInt() ?? 0,
      );
}

class PollData {
  const PollData({
    required this.id,
    required this.question,
    required this.options,
    required this.optionImages,
    required this.allowMultipleAnswers,
    required this.expiresAt,
    required this.isExpired,
    required this.results,
    required this.totalVotes,
    required this.uniqueVoters,
    required this.hoursLeft,
    this.userVotes,
  });

  final String id;
  final String question;
  final List<String> options;
  final List<String> optionImages; // same length as options, empty string = no image
  final bool allowMultipleAnswers;
  final String expiresAt;
  final bool isExpired;
  final List<PollOptionResult> results;
  final int totalVotes;
  final int uniqueVoters;
  final double hoursLeft;
  final List<int>? userVotes; // null = not fetched yet

  bool get hasImages => optionImages.any((img) => img.isNotEmpty);

  PollData copyWith({List<int>? userVotes, List<PollOptionResult>? results, int? totalVotes}) {
    return PollData(
      id: id,
      question: question,
      options: options,
      optionImages: optionImages,
      allowMultipleAnswers: allowMultipleAnswers,
      expiresAt: expiresAt,
      isExpired: isExpired,
      results: results ?? this.results,
      totalVotes: totalVotes ?? this.totalVotes,
      uniqueVoters: uniqueVoters,
      hoursLeft: hoursLeft,
      userVotes: userVotes ?? this.userVotes,
    );
  }

  factory PollData.fromJson(Map<String, dynamic> json) {
    final resultsRaw = json['results'];
    final results = (resultsRaw is List)
        ? resultsRaw
            .whereType<Map<String, dynamic>>()
            .map(PollOptionResult.fromJson)
            .toList()
        : <PollOptionResult>[];

    final optionsRaw = json['options'];
    final options = (optionsRaw is List)
        ? optionsRaw.whereType<String>().toList()
        : <String>[];

    final imagesRaw = json['optionImages'];
    final List<String> optionImages;
    if (imagesRaw is List) {
      optionImages = imagesRaw.map((e) => (e as String?) ?? '').toList();
      // Pad to same length as options
      while (optionImages.length < options.length) {
        optionImages.add('');
      }
    } else {
      optionImages = List.filled(options.length, '');
    }

    final userVotesRaw = json['userVotes'];
    final List<int>? userVotes = userVotesRaw is List
        ? userVotesRaw
            .map((e) => e is num ? e.toInt() : int.tryParse(e.toString()))
            .whereType<int>()
            .toList()
        : null;

    return PollData(
      id: (json['id'] as String?) ?? '',
      question: (json['question'] as String?) ?? '',
      options: options,
      optionImages: optionImages,
      allowMultipleAnswers: (json['allowMultipleAnswers'] as bool?) ?? false,
      expiresAt: (json['expiresAt'] as String?) ?? '',
      isExpired: (json['isExpired'] as bool?) ?? false,
      results: results,
      totalVotes: (json['totalVotes'] as num?)?.toInt() ?? 0,
      uniqueVoters: (json['uniqueVoters'] as num?)?.toInt() ?? 0,
      hoursLeft: (json['hoursLeft'] as num?)?.toDouble() ?? 0,
      userVotes: userVotes,
    );
  }
}

class PollVoterItem {
  const PollVoterItem({
    required this.userId,
    required this.username,
    required this.displayName,
    required this.avatarUrl,
    required this.isFollowing,
  });

  final String userId;
  final String username;
  final String displayName;
  final String avatarUrl;
  final bool isFollowing;

  PollVoterItem copyWith({bool? isFollowing}) => PollVoterItem(
        userId: userId,
        username: username,
        displayName: displayName,
        avatarUrl: avatarUrl,
        isFollowing: isFollowing ?? this.isFollowing,
      );

  factory PollVoterItem.fromJson(Map<String, dynamic> json) => PollVoterItem(
        userId: (json['userId'] as String?) ?? '',
        username: (json['username'] as String?) ?? '',
        displayName: (json['displayName'] as String?) ?? '',
        avatarUrl: (json['avatarUrl'] as String?) ?? '',
        isFollowing: (json['isFollowing'] as bool?) ?? false,
      );
}
