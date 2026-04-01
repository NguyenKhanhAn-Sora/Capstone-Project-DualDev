"use client";

import React, { useMemo, useRef, useState, useEffect } from "react";
import dynamic from "next/dynamic";
import * as serversApi from "@/lib/servers-api";
import { uploadMedia } from "@/lib/api";
import styles from "./ServerProfileSection.module.css";

const EmojiPicker = dynamic(() => import("emoji-picker-react"), {
  ssr: false,
});

type Trait = { emoji: string; text: string };

const RANDOM_EMOJIS = ["😀", "😎", "🔥", "🎮", "🎯", "🌟", "🚀", "✨", "🐱", "🫶", "👾", "🥳"];
const BANNER_PRESETS = [
  "linear-gradient(180deg, #1f2127 0%, #090b10 100%)",
  "linear-gradient(180deg, #ff3ea5 0%, #eb188a 100%)",
  "linear-gradient(180deg, #ff4b3e 0%, #ee1f22 100%)",
  "linear-gradient(180deg, #ff9b3e 0%, #ea6a13 100%)",
  "linear-gradient(180deg, #ffe66e 0%, #e4be24 100%)",
  "linear-gradient(180deg, #b96cff 0%, #7f3ab1 100%)",
  "linear-gradient(180deg, #49bfff 0%, #198fd4 100%)",
  "linear-gradient(180deg, #74f0d4 0%, #4bc7b0 100%)",
  "linear-gradient(180deg, #6da91f 0%, #3f7304 100%)",
  "linear-gradient(180deg, #5e6168 0%, #2f3238 100%)",
];

interface ServerProfileSectionProps {
  serverId: string;
  token: string | null;
  canManageSettings: boolean;
  initialServer?: serversApi.Server | null;
  onUpdated?: (server: serversApi.Server) => void;
}

function makeInitialTraits(server?: serversApi.Server | null): Trait[] {
  const source = server?.profileTraits ?? [];
  const out: Trait[] = [];
  for (let i = 0; i < 5; i += 1) {
    const t = source[i];
    out.push({ emoji: t?.emoji || "🙂", text: t?.text || "" });
  }
  return out;
}

