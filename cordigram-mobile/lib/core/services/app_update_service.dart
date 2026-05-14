import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:package_info_plus/package_info_plus.dart';
import 'package:url_launcher/url_launcher.dart';
import 'dart:convert';
import '../config/app_config.dart';

class AppUpdateService {
  static Future<void> checkForUpdate(BuildContext context) async {
    try {
      final info = await PackageInfo.fromPlatform();
      final currentVersionCode = int.tryParse(info.buildNumber) ?? 1;

      final uri = Uri.parse('${AppConfig.apiBaseUrl}/app-update/check');
      final response =
          await http.get(uri).timeout(const Duration(seconds: 10));
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

      showDialog(
        context: context,
        barrierDismissible: !forceUpdate,
        builder: (_) => _UpdateDialog(
          versionName: serverVersionName,
          changelog: changelog,
          downloadUrl: downloadUrl,
          forceUpdate: forceUpdate,
        ),
      );
    } catch (_) {
      // Lỗi mạng hoặc server — bỏ qua, không crash app
    }
  }
}

class _UpdateDialog extends StatelessWidget {
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

  Future<void> _openDownload(BuildContext context) async {
    final uri = Uri.parse(downloadUrl);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
    if (context.mounted && !forceUpdate) {
      Navigator.of(context).pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text('Có bản cập nhật mới v$versionName'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (changelog.isNotEmpty) ...[
            const Text(
              'Nội dung cập nhật:',
              style: TextStyle(fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 6),
            Text(changelog),
            const SizedBox(height: 12),
          ],
          const Text(
            'Nhấn "Cập nhật ngay" để tải file APK về.\nSau khi tải xong, mở file đó và nhấn Cài đặt.',
            style: TextStyle(fontSize: 13, color: Colors.grey),
          ),
        ],
      ),
      actions: [
        if (!forceUpdate)
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Để sau'),
          ),
        ElevatedButton(
          onPressed: () => _openDownload(context),
          child: const Text('Cập nhật ngay'),
        ),
      ],
    );
  }
}
