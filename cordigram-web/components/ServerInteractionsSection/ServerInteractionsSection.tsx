"use client";

import React, { useEffect, useMemo, useState } from "react";
import * as serversApi from "@/lib/servers-api";
import { useLanguage } from "@/component/language-provider";

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
  const { t } = useLanguage();
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
        setError(e instanceof Error ? e.message : t("chat.serverInteractions.loadFail"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [serverId, t]);

  const canEdit = useMemo(
    () => Boolean(canManageSettings && settings?.canEdit),
    [canManageSettings, settings?.canEdit],
  );

  const updateSetting = async (
    patch: Partial<Pick<serversApi.ServerInteractionSettings,
      | "systemMessagesEnabled"
      | "welcomeMessageEnabled"
      | "stickerReplyWelcomeEnabled"
      | "defaultNotificationLevel"
      | "systemChannelId"
    >>,
  ) => {
    if (!canEdit) return;
    setSaving(true);
    setError(null);
    try {
      const next = await serversApi.updateInteractionSettings(serverId, patch);
      setSettings(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("chat.serverInteractions.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const handleSendRoleNotification = async () => {
    if (!canEdit) return;
    if (!notifTitle.trim() || !notifContent.trim()) {
      setError(t("chat.serverInteractions.errTitle"));
      return;
    }
    if (notifTargetType === "role" && !notifRoleId) {
      setError(t("chat.serverInteractions.errRole"));
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
      window.alert(t("chat.serverInteractions.sentAlert").replace("{n}", String(res.recipients)));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("chat.serverInteractions.sendError"));
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return <div style={{ color: "var(--color-panel-text-muted)" }}>{t("chat.serverInteractions.loading")}</div>;
  }

  if (!settings) {
    return <div style={{ color: "var(--color-panel-danger)" }}>{error || t("chat.serverInteractions.loadError")}</div>;
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {error && (
        <div style={{ color: "var(--color-panel-danger)", fontSize: 13 }}>{error}</div>
      )}

      <section>
        <h3 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>{t("chat.serverInteractions.title")}</h3>
        <p style={{ marginTop: 4, color: "var(--color-panel-text-muted)", fontSize: 13 }}>
          {t("chat.serverInteractions.desc")}
        </p>
      </section>

      <section style={{ borderTop: "1px solid var(--color-panel-border)", paddingTop: 16 }}>
        <h4 style={{ margin: 0, fontSize: 20 }}>{t("chat.serverInteractions.systemMessages")}</h4>
        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>{t("chat.serverInteractions.enableSystem")}</span>
            <input
              type="checkbox"
              checked={settings.systemMessagesEnabled}
              disabled={!canEdit || saving}
              onChange={(e) => updateSetting({ systemMessagesEnabled: e.target.checked })}
            />
          </label>
          <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>{t("chat.serverInteractions.sendWelcome")}</span>
            <input
              type="checkbox"
              checked={settings.welcomeMessageEnabled}
              disabled={!canEdit || saving}
              onChange={(e) => updateSetting({ welcomeMessageEnabled: e.target.checked })}
            />
          </label>
          <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>{t("chat.serverInteractions.stickerReply")}</span>
            <input
              type="checkbox"
              checked={settings.stickerReplyWelcomeEnabled}
              disabled={!canEdit || saving || !settings.welcomeMessageEnabled}
              onChange={(e) => updateSetting({ stickerReplyWelcomeEnabled: e.target.checked })}
            />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span>{t("chat.serverInteractions.systemChannel")}</span>
            <select
              value={settings.systemChannelId ?? ""}
              disabled={!canEdit || saving}
              onChange={(e) => updateSetting({ systemChannelId: e.target.value || null })}
            >
              <option value="">{t("chat.serverInteractions.noChannel")}</option>
              {textChannels.map((ch) => (
                <option key={ch._id} value={ch._id}>#{ch.name}</option>
              ))}
            </select>
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span>{t("chat.serverInteractions.defaultNotif")}</span>
            <select
              value={settings.defaultNotificationLevel}
              disabled={!canEdit || saving}
              onChange={(e) =>
                updateSetting({ defaultNotificationLevel: e.target.value === "mentions" ? "mentions" : "all" })
              }
            >
              <option value="all">{t("chat.serverInteractions.notifAll")}</option>
              <option value="mentions">{t("chat.serverInteractions.notifMentions")}</option>
            </select>
          </label>
        </div>
      </section>

      <section style={{ borderTop: "1px solid var(--color-panel-border)", paddingTop: 16 }}>
        <h4 style={{ margin: 0, fontSize: 20 }}>{t("chat.serverInteractions.roleNotif")}</h4>
        <p style={{ marginTop: 4, color: "var(--color-panel-text-muted)", fontSize: 13 }}>
          {t("chat.serverInteractions.roleNotifDesc")}
        </p>
        <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
          <input
            type="text"
            placeholder={t("chat.serverInteractions.notifTitlePlaceholder")}
            value={notifTitle}
            disabled={!canEdit || sending}
            onChange={(e) => setNotifTitle(e.target.value)}
          />
          <textarea
            placeholder={t("chat.serverInteractions.notifContentPlaceholder")}
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
            <option value="everyone">{t("chat.serverInteractions.targetEveryone")}</option>
            <option value="role">{t("chat.serverInteractions.targetRole")}</option>
          </select>
          {notifTargetType === "role" && (
            <select
              value={notifRoleId}
              disabled={!canEdit || sending}
              onChange={(e) => setNotifRoleId(e.target.value)}
            >
              {roles.filter((r) => !r.isDefault).map((r) => (
                <option key={r._id} value={r._id}>{r.name}</option>
              ))}
            </select>
          )}
          <button
            type="button"
            disabled={!canEdit || sending}
            onClick={handleSendRoleNotification}
            style={{ justifySelf: "start" }}
          >
            {sending ? t("chat.serverInteractions.sendingBtn") : t("chat.serverInteractions.sendBtn")}
          </button>
        </div>
      </section>
    </div>
  );
}
