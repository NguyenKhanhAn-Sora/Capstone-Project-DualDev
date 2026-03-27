"use client";

import React, { useEffect, useMemo, useState } from "react";
import * as serversApi from "@/lib/servers-api";

interface ServerInteractionsSectionProps {
  serverId: string;
  canManageSettings: boolean;
  textChannels: serversApi.Channel[];
}

export default function ServerInteractionsSection({
  serverId,
  canManageSettings,
  textChannels,
}: ServerInteractionsSectionProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<serversApi.ServerInteractionSettings | null>(null);
  const [roles, setRoles] = useState<serversApi.Role[]>([]);

  const [notifTitle, setNotifTitle] = useState("");
  const [notifContent, setNotifContent] = useState("");
  const [notifTargetType, setNotifTargetType] = useState<"everyone" | "role">("everyone");
  const [notifRoleId, setNotifRoleId] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      serversApi.getInteractionSettings(serverId),
      serversApi.getRoles(serverId),
    ])
      .then(([s, rs]) => {
        if (cancelled) return;
        setSettings(s);
        setRoles(rs);
        const firstCustomRole = rs.find((r) => !r.isDefault);
        if (firstCustomRole) setNotifRoleId(firstCustomRole._id);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Không tải được cài đặt tương tác");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [serverId]);

  const canEdit = useMemo(
    () => Boolean(canManageSettings && settings?.canEdit),
    [canManageSettings, settings?.canEdit],
  );

  const updateSetting = async (
    patch: Partial<
      Pick<
        serversApi.ServerInteractionSettings,
        | "systemMessagesEnabled"
        | "welcomeMessageEnabled"
        | "stickerReplyWelcomeEnabled"
        | "defaultNotificationLevel"
        | "systemChannelId"
      >
    >,
  ) => {
    if (!canEdit) return;
    setSaving(true);
    setError(null);
    try {
      const next = await serversApi.updateInteractionSettings(serverId, patch);
      setSettings(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không lưu được cài đặt");
    } finally {
      setSaving(false);
    }
  };

  const handleSendRoleNotification = async () => {
    if (!canEdit) return;
    if (!notifTitle.trim() || !notifContent.trim()) {
      setError("Vui lòng nhập tiêu đề và nội dung thông báo");
      return;
    }
    if (notifTargetType === "role" && !notifRoleId) {
      setError("Vui lòng chọn vai trò");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const res = await serversApi.createRoleNotification(serverId, {
        title: notifTitle.trim(),
        content: notifContent.trim(),
        targetType: notifTargetType,
        roleId: notifTargetType === "role" ? notifRoleId : undefined,
      });
      setNotifTitle("");
      setNotifContent("");
      window.alert(`Đã gửi thông báo cho ${res.recipients} thành viên.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không gửi được thông báo");
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return <div style={{ color: "var(--color-panel-text-muted)" }}>Đang tải cài đặt tương tác...</div>;
  }

  if (!settings) {
    return <div style={{ color: "var(--color-panel-danger)" }}>{error || "Không tải được dữ liệu"}</div>;
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {error && (
        <div style={{ color: "var(--color-panel-danger)", fontSize: 13 }}>{error}</div>
      )}

      <section>
        <h3 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Tương Tác</h3>
        <p style={{ marginTop: 4, color: "var(--color-panel-text-muted)", fontSize: 13 }}>
          Chỉ chủ máy chủ hoặc thành viên có quyền Quản Lý Máy Chủ mới có thể thay đổi các cài đặt này.
        </p>
      </section>

      <section style={{ borderTop: "1px solid var(--color-panel-border)", paddingTop: 16 }}>
        <h4 style={{ margin: 0, fontSize: 20 }}>Tin Nhắn Hệ Thống</h4>
        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>Bật tin nhắn hệ thống</span>
            <input
              type="checkbox"
              checked={settings.systemMessagesEnabled}
              disabled={!canEdit || saving}
              onChange={(e) => updateSetting({ systemMessagesEnabled: e.target.checked })}
            />
          </label>
          <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>Gửi tin nhắn chào mừng thành viên mới</span>
            <input
              type="checkbox"
              checked={settings.welcomeMessageEnabled}
              disabled={!canEdit || saving}
              onChange={(e) => updateSetting({ welcomeMessageEnabled: e.target.checked })}
            />
          </label>
          <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>Giúp thành viên trả lời thông báo chào mừng bằng sticker</span>
            <input
              type="checkbox"
              checked={settings.stickerReplyWelcomeEnabled}
              disabled={!canEdit || saving || !settings.welcomeMessageEnabled}
              onChange={(e) => updateSetting({ stickerReplyWelcomeEnabled: e.target.checked })}
            />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span>Kênh tin nhắn hệ thống</span>
            <select
              value={settings.systemChannelId ?? ""}
              disabled={!canEdit || saving}
              onChange={(e) =>
                updateSetting({
                  systemChannelId: e.target.value || null,
                })
              }
            >
              <option value="">Không chọn</option>
              {textChannels.map((ch) => (
                <option key={ch._id} value={ch._id}>
                  #{ch.name}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span>Cài đặt thông báo mặc định</span>
            <select
              value={settings.defaultNotificationLevel}
              disabled={!canEdit || saving}
              onChange={(e) =>
                updateSetting({
                  defaultNotificationLevel:
                    e.target.value === "mentions" ? "mentions" : "all",
                })
              }
            >
              <option value="all">Tất cả các tin nhắn</option>
              <option value="mentions">Chỉ @mentions</option>
            </select>
          </label>
        </div>
      </section>

      <section style={{ borderTop: "1px solid var(--color-panel-border)", paddingTop: 16 }}>
        <h4 style={{ margin: 0, fontSize: 20 }}>Role Notification (Dành cho bạn)</h4>
        <p style={{ marginTop: 4, color: "var(--color-panel-text-muted)", fontSize: 13 }}>
          Gửi thông báo theo vai trò, thành viên nhận được sẽ thấy trong tab Dành cho bạn.
        </p>
        <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
          <input
            type="text"
            placeholder="Tiêu đề thông báo"
            value={notifTitle}
            disabled={!canEdit || sending}
            onChange={(e) => setNotifTitle(e.target.value)}
          />
          <textarea
            placeholder="Nội dung thông báo"
            value={notifContent}
            disabled={!canEdit || sending}
            onChange={(e) => setNotifContent(e.target.value)}
            rows={4}
          />
          <select
            value={notifTargetType}
            disabled={!canEdit || sending}
            onChange={(e) => setNotifTargetType(e.target.value as "everyone" | "role")}
          >
            <option value="everyone">@everyone</option>
            <option value="role">Theo vai trò</option>
          </select>
          {notifTargetType === "role" && (
            <select
              value={notifRoleId}
              disabled={!canEdit || sending}
              onChange={(e) => setNotifRoleId(e.target.value)}
            >
              {roles
                .filter((r) => !r.isDefault)
                .map((r) => (
                  <option key={r._id} value={r._id}>
                    {r.name}
                  </option>
                ))}
            </select>
          )}
          <button
            type="button"
            disabled={!canEdit || sending}
            onClick={handleSendRoleNotification}
            style={{ justifySelf: "start" }}
          >
            {sending ? "Đang gửi..." : "Gửi thông báo"}
          </button>
        </div>
      </section>
    </div>
  );
}
