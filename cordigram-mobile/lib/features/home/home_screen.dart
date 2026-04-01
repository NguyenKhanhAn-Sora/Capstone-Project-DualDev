import 'package:flutter/material.dart';
import '../../core/services/api_service.dart';
import '../../core/services/auth_storage.dart';
import '../auth/login_screen.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  Future<void> _logout(BuildContext context) async {
    try {
      final refreshToken = AuthStorage.refreshToken;
      await ApiService.post(
        '/auth/logout',
        extraHeaders: refreshToken != null
            ? {'Cookie': 'refresh_token=$refreshToken'}
            : null,
      );
    } catch (_) {
      // Ignore server errors — local clear always proceeds
    }
    await AuthStorage.clear();
    if (!context.mounted) return;
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const LoginScreen()),
      (_) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Cordigram'),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            tooltip: 'Logout',
            onPressed: () => _logout(context),
          ),
        ],
      ),
      body: const Center(child: Text('Home Feed')),
    );
  }
}
