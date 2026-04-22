import 'package:flutter/services.dart';

class MessageNotificationSound {
  MessageNotificationSound._();

  static DateTime? _lastPlayAt;

  static void play() {
    final now = DateTime.now();
    if (_lastPlayAt != null &&
        now.difference(_lastPlayAt!).inMilliseconds < 350) {
      return;
    }
    _lastPlayAt = now;
    SystemSound.play(SystemSoundType.alert);
  }
}
