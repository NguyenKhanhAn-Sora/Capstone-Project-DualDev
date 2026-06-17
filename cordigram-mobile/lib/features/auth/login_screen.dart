import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/config/app_config.dart';
import '../../core/theme/app_radii.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/theme/app_typography.dart';
import '../../core/widgets/app_button.dart';
import '../../core/widgets/app_surface_card.dart';
import '../../core/widgets/app_text_field.dart';
import '../../core/services/api_service.dart';
import '../../core/services/auth_storage.dart';
import '../../core/services/deep_link_service.dart';
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
      if (!mounted) return;
      unawaited(Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => const HomeScreen()),
      ));
      unawaited(_upsertRecentAfterLogin(
        email: _emailController.text.trim().toLowerCase(),
        accessToken: accessToken,
      ));
      unawaited((() async {
        await Future<void>.delayed(const Duration(milliseconds: 400));
        await PushNotificationService.syncCurrentToken();
      })());
      unawaited(DmCallManager.instance.onAuthChanged());
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

      DeepLinkService.pendingOAuthCompleter = Completer<Uri>();

      final launched = await launchUrl(uri, mode: LaunchMode.externalApplication);
      if (!launched) {
        DeepLinkService.pendingOAuthCompleter = null;
        setState(() {
          _error = 'Could not open Google sign-in. Please try again.';
          _googleLoading = false;
        });
        return;
      }

      final callbackUri = await DeepLinkService.pendingOAuthCompleter!.future
          .timeout(const Duration(minutes: 5));
      DeepLinkService.pendingOAuthCompleter = null;

      final accessToken = callbackUri.queryParameters['accessToken'];
      final signupToken = callbackUri.queryParameters['signupToken'];
      final refreshToken = callbackUri.queryParameters['refreshToken'];
      final needsProfile = callbackUri.queryParameters['needsProfile'] == '1';

      if (accessToken != null && !needsProfile) {
        await AuthStorage.saveTokens(
          accessToken: accessToken,
          refreshToken: refreshToken,
        );
        if (!mounted) return;
        unawaited(Navigator.of(context).pushReplacement(
          MaterialPageRoute(builder: (_) => const HomeScreen()),
        ));
        final email = _decodeEmailFromToken(accessToken);
        if (email.isNotEmpty) {
          unawaited(_upsertRecentAfterLogin(email: email, accessToken: accessToken));
        }
        unawaited((() async {
          await Future<void>.delayed(const Duration(milliseconds: 400));
          await PushNotificationService.syncCurrentToken();
        })());
        unawaited(DmCallManager.instance.onAuthChanged());
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
    } on TimeoutException {
      DeepLinkService.pendingOAuthCompleter = null;
      setState(() {
        _error = 'Google sign-in timed out. Please try again.';
        _googleLoading = false;
      });
    } catch (e) {
      DeepLinkService.pendingOAuthCompleter = null;
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
      if (!mounted) return;
      unawaited(Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => const HomeScreen()),
      ));
      unawaited(_upsertRecentAfterLogin(
        email: account.email,
        accessToken: accessToken,
      ));
      unawaited((() async {
        await Future<void>.delayed(const Duration(milliseconds: 400));
        await PushNotificationService.syncCurrentToken();
      })());
      unawaited(DmCallManager.instance.onAuthChanged());
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
    final scheme = Theme.of(context).colorScheme;
    final lc = LanguageController.instance;

    return Scaffold(
      body: DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              scheme.primary.withValues(alpha: 0.92),
              scheme.primary,
              scheme.surface,
            ],
            stops: const [0.0, 0.38, 0.82],
          ),
        ),
        child: SafeArea(
          child: Center(
            child: ConstrainedBox(
              constraints: BoxConstraints(
                maxWidth: AppSpacing.contentMaxWidth(context),
              ),
              child: SingleChildScrollView(
                padding: AppSpacing.screenPadding(context).copyWith(
                  top: AppSpacing.lg,
                  bottom: AppSpacing.xl,
                ),
                child: Column(
                  children: [
                    const SizedBox(height: AppSpacing.lg),
                    const _BrandPanel(),
                    const SizedBox(height: AppSpacing.xxl),
                    AppSurfaceCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Text(
                            lc.t('auth.login.title'),
                            textAlign: TextAlign.center,
                            style: AppTypography.headline(context),
                          ),
                          const SizedBox(height: AppSpacing.xxl),
                          Form(
                            key: _formKey,
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                AppTextField(
                                  controller: _emailController,
                                  label: lc.t('auth.login.email'),
                                  hint: lc.t('auth.login.emailHint'),
                                  prefixIcon: Icons.mail_outline_rounded,
                                  keyboardType: TextInputType.emailAddress,
                                  autofillHints: const [AutofillHints.email],
                                  validator: (value) {
                                    final input = (value ?? '').trim();
                                    if (input.isEmpty) {
                                      return lc.t('auth.login.errorEmailRequired');
                                    }
                                    final ok = RegExp(
                                      r'^[^\s@]+@[^\s@]+\.[^\s@]+$',
                                    ).hasMatch(input);
                                    if (!ok) {
                                      return lc.t('auth.login.errorEmailInvalid');
                                    }
                                    return null;
                                  },
                                ),
                                const SizedBox(height: AppSpacing.md),
                                AppTextField(
                                  controller: _passwordController,
                                  label: lc.t('auth.login.password'),
                                  hint: lc.t('auth.login.passwordHint'),
                                  prefixIcon: Icons.lock_outline_rounded,
                                  obscureText: !_showPassword,
                                  autofillHints: const [AutofillHints.password],
                                  suffix: IconButton(
                                    onPressed: () {
                                      setState(() => _showPassword = !_showPassword);
                                    },
                                    icon: Icon(
                                      _showPassword
                                          ? Icons.visibility_off_outlined
                                          : Icons.visibility_outlined,
                                      color: scheme.onSurfaceVariant,
                                    ),
                                  ),
                                  validator: (value) {
                                    if ((value ?? '').isEmpty) {
                                      return lc.t('auth.login.errorPasswordRequired');
                                    }
                                    if ((value ?? '').length < 8) {
                                      return lc.t('auth.login.errorPasswordShort');
                                    }
                                    return null;
                                  },
                                ),
                                Align(
                                  alignment: Alignment.centerRight,
                                  child: TextButton(
                                    onPressed: () {
                                      Navigator.of(context).push(
                                        MaterialPageRoute(
                                          builder: (_) =>
                                              const ForgotPasswordScreen(),
                                        ),
                                      );
                                    },
                                    child: Text(lc.t('auth.login.forgotPassword')),
                                  ),
                                ),
                                if (_error.isNotEmpty) ...[
                                  const SizedBox(height: AppSpacing.sm),
                                  _ErrorBanner(message: _error),
                                ],
                                const SizedBox(height: AppSpacing.md),
                                AppButton(
                                  label: lc.t('auth.login.button'),
                                  onPressed: _submit,
                                  loading: _loading,
                                ),
                                const SizedBox(height: AppSpacing.md),
                                AppButton(
                                  label: lc.t('auth.login.continueWithGoogle'),
                                  onPressed: _handleGoogleLogin,
                                  variant: AppButtonVariant.outline,
                                  loading: _googleLoading,
                                  icon: _googleLoading
                                      ? null
                                      : const _GoogleBadge(),
                                ),
                                const SizedBox(height: AppSpacing.lg),
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    Text(
                                      lc.t('auth.login.noAccount'),
                                      style: AppTypography.bodyMuted(context),
                                    ),
                                    TextButton(
                                      onPressed: () {
                                        Navigator.of(context).push(
                                          MaterialPageRoute(
                                            builder: (_) => const SignupScreen(),
                                          ),
                                        );
                                      },
                                      child: Text(lc.t('auth.login.signUp')),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ),
                          if (_recentLoading)
                            const Padding(
                              padding: EdgeInsets.only(top: AppSpacing.lg),
                              child: LinearProgressIndicator(minHeight: 2),
                            ),
                          if (_recentAccounts.isNotEmpty) ...[
                            const SizedBox(height: AppSpacing.lg),
                            Row(
                              children: [
                                Text(
                                  lc.t('auth.login.recentAccounts'),
                                  style: AppTypography.title(context),
                                ),
                                const Spacer(),
                                TextButton(
                                  onPressed: _clearRecentAccounts,
                                  child: Text(lc.t('auth.login.deleteAll')),
                                ),
                              ],
                            ),
                            const SizedBox(height: AppSpacing.sm),
                            ..._recentAccounts.map(
                              (account) => Padding(
                                padding: const EdgeInsets.only(
                                  bottom: AppSpacing.md,
                                ),
                                child: _RecentAccountTile(
                                  account: account,
                                  onTap: () => _openRecentAccountLogin(account),
                                  onRemove: () =>
                                      _removeRecentAccount(account.email),
                                ),
                              ),
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
}

class _ErrorBanner extends StatelessWidget {
  const _ErrorBanner({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.lg,
        vertical: AppSpacing.md,
      ),
      decoration: BoxDecoration(
        color: scheme.errorContainer.withValues(alpha: 0.35),
        border: Border.all(color: scheme.error.withValues(alpha: 0.35)),
        borderRadius: AppRadii.mdAll,
      ),
      child: Text(
        message,
        style: TextStyle(color: scheme.error, fontSize: 13, height: 1.35),
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
    final scheme = Theme.of(context).colorScheme;
    final label = account.label;
    final initial = label.isNotEmpty ? label.characters.first : '?';

    return Material(
      color: scheme.surfaceContainerHighest.withValues(alpha: 0.35),
      borderRadius: AppRadii.lgAll,
      child: InkWell(
        onTap: onTap,
        borderRadius: AppRadii.lgAll,
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.md,
            vertical: AppSpacing.md,
          ),
          decoration: BoxDecoration(
            borderRadius: AppRadii.lgAll,
            border: Border.all(color: scheme.outline.withValues(alpha: 0.7)),
          ),
          child: Row(
            children: [
              CircleAvatar(
                radius: 22,
                backgroundColor: scheme.primary.withValues(alpha: 0.15),
                backgroundImage:
                    (account.avatarUrl != null && account.avatarUrl!.isNotEmpty)
                    ? NetworkImage(account.avatarUrl!)
                    : null,
                child: (account.avatarUrl == null || account.avatarUrl!.isEmpty)
                    ? Text(
                        initial.toUpperCase(),
                        style: TextStyle(
                          color: scheme.primary,
                          fontSize: 18,
                          fontWeight: FontWeight.w800,
                        ),
                      )
                    : null,
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Text(
                  label,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: AppTypography.title(context).copyWith(fontSize: 14),
                ),
              ),
              IconButton(
                onPressed: onRemove,
                icon: const Icon(Icons.close_rounded),
                color: scheme.onSurfaceVariant,
                tooltip: LanguageController.instance.t('auth.login.removeAccount'),
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
