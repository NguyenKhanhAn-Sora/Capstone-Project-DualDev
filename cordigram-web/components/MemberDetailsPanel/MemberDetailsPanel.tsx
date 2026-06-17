"use client";

import React from "react";
import type { ModeratorMemberDetail } from "@/lib/mod-view-api";
import styles from "./MemberDetailsPanel.module.css";
import { useLanguage } from "@/component/language-provider";

interface MemberDetailsPanelProps {
  detail: ModeratorMemberDetail | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}

export default function MemberDetailsPanel({
  detail,
  loading,
  error,
  onClose,
}: MemberDetailsPanelProps) {
  const { t } = useLanguage();
  const basic = detail?.basic;
  const activity = detail?.activity;
  const roles = detail?.roles;

  const joinMethodLabel = (): string => {
    if (!basic) return "";
    if (basic.joinMethod === "owner") return t("chat.modView.joinOwner");
    if (basic.joinMethod === "invited" && basic.invitedBy) {
      return t("chat.modView.joinInvited").replace("{name}", basic.invitedBy.username);
    }
    return t("chat.modView.joinUrl");
  };

  return (
    <aside className={styles.panel}>
      <header className={styles.header}>
        <div>
          <h2 className={styles.title}>{t("chat.modView.detailTitle")}</h2>
          {basic && (
            <p className={styles.subtitle}>
              {basic.displayName} (@{basic.username})
            </p>
          )}
        </div>
        <button
          type="button"
          className={styles.closeBtn}
          onClick={onClose}
          aria-label={t("chat.modView.close")}
        >
          ×
        </button>
      </header>

      {loading && <div className={styles.section}>{t("chat.modView.detailLoading")}</div>}
      {error && <div className={styles.error}>{error}</div>}

      {!loading && !error && basic && (
        <>
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>{t("chat.modView.activity")}</h3>
            <div className={styles.statRow}>
              <span>{t("chat.modView.messages30d")}</span>
              <strong>{activity?.messageCountLast30d ?? 0}</strong>
            </div>
            <div className={styles.statRow}>
              <span>{t("chat.modView.links30d")}</span>
              <strong>{activity?.linkCountLast30d ?? 0}</strong>
            </div>
            <div className={styles.statRow}>
              <span>{t("chat.modView.media30d")}</span>
              <strong>{activity?.mediaCountLast30d ?? 0}</strong>
            </div>
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>{t("chat.modView.roles")}</h3>
            <div className={styles.rolesList}>
              {roles?.assigned.map((r) => (
                <span
                  key={r._id}
                  className={styles.roleBadge}
                  style={{ borderColor: r.color, color: r.color }}
                >
                  {r.name}
                </span>
              ))}
            </div>
            <p className={styles.sectionHint}>
              {t("chat.modView.rolesHint")}
            </p>
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>{t("chat.modView.accountInfo")}</h3>
            <div className={styles.statRow}>
              <span>{t("chat.modView.accountCreated")}</span>
              <strong>{new Date(basic.accountCreatedAt).toLocaleDateString()}</strong>
            </div>
            <div className={styles.statRow}>
              <span>{t("chat.modView.serverJoined")}</span>
              <strong>{new Date(basic.joinedAt).toLocaleDateString()}</strong>
            </div>
            <div className={styles.statRow}>
              <span>{t("chat.modView.joinMethod")}</span>
              <strong>{joinMethodLabel()}</strong>
            </div>
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>{t("chat.modView.auditLog")}</h3>
            <p className={styles.sectionHint}>
              {t("chat.modView.auditLogHint")}
            </p>
          </section>
        </>
      )}
    </aside>
  );
}

