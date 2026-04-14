import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart';
import 'core/config/app_theme.dart';
import 'core/services/auth_storage.dart';
import 'core/services/push_notification_service.dart';
import 'core/services/theme_controller.dart';
import 'features/auth/login_screen.dart';
import 'features/home/home_screen.dart';

final GlobalKey<NavigatorState> appNavigatorKey = GlobalKey<NavigatorState>();

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await _requestNotificationPermission();
  await AuthStorage.loadAll();
  await PushNotificationService.initialize(navigatorKey: appNavigatorKey);
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
        home: AuthStorage.accessToken != null
            ? const HomeScreen()
            : const LoginScreen(),
      ),
    );
  }
}
