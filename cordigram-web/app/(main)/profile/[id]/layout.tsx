"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import styles from "../profile.module.css";
import { useRequireAuth } from "@/hooks/use-require-auth";
import {
  fetchProfileDetail,
  blockUser,
  followUser,
  reportUser,
  unfollowUser,
  type ProfileDetailResponse,
} from "@/lib/api";
import { getStoredAccessToken } from "@/lib/auth";
import { ProfileProvider } from "./profile-context";

const compactFormatter = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const formatCount = (value?: number) =>
  compactFormatter.format(Math.max(0, value ?? 0));

const isValidProfileId = (value: string) => /^[a-f0-9]{24}$/i.test(value);

const getUserIdFromToken = (token: string | null): string | undefined => {
  if (!token) return undefined;
  try {
    const parts = token.split(".");
    if (parts.length < 2) return undefined;
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(atob(payload));
    if (json && typeof json.userId === "string") return json.userId;
    if (json && typeof json.sub === "string") return json.sub;
    return undefined;
  } catch (err) {
    console.error("decode token failed", err);
    return undefined;
  }
};

type UserReportCategory = {
  key: "abuse" | "violence" | "misinfo" | "spam" | "privacy" | "other";
  label: string;
  accent: string;
  reasons: Array<{ key: string; label: string }>;
};

const USER_REPORT_GROUPS: UserReportCategory[] = [
  {
    key: "abuse",
    label: "Harassment / Hate",
    accent: "#f59e0b",
    reasons: [
      { key: "harassment", label: "Harassment or bullying" },
      { key: "hate_speech", label: "Hate speech or slurs" },
      { key: "stalking", label: "Stalking or targeted intimidation" },
    ],
  },
  {
    key: "violence",
    label: "Threats / Safety",
    accent: "#ef4444",
    reasons: [
      { key: "threats", label: "Violence or physical threats" },
      { key: "self_harm", label: "Encouraging self-harm" },
      { key: "extremism", label: "Extremism or terrorism" },
    ],
  },
  {
    key: "misinfo",
    label: "Impersonation / Misleading",
    accent: "#22c55e",
    reasons: [
      { key: "impersonation", label: "Pretending to be someone else" },
      { key: "fake_identity", label: "Fake or misleading identity" },
      { key: "deceptive_claims", label: "Deceptive claims or credentials" },
    ],
  },
  {
    key: "spam",
    label: "Spam / Scam",
    accent: "#14b8a6",
    reasons: [
      { key: "spam", label: "Spam or mass mentions" },
      { key: "scam", label: "Scam or fraud" },
      { key: "unauthorized_ads", label: "Unwanted promotions" },
    ],
  },
  {
    key: "privacy",
    label: "Privacy violation",
    accent: "#06b6d4",
    reasons: [
      { key: "doxxing", label: "Sharing private information" },
      { key: "unwanted_contact", label: "Unwanted contact or harassment" },
      {
        key: "nonconsensual_content",
        label: "Non-consensual intimate content",
      },
    ],
  },
  {
    key: "other",
    label: "Other",
    accent: "#94a3b8",
    reasons: [{ key: "other", label: "Other reason" }],
  },
];

const REPORT_MODAL_MS = 200;

