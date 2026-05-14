import 'package:flutter/material.dart';

import '../../core/config/app_theme.dart';
import '../../core/services/api_service.dart';
import '../../core/services/language_controller.dart';
import 'ads_campaign_detail_screen.dart';
import 'ads_service.dart';

AppSemanticColors _appTokens(BuildContext context) {
  final theme = Theme.of(context);
  return theme.extension<AppSemanticColors>() ??
      (theme.brightness == Brightness.dark
          ? AppSemanticColors.dark
          : AppSemanticColors.light);
}

enum _CampaignStatusFilter { all, active, hidden, canceled, completed }

enum _CampaignSort { newest, oldest, spent, ctr }

class AdsCampaignsScreen extends StatefulWidget {
  const AdsCampaignsScreen({super.key});

  @override
  State<AdsCampaignsScreen> createState() => _AdsCampaignsScreenState();
}

class _AdsCampaignsScreenState extends State<AdsCampaignsScreen> {
  bool _loading = true;
  String? _error;
  List<AdsDashboardCampaign> _campaigns = const [];

  final TextEditingController _searchCtrl = TextEditingController();
  _CampaignStatusFilter _statusFilter = _CampaignStatusFilter.all;
  _CampaignSort _sortBy = _CampaignSort.newest;
  DateTime? _dateFrom;
  DateTime? _dateTo;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final data = await AdsService.getAdsDashboard();
      if (!mounted) return;
      setState(() {
        _campaigns = data.campaigns;
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
        _error = LanguageController.instance.t('ads.campaigns.errorLoad');
        _loading = false;
      });
    }
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

  String _money(int value) => '${_intFmt(value)} VND';

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
    final isDark = Theme.of(context).brightness == Brightness.dark;
    switch (status) {
      case 'active':
        return isDark ? const Color(0x1F10B981) : const Color(0xFFE9F8F0);
      case 'hidden':
      case 'paused':
        return isDark ? const Color(0x3364758B) : const Color(0xFFF1F4F8);
      case 'canceled':
        return isDark ? const Color(0x33DC2626) : const Color(0xFFFDECED);
      default:
        return isDark ? const Color(0x3338BDF8) : const Color(0xFFEAF1FB);
    }
  }

  Color _statusFg(String status) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    switch (status) {
      case 'active':
        return isDark ? const Color(0xFF63E6B2) : const Color(0xFF1E7A4D);
      case 'hidden':
      case 'paused':
        return isDark ? const Color(0xFFCBD5E1) : const Color(0xFF5F6B7A);
      case 'canceled':
        return isDark ? const Color(0xFFFCA5A5) : const Color(0xFFB4232D);
      default:
        return isDark ? const Color(0xFFBAE6FD) : const Color(0xFF245A95);
    }
  }

  String _statusFilterLabel(_CampaignStatusFilter value) {
    final lc = LanguageController.instance;
    switch (value) {
      case _CampaignStatusFilter.all:
        return lc.t('ads.campaigns.statusAll');
      case _CampaignStatusFilter.active:
        return lc.t('ads.campaigns.statusActive');
      case _CampaignStatusFilter.hidden:
        return lc.t('ads.campaigns.statusHidden');
      case _CampaignStatusFilter.canceled:
        return lc.t('ads.campaigns.statusCanceled');
      case _CampaignStatusFilter.completed:
        return lc.t('ads.campaigns.statusCompleted');
    }
  }

  String _sortLabel(_CampaignSort value) {
    final lc = LanguageController.instance;
    switch (value) {
      case _CampaignSort.newest:
        return lc.t('ads.campaigns.sortNewest');
      case _CampaignSort.oldest:
        return lc.t('ads.campaigns.sortOldest');
      case _CampaignSort.spent:
        return lc.t('ads.campaigns.sortHighestSpent');
      case _CampaignSort.ctr:
        return lc.t('ads.campaigns.sortHighestCtr');
    }
  }

  DateTime _toStartOfDay(DateTime date) {
    return DateTime(date.year, date.month, date.day);
  }

  DateTime _toEndOfDay(DateTime date) {
    return DateTime(date.year, date.month, date.day, 23, 59, 59, 999);
  }

  String _dateText(DateTime? date) {
    if (date == null) return '--/--/----';
    final dd = date.day.toString().padLeft(2, '0');
    final mm = date.month.toString().padLeft(2, '0');
    final yy = date.year.toString();
    return '$dd/$mm/$yy';
  }

  String _dateLite(DateTime? date) {
    if (date == null) return '--';
    final dd = date.day.toString().padLeft(2, '0');
    final mm = date.month.toString().padLeft(2, '0');
    return '$dd/$mm';
  }

  Future<void> _pickFromDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _dateFrom ?? DateTime.now(),
      firstDate: DateTime(2000),
      lastDate: _dateTo ?? DateTime.now().add(const Duration(days: 3650)),
    );
    if (picked == null) return;
    setState(() {
      _dateFrom = picked;
    });
  }

  Future<void> _pickToDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _dateTo ?? DateTime.now(),
      firstDate: _dateFrom ?? DateTime(2000),
      lastDate: DateTime.now().add(const Duration(days: 3650)),
    );
    if (picked == null) return;
    setState(() {
      _dateTo = picked;
    });
  }

  void _clearFilters() {
    setState(() {
      _searchCtrl.clear();
      _statusFilter = _CampaignStatusFilter.all;
      _sortBy = _CampaignSort.newest;
      _dateFrom = null;
      _dateTo = null;
    });
  }

  bool get _hasActiveFilters {
    return _searchCtrl.text.trim().isNotEmpty ||
        _statusFilter != _CampaignStatusFilter.all ||
        _sortBy != _CampaignSort.newest ||
        _dateFrom != null ||
        _dateTo != null;
  }

  String? _statusValueFromFilter(_CampaignStatusFilter value) {
    switch (value) {
      case _CampaignStatusFilter.all:
        return null;
      case _CampaignStatusFilter.active:
        return 'active';
      case _CampaignStatusFilter.hidden:
        return 'hidden';
      case _CampaignStatusFilter.canceled:
        return 'canceled';
      case _CampaignStatusFilter.completed:
        return 'completed';
    }
  }

  List<AdsDashboardCampaign> get _filtered {
    final needle = _searchCtrl.text.trim().toLowerCase();
    final statusValue = _statusValueFromFilter(_statusFilter);

    final fromTime = _dateFrom != null
        ? _toStartOfDay(_dateFrom!).millisecondsSinceEpoch
        : null;
    final toTime = _dateTo != null
        ? _toEndOfDay(_dateTo!).millisecondsSinceEpoch
        : null;

    final rangeStart = fromTime != null && toTime != null
        ? (fromTime < toTime ? fromTime : toTime)
        : fromTime;
    final rangeEnd = fromTime != null && toTime != null
        ? (fromTime > toTime ? fromTime : toTime)
        : toTime;

    final list = _campaigns.where((item) {
      if (needle.isNotEmpty &&
          !item.campaignName.toLowerCase().contains(needle)) {
        return false;
      }
      if (statusValue != null && item.status != statusValue) return false;

      final startsAtMs = item.startsAt?.millisecondsSinceEpoch;
      if (startsAtMs == null) return true;

      if (rangeStart != null && startsAtMs < rangeStart) return false;
      if (rangeEnd != null && startsAtMs > rangeEnd) return false;
      return true;
    }).toList();

    list.sort((a, b) {
      if (_sortBy == _CampaignSort.newest) {
        final bt = b.startsAt?.millisecondsSinceEpoch ?? 0;
        final at = a.startsAt?.millisecondsSinceEpoch ?? 0;
        return bt.compareTo(at);
      }
      if (_sortBy == _CampaignSort.oldest) {
        final bt = b.startsAt?.millisecondsSinceEpoch ?? 0;
        final at = a.startsAt?.millisecondsSinceEpoch ?? 0;
        return at.compareTo(bt);
      }
      if (_sortBy == _CampaignSort.spent) {
        return b.spent.compareTo(a.spent);
      }
      return b.ctr.compareTo(a.ctr);
    });

    return list;
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

    final campaigns = _filtered;
    final total = _campaigns.length;
    final active = _campaigns.where((e) => e.status == 'active').length;
    final totalSpent = _campaigns.fold<int>(0, (sum, e) => sum + e.spent);
    final totalImpressions = _campaigns.fold<int>(
      0,
      (sum, e) => sum + e.impressions,
    );

    return Scaffold(
      backgroundColor: theme.scaffoldBackgroundColor,
      appBar: AppBar(
        backgroundColor: scheme.surface,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        iconTheme: IconThemeData(color: scheme.onSurface),
        title: Text(
          LanguageController.instance.t('ads.campaigns.appBar'),
          style: TextStyle(color: scheme.onSurface),
        ),
      ),
      body: SafeArea(
        child: _loading
            ? Center(
                child: CircularProgressIndicator(color: accent, strokeWidth: 2),
              )
            : RefreshIndicator(
                color: accent,
                onRefresh: _load,
                child: SingleChildScrollView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (_error != null)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 12),
                          child: Text(
                            _error!,
                            style: TextStyle(color: scheme.error),
                          ),
                        ),
                      GridView.count(
                        crossAxisCount: 2,
                        crossAxisSpacing: 10,
                        mainAxisSpacing: 10,
                        childAspectRatio: 1.55,
                        shrinkWrap: true,
                        physics: const NeverScrollableScrollPhysics(),
                        children: [
                          _StatCard(label: LanguageController.instance.t('ads.campaigns.totalCampaigns'), value: '$total'),
                          _StatCard(label: LanguageController.instance.t('ads.campaigns.active'), value: '$active'),
                          _StatCard(
                            label: LanguageController.instance.t('ads.campaigns.totalSpent'),
                            value: _money(totalSpent),
                          ),
                          _StatCard(
                            label: LanguageController.instance.t('ads.campaigns.totalImpressions'),
                            value: _intFmt(totalImpressions),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      Container(
                        width: double.infinity,
                        decoration: BoxDecoration(
                          color: card,
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: tokens.panelBorder),
                        ),
                        padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
                        child: Column(
                          children: [
                            TextField(
                              controller: _searchCtrl,
                              onChanged: (_) => setState(() {}),
                              decoration: InputDecoration(
                                hintText: LanguageController.instance.t('ads.campaigns.searchPlaceholder'),
                                hintStyle: TextStyle(color: textSecondary),
                                filled: true,
                                fillColor: tokens.panel,
                                contentPadding: const EdgeInsets.symmetric(
                                  horizontal: 12,
                                  vertical: 12,
                                ),
                                border: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(10),
                                  borderSide: BorderSide(
                                    color: tokens.panelBorder,
                                  ),
                                ),
                                enabledBorder: OutlineInputBorder(
                                  borderRadius: BorderRadius.circular(10),
                                  borderSide: BorderSide(
                                    color: tokens.panelBorder,
                                  ),
                                ),
                              ),
                              style: TextStyle(color: textPrimary),
                            ),
                            const SizedBox(height: 10),
                            Row(
                              children: [
                                Expanded(
                                  child: _PickerButton(
                                    label: LanguageController.instance.t('ads.campaigns.filterStatus'),
                                    value: _statusFilterLabel(_statusFilter),
                                    onTap: () async {
                                      final value =
                                          await showModalBottomSheet<
                                            _CampaignStatusFilter
                                          >(
                                            context: context,
                                            backgroundColor: tokens.panel,
                                            builder: (_) =>
                                                _SimpleSheet<
                                                  _CampaignStatusFilter
                                                >(
                                                  title: LanguageController.instance.t('ads.campaigns.sheetStatusFilter'),
                                                  selected: _statusFilter,
                                                  items: _CampaignStatusFilter
                                                      .values
                                                      .map(
                                                        (e) => _SheetItem(
                                                          value: e,
                                                          label:
                                                              _statusFilterLabel(
                                                                e,
                                                              ),
                                                        ),
                                                      )
                                                      .toList(),
                                                ),
                                          );
                                      if (value == null) return;
                                      setState(() => _statusFilter = value);
                                    },
                                  ),
                                ),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: _PickerButton(
                                    label: LanguageController.instance.t('ads.campaigns.filterSort'),
                                    value: _sortLabel(_sortBy),
                                    onTap: () async {
                                      final value =
                                          await showModalBottomSheet<
                                            _CampaignSort
                                          >(
                                            context: context,
                                            backgroundColor: tokens.panel,
                                            builder: (_) =>
                                                _SimpleSheet<_CampaignSort>(
                                                  title: LanguageController.instance.t('ads.campaigns.sheetSortCampaigns'),
                                                  selected: _sortBy,
                                                  items: _CampaignSort.values
                                                      .map(
                                                        (e) => _SheetItem(
                                                          value: e,
                                                          label: _sortLabel(e),
                                                        ),
                                                      )
                                                      .toList(),
                                                ),
                                          );
                                      if (value == null) return;
                                      setState(() => _sortBy = value);
                                    },
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 10),
                            Row(
                              children: [
                                Expanded(
                                  child: _PickerButton(
                                    label: LanguageController.instance.t('ads.campaigns.filterFrom'),
                                    value: _dateText(_dateFrom),
                                    onTap: _pickFromDate,
                                  ),
                                ),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: _PickerButton(
                                    label: LanguageController.instance.t('ads.campaigns.filterTo'),
                                    value: _dateText(_dateTo),
                                    onTap: _pickToDate,
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 10),
                            Row(
                              children: [
                                Text(
                                  campaigns.length == 1
                                      ? LanguageController.instance.t('ads.campaigns.resultCount', {'count': campaigns.length})
                                      : LanguageController.instance.t('ads.campaigns.resultCountPlural', {'count': campaigns.length}),
                                  style: TextStyle(
                                    color: textSecondary,
                                    fontSize: 12.5,
                                  ),
                                ),
                                const Spacer(),
                                TextButton(
                                  onPressed: _hasActiveFilters
                                      ? _clearFilters
                                      : null,
                                  style: TextButton.styleFrom(
                                    foregroundColor: tokens.primary,
                                  ),
                                  child: Text(LanguageController.instance.t('ads.campaigns.clear')),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 12),
                      if (campaigns.isEmpty)
                        Padding(
                          padding: EdgeInsets.symmetric(vertical: 18),
                          child: Text(
                            LanguageController.instance.t('ads.campaigns.noMatch'),
                            style: TextStyle(color: textSecondary),
                          ),
                        )
                      else
                        Column(
                          children: campaigns.map((item) {
                            return InkWell(
                              onTap: () {
                                Navigator.of(context).push(
                                  MaterialPageRoute(
                                    builder: (_) => AdsCampaignDetailScreen(
                                      campaignId: item.id,
                                    ),
                                  ),
                                );
                              },
                              borderRadius: BorderRadius.circular(14),
                              child: Container(
                                width: double.infinity,
                                margin: const EdgeInsets.only(bottom: 10),
                                decoration: BoxDecoration(
                                  color: card,
                                  borderRadius: BorderRadius.circular(14),
                                  border: Border.all(color: tokens.panelBorder),
                                ),
                                padding: const EdgeInsets.fromLTRB(
                                  12,
                                  12,
                                  12,
                                  12,
                                ),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Row(
                                      children: [
                                        Expanded(
                                          child: Text(
                                            item.campaignName,
                                            maxLines: 2,
                                            overflow: TextOverflow.ellipsis,
                                            style: TextStyle(
                                              color: textPrimary,
                                              fontWeight: FontWeight.w700,
                                            ),
                                          ),
                                        ),
                                        const SizedBox(width: 8),
                                        Container(
                                          padding: const EdgeInsets.symmetric(
                                            horizontal: 10,
                                            vertical: 4,
                                          ),
                                          decoration: BoxDecoration(
                                            color: _statusBg(item.status),
                                            borderRadius: BorderRadius.circular(
                                              999,
                                            ),
                                          ),
                                          child: Text(
                                            _statusLabel(item.status),
                                            style: TextStyle(
                                              color: _statusFg(item.status),
                                              fontSize: 11,
                                              fontWeight: FontWeight.w700,
                                            ),
                                          ),
                                        ),
                                      ],
                                    ),
                                    const SizedBox(height: 8),
                                    Text(
                                      '${LanguageController.instance.t('ads.campaigns.cardStart', {'date': _dateLite(item.startsAt)})}   ${LanguageController.instance.t('ads.campaigns.cardEnd', {'date': _dateLite(item.expiresAt)})}',
                                      style: TextStyle(
                                        color: textSecondary,
                                        fontSize: 12,
                                      ),
                                    ),
                                    const SizedBox(height: 10),
                                    Row(
                                      children: [
                                        Expanded(
                                          child: _MiniMetric(
                                            label: LanguageController.instance.t('ads.metrics.spentVnd'),
                                            value: _intFmt(item.spent),
                                          ),
                                        ),
                                        Expanded(
                                          child: _MiniMetric(
                                            label: LanguageController.instance.t('ads.metrics.impr'),
                                            value: _intFmt(item.impressions),
                                          ),
                                        ),
                                        Expanded(
                                          child: _MiniMetric(
                                            label: LanguageController.instance.t('ads.metrics.ctr'),
                                            value: _pct(item.ctr),
                                          ),
                                        ),
                                        Expanded(
                                          child: _MiniMetric(
                                            label: LanguageController.instance.t('ads.metrics.clicksLabel'),
                                            value: _intFmt(item.clicks),
                                          ),
                                        ),
                                      ],
                                    ),
                                    if ((item.adminCancelReason ?? '')
                                        .trim()
                                        .isNotEmpty)
                                      Padding(
                                        padding: const EdgeInsets.only(top: 8),
                                        child: Text(
                                          LanguageController.instance.t('ads.campaigns.adminReason', {'reason': item.adminCancelReason!.trim()}),
                                          style: TextStyle(
                                            color: textSecondary,
                                            fontSize: 12,
                                          ),
                                        ),
                                      ),
                                  ],
                                ),
                              ),
                            );
                          }).toList(),
                        ),
                    ],
                  ),
                ),
              ),
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final tokens = _appTokens(context);
    return Container(
      padding: const EdgeInsets.fromLTRB(10, 10, 10, 10),
      decoration: BoxDecoration(
        color: tokens.panelMuted,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: tokens.panelBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: TextStyle(
              color: tokens.textMuted,
              fontSize: 11,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            value,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              color: tokens.text,
              fontWeight: FontWeight.w800,
              fontSize: 16,
            ),
          ),
        ],
      ),
    );
  }
}

class _PickerButton extends StatelessWidget {
  const _PickerButton({
    required this.label,
    required this.value,
    required this.onTap,
  });

  final String label;
  final String value;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final tokens = _appTokens(context);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: Ink(
        padding: const EdgeInsets.fromLTRB(10, 9, 10, 9),
        decoration: BoxDecoration(
          color: tokens.panel,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: tokens.panelBorder),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: TextStyle(
                color: tokens.textMuted,
                fontSize: 11,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 4),
            Row(
              children: [
                Expanded(
                  child: Text(
                    value,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: tokens.text,
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                const SizedBox(width: 6),
                Icon(Icons.keyboard_arrow_down_rounded, color: tokens.primary),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _MiniMetric extends StatelessWidget {
  const _MiniMetric({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final tokens = _appTokens(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: TextStyle(color: tokens.textMuted, fontSize: 11)),
        const SizedBox(height: 4),
        Text(
          value,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            color: tokens.text,
            fontSize: 12,
            fontWeight: FontWeight.w700,
          ),
        ),
      ],
    );
  }
}

class _SheetItem<T> {
  const _SheetItem({required this.value, required this.label});

  final T value;
  final String label;
}

class _SimpleSheet<T> extends StatelessWidget {
  const _SimpleSheet({
    required this.title,
    required this.selected,
    required this.items,
  });

  final String title;
  final T selected;
  final List<_SheetItem<T>> items;

  @override
  Widget build(BuildContext context) {
    final tokens = _appTokens(context);
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              title,
              style: TextStyle(
                color: tokens.text,
                fontSize: 16,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 10),
            ...items.map((item) {
              final active = item.value == selected;
              return ListTile(
                dense: true,
                contentPadding: const EdgeInsets.symmetric(horizontal: 0),
                title: Text(
                  item.label,
                  style: TextStyle(
                    color: active ? tokens.primary : tokens.text,
                    fontWeight: active ? FontWeight.w700 : FontWeight.w500,
                  ),
                ),
                trailing: active
                    ? Icon(
                        Icons.check_circle_rounded,
                        color: tokens.primary,
                        size: 18,
                      )
                    : null,
                onTap: () => Navigator.of(context).pop(item.value),
              );
            }),
          ],
        ),
      ),
    );
  }
}
