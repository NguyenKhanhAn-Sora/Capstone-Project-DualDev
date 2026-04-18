"use client";

import React, { useEffect, useMemo, useState } from "react";
import styles from "./UserProfilePopup.module.css";
import { useLanguage } from "@/component/language-provider";
import { fetchProfileDetail, followUser, unfollowUser, type ProfileDetailResponse } from "@/lib/api";
import { parseUserCover } from "@/lib/user-profile-cover";

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
  onClose: () => void;
  onMessage?: (userId: string) => void;
};

export default function UserProfilePopup({
  userId,
  token,
  currentUserId,
  onClose,
  onMessage,
}: Props) {
  const { t } = useLanguage();
  const [detail, setDetail] = useState<ProfileDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [followLoading, setFollowLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"activity" | "mutualFollowers" | "mutualServers">(
    "activity",
  );

  const isSelf = userId === currentUserId;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setDetail(null);
    if (!token) {
      setLoading(false);
      return;
    }
    fetchProfileDetail({ token, id: userId })
      .then((d) => {
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
  }, [token, userId]);

  const displayName = detail?.displayName || detail?.username || "—";
  const username = detail?.username || "";
  const cordigramMemberSince = detail?.cordigramMemberSince || "";

  const cover = useMemo(() => parseUserCover(detail?.coverUrl), [detail?.coverUrl]);
  const bannerStyle = useMemo(() => {
    if (cover.bannerImageUrl) {
      return {
        backgroundImage: `url('${cover.bannerImageUrl.replace(/'/g, "%27")}')`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundColor: "#111214",
      } as React.CSSProperties;
    }
    return { background: cover.bannerSolidHex } as React.CSSProperties;
  }, [cover.bannerImageUrl, cover.bannerSolidHex]);

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

  return (
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal aria-label={t("chat.popups.userProfile.aria")}>
      <div className={styles.card}>
        <div onClick={(e) => e.stopPropagation()}>
        <button type="button" className={styles.close} onClick={onClose} aria-label={t("chat.popups.closeAria")}>
          ×
        </button>

        <div className={styles.banner} style={bannerStyle} />
        <div className={styles.body}>
          <img
            className={styles.avatar}
            src={detail?.avatarUrl || ""}
            alt=""
          />
          <div className={styles.statusPill}>
            {t("chat.profileEditor.statusPlaceholder")}
          </div>

          <h2 className={styles.name} style={getDisplayNameTextStyle(detail)}>
            {displayName}
          </h2>
          <p className={styles.username}>{username}</p>

          <div className={styles.metaGrid}>
            <div className={styles.metaCard}>
              <div className={styles.metaLabel}>{t("chat.popups.userProfile.memberSinceLabel")}</div>
              <div className={styles.metaValue}>{cordigramMemberSince || "—"}</div>
            </div>
            <div className={styles.metaCard}>
              <div className={styles.metaLabel}>{t("chat.popups.userProfile.mutualServersLabel")}</div>
              <div className={styles.metaValue}>{mutualServersCount}</div>
            </div>
          </div>

          <div className={styles.bio}>
            {(detail?.bio || "").trim() || "\u00a0"}
          </div>

          <div className={styles.tabs}>
            <button
              type="button"
              className={activeTab === "activity" ? styles.tabActive : styles.tab}
              onClick={() => setActiveTab("activity")}
            >
              {t("chat.popups.userProfile.tabActivity")}
            </button>
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
            {activeTab === "activity" ? (
              <div>
                <div>{t("chat.popups.userProfile.activityEmpty", { name: displayName })}</div>
                <div style={{ marginTop: 8, opacity: 0.85 }}>
                  {t("chat.popups.userProfile.activityHint")}
                </div>
              </div>
            ) : null}

            {activeTab === "mutualFollowers" ? (
              mutualFollowers.length ? (
                <div>
                  {mutualFollowers.slice(0, 24).map((u) => (
                    <div key={u.userId} className={styles.listRow}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={u.avatarUrl} alt="" className={styles.listAv} style={{ borderRadius: 999 }} />
                      <div className={styles.listName}>{u.displayName || u.username}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div>{t("chat.popups.userProfile.mutualFollowersEmpty")}</div>
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
                          style={{
                            width: 26,
                            height: 26,
                            borderRadius: 8,
                            background: "#5865f2",
                            color: "#fff",
                            display: "grid",
                            placeItems: "center",
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
                <div>{t("chat.popups.userProfile.mutualServersEmpty")}</div>
              )
            ) : null}
          </div>

          {!isSelf ? (
            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <button
                type="button"
                onClick={() => void toggleFollow()}
                disabled={followLoading || loading}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "none",
                  background: isFollowing ? "#4e5058" : "#5865f2",
                  color: "#fff",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                {loading ? "..." : followLoading ? "..." : isFollowing ? t("chat.popups.memberProfile.following") : t("chat.popups.memberProfile.follow")}
              </button>
              <button
                type="button"
                onClick={() => onMessage?.(userId)}
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 12,
                  border: "1px solid #3f4147",
                  background: "#2b2d31",
                  color: "#f2f3f5",
                  cursor: "pointer",
                }}
                aria-label={t("chat.popups.memberProfile.messageAria")}
                title={t("chat.popups.memberProfile.message")}
              >
                💬
              </button>
            </div>
          ) : null}
        </div>
        </div>
      </div>
    </div>
  );
}

