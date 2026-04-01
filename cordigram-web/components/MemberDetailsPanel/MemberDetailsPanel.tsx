"use client";

import React from "react";
import type { ModeratorMemberDetail } from "@/lib/mod-view-api";
import styles from "./MemberDetailsPanel.module.css";

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
  const basic = detail?.basic;
  const activity = detail?.activity;
  const roles = detail?.roles;

  return (
    <aside className={styles.panel}>
      <header className={styles.header}>
        <div>
          <h2 className={styles.title}>Chế Độ Hiển Thị Mod</h2>
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
          aria-label="Đóng"
        >
          ×
        </button>
      </header>

      {loading && <div className={styles.section}>Đang tải chi tiết thành viên...</div>}
      {error && <div className={styles.error}>{error}</div>}

      {!loading && !error && basic && (
        <>
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Hoạt động</h3>
            <div className={styles.statRow}>
              <span>Số tin nhắn (30 ngày)</span>
              <strong>{activity?.messageCountLast30d ?? 0}</strong>
            </div>
            <div className={styles.statRow}>
              <span>Liên kết (30 ngày)</span>
              <strong>{activity?.linkCountLast30d ?? 0}</strong>
            </div>
            <div className={styles.statRow}>
              <span>Media (30 ngày)</span>
              <strong>{activity?.mediaCountLast30d ?? 0}</strong>
            </div>
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Vai trò</h3>
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
              Thêm / gỡ vai trò vẫn sử dụng tab Vai Trò và modal hiện có.
            </p>
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Thông tin tài khoản</h3>
            <div className={styles.statRow}>
              <span>Ngày tạo tài khoản</span>
              <strong>{new Date(basic.accountCreatedAt).toLocaleDateString()}</strong>
            </div>
            <div className={styles.statRow}>
              <span>Ngày tham gia máy chủ</span>
              <strong>{new Date(basic.joinedAt).toLocaleDateString()}</strong>
            </div>
            <div className={styles.statRow}>
              <span>Phương thức tham gia</span>
              <strong>
                {basic.joinMethod === "owner"
                  ? "Chủ máy chủ"
                  : basic.joinMethod === "invited" && basic.invitedBy
                  ? `Mời bởi ${basic.invitedBy.username}`
                  : "Tham gia bằng URL"}
              </strong>
            </div>
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Nhật ký phân quyền</h3>
            <p className={styles.sectionHint}>
              Audit log chi tiết được lưu ở backend qua AuditLog; UI danh sách sẽ được bổ sung
              sau.
            </p>
          </section>
        </>
      )}
    </aside>
  );
}

