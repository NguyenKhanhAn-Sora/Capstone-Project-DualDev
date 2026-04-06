import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import '../../core/services/api_service.dart';
import '../../core/services/auth_storage.dart';
import 'models/profile_detail.dart';
import 'services/profile_service.dart';

// -- Regex / validation -------------------------------------------------------

final _usernameRegex = RegExp(r'^[a-z0-9_.]{3,30}$');

String? _validateDisplayName(String name) {
  final trimmed = name.trim();
  if (trimmed.isEmpty) return 'Display name is required.';
  if (trimmed.length < 3 || trimmed.length > 30) {
    return 'At least 3 and maximum 30 characters.';
  }
  final condensed = trimmed.replaceAll(' ', '');
  if (condensed.length < 3) {
    return 'Display name needs at least 3 letters after removing spaces.';
  }
  if (!RegExp(r'^[\p{L}\s]+$', unicode: true).hasMatch(trimmed)) {
    return 'Display name can only contain letters and spaces.';
  }
  return null;
}

// -- Company suggest model ----------------------------------------------------

class _CompanySuggest {
  const _CompanySuggest({
    required this.id,
    required this.name,
    required this.memberCount,
  });
  final String id;
  final String name;
  final int memberCount;

  factory _CompanySuggest.fromJson(Map<String, dynamic> j) => _CompanySuggest(
    id: j['id'] as String,
    name: j['name'] as String,
    memberCount: (j['memberCount'] as num?)?.toInt() ?? 0,
  );
}

// -- Location suggest model ---------------------------------------------------

class _LocationSuggest {
  const _LocationSuggest({
    required this.label,
    required this.lat,
    required this.lon,
  });
  final String label;
  final String lat;
  final String lon;
}

String _cleanLocationLabel(String label) {
  return label
      .replaceAll(RegExp(r'\b\d{4,6}\b'), '')
      .replaceAll(RegExp(r',\s*,+'), ', ')
      .replaceAll(RegExp(r'\s{2,}'), ' ')
      .replaceAll(RegExp(r'\s*,\s*$'), '')
      .replaceAll(RegExp(r'^\s*,\s*'), '')
      .trim();
}

// -- Gender options -----------------------------------------------------------

const _kGenderOptions = [
  ('male', 'Male'),
  ('female', 'Female'),
  ('other', 'Other'),
  ('prefer_not_to_say', 'Prefer not to say'),
];

// -- Entry point --------------------------------------------------------------

void showProfileEditSheet(
  BuildContext context, {
  required ProfileDetail profile,
  required void Function(ProfileDetail updated) onSaved,
}) {
  showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    isDismissible: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (_) => _ProfileEditSheet(profile: profile, onSaved: onSaved),
  );
}

// -- Sheet widget -------------------------------------------------------------

class _ProfileEditSheet extends StatefulWidget {
  const _ProfileEditSheet({required this.profile, required this.onSaved});

  final ProfileDetail profile;
  final void Function(ProfileDetail updated) onSaved;

  @override
  State<_ProfileEditSheet> createState() => _ProfileEditSheetState();
}

class _ProfileEditSheetState extends State<_ProfileEditSheet> {
  // Controllers
  late final TextEditingController _displayNameCtrl;
  late final TextEditingController _usernameCtrl;
  late final TextEditingController _bioCtrl;
  late final TextEditingController _locationCtrl;
  late final TextEditingController _workplaceCtrl;

  // Basic form state
  String? _gender;
  DateTime? _birthdate;
  bool _saving = false;
  String? _saveError;

  // Username
  bool _checkingUsername = false;
  bool? _usernameAvailable;
  String? _usernameError;
  Timer? _usernameDebounce;

  // Location
  List<_LocationSuggest> _locationSuggestions = [];
  bool _locationLoading = false;
  bool _locationInteracted = false;
  bool _locationOpen = false;
  Timer? _locationDebounce;

