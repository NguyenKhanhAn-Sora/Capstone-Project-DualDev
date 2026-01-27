"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../login/login.module.css";
import {
  apiFetch,
  requestPasswordReset,
  resetPassword,
  verifyResetOtp,
  fetchCurrentProfile,
} from "@/lib/api";
import { setStoredAccessToken } from "@/lib/auth";

const RECENT_ACCOUNTS_KEY = "recentAccounts";
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const EyeIcon = ({ open }: { open: boolean }) => (
  <svg
    aria-hidden
    width={20}
    height={20}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M2 12s4.5-7 10-7 10 7 10 7-4.5 7-10 7S2 12 2 12Z" />
    <circle cx="12" cy="12" r="3.5" />
    {!open && <line x1="4" y1="4" x2="20" y2="20" />}
  </svg>
);

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "otp" | "reset">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const canSendEmail = useMemo(
    () => !!email.trim() && !loading,
    [email, loading],
  );

  const canVerifyOtp = useMemo(() => !!otp.trim() && !loading, [otp, loading]);

  const canReset = useMemo(
    () =>
      !!newPassword.trim() &&
      newPassword === confirmPassword &&
      newPassword.length >= 8 &&
      !loading,
    [newPassword, confirmPassword, loading],
  );

  const handleSendEmail = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSendEmail) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      await requestPasswordReset(email.trim());
      setStep("otp");
      setMessage("OTP sent. Please check your inbox.");
    } catch (err) {
      const apiErr = err as { message?: string };
      setError(apiErr?.message || "Không gửi được OTP, thử lại.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (event: FormEvent) => {
    event.preventDefault();
    if (!canVerifyOtp) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      await verifyResetOtp({ email: email.trim(), otp: otp.trim() });
      setStep("reset");
      setMessage("OTP verified. Set your new password.");
    } catch (err) {
      const apiErr = err as { message?: string };
      setError(apiErr?.message || "OTP không hợp lệ, thử lại.");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (event: FormEvent) => {
    event.preventDefault();
    if (!canReset) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      await resetPassword({
        email: email.trim(),
        otp: otp.trim(),
        newPassword: newPassword.trim(),
      });
      setMessage("Password updated. Signing you in...");

      try {
        const loginRes = await apiFetch<{ accessToken: string }>({
          path: "/auth/login",
          method: "POST",
          body: JSON.stringify({
            email: email.trim().toLowerCase(),
            password: newPassword.trim(),
          }),
          credentials: "include",
        });
        setStoredAccessToken(loginRes.accessToken);

        // đồng bộ recent account để màn login hiển thị đúng
        try {
          const profile = await fetchCurrentProfile({
            token: loginRes.accessToken,
          });
          const normalizedEmail = email.trim().toLowerCase();
          if (
            emailRegex.test(normalizedEmail) &&
            typeof window !== "undefined"
          ) {
            const raw = window.localStorage.getItem(RECENT_ACCOUNTS_KEY);
            const parsed = raw ? (JSON.parse(raw) as any[]) : [];
            const filtered = Array.isArray(parsed)
              ? parsed.filter((item) => item?.email !== normalizedEmail)
              : [];
            const next = [
              {
                email: normalizedEmail,
                username: profile.username,
                displayName: profile.displayName,
                avatarUrl: profile.avatarUrl,
                lastUsed: Date.now(),
              },
              ...filtered,
            ].slice(0, 6);
            window.localStorage.setItem(
              RECENT_ACCOUNTS_KEY,
              JSON.stringify(next),
            );
          }
        } catch (_err) {
          // ignore recent-account update failure
        }
        setTimeout(() => router.push("/"), 300);
      } catch (_err) {
        setMessage("Password updated. Please sign in again.");
        setTimeout(() => router.push("/login"), 500);
      }
    } catch (err) {
      const apiErr = err as { message?: string };
      setError(apiErr?.message || "Password reset failed, please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`${styles.page} ${styles["page-transition"]}`}>
      <div className="min-h-screen flex items-center justify-center p-4">
        <div
          className={styles["hero-card"]}
          style={{ maxWidth: 440, width: "100%" }}
        >
          <h2 className={styles["forgot-title"]}>Forgot password</h2>
          <p className={styles["forgot-subtitle"]}>
            Enter your account email and verify the code
          </p>

          {step === "email" && (
            <form onSubmit={handleSendEmail} className={styles["overlay-form"]}>
              <input
                className={styles["overlay-input"]}
                type="email"
                placeholder="Your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
              {error && <p className={styles["overlay-error"]}>{error}</p>}
              {message && <p className={styles["overlay-sub"]}>{message}</p>}
              <button
                type="submit"
                className={styles["overlay-button"]}
                disabled={!canSendEmail}
              >
                {loading ? "Sending..." : "Send OTP"}
              </button>
            </form>
          )}

          {step === "otp" && (
            <form onSubmit={handleVerifyOtp} className={styles["overlay-form"]}>
              <input
                className={styles["overlay-input"]}
                type="text"
                placeholder="Enter OTP"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                autoComplete="one-time-code"
              />
              {error && <p className={styles["overlay-error"]}>{error}</p>}
              {message && <p className={styles["overlay-sub"]}>{message}</p>}
              <div className={styles["confirm-actions"]}>
                <button
                  type="button"
                  className={styles["confirm-cancel"]}
                  onClick={() => {
                    setStep("email");
                    setOtp("");
                    setMessage(null);
                    setError(null);
                  }}
                >
                  Use another email
                </button>
                <button
                  type="submit"
                  className={styles["overlay-button"]}
                  disabled={!canVerifyOtp}
                >
                  {loading ? "Checking..." : "Verify OTP"}
                </button>
              </div>
            </form>
          )}

          {step === "reset" && (
            <form
              onSubmit={handleResetPassword}
              className={styles["overlay-form"]}
            >
              <div className={styles.passwordField}>
                <input
                  className={`${styles["overlay-input"]} ${styles.passwordInput}`}
                  type={showNewPassword ? "text" : "password"}
                  placeholder="New password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className={styles.passwordToggle}
                  onClick={() => setShowNewPassword((prev) => !prev)}
                  aria-label={
                    showNewPassword ? "Hide password" : "Show password"
                  }
                >
                  <EyeIcon open={showNewPassword} />
                </button>
              </div>
              <div className={styles.passwordField}>
                <input
                  className={`${styles["overlay-input"]} ${styles.passwordInput}`}
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className={styles.passwordToggle}
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  aria-label={
                    showConfirmPassword ? "Hide password" : "Show password"
                  }
                >
                  <EyeIcon open={showConfirmPassword} />
                </button>
              </div>
              {error && <p className={styles["overlay-error"]}>{error}</p>}
              {message && <p className={styles["overlay-sub"]}>{message}</p>}
              <button
                type="submit"
                className={styles["overlay-button"]}
                disabled={!canReset}
              >
                {loading ? "Updating..." : "Confirm"}
              </button>
            </form>
          )}

          <button
            type="button"
            className={styles["link-button"]}
            onClick={() => router.push("/login")}
            style={{ marginTop: 12 }}
          >
            Back to login
          </button>
        </div>
      </div>
    </div>
  );
}
