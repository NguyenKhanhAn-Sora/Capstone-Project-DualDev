class AppConfig {
  const AppConfig._();

  static const _rawBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:9999',
  );

  // Strip any accidental trailing slash or backslash that can appear when the
  // value is supplied via --dart-define on Windows (e.g. API_BASE_URL=http://localhost:9999\).
  static final apiBaseUrl = _rawBaseUrl.replaceAll(RegExp(r'[/\\]+$'), '');

  static const _rawWebBaseUrl = String.fromEnvironment(
    'WEB_BASE_URL',
    defaultValue: 'http://localhost:3000',
  );

  static final webBaseUrl = _rawWebBaseUrl.replaceAll(RegExp(r'[/\\]+$'), '');
}
