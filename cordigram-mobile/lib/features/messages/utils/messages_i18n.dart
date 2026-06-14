import '../../../core/services/language_controller.dart';
import '../models/dm_conversation.dart';
import '../models/dm_message.dart';
import '../models/presence_state.dart';

/// Bản địa hoá Messages/DM — parity web (`dm-presence-label`, `CallMessageCard`, `relative-time`).
class MessagesI18n {
  MessagesI18n._();

  static String t(String key, [Map<String, dynamic>? vars]) =>
      LanguageController.instance.t(key, vars);

  /// Nhãn thời gian ngắn cạnh tên (8h, 31d…) — `chat.popups.inbox.time*`.
  static String formatThreadTimeShort(DateTime? time) {
    if (time == null) return '';
    final diff = DateTime.now().difference(time);
    if (diff.inMinutes < 1) return t('post.time.justNow');
    if (diff.inMinutes < 60) {
      return t('chat.popups.inbox.timeMinutes', {'n': '${diff.inMinutes}'});
    }
    if (diff.inHours < 24) {
      return t('chat.popups.inbox.timeHours', {'n': '${diff.inHours}'});
    }
    return t('chat.popups.inbox.timeDays', {'n': '${diff.inDays}'});
  }

  /// Khoảng thời gian có hậu tố (date-fns style) — `post.time.*`.
  static String formatRelativeAgo(DateTime? time) {
    if (time == null) return '';
    try {
      final dt = time.toLocal();
      final diff = DateTime.now().difference(dt);
      if (diff.isNegative) return t('post.time.justNow');

      final mins = (diff.inSeconds / 60).round();
      if (mins < 1) return t('post.time.justNow');
      if (mins < 2) return t('post.time.minuteAgo', {'n': '1'});
      if (mins < 45) return t('post.time.minutesAgo', {'n': '$mins'});
      if (mins < 90) return t('post.time.aboutHourAgo');
      if (mins < 1440) {
        return t('post.time.hoursAgo', {'n': '${(mins / 60).round()}'});
      }
      if (mins < 2520) return t('post.time.dayAgo', {'n': '1'});
      if (mins < 43200) {
        return t('post.time.daysAgo', {'n': '${(mins / 1440).round()}'});
      }
      if (mins < 86400) {
        return t('post.time.monthsAgo', {'n': '${(mins / 43200).round()}'});
      }

      const minsPerYear = 525960;
      if (mins < minsPerYear) {
        return t('post.time.monthsAgo', {'n': '${(mins / 43200).round()}'});
      }

      final months = (mins / 43200).round();
      if (months < 15) return t('post.time.aboutYearAgo');
      if (months < 21) return t('post.time.overYearAgo');
      if (months < 24) return t('post.time.almostTwoYearsAgo');

      final years = months ~/ 12;
      final rem = months % 12;
      if (rem < 3) return t('post.time.aboutYearsAgo', {'n': '$years'});
      if (rem < 9) return t('post.time.overYearsAgo', {'n': '$years'});
      return t('post.time.almostYearsAgo', {'n': '${years + 1}'});
    } catch (_) {
      return '';
    }
  }

  /// Trạng thái online / idle / offline + lần hoạt động.
  static String presenceLabel({
    required bool isOnline,
    PresenceStatus? status,
    DateTime? lastSeenAt,
  }) {
    if (status == PresenceStatus.online ||
        (isOnline && status != PresenceStatus.idle)) {
      return t('chat.presence.online');
    }
    if (status == PresenceStatus.idle) {
      return t('chat.presence.idle');
    }
    final rel = formatRelativeAgo(lastSeenAt);
    if (rel.isNotEmpty) {
      return t('chat.presence.offlineAgo', {'time': rel});
    }
    return t('chat.presence.offline');
  }

  static bool isMissedCallStatus(String? status) {
    final s = status ?? 'missed';
    return s == 'missed' || s == 'declined' || s == 'cancelled';
  }

  static bool isIncomingMissed(DmMessage message, String? viewerId) {
    if (!message.isCallMessage) return false;
    if (!isMissedCallStatus(message.callStatus)) return false;
    final initiator = message.callInitiatorId ?? message.senderId;
    return viewerId != null && initiator != viewerId;
  }

  static String callCardTitle(
    DmMessage message,
    String? viewerId,
  ) {
    final isVideo = message.callType == 'video';
    final status = message.callStatus ?? 'missed';
    final missed = status == 'missed';
    final declined = status == 'declined';
    final cancelled = status == 'cancelled';
    final incomingMissed = isIncomingMissed(message, viewerId);

    if (declined) {
      return isVideo
          ? t('chat.callMessage.declinedVideo')
          : t('chat.callMessage.declinedVoice');
    }
    if (cancelled) {
      return isVideo
          ? t('chat.callMessage.cancelledVideo')
          : t('chat.callMessage.cancelledVoice');
    }
    if (missed) {
      if (incomingMissed) {
        return isVideo
            ? t('chat.callMessage.missedVideo')
            : t('chat.callMessage.missedVoice');
      }
      return isVideo
          ? t('chat.callMessage.outgoingMissedVideo')
          : t('chat.callMessage.outgoingMissedVoice');
    }
    return isVideo
        ? t('chat.callMessage.completedVideo')
        : t('chat.callMessage.completedVoice');
  }

