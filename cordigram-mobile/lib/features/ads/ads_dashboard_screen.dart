import 'package:flutter/material.dart';

import '../../core/services/api_service.dart';
import 'ads_campaigns_screen.dart';
import 'ads_campaign_detail_screen.dart';
import 'ads_create_screen.dart';
import 'ads_service.dart';

class AdsDashboardScreen extends StatefulWidget {
  const AdsDashboardScreen({super.key});

  @override
  State<AdsDashboardScreen> createState() => _AdsDashboardScreenState();
}

class _AdsDashboardScreenState extends State<AdsDashboardScreen> {
  bool _loading = true;
  String? _error;
  AdsDashboardResponse? _dashboard;

  @override
  void initState() {
    super.initState();
    _loadDashboard();
  }

  Future<void> _loadDashboard() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final data = await AdsService.getAdsDashboard();
      if (!mounted) return;
      setState(() {
        _dashboard = data;
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
        _error = 'Failed to load ads dashboard.';
        _loading = false;
      });
    }
  }

  Future<void> _openCreate() async {
    await Navigator.of(
      context,
    ).push(MaterialPageRoute(builder: (_) => const AdsCreateScreen()));
    if (!mounted) return;
    _loadDashboard();
  }

  String _money(int value) {
    final amount = value.toString();
    final chars = amount.split('').reversed.toList();
    final chunks = <String>[];
    for (int i = 0; i < chars.length; i += 3) {
      chunks.add(chars.skip(i).take(3).toList().reversed.join());
    }
    return '${chunks.reversed.join(',')} VND';
  }

  String _intFmt(int value) {
    final s = value.toString();
    final chars = s.split('').reversed.toList();
    final chunks = <String>[];
    for (int i = 0; i < chars.length; i += 3) {
      chunks.add(chars.skip(i).take(3).toList().reversed.join());
    }
    return chunks.reversed.join(',');
  }

  String _pct(double value) => '${value.toStringAsFixed(2)}%';

  String _statusLabel(String status) {
    switch (status) {
      case 'active':
        return 'Active';
      case 'hidden':
        return 'Hidden';
      case 'paused':
        return 'Paused';
      case 'canceled':
        return 'Canceled';
      default:
        return 'Completed';
    }
  }

  Color _statusBg(String status) {
    switch (status) {
      case 'active':
        return const Color(0x1F10B981);
      case 'hidden':
        return const Color(0x3364758B);
      case 'paused':
        return const Color(0x3394A3B8);
      case 'canceled':
        return const Color(0x33DC2626);
      default:
        return const Color(0x33475569);
    }
  }

  Color _statusFg(String status) {
    switch (status) {
      case 'active':
        return const Color(0xFF63E6B2);
      case 'hidden':
        return const Color(0xFFCBD5E1);
      case 'paused':
        return const Color(0xFFCBD5E1);
      case 'canceled':
        return const Color(0xFFFCA5A5);
      default:
        return const Color(0xFFB8C5DE);
    }
  }

  @override
  Widget build(BuildContext context) {
    const bg = Color(0xFF0B1020);
    const card = Color(0xFF111827);
    const textPrimary = Color(0xFFE8ECF8);
    const textSecondary = Color(0xFF7A8BB0);
    const accent = Color(0xFF4AA3E4);

    final dashboard = _dashboard;
    final hasAnyCampaign = (dashboard?.campaigns.length ?? 0) > 0;
    final summary =
        dashboard?.summary ??
        const AdsDashboardSummary(
          totalBudget: 0,
          totalSpent: 0,
          impressions: 0,
          reach: 0,
          clicks: 0,
          views: 0,
          likes: 0,
          comments: 0,
          reposts: 0,
          engagements: 0,
          totalDwellMs: 0,
          dwellSamples: 0,
          activeCount: 0,
          ctr: 0,
          averageDwellMs: 0,
          engagementRate: 0,
        );

    final trend = dashboard?.trend ?? const <AdsDashboardTrendItem>[];
    final maxTrend = trend.fold<int>(
      1,
      (max, e) => e.impressions > max ? e.impressions : max,
    );

    final activePreview =
        (dashboard?.campaigns ?? const <AdsDashboardCampaign>[])
            .where((e) => e.status == 'active')
            .toList()
          ..sort((a, b) {
            final bt = b.startsAt?.millisecondsSinceEpoch ?? 0;
            final at = a.startsAt?.millisecondsSinceEpoch ?? 0;
            return bt.compareTo(at);
          });

    return Scaffold(
      backgroundColor: bg,
      appBar: AppBar(
        backgroundColor: bg,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        iconTheme: const IconThemeData(color: textPrimary),
        title: const Text(
          'Ads Dashboard',
          style: TextStyle(color: textPrimary),
        ),
        actions: [
          IconButton(
            onPressed: _loading ? null : _loadDashboard,
            icon: const Icon(Icons.refresh_rounded, color: textPrimary),
          ),
        ],
      ),
      floatingActionButton: hasAnyCampaign
          ? FloatingActionButton.extended(
              onPressed: _openCreate,
              backgroundColor: accent,
              foregroundColor: const Color(0xFF041325),
              icon: const Icon(Icons.add_rounded),
              label: const Text(
                'Create new ad',
                style: TextStyle(fontWeight: FontWeight.w700),
              ),
            )
          : null,
      body: SafeArea(
        child: _loading
            ? const Center(
                child: CircularProgressIndicator(color: accent, strokeWidth: 2),
              )
            : RefreshIndicator(
                color: accent,
                onRefresh: _loadDashboard,
                child: SingleChildScrollView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 96),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (_error != null)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 10),
                          child: Text(
                            _error!,
                            style: const TextStyle(color: Colors.redAccent),
                          ),
                        ),
                      if (!hasAnyCampaign)
                        Container(
                          width: double.infinity,
                          decoration: BoxDecoration(
                            color: card,
                            borderRadius: BorderRadius.circular(18),
                            border: Border.all(color: const Color(0xFF1E2D48)),
                          ),
                          padding: const EdgeInsets.fromLTRB(18, 20, 18, 20),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Row(
                                children: [
                                  Icon(
                                    Icons.campaign_outlined,
                                    color: accent,
                                    size: 28,
                                  ),
                                  SizedBox(width: 10),
                                  Text(
                                    'No ads yet',
                                    style: TextStyle(
                                      color: textPrimary,
                                      fontSize: 22,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 10),
                              const Text(
                                'Start your first ad campaign with objective, budget package, targeting, and creative.',
                                style: TextStyle(
                                  color: textSecondary,
                                  fontSize: 14,
                                  height: 1.5,
                                ),
                              ),
                              const SizedBox(height: 14),
                              const _ChecklistTile(
                                icon: Icons.track_changes_outlined,
                                text: 'Goal: awareness, traffic, or conversion',
                              ),
                              const _ChecklistTile(
                                icon: Icons.payments_outlined,
                                text: 'Budget and duration package planning',
                              ),
                              const _ChecklistTile(
                                icon: Icons.auto_awesome_outlined,
                                text: 'Creative media, headline, and clear CTA',
                              ),
                              const SizedBox(height: 14),
                              SizedBox(
                                width: double.infinity,
                                child: ElevatedButton(
                                  onPressed: _openCreate,
                                  style: ElevatedButton.styleFrom(
                                    backgroundColor: accent,
                                    foregroundColor: const Color(0xFF06162B),
                                    shape: RoundedRectangleBorder(
                                      borderRadius: BorderRadius.circular(12),
                                    ),
                                    padding: const EdgeInsets.symmetric(
                                      vertical: 14,
                                    ),
                                  ),
                                  child: const Text(
                                    'Create your first ad',
                                    style: TextStyle(
                                      fontWeight: FontWeight.w700,
                                      fontSize: 15,
                                    ),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        )
                      else ...[
                        _MetricGrid(
                          summary: summary,
                          money: _money,
                          intFmt: _intFmt,
                          pct: _pct,
                        ),
                        const SizedBox(height: 12),
                        Container(
                          width: double.infinity,
                          decoration: BoxDecoration(
                            color: card,
                            borderRadius: BorderRadius.circular(18),
                            border: Border.all(color: const Color(0xFF1E2D48)),
                          ),
                          padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                '7-day impressions trend',
                                style: TextStyle(
                                  color: textPrimary,
                                  fontSize: 16,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                              const SizedBox(height: 6),
                              const Text(
                                'Track ad delivery and CTA clicks over the last 7 days.',
                                style: TextStyle(
                                  color: textSecondary,
                                  fontSize: 12.5,
                                ),
                              ),
                              const SizedBox(height: 14),
                              SizedBox(
                                height: 170,
                                child: Row(
                                  crossAxisAlignment: CrossAxisAlignment.end,
                                  children: trend.map((item) {
                                    final height =
                                        ((item.impressions / maxTrend) * 120)
                                            .clamp(8, 120)
                                            .toDouble();
                                    final dayLabel = item.day.length >= 10
                                        ? item.day.substring(5)
                                        : item.day;
                                    return Expanded(
                                      child: Column(
                                        mainAxisAlignment:
                                            MainAxisAlignment.end,
                                        children: [
                                          Container(
                                            width: 24,
                                            height: height,
                                            decoration: BoxDecoration(
                                              borderRadius:
                                                  BorderRadius.circular(8),
                                              gradient: const LinearGradient(
                                                begin: Alignment.topCenter,
                                                end: Alignment.bottomCenter,
                                                colors: [
                                                  Color(0xFF57C0FF),
                                                  Color(0xFF2A79C3),
                                                ],
                                              ),
                                            ),
                                          ),
                                          const SizedBox(height: 8),
                                          Text(
                                            dayLabel,
                                            style: const TextStyle(
                                              color: textSecondary,
                                              fontSize: 11,
                                              fontWeight: FontWeight.w700,
                                            ),
                                          ),
                                        ],
                                      ),
                                    );
                                  }).toList(),
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 12),
                        Container(
                          width: double.infinity,
                          decoration: BoxDecoration(
                            color: card,
                            borderRadius: BorderRadius.circular(18),
                            border: Border.all(color: const Color(0xFF1E2D48)),
                          ),
                          padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                'Active campaigns',
                                style: TextStyle(
                                  color: textPrimary,
                                  fontSize: 16,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                              const SizedBox(height: 6),
                              Row(
                                children: [
                                  const Expanded(
                                    child: Text(
                                      'Quick view of your 5 latest active campaigns.',
                                      style: TextStyle(
                                        color: textSecondary,
                                        fontSize: 12.5,
                                      ),
                                    ),
                                  ),
                                  TextButton(
                                    onPressed: () {
                                      Navigator.of(context).push(
                                        MaterialPageRoute(
                                          builder: (_) =>
                                              const AdsCampaignsScreen(),
                                        ),
                                      );
                                    },
                                    style: TextButton.styleFrom(
                                      foregroundColor: const Color(0xFF9CC7EF),
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 8,
                                      ),
                                      minimumSize: const Size(0, 32),
                                      tapTargetSize:
                                          MaterialTapTargetSize.shrinkWrap,
                                    ),
                                    child: const Text(
                                      'View all',
                                      style: TextStyle(
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 12),
                              if (activePreview.isEmpty)
                                const Text(
                                  'No active campaigns right now.',
                                  style: TextStyle(color: textSecondary),
                                )
                              else
                                Column(
                                  children: activePreview.take(5).map((item) {
                                    return InkWell(
                                      onTap: () {
                                        Navigator.of(context).push(
                                          MaterialPageRoute(
                                            builder: (_) =>
                                                AdsCampaignDetailScreen(
                                                  campaignId: item.id,
                                                ),
                                          ),
                                        );
                                      },
                                      borderRadius: BorderRadius.circular(12),
                                      child: Padding(
                                        padding: const EdgeInsets.only(
                                          bottom: 10,
                                        ),
                                        child: Ink(
                                          padding: const EdgeInsets.all(12),
                                          decoration: BoxDecoration(
                                            color: const Color(0xFF0F1B33),
                                            borderRadius: BorderRadius.circular(
                                              12,
                                            ),
                                            border: Border.all(
                                              color: const Color(0xFF20365A),
                                            ),
                                          ),
                                          child: Column(
                                            crossAxisAlignment:
                                                CrossAxisAlignment.start,
                                            children: [
                                              Row(
                                                children: [
                                                  Expanded(
                                                    child: Text(
                                                      item.campaignName,
                                                      style: const TextStyle(
                                                        color: textPrimary,
                                                        fontWeight:
                                                            FontWeight.w700,
                                                      ),
                                                    ),
                                                  ),
                                                  Container(
                                                    padding:
                                                        const EdgeInsets.symmetric(
                                                          horizontal: 10,
                                                          vertical: 4,
                                                        ),
                                                    decoration: BoxDecoration(
                                                      color: _statusBg(
                                                        item.status,
                                                      ),
                                                      borderRadius:
                                                          BorderRadius.circular(
                                                            999,
                                                          ),
                                                    ),
                                                    child: Text(
                                                      _statusLabel(item.status),
                                                      style: TextStyle(
                                                        color: _statusFg(
                                                          item.status,
                                                        ),
                                                        fontSize: 11,
                                                        fontWeight:
                                                            FontWeight.w700,
                                                      ),
                                                    ),
                                                  ),
                                                ],
                                              ),
                                              const SizedBox(height: 10),
                                              Row(
                                                children: [
                                                  Expanded(
                                                    child: _StatSmall(
                                                      label: 'Spent (VND)',
                                                      value: _intFmt(
                                                        item.spent,
                                                      ),
                                                    ),
                                                  ),
                                                  Expanded(
                                                    child: _StatSmall(
                                                      label: 'Impr.',
                                                      value: _intFmt(
                                                        item.impressions,
                                                      ),
                                                    ),
                                                  ),
                                                  Expanded(
                                                    child: _StatSmall(
                                                      label: 'CTR',
                                                      value: _pct(item.ctr),
                                                    ),
                                                  ),
                                                  Expanded(
                                                    child: _StatSmall(
                                                      label: 'Clicks',
                                                      value: _intFmt(
                                                        item.clicks,
                                                      ),
                                                    ),
                                                  ),
                                                ],
                                              ),
                                            ],
                                          ),
                                        ),
                                      ),
                                    );
                                  }).toList(),
                                ),
                            ],
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
      ),
    );
  }
}

class _MetricGrid extends StatelessWidget {
  const _MetricGrid({
    required this.summary,
    required this.money,
    required this.intFmt,
    required this.pct,
  });

  final AdsDashboardSummary summary;
  final String Function(int) money;
  final String Function(int) intFmt;
  final String Function(double) pct;

  @override
  Widget build(BuildContext context) {
    return GridView.count(
      crossAxisCount: 2,
      crossAxisSpacing: 10,
      mainAxisSpacing: 10,
      childAspectRatio: 1.45,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      children: [
        _MetricCard(
          label: 'Total budget',
          value: money(summary.totalBudget),
          hint: 'Spent: ${money(summary.totalSpent)}',
        ),
        _MetricCard(
          label: 'Impressions',
          value: intFmt(summary.impressions),
          hint: 'Reach: ${intFmt(summary.reach)}',
        ),
        _MetricCard(
          label: 'Average CTR',
          value: pct(summary.ctr),
          hint: 'Clicks: ${intFmt(summary.clicks)}',
        ),
        _MetricCard(
          label: 'Active campaigns',
          value: summary.activeCount.toString(),
          hint: 'Live campaigns currently running',
        ),
      ],
    );
  }
}

class _MetricCard extends StatelessWidget {
  const _MetricCard({
    required this.label,
    required this.value,
    required this.hint,
  });

  final String label;
  final String value;
  final String hint;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF111827),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFF1E2D48)),
      ),
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(
              color: Color(0xFF7A8BB0),
              fontSize: 11,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              color: Color(0xFFE8ECF8),
              fontWeight: FontWeight.w800,
              fontSize: 17,
            ),
          ),
          const Spacer(),
          Text(
            hint,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(color: Color(0xFF7A8BB0), fontSize: 11.5),
          ),
        ],
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
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 30,
            height: 30,
            decoration: BoxDecoration(
              color: const Color(0xFF182844),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, color: const Color(0xFF88BFF0), size: 17),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              text,
              style: const TextStyle(
                color: Color(0xFFBCC8E0),
                fontSize: 13,
                height: 1.4,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _StatSmall extends StatelessWidget {
  const _StatSmall({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(color: Color(0xFF7A8BB0), fontSize: 11),
        ),
        const SizedBox(height: 4),
        Text(
          value,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(
            color: Color(0xFFE8ECF8),
            fontSize: 12,
            fontWeight: FontWeight.w700,
          ),
        ),
      ],
    );
  }
}