  // Workplace
  List<_CompanySuggest> _workplaceSuggestions = [];
  bool _workplaceLoading = false;
  bool _workplaceInteracted = false;
  bool _workplaceOpen = false;
  Timer? _workplaceDebounce;
  String? _workplaceSelectedId;

  // List scroll controller (reference from DraggableScrollableSheet builder)
  ScrollController? _listCtrl;

  // Colors
  static const Color _bg = Color(0xFF0F1829);
  static const Color _surface = Color(0xFF131F33);
  static const Color _border = Color(0xFF1E2D48);
  static const Color _textPrimary = Color(0xFFE8ECF8);
  static const Color _textSecondary = Color(0xFF7A8BB0);
  static const Color _accent = Color(0xFF4AA3E4);
  static const Color _danger = Color(0xFFE53935);

  @override
  void initState() {
    super.initState();
    final p = widget.profile;
    _displayNameCtrl = TextEditingController(text: p.displayName);
    _usernameCtrl = TextEditingController(text: p.username);
    _bioCtrl = TextEditingController(text: p.bio ?? '');
    _locationCtrl = TextEditingController(text: p.location ?? '');
    _workplaceCtrl = TextEditingController(
      text: p.workplace?.companyName ?? '',
    );
    _workplaceSelectedId = p.workplace?.companyId;
    _gender = p.gender;
    _birthdate = (p.birthdate?.isNotEmpty == true)
        ? _tryParseDate(p.birthdate!)
        : null;
  }

  @override
  void dispose() {
    _displayNameCtrl.dispose();
    _usernameCtrl.dispose();
    _bioCtrl.dispose();
    _locationCtrl.dispose();
    _workplaceCtrl.dispose();
    _usernameDebounce?.cancel();
    _locationDebounce?.cancel();
    _workplaceDebounce?.cancel();
    super.dispose();
  }

  DateTime? _tryParseDate(String s) {
    try {
      return DateTime.parse(s);
    } catch (_) {
      return null;
    }
  }

  // -- Username availability --------------------------------------------------

  void _onUsernameChanged(String value) {
    _usernameDebounce?.cancel();
    final trimmed = value.trim();

    if (trimmed == widget.profile.username) {
      setState(() {
        _usernameAvailable = null;
        _usernameError = null;
        _checkingUsername = false;
      });
      return;
    }

    if (!_usernameRegex.hasMatch(trimmed)) {
      setState(() {
        _usernameAvailable = false;
        _usernameError =
            'Username can only include lowercase letters, numbers, underscores, and dots (3-30 chars).';
        _checkingUsername = false;
      });
      return;
    }

    setState(() {
      _checkingUsername = true;
      _usernameAvailable = null;
      _usernameError = null;
    });

    _usernameDebounce = Timer(const Duration(milliseconds: 450), () async {
      try {
        final available = await ProfileService.checkUsername(
          trimmed,
          excludeUserId: widget.profile.userId,
        );
        if (!mounted) return;
        setState(() {
          _checkingUsername = false;
          _usernameAvailable = available;
          _usernameError = available ? null : 'Username already taken.';
        });
      } catch (_) {
        if (!mounted) return;
        setState(() {
          _checkingUsername = false;
          _usernameAvailable = null;
          _usernameError = null;
        });
      }
    });
  }

  // -- Location search (Nominatim) --------------------------------------------

