import '../models/dm_message.dart';
import 'messages_i18n.dart';

/// Call log helpers — mirrors web `CallMessageCard` + `dm-call-message.ts`.
class DmCallMessageUtils {
  DmCallMessageUtils._();

  static bool isMissedStatus(String? status) =>
      MessagesI18n.isMissedCallStatus(status);

  static bool isIncomingMissed(DmMessage message, String? viewerId) =>
      MessagesI18n.isIncomingMissed(message, viewerId);

  static String callCardTitle(
    DmMessage message,
    String? viewerId, {
    String languageCode = 'vi',
  }) =>
      MessagesI18n.callCardTitle(message, viewerId);

  static String formatDuration(int sec, {String languageCode = 'vi'}) =>
      MessagesI18n.formatCallDuration(sec);

  static String callCardSubtitle(
    DmMessage message, {
    String languageCode = 'vi',
    String? viewerId,
  }) =>
      MessagesI18n.callCardSubtitle(message, viewerId);

  static String callBackLabel({String languageCode = 'vi'}) =>
      MessagesI18n.callBackLabel();

  static String threadPreviewForMessage(
    DmMessage message, {
    String? viewerId,
    String languageCode = 'vi',
  }) =>
      MessagesI18n.threadPreviewForMessage(message, viewerId: viewerId);
}
