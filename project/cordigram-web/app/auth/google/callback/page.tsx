"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { fetchCurrentProfile, fetchUserSettings } from "@/lib/api";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function decodeJwtEmail(token: string): string | null {
  try {
    const payload = token.split(".")[1];
    const json = JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/"))
    );
    return typeof json?.email === "string" ? json.email : null;
  } catch (_err) {
    return null;
  }
}

export default function GoogleCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const applyThemeInstant = (mode: "light" | "dark") => {
    if (typeof document !== "undefined") {
      document.documentElement.dataset.theme = mode;
      document.body.dataset.theme = mode;
    }
    if (typeof window !== "undefined") {
      window.localStorage.setItem("ui-theme", mode);
    }
  };

  const syncThemeFromServer = async (token: string) => {
    try {
      const res = await fetchUserSettings({ token });
      if (res.theme === "light" || res.theme === "dark") {
        applyThemeInstant(res.theme);
      }
    } catch (_err) {
      // ignore
    }
  };

  const saveRecentAccount = (
    account: {
      email: string;
      username?: string;
      displayName?: string;
      avatarUrl?: string;
    } | null
  ) => {
    if (typeof window === "undefined" || !account?.email) return;
    const normalizedEmail = account.email.trim().toLowerCase();
    if (!emailRegex.test(normalizedEmail)) return;
    const key = "recentAccounts";
    try {
      const raw = window.localStorage.getItem(key);
      const parsed = raw ? (JSON.parse(raw) as any[]) : [];
      const filtered = Array.isArray(parsed)
        ? parsed.filter((item) => item?.email !== normalizedEmail)
        : [];
      const next = [
        {
          ...account,
          email: normalizedEmail,
          lastUsed: Date.now(),
        },
        ...filtered,
      ].slice(0, 5);
      window.localStorage.setItem(key, JSON.stringify(next));
    } catch (_err) {
      // ignore
    }
  };

  useEffect(() => {
    const needsProfile = searchParams.get("needsProfile") === "1";
    const accessToken = searchParams.get("accessToken");
    const signupToken = searchParams.get("signupToken");

    if (accessToken && !needsProfile) {
      localStorage.setItem("accessToken", accessToken);

      const decodedEmail = decodeJwtEmail(accessToken);
      const safeEmail =
        decodedEmail && emailRegex.test(decodedEmail)
          ? decodedEmail.toLowerCase()
          : null;

      fetchCurrentProfile({ token: accessToken })
        .then((profile) => {
          const emailToStore = safeEmail ?? null;
          saveRecentAccount(
            emailToStore
              ? {
                  email: emailToStore,
                  username: profile.username,
                  displayName: profile.displayName,
                  avatarUrl: profile.avatarUrl,
                }
              : null
          );
        })
        .catch(() => {
          saveRecentAccount(safeEmail ? { email: safeEmail } : null);
        })
        .finally(async () => {
          await syncThemeFromServer(accessToken);
          router.replace("/");
        });
      return;
    }

    if (signupToken && needsProfile) {
      const email = decodeJwtEmail(signupToken);
      sessionStorage.setItem("googleSignupToken", signupToken);
      if (email) sessionStorage.setItem("googleSignupEmail", email);
      router.replace("/signup?google=1");
      return;
    }

    router.replace("/login");
  }, [router, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center text-slate-700">
      <div className="text-center space-y-3">
        <p className="text-lg font-semibold">Đang xử lý đăng nhập Google...</p>
        <p className="text-sm text-slate-500">Vui lòng đợi trong giây lát.</p>
      </div>
    </div>
  );
}
