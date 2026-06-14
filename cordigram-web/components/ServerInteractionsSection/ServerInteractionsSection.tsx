"use client";
import { appAlert, appConfirm, appPrompt } from "@/lib/app-dialog";
import React, { useEffect, useMemo, useRef, useState } from "react";
import * as serversApi from "@/lib/servers-api";
import { useLanguage } from "@/component/language-provider";
import { translateChannelName } from "@/lib/system-names";
import styles from "./ServerInteractionsSection.module.css";

/* ── Chevron SVG ─────────────────────────────────────────────────────────── */
const ChevronDown = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const SendIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

/* ── CustomSelect ────────────────────────────────────────────────────────── */
interface SelectOption { value: string; label: string }
interface CustomSelectProps {
  value: string;
  options: SelectOption[];
  onChange: (v: string) => void;
  disabled?: boolean;
}

function CustomSelect({ value, options, onChange, disabled }: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className={styles.selectWrap} ref={wrapRef}>
      <button
        type="button"
        className={`${styles.selectBtn} ${open ? styles.selectBtnOpen : ""}`}
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
      >
        <span>{current?.label ?? value}</span>
        <span className={styles.selectChevron}><ChevronDown /></span>
      </button>
      {open && (
        <div className={styles.selectDropdown}>
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`${styles.selectOption} ${opt.value === value ? styles.selectOptionActive : ""}`}
              onClick={() => { onChange(opt.value); setOpen(false); }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── CheckRow ────────────────────────────────────────────────────────────── */
interface CheckRowProps {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}

function CheckRow({ label, checked, disabled, onChange }: CheckRowProps) {
  return (
    <label
      className={`${styles.checkRow} ${disabled ? styles.checkRowDisabled : ""}`}
      onClick={() => !disabled && onChange(!checked)}
    >
      <span className={styles.checkLabel}>{label}</span>
      <div className={`${styles.toggle} ${checked ? styles.toggleOn : ""}`}>
        <span className={styles.toggleThumb} />
      </div>
    </label>
  );
}

/* ── Main component ──────────────────────────────────────────────────────── */
interface ServerInteractionsSectionProps {
  serverId: string;
  canManageSettings: boolean;
  textChannels: serversApi.Channel[];
  onSettingsChange?: (settings: serversApi.ServerInteractionSettings) => void;
}

export default function ServerInteractionsSection({
  serverId,
  canManageSettings,
  textChannels,
  onSettingsChange,
}: ServerInteractionsSectionProps) {
  const { t, language } = useLanguage();
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
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [serverId, t]);

  const canEdit = useMemo(
    () => Boolean(canManageSettings && settings?.canEdit),
    [canManageSettings, settings?.canEdit],
  );

  const updateSetting = async (
    patch: Partial<Pick<serversApi.ServerInteractionSettings,
      | "systemMessagesEnabled" | "welcomeMessageEnabled"
      | "stickerReplyWelcomeEnabled" | "defaultNotificationLevel" | "systemChannelId"
    >>,
  ) => {
    if (!canEdit) return;
    setSaving(true);
    setError(null);
    try {
      const next = await serversApi.updateInteractionSettings(serverId, patch);
      setSettings(next);
      onSettingsChange?.(next);
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
      appAlert(t("chat.serverInteractions.sentAlert").replace("{n}", String(res.recipients)));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("chat.serverInteractions.sendError"));
    } finally {
      setSending(false);
    }
  };

  if (loading) return <div className={styles.loading}>{t("chat.serverInteractions.loading")}</div>;
  if (!settings) {
    return <div className={styles.errorBar}>{error || t("chat.serverInteractions.loadError")}</div>;
  }

  /* Channel options */
  const channelOptions: SelectOption[] = [
    { value: "", label: t("chat.serverInteractions.noChannel") },
    ...textChannels.map((ch) => ({
      value: ch._id,
      label: `#${translateChannelName(ch.name, language)}`,
    })),
  ];

  /* Notification level options */
  const notifLevelOptions: SelectOption[] = [
    { value: "all",      label: t("chat.serverInteractions.notifAll") },
    { value: "mentions", label: t("chat.serverInteractions.notifMentions") },
  ];

  /* Notification target options */
  const targetOptions: SelectOption[] = [
    { value: "everyone", label: t("chat.serverInteractions.targetEveryone") },
    { value: "role",     label: t("chat.serverInteractions.targetRole") },
  ];

  /* Role options */
  const roleOptions: SelectOption[] = roles
    .filter((r) => !r.isDefault)
    .map((r) => ({ value: r._id, label: r.name }));

  return (
    <div className={styles.wrap}>
      {error && <div className={styles.errorBar}>{error}</div>}

      {/* ── System messages card ── */}
      <div className={styles.sectionCard}>
        <div className={styles.sectionTitle}>{t("chat.serverInteractions.systemMessages")}</div>

        <CheckRow
          label={t("chat.serverInteractions.enableSystem")}
          checked={settings.systemMessagesEnabled}
          disabled={!canEdit || saving}
          onChange={(v) => updateSetting({ systemMessagesEnabled: v })}
        />
        <CheckRow
          label={t("chat.serverInteractions.sendWelcome")}
          checked={settings.welcomeMessageEnabled}
          disabled={!canEdit || saving}
          onChange={(v) => updateSetting({ welcomeMessageEnabled: v })}
        />
        <CheckRow
          label={t("chat.serverInteractions.stickerReply")}
          checked={settings.stickerReplyWelcomeEnabled}
          disabled={!canEdit || saving || !settings.welcomeMessageEnabled}
          onChange={(v) => updateSetting({ stickerReplyWelcomeEnabled: v })}
        />

        <div className={styles.fieldGroup}>
          <div className={styles.fieldLabel}>{t("chat.serverInteractions.systemChannel")}</div>
          <CustomSelect
            value={settings.systemChannelId ?? ""}
            options={channelOptions}
            disabled={!canEdit || saving}
            onChange={(v) => updateSetting({ systemChannelId: v || null })}
          />
        </div>

        <div className={styles.fieldGroup}>
          <div className={styles.fieldLabel}>{t("chat.serverInteractions.defaultNotif")}</div>
          <CustomSelect
            value={settings.defaultNotificationLevel}
            options={notifLevelOptions}
            disabled={!canEdit || saving}
            onChange={(v) =>
              updateSetting({ defaultNotificationLevel: v === "mentions" ? "mentions" : "all" })
            }
          />
        </div>
      </div>

      {/* ── Role notification card ── */}
      <div className={styles.sectionCard}>
        <div className={styles.sectionTitle}>{t("chat.serverInteractions.roleNotif")}</div>
        <p className={styles.sectionDesc}>{t("chat.serverInteractions.roleNotifDesc")}</p>

        <div className={styles.notifForm}>
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

          <div className={styles.fieldGroup}>
            <div className={styles.fieldLabel}>{t("chat.serverInteractions.targetEveryone")}</div>
            <CustomSelect
              value={notifTargetType}
              options={targetOptions}
              disabled={!canEdit || sending}
              onChange={(v) => setNotifTargetType(v as "everyone" | "role")}
            />
          </div>

          {notifTargetType === "role" && roleOptions.length > 0 && (
            <div className={styles.fieldGroup}>
              <div className={styles.fieldLabel}>{t("chat.serverInteractions.targetRole")}</div>
              <CustomSelect
                value={notifRoleId}
                options={roleOptions}
                disabled={!canEdit || sending}
                onChange={setNotifRoleId}
              />
            </div>
          )}

          <button
            type="button"
            className={styles.sendBtn}
            disabled={!canEdit || sending}
            onClick={handleSendRoleNotification}
          >
            <SendIcon />
            {sending ? t("chat.serverInteractions.sendingBtn") : t("chat.serverInteractions.sendBtn")}
          </button>
        </div>
      </div>
    </div>
  );
}
