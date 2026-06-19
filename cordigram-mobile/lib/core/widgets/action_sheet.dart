import 'package:flutter/material.dart';
import '../services/language_controller.dart';

/// An item in a [showActionSheet] menu.
class ActionSheetItem {
  const ActionSheetItem({
    required this.id,
    required this.label,
    required this.icon,
    this.danger = false,
  });

  final String id;
  final String label;
  final IconData icon;
  final bool danger;
}

/// Shows a hide-confirmation bottom sheet.
/// [titleKey] and [messageKey] are LanguageController keys.
/// Returns true if the user confirmed, false/null otherwise.
Future<bool?> showHideConfirmSheet(
  BuildContext context, {
  required String titleKey,
  required String messageKey,
  required String buttonKey,
}) {
  return showModalBottomSheet<bool>(
    context: context,
    backgroundColor: Colors.transparent,
    isScrollControlled: true,
    useRootNavigator: true,
    builder: (_) => _HideConfirmSheet(
      titleKey: titleKey,
      messageKey: messageKey,
      buttonKey: buttonKey,
    ),
  );
}

// ── Hide-confirm sheet ────────────────────────────────────────────────────────

class _HideConfirmSheet extends StatelessWidget {
  const _HideConfirmSheet({
    required this.titleKey,
    required this.messageKey,
    required this.buttonKey,
  });

  final String titleKey;
  final String messageKey;
  final String buttonKey;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final isGalaxy = theme.scaffoldBackgroundColor == Colors.transparent;
    final lc = LanguageController.instance;

