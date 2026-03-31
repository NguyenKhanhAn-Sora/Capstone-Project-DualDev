class AppConfig {
  const AppConfig._();

  // Use --dart-define=API_BASE_URL=... when running the app.
  static const apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:9999',
  );
}
