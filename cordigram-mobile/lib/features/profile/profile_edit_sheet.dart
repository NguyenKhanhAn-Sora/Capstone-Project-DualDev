import 'dart:async';
import 'package:flutter/material.dart';
import 'models/profile_detail.dart';
import 'services/profile_service.dart';

/// Regex used for username validation (mirrors the web).
final _usernameRegex = RegExp(r'^[a-z0-9_.]{3,30}$');

/// Returns true if [name] is a valid display name (letters + spaces, 3-30).
bool _isValidDisplayName(String name) {
  final trimmed = name.trim();
  if (trimmed.length < 3 || trimmed.length > 30) return false;
  return RegExp(r"^[a-zA-ZÀ-ÖØ-öø-ÿ ]+$").hasMatch(trimmed);
}

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

class _ProfileEditSheet extends StatefulWidget {
  const _ProfileEditSheet({required this.profile, required this.onSaved});

  final ProfileDetail profile;
  final void Function(ProfileDetail updated) onSaved;

  @override
  State<_ProfileEditSheet> createState() => _ProfileEditSheetState();
}

class _ProfileEditSheetState extends State<_ProfileEditSheet> {
  // ── Controllers ──────────────────────────────────────────────────────────
  late final TextEditingController _displayNameCtrl;
  late final TextEditingController _usernameCtrl;
  late final TextEditingController _bioCtrl;
  late final TextEditingController _locationCtrl;
  late final TextEditingController _workplaceCtrl;

  // ── State ─────────────────────────────────────────────────────────────────
  String? _gender;
  DateTime? _birthdate;
  bool _saving = false;
  String? _saveError;

  // Username availability
  bool _checkingUsername = false;
  bool? _usernameAvailable;
  String? _usernameError;
  Timer? _usernameDebounce;

