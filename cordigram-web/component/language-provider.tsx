"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchUserSettings, updateUserSettings } from "@/lib/api";

import vi from "@/locales/vi.json";
import en from "@/locales/en.json";
import ja from "@/locales/ja.json";
import zh from "@/locales/zh.json";

export type LanguageCode = "vi" | "en" | "ja" | "zh";

/** BCP 47 locale for `toLocaleString` / `toLocaleDateString` */
export function localeTagForLanguage(code: LanguageCode): string {
  switch (code) {
    case "vi":
      return "vi-VN";
    case "ja":
      return "ja-JP";
    case "zh":
      return "zh-CN";
    default:
      return "en-US";
  }
}

type LanguageContextValue = {
  language: LanguageCode;
  setLanguage: (locale: LanguageCode) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const LanguageContext = createContext<LanguageContextValue | undefined>(
  undefined,
);

const COOKIE_NAME = "NEXT_LOCALE";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
/** Đồng bộ với cài đặt tài khoản khi cookie NEXT_LOCALE lệch hoặc thiếu (ví dụ mở tab mới). */
const STORAGE_KEY_LANGUAGE = "cordigram-language";

type Dict = Record<string, unknown>;

const DICTS: Record<LanguageCode, Dict> = {
  vi: vi as Dict,
  en: en as Dict,
  ja: ja as Dict,
  zh: zh as Dict,
};

function getByPath(obj: Dict, path: string): unknown {
  const parts = path.split(".").filter(Boolean);
  let cur: unknown = obj;
  for (const p of parts) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function formatVars(
  template: string,
  vars?: Record<string, string | number>,
): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_m, k: string) =>
    Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : `{${k}}`,
  );
}

const readCookieLocale = (): LanguageCode | null => {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`));
  if (!match) return null;
  const value = decodeURIComponent(match.split("=")[1] || "");
  return value === "vi" || value === "en" || value === "ja" || value === "zh"
    ? value
    : null;
};

const writeCookieLocale = (locale: LanguageCode) => {
  if (typeof document === "undefined") return;
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(
    locale,
  )}; path=/; max-age=${COOKIE_MAX_AGE}`;
};

const readStoredLocale = (): LanguageCode | null => {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY_LANGUAGE);
    if (v === "vi" || v === "en" || v === "ja" || v === "zh") return v;
  } catch {
    /* ignore */
  }
  return null;
};

const persistLocaleEverywhere = (locale: LanguageCode) => {
  writeCookieLocale(locale);
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY_LANGUAGE, locale);
  } catch {
    /* ignore */
  }
};

/** Cookie (SSR) ưu tiên; localStorage là bản sao khi đổi ngôn ngữ trong cài đặt. */
const pickInitialLocale = (): LanguageCode =>
  readCookieLocale() ?? readStoredLocale() ?? "vi";

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [language, setLanguageState] = useState<LanguageCode>(() =>
    pickInitialLocale(),
  );

  useEffect(() => {
    persistLocaleEverywhere(language);
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
        const next =
          res.language === "vi" ||
          res.language === "en" ||
          res.language === "ja" ||
          res.language === "zh"
            ? res.language
            : null;
        if (!next) return;
        setLanguageState((prev) => {
          if (prev === next) return prev;
          persistLocaleEverywhere(next);
          queueMicrotask(() => router.refresh());
          return next;
        });
      } catch (_err) {
        // ignore
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const setLanguage = (locale: LanguageCode) => {
    if (locale === language) return;
    setLanguageState(locale);
    persistLocaleEverywhere(locale);
    router.refresh();

    const token =
      typeof window !== "undefined"
        ? window.localStorage.getItem("accessToken")
        : null;
    if (!token) return;

    void updateUserSettings({ token, language: locale as any }).catch(
      () => undefined,
    );
  };

  const t = useMemo(() => {
    const dict = DICTS[language] ?? DICTS.vi;
    return (key: string, vars?: Record<string, string | number>) => {
      const hit = getByPath(dict, key);
      if (typeof hit === "string") return formatVars(hit, vars);
      // fallback to vi, then key
      const fallback = getByPath(DICTS.vi, key);
      if (typeof fallback === "string") return formatVars(fallback, vars);
      return key;
    };
  }, [language]);

  const value = useMemo(
    () => ({ language, setLanguage, t }),
    [language, t],
  );

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
