/// Discovery / community activation thresholds.
/// Must stay aligned with [cordigram-backend/src/servers/server-discovery.constants.ts]
/// and [cordigram-web/components/ServerAccessSection/ServerAccessSection.tsx].
class ServerAccessConstants {
  ServerAccessConstants._();

  static const int discoveryMinEvaluateMembers = 2;
  static const int discoveryMinMembers = 3;
  static const int discoveryMinAgeMinutes = 3;
}
