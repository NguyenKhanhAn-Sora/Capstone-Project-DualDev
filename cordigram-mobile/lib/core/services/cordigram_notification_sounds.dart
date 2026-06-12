import 'package:audioplayers/audioplayers.dart';

import 'notification_sound_config.dart';

/// In-app notification / call ringtones (assets). Push tray sounds use Android
/// raw resources via [NotificationSoundConfig].
class CordigramNotificationSounds {
  CordigramNotificationSounds._();

  static final AudioPlayer _player = AudioPlayer();
  static CordigramSoundKind? _loopingKind;

  static Future<void> playMessage() async {
    await _playOnce(
      asset: NotificationSoundConfig.messageAsset,
      kind: CordigramSoundKind.message,
    );
  }

  static Future<void> startIncomingCall() async {
    await _startLoop(
      asset: NotificationSoundConfig.incomingCallAsset,
      kind: CordigramSoundKind.incomingCall,
    );
  }

  static Future<void> startOutgoingCall() async {
    await _startLoop(
      asset: NotificationSoundConfig.outgoingCallAsset,
      kind: CordigramSoundKind.outgoingCall,
    );
  }

  static Future<void> stopCallLoop() async {
    if (_loopingKind == null) return;
    _loopingKind = null;
    await _player.stop();
  }

  static Future<void> _playOnce({
    required String asset,
    required CordigramSoundKind kind,
  }) async {
    if (_loopingKind != null) return;
    await _player.stop();
    await _player.setReleaseMode(ReleaseMode.stop);
    await _player.play(AssetSource(asset));
  }

  static Future<void> _startLoop({
    required String asset,
    required CordigramSoundKind kind,
  }) async {
    if (_loopingKind == kind) return;
    _loopingKind = kind;
    await _player.stop();
    await _player.setReleaseMode(ReleaseMode.loop);
    await _player.play(AssetSource(asset));
  }
}

enum CordigramSoundKind { message, incomingCall, outgoingCall }
