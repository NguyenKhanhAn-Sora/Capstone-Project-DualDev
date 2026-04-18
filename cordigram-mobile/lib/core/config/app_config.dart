class AppConfig {
  const AppConfig._();

  static const _rawBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://cordigram-api.onrender.com',
  );

  static final apiBaseUrl = _rawBaseUrl.replaceAll(RegExp(r'[/\\]+$'), '');

  static const _rawWebBaseUrl = String.fromEnvironment(
    'WEB_BASE_URL',
    defaultValue: 'http://localhost:3000',
  );

  static final webBaseUrl = _rawWebBaseUrl.replaceAll(RegExp(r'[/\\]+$'), '');
}
