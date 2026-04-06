"use client";

import React, { useEffect, useState } from "react";
import * as serversApi from "@/lib/servers-api";
import styles from "./ServerSafetySection.module.css";

interface Props {
  serverId: string;
  canManageSettings: boolean;
  initialTab?: "spam" | "automod" | "privileges";
}

interface VerificationOption {
  value: serversApi.ServerVerificationLevel;
  accent: string;
  title: string;
  desc: string;
}

interface ContentFilterOption {
  value: serversApi.ContentFilterLevel;
  accent: string;
  title: string;
  desc: string;
}

const CONTENT_FILTER_OPTIONS: ContentFilterOption[] = [
  {
    value: "all_members",
    accent: styles.accentHigh,
    title: "Lọc tin nhắn từ tất cả thành viên",
    desc: "Tất cả tin nhắn sẽ được lọc để phát hiện nội dung đa phương tiện có hình ảnh nội dung nhạy cảm.",
  },
  {
    value: "no_role_members",
    accent: styles.accentMedium,
    title: "Lọc tin nhắn từ các thành viên máy chủ không giữ vai trò",
    desc: "Các tin nhắn từ những thành viên máy chủ không giữ vai trò sẽ bị lọc để phát hiện nội dung đa phương tiện có hình ảnh nhạy cảm.",
  },
  {
    value: "none",
    accent: styles.accentNone,
    title: "Không lọc",
    desc: "Các tin nhắn sẽ không bị lọc đối với nội dung đa phương tiện có hình ảnh nhạy cảm.",
  },
];

function findContentFilterOption(level: serversApi.ContentFilterLevel): ContentFilterOption {
  return CONTENT_FILTER_OPTIONS.find((o) => o.value === level) ?? CONTENT_FILTER_OPTIONS[2];
}

const VERIFICATION_OPTIONS: VerificationOption[] = [
  {
    value: "none",
    accent: styles.accentNone,
    title: "Không",
    desc: "Không giới hạn",
  },
  {
    value: "low",
    accent: styles.accentLow,
    title: "Thấp",
    desc: "Bạn cần xác nhận email đăng kí Cordigram.",
  },
  {
    value: "medium",
    accent: styles.accentMedium,
    title: "Trung bình",
    desc: "Phải đăng kí Cordigram lâu hơn 5 phút.",
  },
  {
    value: "high",
    accent: styles.accentHigh,
    title: "Cao",
    desc: "Phải là thành viên trong máy chủ này lâu hơn 10 phút.",
  },
];

function findOption(level: serversApi.ServerVerificationLevel): VerificationOption {
  return VERIFICATION_OPTIONS.find((o) => o.value === level) ?? VERIFICATION_OPTIONS[0];
}

