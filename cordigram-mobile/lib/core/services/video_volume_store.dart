/// Global singleton for video volume/mute state.
/// Mirrors the web's videoVolumeStore — one change propagates to all players.
class VideoVolumeStore {
  VideoVolumeStore._();
  static final VideoVolumeStore instance = VideoVolumeStore._();

  double _volume = 1.0;
  bool _muted = true; // start muted for autoplay compat

  double get volume => _volume;
  bool get muted => _muted;

  final List<void Function()> _listeners = [];

  void setMuted(bool muted) {
    _muted = muted;
    _notifyAll();
  }

  void setVolume(double volume) {
    _volume = volume.clamp(0.0, 1.0);
    _muted = _volume == 0.0;
    _notifyAll();
  }

  /// Returns an unsubscribe function.
  void Function() subscribe(void Function() listener) {
    _listeners.add(listener);
    return () => _listeners.remove(listener);
  }

  void _notifyAll() {
    for (final l in List.of(_listeners)) {
      l();
    }
  }
}