  static String formatCallDuration(int sec) {
    final s = sec.clamp(0, 86400);
    if (s < 60) return t('chat.callMessage.durationSeconds', {'n': '$s'});
    final min = s ~/ 60;
    final rem = s % 60;
    if (rem == 0) return t('chat.callMessage.durationMinutes', {'n': '$min'});
    return t('chat.callMessage.durationMinutesSeconds', {
      'm': '$min',
      's': '$rem',
    });
  }

  static String callCardSubtitle(DmMessage message, String? viewerId) {
    final status = message.callStatus ?? '';
    if (status == 'completed' && message.callDurationSec != null) {
      return formatCallDuration(message.callDurationSec!);
    }
    if (isMissedCallStatus(status) && isIncomingMissed(message, viewerId)) {
      return t('chat.callMessage.noAnswer');
    }
    final t0 = message.createdAt;
    final h = t0.hour.toString().padLeft(2, '0');
    final m = t0.minute.toString().padLeft(2, '0');
    return '$h:$m';
  }

  static String callBackLabel() => t('chat.callMessage.callBack');

  /// Sidebar / conversation list — API may return Vietnamese `content` only.
  static String localizeSidebarPreview(
    String raw, {
    String? messageType,
    String? callType,
    String? callStatus,
    int? callDurationSec,
    String? callInitiatorId,
    String? viewerId,
  }) {
    final type = (messageType ?? '').trim().toLowerCase();
    if (type == 'voice' || _looksLikeVoicePreview(raw)) {
      return t('chat.messagesPage.voiceMessageLabel');
    }
    if (type == 'sticker') return t('chat.composer.replySticker');
    if (type == 'gif') return t('chat.composer.replyGif');
    if (type == 'call' || _looksLikeCallPreview(raw)) {
      final parsed = type == 'call'
          ? _callPreviewFromMetadata(
              callType: callType,
              callStatus: callStatus,
              callDurationSec: callDurationSec,
              callInitiatorId: callInitiatorId,
            )
          : _parseCallPreviewFromRaw(raw);
      if (parsed != null) {
        return threadPreviewForMessage(parsed, viewerId: viewerId);
      }
    }
    return raw.trim();
  }

  static String previewForConversation(
    DmConversation conversation, {
    String? viewerId,
  }) =>
      localizeSidebarPreview(
        conversation.lastMessage,
        messageType: conversation.lastMessageType,
        callType: conversation.lastCallType,
        callStatus: conversation.lastCallStatus,
        callDurationSec: conversation.lastCallDurationSec,
        callInitiatorId: conversation.lastCallInitiatorId,
        viewerId: viewerId,
      );

  static bool _looksLikeVoicePreview(String raw) {
    final lower = raw.toLowerCase().replaceAll('🔊', '').trim();
    const needles = [
      'tin nhắn thoại',
      'voice message',
      'ボイスメッセージ',
      '语音消息',
      'voice note',
      'voice msg',
    ];
    return needles.any((n) => lower == n || lower.startsWith('$n '));
  }

  static bool _looksLikeCallPreview(String raw) {
    final lower = raw.toLowerCase();
    const needles = [
      'cuộc gọi',
      'cuoc goi',
      'video call',
      'voice call',
      'phone call',
      'missed call',
      'bỏ lỡ',
      'bo lo',
      '通話',
      '通话',
      'ビデオ通話',
      '视频通话',
    ];
    return needles.any(lower.contains);
  }

  static DmMessage? _callPreviewFromMetadata({
    String? callType,
    String? callStatus,
    int? callDurationSec,
    String? callInitiatorId,
  }) {
    final ct = (callType ?? '').trim().toLowerCase();
    if (ct.isEmpty) return null;
    return _syntheticCallMessage(
      callType: ct == 'video' ? 'video' : 'audio',
      callStatus: (callStatus ?? 'completed').trim().toLowerCase(),
      callDurationSec: callDurationSec,
      callInitiatorId: callInitiatorId,
    );
  }