  // ── Colors ────────────────────────────────────────────────────────────────
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
    super.dispose();
  }

  DateTime? _tryParseDate(String s) {
    try {
      return DateTime.parse(s);
    } catch (_) {
      return null;
    }
  }

  // ── Username check ────────────────────────────────────────────────────────

  void _onUsernameChanged(String value) {
    _usernameDebounce?.cancel();
    final trimmed = value.trim();

    // If unchanged from original skip check
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
            '3-30 characters: lowercase letters, numbers, dots, underscores.';
        _checkingUsername = false;
      });
      return;
    }

    setState(() {
      _checkingUsername = true;
      _usernameAvailable = null;
      _usernameError = null;
    });

    _usernameDebounce = Timer(const Duration(milliseconds: 600), () async {
      try {
        final available = await ProfileService.checkUsername(
          trimmed,
          excludeUserId: widget.profile.userId,
        );
        if (!mounted) return;
        setState(() {
          _checkingUsername = false;
          _usernameAvailable = available;
          _usernameError = available ? null : 'Username is already taken.';
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

  // ── Date picker ───────────────────────────────────────────────────────────

  Future<void> _pickBirthdate() async {
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

  // ── Validation ─────────────────────────────────────────────────────────────

  String? _validateForm() {
    final displayName = _displayNameCtrl.text.trim();
    final username = _usernameCtrl.text.trim();
    final bio = _bioCtrl.text;

    if (!_isValidDisplayName(displayName)) {
      return 'Display name must be 3-30 characters and contain only letters.';
    }
    if (!_usernameRegex.hasMatch(username)) {
      return 'Username: 3-30 chars, lowercase letters, numbers, dots, underscores.';
    }
    if (_usernameAvailable == false) {
      return 'Username is already taken.';
    }
    if (bio.length > 300) {
      return 'Bio cannot exceed 300 characters.';
    }
    if (_birthdate != null && _birthdate!.isAfter(DateTime.now())) {
      return 'Birthday cannot be in the future.';
    }
    return null;
  }

  // ── Save ───────────────────────────────────────────────────────────────────

  Future<void> _save() async {
    final validationError = _validateForm();
    if (validationError != null) {
      setState(() => _saveError = validationError);
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

      final workplace = _workplaceCtrl.text.trim();
      if (workplace.isNotEmpty) {
        payload['workplaceName'] = workplace;
      } else {
        payload['workplaceName'] = null;
        payload['workplaceCompanyId'] = null;
      }

      if (_gender != null) payload['gender'] = _gender;
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

  // ── Build ────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.85,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      builder: (_, ctrl) => Container(
        decoration: const BoxDecoration(
          color: _bg,
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: Column(
          children: [
            // Drag handle + title bar
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 10, 8, 0),
              child: Row(
                children: [
                  Center(
                    child: Container(
                      width: 36,
                      height: 4,
                      margin: const EdgeInsets.only(right: 100),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.18),
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  ),
                  const Spacer(),
                  TextButton(
                    onPressed: _saving
                        ? null
                        : () => Navigator.of(context).pop(),
                    child: const Text(
                      'Cancel',
                      style: TextStyle(color: Color(0xFF7A8BB0), fontSize: 14),
                    ),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text(
                    'Edit Profile',
                    style: TextStyle(
                      color: _textPrimary,
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  TextButton(
                    onPressed: (_saving || _checkingUsername) ? null : _save,
                    child: _saving
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Color(0xFF4AA3E4),
                            ),
                          )
                        : const Text(
                            'Save',
                            style: TextStyle(
                              color: Color(0xFF4AA3E4),
                              fontSize: 14,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                  ),
                ],
              ),
            ),
            // Error
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
            // Form fields
            Expanded(
              child: ListView(
                controller: ctrl,
                padding: EdgeInsets.fromLTRB(16, 0, 16, bottomInset + 24),
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
                  _buildField(
                    label: 'Location',
                    hint: 'Where are you based?',
                    controller: _locationCtrl,
                    maxLength: 100,
                  ),
                  const SizedBox(height: 14),
                  _buildField(
                    label: 'Workplace',
                    hint: 'Company or employer',
                    controller: _workplaceCtrl,
                    maxLength: 100,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ── Field builders ────────────────────────────────────────────────────────

  Widget _buildField({
    required String label,
    required String hint,
    required TextEditingController controller,
    int maxLength = 100,
    int maxLines = 1,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: const TextStyle(
            color: _textSecondary,
            fontSize: 12,
            fontWeight: FontWeight.w500,
          ),
        ),
        const SizedBox(height: 6),
        TextField(
          controller: controller,
          maxLength: maxLength,
          maxLines: maxLines,
          style: const TextStyle(color: _textPrimary, fontSize: 14),
          decoration: InputDecoration(
            hintText: hint,
            hintStyle: TextStyle(color: _textSecondary.withValues(alpha: 0.5)),
            filled: true,
            fillColor: _surface,
            counterStyle: TextStyle(
              color: _textSecondary.withValues(alpha: 0.6),
            ),
            contentPadding: const EdgeInsets.symmetric(
              horizontal: 14,
              vertical: 12,
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8),
              borderSide: const BorderSide(color: _border),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8),
              borderSide: const BorderSide(color: _accent),
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

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Username',
          style: TextStyle(
            color: _textSecondary,
            fontSize: 12,
            fontWeight: FontWeight.w500,
          ),
        ),
        const SizedBox(height: 6),
        TextField(
          controller: _usernameCtrl,
          maxLength: 30,
          onChanged: _onUsernameChanged,
          style: const TextStyle(color: _textPrimary, fontSize: 14),
          decoration: InputDecoration(
            hintText: 'e.g. john_doe',
            hintStyle: TextStyle(color: _textSecondary.withValues(alpha: 0.5)),
            filled: true,
            fillColor: _surface,
            suffixIcon: suffix,
            counterStyle: TextStyle(
              color: _textSecondary.withValues(alpha: 0.6),
            ),
            contentPadding: const EdgeInsets.symmetric(
              horizontal: 14,
              vertical: 12,
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8),
              borderSide: BorderSide(
                color: _usernameAvailable == false
                    ? _danger
                    : _usernameAvailable == true
                    ? Colors.green
                    : _border,
              ),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8),
              borderSide: BorderSide(
                color: _usernameAvailable == false ? _danger : _accent,
              ),
            ),
          ),
        ),
        if (_usernameError != null)
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(
              _usernameError!,
              style: const TextStyle(color: _danger, fontSize: 11),
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
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text(
              'Bio',
              style: TextStyle(
                color: _textSecondary,
                fontSize: 12,
                fontWeight: FontWeight.w500,
              ),
            ),
            Text(
              '${_bioCtrl.text.length}/300',
              style: TextStyle(
                color: bioLen > 300
                    ? _danger
                    : _textSecondary.withValues(alpha: 0.6),
                fontSize: 11,
              ),
            ),
          ],
        ),
        const SizedBox(height: 6),
        TextField(
          controller: _bioCtrl,
          maxLines: 4,
          onChanged: (_) => setState(() {}),
          style: const TextStyle(color: _textPrimary, fontSize: 14),
          decoration: InputDecoration(
            hintText: 'Tell people a little about yourself...',
            hintStyle: TextStyle(color: _textSecondary.withValues(alpha: 0.5)),
            filled: true,
            fillColor: _surface,
            contentPadding: const EdgeInsets.symmetric(
              horizontal: 14,
              vertical: 12,
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8),
              borderSide: BorderSide(color: bioLen > 300 ? _danger : _border),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8),
              borderSide: BorderSide(color: bioLen > 300 ? _danger : _accent),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildGenderField() {
    const genders = [
      ('male', 'Male'),
      ('female', 'Female'),
      ('other', 'Other'),
      ('prefer_not_to_say', 'Prefer not to say'),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Gender',
          style: TextStyle(
            color: _textSecondary,
            fontSize: 12,
            fontWeight: FontWeight.w500,
          ),
        ),
        const SizedBox(height: 6),
        Container(
          decoration: BoxDecoration(
            color: _surface,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: _border),
          ),
          child: DropdownButtonHideUnderline(
            child: DropdownButton<String?>(
              value: _gender,
              isExpanded: true,
              dropdownColor: const Color(0xFF1A2740),
              iconEnabledColor: _textSecondary,
              padding: const EdgeInsets.symmetric(horizontal: 14),
              hint: Text(
                'Select gender',
                style: TextStyle(
                  color: _textSecondary.withValues(alpha: 0.5),
                  fontSize: 14,
                ),
              ),
              items: [
                DropdownMenuItem<String?>(
                  value: null,
                  child: Text(
                    'Prefer not to say',
                    style: TextStyle(
                      color: _textSecondary.withValues(alpha: 0.6),
                      fontSize: 14,
                    ),
                  ),
                ),
                ...genders.map(
                  (g) => DropdownMenuItem<String?>(
                    value: g.$1,
                    child: Text(
                      g.$2,
                      style: const TextStyle(color: _textPrimary, fontSize: 14),
                    ),
                  ),
                ),
              ],
              onChanged: (v) => setState(() => _gender = v),
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
        const Text(
          'Birthday',
          style: TextStyle(
            color: _textSecondary,
            fontSize: 12,
            fontWeight: FontWeight.w500,
          ),
        ),
        const SizedBox(height: 6),
        GestureDetector(
          onTap: _pickBirthdate,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
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
}