export default function ServerProfileSection({
  serverId,
  token,
  canManageSettings,
  initialServer,
  onUpdated,
}: ServerProfileSectionProps) {
  const [name, setName] = useState(initialServer?.name ?? "");
  const [avatarUrl, setAvatarUrl] = useState(initialServer?.avatarUrl ?? "");
  const [bannerUrl, setBannerUrl] = useState(initialServer?.bannerUrl || BANNER_PRESETS[0]);
  const [description, setDescription] = useState(initialServer?.description ?? "");
  const [traits, setTraits] = useState<Trait[]>(makeInitialTraits(initialServer));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [hoverEmoji, setHoverEmoji] = useState<Record<number, string>>({});
  const [emojiPickerIndex, setEmojiPickerIndex] = useState<number | null>(null);
  const [emojiPickerPos, setEmojiPickerPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [profileStats, setProfileStats] = useState<serversApi.ServerProfileStats | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);

  const traitsFilled = useMemo(() => traits.filter((t) => t.text.trim()).length, [traits]);

  const updateTrait = (idx: number, patch: Partial<Trait>) => {
    setTraits((prev) => prev.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
  };

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (emojiPickerRef.current?.contains(target)) return;
      setEmojiPickerIndex(null);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stats = await serversApi.getServerProfileStats(serverId);
        if (!cancelled) setProfileStats(stats);
      } catch {
        if (!cancelled) setProfileStats(null);
      }
    })();
    return () => { cancelled = true; };
  }, [serverId]);

  const pickRandomEmoji = (idx: number) => {
    const next = RANDOM_EMOJIS[Math.floor(Math.random() * RANDOM_EMOJIS.length)];
    setHoverEmoji((prev) => ({ ...prev, [idx]: next }));
  };

  const clearHoverEmoji = (idx: number) => {
    setHoverEmoji((prev) => {
      const n = { ...prev };
      delete n[idx];
      return n;
    });
  };

  const handleUploadAvatar = async (file: File | null) => {
    if (!file || !token) return;
    try {
      setError(null);
      const up = await uploadMedia({ token, file });
      const url = up.secureUrl || up.url;
      if (!url) throw new Error("Không lấy được URL tệp");
      setAvatarUrl(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải ảnh lên được");
    }
  };

  const handleSave = async () => {
    if (!canManageSettings) return;
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);
      const payloadTraits = traits
        .map((t) => ({ emoji: (t.emoji || "🙂").trim(), text: t.text.trim() }))
        .filter((t) => t.text.length > 0)
        .slice(0, 5);
      const updated = await serversApi.updateServer(
        serverId,
        name.trim(),
        description,
        avatarUrl || undefined,
        { bannerUrl, profileTraits: payloadTraits },
      );
      setSuccess("Đã lưu hồ sơ máy chủ.");
      onUpdated?.(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không lưu được hồ sơ máy chủ");
    } finally {
      setSaving(false);
    }
  };

  const previewBannerStyle = bannerUrl.startsWith("http")
    ? { backgroundImage: `url(${bannerUrl})` }
    : { background: bannerUrl };

  return (
    <div className={styles.wrap}>
      <div className={styles.left}>
        <div className={styles.card}>
          <div className={styles.label}>Thông tin máy chủ</div>
          <div className={styles.hint}>
            Trực tuyến: {profileStats?.onlineCount ?? 0} | Thành viên: {profileStats?.memberCount ?? initialServer?.memberCount ?? 0}
            {" | "}Ngày thành lập: {new Date(profileStats?.createdAt ?? initialServer?.createdAt ?? Date.now()).toLocaleDateString("vi-VN")}
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.label}>Tên</div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            disabled={!canManageSettings}
            placeholder="Tên máy chủ"
          />
        </div>

        <div className={styles.card}>
          <div className={styles.label}>Biểu tượng</div>
          <div className={styles.row}>
            <button className={`${styles.btn} ${styles.btnPrimary}`} disabled={!canManageSettings} onClick={() => avatarInputRef.current?.click()}>
              Thay đổi biểu tượng máy chủ
            </button>
            <button className={`${styles.btn} ${styles.btnDanger}`} disabled={!canManageSettings} onClick={() => setAvatarUrl("")}>
              Xóa biểu tượng
            </button>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => handleUploadAvatar(e.target.files?.[0] ?? null)}
            />
          </div>
          <input
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            disabled={!canManageSettings}
            placeholder="Hoặc dán URL biểu tượng"
          />
        </div>

        <div className={styles.card}>
          <div className={styles.label}>Biểu ngữ</div>
          <div className={styles.bannerPalette}>
            {BANNER_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                className={`${styles.bannerSwatch} ${bannerUrl === preset ? styles.bannerSwatchActive : ""}`}
                style={{ background: preset }}
                disabled={!canManageSettings}
                onClick={() => setBannerUrl(preset)}
                aria-label="Chọn màu biểu ngữ"
              />
            ))}
          </div>
          <div className={styles.hint}>Chỉ chọn màu biểu ngữ theo mẫu có sẵn.</div>
        </div>

        <div className={styles.card}>
          <div className={styles.label}>Đặc điểm</div>
          <div className={styles.hint}>Thêm tối đa 5 đặc điểm để thể hiện sở thích và tính cách của máy chủ.</div>
          <div className={styles.traitsGrid}>
            {traits.map((t, idx) => (
              <div className={styles.traitField} key={`trait-${idx}`}>
                <button
                  type="button"
                  className={styles.emojiBtn}
                  disabled={!canManageSettings}
                  onMouseEnter={() => pickRandomEmoji(idx)}
                  onMouseLeave={() => clearHoverEmoji(idx)}
                  onClick={(e) => {
                    const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                    const pickerWidth = 360;
                    const pickerHeight = 420;
                    const left = Math.min(
                      Math.max(8, rect.left),
                      Math.max(8, window.innerWidth - pickerWidth - 8),
                    );
                    const top = Math.max(8, rect.top - pickerHeight - 8);
                    setEmojiPickerPos({ top, left });
                    setEmojiPickerIndex(idx);
                  }}
                  title="Chọn emoji"
                >
                  {hoverEmoji[idx] || t.emoji || "🙂"}
                </button>
                <input
                  className={styles.traitInput}
                  value={t.text}
                  maxLength={80}
                  disabled={!canManageSettings}
                  onChange={(e) => updateTrait(idx, { text: e.target.value })}
                  placeholder="Đặc điểm..."
                />
              </div>
            ))}
          </div>
          <div className={styles.hint}>{traitsFilled}/5 đặc điểm đã điền</div>
        </div>

        <div className={styles.card}>
          <div className={styles.label}>Mô tả</div>
          <div className={styles.hint}>Mô tả cho server.</div>
          <textarea
            value={description ?? ""}
            onChange={(e) => setDescription(e.target.value)}
            disabled={!canManageSettings}
            maxLength={500}
            placeholder="Hãy giới thiệu một chút về máy chủ này với thế giới."
          />
        </div>

        {error && <div className={styles.error}>{error}</div>}
        {success && <div className={styles.success}>{success}</div>}
        <div className={styles.row}>
          <button className={`${styles.btn} ${styles.btnPrimary}`} disabled={!canManageSettings || saving} onClick={handleSave}>
            {saving ? "Đang lưu..." : "Lưu thay đổi"}
          </button>
        </div>
      </div>

      <div className={styles.preview}>
        <div className={styles.previewBanner} style={previewBannerStyle} />
        <div className={styles.previewBody}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {avatarUrl ? (
              <img src={avatarUrl} alt={name || "server"} style={{ width: 46, height: 46, borderRadius: 14, objectFit: "cover" }} />
            ) : (
              <div style={{ width: 46, height: 46, borderRadius: 14, background: "var(--color-panel-active)" }} />
            )}
            <div className={styles.previewName}>{name || "Máy chủ"}</div>
          </div>
          <div className={styles.previewDesc}>{description || "Chưa có mô tả."}</div>
          {traitsFilled > 0 && (
            <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
              {traits.filter((t) => t.text.trim()).map((t, i) => (
                <div key={`${t.text}-${i}`} style={{ fontSize: 13 }}>
                  <span style={{ marginRight: 6 }}>{t.emoji || "🙂"}</span>
                  <span>{t.text}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {emojiPickerIndex !== null && (
        <div
          ref={emojiPickerRef}
          className={styles.emojiPickerPopover}
          style={{ top: emojiPickerPos.top, left: emojiPickerPos.left }}
        >
          <EmojiPicker
            onEmojiClick={(emojiData: any) => {
              updateTrait(emojiPickerIndex, { emoji: emojiData?.emoji || "🙂" });
              setEmojiPickerIndex(null);
            }}
            autoFocusSearch={false}
            lazyLoadEmojis
            searchDisabled={false}
            skinTonesDisabled
            previewConfig={{ showPreview: false }}
            height={360}
            width={360}
          />
        </div>
      )}
    </div>
  );
}

