"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { fetchUserSettings, updateUserSettings } from "@/lib/api";
import { useRouter } from "next/navigation";
import {
  DEFAULT_LOCALE,
  type LanguageCode,
  isSupportedLocale,
} from "@/lib/i18n/locales";

type LanguageContextValue = {
  language: LanguageCode;
  setLanguage: (locale: LanguageCode) => void;
};

const LanguageContext = createContext<LanguageContextValue | undefined>(
  undefined,
);

const COOKIE_NAME = "NEXT_LOCALE";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

const readCookieLocale = (): LanguageCode | null => {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`));
  if (!match) return null;
  const value = decodeURIComponent(match.split("=")[1] || "");
  return isSupportedLocale(value) ? value : null;
};

const writeCookieLocale = (locale: LanguageCode) => {
  if (typeof document === "undefined") return;
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(
    locale,
  )}; path=/; max-age=${COOKIE_MAX_AGE}`;
};

const pickInitialLocale = (): LanguageCode => readCookieLocale() ?? DEFAULT_LOCALE;

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [language, setLanguageState] = useState<LanguageCode>(() =>
    pickInitialLocale(),
  );

  useEffect(() => {
    writeCookieLocale(language);
  }, [language]);

  useEffect(() => {
    let cancelled = false;
    const token =
      typeof window !== "undefined"
        ? window.localStorage.getItem("accessToken")
        : null;
    if (!token) return;

    const load = async () => {
      try {
        const res = await fetchUserSettings({ token });
        if (cancelled) return;
        if (isSupportedLocale(res.language)) {
          setLanguageState(res.language);
          if (res.language !== language) {
            writeCookieLocale(res.language);
            router.refresh();
          }
        }
      } catch (_err) {
        // ignore
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [language, router]);

  const setLanguage = (locale: LanguageCode) => {
    if (locale === language) return;
    setLanguageState(locale);
    writeCookieLocale(locale);
    router.refresh();

    const token =
      typeof window !== "undefined"
        ? window.localStorage.getItem("accessToken")
        : null;
    if (!token) return;

    void updateUserSettings({ token, language: locale }).catch(() => undefined);
  };

  const value = useMemo(() => ({ language, setLanguage }), [language]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
