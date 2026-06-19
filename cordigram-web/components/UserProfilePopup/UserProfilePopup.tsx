"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./UserProfilePopup.module.css";
import { useLanguage } from "@/component/language-provider";
import {
  fetchProfileDetail,
  fetchMessagingProfileByUserId,
  followUser,
  unfollowUser,
  messagingProfileCardToDetail,
  type ProfileDetailResponse,
} from "@/lib/api";
import { parseUserCover } from "@/lib/user-profile-cover";
import { buildProfileCardThemeVars } from "@/lib/profile-theme";

function getDisplayNameTextStyle(source?: {
  displayNameFontId?: string | null;
  displayNameEffectId?: string | null;
  displayNamePrimaryHex?: string | null;
  displayNameAccentHex?: string | null;
}): React.CSSProperties | undefined {
  if (!source) return undefined;
  const primary = /^#[0-9a-f]{6}$/i.test(String(source.displayNamePrimaryHex || ""))
    ? String(source.displayNamePrimaryHex)
    : "#F2F3F5";
  const accent = /^#[0-9a-f]{6}$/i.test(String(source.displayNameAccentHex || ""))
    ? String(source.displayNameAccentHex)
    : "#5865F2";
  const fontFamily =
    source.displayNameFontId === "mono"
      ? 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
      : source.displayNameFontId === "rounded"
        ? 'ui-rounded, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif'
        : undefined;
  if (source.displayNameEffectId === "gradient") {
    return {
      backgroundImage: `linear-gradient(0deg, ${primary}, ${accent})`,
      WebkitBackgroundClip: "text",
      backgroundClip: "text",
      color: "transparent",
      fontFamily,
    };
  }
  if (source.displayNameEffectId === "neon") {
    return {
      color: primary,
      textShadow: `0 0 10px ${accent}, 0 0 18px ${accent}`,
      fontFamily,
    };
  }
  return { color: primary, fontFamily };
}

type Props = {
  userId: string;
  token: string | null;
  currentUserId: string;
  /** `messaging`: thẻ hồ sơ trong ngữ cảnh chat (tách khỏi social). */
  profileSource?: "social" | "messaging";
  onClose: () => void;
  onMessage?: (userId: string) => void;
};

