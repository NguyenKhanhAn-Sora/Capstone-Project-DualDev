"use client";

import React from "react";
import type { ModeratorMemberRow } from "@/lib/mod-view-api";
import styles from "./MemberDataGrid.module.css";
import { useLanguage } from "@/component/language-provider";

export interface MemberDataGridProps {
  rows: ModeratorMemberRow[];
  loading: boolean;
  onRowClick: (row: ModeratorMemberRow) => void;
}

function formatDate(date: string): string {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString();
}

export default function MemberDataGrid({
  rows,
  loading,
  onRowClick,
}: MemberDataGridProps) {
  const { t } = useLanguage();

  const joinMethodLabel = (row: ModeratorMemberRow): string => {
    if (row.joinMethod === "owner") return t("chat.modView.joinOwner");
    if (row.joinMethod === "invited" && row.invitedBy) {
      return t("chat.modView.joinInvited").replace("{name}", row.invitedBy.username);
    }
    return t("chat.modView.joinUrl");
  };

  const flagsLabel = (flags: ModeratorMemberRow["flags"]): string => {
    if (!flags || flags.length === 0) return "";
    return flags
      .map((f) => {
        if (f === "new-account") return t("chat.modView.flagNew");
        if (f === "spam") return t("chat.modView.flagSpam");
        if (f === "suspicious-invite") return t("chat.modView.flagSuspicious");
        return f;
      })
      .join(" • ");
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.headerRow}>
        <div className={styles.colUser}>{t("chat.modView.colUser")}</div>
        <div className={styles.colDate}>{t("chat.modView.colJoined")}</div>
        <div className={styles.colDate}>{t("chat.modView.colAccountAge")}</div>
        <div className={styles.colJoinMethod}>{t("chat.modView.colJoinMethod")}</div>
        <div className={styles.colRoles}>{t("chat.modView.colRoles")}</div>
        <div className={styles.colFlags}>{t("chat.modView.colFlags")}</div>
      </div>
      {loading ? (
        <div className={styles.loading}>{t("chat.modView.loading")}</div>
      ) : rows.length === 0 ? (
        <div className={styles.empty}>{t("chat.modView.empty")}</div>
      ) : (
        <div className={styles.body}>
          {rows.map((row) => (
            <button
              key={row.userId}
              type="button"
              className={styles.row}
              onClick={() => onRowClick(row)}
            >
              <div className={styles.colUser}>
                <div className={styles.avatarPlaceholder}>
                  {row.displayName.charAt(0).toUpperCase()}
                </div>
                <div className={styles.userText}>
                  <div className={styles.displayName}>{row.displayName}</div>
                  <div className={styles.username}>@{row.username}</div>
                </div>
              </div>
              <div className={styles.colDate}>{formatDate(row.joinedAt)}</div>
              <div className={styles.colDate}>{row.accountAgeDays} {t("chat.modView.days")}</div>
              <div className={styles.colJoinMethod}>{joinMethodLabel(row)}</div>
              <div className={styles.colRoles}>
                {row.roles.map((r) => (
                  <span
                    key={r._id}
                    className={styles.roleBadge}
                    style={{ borderColor: r.color, color: r.color }}
                  >
                    {r.name}
                  </span>
                ))}
              </div>
              <div className={styles.colFlags}>{flagsLabel(row.flags)}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