export default function ServerSafetySection({
  serverId,
  canManageSettings,
}: Props) {
  const [settings, setSettings] = useState<serversApi.ServerSafetySettings | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [contentFilterExpanded, setContentFilterExpanded] = useState(false);

  useEffect(() => {
    serversApi.getServerSafetySettings(serverId).then(setSettings).catch(() => setSettings(null));
  }, [serverId]);

  const save = async (next: serversApi.ServerSafetySettings) => {
    setSettings(next);
    if (!canManageSettings) return;
    await serversApi.updateServerSafetySettings(serverId, next);
  };

  const setVerificationLevel = (value: serversApi.ServerVerificationLevel) => {
    if (!settings) return;
    save({
      ...settings,
      spamProtection: { ...settings.spamProtection, verificationLevel: value },
    });
  };

  const setContentFilterLevel = (value: serversApi.ContentFilterLevel) => {
    if (!settings) return;
    save({
      ...settings,
      contentFilter: { ...(settings.contentFilter || {}), level: value },
    });
  };

  if (!settings) return <div>Không tải được thiết lập an toàn.</div>;

  const currentLevel = settings.spamProtection.verificationLevel ?? "none";
  const current = findOption(currentLevel);

  const currentFilterLevel = settings.contentFilter?.level ?? "none";
  const currentFilter = findContentFilterOption(currentFilterLevel);

  return (
    <div className={styles.container}>
      <h3 className={styles.sectionTitle}>Mức xác minh</h3>
      <p className={styles.sectionDesc}>
        Thành viên của máy chủ phải đáp ứng được các tiêu chí sau để gửi tin nhắn trong kênh văn bản hoặc bắt đầu
        cuộc trò chuyện bằng tin nhắn trực tiếp. Nếu thành viên đã được chỉ định vai trò và hướng dẫn làm quen trên
        máy chủ không bật thì không cần sử dụng các tiêu chí này nữa.{" "}
        <strong>Chúng tôi khuyến nghị bạn nên cài đặt mức xác minh cho Máy Chủ Cộng Đồng.</strong>
      </p>

      <div className={styles.summary}>
        <span className={`${styles.summaryAccent} ${current.accent}`} />
        <div className={styles.summaryBody}>
          <p className={styles.summaryTitle}>{current.title}</p>
          <p className={styles.summaryDesc}>{current.desc}</p>
        </div>
        <button
          type="button"
          className={styles.changeBtn}
          disabled={!canManageSettings}
          onClick={() => setExpanded((v) => !v)}
        >
          Thay đổi
        </button>
      </div>

      {expanded && (
        <div className={styles.radioList} role="radiogroup" aria-label="Mức xác minh">
          {VERIFICATION_OPTIONS.map((opt) => {
            const selected = currentLevel === opt.value;
            return (
              <label key={opt.value} className={styles.radioItem}>
                <span className={`${styles.accent} ${opt.accent}`} />
                <div className={styles.radioBody}>
                  <p className={styles.radioTitle}>{opt.title}</p>
                  <p className={styles.radioDesc}>{opt.desc}</p>
                </div>
                <input
                  type="radio"
                  name={`verification-${serverId}`}
                  className={styles.radioInput}
                  checked={selected}
                  disabled={!canManageSettings}
                  onChange={() => {
                    setVerificationLevel(opt.value);
                    setExpanded(false);
                  }}
                />
              </label>
            );
          })}
        </div>
      )}

      <div className={styles.divider} />

      <h3 className={styles.sectionTitle}>Bộ lọc nội dung nhạy cảm</h3>
      <p className={styles.sectionDesc}>
        Chọn nếu thành viên máy chủ có thể chia sẻ nội dung đa phương tiện có hình ảnh được bộ lọc nội dung nhạy cảm
        phát hiện. Cài đặt này sẽ áp dụng cho các kênh không giới hạn độ tuổi.{" "}
        <a href="#" style={{ color: "#00a8fc", textDecoration: "none" }}>Tìm hiểu thêm</a>
      </p>

      <div className={styles.summary}>
        <span className={`${styles.summaryAccent} ${currentFilter.accent}`} />
        <div className={styles.summaryBody}>
          <p className={styles.summaryTitle}>{currentFilter.title}</p>
          <p className={styles.summaryDesc}>{currentFilter.desc}</p>
        </div>
        <button
          type="button"
          className={styles.changeBtn}
          disabled={!canManageSettings}
          onClick={() => setContentFilterExpanded((v) => !v)}
        >
          Thay đổi
        </button>
      </div>

      {contentFilterExpanded && (
        <div className={styles.radioList} role="radiogroup" aria-label="Bộ lọc nội dung nhạy cảm">
          {CONTENT_FILTER_OPTIONS.map((opt) => {
            const selected = currentFilterLevel === opt.value;
            return (
              <label key={opt.value} className={styles.radioItem}>
                <span className={`${styles.accent} ${opt.accent}`} />
                <div className={styles.radioBody}>
                  <p className={styles.radioTitle}>{opt.title}</p>
                  <p className={styles.radioDesc}>{opt.desc}</p>
                </div>
                <input
                  type="radio"
                  name={`content-filter-${serverId}`}
                  className={styles.radioInput}
                  checked={selected}
                  disabled={!canManageSettings}
                  onChange={() => {
                    setContentFilterLevel(opt.value);
                    setContentFilterExpanded(false);
                  }}
                />
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
