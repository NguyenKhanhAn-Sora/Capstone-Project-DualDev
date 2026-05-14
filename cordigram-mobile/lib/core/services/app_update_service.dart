import 'dart:io';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:open_file/open_file.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:path_provider/path_provider.dart';
import 'dart:convert';
import '../config/app_config.dart';

class AppUpdateService {
  static Future<void> checkForUpdate(BuildContext context) async {
    try {
      final info = await PackageInfo.fromPlatform();
      final currentVersionCode = int.tryParse(info.buildNumber) ?? 1;

      final uri = Uri.parse('${AppConfig.apiBaseUrl}/app-update/check');
      final response = await http.get(uri).timeout(const Duration(seconds: 10));
      if (response.statusCode != 200) return;

      final data = jsonDecode(response.body) as Map<String, dynamic>;
      final serverVersionCode = (data['versionCode'] as num?)?.toInt() ?? 1;
      final serverVersionName = data['versionName'] as String? ?? '';
      final downloadUrl = data['downloadUrl'] as String? ?? '';
      final changelog = data['changelog'] as String? ?? '';
      final forceUpdate = data['forceUpdate'] as bool? ?? false;

      if (serverVersionCode <= currentVersionCode) return;
      if (downloadUrl.isEmpty) return;
      if (!context.mounted) return;

      _showUpdateDialog(
        context,
        versionName: serverVersionName,
        changelog: changelog,
        downloadUrl: downloadUrl,
        forceUpdate: forceUpdate,
      );
    } catch (_) {
      // Lỗi mạng hoặc server — bỏ qua, không crash app
    }
  }

  static void _showUpdateDialog(
    BuildContext context, {
    required String versionName,
    required String changelog,
    required String downloadUrl,
    required bool forceUpdate,
  }) {
    showDialog(
      context: context,
      barrierDismissible: !forceUpdate,
      builder: (ctx) => _UpdateDialog(
        versionName: versionName,
        changelog: changelog,
        downloadUrl: downloadUrl,
        forceUpdate: forceUpdate,
      ),
    );
  }
}

class _UpdateDialog extends StatefulWidget {
  const _UpdateDialog({
    required this.versionName,
    required this.changelog,
    required this.downloadUrl,
    required this.forceUpdate,
  });

  final String versionName;
  final String changelog;
  final String downloadUrl;
  final bool forceUpdate;

  @override
  State<_UpdateDialog> createState() => _UpdateDialogState();
}

class _UpdateDialogState extends State<_UpdateDialog> {
  bool _downloading = false;
  double _progress = 0;
  String? _errorMessage;

  Future<void> _startDownload() async {
    setState(() {
      _downloading = true;
      _errorMessage = null;
      _progress = 0;
    });

    try {
      final dir = await getExternalStorageDirectory() ??
          await getApplicationDocumentsDirectory();
      final filePath = '${dir.path}/cordigram-update.apk';
      final file = File(filePath);

      final request = http.Request('GET', Uri.parse(widget.downloadUrl));
      final response = await http.Client().send(request);
      final total = response.contentLength ?? 0;
      int received = 0;

      final sink = file.openWrite();
      await response.stream.map((chunk) {
        received += chunk.length;
        if (total > 0 && mounted) {
          setState(() => _progress = received / total);
        }
        return chunk;
      }).pipe(sink);

      if (!mounted) return;
      Navigator.of(context).pop();
      await OpenFile.open(filePath);
    } catch (e) {
      if (mounted) {
        setState(() {
          _downloading = false;
          _errorMessage = 'Tải xuống thất bại. Vui lòng thử lại.';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text('Có bản cập nhật mới v${widget.versionName}'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (widget.changelog.isNotEmpty) ...[
            const Text(
              'Nội dung cập nhật:',
              style: TextStyle(fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 6),
            Text(widget.changelog),
            const SizedBox(height: 12),
          ],
          if (_downloading) ...[
            LinearProgressIndicator(value: _progress > 0 ? _progress : null),
            const SizedBox(height: 8),
            Text(
              _progress > 0
                  ? 'Đang tải... ${(_progress * 100).toStringAsFixed(0)}%'
                  : 'Đang chuẩn bị tải xuống...',
              style: const TextStyle(fontSize: 13),
            ),
          ],
          if (_errorMessage != null)
            Text(
              _errorMessage!,
              style: const TextStyle(color: Colors.red, fontSize: 13),
            ),
        ],
      ),
      actions: [
        if (!widget.forceUpdate && !_downloading)
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Để sau'),
          ),
        if (!_downloading)
          ElevatedButton(
            onPressed: _startDownload,
            child: const Text('Cập nhật ngay'),
          ),
      ],
    );
  }
}
