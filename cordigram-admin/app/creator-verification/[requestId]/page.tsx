"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { getApiBaseUrl, getWebBaseUrl } from "@/lib/api";
import styles from "./detail.module.css";

type AdminPayload = {
  roles?: string[];
  exp?: number;
};

type EligibilitySnapshot = {
  score: number;
  minimumScore: number;
  accountAgeDays?: number;
  minAccountAgeDays?: number;
  followersCount?: number;
  minFollowersCount?: number;
  postsCount?: number;
  minPostsCount?: number;
  activePostingDays30d?: number;
  minActivePostingDays30d?: number;
  engagementPerPost30d?: number;
  minEngagementPerPost30d?: number;
  recentViolations90d?: number;
  maxRecentViolations90d?: number;
  failedRequirements?: string[];
  eligible?: boolean;
};

type VerificationDetail = {
  id: string;
  status: "pending" | "approved" | "rejected";
  requestNote: string;
  decisionReason: string | null;
  reviewedAt: string | null;
  createdAt: string | null;
  cooldownUntil: string | null;
  eligibility: EligibilitySnapshot;
  currentEligibility: EligibilitySnapshot;
  user: {
    id: string;
    email: string | null;
    roles: string[];
    isCreatorVerified: boolean;
    creatorVerifiedAt: string | null;
    createdAt: string | null;
  };
  profile: {
    displayName: string | null;
    username: string | null;
    avatarUrl: string | null;
    bio: string;
    location: string;
    workplace: string;
    stats: {
      followersCount: number;
      followingCount: number;
      postsCount: number;
    };
  };
  recentPublicPosts: Array<{
    id: string;
    kind: "post" | "reel";
    content: string;
    mediaCount: number;
    coverUrl: string | null;
    media: Array<{
      type: "image" | "video";
      url: string | null;
      originalUrl: string | null;
    }>;
    createdAt: string | null;
    visibility: string;
    moderationState: string;
    stats: {
      hearts: number;
      comments: number;
      saves: number;
      reposts: number;
      shares: number;
      reports: number;
    };
  }>;
  moderationSummary: {
    activeActionCount: number;
    recentViolations90d: number;
    latestActions: Array<{
      id: string;
      action: string;
      category: string;
      reason: string;
      severity: "low" | "medium" | "high" | null;
      note: string | null;
      expiresAt: string | null;
      createdAt: string | null;
    }>;
  };
  creatorVerificationHistory: Array<{
    id: string;
    action: "approved" | "rejected" | "revoked";
    note: string | null;
    occurredAt: string | null;
    actor: {
      id: string | null;
      displayName: string | null;
      username: string | null;
      email: string | null;
    };
  }>;
};

