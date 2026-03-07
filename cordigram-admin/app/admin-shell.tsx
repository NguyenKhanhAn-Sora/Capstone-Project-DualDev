"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getApiBaseUrl } from "@/lib/api";
import styles from "./admin-shell.module.css";

type NavItem = {
  href: string;
  label: string;
  icon: "dashboard" | "report" | "resolved" | "moderation";
  matcher: (pathname: string) => boolean;
};

function NavIcon({ icon }: { icon: NavItem["icon"] }) {
  if (icon === "dashboard") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z" fill="currentColor" />
      </svg>
    );
  }

  if (icon === "report") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 4h9l3 3v13H6z" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M15 4v4h4" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M9 12h6M9 16h6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  if (icon === "resolved") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M8 12.5l2.6 2.6L16 9.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="5" width="16" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M10 9l5 3-5 3z" fill="currentColor" />
    </svg>
  );
}

const NAV_ITEMS: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: "dashboard",
    matcher: (pathname) => pathname === "/dashboard",
  },
  {
    href: "/report",
    label: "Report Center",
    icon: "report",
    matcher: (pathname) => pathname === "/report" || pathname.startsWith("/report/review/"),
  },
  {
    href: "/report/resolved",
    label: "Resolved Reports",
    icon: "resolved",
    matcher: (pathname) => pathname === "/report/resolved",
  },
  {
    href: "/moderation",
    label: "Auto Moderation",
    icon: "moderation",
    matcher: (pathname) => pathname === "/moderation" || pathname.startsWith("/moderation/"),
  },
];

export default function AdminShell({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname() || "";
  const router = useRouter();
  const [signOutConfirmOpen, setSignOutConfirmOpen] = useState(false);
  const [signOutSubmitting, setSignOutSubmitting] = useState(false);

  const isLoginRoute = pathname === "/login" || pathname.startsWith("/login/");
  const isRootRoute = pathname === "/";

  useEffect(() => {
    if (!signOutConfirmOpen || typeof window === "undefined") return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !signOutSubmitting) {
        setSignOutConfirmOpen(false);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [signOutConfirmOpen, signOutSubmitting]);

  const handleSignOut = async () => {
    if (signOutSubmitting) return;
    setSignOutSubmitting(true);
    try {
      await fetch(`${getApiBaseUrl()}/auth/admin/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch (_err) {}

    if (typeof window !== "undefined") {
      localStorage.removeItem("adminAccessToken");
      localStorage.removeItem("adminRoles");
    }

    setSignOutConfirmOpen(false);
    router.replace("/login");
  };

  if (isLoginRoute || isRootRoute) {
    return <>{children}</>;
  }

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <span className={styles.brandMark}>C</span>
          <div>
            <p className={styles.brandTitle}>Cordigram Admin</p>
          </div>
        </div>
        <nav className={styles.nav} aria-label="Admin navigation">
          {NAV_ITEMS.map((item) => {
            const active = item.matcher(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.navItem} ${active ? styles.navItemActive : ""}`}
              >
                <span className={styles.navIcon}>
                  <NavIcon icon={item.icon} />
                </span>
                <span className={styles.navText}>
                  <span className={styles.navLabel}>{item.label}</span>
                </span>
              </Link>
            );
          })}
        </nav>

        <div className={styles.footer}>
          <button
            type="button"
            className={styles.signOutButton}
            onClick={() => setSignOutConfirmOpen(true)}
          >
            <span className={styles.signOutIcon} aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path
                  d="M10 4H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                />
                <path
                  d="M14 8l4 4-4 4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M18 12H9"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      <main className={styles.content}>{children}</main>

      {signOutConfirmOpen ? (
        <div
          className={styles.signOutOverlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="signout-dialog-title"
          onClick={() => {
            if (!signOutSubmitting) {
              setSignOutConfirmOpen(false);
            }
          }}
        >
          <div
            className={styles.signOutDialog}
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className={styles.signOutDialogTitle} id="signout-dialog-title">
              Confirm sign out
            </h2>
            <p className={styles.signOutDialogText}>
              You will be returned to the login screen and must sign in again to continue.
            </p>
            <div className={styles.signOutDialogActions}>
              <button
                type="button"
                className={styles.signOutCancelButton}
                onClick={() => setSignOutConfirmOpen(false)}
                disabled={signOutSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.signOutConfirmButton}
                onClick={handleSignOut}
                disabled={signOutSubmitting}
              >
                {signOutSubmitting ? "Signing out..." : "Sign out"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
