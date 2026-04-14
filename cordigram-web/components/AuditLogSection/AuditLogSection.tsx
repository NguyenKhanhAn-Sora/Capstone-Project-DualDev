"use client";

import React, { useEffect, useMemo, useState } from "react";
import * as serversApi from "@/lib/servers-api";

interface Props {
  serverId: string;
}

const ACTIONS = [
  { value: "", label: "Tất cả hành động" },
  { value: "server.update", label: "Cập nhật máy chủ" },
  { value: "channel.create", label: "Tạo kênh" },
  { value: "channel.update", label: "Cập nhật kênh" },
  { value: "channel.delete", label: "Xóa kênh" },
];

export default function AuditLogSection({ serverId }: Props) {
  const [rows, setRows] = useState<serversApi.ServerAuditLogRow[]>([]);
  const [members, setMembers] = useState<serversApi.MemberWithRoles[]>([]);
  const [action, setAction] = useState("");
  const [actorUserId, setActorUserId] = useState("");

  useEffect(() => {
    (async () => {
      const [logs, m] = await Promise.all([
        serversApi.getServerAuditLogs(serverId, { action: action || undefined, actorUserId: actorUserId || undefined, limit: 80 }),
        serversApi.getServerMembersWithRoles(serverId),
      ]);
      setRows(logs);
      setMembers(m.members || []);
    })().catch(() => {
      setRows([]);
      setMembers([]);
    });
  }, [serverId, action, actorUserId]);

  const memberOptions = useMemo(
    () => members.map((m) => ({ id: m.userId, label: m.displayName || m.username })),
    [members],
  );

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <select value={actorUserId} onChange={(e) => setActorUserId(e.target.value)}>
          <option value="">Tất cả người dùng</option>
          {memberOptions.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
        <select value={action} onChange={(e) => setAction(e.target.value)}>
          {ACTIONS.map((a) => <option key={a.value || "all"} value={a.value}>{a.label}</option>)}
        </select>
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {rows.map((row) => (
          <div key={row._id} style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: 10 }}>
            <div style={{ fontWeight: 600 }}>{row.action} {row.targetName ? `- ${row.targetName}` : ""}</div>
            <div style={{ opacity: 0.8, fontSize: 12 }}>{new Date(row.createdAt).toLocaleString("vi-VN")}</div>
            {(row.changes || []).length > 0 && (
              <div style={{ marginTop: 6, fontSize: 13 }}>
                {(row.changes || []).map((c, i) => (
                  <div key={`${row._id}-c-${i}`}>- {c.field}: "{c.from ?? ""}" → "{c.to ?? ""}"</div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

