export const SUPPORTED_LANGUAGES = [
  'en',
  'vi',
  'es',
  'fr',
  'de',
  'pt-BR',
  'ru',
  'ja',
  'ko',
  'zh',
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
