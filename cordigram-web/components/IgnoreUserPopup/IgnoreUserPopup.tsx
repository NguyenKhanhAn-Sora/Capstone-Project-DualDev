"use client";

import React, { useEffect, useState } from "react";
import styles from "./IgnoreUserPopup.module.css";
import { checkIgnoreStatus, unignoreUser } from "@/lib/api";

export interface IgnoreUserPopupProps {
  displayName: string;
  /** Nếu có: kiểm tra đã bỏ qua chưa và hiện chế độ Khôi phục khi đã bỏ qua. */
  userId?: string;
  token?: string;
  onClose: () => void;
  onConfirm: (options: { hideProfile: boolean; muteNotifications: boolean }) => void;
  onBlock: () => void;
  /** Gọi sau khi khôi phục (unignore) thành công. */
  onRestore?: () => void;
}

export default function IgnoreUserPopup({
  displayName,
  userId,
  token,
  onClose,
  onConfirm,
  onBlock,
  onRestore,
}: IgnoreUserPopupProps) {
  const [hideProfile, setHideProfile] = useState(true);
  const [muteNotifications, setMuteNotifications] = useState(true);
  const [alreadyIgnored, setAlreadyIgnored] = useState<boolean | null>(null);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    if (!userId || !token) {
      setAlreadyIgnored(false);
      return;
    }
    let cancelled = false;
    checkIgnoreStatus({ token, targetUserId: userId })
      .then((res) => { if (!cancelled) setAlreadyIgnored(res.isIgnored); })
      .catch(() => { if (!cancelled) setAlreadyIgnored(false); });
    return () => { cancelled = true; };
  }, [userId, token]);

  const handleRestore = async () => {
    if (!token || !userId) return;
    setRestoring(true);
    try {
      await unignoreUser({ token, userId });
      onRestore?.();
      onClose();
    } catch (err) {
      console.error("Unignore failed", err);
    } finally {
      setRestoring(false);
    }
  };

  if (alreadyIgnored === null && userId && token) {
    return (
      <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal aria-label="Bỏ qua người dùng">
        <div className={styles.popup} onClick={(e) => e.stopPropagation()}>
          <div className={styles.loading}>Đang tải...</div>
        </div>
      </div>
    );
  }

  if (alreadyIgnored === true) {
    return (
      <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal aria-label="Đã bỏ qua người dùng">
        <div className={styles.popup} onClick={(e) => e.stopPropagation()}>
          <div className={styles.iconWrap}>
            <svg className={styles.icon} width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M4.93 4.93l14.14 14.14" />
            </svg>
          </div>
          <h2 className={styles.title}>Bạn đã bỏ qua {displayName}</h2>
          <p className={styles.subtitle}>
            Tin nhắn và thông báo từ họ đang bị ẩn. Khôi phục để nhắn tin và nhận thông báo vào hộp thư như bình thường (DM và kênh chat server).
          </p>
          <div className={styles.footer}>
            <button type="button" className={styles.btnCancel} onClick={onClose}>
              Hủy bỏ
            </button>
            <button
              type="button"
              className={styles.btnIgnore}
              onClick={handleRestore}
              disabled={restoring}
            >
              {restoring ? "Đang xử lý..." : "Khôi phục"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal aria-label="Bỏ qua người dùng">
      <div className={styles.popup} onClick={(e) => e.stopPropagation()}>
        <div className={styles.iconWrap}>
          <svg className={styles.icon} width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M4.93 4.93l14.14 14.14" />
          </svg>
        </div>
        <h2 className={styles.title}>Bỏ qua {displayName}?</h2>
        <p className={styles.subtitle}>Dừng tương tác mà không để họ biết</p>

        <label className={styles.checkRow}>
          <input
            type="checkbox"
            checked={hideProfile}
            onChange={(e) => setHideProfile(e.target.checked)}
          />
          <span className={styles.checkLabel}>Ẩn hồ sơ và tin nhắn của họ</span>
        </label>
        <p className={styles.checkDesc}>Bạn có thể hủy việc ẩn họ bất cứ lúc nào</p>

        <label className={styles.checkRow}>
          <input
            type="checkbox"
            checked={muteNotifications}
            onChange={(e) => setMuteNotifications(e.target.checked)}
          />
          <span className={styles.checkLabel}>Tắt tiếng thông báo và hoạt động của họ</span>
        </label>
        <p className={styles.checkDesc}>Bạn sẽ ít thấy họ trên ứng dụng hơn (DM, kênh chat, kênh thoại)</p>

        <p className={styles.info}>
          <span className={styles.infoIcon} aria-hidden>ℹ</span>
          Họ vẫn có thể nhắn tin cho bạn và xem hoạt động của bạn. Họ sẽ không biết bạn đã bỏ qua họ.
        </p>

        <div className={styles.blockSection}>
          <p className={styles.blockTitle}>Vẫn không đủ sao?</p>
          <div className={styles.blockBox}>
            <p className={styles.blockText}>Thay vào đó, hãy chặn</p>
            <p className={styles.blockDesc}>Ngừng liên hệ trực tiếp và hạn chế những gì họ thấy. Không nhận tin nhắn hay cuộc gọi từ người đã chặn (DM và kênh trong server).</p>
            <button type="button" className={styles.blockBtn} onClick={onBlock}>
              Chặn
            </button>
          </div>
        </div>

        <div className={styles.footer}>
          <button type="button" className={styles.btnCancel} onClick={onClose}>
            Hủy bỏ
          </button>
          <button
            type="button"
            className={styles.btnIgnore}
            onClick={() => onConfirm({ hideProfile, muteNotifications })}
          >
            Bỏ qua
          </button>
        </div>
      </div>
    </div>
  );
}
