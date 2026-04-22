class AppConfig {
  const AppConfig._();

  /// Filled from root `.env` in `main()` (see `flutter_dotenv`), same keys as web.
  static String _giphyFromEnvFile = '';
  static String _webBaseUrlFromEnvFile = '';

  static void setGiphyApiKeyFromRuntime(String value) {
    _giphyFromEnvFile = value.trim();
  }

  static void setWebBaseUrlFromRuntime(String value) {
    _webBaseUrlFromEnvFile = value.trim();
  }

  static const _rawBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://api.cordigram.com',
  );

  static final apiBaseUrl = _rawBaseUrl.replaceAll(RegExp(r'[/\\]+$'), '');

  static const _rawWebBaseUrl = String.fromEnvironment(
    'WEB_BASE_URL',
    defaultValue: 'https://cordigram.com',
  );

  static String get webBaseUrl {
    if (_webBaseUrlFromEnvFile.isNotEmpty) {
      return _webBaseUrlFromEnvFile.replaceAll(RegExp(r'[/\\]+$'), '');
    }
    return _rawWebBaseUrl.replaceAll(RegExp(r'[/\\]+$'), '');
  }

  /// Giphy SDK key — same resolution order as cordigram-web:
  /// 1) `--dart-define=GIPHY_API_KEY=...`
  /// 2) `--dart-define=NEXT_PUBLIC_GIPHY_API_KEY=...` (Next.js name)
  /// 3) Root `.env` asset: `NEXT_PUBLIC_GIPHY_API_KEY` or `GIPHY_API_KEY` (loaded in `main()`).
  static String get giphyApiKey {
    const fromDefine = String.fromEnvironment('GIPHY_API_KEY', defaultValue: '');
    if (fromDefine.isNotEmpty) return fromDefine;
    const fromDefineNext = String.fromEnvironment(
      'NEXT_PUBLIC_GIPHY_API_KEY',
      defaultValue: '',
    );
    if (fromDefineNext.isNotEmpty) return fromDefineNext;
    return _giphyFromEnvFile;
  }
}
