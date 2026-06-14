"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
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

// ─── DatePicker ───────────────────────────────────────────────────────────────

const VI_MONTH_NAMES = ["Tháng 1","Tháng 2","Tháng 3","Tháng 4","Tháng 5","Tháng 6","Tháng 7","Tháng 8","Tháng 9","Tháng 10","Tháng 11","Tháng 12"];

function DatePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [viewDate, setViewDate] = useState<Date>(() => {
    if (value) { const [y,m] = value.split("-").map(Number); return new Date(y, (m||1)-1, 1); }
    const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const selDate = value ? (() => { const [y,m,d] = value.split("-").map(Number); return new Date(y,(m||1)-1,d||1); })() : null;
  const today = new Date();
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const startPad = (firstDayOfWeek + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();

  const selectDay = (y: number, m: number, d: number) => {
    const yyyy = String(y).padStart(4,"0"), mm = String(m+1).padStart(2,"0"), dd = String(d).padStart(2,"0");
    onChange(`${yyyy}-${mm}-${dd}`); setOpen(false);
  };

  const displayValue = selDate ? selDate.toLocaleDateString("vi-VN",{day:"2-digit",month:"2-digit",year:"numeric"}) : "DD/MM/YYYY";

  return (
    <div className={styles.pickerWrap} ref={wrapRef}>
      <button type="button" className={`${styles.pickerTrigger} ${open ? styles.pickerTriggerOpen : ""}`} onClick={() => setOpen(!open)}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        <span className={value ? styles.pickerValue : styles.pickerPlaceholder}>{displayValue}</span>
        <svg className={`${styles.pickerChevron} ${open ? styles.pickerChevronOpen : ""}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6"/></svg>
      </button>
      {open && (
        <div className={styles.calendarDropdown}>
          <div className={styles.calHeader}>
            <button type="button" className={styles.calNavBtn} onClick={() => setViewDate(new Date(year, month-1, 1))}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
            <span className={styles.calMonthLabel}>{VI_MONTH_NAMES[month]} {year}</span>
            <button type="button" className={styles.calNavBtn} onClick={() => setViewDate(new Date(year, month+1, 1))}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 18l6-6-6-6"/></svg>
            </button>
          </div>
          <div className={styles.calGrid}>
            {["H","B","T","N","S","B","C"].map((d,i) => <span key={i} className={styles.calDayName}>{d}</span>)}
            {Array.from({length: startPad}).map((_,i) => {
              const d = prevMonthDays - startPad + 1 + i;
              const prevM = month === 0 ? 11 : month-1;
              const prevY = month === 0 ? year-1 : year;
              return <button key={`p${i}`} type="button" className={`${styles.calDay} ${styles.calDayOther}`} onClick={() => selectDay(prevY, prevM, d)}>{d}</button>;
            })}
            {Array.from({length: daysInMonth}).map((_,i) => {
              const day = i+1;
              const isSelected = selDate?.getFullYear()===year && selDate?.getMonth()===month && selDate?.getDate()===day;
              const isToday = today.getFullYear()===year && today.getMonth()===month && today.getDate()===day;
              return <button key={day} type="button" className={`${styles.calDay} ${isSelected ? styles.calDaySelected : ""} ${isToday && !isSelected ? styles.calDayToday : ""}`} onClick={() => selectDay(year, month, day)}>{day}</button>;
            })}
          </div>
          <div className={styles.calFooter}>
            <button type="button" className={styles.calFooterBtn} onClick={() => { onChange(""); setOpen(false); }}>Xóa</button>
            <button type="button" className={`${styles.calFooterBtn} ${styles.calFooterBtnToday}`} onClick={() => { const t=new Date(); selectDay(t.getFullYear(), t.getMonth(), t.getDate()); }}>Hôm nay</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── TimePicker ───────────────────────────────────────────────────────────────

const HOURS = Array.from({length:24},(_,i)=>i);
const MINUTES = Array.from({length:12},(_,i)=>i*5);

function TimePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const hourColRef = useRef<HTMLDivElement>(null);
  const minColRef = useRef<HTMLDivElement>(null);
  const [hh, mmRaw] = (value||"09:00").split(":").map(Number);
  const mm = Math.round((mmRaw||0)/5)*5 % 60;

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => {
      hourColRef.current?.querySelector(`[data-h="${hh}"]`)?.scrollIntoView({block:"center",behavior:"instant"});
      minColRef.current?.querySelector(`[data-m="${mm}"]`)?.scrollIntoView({block:"center",behavior:"instant"});
    });
  }, [open]);

  const setHour = (h: number) => onChange(`${String(h).padStart(2,"0")}:${String(mm).padStart(2,"0")}`);
  const setMinute = (m: number) => onChange(`${String(hh).padStart(2,"0")}:${String(m).padStart(2,"0")}`);
  const period = hh >= 12 ? "CH" : "SA";
  const h12 = hh % 12 || 12;
  const displayValue = `${String(h12).padStart(2,"0")}:${String(mm).padStart(2,"0")} ${period}`;

  return (
    <div className={styles.pickerWrap} ref={wrapRef}>
      <button type="button" className={`${styles.pickerTrigger} ${open ? styles.pickerTriggerOpen : ""}`} onClick={() => setOpen(!open)}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        <span className={styles.pickerValue}>{displayValue}</span>
        <svg className={`${styles.pickerChevron} ${open ? styles.pickerChevronOpen : ""}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6"/></svg>
      </button>
      {open && (
        <div className={styles.timeDropdown}>
          <div className={styles.timeDropdownInner}>
            <div className={styles.timeCol} ref={hourColRef}>
              <div className={styles.timeColLabel}>Giờ</div>
              {HOURS.map(h => (
                <button key={h} type="button" data-h={h} className={`${styles.timeSlot} ${h===hh?styles.timeSlotSelected:""}`} onClick={() => setHour(h)}>
                  {String(h).padStart(2,"0")}
                </button>
              ))}
            </div>
            <div className={styles.timeColDivider}/>
            <div className={styles.timeCol} ref={minColRef}>
              <div className={styles.timeColLabel}>Phút</div>
              {MINUTES.map(m => (
                <button key={m} type="button" data-m={m} className={`${styles.timeSlot} ${m===mm?styles.timeSlotSelected:""}`} onClick={() => setMinute(m)}>
                  {String(m).padStart(2,"0")}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── CustomSelect ─────────────────────────────────────────────────────────────

function CustomSelect<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: {value:T;label:string}[] }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const selected = options.find(o => o.value === value);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className={styles.pickerWrap} ref={wrapRef}>
      <button type="button" className={`${styles.pickerTrigger} ${open ? styles.pickerTriggerOpen : ""}`} onClick={() => setOpen(!open)}>
        <span className={styles.pickerValue}>{selected?.label || "—"}</span>
        <svg className={`${styles.pickerChevron} ${open ? styles.pickerChevronOpen : ""}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6"/></svg>
      </button>
      {open && (
        <div className={styles.selectDropdown}>
          {options.map(opt => (
            <button key={opt.value} type="button" className={`${styles.selectOption} ${opt.value===value?styles.selectOptionActive:""}`} onClick={() => { onChange(opt.value); setOpen(false); }}>
              <span className={styles.selectOptionCheck}>
                {opt.value===value && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
              </span>
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface CreateEventWizardProps {
  isOpen: boolean;
  onClose: () => void;
  serverId: string;
  textChannels: Channel[];
  voiceChannels: Channel[];
  onCreateSuccess: (event: ServerEvent, shareLink: string) => void;
  onOpenImageEditor: (currentImageUrl: string | null) => Promise<string | null>;
}

// ─── Main Component ───────────────────────────────────────────────────────────

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
          <div className={styles.contentPad}>
            <h2 className={styles.title}>Sự kiện của bạn diễn ra ở đâu?</h2>
            <p className={styles.hint}>Để không ai bị lạc khi truy cập.</p>
            <div className={styles.section}>
              <label className={`${styles.optionCard} ${locationType === "voice" ? styles.optionCardSelected : ""}`} style={{ cursor: "pointer" }}>
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
              <label className={`${styles.optionCard} ${locationType === "other" ? styles.optionCardSelected : ""}`} style={{ cursor: "pointer" }}>
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
          </div>
        )}

        {step === 2 && (
          <div className={styles.contentPad}>
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
            <div className={styles.formRow}>
              <div className={styles.formField}>
                <label className={styles.sectionLabel}>
                  Ngày Bắt Đầu <span className={styles.required}>*</span>
                </label>
                <DatePicker value={startDate} onChange={setStartDate} />
              </div>
              <div className={styles.formField}>
                <label className={styles.sectionLabel}>
                  Thời Gian Bắt Đầu <span className={styles.required}>*</span>
                </label>
                <TimePicker value={startTime} onChange={setStartTime} />
              </div>
            </div>
            {locationType === "other" && (
              <div className={styles.formRow}>
                <div className={styles.formField}>
                  <label className={styles.sectionLabel}>
                    Ngày Kết Thúc <span className={styles.required}>*</span>
                  </label>
                  <DatePicker value={endDate} onChange={setEndDate} />
                </div>
                <div className={styles.formField}>
                  <label className={styles.sectionLabel}>
                    Thời Gian Kết Thúc <span className={styles.required}>*</span>
                  </label>
                  <TimePicker value={endTime} onChange={setEndTime} />
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
              <CustomSelect<EventFrequency>
                value={frequency}
                onChange={setFrequency}
                options={FREQUENCY_OPTIONS}
              />
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
          </div>
        )}

        {step === 3 && (
          <div className={styles.contentPad}>
            <h2 className={styles.title}>Xem lại</h2>

            {/* Banner */}
            {coverImageUrl ? (
              <img src={coverImageUrl} alt="" className={styles.reviewBanner} />
            ) : (
              <div className={styles.reviewBanner}>
                <div className={styles.reviewBannerPlaceholder}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                    <line x1="16" y1="2" x2="16" y2="6"/>
                    <line x1="8" y1="2" x2="8" y2="6"/>
                    <line x1="3" y1="10" x2="21" y2="10"/>
                  </svg>
                  <span>Không có ảnh bìa</span>
                </div>
              </div>
            )}

            <div className={styles.reviewGrid}>
              {/* Topic */}
              <div className={styles.reviewRow}>
                <span className={styles.reviewIcon}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
                    <line x1="7" y1="7" x2="7.01" y2="7"/>
                  </svg>
                </span>
                <div className={styles.reviewRowContent}>
                  <span className={styles.reviewRowLabel}>Chủ đề</span>
                  <span className={styles.reviewRowValue}>{topic || "—"}</span>
                </div>
              </div>

              {/* Start */}
              <div className={styles.reviewRow}>
                <span className={styles.reviewIcon}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                    <line x1="16" y1="2" x2="16" y2="6"/>
                    <line x1="8" y1="2" x2="8" y2="6"/>
                    <line x1="3" y1="10" x2="21" y2="10"/>
                  </svg>
                </span>
                <div className={styles.reviewRowContent}>
                  <span className={styles.reviewRowLabel}>Bắt đầu</span>
                  <span className={styles.reviewRowValue}>
                    {startDate && startTime ? new Date(startAtISO).toLocaleString("vi-VN") : "—"}
                  </span>
                </div>
              </div>

              {/* End (other only) */}
              {locationType === "other" && endDate && endTime && (
                <div className={styles.reviewRow}>
                  <span className={styles.reviewIcon}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <circle cx="12" cy="12" r="10"/>
                      <polyline points="12 6 12 12 16 14"/>
                    </svg>
                  </span>
                  <div className={styles.reviewRowContent}>
                    <span className={styles.reviewRowLabel}>Kết thúc</span>
                    <span className={styles.reviewRowValue}>
                      {new Date(endAtISO).toLocaleString("vi-VN")}
                    </span>
                  </div>
                </div>
              )}

              {/* Channel */}
              <div className={styles.reviewRow}>
                <span className={styles.reviewIcon}>
                  {locationType === "voice" ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z"/>
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                      <line x1="12" y1="19" x2="12" y2="23"/>
                      <line x1="8" y1="23" x2="16" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <line x1="4" y1="9" x2="20" y2="9"/>
                      <line x1="4" y1="15" x2="20" y2="15"/>
                      <line x1="10" y1="3" x2="8" y2="21"/>
                      <line x1="16" y1="3" x2="14" y2="21"/>
                    </svg>
                  )}
                </span>
                <div className={styles.reviewRowContent}>
                  <span className={styles.reviewRowLabel}>
                    {locationType === "voice" ? "Kênh thoại" : "Kênh văn bản"}
                  </span>
                  <span className={styles.reviewRowValue}>
                    {channelsByType.find((c) => c._id === channelId)?.name || "—"}
                  </span>
                </div>
              </div>

              {/* Frequency (if not "none") */}
              {frequency !== "none" && (
                <div className={styles.reviewRow}>
                  <span className={styles.reviewIcon}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <polyline points="17 1 21 5 17 9"/>
                      <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                      <polyline points="7 23 3 19 7 15"/>
                      <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
                    </svg>
                  </span>
                  <div className={styles.reviewRowContent}>
                    <span className={styles.reviewRowLabel}>Lặp lại</span>
                    <span className={styles.reviewRowValue}>
                      {FREQUENCY_OPTIONS.find((f) => f.value === frequency)?.label || "—"}
                    </span>
                  </div>
                </div>
              )}
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
          </div>
        )}
      </div>
    </div>
  );
}
