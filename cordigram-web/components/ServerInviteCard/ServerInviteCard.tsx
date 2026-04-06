"use client";

import React, { useEffect, useState } from "react";
import { getServer, getServerProfileStats } from "@/lib/servers-api";

interface ServerInviteCardProps {
  serverId: string;
  inviteUrl: string;
}

export default function ServerInviteCard({ serverId, inviteUrl }: ServerInviteCardProps) {
  const [server, setServer] = useState<{
    name: string;
    avatarUrl?: string;
    memberCount: number;
    createdAt: string;
  } | null>(null);
  const [onlineCount, setOnlineCount] = useState<number>(0);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [srv, stats] = await Promise.all([
          getServer(serverId),
          getServerProfileStats(serverId).catch(() => null),
        ]);
        if (cancelled) return;
        setServer({
          name: srv.name,
          avatarUrl: srv.avatarUrl,
          memberCount: stats?.memberCount ?? srv.memberCount ?? srv.members?.length ?? 0,
          createdAt: srv.createdAt,
        });
        setOnlineCount(stats?.onlineCount ?? 0);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => { cancelled = true; };
  }, [serverId]);

  if (error || !server) {
    if (error) return null;
    return (
      <div style={{
        background: "#2b2d31",
        borderRadius: 8,
        padding: 16,
        maxWidth: 400,
        marginTop: 4,
      }}>
        <div style={{ width: 100, height: 12, borderRadius: 4, background: "#3f4147" }} />
      </div>
    );
  }

  const createdDate = new Date(server.createdAt);
  const monthYear = `thg ${createdDate.getMonth() + 1} ${createdDate.getFullYear()}`;
  const initial = (server.name || "?").charAt(0).toUpperCase();

  return (
    <div style={{
      background: "#2b2d31",
      borderRadius: 8,
      padding: 16,
      maxWidth: 400,
      marginTop: 4,
      border: "1px solid #3f4147",
    }}>
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
  );
}
