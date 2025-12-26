"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, KeyboardEvent, useEffect, useMemo, useState } from "react";
import styles from "./login.module.css";
import {
  apiFetch,
  ApiError,
  clearRecentAccounts,
  fetchCurrentProfile,
  fetchUserSettings,
  getApiBaseUrl,
  removeRecentAccount,
  RecentAccountResponse,
} from "@/lib/api";
import { useRedirectIfAuthed } from "@/hooks/use-require-auth";
import {
  clearStoredAccessToken,
  getStoredAccessToken,
  isAccessTokenValid,
  refreshSession,
  setStoredAccessToken,
} from "@/lib/auth";

const RECENT_ACCOUNTS_KEY = "recentAccounts";

type RecentAccount = {
  email: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  lastUsed: number;
};

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [recentAccounts, setRecentAccounts] = useState<RecentAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<RecentAccount | null>(
    null
  );
  const [modalPassword, setModalPassword] = useState("");
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalSubmitting, setModalSubmitting] = useState(false);
  const [removingEmail, setRemovingEmail] = useState<string | null>(null);
  const [clearingAll, setClearingAll] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState<RecentAccount | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);

  const canRender = useRedirectIfAuthed();

  useEffect(() => {
    let skipRestore = false;
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("loggedOut") === "1") {
        clearStoredAccessToken();
        setError(null);
        skipRestore = true;
      }
    }

    const loadRecent = () => {
      if (typeof window === "undefined") return [] as RecentAccount[];
      try {
        const raw = window.localStorage.getItem(RECENT_ACCOUNTS_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as RecentAccount[];
        return Array.isArray(parsed)
          ? parsed
              .filter((item) => item?.email && emailRegex.test(item.email))
              .sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0))
          : [];
      } catch (_err) {
        return [];
      }
    };

    setRecentAccounts(loadRecent());

    if (skipRestore) {
      setCheckingSession(false);
      return;
    }

    let active = true;
    const tryRestore = async () => {
      if (!active) return;
      setCheckingSession(true);
      setError(null);

      const existing = getStoredAccessToken();
      if (isAccessTokenValid(existing)) {
        router.replace("/");
        return;
      }

      try {
        await refreshSession();
        router.replace("/");
      } catch (_err) {
        clearStoredAccessToken();
        if (!active) return;
        setCheckingSession(false);
      }
    };

    tryRestore();
    return () => {
      active = false;
    };
  }, [router]);

  const handleGoogleLogin = () => {
    window.location.href = `${getApiBaseUrl()}/auth/google`;
  };

  const isDisabled = useMemo(
    () => !email.trim() || !password.trim() || loading || checkingSession,
    [email, password, loading, checkingSession]
  );

  const saveRecentAccounts = (items: RecentAccount[]) => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(RECENT_ACCOUNTS_KEY, JSON.stringify(items));
  };

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
      // ignore theme load errors
    }
  };

  const upsertRecentAccount = (account: RecentAccount) => {
    const normalizedEmail = account.email.trim().toLowerCase();
    if (!emailRegex.test(normalizedEmail)) return;
    const normalized: RecentAccount = { ...account, email: normalizedEmail };

    setRecentAccounts((prev) => {
      const filtered = prev.filter((item) => item.email !== normalized.email);
      const next = [normalized, ...filtered].slice(0, 5);
      saveRecentAccounts(next);
      return next;
    });
  };

  const normalizeRecentAccountsFromServer = (
    items: RecentAccountResponse[] | undefined
  ): RecentAccount[] => {
    const mapped = (items ?? []).map((item) => ({
      email: item.email.trim().toLowerCase(),
      username: item.username,
      displayName: item.displayName,
      avatarUrl: item.avatarUrl,
      lastUsed: item.lastUsed ? Date.parse(item.lastUsed) : Date.now(),
    }));

    return mapped
      .filter((item) => emailRegex.test(item.email))
      .sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0))
      .slice(0, 5);
  };

  const applyServerRecentAccounts = (payload?: {
    recentAccounts?: RecentAccountResponse[];
  }) => {
    if (!payload?.recentAccounts) return;
    const normalized = normalizeRecentAccountsFromServer(
      payload.recentAccounts
    );
    setRecentAccounts(normalized);
    saveRecentAccounts(normalized);
  };

  const getActiveToken = async (): Promise<string | null> => {
    const stored = getStoredAccessToken();
    if (isAccessTokenValid(stored)) return stored;
    try {
      return await refreshSession();
    } catch (_err) {
      return null;
    }
  };

  const handleAccountSelect = async (account: RecentAccount) => {
    if (clearingAll || removingEmail === account.email) return;
    setPassword("");
    setError(null);
    setCheckingSession(true);
    setSelectedAccount(account);
    setModalPassword("");
    setModalError(null);

    try {
      await refreshSession();
      await syncThemeFromServer(getStoredAccessToken() || "");
      router.replace("/");
    } catch (_err) {
      setCheckingSession(false);
      setModalError(null);
    }
  };

  const handleModalSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedAccount) return;
    setModalError(null);
    setModalSubmitting(true);

    const trimmedEmail = selectedAccount.email.toLowerCase();

    try {
      const result = await apiFetch<{ accessToken: string }>({
        path: "/auth/login",
        method: "POST",
        body: JSON.stringify({ email: trimmedEmail, password: modalPassword }),
        credentials: "include",
        headers:
          typeof navigator !== "undefined"
            ? { "x-device-info": navigator.userAgent }
            : undefined,
      });

      setStoredAccessToken(result.accessToken);

      await syncThemeFromServer(result.accessToken);

      try {
        const profile = await fetchCurrentProfile({
          token: result.accessToken,
        });
        upsertRecentAccount({
          email: trimmedEmail,
          username: profile.username,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
          lastUsed: Date.now(),
        });
      } catch (_err) {
        upsertRecentAccount({ email: trimmedEmail, lastUsed: Date.now() });
      }

      router.replace("/");
    } catch (err) {
      const apiErr = err as ApiError | undefined;
      setModalError(apiErr?.message || "Login failed. Please try again.");
    } finally {
      setModalSubmitting(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const trimmedEmail = email.trim().toLowerCase();
    if (!emailRegex.test(trimmedEmail)) {
      setError("Email format is invalid");
      return;
    }

    setLoading(true);
    try {
      const result = await apiFetch<{ accessToken: string }>({
        path: "/auth/login",
        method: "POST",
        body: JSON.stringify({ email: trimmedEmail, password }),
        credentials: "include",
        headers:
          typeof navigator !== "undefined"
            ? { "x-device-info": navigator.userAgent }
            : undefined,
      });

      if (typeof window !== "undefined") {
        setStoredAccessToken(result.accessToken);

        await syncThemeFromServer(result.accessToken);
      }

      try {
        const profile = await fetchCurrentProfile({
          token: result.accessToken,
        });
        upsertRecentAccount({
          email: trimmedEmail,
          username: profile.username,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
          lastUsed: Date.now(),
        });
      } catch (_err) {
        upsertRecentAccount({
          email: trimmedEmail,
          lastUsed: Date.now(),
        });
      }

      router.push("/");
    } catch (err) {
      const apiErr = err as ApiError | undefined;
      setError(apiErr?.message || "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const removeRecentAccountConfirmed = async (email: string) => {
    if (!email) return;

    const previous = [...recentAccounts];
    const next = previous.filter((item) => item.email !== email);
    setRecentAccounts(next);
    saveRecentAccounts(next);
    setRemovingEmail(email);
    setConfirmEmail(null);

    const token = await getActiveToken();
    if (!token) {
      setRemovingEmail(null);
      return;
    }

    try {
      const payload = await removeRecentAccount({ token, email });
      applyServerRecentAccounts(payload);
    } catch (_err) {
      setRecentAccounts(previous);
      saveRecentAccounts(previous);
    } finally {
      setRemovingEmail(null);
    }
  };

  const clearRecentAccountsConfirmed = async () => {
    if (!recentAccounts.length) return;
    const previous = [...recentAccounts];

    setClearingAll(true);
    setConfirmAll(false);
    setRecentAccounts([]);
    saveRecentAccounts([]);

    const token = await getActiveToken();
    if (!token) {
      setClearingAll(false);
      return;
    }

    try {
      const payload = await clearRecentAccounts({ token });
      applyServerRecentAccounts(payload);
    } catch (_err) {
      setRecentAccounts(previous);
      saveRecentAccounts(previous);
    } finally {
      setClearingAll(false);
    }
  };

  const handleCardKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
    account: RecentAccount
  ) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleAccountSelect(account);
    }
  };

  if (!canRender) return null;

  const hasRecentAccounts = recentAccounts.length > 0;

  return (
    <div className={`${styles.page} ${styles["page-transition"]}`}>
      <div className="min-h-screen">
        <div className="grid min-h-screen w-full grid-cols-1 lg:grid-cols-2">
          {hasRecentAccounts ? (
            <div className={styles["hero-panel"]}>
              <div className={styles["recent-panel"]}>
                <div className={styles["recent-panel-card"]}>
                  <div className={styles["recent-panel-header"]}>
                    <div>
                      <p className={styles["recent-title"]}>Recent accounts</p>
                    </div>
                    <div className={styles["recent-actions"]}>
                      <button
                        type="button"
                        className={styles["recent-delete-all"]}
                        onClick={() => setConfirmAll(true)}
                        disabled={clearingAll || !!removingEmail}
                      >
                        {clearingAll ? "Deleting..." : "Delete all"}
                      </button>
                    </div>
                  </div>
                  <div className={styles["recent-grid"]}>
                    {recentAccounts.map((acct) => {
                      const label =
                        acct.displayName || acct.username || "Account";
                      const initial = label?.charAt(0)?.toUpperCase() || "?";
                      return (
                        <div
                          key={acct.email}
                          className={styles["recent-card"]}
                          role="button"
                          tabIndex={0}
                          onClick={() => handleAccountSelect(acct)}
                          onKeyDown={(event) => handleCardKeyDown(event, acct)}
                          aria-label={`Continue as ${label}`}
                        >
                          <div className={styles["recent-avatar-wrapper"]}>
                            {acct.avatarUrl ? (
                              <img
                                src={acct.avatarUrl}
                                alt={label}
                                className={styles["recent-avatar"]}
                              />
                            ) : (
                              <span
                                className={styles["recent-avatar-fallback"]}
                              >
                                {initial}
                              </span>
                            )}
                          </div>
                          <div className={styles["recent-text"]}>
                            <span className={styles["recent-name"]}>
                              {label}
                            </span>
                          </div>
                          <button
                            type="button"
                            className={styles["recent-remove"]}
                            onClick={(event) => {
                              event.stopPropagation();
                              setConfirmEmail(acct);
                            }}
                            disabled={
                              removingEmail === acct.email || clearingAll
                            }
                            aria-label={`Remove ${label}`}
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className={styles["hero-panel"]}>
              <div className={styles["hero-tilt"]}>
                <div className={styles["hero-card"]}>
                  <h2 className="mt-4 text-[38px] font-semibold leading-tight text-white">
                    Welcome Back!
                  </h2>
                  <p className="mt-3 text-[16px] leading-6 text-slate-100/90">
                    Continue conversations, update channels, and collaborate
                    with your team. Everything stays synced, secure, and ready.
                  </p>

                  <div className={styles["hero-chip-row"]}>
                    <div className={styles["hero-chip"]}>
                      <span className={styles["hero-chip-dot"]} /> Secure
                      sessions
                    </div>
                    <div className={styles["hero-chip"]}>
                      <span className={styles["hero-chip-dot"]} /> Instant
                      notifications
                    </div>
                    <div className={styles["hero-chip"]}>
                      <span className={styles["hero-chip-dot"]} />{" "}
                      Multi-platform ready
                    </div>
                  </div>

                  <div className={styles["hero-badges"]}>
                    <div className={styles["hero-badge"]}>
                      <span className={styles["hero-badge-icon"]}>◆</span>
                      <p>Clear access control for every channel.</p>
                    </div>
                    <div className={styles["hero-badge"]}>
                      <span className={styles["hero-badge-icon"]}>⇆</span>
                      Single sign-on, synced across web and mobile.
                    </div>
                    <div className={styles["hero-badge"]}>
                      <span className={styles["hero-badge-icon"]}>★</span>
                      UI optimized for work and content sharing.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className={styles["login-right"]}>
            <div className="w-full max-w-[420px] rounded-2xl border border-[#e5edf5] bg-white p-10 shadow-xl">
              {checkingSession ? (
                <div className={styles["session-banner"]}>
                  <div className={styles["session-spinner"]} />
                  <div>
                    <p className={styles["session-title"]}>
                      Restoring your session
                    </p>
                    <p className={styles["session-sub"]}>
                      Checking secure cookies and refreshing access.
                    </p>
                  </div>
                </div>
              ) : null}
              <h1 className="text-[32px] font-semibold leading-[1.2] text-slate-900 text-center">
                Login
              </h1>
              <form
                className="mt-[30px] space-y-[20px]"
                onSubmit={handleSubmit}
                noValidate
              >
                <div className="space-y-[6px]">
                  <label className="block text-[13px] font-semibold leading-[1.5] text-slate-700">
                    Email address
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email"
                    autoComplete="email"
                    className="h-11 w-full max-w-[360px] rounded-[10px] border border-[#d7e5f2] bg-white px-3 text-[14px] font-medium text-slate-900 placeholder:text-slate-400 shadow-sm transition focus:outline-none focus-visible:border-[#559AC2] focus-visible:ring-4 focus-visible:ring-[#9AACEF]/45"
                  />
                </div>

                <div className="space-y-[6px]">
                  <label className="block text-[13px] font-semibold leading-[1.5] text-slate-700">
                    Password
                  </label>
                  <input
                    type="password"
                    name="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    className="h-11 w-full max-w-[360px] rounded-[10px] border border-[#d7e5f2] bg-white px-3 text-[14px] font-medium text-slate-900 placeholder:text-slate-400 shadow-sm transition focus:outline-none focus-visible:border-[#559AC2] focus-visible:ring-4 focus-visible:ring-[#9AACEF]/45"
                  />
                  {error ? (
                    <p
                      className="text-[12px] font-medium text-red-600"
                      aria-live="polite"
                    >
                      {error}
                    </p>
                  ) : null}
                </div>

                <button
                  type="submit"
                  disabled={isDisabled}
                  className={`${styles["primary-button"]} mt-[12px] h-11 w-full max-w-[360px] rounded-[10px] text-[13px] font-semibold leading-[1.5] shadow-sm focus:outline-none focus-visible:ring-4 focus-visible:ring-[#9AACEF]/55 disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  {loading ? "Logging in..." : "Log in"}
                </button>

                <div className="mt-[20px] max-w-[360px] text-center text-[14px] font-medium leading-[1.5] text-slate-700">
                  Don't have an account?{" "}
                  <Link
                    href="/signup"
                    className="font-semibold text-[#3470A2] underline decoration-[#559AC2]/60 underline-offset-4 transition hover:brightness-110"
                  >
                    Sign up
                  </Link>
                </div>
              </form>

              <div className="mt-6 space-y-3">
                <div className={styles.divider}>
                  <span className={styles["divider-line"]} />
                  <span className={styles["divider-text"]}>or</span>
                  <span className={styles["divider-line"]} />
                </div>
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  className={styles["oauth-button"]}
                >
                  <span className="">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      x="0px"
                      y="0px"
                      width="30"
                      height="30"
                      viewBox="0 0 48 48"
                    >
                      <path
                        fill="#FFC107"
                        d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"
                      ></path>
                      <path
                        fill="#FF3D00"
                        d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"
                      ></path>
                      <path
                        fill="#4CAF50"
                        d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"
                      ></path>
                      <path
                        fill="#1976D2"
                        d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"
                      ></path>
                    </svg>
                  </span>
                  Sign in with Google
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {selectedAccount ? (
        <div className={styles["overlay"]}>
          <div className={styles["overlay-card"]}>
            <button
              type="button"
              className={styles["overlay-close"]}
              onClick={() => {
                setSelectedAccount(null);
                setModalPassword("");
                setModalError(null);
              }}
              aria-label="Close"
            >
              ×
            </button>
            <div className={styles["overlay-avatar-wrapper"]}>
              {selectedAccount.avatarUrl ? (
                <img
                  src={selectedAccount.avatarUrl}
                  alt={
                    selectedAccount.displayName ||
                    selectedAccount.username ||
                    ""
                  }
                  className={styles["overlay-avatar"]}
                />
              ) : (
                <span className={styles["overlay-avatar-fallback"]}>
                  {(
                    selectedAccount.displayName ||
                    selectedAccount.username ||
                    "?"
                  )
                    .charAt(0)
                    .toUpperCase()}
                </span>
              )}
            </div>
            <p className={styles["overlay-name"]}>
              {selectedAccount.displayName ||
                selectedAccount.username ||
                "Account"}
            </p>

            <form
              className={styles["overlay-form"]}
              onSubmit={handleModalSubmit}
            >
              <input
                type="password"
                autoFocus
                placeholder="Enter your password"
                value={modalPassword}
                onChange={(e) => setModalPassword(e.target.value)}
                className={styles["overlay-input"]}
                autoComplete="current-password"
              />
              {modalError ? (
                <p className={styles["overlay-error"]}>{modalError}</p>
              ) : null}

              <button
                type="submit"
                className={styles["overlay-button"]}
                disabled={!modalPassword.trim() || modalSubmitting}
              >
                {modalSubmitting ? "Signing in..." : "Sign in"}
              </button>
            </form>
          </div>
        </div>
      ) : null}

      {confirmEmail ? (
        <div className={styles["overlay"]}>
          <div className={styles["confirm-card"]}>
            <p className={styles["confirm-title"]}>Remove account?</p>
            <p className={styles["confirm-text"]}>
              {confirmEmail.displayName ||
                confirmEmail.username ||
                confirmEmail.email}
            </p>
            <div className={styles["confirm-actions"]}>
              <button
                type="button"
                className={styles["confirm-cancel"]}
                onClick={() => setConfirmEmail(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles["confirm-danger"]}
                onClick={() => removeRecentAccountConfirmed(confirmEmail.email)}
                disabled={removingEmail === confirmEmail.email || clearingAll}
              >
                {removingEmail === confirmEmail.email
                  ? "Removing..."
                  : "Remove"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmAll ? (
        <div className={styles["overlay"]}>
          <div className={styles["confirm-card"]}>
            <p className={styles["confirm-title"]}>Delete all recent?</p>
            <p className={styles["confirm-text"]}>
              This will clear all saved recent accounts.
            </p>
            <div className={styles["confirm-actions"]}>
              <button
                type="button"
                className={styles["confirm-cancel"]}
                onClick={() => setConfirmAll(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles["confirm-danger"]}
                onClick={clearRecentAccountsConfirmed}
                disabled={clearingAll || !!removingEmail}
              >
                {clearingAll ? "Deleting..." : "Delete all"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