export default function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const canRender = useRequireAuth();
  const params = useParams<{ id?: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const profileId = useMemo(() => {
    const raw = Array.isArray(params?.id) ? params.id[0] : params?.id;
    return raw ? decodeURIComponent(raw) : "";
  }, [params]);

  const [profile, setProfile] = useState<ProfileDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [followLoading, setFollowLoading] = useState(false);
  const [viewerId, setViewerId] = useState<string | undefined>();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [blockOpen, setBlockOpen] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [blockError, setBlockError] = useState("");
  const [blockedView, setBlockedView] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportCategory, setReportCategory] = useState<
    UserReportCategory["key"] | null
  >(null);
  const [reportReason, setReportReason] = useState<string | null>(null);
  const [reportNote, setReportNote] = useState("");
  const [reportError, setReportError] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportClosing, setReportClosing] = useState(false);
  const reportHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedReportGroup = useMemo(
    () => USER_REPORT_GROUPS.find((g) => g.key === reportCategory),
    [reportCategory]
  );

  useEffect(() => {
    if (!canRender) return;
    if (!profileId || !isValidProfileId(profileId)) {
      setError("Profile not found");
      setLoading(false);
      return;
    }
    const token = getStoredAccessToken();
    if (!token) {
      setError("Session expired. Please sign in again.");
      setLoading(false);
      return;
    }
    setBlockedView(false);
    setViewerId(getUserIdFromToken(token));

    setLoading(true);
    setError("");
    fetchProfileDetail({ token, id: profileId })
      .then((data) => setProfile(data))
      .catch((err: unknown) => {
        const maybeStatus =
          typeof err === "object" && err && "status" in err
            ? Number((err as { status?: number }).status)
            : undefined;
        const message =
          typeof err === "object" && err && "message" in err
            ? String((err as { message?: string }).message)
            : "Unable to load profile";
        const blockedError =
          maybeStatus === 403 ||
          maybeStatus === 423 ||
          message.toLowerCase().includes("block");
        if (blockedError) {
          setBlockedView(true);
          setError("");
        } else {
          setError(message || "Unable to load profile");
        }
      })
      .finally(() => setLoading(false));
  }, [canRender, profileId]);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (menuRef.current && target && !menuRef.current.contains(target)) {
        setMenuOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [menuOpen]);

  useEffect(() => {
    return () => {
      if (toastTimer.current) {
        clearTimeout(toastTimer.current);
      }
      if (reportHideTimer.current) {
        clearTimeout(reportHideTimer.current);
      }
    };
  }, []);

  const handleFollowToggle = async () => {
    if (!profile || followLoading) return;
    const token = getStoredAccessToken();
    if (!token) {
      setError("Session expired. Please sign in again.");
      return;
    }

    const nextFollow = !profile.isFollowing;
    setFollowLoading(true);
    try {
      if (nextFollow) {
        await followUser({ token, userId: profile.userId });
      } else {
        await unfollowUser({ token, userId: profile.userId });
      }
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              isFollowing: nextFollow,
              stats: {
                ...prev.stats,
                followers: Math.max(
                  0,
                  prev.stats.followers + (nextFollow ? 1 : -1)
                ),
              },
            }
          : prev
      );
    } catch (err) {
      const message =
        typeof err === "object" && err && "message" in err
          ? String((err as { message?: string }).message)
          : "Unable to update follow status";
      setError(message || "Unable to update follow status");
    } finally {
      setFollowLoading(false);
    }
  };

  const handleSettings = () => {
    router.push("/settings");
  };

  const showToast = (message: string) => {
    if (toastTimer.current) {
      clearTimeout(toastTimer.current);
    }
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(""), 2200);
  };

  const handleCopyLink = async () => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const link = origin
      ? `${origin}/profile/${profileId}`
      : `/profile/${profileId}`;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(link);
        showToast("Copied profile link to clipboard");
      } else {
        throw new Error("Clipboard unavailable");
      }
    } catch (err) {
      console.error("copy link failed", err);
      showToast("Unable to copy link");
    } finally {
      setMenuOpen(false);
    }
  };

  const handleShare = () => {
    void handleCopyLink();
  };

  const openBlockModal = () => {
    setMenuOpen(false);
    setBlockError("");
    setBlockOpen(true);
  };

  const closeBlockModal = () => {
    if (blocking) return;
    setBlockOpen(false);
  };

  const confirmBlockUser = async () => {
    if (blocking || !profile) return;
    const token = getStoredAccessToken();
    if (!token) {
      setError("Session expired. Please sign in again.");
      setBlockOpen(false);
      return;
    }
    setBlocking(true);
    setBlockError("");
    try {
      await blockUser({ token, userId: profile.userId });
      showToast(`Đã chặn @${profile.username}`);
      setBlockOpen(false);
      setBlockedView(true);
      setProfile(null);
      router.refresh();
    } catch (err) {
      const message =
        typeof err === "object" && err && "message" in err
          ? String((err as { message?: string }).message)
          : "Không thể chặn người dùng";
      setBlockError(message);
      showToast(message);
    } finally {
      setBlocking(false);
    }
  };

  const openReportModal = () => {
    if (reportHideTimer.current) {
      clearTimeout(reportHideTimer.current);
    }
    if (!profile) {
      setMenuOpen(false);
      return;
    }
    const token = getStoredAccessToken();
    if (!token) {
      setError("Session expired. Please sign in again.");
      setMenuOpen(false);
      return;
    }
    if (viewerId && profile.userId === viewerId) {
      showToast("Bạn không thể báo cáo chính mình");
      setMenuOpen(false);
      return;
    }
    setMenuOpen(false);
    setReportOpen(true);
    setReportClosing(false);
    setReportCategory(null);
    setReportReason(null);
    setReportNote("");
    setReportError("");
    setReportSubmitting(false);
  };

  const closeReportModal = () => {
    if (reportHideTimer.current) {
      clearTimeout(reportHideTimer.current);
    }
    setReportClosing(true);
    reportHideTimer.current = setTimeout(() => {
      setReportOpen(false);
      setReportCategory(null);
      setReportReason(null);
      setReportNote("");
      setReportError("");
      setReportSubmitting(false);
      setReportClosing(false);
    }, REPORT_MODAL_MS);
  };

  const submitReport = async () => {
    if (!profile || !reportCategory || !reportReason) {
      setReportError("Please select a reason");
      return;
    }
    const token = getStoredAccessToken();
    if (!token) {
      setReportError("Session expired. Please sign in again.");
      return;
    }
    setReportSubmitting(true);
    setReportError("");
    try {
      await reportUser({
        token,
        userId: profile.userId,
        category: reportCategory,
        reason: reportReason,
        note: reportNote.trim() || undefined,
      });
      closeReportModal();
      showToast("Report submitted");
    } catch (err) {
      const message =
        typeof err === "object" && err && "message" in err
          ? String((err as { message?: string }).message)
          : "Could not submit report";
      setReportError(message || "Could not submit report");
    } finally {
      setReportSubmitting(false);
    }
  };

  const handleMenuSelect = (key: string) => {
    switch (key) {
      case "block":
        openBlockModal();
        break;
      case "report":
        openReportModal();
        break;
      case "copy-link":
        void handleCopyLink();
        break;
      default:
        setMenuOpen(false);
        break;
    }
  };

  function BlockedProfile({ onHome }: { onHome: () => void }) {
    return (
      <div className={styles.blockedWrap}>
        <div className={styles.blockedIcon} aria-hidden>
          <IconInfo />
        </div>
        <div className={styles.blockedTitle}>Profile is not available</div>
        <div className={styles.blockedText}>
          The link may be broken or the profile may have been removed.
        </div>
        <button type="button" className={styles.blockedButton} onClick={onHome}>
          Go back home
        </button>
      </div>
    );
  }

  const isOwner = profile && viewerId && profile.userId === viewerId;

  const navItems = isOwner
    ? [
        { key: "posts", label: "POSTS", href: `/profile/${profileId}` },
        { key: "reels", label: "REELS", href: `/profile/${profileId}/reels` },
        { key: "saved", label: "SAVED", href: `/profile/${profileId}/saved` },
        {
          key: "repost",
          label: "REPOST",
          href: `/profile/${profileId}/repost`,
        },
      ]
    : [
        { key: "posts", label: "POSTS", href: `/profile/${profileId}` },
        { key: "reels", label: "REELS", href: `/profile/${profileId}/reels` },
        {
          key: "repost",
          label: "REPOST",
          href: `/profile/${profileId}/repost`,
        },
      ];

  const menuItems = [
    { key: "block", label: "Block this user" },
    { key: "report", label: "Report" },
    { key: "copy-link", label: "Copy link" },
  ];

  const activeKey = useMemo(() => {
    if (!pathname) return "posts";
    if (pathname.endsWith("/reels")) return "reels";
    if (pathname.endsWith("/saved")) return "saved";
    if (pathname.endsWith("/repost")) return "repost";
    return "posts";
  }, [pathname]);

  if (!canRender) return null;

  return (
    <div className={styles.page}>
      {blockedView ? (
        <BlockedProfile onHome={() => router.push("/")} />
      ) : (
        <div className={styles.card}>
          {loading ? (
            <ProfileSkeleton />
          ) : error ? (
            <div className={styles.errorBox}>{error}</div>
          ) : profile ? (
            <ProfileProvider value={{ profile, viewerId }}>
              <div className={styles.header}>
                <div className={styles.avatarRing}>
                  <img
                    src={profile.avatarUrl}
                    alt={`${profile.displayName} avatar`}
                    className={styles.avatarImg}
                    loading="lazy"
                  />
                </div>
                <div>
                  <div className={styles.identity}>
                    <h1 className={styles.displayName}>
                      {profile.displayName}
                    </h1>
                    <p className={styles.username}>@{profile.username}</p>
                    {profile.bio ? (
                      <p className={styles.bio}>{profile.bio}</p>
                    ) : null}
                    {profile.location ? (
                      <p className={styles.location}>{profile.location}</p>
                    ) : null}
                  </div>
                  <div className={styles.statsRow}>
                    <StatCard
                      label="Posts"
                      value={formatCount(profile.stats.totalPosts)}
                    />
                    <StatCard
                      label="Followers"
                      value={formatCount(profile.stats.followers)}
                    />
                    <StatCard
                      label="Following"
                      value={formatCount(profile.stats.following)}
                    />
                  </div>
                  <div
                    className={`${styles.actions} ${
                      isOwner ? styles.ownerActions : styles.viewerActions
                    }`}
                  >
                    {isOwner ? (
                      <>
                        <button className={styles.primaryButton} type="button">
                          Edit profile
                        </button>
                        <button
                          className={styles.secondaryButton}
                          type="button"
                          onClick={handleSettings}
                        >
                          <span className={styles.buttonIcon} aria-hidden>
                            <IconGear />
                          </span>
                        </button>
                        <button
                          className={styles.secondaryButton}
                          type="button"
                          onClick={handleShare}
                        >
                          <span className={styles.buttonIcon} aria-hidden>
                            <IconShare />
                          </span>
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className={`${styles.primaryButton} ${
                            profile.isFollowing ? styles.ghostButton : ""
                          }`}
                          onClick={handleFollowToggle}
                          disabled={followLoading}
                          type="button"
                        >
                          {followLoading
                            ? "Updating..."
                            : profile.isFollowing
                            ? "Following"
                            : "Follow"}
                        </button>
                        <button
                          className={styles.secondaryButton}
                          type="button"
                        >
                          Message
                        </button>
                        <div className={styles.menuWrapper} ref={menuRef}>
                          <button
                            className={`${styles.secondaryButton} ${styles.menuButton}`}
                            type="button"
                            onClick={() => setMenuOpen((open) => !open)}
                          >
                            <span className={styles.buttonIcon} aria-hidden>
                              <IconDots />
                            </span>
                          </button>
                          {menuOpen ? (
                            <div className={styles.menuPanel}>
                              {menuItems.map((item) => (
                                <button
                                  key={item.key}
                                  type="button"
                                  className={styles.menuItem}
                                  onClick={() => handleMenuSelect(item.key)}
                                >
                                  {item.label}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className={styles.navRow}>
                {navItems.map((item) => (
                  <Link
                    key={item.key}
                    href={item.href}
                    prefetch
                    scroll={false}
                    className={`${styles.navItem} ${
                      activeKey === item.key ? styles.navItemActive : ""
                    }`}
                  >
                    <span className={styles.navItemContent}>
                      <span className={styles.navIcon} aria-hidden>
                        {renderNavIcon(item.key)}
                      </span>
                      <span className={styles.navLabel}>{item.label}</span>
                    </span>
                  </Link>
                ))}
              </div>

              {children}
            </ProfileProvider>
          ) : null}
        </div>
      )}
      {blockOpen ? (
        <div
          className={`${styles.modalOverlay} ${styles.modalOverlayOpen}`}
          role="dialog"
          aria-modal="true"
          onClick={closeBlockModal}
        >
          <div
            className={styles.modalCard}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <div>
                <h3 className={styles.modalTitle}>Block this account?</h3>
                <p className={styles.modalBody}>
                  {`You are about to block @${profile?.username}. They will no longer be able to interact with you.`}
                </p>
              </div>
            </div>
            {blockError ? (
              <div className={styles.modalError}>{blockError}</div>
            ) : null}
            <div className={styles.modalActions}>
              <button
                className={styles.modalSecondary}
                onClick={closeBlockModal}
                disabled={blocking}
              >
                Cancel
              </button>
              <button
                className={`${styles.modalPrimary} ${styles.modalDanger}`}
                onClick={confirmBlockUser}
                disabled={blocking}
              >
                {blocking ? "Blocking..." : "Block"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {reportOpen ? (
        <div
          className={`${styles.modalOverlay} ${
            reportClosing ? styles.modalOverlayClosing : styles.modalOverlayOpen
          }`}
          role="dialog"
          aria-modal="true"
          onClick={closeReportModal}
        >
          <div
            className={`${styles.modalCard} ${styles.reportCard} ${
              reportClosing ? styles.modalCardClosing : styles.modalCardOpen
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <div>
                <h3 className={styles.modalTitle}>Report this account</h3>
                <p className={styles.modalBody}>
                  {`Reporting @${profile?.username}. Please choose the closest reason.`}
                </p>
              </div>
              <button
                className={styles.closeBtn}
                aria-label="Close"
                onClick={closeReportModal}
              >
                <span aria-hidden>X</span>
              </button>
            </div>

            <div className={styles.reportGrid}>
              <div className={styles.categoryGrid}>
                {USER_REPORT_GROUPS.map((group) => {
                  const isActive = reportCategory === group.key;
                  return (
                    <button
                      key={group.key}
                      type="button"
                      className={`${styles.categoryCard} ${
                        isActive ? styles.categoryCardActive : ""
                      }`}
                      style={{
                        borderColor: isActive ? group.accent : undefined,
                        boxShadow: isActive
                          ? `0 0 0 1px ${group.accent}`
                          : undefined,
                      }}
                      onClick={() => {
                        setReportCategory(group.key);
                        setReportReason(
                          group.reasons.length === 1
                            ? group.reasons[0].key
                            : null
                        );
                      }}
                    >
                      <span
                        className={styles.categoryDot}
                        style={{ background: group.accent }}
                        aria-hidden
                      />
                      <span className={styles.categoryLabel}>
                        {group.label}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className={styles.reasonPanel}>
                <div className={styles.reasonHeader}>
                  Select a specific reason
                </div>
                {selectedReportGroup ? (
                  <div className={styles.reasonList}>
                    {selectedReportGroup.reasons.map((r) => {
                      const checked = reportReason === r.key;
                      return (
                        <button
                          key={r.key}
                          type="button"
                          className={`${styles.reasonRow} ${
                            checked ? styles.reasonRowActive : ""
                          }`}
                          onClick={() => setReportReason(r.key)}
                        >
                          <span
                            className={styles.reasonRadio}
                            aria-checked={checked}
                          >
                            {checked ? (
                              <span className={styles.reasonRadioDot} />
                            ) : null}
                          </span>
                          <span>{r.label}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className={styles.reasonPlaceholder}>
                    Pick a category first.
                  </div>
                )}

                <label className={styles.noteLabel}>
                  Additional notes (optional)
                  <textarea
                    className={styles.noteInput}
                    placeholder="Add brief context if needed..."
                    value={reportNote}
                    onChange={(e) => setReportNote(e.target.value)}
                    maxLength={500}
                  />
                </label>
                {reportError ? (
                  <div className={styles.inlineError}>{reportError}</div>
                ) : null}
              </div>
            </div>

            <div className={styles.modalActions}>
              <button
                className={styles.modalSecondary}
                onClick={closeReportModal}
                disabled={reportSubmitting}
              >
                Cancel
              </button>
              <button
                className={styles.modalPrimary}
                onClick={submitReport}
                disabled={!reportReason || reportSubmitting}
              >
                {reportSubmitting ? "Submitting..." : "Submit report"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {toast ? <div className={styles.toast}>{toast}</div> : null}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.statCard}>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className={styles.skeletonWrap}>
      <div className={`${styles.avatarRing} ${styles.skeleton}`} />
      <div className={`${styles.line} ${styles.skeleton}`} />
      <div
        className={`${styles.line} ${styles.skeleton} ${styles.lineShort}`}
      />
      <div className={styles.statsRow}>
        <div className={`${styles.statCard} ${styles.skeleton}`} />
        <div className={`${styles.statCard} ${styles.skeleton}`} />
        <div className={`${styles.statCard} ${styles.skeleton}`} />
      </div>
    </div>
  );
}

function IconGear() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M19.4 13.3c.05-.42.1-.85.1-1.3s-.05-.88-.1-1.3l2-1.56a.6.6 0 0 0 .14-.76l-1.9-3.3a.6.6 0 0 0-.72-.26l-2.36.95a7.7 7.7 0 0 0-2.25-1.3l-.36-2.47A.6.6 0 0 0 13.1 1h-3.8a.6.6 0 0 0-.6.51l-.36 2.47a7.7 7.7 0 0 0-2.25 1.3l-2.36-.95a.6.6 0 0 0-.72.26l-1.9 3.3a.6.6 0 0 0 .14.76l2 1.56c-.06.42-.1.85-.1 1.3s.04.88.1 1.3l-2 1.56a.6.6 0 0 0-.14.76l1.9 3.3c.16.28.5.4.8.3l2.36-.95c.66.55 1.42 1 2.25 1.3l.36 2.47c.05.3.3.51.6.51h3.8c.3 0 .55-.21.6-.51l.36-2.47c.83-.3 1.6-.75 2.25-1.3l2.36.95c.3.1.64 0 .8-.3l1.9-3.3a.6.6 0 0 0-.14-.76l-2-1.56Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconShare() {
  return (
    <svg fill="none" viewBox="0 0 48 48" width="18" height="18">
      <path
        fill="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        d="M21.68 3.18a2 2 0 0 1 2.14.32l21.5 19a2 2 0 0 1-.02 3.02l-21.5 18.5a2 2 0 0 1-3.3-1.52v-9.97c-5.68.28-11.95 1.75-16.09 5.88A2 2 0 0 1 1 37c0-11.68 7.7-21.05 19.5-21.94V5a2 2 0 0 1 1.18-1.82ZM24.5 30.5v7.64l16.46-14.16L24.5 9.44V17a2 2 0 0 1-2.05 2c-8.4-.21-15.62 5.34-17.09 13.66 4.47-2.7 9.8-3.87 14.98-4.13.68-.03 1.22-.04 1.6-.04 1.19 0 2.56.26 2.56 2.01Z"
      ></path>
    </svg>
  );
}

function IconDots() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <circle cx="6" cy="12" r="1.6" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="1.6" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="18" cy="12" r="1.6" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function IconInfo() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="1.8"
        opacity="0.9"
      />
      <path
        d="M12 17v-6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="12" cy="8" r="0.9" fill="currentColor" />
    </svg>
  );
}

function IconGrid() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <rect
        x="3"
        y="3"
        width="7"
        height="7"
        rx="1.6"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <rect
        x="14"
        y="3"
        width="7"
        height="7"
        rx="1.6"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <rect
        x="3"
        y="14"
        width="7"
        height="7"
        rx="1.6"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <rect
        x="14"
        y="14"
        width="7"
        height="7"
        rx="1.6"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function IconPlay() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M8.5 6.7c0-.8.9-1.3 1.6-.8l6 4.3c.6.4.6 1.3 0 1.7l-6 4.3c-.7.5-1.6 0-1.6-.8V6.7Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect
        x="3.5"
        y="3.5"
        width="17"
        height="17"
        rx="3"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function IconBookmark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M7.2 3.5h9.6c.7 0 1.2.6 1.2 1.3v15l-6-3.5-6 3.5v-15c0-.7.5-1.3 1.2-1.3Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconRepeat() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M4 7.5c.6-1.8 2.3-3 4.2-3h9.3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="m14.5 2.5 3 2.7-3 2.7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M20 16.5c-.6 1.8-2.3 3-4.2 3H6.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="m9.5 21.5-3-2.7 3-2.7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function renderNavIcon(key: string) {
  switch (key) {
    case "posts":
      return <IconGrid />;
    case "reels":
      return <IconPlay />;
    case "saved":
      return <IconBookmark />;
    case "repost":
      return <IconRepeat />;
    default:
      return <IconGrid />;
  }
}
