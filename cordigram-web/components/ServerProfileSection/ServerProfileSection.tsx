"use client";

import React, { useMemo, useRef, useState, useEffect } from "react";
import dynamic from "next/dynamic";
import * as serversApi from "@/lib/servers-api";
import { uploadMedia } from "@/lib/api";
import {
  BANNER_PRESETS,
  normalizeServerBanner,
  optimizeBannerImageFile,
} from "@/lib/server-banner";
import styles from "./ServerProfileSection.module.css";
import { useLanguage } from "@/component/language-provider";

const EmojiPicker = dynamic(() => import("emoji-picker-react"), {
  ssr: false,
});

type Trait = { emoji: string; text: string };

const RANDOM_EMOJIS = ["😀", "😎", "🔥", "🎮", "🎯", "🌟", "🚀", "✨", "🐱", "🫶", "👾", "🥳"];

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
  const { t, language } = useLanguage();
  const initialBanner = useMemo(() => normalizeServerBanner(initialServer), [initialServer]);
  const [name, setName] = useState(initialServer?.name ?? "");
  const [avatarUrl, setAvatarUrl] = useState(initialServer?.avatarUrl ?? "");
  const [bannerColor, setBannerColor] = useState(initialBanner.bannerColor);
  const [bannerImageUrl, setBannerImageUrl] = useState<string | null>(initialBanner.bannerImageUrl);
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
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);

  const traitsFilled = useMemo(() => traits.filter((t) => t.text.trim()).length, [traits]);

  useEffect(() => {
    const n = normalizeServerBanner(initialServer);
    setBannerColor(n.bannerColor);
    setBannerImageUrl(n.bannerImageUrl);
  }, [
    initialServer?._id,
    initialServer?.bannerUrl,
    initialServer?.bannerImageUrl,
    initialServer?.bannerColor,
  ]);

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
        // If serverId is invalid (or server was deleted), avoid noisy retries.
        if (!/^[a-f0-9]{24}$/i.test(String(serverId || ""))) {
          if (!cancelled) setProfileStats(null);
          return;
        }
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
      const up = await uploadMedia({
        token,
        file,
        cordigramUploadContext: "messages",
      });
      const url = up.secureUrl || up.url;
      if (!url) throw new Error(t("chat.serverProfile.errors.fileUrlMissing"));
      setAvatarUrl(url);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : t("chat.serverProfile.errors.uploadAvatarFailed"),
      );
    }
  };

  const handleUploadBanner = async (file: File | null) => {
    if (!file || !token) return;
    try {
      setError(null);
      const optimized = await optimizeBannerImageFile(file);
      const up = await uploadMedia({
        token,
        file: optimized,
        cordigramUploadContext: "messages",
      });
      const url = up.secureUrl || up.url;
      if (!url) throw new Error(t("chat.serverProfile.errors.bannerUrlMissing"));
      setBannerImageUrl(url);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : t("chat.serverProfile.errors.uploadBannerFailed"),
      );
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
      const legacyBanner = bannerImageUrl || bannerColor;
      const updated = await serversApi.updateServer(
        serverId,
        name.trim(),
        description,
        avatarUrl || undefined,
        {
          bannerUrl: legacyBanner,
          bannerImageUrl: bannerImageUrl || null,
          bannerColor,
          profileTraits: payloadTraits,
        },
      );
      setSuccess(t("chat.serverProfile.saved"));
      onUpdated?.(updated);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : t("chat.serverProfile.errors.saveFailed"),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.left}>
        <div className={styles.card}>
          <div className={styles.label}>{t("chat.serverProfile.info.title")}</div>
          <div className={styles.hint}>
            {t("chat.serverProfile.info.online", { count: profileStats?.onlineCount ?? 0 })}{" "}
            |{" "}
            {t("chat.serverProfile.info.members", {
              count: profileStats?.memberCount ?? initialServer?.memberCount ?? 0,
            })}{" "}
            |{" "}
            {t("chat.serverProfile.info.createdAt", {
              date: new Date(
                profileStats?.createdAt ?? initialServer?.createdAt ?? Date.now(),
              ).toLocaleDateString(
                language === "vi"
                  ? "vi-VN"
                  : language === "ja"
                    ? "ja-JP"
                    : language === "zh"
                      ? "zh-CN"
                      : "en-US",
              ),
            })}
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.label}>{t("chat.serverProfile.name.label")}</div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            disabled={!canManageSettings}
            placeholder={t("chat.serverProfile.name.placeholder")}
          />
        </div>

        <div className={styles.card}>
          <div className={styles.label}>{t("chat.serverProfile.avatar.label")}</div>
          <div className={styles.row}>
            <button className={`${styles.btn} ${styles.btnPrimary}`} disabled={!canManageSettings} onClick={() => avatarInputRef.current?.click()}>
              {t("chat.serverProfile.avatar.change")}
            </button>
            <button className={`${styles.btn} ${styles.btnDanger}`} disabled={!canManageSettings} onClick={() => setAvatarUrl("")}>
              {t("chat.serverProfile.avatar.remove")}
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
            placeholder={t("chat.serverProfile.avatar.urlPlaceholder")}
          />
        </div>

        <div className={styles.card}>
          <div className={styles.label}>{t("chat.serverProfile.banner.label")}</div>
          <div className={styles.hint}>
            {t("chat.serverProfile.banner.hint")}
          </div>
          <div className={styles.row} style={{ marginBottom: 10 }}>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnPrimary}`}
              disabled={!canManageSettings}
              onClick={() => bannerInputRef.current?.click()}
            >
              {t("chat.serverProfile.banner.upload")}
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnDanger}`}
              disabled={!canManageSettings || !bannerImageUrl}
              onClick={() => setBannerImageUrl(null)}
            >
              {t("chat.serverProfile.banner.remove")}
            </button>
            <input
              ref={bannerInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              style={{ display: "none" }}
              onChange={(e) => handleUploadBanner(e.target.files?.[0] ?? null)}
            />
          </div>
          <div className={styles.bannerPalette}>
            {BANNER_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                className={`${styles.bannerSwatch} ${bannerColor === preset ? styles.bannerSwatchActive : ""}`}
                style={{ background: preset }}
                disabled={!canManageSettings}
                onClick={() => setBannerColor(preset)}
                aria-label={t("chat.serverProfile.banner.pickColorAria")}
              />
            ))}
          </div>
          <div className={styles.hint}>{t("chat.serverProfile.banner.note")}</div>
        </div>

        <div className={styles.card}>
          <div className={styles.label}>{t("chat.serverProfile.traits.label")}</div>
          <div className={styles.hint}>{t("chat.serverProfile.traits.hint")}</div>
          <div className={styles.traitsGrid}>
            {traits.map((trait, idx) => (
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
                  title={t("chat.serverProfile.traits.pickEmoji")}
                >
                  {hoverEmoji[idx] || trait.emoji || "🙂"}
                </button>
                <input
                  className={styles.traitInput}
                  value={trait.text}
                  maxLength={80}
                  disabled={!canManageSettings}
                  onChange={(e) => updateTrait(idx, { text: e.target.value })}
                  placeholder={t("chat.serverProfile.traits.placeholder")}
                />
              </div>
            ))}
          </div>
          <div className={styles.hint}>
            {t("chat.serverProfile.traits.filledCount", { count: traitsFilled })}
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.label}>{t("chat.serverProfile.description.label")}</div>
          <div className={styles.hint}>{t("chat.serverProfile.description.hint")}</div>
          <textarea
            value={description ?? ""}
            onChange={(e) => setDescription(e.target.value)}
            disabled={!canManageSettings}
            maxLength={500}
            placeholder={t("chat.serverProfile.description.placeholder")}
          />
        </div>

        {error && <div className={styles.error}>{error}</div>}
        {success && <div className={styles.success}>{success}</div>}
        <div className={styles.row}>
          <button className={`${styles.btn} ${styles.btnPrimary}`} disabled={!canManageSettings || saving} onClick={handleSave}>
            {saving ? t("chat.common.saving") : t("chat.common.saveChanges")}
          </button>
        </div>
      </div>

      <div className={styles.preview}>
        <div className={styles.previewBanner} style={{ background: bannerColor }}>
          {bannerImageUrl ? (
            <div
              className={styles.previewBannerImage}
              style={{ backgroundImage: `url(${bannerImageUrl})` }}
            />
          ) : null}
        </div>
        <div className={styles.previewBody}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {avatarUrl ? (
              <img src={avatarUrl} alt={name || "server"} style={{ width: 46, height: 46, borderRadius: 14, objectFit: "cover" }} />
            ) : (
              <div style={{ width: 46, height: 46, borderRadius: 14, background: "var(--color-panel-active)" }} />
            )}
            <div className={styles.previewName}>{name || t("chat.common.server")}</div>
          </div>
          <div className={styles.previewDesc}>
            {description || t("chat.serverProfile.preview.noDescription")}
          </div>
          {traitsFilled > 0 && (
            <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
              {traits.filter((trait) => trait.text.trim()).map((trait, i) => (
                <div key={`${trait.text}-${i}`} style={{ fontSize: 13 }}>
                  <span style={{ marginRight: 6 }}>{trait.emoji || "🙂"}</span>
                  <span>{trait.text}</span>
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
