"use client";

import React, { useEffect, useRef, useState } from "react";
import { getServerEmbedPreview } from "@/lib/servers-api";
import ServerBannerStrip from "@/components/ServerBannerStrip/ServerBannerStrip";

interface ServerInviteCardProps {
  serverId: string;
  inviteUrl: string;
}

function isLikelyMongoObjectId(id: string): boolean {
  return /^[a-f\d]{24}$/i.test(String(id || "").trim());
}

export default function ServerInviteCard({ serverId, inviteUrl }: ServerInviteCardProps) {
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

  /** Tránh gọi hàng chục GET /servers/:id khi cuộn lịch sử DM — chỉ fetch khi preview gần viewport. */
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

  if (error || !server) {
    if (error) return null;
    return (
      <div
        ref={mountRef}
        style={{
          background: "#2b2d31",
          borderRadius: 8,
          padding: 16,
          maxWidth: 400,
          marginTop: 4,
        }}
      >
        <div style={{ width: 100, height: 12, borderRadius: 4, background: "#3f4147" }} />
      </div>
    );
  }

  const createdDate = new Date(server.createdAt);
  const monthYear = `thg ${createdDate.getMonth() + 1} ${createdDate.getFullYear()}`;
  const initial = (server.name || "?").charAt(0).toUpperCase();

  return (
    <div
      ref={mountRef}
      style={{
      background: "#2b2d31",
      borderRadius: 8,
      maxWidth: 400,
      marginTop: 4,
      border: "1px solid #3f4147",
      overflow: "hidden",
    }}
    >
      <ServerBannerStrip server={server} height={72} />
      <div style={{ padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        {server.avatarUrl ? (
          <img
            src={server.avatarUrl}
            alt={server.name}
            style={{ width: 48, height: 48, borderRadius: 12, objectFit: "cover", flexShrink: 0 }}
          />
        ) : (
          <div style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            background: "#1e1f22",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 20,
            fontWeight: 700,
            color: "#dbdee1",
            flexShrink: 0,
          }}>
            {initial}
          </div>
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: "#f2f3f5", display: "flex", alignItems: "center", gap: 4 }}>
            {server.name}
          </div>
          <div style={{ fontSize: 12, color: "#b5bac1", marginTop: 2, display: "flex", alignItems: "center", gap: 8 }}>
            {onlineCount > 0 && (
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#23a55a", display: "inline-block" }} />
                {onlineCount} Trực tuyến
              </span>
            )}
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#80848e", display: "inline-block" }} />
              {server.memberCount} thành viên
            </span>
          </div>
          <div style={{ fontSize: 11, color: "#949ba4", marginTop: 2 }}>
            Thành lập từ {monthYear}
          </div>
        </div>
      </div>
      <a
        href={inviteUrl}
        style={{
          display: "block",
          textAlign: "center",
          padding: "8px 16px",
          borderRadius: 4,
          background: "#248046",
          color: "#fff",
          fontWeight: 600,
          fontSize: 14,
          textDecoration: "none",
          cursor: "pointer",
        }}
        onMouseOver={(e) => { (e.target as HTMLElement).style.background = "#1a6334"; }}
        onMouseOut={(e) => { (e.target as HTMLElement).style.background = "#248046"; }}
      >
        Đi tới Máy chủ
      </a>
      </div>
    </div>
  );
}