  static DmMessage? _parseCallPreviewFromRaw(String raw) {
    final s = raw.trim();
    if (s.isEmpty || !_looksLikeCallPreview(s)) return null;

    final lower = s.toLowerCase();
    final isVideo = lower.contains('video') ||
        lower.contains('ビデオ') ||
        lower.contains('视频');
    final callType = isVideo ? 'video' : 'audio';

    String status = 'completed';
    if (lower.contains('từ chối') ||
        lower.contains('declined') ||
        lower.contains('拒否')) {
      status = 'declined';
    } else if (lower.contains('đã hủy') ||
        lower.contains('cancelled') ||
        lower.contains('キャンセル') ||
        lower.contains('取消')) {
      status = 'cancelled';
    } else if (lower.contains('bỏ lỡ') ||
        lower.contains('missed') ||
        lower.contains('見逃') ||
        lower.contains('未接')) {
      status = 'missed';
    }

    int? durationSec;
    final secMatch = RegExp(
      r'[·•]\s*(\d+)\s*(?:giây|giay|sec(?:ond)?s?|秒)',
      caseSensitive: false,
    ).firstMatch(s);
    if (secMatch != null) {
      durationSec = int.tryParse(secMatch.group(1)!);
      status = 'completed';
    } else {
      final minOnly = RegExp(
        r'[·•]\s*(\d+)\s*(?:phút|phut|min(?:ute)?s?|分)(?:\s|$)',
        caseSensitive: false,
      ).firstMatch(s);
      if (minOnly != null) {
        durationSec = (int.tryParse(minOnly.group(1)!) ?? 0) * 60;
        status = 'completed';
      } else {
        final minSec = RegExp(
          r'[·•]\s*(\d+)\s*(?:phút|phut|min(?:ute)?s?|分)\s+(\d+)\s*(?:giây|giay|sec(?:ond)?s?|秒)',
          caseSensitive: false,
        ).firstMatch(s);
        if (minSec != null) {
          final m = int.tryParse(minSec.group(1)!) ?? 0;
          final sec = int.tryParse(minSec.group(2)!) ?? 0;
          durationSec = m * 60 + sec;
          status = 'completed';
        }
      }
    }

    return _syntheticCallMessage(
      callType: callType,
      callStatus: status,
      callDurationSec: durationSec,
    );
  }

  static DmMessage _syntheticCallMessage({
    required String callType,
    required String callStatus,
    int? callDurationSec,
    String? callInitiatorId,
  }) =>
      DmMessage(
        id: '_sidebar_preview',
        senderId: callInitiatorId ?? '',
        receiverId: '',
        content: '',
        createdAt: DateTime.now(),
        type: 'call',
        read: true,
        callType: callType,
        callStatus: callStatus,
        callDurationSec: callDurationSec,
        callInitiatorId: callInitiatorId,
      );

  static String threadPreviewForMessage(
    DmMessage message, {
    String? viewerId,
  }) {
    if (message.isCallMessage) {
      final title = callCardTitle(message, viewerId);
      final status = message.callStatus ?? '';
      if (status == 'completed' && message.callDurationSec != null) {
        return '$title · ${formatCallDuration(message.callDurationSec!)}';
      }
      return title;
    }
    switch (message.type) {
      case 'voice':
        return t('chat.messagesPage.voiceMessageLabel');
      case 'sticker':
        return t('chat.composer.replySticker');
      case 'gif':
        return t('chat.composer.replyGif');
      default:
        final trimmed = message.content.trim();
        return trimmed;
    }
  }

  static String dmListSent() => t('chat.dmList.sent');
  static String dmListSeen() => t('chat.dmList.seen');

  static String serverInviteMembers(int count) =>
      t('chat.serverInviteCard.members', {'n': '$count'});

  static String serverInviteFounded(String date) =>
      t('chat.serverInviteCard.founded', {'date': date});

  static String serverInviteJoin() => t('chat.serverInviteCard.goToServer');

  static String formatInviteFoundedDate(DateTime created) {
    final lang = LanguageController.instance.language;
    if (lang == 'ja' || lang == 'zh') {
      return '${created.year}年${created.month}月';
    }
    if (lang == 'vi') {
      return 'thg ${created.month} ${created.year}';
    }
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    final m = created.month.clamp(1, 12);
    return '${months[m - 1]} ${created.year}';
  }

  static String dmMuteUntilForever() =>
      t('chat.dmConversation.muteUntilForever');

  static String dmUnmuteNotifications() =>
      t('chat.dmConversation.unmuteNotifications');

  static String dmBlock() => t('chat.dmConversation.block');

  static String dmUnblock() => t('chat.dmConversation.unblock');

  static String dmBlockedByYou(String name) => t(
        'chat.dmConversation.blockedByYou',
      ).replaceAll('{name}', name);

  static String dmBlockedByPeer(String name) => t(
        'chat.dmConversation.blockedByPeer',
      ).replaceAll('{name}', name);

  static String dmMuteDialogTitle() => t('chat.dmConversation.muteDialogTitle');

  static String dmMuteDialogActiveTitle() =>
      t('chat.dmConversation.muteDialogActiveTitle');

  static String dmTurnOnNotifications() =>
      t('chat.dmConversation.turnOnNotifications');

  static String dmBlockUpdateError() =>
      t('chat.dmConversation.blockUpdateError');

  static String dmMuteDuration(String key) =>
      t('chat.channelUserProfile.mute.$key');

  static String mutualServersLabel() =>
      t('chat.userProfile.mutualServersLabel');

  static String memberSinceLabel() =>
      t('chat.userProfile.memberSinceLabel');
}
