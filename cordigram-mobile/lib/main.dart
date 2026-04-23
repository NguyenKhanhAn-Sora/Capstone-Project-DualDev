import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:permission_handler/permission_handler.dart';
import 'core/config/app_config.dart';
import 'core/config/app_theme.dart';
import 'core/services/auth_storage.dart';
import 'core/services/push_notification_service.dart';
import 'core/services/theme_controller.dart';
import 'features/auth/login_screen.dart';
import 'features/home/home_screen.dart';
import 'features/messages/call/dm_call_manager.dart';
import 'features/messages/call/global_call_overlay.dart';

final GlobalKey<NavigatorState> appNavigatorKey = GlobalKey<NavigatorState>();

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  try {
    // Same keys as cordigram-web; edit `assets/env/.env` or use --dart-define=*.
    await dotenv.load(fileName: 'assets/env/.env', isOptional: true);
  } catch (_) {
    // Giphy can still use --dart-define=*.
  }
  if (dotenv.isInitialized) {
    final giphy =
        (dotenv.env['NEXT_PUBLIC_GIPHY_API_KEY'] ??
                dotenv.env['GIPHY_API_KEY'] ??
                '')
            .trim();
    AppConfig.setGiphyApiKeyFromRuntime(giphy);

    final configuredWebBase =
        (dotenv.env['WEB_BASE_URL'] ??
                dotenv.env['NEXT_PUBLIC_WEB_BASE_URL'] ??
                dotenv.env['SOCIAL_URL'] ??
                '')
            .trim();
    if (configuredWebBase.isNotEmpty &&
        !configuredWebBase.contains('localhost')) {
      AppConfig.setWebBaseUrlFromRuntime(configuredWebBase);
    }
  }
  await _requestNotificationPermission();
  await AuthStorage.loadAll();
  await PushNotificationService.initialize(navigatorKey: appNavigatorKey);
  // Attach the global call manager so incoming DM calls ring anywhere in
  // the app — not only while the user is inside the matching chat screen.
  await DmCallManager.instance.attach(appNavigatorKey);
  runApp(const MyApp());
}

Future<void> _requestNotificationPermission() async {
  final status = await Permission.notification.status;
  if (status.isGranted || status.isPermanentlyDenied) return;
  await Permission.notification.request();
}

class MyApp extends StatefulWidget {
  const MyApp({super.key});

  @override
  State<MyApp> createState() => _MyAppState();
}

class _MyAppState extends State<MyApp> {
  @override
  void initState() {
    super.initState();
    ThemeController.instance.load();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: ThemeController.instance,
      builder: (context, _) => MaterialApp(
        navigatorKey: appNavigatorKey,
        title: 'Cordigram Mobile',
        debugShowCheckedModeBanner: false,
        theme: AppTheme.light,
        darkTheme: AppTheme.dark,
        themeMode: ThemeController.instance.themeMode,
        // Wrap every route with the global call overlay so ring-ins show up
        // on top of home, feed, profile, settings — everywhere.
        builder: (ctx, child) =>
            GlobalCallOverlay(child: child ?? const SizedBox.shrink()),
        home: AuthStorage.accessToken != null
            ? const HomeScreen()
            : const LoginScreen(),
      ),
    );
  }
}
