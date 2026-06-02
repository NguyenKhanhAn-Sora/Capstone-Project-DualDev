"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../login/login.module.css";
import { requestPasswordReset, resetPassword, verifyResetOtp } from "@/lib/api";
import { useLanguage } from "@/component/language-provider";

const EyeIcon = ({ open }: { open: boolean }) => (
  <svg aria-hidden width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12s4.5-7 10-7 10 7 10 7-4.5 7-10 7S2 12 2 12Z" />
    <circle cx="12" cy="12" r="3.5" />
    {!open && <line x1="4" y1="4" x2="20" y2="20" />}
  </svg>
);

const STEPS = ["Email", "Verify OTP", "New password"] as const;

export default function ForgotPasswordPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const [step, setStep] = useState<"email" | "otp" | "reset">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [newPasswordBlurred, setNewPasswordBlurred] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const stepIndex = step === "email" ? 0 : step === "otp" ? 1 : 2;

  const canSendEmail = useMemo(() => !!email.trim() && !loading, [email, loading]);
  const canVerifyOtp = useMemo(() => otp.length === 6 && !loading, [otp, loading]);

  const passwordRules = useMemo(
    () => [
      { key: "len",   label: t("settingsPage.privacy.password.errors.passwordTooShort"), met: newPassword.trim().length >= 8 },
      { key: "upper", label: t("settingsPage.privacy.password.errors.passwordNoUpper"),  met: /[A-Z]/.test(newPassword) },
      { key: "lower", label: t("settingsPage.privacy.password.errors.passwordNoLower"),  met: /[a-z]/.test(newPassword) },
      { key: "num",   label: t("settingsPage.privacy.password.errors.passwordNoNumber"), met: /\d/.test(newPassword) },
    ],
    [newPassword, t],
  );
  const allRulesMet = passwordRules.every((r) => r.met);

  const canReset = useMemo(
    () => !!newPassword.trim() && allRulesMet && newPassword === confirmPassword && !loading,
    [newPassword, allRulesMet, confirmPassword, loading],
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
      setError((err as { message?: string })?.message || "Unable to send OTP, please try again.");
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
      setError((err as { message?: string })?.message || "Invalid OTP, please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (event: FormEvent) => {
    event.preventDefault();
    if (!allRulesMet) { setNewPasswordBlurred(true); return; }
    if (!canReset) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      await resetPassword({ email: email.trim(), otp: otp.trim(), newPassword: newPassword.trim() });
      setMessage("Password updated. Redirecting to login...");
      setTimeout(() => router.push("/login"), 1200);
    } catch (err) {
      setError((err as { message?: string })?.message || "Password reset failed, please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={styles["page-transition"]}
      style={{
        minHeight: "100dvh",
        background: "linear-gradient(145deg, #1d3a5c 0%, #1e3560 55%, #2a3a72 100%)",
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
        overflow: "hidden",
      }}
    >
      {/* Galaxy radial overlays */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: `
          radial-gradient(ellipse at 18% 30%, rgba(74,159,212,0.40) 0%, transparent 50%),
          radial-gradient(ellipse at 80% 70%, rgba(91,106,220,0.28) 0%, transparent 48%),
          radial-gradient(ellipse at 55% 8%,  rgba(99,179,237,0.16) 0%, transparent 38%)
        `,
      }} />

      {/* Brand */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 24, zIndex: 1 }}>
        <img src="/logo.png" alt="Cordigram" width={64} height={64} style={{ borderRadius: 16 }} />
        <span style={{ marginTop: 8, color: "#fff", fontWeight: 800, fontSize: 13, letterSpacing: "0.18em" }}>CORDIGRAM</span>
      </div>

      {/* Card */}
      <div style={{
        position: "relative", zIndex: 1,
        width: "100%", maxWidth: 460,
        background: "#ffffff",
        borderRadius: 24,
        boxShadow: "0 32px 80px rgba(10,25,60,0.38), 0 8px 24px rgba(10,25,60,0.18)",
        padding: "32px 32px 28px",
      }}>
        {/* Step indicator */}
        <div style={{ display: "flex", alignItems: "center", marginBottom: 28 }}>
          {STEPS.map((label, idx) => (
            <div key={label} style={{ display: "contents" }}>
              {idx > 0 && (
                <div style={{
                  flex: 1, height: 2, borderRadius: 2,
                  background: idx <= stepIndex ? "linear-gradient(90deg, #3470a2, #9aacef)" : "#e2e8f0",
                  transition: "background 300ms ease",
                }} />
              )}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, flexShrink: 0 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: "50%",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, fontWeight: 700,
                  background: idx < stepIndex ? "linear-gradient(135deg,#559ac2,#3470a2)" : idx === stepIndex ? "#fff" : "#f1f5f9",
                  color: idx < stepIndex ? "#fff" : idx === stepIndex ? "#3470a2" : "#94a3b8",
                  border: idx === stepIndex ? "2px solid #3470a2" : "2px solid transparent",
                  boxShadow: idx === stepIndex ? "0 0 0 4px rgba(52,112,162,0.12)" : "none",
                  transition: "all 300ms ease",
                }}>
                  {idx < stepIndex ? (
                    <svg width={13} height={13} viewBox="0 0 14 14" fill="none">
                      <polyline points="2,7 5.5,10.5 12,3.5" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : idx + 1}
                </div>
                <span style={{ fontSize: 10, fontWeight: 600, color: idx === stepIndex ? "#3470a2" : "#94a3b8", whiteSpace: "nowrap" }}>
                  {label}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Step: Email */}
        {step === "email" && (
          <form onSubmit={handleSendEmail} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <h2 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 800, color: "#0f172a" }}>Forgot password?</h2>
              <p style={{ margin: 0, fontSize: 13, color: "#64748b", lineHeight: 1.55 }}>
                Enter your email and we'll send you a verification code.
              </p>
            </div>
            <input
              className={styles["overlay-input"]}
              style={{ width: "100%" }}
              type="email"
              placeholder="Your email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              autoFocus
            />
            {error && <p className={styles["overlay-error"]}>{error}</p>}
            <button type="submit" className={styles["overlay-button"]} style={{ width: "100%", marginTop: 4 }} disabled={!canSendEmail}>
              {loading ? "Sending…" : "Send OTP"}
            </button>
          </form>
        )}

        {/* Step: OTP */}
        {step === "otp" && (
          <form onSubmit={handleVerifyOtp} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div>
              <h2 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 800, color: "#0f172a" }}>Verify your email</h2>
              <p style={{ margin: 0, fontSize: 13, color: "#64748b", lineHeight: 1.55 }}>
                Enter the 6-digit code sent to{" "}
                <span style={{ fontWeight: 700, color: "#1e293b" }}>{email}</span>
              </p>
            </div>

            {/* 6-box OTP */}
            <div style={{ position: "relative", display: "flex", gap: 10, justifyContent: "center" }}>
              {[0, 1, 2, 3, 4, 5].map((i) => {
                const filled = i < otp.length;
                const active = i === otp.length;
                return (
                  <div
                    key={i}
                    style={{
                      width: 52, height: 60,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      borderRadius: 14,
                      fontSize: 24, fontWeight: 800,
                      userSelect: "none",
                      transition: "all 150ms ease",
                      background: filled ? "#fff" : active ? "#f0f7ff" : "#f8fbff",
                      border: filled
                        ? "2px solid #3470A2"
                        : active
                        ? "2px solid #3470A2"
                        : "2px solid #D7E5F2",
                      color: "#0f172a",
                      boxShadow: filled ? "0 0 0 3px rgba(52,112,162,0.10)" : active ? "0 0 0 4px rgba(52,112,162,0.14)" : "none",
                    }}
                  >
                    {filled ? (
                      otp[i]
                    ) : active ? (
                      <span style={{ width: 2, height: 22, background: "#3470A2", borderRadius: 2, animation: "blink 1s step-end infinite" }} />
                    ) : (
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#C8D8EA" }} />
                    )}
                  </div>
                );
              })}
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ""))}
                autoFocus
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "text" }}
                aria-label="Enter OTP code"
              />
            </div>

            {error && <p className={styles["overlay-error"]} style={{ textAlign: "center", margin: 0 }}>{error}</p>}
            {message && <p className={styles["overlay-sub"]} style={{ textAlign: "center", margin: 0 }}>{message}</p>}

            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                className={styles["confirm-cancel"]}
                style={{ flex: 1, fontSize: 14 }}
                onClick={() => { setStep("email"); setOtp(""); setMessage(null); setError(null); }}
              >
                Change email
              </button>
              <button
                type="submit"
                className={styles["overlay-button"]}
                style={{ flex: 2 }}
                disabled={!canVerifyOtp}
              >
                {loading ? "Verifying…" : "Verify OTP"}
              </button>
            </div>
          </form>
        )}

        {/* Step: Reset password */}
        {step === "reset" && (
          <form onSubmit={handleResetPassword} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <h2 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 800, color: "#0f172a" }}>Set new password</h2>
              <p style={{ margin: 0, fontSize: 13, color: "#64748b", lineHeight: 1.55 }}>
                Create a strong password for your account.
              </p>
            </div>

            <div>
              <div className={styles.passwordField}>
                <input
                  className={`${styles["overlay-input"]} ${styles.passwordInput}${newPasswordBlurred && !allRulesMet ? ` ${styles.inputError}` : ""}`}
                  style={{ width: "100%" }}
                  type={showNewPassword ? "text" : "password"}
                  placeholder="New password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  onBlur={() => { if (newPassword) setNewPasswordBlurred(true); }}
                  autoComplete="new-password"
                  autoFocus
                />
                <button type="button" className={styles.passwordToggle} onClick={() => setShowNewPassword((p) => !p)} aria-label={showNewPassword ? "Hide" : "Show"}>
                  <EyeIcon open={showNewPassword} />
                </button>
              </div>
              {(newPassword.length > 0 || newPasswordBlurred) && (
                <div className={styles.pwdRules} style={{ marginTop: 8 }}>
                  {passwordRules.map((rule) => (
                    <div key={rule.key} className={`${styles.pwdRule} ${rule.met ? styles.pwdRuleMet : newPasswordBlurred ? styles.pwdRuleError : ""}`}>
                      <div className={`${styles.pwdRuleIcon} ${rule.met ? styles.pwdRuleIconMet : newPasswordBlurred ? styles.pwdRuleIconError : ""}`}>
                        {rule.met && (
                          <svg width={10} height={10} viewBox="0 0 12 12" fill="none">
                            <polyline points="2,7 5,10 10,3" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                      <span>{rule.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className={styles.passwordField}>
              <input
                className={`${styles["overlay-input"]} ${styles.passwordInput}`}
                style={{ width: "100%" }}
                type={showConfirmPassword ? "text" : "password"}
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
              <button type="button" className={styles.passwordToggle} onClick={() => setShowConfirmPassword((p) => !p)} aria-label={showConfirmPassword ? "Hide" : "Show"}>
                <EyeIcon open={showConfirmPassword} />
              </button>
            </div>

            {confirmPassword && newPassword !== confirmPassword && (
              <p className={styles["overlay-error"]}>{t("settingsPage.privacy.password.errors.passwordMismatch")}</p>
            )}
            {error && <p className={styles["overlay-error"]}>{error}</p>}
            {message && <p className={styles["overlay-sub"]}>{message}</p>}

            <button type="submit" className={styles["overlay-button"]} style={{ width: "100%", marginTop: 4 }} disabled={!canReset}>
              {loading ? "Updating…" : "Change password"}
            </button>
          </form>
        )}
      </div>

      {/* Back to login */}
      <button
        type="button"
        className={styles["link-button"]}
        onClick={() => router.push("/login")}
        style={{ marginTop: 20, zIndex: 1, color: "rgba(255,255,255,0.75)" }}
      >
        ← Back to login
      </button>

      <style>{`@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }`}</style>
    </div>
  );
}