  void _onLocationChanged(String value) {
    _locationInteracted = true;
    setState(() => _locationOpen = false);
    _locationDebounce?.cancel();

    if (value.trim().isEmpty) {
      setState(() {
        _locationSuggestions = [];
        _locationLoading = false;
      });
      return;
    }

    setState(() => _locationLoading = true);

    _locationDebounce = Timer(const Duration(milliseconds: 350), () async {
      try {
        final uri = Uri.parse('https://nominatim.openstreetmap.org/search')
            .replace(
              queryParameters: {
                'q': value.trim(),
                'format': 'jsonv2',
                'addressdetails': '1',
                'limit': '8',
              },
            );
        final response = await http
            .get(
              uri,
              headers: {
                'Accept': 'application/json',
                'Accept-Language': 'vi',
                'User-Agent':
                    'CordigramApp/1.0 (flutter; contact@cordigram.com)',
              },
            )
            .timeout(const Duration(seconds: 8));

        if (!mounted) return;
        if (response.statusCode == 200) {
          final data = jsonDecode(response.body) as List<dynamic>;
          final suggestions = data
              .map(
                (item) => _LocationSuggest(
                  label: _cleanLocationLabel(
                    (item as Map)['display_name'] as String,
                  ),
                  lat: item['lat'] as String,
                  lon: item['lon'] as String,
                ),
              )
              .toList();
          setState(() {
            _locationSuggestions = suggestions;
            _locationLoading = false;
            _locationOpen = suggestions.isNotEmpty;
          });
          if (suggestions.isNotEmpty) {
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (_listCtrl?.hasClients == true) {
                _listCtrl!.animateTo(
                  _listCtrl!.position.maxScrollExtent,
                  duration: const Duration(milliseconds: 250),
                  curve: Curves.easeOut,
                );
              }
            });
          }
        } else {
          setState(() {
            _locationSuggestions = [];
            _locationLoading = false;
          });
        }
      } catch (_) {
        if (!mounted) return;
        setState(() {
          _locationSuggestions = [];
          _locationLoading = false;
        });
      }
    });
  }

  void _selectLocation(_LocationSuggest s) {
    _locationCtrl.text = s.label;
    setState(() {
      _locationSuggestions = [];
      _locationOpen = false;
    });
  }

  // -- Workplace search -------------------------------------------------------

  void _onWorkplaceChanged(String value) {
    _workplaceInteracted = true;
    _workplaceSelectedId = null;
    setState(() => _workplaceOpen = false);
    _workplaceDebounce?.cancel();

    if (value.trim().isEmpty) {
      setState(() {
        _workplaceSuggestions = [];
        _workplaceLoading = false;
      });
      return;
    }

    setState(() => _workplaceLoading = true);

    _workplaceDebounce = Timer(const Duration(milliseconds: 250), () async {
      try {
        final token = AuthStorage.accessToken;
        if (token == null) return;
        final qs = Uri(
          queryParameters: {'q': value.trim(), 'limit': '8'},
        ).query;
        final data = await ApiService.get(
          '/companies/suggest?$qs',
          extraHeaders: {'Authorization': 'Bearer $token'},
        );
        if (!mounted) return;
        final items = (data['items'] as List<dynamic>? ?? [])
            .map((e) => _CompanySuggest.fromJson(e as Map<String, dynamic>))
            .toList();
        setState(() {
          _workplaceSuggestions = items;
          _workplaceLoading = false;
          _workplaceOpen = items.isNotEmpty;
        });
        if (items.isNotEmpty) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (_listCtrl?.hasClients == true) {
              _listCtrl!.animateTo(
                _listCtrl!.position.maxScrollExtent,
                duration: const Duration(milliseconds: 250),
                curve: Curves.easeOut,
              );
            }
          });
        }
      } catch (_) {
        if (!mounted) return;
        setState(() {
          _workplaceSuggestions = [];
          _workplaceLoading = false;
        });
      }
    });
  }

  void _selectWorkplace(_CompanySuggest c) {
    _workplaceCtrl.text = c.name;
    _workplaceSelectedId = c.id;
    setState(() {
      _workplaceSuggestions = [];
      _workplaceOpen = false;
    });
  }

  // -- Date picker ------------------------------------------------------------

  Future<void> _pickBirthdate() async {
    FocusScope.of(context).unfocus();
    final initial = _birthdate ?? DateTime(2000);
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(1900),
      lastDate: DateTime.now(),
      builder: (ctx, child) => Theme(
        data: Theme.of(ctx).copyWith(
          colorScheme: const ColorScheme.dark(
            primary: Color(0xFF4AA3E4),
            onPrimary: Colors.white,
            surface: Color(0xFF1A2740),
            onSurface: Color(0xFFE8ECF8),
          ),
        ),
        child: child!,
      ),
    );
    if (picked != null && mounted) setState(() => _birthdate = picked);
  }

  String _formatBirthdate(DateTime dt) {
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    return '${months[dt.month - 1]} ${dt.day}, ${dt.year}';
  }

  // -- Gender picker ----------------------------------------------------------

  void _showGenderPicker() {
    FocusScope.of(context).unfocus();
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xFF141D30),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                margin: const EdgeInsets.only(top: 10, bottom: 14),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.18),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const Padding(
              padding: EdgeInsets.fromLTRB(20, 0, 20, 10),
              child: Text(
                'Select Gender',
                style: TextStyle(
                  color: Color(0xFFE8ECF8),
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
            ..._kGenderOptions.map((g) {
              final selected = _gender == g.$1;
              return ListTile(
                title: Text(
                  g.$2,
                  style: TextStyle(
                    color: selected
                        ? const Color(0xFF4AA3E4)
                        : const Color(0xFFD0D8EE),
                    fontSize: 15,
                    fontWeight: selected ? FontWeight.w600 : FontWeight.normal,
                  ),
                ),
                trailing: selected
                    ? const Icon(
                        Icons.check_rounded,
                        color: Color(0xFF4AA3E4),
                        size: 20,
                      )
                    : null,
                onTap: () {
                  setState(() => _gender = g.$1);
                  Navigator.pop(ctx);
                },
                contentPadding: const EdgeInsets.symmetric(horizontal: 20),
              );
            }),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  // -- Validation -------------------------------------------------------------

  String? _validateForm() {
    final dnError = _validateDisplayName(_displayNameCtrl.text);
    if (dnError != null) return dnError;

    final username = _usernameCtrl.text.trim();
    if (!_usernameRegex.hasMatch(username)) {
      return 'Username can only include lowercase letters, numbers, underscores, and dots (3-30 chars).';
    }
    if (_usernameAvailable == false) return 'Username already taken.';

    if (_bioCtrl.text.length > 300) return 'Bio cannot exceed 300 characters.';

    if (_birthdate != null && _birthdate!.isAfter(DateTime.now())) {
      return 'Birthday cannot be in the future.';
    }
    return null;
  }

  // -- Save -------------------------------------------------------------------

  Future<void> _save() async {
    final err = _validateForm();
    if (err != null) {
      setState(() => _saveError = err);
      return;
    }

    setState(() {
      _saving = true;
      _saveError = null;
    });

    try {
      final payload = <String, dynamic>{
        'displayName': _displayNameCtrl.text.trim(),
        'username': _usernameCtrl.text.trim(),
        'bio': _bioCtrl.text.trim(),
        'location': _locationCtrl.text.trim(),
      };

      if (_gender != null) payload['gender'] = _gender;

      final workplace = _workplaceCtrl.text.trim();
      if (workplace.isNotEmpty) {
        payload['workplaceName'] = workplace;
        if (_workplaceSelectedId != null) {
          payload['workplaceCompanyId'] = _workplaceSelectedId;
        }
      } else {
        payload['workplaceName'] = null;
        payload['workplaceCompanyId'] = null;
      }

      if (_birthdate != null) {
        payload['birthdate'] = _birthdate!.toIso8601String();
      } else {
        payload['birthdate'] = null;
      }

      final updated = await ProfileService.updateProfile(payload);
      if (!mounted) return;
      widget.onSaved(updated);
      Navigator.of(context).pop();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _saveError = e.toString().replaceFirst(RegExp(r'^.*?Exception: '), '');
      });
    }
  }

  // -- Build ------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.88,
      minChildSize: 0.5,
      maxChildSize: 0.96,
      builder: (_, ctrl) {
        _listCtrl = ctrl;
        return Container(
          decoration: const BoxDecoration(
            color: _bg,
            borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
          ),
          child: Column(
            children: [
              // Drag handle + Title
              const SizedBox(height: 10),
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.18),
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 14),
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 20),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    'Edit Profile',
                    style: TextStyle(
                      color: _textPrimary,
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 12),
              // Error banner
              if (_saveError != null)
                Container(
                  margin: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: _danger.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: _danger.withValues(alpha: 0.4)),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.error_outline, color: _danger, size: 16),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          _saveError!,
                          style: const TextStyle(color: _danger, fontSize: 13),
                        ),
                      ),
                    ],
                  ),
                ),
              // Scrollable form
              Expanded(
                child: ListView(
                  controller: _listCtrl,
                  padding: EdgeInsets.fromLTRB(
                    16,
                    0,
                    16,
                    bottomInset > 0 ? bottomInset : 12,
                  ),
                  children: [
                    _buildField(
                      label: 'Display Name',
                      hint: 'Your full name',
                      controller: _displayNameCtrl,
                      maxLength: 30,
                    ),
                    const SizedBox(height: 14),
                    _buildUsernameField(),
                    const SizedBox(height: 14),
                    _buildBioField(),
                    const SizedBox(height: 14),
                    _buildGenderField(),
                    const SizedBox(height: 14),
                    _buildBirthdateField(),
                    const SizedBox(height: 14),
                    _buildLocationField(),
                    const SizedBox(height: 14),
                    _buildWorkplaceField(),
                    const SizedBox(height: 8),
                  ],
                ),
              ),
              // Bottom action bar (sticky)
              Container(
                decoration: const BoxDecoration(
                  border: Border(top: BorderSide(color: Color(0xFF1E2D48))),
                ),
                padding: EdgeInsets.fromLTRB(
                  16,
                  12,
                  16,
                  MediaQuery.of(context).padding.bottom + 12,
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: _OutlineButton(
                        label: 'Cancel',
                        onTap: _saving
                            ? null
                            : () => Navigator.of(context).pop(),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _FillButton(
                        label: 'Save',
                        loading: _saving,
                        onTap: (_saving || _checkingUsername) ? null : _save,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  // -- Field helpers ----------------------------------------------------------

  Widget _fieldLabel(String label, {String? counter}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: const TextStyle(
              color: _textSecondary,
              fontSize: 12,
              fontWeight: FontWeight.w500,
            ),
          ),
          if (counter != null)
            Text(
              counter,
              style: TextStyle(
                color: _textSecondary.withValues(alpha: 0.6),
                fontSize: 11,
              ),
            ),
        ],
      ),
    );
  }

  InputDecoration _baseDecoration({
    String? hint,
    Widget? suffix,
    Color? borderColor,
  }) {
    final bc = borderColor ?? _border;
    return InputDecoration(
      hintText: hint,
      hintStyle: TextStyle(color: _textSecondary.withValues(alpha: 0.5)),
      filled: true,
      fillColor: _surface,
      suffixIcon: suffix,
      isDense: true,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: BorderSide(color: bc),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: BorderSide(color: bc == _danger ? _danger : _accent),
      ),
    );
  }

  Widget _buildField({
    required String label,
    required String hint,
    required TextEditingController controller,
    int maxLength = 100,
    int maxLines = 1,
    void Function(String)? onChanged,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _fieldLabel(label),
        TextField(
          controller: controller,
          maxLength: maxLength,
          maxLines: maxLines,
          onChanged: onChanged,
          style: const TextStyle(color: _textPrimary, fontSize: 14),
          decoration: _baseDecoration(hint: hint).copyWith(
            counterStyle: TextStyle(
              color: _textSecondary.withValues(alpha: 0.6),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildUsernameField() {
    Widget? suffix;
    if (_checkingUsername) {
      suffix = const Padding(
        padding: EdgeInsets.all(12),
        child: SizedBox(
          width: 16,
          height: 16,
          child: CircularProgressIndicator(
            strokeWidth: 2,
            color: Color(0xFF4AA3E4),
          ),
        ),
      );
    } else if (_usernameAvailable == true) {
      suffix = const Padding(
        padding: EdgeInsets.all(12),
        child: Icon(Icons.check_circle_rounded, color: Colors.green, size: 18),
      );
    } else if (_usernameAvailable == false) {
      suffix = const Padding(
        padding: EdgeInsets.all(12),
        child: Icon(Icons.cancel_rounded, color: Color(0xFFE53935), size: 18),
      );
    }

    final borderColor = _usernameAvailable == false
        ? _danger
        : _usernameAvailable == true
        ? Colors.green
        : _border;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _fieldLabel('Username'),
        TextField(
          controller: _usernameCtrl,
          maxLength: 30,
          onChanged: _onUsernameChanged,
          style: const TextStyle(color: _textPrimary, fontSize: 14),
          decoration:
              _baseDecoration(
                hint: 'e.g. john_doe',
                suffix: suffix,
                borderColor: borderColor,
              ).copyWith(
                counterStyle: TextStyle(
                  color: _textSecondary.withValues(alpha: 0.6),
                ),
              ),
        ),
        if (_usernameError != null)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(
              _usernameError!,
              style: const TextStyle(color: _danger, fontSize: 11, height: 1.4),
            ),
          ),
      ],
    );
  }

  Widget _buildBioField() {
    final bioLen = _bioCtrl.text.length;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _fieldLabel('Bio', counter: '${_bioCtrl.text.length}/300'),
        TextField(
          controller: _bioCtrl,
          maxLines: 4,
          onChanged: (_) => setState(() {}),
          style: const TextStyle(color: _textPrimary, fontSize: 14),
          decoration: _baseDecoration(
            hint: 'Tell people a little about yourself...',
            borderColor: bioLen > 300 ? _danger : null,
          ),
        ),
      ],
    );
  }

  Widget _buildGenderField() {
    String displayLabel = '';
    if (_gender != null) {
      displayLabel = _kGenderOptions
          .firstWhere((g) => g.$1 == _gender, orElse: () => ('', _gender!))
          .$2;
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _fieldLabel('Gender'),
        GestureDetector(
          onTap: _showGenderPicker,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
            decoration: BoxDecoration(
              color: _surface,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: _border),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    displayLabel.isEmpty ? 'Select gender' : displayLabel,
                    style: TextStyle(
                      color: displayLabel.isEmpty
                          ? _textSecondary.withValues(alpha: 0.5)
                          : _textPrimary,
                      fontSize: 14,
                    ),
                  ),
                ),
                Icon(
                  Icons.keyboard_arrow_down_rounded,
                  color: _textSecondary.withValues(alpha: 0.6),
                  size: 20,
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildBirthdateField() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _fieldLabel('Birthday'),
        GestureDetector(
          onTap: _pickBirthdate,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
            decoration: BoxDecoration(
              color: _surface,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: _border),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    _birthdate != null
                        ? _formatBirthdate(_birthdate!)
                        : 'Select birthday',
                    style: TextStyle(
                      color: _birthdate != null
                          ? _textPrimary
                          : _textSecondary.withValues(alpha: 0.5),
                      fontSize: 14,
                    ),
                  ),
                ),
                Icon(
                  Icons.calendar_today_outlined,
                  color: _textSecondary.withValues(alpha: 0.6),
                  size: 16,
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildLocationField() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _fieldLabel('Location'),
        TextField(
          controller: _locationCtrl,
          maxLength: 200,
          style: const TextStyle(color: _textPrimary, fontSize: 14),
          onChanged: _onLocationChanged,
          decoration:
              _baseDecoration(
                hint: 'Where are you based?',
                suffix: _locationLoading
                    ? const Padding(
                        padding: EdgeInsets.all(12),
                        child: SizedBox(
                          width: 14,
                          height: 14,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Color(0xFF4AA3E4),
                          ),
                        ),
                      )
                    : null,
              ).copyWith(
                counterStyle: TextStyle(
                  color: _textSecondary.withValues(alpha: 0.6),
                ),
              ),
        ),
        if (_locationOpen && _locationSuggestions.isNotEmpty)
          _SuggestionList(
            children: _locationSuggestions
                .map(
                  (s) => _SuggestionTile(
                    title: s.label,
                    subtitle: null,
                    icon: Icons.location_on_outlined,
                    onTap: () => _selectLocation(s),
                  ),
                )
                .toList(),
          ),
      ],
    );
  }

  Widget _buildWorkplaceField() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _fieldLabel('Workplace'),
        TextField(
          controller: _workplaceCtrl,
          maxLength: 100,
          style: const TextStyle(color: _textPrimary, fontSize: 14),
          onChanged: _onWorkplaceChanged,
          decoration:
              _baseDecoration(
                hint: 'Company or employer',
                suffix: _workplaceLoading
                    ? const Padding(
                        padding: EdgeInsets.all(12),
                        child: SizedBox(
                          width: 14,
                          height: 14,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Color(0xFF4AA3E4),
                          ),
                        ),
                      )
                    : null,
              ).copyWith(
                counterStyle: TextStyle(
                  color: _textSecondary.withValues(alpha: 0.6),
                ),
              ),
        ),
        if (_workplaceOpen && _workplaceSuggestions.isNotEmpty)
          _SuggestionList(
            children: _workplaceSuggestions
                .map(
                  (c) => _SuggestionTile(
                    title: c.name,
                    subtitle:
                        '${c.memberCount} member${c.memberCount == 1 ? "" : "s"}',
                    icon: Icons.business_center_outlined,
                    onTap: () => _selectWorkplace(c),
                  ),
                )
                .toList(),
          ),
      ],
    );
  }
}

