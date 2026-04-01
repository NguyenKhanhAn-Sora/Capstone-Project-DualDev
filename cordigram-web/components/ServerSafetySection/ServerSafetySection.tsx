"use client";

import React, { useEffect, useState } from "react";
import * as serversApi from "@/lib/servers-api";

interface Props {
  serverId: string;
  canManageSettings: boolean;
  initialTab?: "spam" | "automod" | "privileges";
}

export default function ServerSafetySection({ serverId, canManageSettings, initialTab = "spam" }: Props) {
  const [settings, setSettings] = useState<serversApi.ServerSafetySettings | null>(null);
  const [tab, setTab] = useState<"spam" | "automod" | "privileges">(initialTab);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    serversApi.getServerSafetySettings(serverId).then(setSettings).catch(() => setSettings(null));
  }, [serverId]);

  const save = async (next: serversApi.ServerSafetySettings) => {
    setSettings(next);
    if (!canManageSettings) return;
    await serversApi.updateServerSafetySettings(serverId, next);
  };

  if (!settings) return <div>Không tải được thiết lập an toàn.</div>;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" onClick={() => setTab("spam")}>Ngăn chặn spam</button>
        <button type="button" onClick={() => setTab("automod")}>AutoMod</button>
        <button type="button" onClick={() => setTab("privileges")}>Quyền hạn</button>
      </div>

      {tab === "spam" && (
        <div style={{ display: "grid", gap: 8 }}>
          <label>Mức xác minh</label>
          <select
            disabled={!canManageSettings}
            value={settings.spamProtection.verificationLevel}
            onChange={(e) => save({ ...settings, spamProtection: { ...settings.spamProtection, verificationLevel: e.target.value as any } })}
          >
            <option value="low">Thấp (email)</option>
            <option value="medium">Trung bình (account &gt; 5 phút)</option>
            <option value="high">Cao (join server &gt; 10 phút)</option>
          </select>
          <label><input type="checkbox" checked={settings.spamProtection.warnExternalLinks} onChange={(e) => save({ ...settings, spamProtection: { ...settings.spamProtection, warnExternalLinks: e.target.checked } })} /> Cảnh báo link ngoài whitelist</label>
          <label><input type="checkbox" checked={settings.spamProtection.hideSpamMessages} onChange={(e) => save({ ...settings, spamProtection: { ...settings.spamProtection, hideSpamMessages: e.target.checked } })} /> Ẩn tin nhắn spam</label>
          <label><input type="checkbox" checked={settings.spamProtection.deleteSpammerMessages} onChange={(e) => save({ ...settings, spamProtection: { ...settings.spamProtection, deleteSpammerMessages: e.target.checked } })} /> Xóa tin nhắn của spammer</label>
        </div>
      )}

      {tab === "automod" && (
        <div style={{ display: "grid", gap: 8 }}>
          <label>Từ cấm (phân tách dấu phẩy)</label>
          <input
            disabled={!canManageSettings}
            value={settings.automod.bannedWords.join(", ")}
            onChange={(e) => save({ ...settings, automod: { ...settings.automod, bannedWords: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) } })}
          />
          <label>Phản hồi từ cấm</label>
          <select
            disabled={!canManageSettings}
            value={settings.automod.bannedWordResponse}
            onChange={(e) => save({ ...settings, automod: { ...settings.automod, bannedWordResponse: e.target.value as any } })}
          >
            <option value="warn">Cảnh báo</option>
            <option value="delete">Xóa/chặn tin nhắn</option>
          </select>
          <label>Số mention tối đa trong {settings.automod.mentionSpamWindowMinutes} phút</label>
          <input
            type="number"
            min={1}
            max={50}
            disabled={!canManageSettings}
            value={settings.automod.mentionSpamLimit}
            onChange={(e) => save({ ...settings, automod: { ...settings.automod, mentionSpamLimit: Number(e.target.value || 1) } })}
          />
        </div>
      )}

      {tab === "privileges" && (
        <div style={{ display: "grid", gap: 8 }}>
          <label>Role bypass (IDs, dấu phẩy)</label>
          <input
            disabled={!canManageSettings}
            value={settings.privileges.bypassRoleIds.join(", ")}
            onChange={(e) => save({ ...settings, privileges: { ...settings.privileges, bypassRoleIds: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) } })}
          />
          <label>Role quản lý safety (IDs, dấu phẩy)</label>
          <input
            disabled={!canManageSettings}
            value={settings.privileges.managerRoleIds.join(", ")}
            onChange={(e) => save({ ...settings, privileges: { ...settings.privileges, managerRoleIds: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) } })}
          />
        </div>
      )}
    </div>
  );
}

