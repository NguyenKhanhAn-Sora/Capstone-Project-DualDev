"use client";

import React, { useEffect, useRef, useState } from "react";
import { useLanguage, localeTagForLanguage } from "@/component/language-provider";
import { getServerEmbedPreview } from "@/lib/servers-api";
import ServerBannerStrip from "@/components/ServerBannerStrip/ServerBannerStrip";
import styles from "./ServerInviteCard.module.css";

interface ServerInviteCardProps {
  serverId: string;
  inviteUrl: string;
}

function isLikelyMongoObjectId(id: string): boolean {
  return /^[a-f\d]{24}$/i.test(String(id || "").trim());
}

export default function ServerInviteCard({ serverId, inviteUrl }: ServerInviteCardProps) {
  const { t, language } = useLanguage();
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(false);
  const [server, setServer] = useState<{
    name: string;
    avatarUrl?: string;
    bannerUrl?: string | null;
    bannerImageUrl?: string | null;
    bannerColor?: string | null;
    memberCount: number;
    createdAt: string;
  } | null>(null);
  const [onlineCount, setOnlineCount] = useState<number>(0);
  const [error, setError] = useState(false);

  useEffect(() => {
    const el = mountRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { root: null, rootMargin: "200px 0px", threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!inView) return;
    if (!isLikelyMongoObjectId(serverId)) {
      setServer(null);
      setError(true);
      return;
    }
    setError(false);
    (async () => {
      try {
        const { server: srv } = await getServerEmbedPreview(serverId);
        if (cancelled) return;
        if (!srv) {
          setError(true);
          return;
        }
        setServer({
          name: srv.name,
          avatarUrl: srv.avatarUrl ?? undefined,
          bannerUrl: srv.bannerUrl,
          bannerImageUrl: srv.bannerImageUrl,
          bannerColor: srv.bannerColor,
          memberCount: srv.memberCount,
          createdAt: srv.createdAt,
        });
        setOnlineCount(srv.onlineCount ?? 0);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [inView, serverId]);

  if (error) return null;

  if (!server) {
    return (
      <div ref={mountRef} className={styles.card}>
        <div className={styles.skeleton}>
          <div className={styles.skeletonBar} />
        </div>
      </div>
    );
  }

  const localeTag = localeTagForLanguage(language);
  const createdDate = new Date(server.createdAt);
  const foundedLabel = Number.isNaN(createdDate.getTime())
    ? ""
    : t("chat.serverInviteCard.founded", {
        date: createdDate.toLocaleDateString(localeTag, {
          month: "short",
          year: "numeric",
        }),
      });
  const initial = (server.name || "?").charAt(0).toUpperCase();

  return (
    <div ref={mountRef} className={styles.card}>
      <ServerBannerStrip server={server} height={72} />
      <div className={styles.body}>
        <div className={styles.headerRow}>
          {server.avatarUrl ? (
            <img
              src={server.avatarUrl}
              alt={server.name}
              className={styles.avatar}
            />
          ) : (
            <div className={styles.avatarPlaceholder}>{initial}</div>
          )}
          <div className={styles.meta}>
            <div className={styles.serverName}>{server.name}</div>
            <div className={styles.statsRow}>
              {onlineCount > 0 ? (
                <span className={styles.stat}>
                  <span className={styles.dotOnline} aria-hidden />
                  {t("chat.serverInviteCard.online", { n: onlineCount })}
                </span>
              ) : null}
              <span className={styles.stat}>
                <span className={styles.dotMembers} aria-hidden />
                {t("chat.serverInviteCard.members", { n: server.memberCount })}
              </span>
            </div>
            {foundedLabel ? (
              <div className={styles.founded}>{foundedLabel}</div>
            ) : null}
          </div>
        </div>
        <a href={inviteUrl} className={styles.joinBtn}>
          {t("chat.serverInviteCard.goToServer")}
        </a>
      </div>
    </div>
  );
}
