"use client";

import Image from "next/image";
import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import styles from "./login.module.css";
import { getApiBaseUrl } from "@/lib/api";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [forgotPasswordNotice, setForgotPasswordNotice] = useState(false);

  const canSubmit = useMemo(
    () => email.trim().length > 0 && password.trim().length > 0,
    [email, password],
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit || loading) return;
    setError(null);
    setLoading(true);

    try {
      const response = await fetch(`${getApiBaseUrl()}/auth/admin/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          email: email.trim(),
          password: password.trim(),
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.message || "Login failed");
      }

      if (typeof window !== "undefined") {
        localStorage.setItem("adminAccessToken", payload.accessToken || "");
        localStorage.setItem("adminRoles", JSON.stringify(payload.roles || []));
      }

      router.replace("/dashboard");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <section className={styles.card}>
        <header className={styles.header}>
          <div className={styles.logoWrap}>
            <Image
              src="/logo.png"
              alt="Cordigram"
              width={40}
              height={40}
              className={styles.logo}
              priority
            />
          </div>
          <div>
            <p className={styles.badge}>Admin Portal</p>
            <h1 className={styles.title}>Sign in to Cordigram Admin</h1>
          </div>
        </header>

        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.field}>
            <span className={styles.label}>Email</span>
            <input
              type="email"
              placeholder="admin@cordigram.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={styles.input}
              autoComplete="email"
              autoFocus
              required
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Password</span>
            <input
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={styles.input}
              autoComplete="current-password"
              required
            />
          </label>

          {error ? (
            <div className={styles.error} role="alert">
              {error}
            </div>
          ) : null}

          <div className={styles.row}>
            <button
              type="button"
              className={styles.linkButton}
              onClick={() => setForgotPasswordNotice(true)}
            >
              Forgot password?
            </button>
          </div>

          {forgotPasswordNotice ? (
            <div className={styles.infoNotice} role="status" aria-live="polite">
              For password recovery support, please contact cordigram@gmail.com.
            </div>
          ) : null}

          <button
            type="submit"
            className={styles.primaryButton}
            disabled={!canSubmit || loading}
          >
            {loading ? "Signing in..." : "Continue"}
          </button>
        </form>
      </section>
    </div>
  );
}
