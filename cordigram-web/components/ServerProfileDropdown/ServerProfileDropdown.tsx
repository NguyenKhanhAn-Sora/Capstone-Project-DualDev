"use client";

import React, { useEffect, useMemo, useState } from "react";
import * as serversApi from "@/lib/servers-api";
import { normalizeServerBanner } from "@/lib/server-banner";
import { useLanguage } from "@/component/language-provider";
import styles from "./ServerProfileDropdown.module.css";

export interface ServerProfileDropdownProps {
  server: serversApi.Server;
  canManageProfile: boolean;
  canCreateInvite: boolean;
  onEditProfile: () => void;
  onInvite: () => void;
}

function localeForLanguage(language: string): string {
  if (language === "vi") return "vi-VN";
  if (language === "ja") return "ja-JP";
  if (language === "zh") return "zh-CN";
  return "en-US";
}

export default function ServerProfileDropdown({
  server,
  canManageProfile,
  canCreateInvite,
  onEditProfile,
  onInvite,
}: ServerProfileDropdownProps) {
  const { t, language } = useLanguage();
  const [profileStats, setProfileStats] = useState<serversApi.ServerProfileStats | null>(null);
  const [loading, setLoading] = useState(true);

  const banner = useMemo(() => normalizeServerBanner(server), [server]);
  const traits = useMemo(
    () => (server.profileTraits ?? []).filter((trait) => trait.text?.trim()),
    [server.profileTraits],
  );
  const description = server.description?.trim() ?? "";

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const stats = await serversApi.getServerProfileStats(server._id);
        if (!cancelled) setProfileStats(stats);
      } catch {
        if (!cancelled) setProfileStats(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [server._id]);

  const createdLabel = t("chat.serverProfile.info.createdAt", {
    date: new Date(profileStats?.createdAt ?? server.createdAt ?? Date.now()).toLocaleDateString(
      localeForLanguage(language),
    ),
  });

  const avatarInitial = (server.name || "?").trim().charAt(0).toUpperCase() || "?";

  return (
    <div className={styles.panel} role="region" aria-label={t("chat.serverProfileDropdown.title")}>
      <div className={styles.card}>
        <div className={styles.banner} style={{ background: banner.bannerColor }}>
          {banner.bannerImageUrl ? (
            <div
              className={styles.bannerImage}
              style={{ backgroundImage: `url(${banner.bannerImageUrl})` }}
            />
          ) : null}
        </div>

        <div className={styles.body}>
          <div className={styles.avatarRow}>
            {server.avatarUrl ? (
              <img
                src={server.avatarUrl}
                alt=""
                className={styles.avatar}
              />
            ) : (
              <div className={`${styles.avatar} ${styles.avatarFallback}`}>{avatarInitial}</div>
            )}
            <div className={styles.name} title={server.name}>
              {server.name || t("chat.sidebar.serverFallback")}
            </div>
          </div>

          {loading ? (
            <div className={styles.loading}>{t("chat.popups.loading")}</div>
          ) : (
            <div className={styles.stats}>
              <span>
                {t("chat.serverProfile.info.online", {
                  count: profileStats?.onlineCount ?? 0,
                })}
              </span>
              <span className={styles.statDot}>•</span>
              <span>
                {t("chat.serverProfile.info.members", {
                  count: profileStats?.memberCount ?? server.memberCount ?? 0,
                })}
              </span>
              <span className={styles.statDot}>•</span>
              <span>{createdLabel}</span>
            </div>
          )}

          <div className={styles.description}>
            {description || t("chat.serverProfile.preview.noDescription")}
          </div>

          {traits.length > 0 && (
            <div className={styles.traits}>
              {traits.map((trait, index) => (
                <div key={`${trait.text}-${index}`} className={styles.trait}>
                  <span className={styles.traitEmoji}>{trait.emoji || "🙂"}</span>
                  <span>{trait.text}</span>
                </div>
              ))}
            </div>
          )}

          <div className={styles.actions}>
            {canManageProfile && (
              <button
                type="button"
                className={`${styles.actionBtn} ${styles.actionPrimary}`}
                onClick={onEditProfile}
              >
                {t("chat.serverProfileDropdown.editProfile")}
              </button>
            )}
            {canCreateInvite && (
              <button
                type="button"
                className={`${styles.actionBtn} ${styles.actionSecondary}`}
                onClick={onInvite}
              >
                {t("chat.serverProfileDropdown.invitePeople")}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
