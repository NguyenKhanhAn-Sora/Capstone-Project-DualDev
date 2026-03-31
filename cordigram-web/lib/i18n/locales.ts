export const DEFAULT_LOCALE = "en";

export const SUPPORTED_LOCALES = [
  "en",
  "vi",
  "es",
  "fr",
  "de",
  "pt-BR",
  "ru",
  "ja",
  "ko",
  "zh",
] as const;

export type LanguageCode = (typeof SUPPORTED_LOCALES)[number];

export const LOCALE_LABELS: Record<LanguageCode, string> = {
  en: "English",
  vi: "Vietnamese",
  es: "Spanish",
  fr: "French",
  de: "German",
  "pt-BR": "Portuguese (Brazil)",
  ru: "Russian",
  ja: "Japanese",
  ko: "Korean",
  zh: "Chinese",
};

const SUPPORTED_LOCALE_SET = new Set<string>(SUPPORTED_LOCALES);

export const isSupportedLocale = (value?: string | null): value is LanguageCode =>
  !!value && SUPPORTED_LOCALE_SET.has(value);

export const resolveLocale = (value?: string | null): LanguageCode =>
  isSupportedLocale(value) ? value : DEFAULT_LOCALE;
