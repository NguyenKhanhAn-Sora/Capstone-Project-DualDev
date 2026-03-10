"use client";

import React, { useState, useMemo, useEffect } from "react";
import styles from "./CreateEventWizard.module.css";
import * as serversApi from "@/lib/servers-api";
import type { Channel, EventFrequency, EventLocationType, ServerEvent } from "@/lib/servers-api";

const STEP_LABELS = ["Thư mục", "Thông tin sự kiện", "Xem lại"];

const FREQUENCY_OPTIONS: { value: EventFrequency; label: string }[] = [
  { value: "none", label: "Không lặp lại" },
  { value: "weekly", label: "Hàng tuần vào thứ bảy" },
  { value: "biweekly", label: "Vào thứ bảy sau mỗi 2 tuần" },
  { value: "monthly", label: "Hàng tháng vào ngày thứ bảy thứ ba" },
  { value: "yearly", label: "Hàng năm vào ngày 21 thg 2" },
];

interface CreateEventWizardProps {
  isOpen: boolean;
  onClose: () => void;
  serverId: string;
  textChannels: Channel[];
  voiceChannels: Channel[];
  onCreateSuccess: (event: ServerEvent, shareLink: string) => void;
  onOpenImageEditor: (currentImageUrl: string | null) => Promise<string | null>;
}