// -- Suggestion widgets -------------------------------------------------------

class _SuggestionList extends StatelessWidget {
  const _SuggestionList({required this.children});
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(top: 2),
      decoration: BoxDecoration(
        color: const Color(0xFF1A2740),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: const Color(0xFF1E2D48)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.3),
            blurRadius: 8,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: Column(children: children),
      ),
    );
  }
}

class _SuggestionTile extends StatelessWidget {
  const _SuggestionTile({
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.onTap,
  });
  final String title;
  final String? subtitle;
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        child: Row(
          children: [
            Icon(icon, size: 16, color: const Color(0xFF4AA3E4)),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      color: Color(0xFFD0D8EE),
                      fontSize: 13,
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  if (subtitle != null)
                    Text(
                      subtitle!,
                      style: const TextStyle(
                        color: Color(0xFF7A8BB0),
                        fontSize: 11,
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// -- Bottom bar buttons -------------------------------------------------------

class _OutlineButton extends StatelessWidget {
  const _OutlineButton({required this.label, required this.onTap});
  final String label;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 13),
        decoration: BoxDecoration(
          color: Colors.transparent,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: const Color(0xFF1E2D48)),
        ),
        alignment: Alignment.center,
        child: Text(
          label,
          style: TextStyle(
            color: onTap == null
                ? const Color(0xFF4A5568)
                : const Color(0xFFD0D8EE),
            fontSize: 14,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
    );
  }
}

class _FillButton extends StatelessWidget {
  const _FillButton({
    required this.label,
    required this.onTap,
    this.loading = false,
  });
  final String label;
  final VoidCallback? onTap;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 13),
        decoration: BoxDecoration(
          color: onTap == null
              ? const Color(0xFF1E3A6E)
              : const Color(0xFF2563EB),
          borderRadius: BorderRadius.circular(8),
        ),
        alignment: Alignment.center,
        child: loading
            ? const SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: Colors.white,
                ),
              )
            : Text(
                label,
                style: TextStyle(
                  color: onTap == null ? const Color(0xFF7A8BB0) : Colors.white,
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                ),
              ),
      ),
    );
  }
}
