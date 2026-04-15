import { formatDistanceToNow } from "date-fns";
import type { Locale } from "date-fns";
import { enUS, ja, vi, zhCN } from "date-fns/locale";

const localeByLanguage: Record<string, Locale> = {
  vi,
  en: enUS,
  ja,
  zh: zhCN,
};

const normalizeLanguage = (language?: string | null): string => {
  if (!language) return "en";
  return language.toLowerCase().split("-")[0] || "en";
};

export const getDateFnsLocale = (language?: string | null): Locale => {
  const normalized = normalizeLanguage(language);
  return localeByLanguage[normalized] ?? enUS;
};

export const formatRelativeTime = (
  value: string | number | Date,
  language?: string | null,
  options?: { addSuffix?: boolean },
): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return formatDistanceToNow(date, {
    addSuffix: options?.addSuffix ?? true,
    locale: getDateFnsLocale(language),
  });
};
