import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:flutter_web_auth_2/flutter_web_auth_2.dart';
import '../../core/config/app_config.dart';
import '../../core/services/api_service.dart';
import '../../core/services/auth_storage.dart';
import '../../core/services/language_controller.dart';
import '../../core/services/push_notification_service.dart';
import '../home/home_screen.dart';
import '../messages/call/dm_call_manager.dart';
import 'forgot_password_screen.dart';
import 'signup_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _showPassword = false;
  bool _rememberMe = true;
  bool _loading = false;
  String _error = '';
  bool _googleLoading = false;
  List<RecentAccountEntry> _recentAccounts = const [];
  bool _recentLoading = true;

  @override
  void initState() {
    super.initState();
    _loadRecentAccounts();
  }

  Future<void> _loadRecentAccounts() async {
    final items = await AuthStorage.loadRecentAccounts();
    if (!mounted) return;
    setState(() {
      _recentAccounts = items;
      _recentLoading = false;
    });
  }

  Future<void> _clearRecentAccounts() async {
    final previous = [..._recentAccounts];
    await AuthStorage.clearRecentAccounts();
    if (mounted) setState(() => _recentAccounts = const []);

    final token = await _getActiveTokenForRecentSync();
    if (token == null) return;

    try {
      final payload = await ApiService.delete(
        '/auth/recent-accounts',
        extraHeaders: {'Authorization': 'Bearer $token'},
      );
      await _applyServerRecentAccounts(payload);
    } catch (_) {
      final restored = await AuthStorage.replaceRecentAccounts(previous);
      if (!mounted) return;
      setState(() => _recentAccounts = restored);
    }
  }

  Future<void> _removeRecentAccount(String email) async {
    final previous = [..._recentAccounts];
    final next = await AuthStorage.removeRecentAccount(email);
    if (mounted) setState(() => _recentAccounts = next);

    final token = await _getActiveTokenForRecentSync();
    if (token == null) return;

    try {
      final encodedEmail = Uri.encodeComponent(email.trim().toLowerCase());
      final payload = await ApiService.delete(
        '/auth/recent-accounts/$encodedEmail',
        extraHeaders: {'Authorization': 'Bearer $token'},
      );
      await _applyServerRecentAccounts(payload);
    } catch (_) {
      final restored = await AuthStorage.replaceRecentAccounts(previous);
      if (!mounted) return;
      setState(() => _recentAccounts = restored);
    }
  }

  Future<String?> _getActiveTokenForRecentSync() async {
    final existing = AuthStorage.accessToken;
    if (existing != null && existing.isNotEmpty) return existing;

    final refreshToken = AuthStorage.refreshToken;
    if (refreshToken == null || refreshToken.isEmpty) return null;

    try {
      final refreshed = await ApiService.postAuth(
        '/auth/refresh',
        extraHeaders: {'Cookie': 'refresh_token=$refreshToken'},
      );
      final token = refreshed.body['accessToken'] as String?;
      if (token == null || token.isEmpty) return null;

      await AuthStorage.saveTokens(
        accessToken: token,
        refreshToken: refreshed.refreshToken ?? refreshToken,
      );
      return token;
    } catch (_) {
      return null;
    }
  }

  Future<void> _applyServerRecentAccounts(Map<String, dynamic> payload) async {
    final raw = payload['recentAccounts'];
    if (raw is! List) return;

    final mapped = raw
        .whereType<Map>()
        .map((item) {
          final map = item.cast<String, dynamic>();
          final lastUsedRaw = map['lastUsed'];
          final parsed = DateTime.tryParse(lastUsedRaw?.toString() ?? '');
          return RecentAccountEntry(
            email: (map['email'] as String? ?? '').trim().toLowerCase(),
            username: (map['username'] as String?)?.trim(),
            displayName: (map['displayName'] as String?)?.trim(),
            avatarUrl: (map['avatarUrl'] as String?)?.trim(),
            lastUsed:
                parsed?.millisecondsSinceEpoch ??
                DateTime.now().millisecondsSinceEpoch,
          );
        })
        .where((item) => item.email.isNotEmpty)
        .toList(growable: false);

    final synced = await AuthStorage.replaceRecentAccounts(mapped);
    if (!mounted) return;
    setState(() => _recentAccounts = synced);
  }

  Future<void> _upsertRecentAfterLogin({
    required String email,
    required String accessToken,
  }) async {
    String? username;
    String? displayName;
    String? avatarUrl;

    try {
      final me = await ApiService.get(
        '/profiles/me',
        extraHeaders: {'Authorization': 'Bearer $accessToken'},
      );
      username = (me['username'] as String?)?.trim();
      displayName = (me['displayName'] as String?)?.trim();
      avatarUrl = (me['avatarUrl'] as String?)?.trim();
    } catch (_) {
      // Keep local cache update even if profile lookup fails.
    }

    final next = await AuthStorage.upsertRecentAccount(
      email: email,
      username: username,
      displayName: displayName,
      avatarUrl: avatarUrl,
    );

    try {
      await ApiService.post(
        '/auth/recent-accounts',
        body: {
          'email': email,
          if (username != null && username.isNotEmpty) 'username': username,
          if (displayName != null && displayName.isNotEmpty)
            'displayName': displayName,
          if (avatarUrl != null && avatarUrl.isNotEmpty) 'avatarUrl': avatarUrl,
        },
        extraHeaders: {'Authorization': 'Bearer $accessToken'},
      );
    } catch (_) {
      // Local data remains source of truth on login screen.
    }

    if (!mounted) return;
    setState(() => _recentAccounts = next);
  }

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    FocusScope.of(context).unfocus();
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() {
      _loading = true;
      _error = '';
    });
    try {
      final deviceId = AuthStorage.deviceId;
      final result = await ApiService.postAuth(
        '/auth/login',
        body: {
          'email': _emailController.text.trim().toLowerCase(),
          'password': _passwordController.text,
          'loginMethod': 'password',
        },
        extraHeaders: {
          if (deviceId != null) 'x-device-id': deviceId,
          'x-login-method': 'password',
        },
      );
      final accessToken = result.body['accessToken'] as String?;
      if (accessToken == null) {
        // Two-factor flow — not yet implemented on mobile
        setState(() {
          _loading = false;
          _error = 'Two-factor authentication is not yet supported on mobile.';
        });
        return;
      }
      await AuthStorage.saveTokens(
        accessToken: accessToken,
        refreshToken: result.refreshToken,
      );
      if (_rememberMe) {
        await _upsertRecentAfterLogin(
          email: _emailController.text.trim().toLowerCase(),
          accessToken: accessToken,
        );
      }
      await PushNotificationService.syncCurrentToken();
      await DmCallManager.instance.onAuthChanged();
      if (!mounted) return;
      Navigator.of(
        context,
      ).pushReplacement(MaterialPageRoute(builder: (_) => const HomeScreen()));
    } on ApiException catch (e) {
      setState(() {
        _error = e.message;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _error = 'Could not connect to server. Please try again.';
        _loading = false;
      });
    }
  }

  Future<void> _handleGoogleLogin() async {
    setState(() {
      _googleLoading = true;
      _error = '';
    });
    try {
      final deviceId = AuthStorage.deviceId;
      final uri = Uri.parse('${AppConfig.apiBaseUrl}/auth/google/mobile')
          .replace(
            queryParameters: deviceId != null ? {'deviceId': deviceId} : {},
          );

      final result = await FlutterWebAuth2.authenticate(
        url: uri.toString(),
        callbackUrlScheme: 'cordigram',
      );

      final callbackUri = Uri.parse(result);
      final accessToken = callbackUri.queryParameters['accessToken'];
      final signupToken = callbackUri.queryParameters['signupToken'];
      final refreshToken = callbackUri.queryParameters['refreshToken'];
      final needsProfile = callbackUri.queryParameters['needsProfile'] == '1';

      if (accessToken != null && !needsProfile) {
        await AuthStorage.saveTokens(
          accessToken: accessToken,
          refreshToken: refreshToken,
        );
        final email = _decodeEmailFromToken(accessToken);
        if (email.isNotEmpty) {
          await _upsertRecentAfterLogin(email: email, accessToken: accessToken);
        }
        await PushNotificationService.syncCurrentToken();
        await DmCallManager.instance.onAuthChanged();
        if (!mounted) return;
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(builder: (_) => const HomeScreen()),
        );
      } else if (signupToken != null && needsProfile) {
        final email = _decodeEmailFromToken(signupToken);
        if (!mounted) return;
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(
            builder: (_) =>
                SignupScreen.google(signupToken: signupToken, email: email),
          ),
        );
      } else {
        setState(() => _googleLoading = false);
      }
    } on PlatformException catch (e) {
      if (e.code != 'CANCELED') {
        setState(() {
          _error = 'Google sign-in failed. Please try again.';
        });
      }
      setState(() => _googleLoading = false);
    } catch (e) {
      setState(() {
        _error = 'Google sign-in failed. Please try again.';
        _googleLoading = false;
      });
    }
  }

  String _decodeEmailFromToken(String token) {
    try {
      final parts = token.split('.');
      if (parts.length < 2) return '';
      final payload = parts[1];
      final padded = payload + '=' * ((4 - payload.length % 4) % 4);
      final bytes = base64Url.decode(padded);
      final map = jsonDecode(utf8.decode(bytes)) as Map<String, dynamic>;
      return (map['email'] as String? ?? '').toLowerCase();
    } catch (_) {
      return '';
    }
  }

  Future<void> _openRecentAccountLogin(RecentAccountEntry account) async {
    final password = await showDialog<String>(
      context: context,
      builder: (_) => _RecentPasswordDialog(account: account),
    );
    if (!mounted || password == null) return;

    setState(() {
      _loading = true;
      _error = '';
    });

    try {
      final deviceId = AuthStorage.deviceId;
      final result = await ApiService.postAuth(
        '/auth/login',
        body: {
          'email': account.email,
          'password': password,
          'loginMethod': 'recent',
        },
        extraHeaders: {
          if (deviceId != null) 'x-device-id': deviceId,
          'x-login-method': 'recent',
        },
      );

      final accessToken = result.body['accessToken'] as String?;
      if (accessToken == null) {
        setState(() {
          _loading = false;
          _error = 'Two-factor authentication is not yet supported on mobile.';
        });
        return;
      }

      await AuthStorage.saveTokens(
        accessToken: accessToken,
        refreshToken: result.refreshToken,
      );
      await _upsertRecentAfterLogin(
        email: account.email,
        accessToken: accessToken,
      );
      await PushNotificationService.syncCurrentToken();
      await DmCallManager.instance.onAuthChanged();

      if (!mounted) return;
      Navigator.of(
        context,
      ).pushReplacement(MaterialPageRoute(builder: (_) => const HomeScreen()));
    } on ApiException catch (e) {
      setState(() {
        _error = e.message;
        _loading = false;
      });
    } catch (_) {
      setState(() {
        _error = 'Could not connect to server. Please try again.';
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final secondaryTextColor = theme.colorScheme.onSurfaceVariant;
    final actionLinkColor = theme.colorScheme.primary;

    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xFF1F4F7A), Color(0xFF3470A2), Color(0xFFF4F7FB)],
            stops: [0.0, 0.35, 0.75],
          ),
        ),
        child: SafeArea(
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 430),
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const SizedBox(height: 18),
                    const _BrandPanel(),
                    const SizedBox(height: 18),
                    Container(
                      padding: const EdgeInsets.fromLTRB(16, 18, 16, 16),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(20),
                        boxShadow: const [
                          BoxShadow(
                            color: Color(0x2A0F2F4A),
                            blurRadius: 26,
                            offset: Offset(0, 10),
                          ),
                        ],
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Form(
                            key: _formKey,
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Center(
                                  child: Text(
                                    'Login',
                                    style: theme.textTheme.headlineSmall
                                        ?.copyWith(
                                          color: const Color(0xFF0F172A),
                                          fontWeight: FontWeight.w800,
                                        ),
                                  ),
                                ),
                                const SizedBox(height: 18),
                                TextFormField(
                                  controller: _emailController,
                                  keyboardType: TextInputType.emailAddress,
                                  autofillHints: const [AutofillHints.email],
                                  decoration: _fieldDecoration(
                                    label: LanguageController.instance.t('auth.login.email'),
                                    hint: 'you@example.com',
                                    icon: Icons.mail_outline_rounded,
                                  ),
                                  validator: (value) {
                                    final input = (value ?? '').trim();
                                    if (input.isEmpty)
                                      return 'Please enter email';
                                    final ok = RegExp(
                                      r'^[^\s@]+@[^\s@]+\.[^\s@]+$',
                                    ).hasMatch(input);
                                    if (!ok) return 'Email format is invalid';
                                    return null;
                                  },
                                ),
                                const SizedBox(height: 12),
                                TextFormField(
                                  controller: _passwordController,
                                  obscureText: !_showPassword,
                                  autofillHints: const [AutofillHints.password],
                                  decoration: _fieldDecoration(
                                    label: LanguageController.instance.t('auth.login.password'),
                                    hint: 'Enter your password',
                                    icon: Icons.lock_outline_rounded,
                                    suffix: IconButton(
                                      onPressed: () {
                                        setState(() {
                                          _showPassword = !_showPassword;
                                        });
                                      },
                                      icon: Icon(
                                        _showPassword
                                            ? Icons.visibility_off_outlined
                                            : Icons.visibility_outlined,
                                      ),
                                    ),
                                  ),
                                  validator: (value) {
                                    if ((value ?? '').isEmpty) {
                                      return 'Please enter password';
                                    }
                                    if ((value ?? '').length < 8) {
                                      return 'Password must be at least 8 characters';
                                    }
                                    return null;
                                  },
                                ),
                                const SizedBox(height: 8),
                                Row(
                                  children: [
                                    Checkbox(
                                      value: _rememberMe,
                                      onChanged: (value) {
                                        setState(() {
                                          _rememberMe = value ?? false;
                                        });
                                      },
                                      visualDensity: VisualDensity.compact,
                                    ),
                                    Text(
                                      'Remember me',
                                      style: theme.textTheme.bodyMedium
                                          ?.copyWith(
                                            color: secondaryTextColor,
                                            fontWeight: FontWeight.w600,
                                          ),
                                    ),
                                    const Spacer(),
                                    TextButton(
                                      onPressed: () {
                                        Navigator.of(context).push(
                                          MaterialPageRoute(
                                            builder: (_) =>
                                                const ForgotPasswordScreen(),
                                          ),
                                        );
                                      },
                                      child: Text(LanguageController.instance.t('auth.login.forgotPassword')),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 6),
                                if (_error.isNotEmpty)
                                  Padding(
                                    padding: const EdgeInsets.only(bottom: 8),
                                    child: Container(
                                      width: double.infinity,
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 14,
                                        vertical: 10,
                                      ),
                                      decoration: BoxDecoration(
                                        color: Colors.red.shade50,
                                        border: Border.all(
                                          color: Colors.red.shade200,
                                        ),
                                        borderRadius: BorderRadius.circular(10),
                                      ),
                                      child: Text(
                                        _error,
                                        style: TextStyle(
                                          color: Colors.red.shade700,
                                          fontSize: 13,
                                        ),
                                      ),
                                    ),
                                  ),
                                SizedBox(
                                  width: double.infinity,
                                  height: 50,
                                  child: FilledButton(
                                    onPressed: _loading ? null : _submit,
                                    style: FilledButton.styleFrom(
                                      backgroundColor: const Color(0xFF3470A2),
                                      foregroundColor: Colors.white,
                                      shape: RoundedRectangleBorder(
                                        borderRadius: BorderRadius.circular(14),
                                      ),
                                    ),
                                    child: _loading
                                        ? const SizedBox(
                                            width: 22,
                                            height: 22,
                                            child: CircularProgressIndicator(
                                              strokeWidth: 2.5,
                                              valueColor:
                                                  AlwaysStoppedAnimation(
                                                    Colors.white,
                                                  ),
                                            ),
                                          )
                                        : const Text(
                                            'Sign in',
                                            style: TextStyle(
                                              fontSize: 16,
                                              fontWeight: FontWeight.w700,
                                            ),
                                          ),
                                  ),
                                ),
                                const SizedBox(height: 12),
                                SizedBox(
                                  width: double.infinity,
                                  height: 48,
                                  child: OutlinedButton.icon(
                                    onPressed: _googleLoading
                                        ? null
                                        : _handleGoogleLogin,
                                    icon: _googleLoading
                                        ? const SizedBox(
                                            width: 18,
                                            height: 18,
                                            child: CircularProgressIndicator(
                                              strokeWidth: 2,
                                              valueColor:
                                                  AlwaysStoppedAnimation(
                                                    Color(0xFF1F2937),
                                                  ),
                                            ),
                                          )
                                        : const _GoogleBadge(),
                                    label: Text(LanguageController.instance.t('auth.login.continueWithGoogle')),
                                    style: OutlinedButton.styleFrom(
                                      side: const BorderSide(
                                        color: Color(0xFFD7E5F2),
                                      ),
                                      foregroundColor: const Color(0xFF1F2937),
                                      shape: RoundedRectangleBorder(
                                        borderRadius: BorderRadius.circular(14),
                                      ),
                                    ),
                                  ),
                                ),
                                const SizedBox(height: 14),
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    Text(
                                      "Don't have an account? ",
                                      style: theme.textTheme.bodyMedium
                                          ?.copyWith(
                                            color: secondaryTextColor,
                                            fontWeight: FontWeight.w500,
                                          ),
                                    ),
                                    TextButton(
                                      onPressed: () {
                                        Navigator.of(context).push(
                                          MaterialPageRoute(
                                            builder: (_) =>
                                                const SignupScreen(),
                                          ),
                                        );
                                      },
                                      style: TextButton.styleFrom(
                                        padding: EdgeInsets.zero,
                                        minimumSize: Size.zero,
                                        tapTargetSize:
                                            MaterialTapTargetSize.shrinkWrap,
                                      ),
                                      child: Text(
                                        'Sign up',
                                        style: theme.textTheme.bodyMedium
                                            ?.copyWith(
                                              color: actionLinkColor,
                                              fontWeight: FontWeight.w700,
                                            ),
                                      ),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ),
                          if (_recentLoading)
                            const Padding(
                              padding: EdgeInsets.only(top: 14),
                              child: LinearProgressIndicator(minHeight: 2),
                            ),
                          if (_recentAccounts.isNotEmpty) ...[
                            const SizedBox(height: 14),
                            Row(
                              children: [
                                Text(
                                  'Recent accounts',
                                  style: theme.textTheme.titleMedium?.copyWith(
                                    fontWeight: FontWeight.w800,
                                    color: const Color(0xFF0F172A),
                                  ),
                                ),
                                const Spacer(),
                                TextButton(
                                  onPressed: _clearRecentAccounts,
                                  style: TextButton.styleFrom(
                                    minimumSize: Size.zero,
                                    tapTargetSize:
                                        MaterialTapTargetSize.shrinkWrap,
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 8,
                                      vertical: 6,
                                    ),
                                  ),
                                  child: Text(LanguageController.instance.t('auth.login.deleteAll')),
                                ),
                              ],
                            ),
                            const SizedBox(height: 8),
                            Column(
                              children: _recentAccounts
                                  .map(
                                    (account) => Padding(
                                      padding: const EdgeInsets.only(
                                        bottom: 10,
                                      ),
                                      child: _RecentAccountTile(
                                        account: account,
                                        onTap: () =>
                                            _openRecentAccountLogin(account),
                                        onRemove: () =>
                                            _removeRecentAccount(account.email),
                                      ),
                                    ),
                                  )
                                  .toList(growable: false),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  InputDecoration _fieldDecoration({
    required String label,
    required String hint,
    required IconData icon,
    Widget? suffix,
  }) {
    return InputDecoration(
      labelText: label,
      hintText: hint,
      prefixIcon: Icon(icon),
      suffixIcon: suffix,
      filled: true,
      fillColor: const Color(0xFFF8FBFF),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: Color(0xFFD7E5F2)),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: Color(0xFFD7E5F2)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: Color(0xFF3470A2), width: 1.4),
      ),
    );
  }
}

