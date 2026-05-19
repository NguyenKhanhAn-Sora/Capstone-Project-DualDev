import '../models/dm_message.dart';

/// Call log helpers — mirrors `cordigram-web/lib/dm-call-message.ts`.
class DmCallMessageUtils {
  DmCallMessageUtils._();

  static bool isMissedStatus(String? status) {
    final s = status ?? 'missed';
    return s == 'missed' || s == 'declined' || s == 'cancelled';
  }

  static bool isIncomingMissed(DmMessage message, String? viewerId) {
    if (!message.isCallMessage) return false;
    if (!isMissedStatus(message.callStatus)) return false;
    final initiator = message.callInitiatorId ?? message.senderId;
    return viewerId != null && initiator != viewerId;
  }

  static String callCardTitle(
    DmMessage message,
    String? viewerId, {
    String languageCode = 'vi',
  }) {
    final isVideo = message.callType == 'video';
    final missed = isMissedStatus(message.callStatus);
    final en = languageCode == 'en';

    if (missed) {
      if (isIncomingMissed(message, viewerId)) {
        if (isVideo) {
          return en ? 'Missed video call' : 'Đã bỏ lỡ cuộc gọi video';
        }
        return en ? 'Missed voice call' : 'Đã bỏ lỡ cuộc gọi thoại';
      }
      if (isVideo) {
        return en ? 'Outgoing video call' : 'Cuộc gọi video';
      }
      return en ? 'Outgoing voice call' : 'Cuộc gọi thoại';
    }
    if (isVideo) {
      return en ? 'Video call' : 'Cuộc gọi video';
    }
    return en ? 'Voice call' : 'Cuộc gọi thoại';
  }

  static String formatDuration(int sec, {String languageCode = 'vi'}) {
    final s = sec.clamp(0, 86400);
    final en = languageCode == 'en';
    if (s < 60) return en ? '$s sec' : '$s giây';
    final min = s ~/ 60;
    final rem = s % 60;
    if (rem == 0) return en ? '$min min' : '$min phút';
    return en ? '$min min $rem sec' : '$min phút $rem giây';
  }

  static String callCardSubtitle(
    DmMessage message, {
    String languageCode = 'vi',
  }) {
    if ((message.callStatus ?? '') == 'completed' &&
        message.callDurationSec != null) {
      return formatDuration(
        message.callDurationSec!,
        languageCode: languageCode,
      );
    }
    final t = message.createdAt;
    final h = t.hour.toString().padLeft(2, '0');
    final m = t.minute.toString().padLeft(2, '0');
    return '$h:$m';
  }

  static String callBackLabel({String languageCode = 'vi'}) {
    return languageCode == 'en' ? 'Call back' : 'Gọi lại';
  }

  /// Preview line in DM sidebar (uses server `content` when present).
  static String threadPreviewForMessage(
    DmMessage message, {
    String? viewerId,
    String languageCode = 'vi',
  }) {
    final trimmed = message.content.trim();
    if (!message.isCallMessage) {
      if (trimmed.isNotEmpty) return trimmed;
      final en = languageCode == 'en';
      switch (message.type) {
        case 'voice':
          return en ? 'Voice message' : 'Tin nhắn thoại';
        case 'sticker':
          return en ? 'Sticker' : 'Sticker';
        case 'gif':
          return en ? 'GIF' : 'GIF';
        default:
          return trimmed;
      }
    }
    if (trimmed.isNotEmpty) return trimmed;
    return callCardTitle(message, viewerId, languageCode: languageCode);
  }
}
