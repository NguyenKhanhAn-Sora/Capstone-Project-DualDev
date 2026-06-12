import 'package:intl/date_symbol_data_local.dart';
import 'package:intl/intl.dart';

import '../../../core/services/language_controller.dart';

/// Định dạng ngày Boost theo [LanguageController] (parity web `localeTagForLanguage`).
class MessagesBoostFormat {
  MessagesBoostFormat._();

  static bool _initialized = false;

  static Future<void> ensureInitialized() async {
    if (_initialized) return;
    for (final code in LanguageController.supported) {
      try {
        await initializeDateFormatting(code);
      } catch (_) {}
    }
    _initialized = true;
  }

  static String formatExpiryDate(DateTime date) {
    final lang = LanguageController.instance.language;
    try {
      return DateFormat.yMMMd(lang).format(date.toLocal());
    } catch (_) {
      final d = date.toLocal();
      return '${d.day}/${d.month}/${d.year}';
    }
  }

  static String formatExpiryDateTime(DateTime date) {
    final lang = LanguageController.instance.language;
    try {
      return DateFormat.yMMMd(lang).add_jm().format(date.toLocal());
    } catch (_) {
      return formatExpiryDate(date);
    }
  }

  /// Badge: "Hết hạn: 25 thg 6, 2026 · Boost"
  static String expiresBadgeText({
    required DateTime expiresAt,
    String? tierLabel,
  }) {
    final t = LanguageController.instance.t;
    final date = formatExpiryDate(expiresAt);
    if (tierLabel != null && tierLabel.isNotEmpty) {
      return t('chat.boostStore.expiresWithTier', {
        'label': t('chat.boostStore.expiresLabel'),
        'date': date,
        'tier': tierLabel,
      });
    }
    return t('chat.boostStore.expiresLine', {
      'label': t('chat.boostStore.expiresLabel'),
      'date': date,
    });
  }

  /// Cảnh báo còn hạn: chèn ngày đã localize.
  static String activePeriodWarningBody(DateTime expiresAt) {
    return LanguageController.instance.t(
      'chat.boostStore.warnings.activeBodyWithDate',
      {'date': formatExpiryDate(expiresAt)},
    );
  }
}
