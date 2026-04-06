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

  if (!settings) return <div>Không tải được thiết lập an toàn.</div>;

  const currentLevel = settings.spamProtection.verificationLevel ?? "none";
  const current = findOption(currentLevel);

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
    </div>
  );
}
