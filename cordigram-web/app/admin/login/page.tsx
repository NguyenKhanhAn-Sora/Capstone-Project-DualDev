"use client";

import Link from "next/link";
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

      router.replace("/admin/dashboard");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.brandPanel}>
          <div className={styles.brandHeader}>
            <div className={styles.logoWrap}>
              <Image
                src="/logo.png"
                alt="Cordigram"
                width={52}
                height={52}
                className={styles.logo}
                priority
              />
            </div>
            <div>
              <p className={styles.brandEyebrow}>Admin Console</p>
              <h1 className={styles.brandTitle}>Cordigram Control Room</h1>
              <p className={styles.brandSubtitle}>
                Manage safety, moderation, and platform health with clarity and
                speed.
              </p>
            </div>
          </div>
          <div className={styles.brandStats}>
            <div className={styles.statCard}>
              <span className={styles.statLabel}>Access Level</span>
              <strong className={styles.statValue}>Restricted</strong>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statLabel}>Audit</span>
              <strong className={styles.statValue}>Enabled</strong>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statLabel}>Status</span>
              <strong className={styles.statValue}>Operational</strong>
            </div>
          </div>
          <div className={styles.brandFootnote}>
            For internal staff only. All actions are logged and monitored.
          </div>
        </section>

        <section className={styles.formPanel}>
          <div className={styles.formCard}>
            <div className={styles.formHeader}>
              <p className={styles.formBadge}>Secure Login</p>
              <h2 className={styles.formTitle}>Sign in to Admin</h2>
              <p className={styles.formSubtitle}>
                Use your staff credentials to continue.
              </p>
            </div>

            <form className={styles.form} onSubmit={handleSubmit}>
              <label className={styles.field}>
                <span className={styles.label}>Work Email</span>
                <input
                  type="email"
                  placeholder="admin@cordigram.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className={styles.input}
                  autoComplete="email"
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
                />
              </label>

              {error ? <div className={styles.error}>{error}</div> : null}

              <div className={styles.row}>
                <Link href="/login" className={styles.link}>
                  Staff password reset
                </Link>
              </div>

              <button
                type="submit"
                className={styles.primaryButton}
                disabled={!canSubmit || loading}
              >
                {loading ? "Signing in..." : "Continue to Admin"}
              </button>

              <div className={styles.meta}>
                <span>Need access?</span>
                <Link href="/" className={styles.link}>
                  Contact super admin
                </Link>
              </div>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}
