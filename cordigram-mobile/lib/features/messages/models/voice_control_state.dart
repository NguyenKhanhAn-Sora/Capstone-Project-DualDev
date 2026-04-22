class VoiceControlState {
  const VoiceControlState({
    required this.contextKey,
    required this.micMuted,
    required this.soundMuted,
  });

  final String contextKey;
  final bool micMuted;
  final bool soundMuted;

  VoiceControlState copyWith({bool? micMuted, bool? soundMuted}) {
    return VoiceControlState(
      contextKey: contextKey,
      micMuted: micMuted ?? this.micMuted,
      soundMuted: soundMuted ?? this.soundMuted,
    );
  }
}
