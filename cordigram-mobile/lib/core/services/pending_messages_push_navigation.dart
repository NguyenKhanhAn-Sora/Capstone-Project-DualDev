class PendingMessagesPushNavigation {
  PendingMessagesPushNavigation._();

  static Map<String, dynamic>? _pending;

  static void set(Map<String, dynamic> data) {
    _pending = Map<String, dynamic>.from(data);
  }

  static Map<String, dynamic>? take() {
    final value = _pending;
    _pending = null;
    return value;
  }
}
