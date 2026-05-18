import 'dart:async';
import 'package:app_links/app_links.dart';
import 'package:flutter/material.dart';
import '../../features/post/post_detail_screen.dart';
import '../../features/profile/profile_screen.dart';

class DeepLinkService {
  DeepLinkService._();

  static StreamSubscription<Uri>? _sub;

  static Future<void> initialize(GlobalKey<NavigatorState> navigatorKey) async {
    final appLinks = AppLinks();

    // Link received while app is already open
    _sub = appLinks.uriLinkStream.listen(
      (uri) => _handle(uri, navigatorKey),
      onError: (_) {},
    );

    // Link that launched the app from terminated state
    final initial = await appLinks.getInitialLink();
    if (initial != null) {
      // Delay so the widget tree is fully built before pushing
      WidgetsBinding.instance.addPostFrameCallback(
        (_) => _handle(initial, navigatorKey),
      );
    }
  }

  static void dispose() {
    _sub?.cancel();
    _sub = null;
  }

  static void _handle(Uri uri, GlobalKey<NavigatorState> navigatorKey) {
    final nav = navigatorKey.currentState;
    if (nav == null) return;

    final segments = uri.pathSegments;
    if (segments.isEmpty) return;

    // /profile/{id}
    if (segments[0] == 'profile' && segments.length >= 2) {
      final id = segments[1];
      nav.push(MaterialPageRoute(
        builder: (_) => ProfileScreen(userId: id),
      ));
      return;
    }

    // /post/{id}
    if (segments[0] == 'post' && segments.length >= 2) {
      final id = segments[1];
      nav.push(MaterialPageRoute(
        builder: (_) => PostDetailScreen(postId: id),
      ));
      return;
    }
  }
}