export default function CreateEventWizard({
  isOpen,
  onClose,
  serverId,
  textChannels,
  voiceChannels,
  onCreateSuccess,
  onOpenImageEditor,
}: CreateEventWizardProps) {
  const [step, setStep] = useState(1);
  const [locationType, setLocationType] = useState<EventLocationType>("voice");
  const [channelId, setChannelId] = useState<string>("");
  const [topic, setTopic] = useState("");
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });
  const [startTime, setStartTime] = useState("21:00");
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });
  const [endTime, setEndTime] = useState("22:00");
  const [frequency, setFrequency] = useState<EventFrequency>("none");
  const [description, setDescription] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const channelsByType = useMemo(() => {
    if (locationType === "voice") return voiceChannels;
    return textChannels;
  }, [locationType, voiceChannels, textChannels]);

  useEffect(() => {
    if (isOpen && step === 1 && channelsByType.length > 0 && !channelId) {
      setChannelId(channelsByType[0]._id);
    }
  }, [isOpen, step, channelsByType, channelId]);

  const startAtISO = useMemo(() => {
    if (!startDate) return "";
    const [y, m, d] = startDate.split("-").map(Number);
    const [hh, mm] = startTime.split(":").map(Number);
    const d2 = new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0);
    return d2.toISOString();
  }, [startDate, startTime]);

  const endAtISO = useMemo(() => {
    if (!endDate) return "";
    const [y, m, d] = endDate.split("-").map(Number);
    const [hh, mm] = endTime.split(":").map(Number);
    const d2 = new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0);
    return d2.toISOString();
  }, [endDate, endTime]);

  const endAfterStart = useMemo(() => {
    if (!startAtISO || !endAtISO) return true;
    return new Date(endAtISO).getTime() > new Date(startAtISO).getTime();
  }, [startAtISO, endAtISO]);

  const handleAddCover = async () => {
    const url = await onOpenImageEditor(coverImageUrl);
    if (url != null) setCoverImageUrl(url);
  };

  const canNextStep1 = locationType && (channelId || channelsByType.length === 0);
  const canNextStep2 =
    topic.trim() &&
    startDate &&
    startTime &&
    frequency &&
    (locationType !== "voice" || channelId || voiceChannels.length === 0) &&
    (locationType !== "other" || channelId || textChannels.length === 0) &&
    (locationType !== "other" || (endDate && endTime && endAfterStart));

  const handleNext = () => {
    if (step < 3) setStep(step + 1);
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleCreate = async () => {
    if (!canNextStep2) return;
    setSubmitting(true);
    try {
      const event = await serversApi.createServerEvent(serverId, {
        topic: topic.trim(),
        startAt: startAtISO,
        frequency,
        locationType,
        endAt: locationType === "other" && endAtISO ? endAtISO : undefined,
        channelId: channelId || undefined,
        description: description.trim() || undefined,
        coverImageUrl: coverImageUrl || undefined,
      });
      const shareLink = serversApi.getEventShareLink(serverId, event._id);
      onCreateSuccess(event, shareLink);
      onClose();
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : "Không thể tạo sự kiện.";
      alert(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Đóng">
          ×
        </button>

        <div className={styles.steps}>
          {STEP_LABELS.map((label, i) => (
            <span
              key={label}
              className={`${styles.stepTab} ${step === i + 1 ? styles.active : ""}`}
            >
              {label}
            </span>
          ))}
        </div>

        {step === 1 && (
          <>
            <h2 className={styles.title}>Sự kiện của bạn diễn ra ở đâu?</h2>
            <p className={styles.hint}>Để không ai bị lạc khi truy cập.</p>
            <div className={styles.section}>
              <label className={styles.optionCard} style={{ cursor: "pointer" }}>
                <input
                  type="radio"
                  name="locationType"
                  checked={locationType === "voice"}
                  onChange={() => {
                    setLocationType("voice");
                    setChannelId(voiceChannels[0]?._id || "");
                  }}
                />
                <span className={styles.optionIcon}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="23" stroke="currentColor" strokeWidth="2" />
                    <line x1="8" y1="23" x2="16" y2="23" stroke="currentColor" strokeWidth="2" />
                  </svg>
                </span>
                <div>
                  <span className={styles.optionTitle}>Kênh thoại</span>
                  <p className={styles.optionDesc}>
                    Gặp mặt bằng gọi thoại, video, chia sẻ màn hình và phát trực tiếp.
                  </p>
                </div>
              </label>
              <label className={styles.optionCard} style={{ cursor: "pointer" }}>
                <input
                  type="radio"
                  name="locationType"
                  checked={locationType === "other"}
                  onChange={() => {
                    setLocationType("other");
                    setChannelId(textChannels[0]?._id || "");
                  }}
                />
                <span className={styles.optionIcon}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                </span>
                <div>
                  <span className={styles.optionTitle}>Một Nơi Nào Khác</span>
                  <p className={styles.optionDesc}>
                    Kênh văn bản, liên kết bên ngoài hoặc tại một địa điểm trực tiếp.
                  </p>
                </div>
              </label>
            </div>
            {channelsByType.length > 0 && (
              <div className={styles.section}>
                <span className={styles.sectionLabel}>Chọn kênh</span>
                <div className={styles.channelList}>
                  {channelsByType.map((ch) => (
                    <div
                      key={ch._id}
                      className={`${styles.channelItem} ${channelId === ch._id ? styles.selected : ""}`}
                      onClick={() => setChannelId(ch._id)}
                    >
                      {ch.type === "voice" ? (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" />
                          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                          <line x1="12" y1="19" x2="12" y2="23" stroke="currentColor" strokeWidth="2" />
                          <line x1="8" y1="23" x2="16" y2="23" stroke="currentColor" strokeWidth="2" />
                        </svg>
                      ) : (
                        <span>#</span>
                      )}
                      <span>{ch.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className={styles.footer}>
              <div className={styles.footerLeft}>
                <button type="button" className={styles.btnSecondary} onClick={onClose}>
                  Hủy bỏ
                </button>
              </div>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={handleNext}
                disabled={!canNextStep1}
              >
                Tiếp theo
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h2 className={styles.title}>Sự kiện của bạn là về chủ đề gì?</h2>
            <p className={styles.hint}>Điền thông tin chi tiết cho sự kiện của bạn.</p>
            <div className={styles.section}>
              <label className={styles.sectionLabel}>
                Chủ Đề Của Sự Kiện <span className={styles.required}>*</span>
              </label>
              <input
                type="text"
                className={styles.input}
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Chủ đề sự kiện của bạn là gì?"
              />
            </div>
            <div className={styles.section} style={{ display: "flex", gap: "12px" }}>
              <div style={{ flex: 1 }}>
                <label className={styles.sectionLabel}>
                  Ngày Bắt Đầu <span className={styles.required}>*</span>
                </label>
                <input
                  type="date"
                  className={styles.input}
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label className={styles.sectionLabel}>
                  Thời Gian Bắt Đầu <span className={styles.required}>*</span>
                </label>
                <input
                  type="time"
                  className={styles.input}
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>
            </div>
            {locationType === "other" && (
              <div className={styles.section} style={{ display: "flex", gap: "12px" }}>
                <div style={{ flex: 1 }}>
                  <label className={styles.sectionLabel}>
                    Ngày Kết Thúc <span className={styles.required}>*</span>
                  </label>
                  <input
                    type="date"
                    className={styles.input}
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label className={styles.sectionLabel}>
                    Thời Gian Kết Thúc <span className={styles.required}>*</span>
                  </label>
                  <input
                    type="time"
                    className={styles.input}
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                  />
                </div>
              </div>
            )}
            {locationType === "other" && !endAfterStart && (
              <p className={styles.coverHint} style={{ color: "#ed4245", marginTop: "-8px" }}>
                Thời gian kết thúc phải sau thời gian bắt đầu.
              </p>
            )}
            <div className={styles.section}>
              <label className={styles.sectionLabel}>
                Tần suất sự kiện <span className={styles.required}>*</span>
              </label>
              <div className={styles.selectWrap}>
                <select
                  className={styles.input}
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value as EventFrequency)}
                >
                  {FREQUENCY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className={styles.section}>
              <label className={styles.sectionLabel}>Mô tả</label>
              <textarea
                className={`${styles.input} ${styles.textarea}`}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Cho mọi người biết thêm một chút về sự kiện của bạn. Markdown, dòng mới và liên kết đều được hỗ trợ."
              />
            </div>
            <div className={`${styles.section} ${styles.coverSection}`}>
              <label className={styles.sectionLabel}>Ảnh bìa</label>
              <p className={styles.coverHint}>
                Chúng tôi đề xuất hình ảnh có kích cỡ tối thiểu là rộng 800px và cao 320px.
              </p>
              <button type="button" className={styles.coverBtn} onClick={handleAddCover}>
                Tải lên ảnh bìa
              </button>
              {coverImageUrl && (
                <img src={coverImageUrl} alt="Bìa" className={styles.coverPreview} />
              )}
            </div>
            <div className={styles.footer}>
              <div className={styles.footerLeft}>
                <button type="button" className={styles.btnSecondary} onClick={handleBack}>
                  Trở lại
                </button>
                <button type="button" className={styles.btnSecondary} onClick={onClose}>
                  Hủy bỏ
                </button>
              </div>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={handleNext}
                disabled={!canNextStep2}
              >
                Tiếp theo
              </button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h2 className={styles.title}>Xem lại</h2>
            {coverImageUrl ? (
              <img src={coverImageUrl} alt="" className={styles.reviewBanner} />
            ) : (
              <div className={styles.reviewBanner} />
            )}
            <div className={styles.reviewRow}>
              <span>📅</span>
              Bắt đầu: {startDate && startTime ? new Date(startAtISO).toLocaleString("vi-VN") : "—"}
            </div>
            {locationType === "other" && endDate && endTime && (
              <div className={styles.reviewRow}>
                <span>📅</span>
                Kết thúc: {new Date(endAtISO).toLocaleString("vi-VN")}
              </div>
            )}
            <div className={styles.reviewRow}>
              <strong>{topic || "—"}</strong>
            </div>
            <div className={styles.reviewRow}>
              <span>
                {locationType === "voice" ? "🔊" : "#"}
              </span>
              {channelsByType.find((c) => c._id === channelId)?.name || "—"}
            </div>
            <p className={styles.reviewNote}>
              Đây là bản xem trước sự kiện của bạn. Sự kiện này sẽ tự động bắt đầu khi đến giờ.
            </p>
            <div className={styles.footer}>
              <div className={styles.footerLeft}>
                <button type="button" className={styles.btnSecondary} onClick={handleBack}>
                  Trở lại
                </button>
                <button type="button" className={styles.btnSecondary} onClick={onClose}>
                  Hủy bỏ
                </button>
              </div>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={handleCreate}
                disabled={submitting}
              >
                {submitting ? "Đang tạo..." : "Tạo Sự kiện"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
