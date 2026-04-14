"use client";

import React, { useState, useCallback } from "react";
import styles from "./DisplayTab.module.css";
import type { Role } from "@/lib/servers-api";
import * as serversApi from "@/lib/servers-api";
import ColorPicker from "@/components/ColorPicker/ColorPicker";
import { useLanguage } from "@/component/language-provider";

interface DisplayTabProps {
  serverId: string;
  role: Role;
  isOwner: boolean;
  onUpdate: (role: Role) => void;
}

export default function DisplayTab({
  serverId,
  role,
  isOwner,
  onUpdate,
}: DisplayTabProps) {
  const { t } = useLanguage();
  const [name, setName] = useState(role.name);
  const [color, setColor] = useState(role.color);
  const [displaySeparately, setDisplaySeparately] = useState(role.displaySeparately);
  const [mentionable, setMentionable] = useState(role.mentionable);
  const [saving, setSaving] = useState(false);

  const hasChanges =
    name !== role.name ||
    color !== role.color ||
    displaySeparately !== role.displaySeparately ||
    mentionable !== role.mentionable;

  const handleSave = useCallback(async () => {
    if (!isOwner || !hasChanges) return;
    setSaving(true);
    try {
      const updated = await serversApi.updateRole(serverId, role._id, {
        name: role.isDefault ? undefined : name,
        color,
        displaySeparately,
        mentionable,
      });
      onUpdate(updated);
    } catch (err) {
      alert(err instanceof Error ? err.message : t("chat.roleDisplay.saveFailed"));
    } finally {
      setSaving(false);
    }
  }, [serverId, role, name, color, displaySeparately, mentionable, isOwner, hasChanges, onUpdate, t]);

  const handleReset = () => {
    setName(role.name);
    setColor(role.color);
    setDisplaySeparately(role.displaySeparately);
    setMentionable(role.mentionable);
  };

  React.useEffect(() => {
    setName(role.name);
    setColor(role.color);
    setDisplaySeparately(role.displaySeparately);
    setMentionable(role.mentionable);
  }, [role]);

  return (
    <div className={styles.container}>
      {/* Role Name */}
      <div className={styles.section}>
        <label className={styles.label}>
          {t("chat.roleDisplay.roleNameLabel")}{" "}
          <span className={styles.required}>{t("chat.roleDisplay.required")}</span>
        </label>
        <input
          type="text"
          className={styles.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={!isOwner || role.isDefault}
          maxLength={100}
          placeholder={t("chat.roleDisplay.roleNamePlaceholder")}
        />
      </div>

      {/* Role Style Preview */}
      <div className={styles.section}>
        <label className={styles.label}>{t("chat.roleDisplay.styleTitle")}</label>
        <div className={styles.stylePreview}>
          <div className={styles.previewCard} style={{ borderColor: color }}>
            <div className={styles.previewAvatar}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill={color}>
                <circle cx="12" cy="8" r="4" />
                <path d="M12 14c-4 0-8 2-8 4v2h16v-2c0-2-4-4-8-4z" />
              </svg>
            </div>
            <div className={styles.previewInfo}>
              <span className={styles.previewName} style={{ color }}>
                {t("chat.roleDisplay.previewName")}
              </span>
              <span className={styles.previewRole}>{t("chat.roleDisplay.previewRole")}</span>
            </div>
            <span className={styles.previewBadge}>{t("chat.roleDisplay.previewBadge")}</span>
          </div>
        </div>
      </div>

      {/* Role Color */}
      <div className={styles.section}>
        <label className={styles.label}>
          {t("chat.roleDisplay.colorLabel")}{" "}
          <span className={styles.required}>{t("chat.roleDisplay.required")}</span>
        </label>
        <p className={styles.hint}>{t("chat.roleDisplay.colorHint")}</p>
        <ColorPicker value={color} onChange={setColor} disabled={!isOwner} />
      </div>

      {/* Display Separately Toggle */}
      <div className={styles.toggleSection}>
        <div className={styles.toggleInfo}>
          <span className={styles.toggleLabel}>{t("chat.roleDisplay.displaySeparateToggle")}</span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={displaySeparately}
          className={`${styles.toggle} ${displaySeparately ? styles.toggleOn : ""}`}
          onClick={() => setDisplaySeparately((v) => !v)}
          disabled={!isOwner}
        >
          <span className={styles.toggleThumb} />
        </button>
      </div>

      {/* Mentionable Toggle */}
      <div className={styles.toggleSection}>
        <div className={styles.toggleInfo}>
          <span className={styles.toggleLabel}>{t("chat.roleDisplay.mentionableToggle")}</span>
          <span className={styles.toggleHint}>{t("chat.roleDisplay.mentionableHint")}</span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={mentionable}
          className={`${styles.toggle} ${mentionable ? styles.toggleOn : ""}`}
          onClick={() => setMentionable((v) => !v)}
          disabled={!isOwner}
        >
          <span className={styles.toggleThumb} />
        </button>
      </div>

      {/* View as Role Button */}
      <div className={styles.section}>
        <div className={styles.viewAsRole}>
          <div className={styles.viewAsRoleInfo}>
            <span className={styles.viewAsRoleTitle}>{t("chat.roleDisplay.viewAsRoleTitle")}</span>
            <span className={styles.viewAsRoleDesc}>{t("chat.roleDisplay.viewAsRoleDesc")}</span>
          </div>
          <button className={styles.viewAsRoleBtn} disabled>
            {t("chat.roleDisplay.viewAsRoleBtn")}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Save/Reset Bar */}
      {hasChanges && (
        <div className={styles.saveBar}>
          <span className={styles.saveBarText}>{t("chat.roleDisplay.unsavedBar")}</span>
          <div className={styles.saveBarActions}>
            <button
              className={styles.resetBtn}
              onClick={handleReset}
              disabled={saving}
            >
              {t("chat.roleDisplay.reset")}
            </button>
            <button
              className={styles.saveBtn}
              onClick={handleSave}
              disabled={saving || !isOwner}
            >
              {saving ? t("chat.roleDisplay.saving") : t("chat.roleDisplay.saveChanges")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
