import 'package:flutter/material.dart';

import '../../core/config/app_theme.dart';
import '../../core/services/api_service.dart';
import 'ads_create_screen.dart';
import 'ads_dashboard_screen.dart';
import 'ads_service.dart';

AppSemanticColors _appTokens(BuildContext context) {
  final theme = Theme.of(context);
  return theme.extension<AppSemanticColors>() ??
      (theme.brightness == Brightness.dark
          ? AppSemanticColors.dark
          : AppSemanticColors.light);
}

class AdsEntryScreen extends StatefulWidget {
  const AdsEntryScreen({super.key});

  @override
  State<AdsEntryScreen> createState() => _AdsEntryScreenState();
}

class _AdsEntryScreenState extends State<AdsEntryScreen> {
  bool _loading = true;
  bool _hasCreatedAds = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadStatus();
  }

  Future<void> _loadStatus() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final status = await AdsService.getMyAdsCreationStatus();
      if (!mounted) return;
      setState(() {
        _hasCreatedAds = status.hasCreatedAds;
        _loading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'Unable to load ads data.';
        _loading = false;
      });
    }
  }

  void _openCreate() {
    Navigator.of(
      context,
    ).push(MaterialPageRoute(builder: (_) => const AdsCreateScreen()));
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final tokens = _appTokens(context);
    final card = tokens.panelMuted;
    final textPrimary = tokens.text;
    final textSecondary = tokens.textMuted;
    final accent = tokens.primary;

    if (!_loading && _hasCreatedAds) {
      return const AdsDashboardScreen();
    }

    return Scaffold(
      backgroundColor: theme.scaffoldBackgroundColor,
      appBar: AppBar(
        backgroundColor: scheme.surface,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        iconTheme: IconThemeData(color: scheme.onSurface),
        title: Text('Ads', style: TextStyle(color: scheme.onSurface)),
      ),
      body: SafeArea(
        child: _loading
            ? Center(
                child: CircularProgressIndicator(color: accent, strokeWidth: 2),
              )
            : SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
                child: Container(
                  width: double.infinity,
                  decoration: BoxDecoration(
                    color: card,
                    borderRadius: BorderRadius.circular(18),
                    border: Border.all(color: tokens.panelBorder),
                  ),
                  padding: const EdgeInsets.fromLTRB(18, 20, 18, 20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        width: 56,
                        height: 56,
                        decoration: BoxDecoration(
                          color: tokens.panel,
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: Icon(
                          Icons.campaign_outlined,
                          color: accent,
                          size: 30,
                        ),
                      ),
                      const SizedBox(height: 14),
                      Text(
                        _hasCreatedAds ? 'Create another ad' : 'No ads yet',
                        style: TextStyle(
                          color: textPrimary,
                          fontSize: 22,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        _hasCreatedAds
                            ? 'Build a new campaign with your objective, media, audience, and Stripe payment.'
                            : 'Start your first ad campaign. Choose objective, budget package, upload creative, then pay securely with Stripe.',
                        style: TextStyle(
                          color: textSecondary,
                          fontSize: 14,
                          height: 1.5,
                        ),
                      ),
                      if (_error != null) ...[
                        const SizedBox(height: 12),
                        Text(_error!, style: TextStyle(color: scheme.error)),
                      ],
                      const SizedBox(height: 18),
                      _ChecklistTile(
                        icon: Icons.track_changes_outlined,
                        text:
                            'Goal: awareness, traffic, engagement, leads, sales, or messages',
                      ),
                      _ChecklistTile(
                        icon: Icons.payments_outlined,
                        text: 'Budget package + duration package pricing',
                      ),
                      _ChecklistTile(
                        icon: Icons.auto_awesome_outlined,
                        text:
                            'Creative media with headline, description, and CTA',
                      ),
                      const SizedBox(height: 20),
                      SizedBox(
                        width: double.infinity,
                        child: ElevatedButton(
                          onPressed: _openCreate,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: accent,
                            foregroundColor: scheme.onPrimary,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                            padding: const EdgeInsets.symmetric(vertical: 14),
                          ),
                          child: Text(
                            _hasCreatedAds
                                ? 'Create new ad'
                                : 'Create your first ad',
                            style: const TextStyle(
                              fontWeight: FontWeight.w700,
                              fontSize: 15,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
      ),
    );
  }
}

class _ChecklistTile extends StatelessWidget {
  const _ChecklistTile({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    final tokens = _appTokens(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 30,
            height: 30,
            decoration: BoxDecoration(
              color: tokens.panel,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, color: tokens.primary, size: 17),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              text,
              style: TextStyle(color: tokens.text, fontSize: 13, height: 1.4),
            ),
          ),
        ],
      ),
    );
  }
}
