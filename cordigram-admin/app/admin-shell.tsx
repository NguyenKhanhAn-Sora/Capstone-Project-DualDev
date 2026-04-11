"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getApiBaseUrl } from "@/lib/api";
import styles from "./admin-shell.module.css";

type NavItem = {
  href: string;
  label: string;
  icon: "dashboard" | "report" | "resolved" | "moderation" | "problem" | "content" | "ads" | "audit" | "broadcast" | "verification";
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

  if (icon === "problem") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6.5 4h8.8L20 8.7V18a2 2 0 0 1-2 2H6.5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M15.3 4v4.5H20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M12.25 9.5c-1.45 0-2.25.82-2.25 1.95" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="12" cy="15.9" r="1" fill="currentColor" />
      </svg>
    );
  }

  if (icon === "content") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5z" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M8 9h8M8 12h8M8 15h5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  if (icon === "ads") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4" y="6" width="16" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M8 10h8M8 14h5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  if (icon === "audit") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 4h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M9 9h6M9 13h6M9 17h4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  if (icon === "broadcast") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 14V8a2 2 0 0 1 2-2h2l6-3v18l-6-3H6a2 2 0 0 1-2-2Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M17 8.5a4.2 4.2 0 0 1 0 7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  if (icon === "verification") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m12 2.8 2.7 5.4 6 .9-4.3 4.2 1 6-5.4-2.8-5.4 2.8 1-6L3.3 9.1l6-.9Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
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
  {
    href: "/report-problem",
    label: "Report Problem",
    icon: "problem",
    matcher: (pathname) => pathname === "/report-problem" || pathname.startsWith("/report-problem/"),
  },
  {
    href: "/content-moderation",
    label: "Content Moderation",
    icon: "content",
    matcher: (pathname) => pathname === "/content-moderation" || pathname.startsWith("/content-moderation/"),
  },
  {
    href: "/ads-management",
    label: "Ads Management",
    icon: "ads",
    matcher: (pathname) => pathname === "/ads-management" || pathname.startsWith("/ads-management/"),
  },
  {
    href: "/audit",
    label: "Audit Log",
    icon: "audit",
    matcher: (pathname) => pathname === "/audit" || pathname.startsWith("/audit/"),
  },
  {
    href: "/broadcast-notice",
    label: "Broadcast Notice",
    icon: "broadcast",
    matcher: (pathname) => pathname === "/broadcast-notice" || pathname.startsWith("/broadcast-notice/"),
  },
  {
    href: "/creator-verification",
    label: "Creator Verification",
    icon: "verification",
    matcher: (pathname) => pathname === "/creator-verification" || pathname.startsWith("/creator-verification/"),
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
