/// Thresholds for Community Discovery / server access UI.
/// Must stay aligned with [cordigram-web/components/ServerAccessSection/ServerAccessSection.tsx].
class ServerAccessConstants {
  ServerAccessConstants._();

  static const int discoveryMinEvaluateMembers = 2;
  static const int discoveryMinMembers = 1000;
  static const int discoveryMinAgeWeeks = 8;
}
