import 'package:flutter/material.dart';
import '../../../core/services/post_upload_controller.dart';
import '../../../core/config/app_theme.dart';

class UploadProgressBanner extends StatelessWidget {
  const UploadProgressBanner({super.key});

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: PostUploadController.instance,
      builder: (context, _) {
        final ctrl = PostUploadController.instance;
        if (ctrl.status == UploadStatus.idle) return const SizedBox.shrink();

        final theme = Theme.of(context);
        final tokens =
            theme.extension<AppSemanticColors>() ??
            (theme.brightness == Brightness.dark
                ? AppSemanticColors.dark
                : AppSemanticColors.light);

        final status = ctrl.status;
        final mode = ctrl.mode;
        final modeLabel = mode == UploadMode.reel ? 'Reel' : 'Post';

        String label;
        if (status == UploadStatus.uploading) {
          final fileHint = ctrl.totalFiles > 1
              ? ' · ${ctrl.uploadedFiles}/${ctrl.totalFiles} files'
              : '';
          label = 'Uploading ${modeLabel.toLowerCase()}…$fileHint';
        } else if (status == UploadStatus.done) {
          label = '$modeLabel published!';
        } else if (status == UploadStatus.cancelled) {
          label = 'Upload cancelled';
        } else {
          label = ctrl.error ?? 'Upload failed';
        }

        Color borderColor;
        Color shadowColor;
        if (status == UploadStatus.done) {
          borderColor = const Color(0xFF22C55E).withValues(alpha: 0.45);
          shadowColor = const Color(0xFF22C55E).withValues(alpha: 0.12);
        } else if (status == UploadStatus.error) {
          borderColor = const Color(0xFFEF4444).withValues(alpha: 0.45);
          shadowColor = const Color(0xFFEF4444).withValues(alpha: 0.12);
        } else {
          borderColor = tokens.panelBorder;
          shadowColor = Colors.transparent;
        }

        return Padding(
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 0),
          child: AnimatedOpacity(
            opacity: status == UploadStatus.cancelled ? 0.55 : 1.0,
            duration: const Duration(milliseconds: 200),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              decoration: BoxDecoration(
                color: tokens.panel,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: borderColor),
                boxShadow: [
                  BoxShadow(
                    color: shadowColor,
                    blurRadius: 6,
                    offset: const Offset(0, 1),
                  ),
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.07),
                    blurRadius: 18,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: Row(
                children: [
                  // Icon
                  SizedBox(
                    width: 26,
                    height: 26,
                    child: Center(
                      child: _buildIcon(status, tokens),
                    ),
                  ),
                  const SizedBox(width: 12),
                  // Label + progress bar
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          label,
                          style: TextStyle(
                            color: tokens.text,
                            fontSize: 13,
                            fontWeight: FontWeight.w500,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        if (status == UploadStatus.uploading) ...[
                          const SizedBox(height: 8),
                          ClipRRect(
                            borderRadius: BorderRadius.circular(99),
                            child: LinearProgressIndicator(
                              value: ctrl.progress / 100,
                              minHeight: 3,
                              backgroundColor: tokens.panelBorder,
                              valueColor: AlwaysStoppedAnimation<Color>(
                                tokens.primary,
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                  // Cancel button
                  if (status == UploadStatus.uploading) ...[
                    const SizedBox(width: 8),
                    GestureDetector(
                      onTap: PostUploadController.instance.cancelUpload,
                      child: Container(
                        width: 26,
                        height: 26,
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(8),
                          color: Colors.transparent,
                        ),
                        child: Icon(
                          Icons.close,
                          size: 16,
                          color: tokens.textMuted,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _buildIcon(UploadStatus status, AppSemanticColors tokens) {
    if (status == UploadStatus.uploading) {
      return SizedBox(
        width: 18,
        height: 18,
        child: CircularProgressIndicator(
          strokeWidth: 2.5,
          color: tokens.primary,
        ),
      );
    }
    if (status == UploadStatus.done) {
      return Container(
        width: 20,
        height: 20,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: const Color(0xFF22C55E).withValues(alpha: 0.15),
        ),
        child: const Icon(
          Icons.check,
          size: 13,
          color: Color(0xFF22C55E),
        ),
      );
    }
    return Container(
      width: 20,
      height: 20,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: const Color(0xFFEF4444).withValues(alpha: 0.12),
      ),
      child: const Icon(
        Icons.close,
        size: 13,
        color: Color(0xFFEF4444),
      ),
    );
  }
}