    final bgColor = isGalaxy
        ? const Color(0xFF060C22).withValues(alpha: 0.97)
        : scheme.surface;
    final borderColor = isGalaxy
        ? const Color(0xFF1E3A6E).withValues(alpha: 0.85)
        : scheme.outline.withValues(alpha: 0.35);
    final textColor = isGalaxy ? const Color(0xFFD8EAFF) : scheme.onSurface;
    final subColor = isGalaxy
        ? const Color(0xFF7A99C8)
        : scheme.onSurfaceVariant;

    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(10, 0, 10, 12),
        child: Container(
          decoration: BoxDecoration(
            color: bgColor,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: borderColor),
            boxShadow: isGalaxy
                ? [
                    BoxShadow(
                      color: const Color(0xFF22D3EE).withValues(alpha: 0.07),
                      blurRadius: 32,
                    ),
                  ]
                : null,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Handle bar
              Container(
                width: 36,
                height: 4,
                margin: const EdgeInsets.symmetric(vertical: 12),
                decoration: BoxDecoration(
                  color: isGalaxy
                      ? const Color(0xFF4A6A9E).withValues(alpha: 0.55)
                      : scheme.onSurfaceVariant.withValues(alpha: 0.35),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              // Galaxy accent line
              if (isGalaxy)
                Container(
                  height: 1,
                  margin: const EdgeInsets.fromLTRB(14, 0, 14, 4),
                  decoration: const BoxDecoration(
                    gradient: LinearGradient(
                      colors: [
                        Colors.transparent,
                        Color(0xFF7C3AED),
                        Color(0xFF22D3EE),
                        Colors.transparent,
                      ],
                      stops: [0.0, 0.3, 0.7, 1.0],
                    ),
                  ),
                ),
              // Icon
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
                child: Icon(
                  Icons.visibility_off_outlined,
                  size: 32,
                  color: isGalaxy
                      ? const Color(0xFF22D3EE).withValues(alpha: 0.80)
                      : scheme.onSurfaceVariant,
                ),
              ),
              // Title
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 10, 20, 6),
                child: Text(
                  lc.t(titleKey),
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: textColor,
                    fontSize: 17,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              // Message
              Padding(
                padding: const EdgeInsets.fromLTRB(24, 0, 24, 20),
                child: Text(
                  lc.t(messageKey),
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: subColor,
                    fontSize: 13.5,
                    height: 1.5,
                  ),
                ),
              ),
              // Buttons
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                child: Row(
                  children: [
                    // Cancel
                    Expanded(
                      child: OutlinedButton(
                        onPressed: () => Navigator.of(context).pop(false),
                        style: OutlinedButton.styleFrom(
                          padding: const EdgeInsets.symmetric(vertical: 13),
                          side: BorderSide(
                            color: isGalaxy
                                ? const Color(0xFF2A4070)
                                : scheme.outline.withValues(alpha: 0.5),
                          ),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                        child: Text(
                          lc.t('common.cancel'),
                          style: TextStyle(
                            color: subColor,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    // Confirm (hide)
                    Expanded(
                      child: _buildConfirmButton(context, isGalaxy, scheme, lc),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildConfirmButton(
    BuildContext context,
    bool isGalaxy,
    ColorScheme scheme,
    LanguageController lc,
  ) {
    if (isGalaxy) {
      return GestureDetector(
        onTap: () => Navigator.of(context).pop(true),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 13),
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              colors: [Color(0xFF22D3EE), Color(0xFF7C3AED)],
            ),
            borderRadius: BorderRadius.circular(12),
          ),
          alignment: Alignment.center,
          child: Text(
            lc.t(buttonKey),
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
      );
    }
    return ElevatedButton(
      onPressed: () => Navigator.of(context).pop(true),
      style: ElevatedButton.styleFrom(
        padding: const EdgeInsets.symmetric(vertical: 13),
        backgroundColor: scheme.error,
        foregroundColor: scheme.onError,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
        ),
        elevation: 0,
      ),
      child: Text(
        lc.t(buttonKey),
        style: const TextStyle(fontWeight: FontWeight.w700),
      ),
    );
  }
}

// ── Action sheet ──────────────────────────────────────────────────────────────

/// Shows a bottom-sheet action menu that slides up from the bottom.
/// Styled to match galaxy or system theme. Returns the tapped [id], or null.
Future<String?> showActionSheet(
  BuildContext context, {
  required List<ActionSheetItem> items,
}) {
  return showModalBottomSheet<String>(
    context: context,
    backgroundColor: Colors.transparent,
    isScrollControlled: true,
    useRootNavigator: true,
    builder: (_) => _ActionSheetContent(items: items),
  );
}

// ── Sheet content ─────────────────────────────────────────────────────────────

class _ActionSheetContent extends StatelessWidget {
  const _ActionSheetContent({required this.items});
  final List<ActionSheetItem> items;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final isGalaxy = theme.scaffoldBackgroundColor == Colors.transparent;

    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(10, 0, 10, 12),
        child: Container(
          decoration: BoxDecoration(
            color: isGalaxy
                ? const Color(0xFF060C22).withValues(alpha: 0.97)
                : scheme.surface,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color: isGalaxy
                  ? const Color(0xFF1E3A6E).withValues(alpha: 0.85)
                  : scheme.outline.withValues(alpha: 0.35),
            ),
            boxShadow: isGalaxy
                ? [
                    BoxShadow(
                      color: const Color(0xFF22D3EE).withValues(alpha: 0.07),
                      blurRadius: 32,
                    ),
                    BoxShadow(
                      color: const Color(0xFF7C3AED).withValues(alpha: 0.06),
                      blurRadius: 20,
                      offset: const Offset(0, -4),
                    ),
                  ]
                : null,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Handle bar
              Container(
                width: 36,
                height: 4,
                margin: const EdgeInsets.symmetric(vertical: 12),
                decoration: BoxDecoration(
                  color: isGalaxy
                      ? const Color(0xFF4A6A9E).withValues(alpha: 0.55)
                      : scheme.onSurfaceVariant.withValues(alpha: 0.35),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              // Accent line (galaxy only)
              if (isGalaxy)
                Container(
                  height: 1,
                  margin: const EdgeInsets.fromLTRB(14, 0, 14, 4),
                  decoration: const BoxDecoration(
                    gradient: LinearGradient(
                      colors: [
                        Colors.transparent,
                        Color(0xFF7C3AED),
                        Color(0xFF22D3EE),
                        Colors.transparent,
                      ],
                      stops: [0.0, 0.3, 0.7, 1.0],
                    ),
                  ),
                ),
              ...items.map((item) => _Row(item: item, isGalaxy: isGalaxy)),
              const SizedBox(height: 6),
            ],
          ),
        ),
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.item, required this.isGalaxy});
  final ActionSheetItem item;
  final bool isGalaxy;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final color = item.danger
        ? const Color(0xFFF87171)
        : isGalaxy
            ? const Color(0xFFD8EAFF)
            : scheme.onSurface;

    return InkWell(
      onTap: () => Navigator.of(context).pop(item.id),
      borderRadius: BorderRadius.circular(12),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
        child: Row(
          children: [
            Icon(item.icon, color: color, size: 20),
            const SizedBox(width: 14),
            Text(
              item.label,
              style: TextStyle(
                color: color,
                fontSize: 15,
                fontWeight: item.danger ? FontWeight.w600 : FontWeight.w500,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
