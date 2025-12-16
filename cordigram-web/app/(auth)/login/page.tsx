"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import styles from "./login.module.css";
import { apiFetch, ApiError, getApiBaseUrl } from "@/lib/api";
import { useRedirectIfAuthed } from "@/hooks/use-require-auth";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const canRender = useRedirectIfAuthed();

  const handleGoogleLogin = () => {
    window.location.href = `${getApiBaseUrl()}/auth/google`;
  };

  const isDisabled = useMemo(
    () => !email.trim() || !password.trim() || loading,
    [email, password, loading]
  );

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
      });

      if (typeof window !== "undefined") {
        localStorage.setItem("accessToken", result.accessToken);
      }

      router.push("/");
    } catch (err) {
      const apiErr = err as ApiError | undefined;
      setError(apiErr?.message || "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (!canRender) return null;


  return (
    <div className={`${styles.page} ${styles["page-transition"]}`}>
      <div className="min-h-screen">
        <div className="grid min-h-screen w-full grid-cols-1 lg:grid-cols-2">
          <div className={styles["hero-panel"]}>
            <div className={styles["hero-tilt"]}>
              <div className={styles["hero-card"]}>
                <h2 className="mt-4 text-[38px] font-semibold leading-tight text-white">
                  Welcome Back!
                </h2>
                <p className="mt-3 text-[16px] leading-6 text-slate-100/90">
                  Continue conversations, update channels, and collaborate with
                  your team. Everything stays synced, secure, and ready.
                </p>

                <div className={styles["hero-chip-row"]}>
                  <div className={styles["hero-chip"]}>
                    <span className={styles["hero-chip-dot"]} /> Secure sessions
                  </div>
                  <div className={styles["hero-chip"]}>
                    <span className={styles["hero-chip-dot"]} /> Instant
                    notifications
                  </div>
                  <div className={styles["hero-chip"]}>
                    <span className={styles["hero-chip-dot"]} /> Multi-platform
                    ready
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

          <div className={styles["login-right"]}>
            <div className="w-full max-w-[420px] rounded-2xl border border-[#e5edf5] bg-white p-10 shadow-xl">
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
    </div>
  );
}