class _RecentAccountTile extends StatelessWidget {
  const _RecentAccountTile({
    required this.account,
    required this.onTap,
    required this.onRemove,
  });

  final RecentAccountEntry account;
  final VoidCallback onTap;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final label = account.label;
    final initial = label.isNotEmpty ? label.characters.first : '?';

    return Material(
      color: const Color(0xFFF6FAFF),
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: const Color(0xFFD7E5F2)),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              CircleAvatar(
                radius: 21,
                backgroundColor: const Color(0xFF3470A2).withValues(alpha: 0.2),
                backgroundImage:
                    (account.avatarUrl != null && account.avatarUrl!.isNotEmpty)
                    ? NetworkImage(account.avatarUrl!)
                    : null,
                child: (account.avatarUrl == null || account.avatarUrl!.isEmpty)
                    ? Text(
                        initial.toUpperCase(),
                        style: const TextStyle(
                          color: Color(0xFF1D4E89),
                          fontSize: 18,
                          fontWeight: FontWeight.w800,
                        ),
                      )
                    : null,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  label,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: Color(0xFF0F172A),
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    height: 1.25,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              IconButton(
                onPressed: onRemove,
                icon: const Icon(Icons.close_rounded),
                color: const Color(0xFF64748B),
                visualDensity: VisualDensity.compact,
                tooltip: 'Remove account',
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _RecentPasswordDialog extends StatefulWidget {
  const _RecentPasswordDialog({required this.account});

  final RecentAccountEntry account;

  @override
  State<_RecentPasswordDialog> createState() => _RecentPasswordDialogState();
}

class _RecentPasswordDialogState extends State<_RecentPasswordDialog> {
  final TextEditingController _passwordController = TextEditingController();
  bool _showPassword = false;
  String _error = '';

  @override
  void dispose() {
    _passwordController.dispose();
    super.dispose();
  }

  void _submit() {
    final password = _passwordController.text;
    if (password.isEmpty) {
      setState(() => _error = 'Please enter password');
      return;
    }
    Navigator.of(context).pop(password);
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      titlePadding: const EdgeInsets.fromLTRB(20, 18, 10, 0),
      title: Row(
        children: [
          Expanded(
            child: Text(
              widget.account.label,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
            ),
          ),
          IconButton(
            onPressed: () => Navigator.of(context).pop(),
            icon: const Icon(Icons.close_rounded),
          ),
        ],
      ),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Align(
            alignment: Alignment.centerLeft,
            child: Text(
              widget.account.email,
              style: const TextStyle(fontSize: 12, color: Color(0xFF64748B)),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _passwordController,
            obscureText: !_showPassword,
            autofocus: true,
            onSubmitted: (_) => _submit(),
            decoration: InputDecoration(
              labelText: LanguageController.instance.t('auth.login.password'),
              suffixIcon: IconButton(
                onPressed: () {
                  setState(() => _showPassword = !_showPassword);
                },
                icon: Icon(
                  _showPassword
                      ? Icons.visibility_off_outlined
                      : Icons.visibility_outlined,
                ),
              ),
            ),
          ),
          if (_error.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  _error,
                  style: const TextStyle(
                    color: Color(0xFFB91C1C),
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: Text(LanguageController.instance.t('common.cancel')),
        ),
        FilledButton(onPressed: _submit, child: Text(LanguageController.instance.t('auth.login.button'))),
      ],
    );
  }
}

class _BrandPanel extends StatelessWidget {
  const _BrandPanel();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        children: [
          Image.asset(
            'assets/images/cordigram-logo.png',
            width: 100,
            height: 100,
          ),
          const SizedBox(height: 10),
          const Text(
            'CORDIGRAM',
            style: TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w700,
              letterSpacing: 2,
              fontSize: 14,
            ),
          ),
        ],
      ),
    );
  }
}

class _GoogleBadge extends StatelessWidget {
  const _GoogleBadge();

  @override
  Widget build(BuildContext context) {
    return SvgPicture.string(
      '''<svg xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" width="30" height="30" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"></path><path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"></path><path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"></path><path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"></path></svg>''',
      width: 22,
      height: 22,
    );
  }
}
