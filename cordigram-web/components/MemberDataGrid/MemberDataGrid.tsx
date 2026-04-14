"use client";

import React from "react";
import type { ModeratorMemberRow } from "@/lib/mod-view-api";
import styles from "./MemberDataGrid.module.css";

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

function joinMethodLabel(row: ModeratorMemberRow): string {
  if (row.joinMethod === "owner") return "Chủ máy chủ";
  if (row.joinMethod === "invited" && row.invitedBy) {
    return `Mời bởi ${row.invitedBy.username}`;
  }
  return "Tham gia bằng URL";
}

function flagsLabel(flags: ModeratorMemberRow["flags"]): string {
  if (!flags || flags.length === 0) return "";
  return flags
    .map((f) => {
      if (f === "new-account") return "New";
      if (f === "spam") return "Spam";
      if (f === "suspicious-invite") return "Lời mời đáng ngờ";
      return f;
    })
    .join(" • ");
}

export default function MemberDataGrid({
  rows,
  loading,
  onRowClick,
}: MemberDataGridProps) {
  return (
    <div className={styles.wrapper}>
      <div className={styles.headerRow}>
        <div className={styles.colUser}>Tên người dùng</div>
        <div className={styles.colDate}>Gia nhập server</div>
        <div className={styles.colDate}>Tuổi tài khoản</div>
        <div className={styles.colJoinMethod}>Phương thức tham gia</div>
        <div className={styles.colRoles}>Vai trò</div>
        <div className={styles.colFlags}>Tín hiệu</div>
      </div>
      {loading ? (
        <div className={styles.loading}>Đang tải dữ liệu Moderator View...</div>
      ) : rows.length === 0 ? (
        <div className={styles.empty}>Không có thành viên nào.</div>
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
              <div className={styles.colDate}>{row.accountAgeDays} ngày</div>
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