const decodeJwt = (token: string): AdminPayload | null => {
  try {
    const payload = token.split(".")[1];
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
};

const formatDate = (value?: string | null) => {
  if (!value) return "--";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "--";
  return dt.toLocaleString();
};

const humanize = (value?: string | null) => {
  if (!value) return "--";
  return value
    .replace(/[_-]+/g, " ")
    .trim()
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
};

const REQUIREMENT_LABELS: Record<string, string> = {
  account_age: "Account age",
  followers_count: "Followers",
  posts_count: "Posts",
  active_posting_days_30d: "Active posting days (30d)",
  engagement_per_post_30d: "Avg engagement per post (30d)",
  recent_violations_90d: "Recent violations (90d)",
  score: "Creator score",
};

const formatRequirement = (key: string) => REQUIREMENT_LABELS[key] ?? humanize(key);

const getActorLabel = (actor: {
  displayName: string | null;
  username: string | null;
  email: string | null;
}) => {
  if (actor.displayName?.trim()) return actor.displayName.trim();
  if (actor.username?.trim()) return `@${actor.username.trim()}`;
  if (actor.email?.trim()) return actor.email.trim();
  return "Unknown admin";
};

const getMediaDisplayUrl = (item: { originalUrl: string | null; url: string | null } | undefined) => {
  if (!item) return "";
  return (item.originalUrl || item.url || "").trim();
};

function VerifiedBadge({ visible = true }: { visible?: boolean }) {
  if (!visible) return null;

  return (
    <span
      className={styles.verifiedBadge}
      aria-label="Creator verified"
      title="Creator verified"
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 20 20"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="creator-verified-gradient-admin" x1="2" y1="2" x2="18" y2="18" gradientUnits="userSpaceOnUse">
            <stop stopColor="#52B6FF" />
            <stop offset="1" stopColor="#1570EF" />
          </linearGradient>
        </defs>
        <path
          d="M10 1.6 12.2 3.1 14.8 3.1 16.1 5.4 18.4 6.8 18.4 9.4 19.9 11.6 18.4 13.8 18.4 16.4 16.1 17.8 14.8 20.1 12.2 20.1 10 21.6 7.8 20.1 5.2 20.1 3.9 17.8 1.6 16.4 1.6 13.8 0.1 11.6 1.6 9.4 1.6 6.8 3.9 5.4 5.2 3.1 7.8 3.1 10 1.6Z"
          transform="scale(0.9) translate(1.1 0.1)"
          fill="url(#creator-verified-gradient-admin)"
        />
        <path
          d="M6.8 10.3 9.1 12.6 13.6 8.1"
          stroke="#ffffff"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export default function CreatorVerificationDetailPage() {
  const params = useParams<{ requestId: string }>();
  const router = useRouter();
  const requestId = typeof params?.requestId === "string" ? params.requestId : "";

  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [detail, setDetail] = useState<VerificationDetail | null>(null);
  const [decisionNote, setDecisionNote] = useState("");
  const [revokeNote, setRevokeNote] = useState("");
  const [postMediaIndex, setPostMediaIndex] = useState<Record<string, number>>({});

  const token = useMemo(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("adminAccessToken") || "";
  }, []);

  const webBaseUrl = getWebBaseUrl();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!token) {
      router.replace("/login");
      return;
    }

    const payload = decodeJwt(token);
    const roles = payload?.roles || [];
    const exp = payload?.exp ? payload.exp * 1000 : 0;
    if (!roles.includes("admin") || (exp && Date.now() > exp)) {
      router.replace("/login");
      return;
    }

    setReady(true);
  }, [router, token]);

  const loadDetail = async () => {
    if (!token || !requestId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `${getApiBaseUrl()}/creator-verification/admin/requests/${requestId}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (!response.ok) {
        throw new Error("Failed to load request detail");
      }

      const payload = (await response.json()) as VerificationDetail;
      setDetail(payload);
      setDecisionNote(payload.decisionReason ?? "");
      setRevokeNote(payload.decisionReason ?? "");
      setPostMediaIndex({});
    } catch (_err) {
      setError("Unable to load creator verification detail.");
      setDetail(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!ready) return;
    void loadDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, requestId]);

  const submitReview = async (decision: "approved" | "rejected") => {
    if (!token || !detail) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(
        `${getApiBaseUrl()}/creator-verification/admin/requests/review`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            requestId: detail.id,
            decision,
            reason: decisionNote.trim() || undefined,
          }),
        },
      );

      if (!response.ok) {
        throw new Error("Failed to submit review action");
      }

      setSuccess(decision === "approved" ? "Request approved." : "Request rejected.");
      await loadDetail();
    } catch (_err) {
      setError("Unable to submit review action.");
    } finally {
      setSaving(false);
    }
  };

  const revokeCreatorAccess = async () => {
    if (!token || !detail) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(
        `${getApiBaseUrl()}/creator-verification/admin/requests/revoke-creator`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            requestId: detail.id,
            note: revokeNote.trim() || undefined,
          }),
        },
      );

      if (!response.ok) {
        throw new Error("Failed to revoke creator access");
      }

      setSuccess("Creator access revoked.");
      await loadDetail();
    } catch (_err) {
      setError("Unable to revoke creator access.");
    } finally {
      setSaving(false);
    }
  };

  const getActiveMediaIndex = (postId: string, mediaCount: number) => {
    const raw = postMediaIndex[postId] ?? 0;
    if (mediaCount <= 0) return 0;
    return Math.min(Math.max(raw, 0), mediaCount - 1);
  };

  const movePostMedia = (postId: string, mediaCount: number, direction: -1 | 1) => {
    if (mediaCount <= 1) return;
    setPostMediaIndex((prev) => {
      const current = prev[postId] ?? 0;
      const next = (current + direction + mediaCount) % mediaCount;
      return {
        ...prev,
        [postId]: next,
      };
    });
  };

  if (!ready) {
    return null;
  }

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <div className={styles.topbar}>
          <div className={styles.titleGroup}>
            <p className={styles.kicker}>Creator verification detail</p>
            <h1 className={styles.title}>Review request</h1>
            <p className={styles.subtitle}>
              Inspect public profile quality, recent activity signals, and moderation history before making a final decision.
            </p>
          </div>
          <div className={styles.topActions}>
            <Link href="/creator-verification" className={styles.ghostButton}>
              Back to queue
            </Link>
            {detail?.user.id ? (
              <Link
                href={`${webBaseUrl}/profile/${detail.user.id}`}
                className={styles.primaryButton}
                target="_blank"
                rel="noreferrer"
              >
                Open profile
              </Link>
            ) : null}
          </div>
        </div>

        {error ? <p className={styles.error}>{error}</p> : null}
        {success ? <p className={styles.success}>{success}</p> : null}
        {loading && !detail ? <p className={styles.muted}>Loading request detail...</p> : null}

        {detail ? (
          <>
            <section className={styles.summaryGrid}>
              <article className={styles.summaryCard}>
                <span className={styles.summaryLabel}>Status</span>
                <span className={`${styles.statusPill} ${detail.status === "pending" ? styles.statusPending : detail.status === "approved" ? styles.statusApproved : styles.statusRejected}`}>
                  {detail.status}
                </span>
                <span className={styles.summaryHint}>Requested {formatDate(detail.createdAt)}</span>
              </article>
              <article className={styles.summaryCard}>
                <span className={styles.summaryLabel}>Snapshot score</span>
                <span className={styles.summaryValue}>{detail.eligibility.score}</span>
                <span className={styles.summaryHint}>Min {detail.eligibility.minimumScore}</span>
              </article>
              <article className={styles.summaryCard}>
                <span className={styles.summaryLabel}>Current score</span>
                <span className={styles.summaryValue}>{detail.currentEligibility.score}</span>
                <span className={styles.summaryHint}>Live recalculation</span>
              </article>
              <article className={styles.summaryCard}>
                <span className={styles.summaryLabel}>Active actions</span>
                <span className={styles.summaryValue}>{detail.moderationSummary.activeActionCount}</span>
                <span className={styles.summaryHint}>User moderation history</span>
              </article>
            </section>

            <div className={styles.layout}>
              <section className={styles.mainColumn}>
                <article className={styles.panel}>
                  <div className={styles.panelHeader}>
                    <div>
                      <h2 className={styles.panelTitle}>Applicant</h2>
                      <p className={styles.panelSubtitle}>Public identity and account context.</p>
                    </div>
                  </div>
                  <div className={styles.applicantRow}>
                    <div className={styles.avatarWrap}>
                      {detail.profile.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={detail.profile.avatarUrl} alt="" className={styles.avatar} />
                      ) : (
                        <div className={styles.avatarFallback}>
                          {(detail.profile.displayName || detail.profile.username || "U").charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className={styles.applicantMeta}>
                      <div className={styles.applicantNameRow}>
                        <h3 className={styles.applicantName}>{detail.profile.displayName || "Unknown user"}</h3>
                        <VerifiedBadge visible={detail.user.isCreatorVerified} />
                      </div>
                      <p className={styles.applicantHandle}>@{detail.profile.username || "unknown"}</p>
                      <p className={styles.applicantDetail}>{detail.user.email || "No email"}</p>
                      <p className={styles.applicantDetail}>Joined: {formatDate(detail.user.createdAt)}</p>
                    </div>
                  </div>
                  <div className={styles.statStrip}>
                    <span>Followers {detail.profile.stats.followersCount}</span>
                    <span>Following {detail.profile.stats.followingCount}</span>
                    <span>Posts {detail.profile.stats.postsCount}</span>
                  </div>
                  {detail.profile.bio ? <p className={styles.bodyText}>{detail.profile.bio}</p> : null}
                  <div className={styles.metaGrid}>
                    <div className={styles.metaItem}>
                      <span>Location</span>
                      <strong>{detail.profile.location || "--"}</strong>
                    </div>
                    <div className={styles.metaItem}>
                      <span>Workplace</span>
                      <strong>{detail.profile.workplace || "--"}</strong>
                    </div>
                    <div className={styles.metaItem}>
                      <span>Submitted</span>
                      <strong>{formatDate(detail.createdAt)}</strong>
                    </div>
                    <div className={styles.metaItem}>
                      <span>Creator roles</span>
                      <strong>{detail.user.roles.join(", ") || "--"}</strong>
                    </div>
                  </div>
                  {detail.requestNote ? (
                    <div className={styles.noteBox}>
                      <span className={styles.noteLabel}>Applicant note</span>
                      <p className={styles.noteText}>{detail.requestNote}</p>
                    </div>
                  ) : null}
                </article>

                <article className={styles.panel}>
                  <div className={styles.panelHeader}>
                    <div>
                      <h2 className={styles.panelTitle}>Eligibility detail</h2>
                      <p className={styles.panelSubtitle}>Snapshot at submission versus current live status.</p>
                    </div>
                  </div>
                  <div className={styles.comparisonGrid}>
                    <div className={styles.comparisonCard}>
                      <h3 className={styles.comparisonTitle}>Submission snapshot</h3>
                      <div className={styles.eligibilityGrid}>
                        <div className={styles.eligibilityItem}><span>Account age</span><strong>{detail.eligibility.accountAgeDays ?? 0} / {detail.eligibility.minAccountAgeDays ?? "?"} days</strong></div>
                        <div className={styles.eligibilityItem}><span>Followers</span><strong>{detail.eligibility.followersCount ?? 0} / {detail.eligibility.minFollowersCount ?? "?"}</strong></div>
                        <div className={styles.eligibilityItem}><span>Posts</span><strong>{detail.eligibility.postsCount ?? 0} / {detail.eligibility.minPostsCount ?? "?"}</strong></div>
                        <div className={styles.eligibilityItem}><span>Active days</span><strong>{detail.eligibility.activePostingDays30d ?? 0} / {detail.eligibility.minActivePostingDays30d ?? "?"}</strong></div>
                        <div className={styles.eligibilityItem}><span>Engagement/post</span><strong>{detail.eligibility.engagementPerPost30d ?? 0} / {detail.eligibility.minEngagementPerPost30d ?? "?"}</strong></div>
                        <div className={styles.eligibilityItem}><span>Violations 90d</span><strong>{detail.eligibility.recentViolations90d ?? 0} / max {detail.eligibility.maxRecentViolations90d ?? "?"}</strong></div>
                      </div>
                      <div className={styles.requirementsWrap}>
                        {(detail.eligibility.failedRequirements?.length ?? 0) > 0 ? detail.eligibility.failedRequirements?.map((req) => (
                          <span key={req} className={styles.requirementFail}>{formatRequirement(req)}</span>
                        )) : <span className={styles.requirementPass}>All requirements passed</span>}
                      </div>
                    </div>
                    <div className={styles.comparisonCard}>
                      <h3 className={styles.comparisonTitle}>Current live snapshot</h3>
                      <div className={styles.eligibilityGrid}>
                        <div className={styles.eligibilityItem}><span>Account age</span><strong>{detail.currentEligibility.accountAgeDays ?? 0} / {detail.currentEligibility.minAccountAgeDays ?? "?"} days</strong></div>
                        <div className={styles.eligibilityItem}><span>Followers</span><strong>{detail.currentEligibility.followersCount ?? 0} / {detail.currentEligibility.minFollowersCount ?? "?"}</strong></div>
                        <div className={styles.eligibilityItem}><span>Posts</span><strong>{detail.currentEligibility.postsCount ?? 0} / {detail.currentEligibility.minPostsCount ?? "?"}</strong></div>
                        <div className={styles.eligibilityItem}><span>Active days</span><strong>{detail.currentEligibility.activePostingDays30d ?? 0} / {detail.currentEligibility.minActivePostingDays30d ?? "?"}</strong></div>
                        <div className={styles.eligibilityItem}><span>Engagement/post</span><strong>{detail.currentEligibility.engagementPerPost30d ?? 0} / {detail.currentEligibility.minEngagementPerPost30d ?? "?"}</strong></div>
                        <div className={styles.eligibilityItem}><span>Violations 90d</span><strong>{detail.currentEligibility.recentViolations90d ?? 0} / max {detail.currentEligibility.maxRecentViolations90d ?? "?"}</strong></div>
                      </div>
                      <div className={styles.requirementsWrap}>
                        {(detail.currentEligibility.failedRequirements?.length ?? 0) > 0 ? detail.currentEligibility.failedRequirements?.map((req) => (
                          <span key={req} className={styles.requirementFail}>{formatRequirement(req)}</span>
                        )) : <span className={styles.requirementPass}>All requirements passed</span>}
                      </div>
                    </div>
                  </div>
                </article>

                <article className={styles.panel}>
                  <div className={styles.panelHeader}>
                    <div>
                      <h2 className={styles.panelTitle}>Recent public posts</h2>
                      <p className={styles.panelSubtitle}>Public content context only, suitable for creator review.</p>
                    </div>
                  </div>
                  <div className={styles.postList}>
                    {detail.recentPublicPosts.length ? detail.recentPublicPosts.map((post) => {
                      const mediaItems = post.media ?? [];
                      const activeMediaIndex = getActiveMediaIndex(post.id, mediaItems.length);
                      const activeMedia = mediaItems[activeMediaIndex] ?? null;
                      const activeMediaUrl = getMediaDisplayUrl(activeMedia) || undefined;

                      return (
                        <article key={post.id} className={styles.postCard}>
                          <div className={styles.postHeader}>
                            <div className={styles.postHeaderMain}>
                              <div className={styles.postTypeRow}>
                                <span className={styles.postKindBadge}>{humanize(post.kind)}</span>
                                <span className={styles.postTimestamp}>{formatDate(post.createdAt)}</span>
                              </div>
                              <p className={styles.postMeta}>
                                Visibility {post.visibility} • Moderation {humanize(post.moderationState)}
                              </p>
                            </div>
                            <Link
                              href={`${webBaseUrl}/post/${post.id}`}
                              className={styles.inlineLink}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Open post
                            </Link>
                          </div>

                          <div className={styles.postCaptionBlock}>
                            <h3 className={styles.postTitle}>Content overview</h3>
                            <p className={styles.postCaption}>{post.content || "No caption"}</p>
                          </div>

                          <div className={styles.postBodyGrid}>
                            <div className={styles.mediaPanel}>
                              <div className={styles.mediaViewport}>
                                {activeMedia ? (
                                  <button
                                    type="button"
                                    className={styles.reviewMediaStageButton}
                                    onClick={() => undefined}
                                  >
                                    {activeMedia.type === "video" ? (
                                      <video
                                        key={`${post.id}-${activeMediaIndex}`}
                                        src={activeMediaUrl}
                                        className={styles.reviewMediaImageLarge}
                                        controls
                                        preload="metadata"
                                        playsInline
                                      />
                                    ) : (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img
                                        key={`${post.id}-${activeMediaIndex}`}
                                        src={activeMediaUrl}
                                        alt=""
                                        className={styles.reviewMediaImageLarge}
                                      />
                                    )}
                                  </button>
                                ) : (
                                  <div className={styles.mediaEmpty}>No media</div>
                                )}

                                {mediaItems.length > 1 ? (
                                  <>
                                    <button
                                      type="button"
                                      className={`${styles.mediaNavButton} ${styles.mediaNavLeft}`}
                                      onClick={() => movePostMedia(post.id, mediaItems.length, -1)}
                                      aria-label="Previous media"
                                    >
                                      ‹
                                    </button>
                                    <button
                                      type="button"
                                      className={`${styles.mediaNavButton} ${styles.mediaNavRight}`}
                                      onClick={() => movePostMedia(post.id, mediaItems.length, 1)}
                                      aria-label="Next media"
                                    >
                                      ›
                                    </button>
                                  </>
                                ) : null}

                                {mediaItems.length ? (
                                  <div className={styles.mediaCounter}>
                                    {activeMediaIndex + 1}/{mediaItems.length}
                                  </div>
                                ) : null}
                              </div>

                              {mediaItems.length > 1 ? (
                                <div className={styles.mediaDots}>
                                  {mediaItems.map((media, index) => (
                                    <button
                                      key={`${post.id}-${media.originalUrl ?? media.url ?? index}`}
                                      type="button"
                                      className={`${styles.mediaDot} ${index === activeMediaIndex ? styles.mediaDotActive : ""}`}
                                      onClick={() =>
                                        setPostMediaIndex((prev) => ({
                                          ...prev,
                                          [post.id]: index,
                                        }))
                                      }
                                      aria-label={`Show media ${index + 1}`}
                                    />
                                  ))}
                                </div>
                              ) : null}
                            </div>

                            <div className={styles.postContentPanel}>
                              <h3 className={styles.postTitle}>Post performance</h3>
                              <div className={styles.postStatsGrid}>
                                <div className={styles.postStatItem}><span>Hearts</span><strong>{post.stats.hearts}</strong></div>
                                <div className={styles.postStatItem}><span>Comments</span><strong>{post.stats.comments}</strong></div>
                                <div className={styles.postStatItem}><span>Saves</span><strong>{post.stats.saves}</strong></div>
                                <div className={styles.postStatItem}><span>Reposts</span><strong>{post.stats.reposts}</strong></div>
                                <div className={styles.postStatItem}><span>Shares</span><strong>{post.stats.shares}</strong></div>
                                <div className={styles.postStatItem}><span>Reports</span><strong>{post.stats.reports}</strong></div>
                              </div>
                            </div>
                          </div>
                        </article>
                      );
                    }) : <p className={styles.muted}>No recent public posts found.</p>}
                  </div>
                </article>
              </section>

              <aside className={styles.sideColumn}>
                <article className={styles.panel}>
                  <div className={styles.panelHeader}>
                    <div>
                      <h2 className={styles.panelTitle}>Verification history</h2>
                    </div>
                  </div>
                  <div className={styles.actionList}>
                    {detail.creatorVerificationHistory.length ? detail.creatorVerificationHistory.map((entry) => (
                      <div key={entry.id} className={styles.actionItem}>
                        <div className={styles.actionHead}>
                          <div className={styles.historyTitleWrap}>
                            <span
                              className={`${styles.historyBadge} ${entry.action === "approved" ? styles.historyApproved : entry.action === "rejected" ? styles.historyRejected : styles.historyRevoked}`}
                            >
                              {humanize(entry.action)}
                            </span>
                            <strong>{getActorLabel(entry.actor)}</strong>
                          </div>
                          <span className={styles.actionTime}>{formatDate(entry.occurredAt)}</span>
                        </div>
                        <p className={styles.actionBody}>Handled by {getActorLabel(entry.actor)}</p>
                        {entry.actor.email ? <p className={styles.actionNote}>Admin email: {entry.actor.email}</p> : null}
                        {entry.note ? <p className={styles.actionNote}>Note: {entry.note}</p> : null}
                      </div>
                    )) : <p className={styles.muted}>No creator verification history yet.</p>}
                  </div>
                </article>

                <article className={styles.panel}>
                  <div className={styles.panelHeader}>
                    <div>
                      <h2 className={styles.panelTitle}>Moderation summary</h2>
                      <p className={styles.panelSubtitle}>Signals relevant to creator trust and safety.</p>
                    </div>
                  </div>
                  <div className={styles.metaGrid}>
                    <div className={styles.metaItem}><span>Active actions</span><strong>{detail.moderationSummary.activeActionCount}</strong></div>
                    <div className={styles.metaItem}><span>Violations 90d</span><strong>{detail.moderationSummary.recentViolations90d}</strong></div>
                    <div className={styles.metaItem}><span>Approved at</span><strong>{formatDate(detail.user.creatorVerifiedAt)}</strong></div>
                    <div className={styles.metaItem}><span>Reviewed at</span><strong>{formatDate(detail.reviewedAt)}</strong></div>
                  </div>
                  <div className={styles.actionList}>
                    {detail.moderationSummary.latestActions.length ? detail.moderationSummary.latestActions.map((action) => (
                      <div key={action.id} className={styles.actionItem}>
                        <div className={styles.actionHead}>
                          <strong>{humanize(action.action)}</strong>
                          <span className={styles.actionTime}>{formatDate(action.createdAt)}</span>
                        </div>
                        <p className={styles.actionBody}>{humanize(action.category)} • {action.reason}</p>
                        {action.note ? <p className={styles.actionNote}>Note: {action.note}</p> : null}
                      </div>
                    )) : <p className={styles.muted}>No active moderation actions.</p>}
                  </div>
                </article>

                <article className={styles.panel}>
                  <div className={styles.panelHeader}>
                    <div>
                      <h2 className={styles.panelTitle}>
                        {detail.user.isCreatorVerified ? "Creator access" : "Final decision"}
                      </h2>
                    </div>
                  </div>
                  {detail.user.isCreatorVerified ? (
                    <>
                      <textarea
                        className={styles.textarea}
                        rows={5}
                        placeholder="Add admin note for revoking creator access"
                        value={revokeNote}
                        onChange={(event) => setRevokeNote(event.target.value)}
                      />
                      <div className={styles.actions}>
                        <button
                          type="button"
                          className={styles.revokeButton}
                          disabled={saving}
                          onClick={() => void revokeCreatorAccess()}
                        >
                          {saving ? "Saving..." : "Revoke creator"}
                        </button>
                      </div>
                    </>
                  ) : detail.status === "pending" ? (
                    <>
                      <textarea
                        className={styles.textarea}
                        rows={5}
                        placeholder="Add admin note or rejection reason"
                        value={decisionNote}
                        onChange={(event) => setDecisionNote(event.target.value)}
                      />
                      <div className={styles.actions}>
                        <button
                          type="button"
                          className={styles.rejectButton}
                          disabled={saving}
                          onClick={() => void submitReview("rejected")}
                        >
                          {saving ? "Saving..." : "Reject"}
                        </button>
                        <button
                          type="button"
                          className={styles.approveButton}
                          disabled={saving}
                          onClick={() => void submitReview("approved")}
                        >
                          {saving ? "Saving..." : "Approve"}
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className={styles.noteBox}>
                      <span className={styles.noteLabel}>Decision summary</span>
                      <p className={styles.noteText}>{detail.decisionReason || "No decision note added."}</p>
                      <p className={styles.decisionMeta}>Reviewed: {formatDate(detail.reviewedAt)}</p>
                      {detail.cooldownUntil ? (
                        <p className={styles.decisionMeta}>Cooldown until: {formatDate(detail.cooldownUntil)}</p>
                      ) : null}
                    </div>
                  )}
                </article>
              </aside>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
