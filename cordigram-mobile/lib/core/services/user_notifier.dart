import 'package:flutter/foundation.dart';

/// Global notifiers for current-user session data.
/// Screens displaying the logged-in user's avatar should listen here
/// so they update immediately after the user changes their profile picture.
class UserNotifier {
  UserNotifier._();

  static final ValueNotifier<String?> avatarUrl = ValueNotifier<String?>(null);
}
