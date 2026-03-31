import { getRequestConfig } from "next-intl/server";
import { resolveLocale } from "./lib/i18n/locales";

export default getRequestConfig(async ({ locale }) => {
  const resolvedLocale = resolveLocale(locale);
  return {
    locale: resolvedLocale,
    messages: (await import(`./messages/${resolvedLocale}.json`)).default,
  };
});
