import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

class CallWebViewScreen extends StatefulWidget {
  const CallWebViewScreen({
    super.key,
    required this.callUri,
    required this.title,
    this.accessToken,
  });

  final Uri callUri;
  final String title;
  final String? accessToken;

  @override
  State<CallWebViewScreen> createState() => _CallWebViewScreenState();
}

class _CallWebViewScreenState extends State<CallWebViewScreen> {
  late final WebViewController _controller;
  bool _loading = true;
  bool _bootstrapped = false;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageFinished: (url) async {
            if (!_bootstrapped &&
                widget.accessToken != null &&
                widget.accessToken!.isNotEmpty) {
              _bootstrapped = true;
              final escapedToken = widget.accessToken!
                  .replaceAll(r'\', r'\\')
                  .replaceAll("'", r"\'");
              final escapedCallUrl = widget.callUri
                  .toString()
                  .replaceAll(r'\', r'\\')
                  .replaceAll("'", r"\'");
              await _controller.runJavaScript("""
                try {
                  localStorage.setItem('accessToken', '$escapedToken');
                  localStorage.setItem('token', '$escapedToken');
                } catch (e) {}
                window.location.replace('$escapedCallUrl');
              """);
              return;
            }
            if (!mounted) return;
            setState(() => _loading = false);
          },
        ),
      )
      ..loadRequest(_originUri(widget.callUri));
  }

  Uri _originUri(Uri uri) {
    final portPart = uri.hasPort ? ':${uri.port}' : '';
    return Uri.parse('${uri.scheme}://${uri.host}$portPart/');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF08183A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF08183A),
        title: Text(widget.title),
        actions: [
          IconButton(
            onPressed: () => Navigator.of(context).pop(),
            icon: const Icon(Icons.call_end_rounded, color: Color(0xFFED4245)),
          ),
        ],
      ),
      body: Stack(
        children: [
          WebViewWidget(controller: _controller),
          if (_loading)
            const Center(
              child: CircularProgressIndicator(),
            ),
        ],
      ),
    );
  }
}

