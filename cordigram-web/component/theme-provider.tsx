"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { fetchUserSettings, updateUserSettings } from "@/lib/api";

export type ThemeMode = "light" | "dark";

type ThemeContextValue = {
  theme: ThemeMode;
  setTheme: (mode: ThemeMode) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const STORAGE_KEY = "ui-theme";

function applyTheme(mode: ThemeMode) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = mode;
  //cho thẻ html và body gán giá trị dataset.theme => data-theme = mode
  document.body.dataset.theme = mode;
}

function pickInitialTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  // Khi mới vào trình duyệt thì hệ thống chưa thể lấy được theme ngay nên để mặc định là light
  //Do đó sẽ có một khoảng nhấp nháy hiển thị theme light trước khi hiển thị đúng theme của user chọn

  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;

  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  return prefersDark ? "dark" : "light";
  //Trường hợp user mới chưa chọn theme nào thì hệ thống sẽ lấy theo cài đặt của hệ điều hành
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(() => pickInitialTheme());

  useEffect(() => {
    applyTheme(theme);
    if (typeof window !== "undefined") {
      //xét typeof window để xem có đang chạy trong môi trường browser hay không
      localStorage.setItem(STORAGE_KEY, theme);
    }
  }, [theme]);

  useEffect(() => {
    let cancelled = false;
    const token =
      typeof window !== "undefined"
        ? localStorage.getItem("accessToken")
        : null;
    if (!token) return;

    const load = async () => {
      try {
        const res = await fetchUserSettings({ token });
        if (!cancelled && (res.theme === "light" || res.theme === "dark")) {
          setThemeState(res.theme);
        }
      } catch (_err) {}
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const setTheme = (mode: ThemeMode) => {
    setThemeState(mode);

    const token =
      typeof window !== "undefined"
        ? localStorage.getItem("accessToken")
        : null;
    if (!token) return;

    void updateUserSettings({ token, theme: mode }).catch(() => undefined);
  };

  const toggleTheme = () => setTheme(theme === "light" ? "dark" : "light");

  const value = useMemo(() => ({ theme, setTheme, toggleTheme }), [theme]);

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}
 

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
