"use client";

import React, { useState, useCallback, useEffect, useMemo } from "react";
import styles from "./PermissionsTab.module.css";
import type { Role, RolePermissions } from "@/lib/servers-api";
import * as serversApi from "@/lib/servers-api";
import { useLanguage } from "@/component/language-provider";
import { PERMISSION_LAYOUT } from "./permission-layout";

interface PermissionItem {
  key: keyof RolePermissions;
  label: string;
  description: string;
  warning?: string;
}

interface PermissionSection {
  title: string;
  permissions: PermissionItem[];
}

interface PermissionsTabProps {
  serverId: string;
  role: Role;
  isOwner: boolean;
  onUpdate: (role: Role) => void;
}

export default function PermissionsTab({
  serverId,
  role,
  isOwner,
  onUpdate,
}: PermissionsTabProps) {
  const { t } = useLanguage();

  const permissionSections = useMemo((): PermissionSection[] => {
    return PERMISSION_LAYOUT.map((sec) => ({
      title: t(`chat.rolePermissions.sections.${sec.sectionKey}`),
      permissions: sec.keys.map(({ key, hasWarning }) => {
        const base = `chat.rolePermissions.items.${String(key)}`;
        const item: PermissionItem = {
          key,
          label: t(`${base}.label`),
          description: t(`${base}.description`),
        };
        if (hasWarning) {
          item.warning = t(`${base}.warning`);
        }
        return item;
      }),
    }));
  }, [t]);

  const mergeRolePermissions = (r: Role): RolePermissions => {
    const raw = { ...r.permissions } as Record<string, unknown>;
    delete raw.createPublicThreads;
    delete raw.createPrivateThreads;
    const p = raw as unknown as RolePermissions;
    return {
      ...p,
      mentionEveryone: p.mentionEveryone ?? false,
      manageExpressions: p.manageExpressions ?? false,
    };
  };

  const [permissions, setPermissions] = useState<RolePermissions>(mergeRolePermissions(role));
  const [searchQuery, setSearchQuery] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setPermissions(mergeRolePermissions(role));
  }, [role]);

  const hasChanges =
    JSON.stringify(permissions) !== JSON.stringify(mergeRolePermissions(role));

  const handleToggle = (key: keyof RolePermissions) => {
    if (!isOwner) return;
    setPermissions((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleSave = useCallback(async () => {
    if (!isOwner || !hasChanges) return;
    setSaving(true);
    try {
      const updated = await serversApi.updateRole(serverId, role._id, {
        permissions,
      });
      onUpdate(updated);
    } catch (err) {
      alert(err instanceof Error ? err.message : t("chat.rolePermissions.saveFailed"));
    } finally {
      setSaving(false);
    }
  }, [serverId, role._id, permissions, isOwner, hasChanges, onUpdate, t]);

  const handleReset = () => {
    setPermissions(mergeRolePermissions(role));
  };

  const filteredSections = permissionSections
    .map((section) => ({
      ...section,
      permissions: section.permissions.filter(
        (p) =>
          p.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.description.toLowerCase().includes(searchQuery.toLowerCase()),
      ),
    }))
    .filter((section) => section.permissions.length > 0);

  return (
    <div className={styles.container}>
      <div className={styles.searchWrapper}>
        <svg
          className={styles.searchIcon}
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
        </svg>
        <input
          type="text"
          className={styles.searchInput}
          placeholder={t("chat.rolePermissions.searchPlaceholder")}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {filteredSections.map((section) => (
        <div key={section.title} className={styles.section}>
          <h3 className={styles.sectionTitle}>{section.title}</h3>
          <div className={styles.permissionsList}>
            {section.permissions.map((perm) => (
              <div key={perm.key} className={styles.permissionItem}>
                <div className={styles.permissionInfo}>
                  <span className={styles.permissionLabel}>{perm.label}</span>
                  <span className={styles.permissionDesc}>{perm.description}</span>
                  {perm.warning && (
                    <div className={styles.permissionWarning}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
                      </svg>
                      {perm.warning}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={permissions[perm.key]}
                  className={`${styles.toggle} ${
                    permissions[perm.key] ? styles.toggleOn : ""
                  }`}
                  onClick={() => handleToggle(perm.key)}
                  disabled={!isOwner}
                >
                  <span className={styles.toggleThumb} />
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}

      {filteredSections.length === 0 && (
        <div className={styles.noResults}>
          {t("chat.rolePermissions.noResults", { query: searchQuery })}
        </div>
      )}

      {hasChanges && (
        <div className={styles.saveBar}>
          <span className={styles.saveBarText}>{t("chat.rolePermissions.unsavedBar")}</span>
          <div className={styles.saveBarActions}>
            <button className={styles.resetBtn} onClick={handleReset} disabled={saving}>
              {t("chat.rolePermissions.reset")}
            </button>
            <button
              className={styles.saveBtn}
              onClick={handleSave}
              disabled={saving || !isOwner}
            >
              {saving ? t("chat.rolePermissions.saving") : t("chat.rolePermissions.saveChanges")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