export default function UserProfilePopup({
  userId,
  token,
  currentUserId,
  profileSource = "social",
  onClose,
  onMessage,
}: Props) {
  const { t } = useLanguage();
  const router = useRouter();
  const [detail, setDetail] = useState<ProfileDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [followLoading, setFollowLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"mutualFollowers" | "mutualServers">(
    "mutualFollowers",
  );

  const isSelf = userId === currentUserId;
  const isMessaging = profileSource === "messaging";

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setDetail(null);
    if (!token) {
      setLoading(false);
      return;
    }
    const p =
      profileSource === "messaging"
        ? fetchMessagingProfileByUserId({ token, userId }).then(
            messagingProfileCardToDetail,
          )
        : fetchProfileDetail({ token, id: userId });
    p.then((d) => {
      if (!cancelled) setDetail(d);
    })
      .catch(() => {
        if (!cancelled) setDetail(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, userId, profileSource]);

  const displayName = detail?.displayName || detail?.username || "—";
  const username = detail?.username || "";
  const cordigramMemberSince = detail?.cordigramMemberSince || "";

  const cover = useMemo(() => parseUserCover(detail?.coverUrl), [detail?.coverUrl]);
  const cardThemeStyle = useMemo(
    () =>
      buildProfileCardThemeVars(
        detail?.profileThemePrimaryHex,
        detail?.profileThemeAccentHex,
      ),
    [detail?.profileThemePrimaryHex, detail?.profileThemeAccentHex],
  );

  const isFollowing = Boolean(detail?.isFollowing);
  const mutualFollowersCount = detail?.mutualFollowCount ?? 0;
  const mutualServersCount = detail?.mutualServerCount ?? 0;
  const mutualServers = detail?.mutualServers ?? [];
  const mutualFollowers = detail?.mutualFollowUsers ?? [];

  const toggleFollow = async () => {
    if (!token || isSelf || followLoading || !detail) return;
    setFollowLoading(true);
    try {
      if (isFollowing) {
        await unfollowUser({ token, userId });
        setDetail({ ...detail, isFollowing: false });
      } else {
        await followUser({ token, userId });
        setDetail({ ...detail, isFollowing: true });
      }
    } catch {
      // ignore
    } finally {
      setFollowLoading(false);
    }
  };

  const openSocialProfile = () => {
    onClose();
    router.push(`/profile/${encodeURIComponent(userId)}`);
  };

  return (
    <div
      className={styles.overlay}
      onClick={onClose}
      role="dialog"
      aria-modal
      aria-label={t("chat.popups.userProfile.aria")}
    >
      <div className={styles.card} style={cardThemeStyle}>
        <div onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label={t("chat.popups.closeAria")}
          >
            ×
          </button>

          <div className={styles.banner}>
            {cover.bannerImageUrl ? (
              <div
                className={styles.bannerImg}
                style={{
                  backgroundImage: `url('${cover.bannerImageUrl.replace(/'/g, "%27")}')`,
                }}
              />
            ) : cover.bannerSolidHex ? (
              <div className={styles.bannerSolid} style={{ background: cover.bannerSolidHex }} />
            ) : (
              <div className={styles.bannerBg} />
            )}
            <div className={styles.bannerStars} aria-hidden />
            <div className={styles.bannerFade} aria-hidden />
          </div>

          <div className={styles.body}>
            <div className={styles.avatarWrap}>
              {detail?.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className={styles.avatar} src={detail.avatarUrl} alt="" />
              ) : (
                <div className={styles.avatar}>
                  {(detail?.displayName || detail?.username || "?").charAt(0).toUpperCase()}
                </div>
              )}
            </div>

            <div className={styles.headerRow}>
              <div className={styles.identityBlock}>
                <div className={styles.nameRow}>
                  <h2
                    className={styles.name}
                    style={getDisplayNameTextStyle(detail ?? undefined)}
                  >
                    {displayName}
                  </h2>
                  {!isSelf ? (
                    <button
                      type="button"
                      onClick={() => void toggleFollow()}
                      disabled={followLoading || loading}
                      className={`${styles.followBtnInline} ${isFollowing ? styles.followingBtnInline : ""}`}
                    >
                      {loading
                        ? "..."
                        : followLoading
                          ? "..."
                          : isFollowing
                            ? t("chat.popups.memberProfile.following")
                            : t("chat.popups.memberProfile.follow")}
                    </button>
                  ) : null}
                </div>
                <p className={styles.username}>{username}</p>
              </div>

              <div className={styles.statusPill}>
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden>
                  <circle cx="4" cy="4" r="4" fill="#23a55a" />
                </svg>
                {t("chat.profileEditor.statusPlaceholder")}
              </div>
            </div>

            <hr className={styles.divider} />

            <div className={styles.metaGrid}>
              <div className={styles.metaCard}>
                <div className={styles.metaLabel}>
                  {t("chat.popups.userProfile.memberSinceLabel")}
                </div>
                <div className={styles.metaValue}>{cordigramMemberSince || "—"}</div>
              </div>
              <div className={styles.metaCard}>
                <div className={styles.metaLabel}>
                  {t("chat.popups.userProfile.mutualServersLabel")}
                </div>
                <div className={styles.metaValue}>{mutualServersCount}</div>
              </div>
            </div>

            <div className={styles.bio}>
              {(detail?.bio || "").trim() || " "}
            </div>

            <div className={styles.tabs}>
              <button
                type="button"
                className={activeTab === "mutualFollowers" ? styles.tabActive : styles.tab}
                onClick={() => setActiveTab("mutualFollowers")}
              >
                {t("chat.popups.userProfile.tabMutualFollowers", { n: mutualFollowersCount })}
              </button>
              <button
                type="button"
                className={activeTab === "mutualServers" ? styles.tabActive : styles.tab}
                onClick={() => setActiveTab("mutualServers")}
              >
                {t("chat.popups.userProfile.tabMutualServers", { n: mutualServersCount })}
              </button>
            </div>

            <div className={styles.tabContent}>
              {activeTab === "mutualFollowers" ? (
                mutualFollowers.length ? (
                  <div>
                    {mutualFollowers.slice(0, 24).map((u) => (
                      <div key={u.userId} className={styles.listRow}>
                        {u.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={u.avatarUrl}
                            alt=""
                            className={styles.listAv}
                            style={{ borderRadius: 999 }}
                          />
                        ) : (
                          <div
                            className={styles.listAv}
                            style={{
                              borderRadius: 999,
                              background: "linear-gradient(135deg, #5865f2, #7c3aed)",
                              display: "grid",
                              placeItems: "center",
                              color: "#fff",
                              fontSize: 11,
                              fontWeight: 800,
                            }}
                          >
                            {(u.displayName || u.username || "?").charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className={styles.listName}>{u.displayName || u.username}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={styles.emptyState}>
                    <p>{t("chat.popups.userProfile.mutualFollowersEmpty")}</p>
                  </div>
                )
              ) : null}

              {activeTab === "mutualServers" ? (
                mutualServers.length ? (
                  <div>
                    {mutualServers.slice(0, 30).map((s) => (
                      <div key={s.serverId} className={styles.listRow}>
                        {s.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={s.avatarUrl} alt="" className={styles.listAv} />
                        ) : (
                          <div
                            className={styles.listAv}
                            style={{
                              borderRadius: 8,
                              background: "linear-gradient(135deg, #5865f2, #7c3aed)",
                              display: "grid",
                              placeItems: "center",
                              color: "#fff",
                              fontSize: 11,
                              fontWeight: 800,
                            }}
                          >
                            {(s.name || "S").charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className={styles.listName}>{s.name}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={styles.emptyState}>
                    <p>{t("chat.popups.userProfile.mutualServersEmpty")}</p>
                  </div>
                )
              ) : null}
            </div>

            {!isSelf ? (
              <div className={styles.actions}>
                <button
                  type="button"
                  onClick={() => onMessage?.(userId)}
                  className={styles.messageBtn}
                  aria-label={t("chat.popups.memberProfile.messageAria")}
                  title={t("chat.popups.memberProfile.message")}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </button>

                {isMessaging ? (
                  <button
                    type="button"
                    onClick={openSocialProfile}
                    className={styles.socialProfileBtn}
                    title={t("chat.popups.userProfile.viewSocialProfile")}
                  >
                    {t("chat.popups.userProfile.viewSocialProfile")}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
