"use client";

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import dynamic from "next/dynamic";
import styles from "./MessagesProfileEditor.module.css";
import { useLanguage } from "@/component/language-provider";
import {
  fetchMessagingProfileMe,
  resetMessagingProfileAvatar,
  updateMyMessagingProfile,
  uploadMedia,
  uploadMessagingProfileAvatar,
} from "@/lib/api";
import * as serversApi from "@/lib/servers-api";
import { optimizeBannerImageFile } from "@/lib/server-banner";
import {
  buildUserCoverUrlForSave,
  parseUserCover,
} from "@/lib/user-profile-cover";
import {
  getRecentProfileAvatars,
  pushRecentProfileAvatar,
} from "@/lib/profile-recent-avatars";
import ProfileBannerColorPicker from "./ProfileBannerColorPicker";
import ProfileImagePickerModal from "./ProfileImagePickerModal";
import ProfileAvatarCropModal from "./ProfileAvatarCropModal";
import ProfileBannerCropModal from "./ProfileBannerCropModal";
import DisplayNameStyleModal, {
  type DisplayNameStyleValue,
} from "./DisplayNameStyleModal";

const EmojiPicker = dynamic(() => import("emoji-picker-react"), {
  ssr: false,
});

const BIO_MAX = 300;
const PRONOUNS_MAX = 80;
const DEFAULT_AVATAR =
  "https://res.cloudinary.com/doicocgeo/image/upload/v1765850274/user-avatar-default_gfx5bs.jpg";
const DEFAULT_DISPLAY_NAME_STYLE: DisplayNameStyleValue = {
  fontId: "default",
  effectId: "solid",
  primaryHex: "#f2f3f5",
  accentHex: "#5865f2",
};
const DEMO_DISPLAY_NAME_STYLE: DisplayNameStyleValue = {
  fontId: "rounded",
  effectId: "gradient",
  primaryHex: "#f2f3f5",
  accentHex: "#5865f2",
};

type Props = {
  active: boolean;
  token: string;
  currentUserId: string;
  tab: "main" | "server";
  servers: Array<{ _id: string; name: string }>;
  onToast?: (message: string) => void;
  /** Tạm thời: parent có thể truyền; nếu không sẽ mặc định locked. */
  boostUnlocked?: boolean;
};

async function urlToImageFile(url: string): Promise<File> {
  const res = await fetch(url, { mode: "cors" });
  if (!res.ok) throw new Error("Could not load image.");
  const blob = await res.blob();
  const type = blob.type && blob.type.startsWith("image/") ? blob.type : "image/jpeg";
  const ext = type.includes("gif") ? "gif" : type.includes("png") ? "png" : "jpg";
  return new File([blob], `avatar-recent.${ext}`, { type });
}

export default function MessagesProfileEditor({
  active,
  token,
  currentUserId,
  tab,
  servers,
  onToast,
  boostUnlocked = false,
}: Props) {
  const { t } = useLanguage();
  /** Tránh vòng lặp: parent hay truyền `onToast` inline → không đưa vào deps của loadProfile. */
  const onToastRef = useRef(onToast);
  useLayoutEffect(() => {
    onToastRef.current = onToast;
  }, [onToast]);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [pronouns, setPronouns] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState(DEFAULT_AVATAR);
  const [bannerImageUrl, setBannerImageUrl] = useState<string | null>(null);
  const [bannerSolidHex, setBannerSolidHex] = useState("#5865f2");

  const [serverAvatarUrl, setServerAvatarUrl] = useState<string | null>(null);
  const [serverBannerImageUrl, setServerBannerImageUrl] = useState<string | null>(null);
  const [serverBannerSolidHex, setServerBannerSolidHex] = useState("#5865f2");
  const [serverDisplayNameStyle, setServerDisplayNameStyle] = useState<DisplayNameStyleValue>({
    ...DEFAULT_DISPLAY_NAME_STYLE,
  });

  const [displayNameStyle, setDisplayNameStyle] = useState<DisplayNameStyleValue>({
    ...DEFAULT_DISPLAY_NAME_STYLE,
  });
  const [demoDisplayNameStyle, setDemoDisplayNameStyle] = useState<DisplayNameStyleValue>({
    ...DEMO_DISPLAY_NAME_STYLE,
  });
  const [styleModalOpen, setStyleModalOpen] = useState(false);
  const [styleModalBaseline, setStyleModalBaseline] =
    useState<DisplayNameStyleValue>(DEFAULT_DISPLAY_NAME_STYLE);

  const [serverId, setServerId] = useState("");
  const [serverNickname, setServerNickname] = useState("");
  const [serverNickSaving, setServerNickSaving] = useState(false);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState<"avatar" | "banner">("avatar");
  const [cropOpen, setCropOpen] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [bannerCropOpen, setBannerCropOpen] = useState(false);
  const [bannerCropSrc, setBannerCropSrc] = useState<string | null>(null);
  const [bannerCropFile, setBannerCropFile] = useState<File | null>(null);
  const [colorOpen, setColorOpen] = useState(false);
  const swatchRef = useRef<HTMLButtonElement>(null);
  const [swatchRect, setSwatchRect] = useState<DOMRect | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [recentList, setRecentList] = useState<string[]>([]);

  const refreshRecent = useCallback(() => {
    setRecentList(getRecentProfileAvatars());
  }, []);

  const mapProfileStyle = useCallback(
    (source?: {
      displayNameFontId?: string | null;
      displayNameEffectId?: string | null;
      displayNamePrimaryHex?: string | null;
      displayNameAccentHex?: string | null;
    }) => ({
      fontId:
        source?.displayNameFontId === "rounded" || source?.displayNameFontId === "mono"
          ? source.displayNameFontId
          : DEFAULT_DISPLAY_NAME_STYLE.fontId,
      effectId:
        source?.displayNameEffectId === "gradient" || source?.displayNameEffectId === "neon"
          ? source.displayNameEffectId
          : DEFAULT_DISPLAY_NAME_STYLE.effectId,
      primaryHex:
        /^#[0-9a-f]{6}$/i.test(String(source?.displayNamePrimaryHex || ""))
          ? String(source?.displayNamePrimaryHex)
          : DEFAULT_DISPLAY_NAME_STYLE.primaryHex,
      accentHex:
        /^#[0-9a-f]{6}$/i.test(String(source?.displayNameAccentHex || ""))
          ? String(source?.displayNameAccentHex)
          : DEFAULT_DISPLAY_NAME_STYLE.accentHex,
    }),
    [],
  );

  const emitDisplayNameStyleUpdated = useCallback(
    (style: DisplayNameStyleValue) => {
      if (typeof window === "undefined") return;
      window.dispatchEvent(
        new CustomEvent("cordigram-user-profile-style-updated", {
          detail: {
            profileContext: "messaging" as const,
            userId: currentUserId,
            displayName: displayName.trim() || username.trim() || undefined,
            /** Trong messaging, đây là `chatUsername` (dòng phụ chat), không phải username social. */
            username: username.trim() || undefined,
            displayNameFontId: style.fontId,
            displayNameEffectId: style.effectId,
            displayNamePrimaryHex: style.primaryHex,
            displayNameAccentHex: style.accentHex,
          },
        }),
      );
    },
    [currentUserId, displayName, username],
  );

  useEffect(() => {
    if (!emojiOpen) return;
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (t instanceof Element && t.closest?.("[data-bio-emoji-root]")) return;
      setEmojiOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [emojiOpen]);

  const loadProfile = useCallback(async () => {
    if (!currentUserId) return;
    setLoading(true);
    try {
      const detail = await fetchMessagingProfileMe({ token });
      setDisplayName(detail.displayName ?? "");
      setUsername(detail.chatUsername ?? "");
      setPronouns((detail.pronouns ?? "").slice(0, PRONOUNS_MAX));
      setBio((detail.bio ?? "").slice(0, BIO_MAX));
      setAvatarUrl(detail.avatarUrl || DEFAULT_AVATAR);
      const parsed = parseUserCover(detail.coverUrl);
      setBannerImageUrl(parsed.bannerImageUrl);
      setBannerSolidHex(parsed.bannerSolidHex);
      setDisplayNameStyle(mapProfileStyle(detail));
    } catch {
      onToastRef.current?.(t("chat.profileEditor.errorLoadProfile"));
    } finally {
      setLoading(false);
    }
  }, [token, currentUserId, mapProfileStyle]);

  useEffect(() => {
    if (!active) return;
    void loadProfile();
    refreshRecent();
  }, [active, loadProfile, refreshRecent]);

  useEffect(() => {
    if (!active || tab !== "server" || !serverId) {
      setServerNickname((prev) => (prev === "" ? prev : ""));
      setServerAvatarUrl(null);
      setServerBannerImageUrl(null);
      setServerBannerSolidHex("#5865f2");
      setServerDisplayNameStyle({ ...DEFAULT_DISPLAY_NAME_STYLE });
      return;
    }
    void (async () => {
      try {
        const { members } = await serversApi.getServerMembersWithRoles(serverId);
        const me = members.find((m) => m.userId === currentUserId);
        setServerNickname((me?.nickname ?? "").trim());
      } catch {
        setServerNickname("");
      }
    })();
  }, [active, tab, serverId, currentUserId]);

  useEffect(() => {
    if (!active || tab !== "server" || !serverId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await serversApi.getMyServerProfile(serverId);
        if (cancelled) return;
        setServerAvatarUrl(res.avatarUrl ?? null);
        const parsed = parseUserCover(res.coverUrl || "");
        setServerBannerImageUrl(parsed.bannerImageUrl);
        setServerBannerSolidHex(parsed.bannerSolidHex);
        setServerDisplayNameStyle(mapProfileStyle(res));
      } catch {
        if (cancelled) return;
        setServerAvatarUrl(null);
        const parsed = parseUserCover("");
        setServerBannerImageUrl(parsed.bannerImageUrl);
        setServerBannerSolidHex(parsed.bannerSolidHex);
        setServerDisplayNameStyle({ ...DEFAULT_DISPLAY_NAME_STYLE });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active, tab, serverId, mapProfileStyle]);

  const openColorPicker = () => {
    const r = swatchRef.current?.getBoundingClientRect() ?? null;
    setSwatchRect(r);
    setColorOpen(true);
  };

  const previewDisplayName = useMemo(() => {
    if (tab === "server" && serverNickname.trim()) return serverNickname.trim();
    return displayName.trim() || "—";
  }, [tab, serverNickname, displayName]);

  const subLine = useMemo(() => {
    const u = username.trim();
    const p = pronouns.trim();
    if (!u && !p) return "—";
    if (!p) return u;
    if (!u) return p;
    return `${u} • ${p}`;
  }, [username, pronouns]);

  const effectiveAvatarUrl =
    tab === "server" && serverId ? serverAvatarUrl || avatarUrl : avatarUrl;
  const effectiveBannerImageUrl =
    tab === "server" && serverId ? serverBannerImageUrl : bannerImageUrl;
  const effectiveBannerSolidHex =
    tab === "server" && serverId ? serverBannerSolidHex : bannerSolidHex;

  const appliedDisplayNameStyle =
    tab === "server" && serverId ? serverDisplayNameStyle : displayNameStyle;
  const effectiveNameStyle = boostUnlocked ? appliedDisplayNameStyle : demoDisplayNameStyle;

  const openDisplayNameStyleModal = useCallback(() => {
    setStyleModalBaseline(boostUnlocked ? appliedDisplayNameStyle : demoDisplayNameStyle);
    setStyleModalOpen(true);
  }, [boostUnlocked, appliedDisplayNameStyle, demoDisplayNameStyle]);

  const bannerStyle = useMemo(() => {
    if (effectiveBannerImageUrl) {
      return {
        backgroundImage: `url('${effectiveBannerImageUrl.replace(/'/g, "%27")}')`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundColor: "#111214",
      } as React.CSSProperties;
    }
    return { background: effectiveBannerSolidHex } as React.CSSProperties;
  }, [effectiveBannerImageUrl, effectiveBannerSolidHex]);

  const displayNameTextStyle = useMemo(() => {
    const v = effectiveNameStyle;
    const primary = v.primaryHex;
    const accent = v.accentHex;
    const fontFamily =
      v.fontId === "mono"
        ? 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
        : v.fontId === "rounded"
          ? 'ui-rounded, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif'
          : 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
    if (v.effectId === "gradient") {
      return {
        backgroundImage: `linear-gradient(0deg, ${primary}, ${accent})`,
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        color: "transparent",
        fontFamily,
      } as React.CSSProperties;
    }
    if (v.effectId === "neon") {
      return {
        color: primary,
        textShadow: `0 0 10px ${accent}, 0 0 18px ${accent}`,
        fontFamily,
      } as React.CSSProperties;
    }
    return { color: primary, fontFamily } as React.CSSProperties;
  }, [effectiveNameStyle]);

  const saveMain = async () => {
    setSaving(true);
    try {
      const coverUrl = buildUserCoverUrlForSave({
        bannerImageUrl,
        bannerSolidHex,
      });
      await updateMyMessagingProfile({
        token,
        payload: {
          displayName: displayName.trim(),
          chatUsername: username.trim().toLowerCase(),
          bio: bio.slice(0, BIO_MAX),
          pronouns: pronouns.trim().slice(0, PRONOUNS_MAX),
          coverUrl: coverUrl || undefined,
          ...(boostUnlocked
            ? ({
                displayNameFontId: displayNameStyle.fontId,
                displayNameEffectId: displayNameStyle.effectId,
                displayNamePrimaryHex: displayNameStyle.primaryHex,
                displayNameAccentHex: displayNameStyle.accentHex,
              } as any)
            : {}),
        },
      });
      onToast?.(t("chat.profileEditor.savedProfile"));
      await loadProfile();
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : t("chat.profileEditor.errorSaveProfile"));
    } finally {
      setSaving(false);
    }
  };

  const saveServerProfile = async () => {
    if (!serverId) return;
    setSaving(true);
    try {
      const coverUrl = buildUserCoverUrlForSave({
        bannerImageUrl: serverBannerImageUrl,
        bannerSolidHex: serverBannerSolidHex,
      });
      await serversApi.updateMyServerProfile(serverId, {
        coverUrl: coverUrl || null,
        ...(boostUnlocked
          ? {
              displayNameFontId: serverDisplayNameStyle.fontId,
              displayNameEffectId: serverDisplayNameStyle.effectId,
              displayNamePrimaryHex: serverDisplayNameStyle.primaryHex,
              displayNameAccentHex: serverDisplayNameStyle.accentHex,
            }
          : {}),
      });
      onToast?.(t("chat.profileEditor.savedProfile"));
    } catch (e) {
      onToast?.(
        e instanceof Error ? e.message : t("chat.profileEditor.errorSaveProfile"),
      );
    } finally {
      setSaving(false);
    }
  };

  const saveServerNick = async () => {
    if (!serverId) return;
    setServerNickSaving(true);
    try {
      await serversApi.updateMyServerNickname(serverId, serverNickname);
      onToast?.(t("chat.profileEditor.savedNick"));
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : t("chat.profileEditor.errorSaveNick"));
    } finally {
      setServerNickSaving(false);
    }
  };

  const applyDisplayNameStyle = async (next: DisplayNameStyleValue) => {
    if (!boostUnlocked) {
      setDemoDisplayNameStyle(next);
      emitDisplayNameStyleUpdated(next);
      return;
    }

    if (tab === "server" && serverId) {
      setServerDisplayNameStyle(next);
      try {
        await serversApi.updateMyServerProfile(serverId, {
          displayNameFontId: next.fontId,
          displayNameEffectId: next.effectId,
          displayNamePrimaryHex: next.primaryHex,
          displayNameAccentHex: next.accentHex,
        });
        onToast?.(t("chat.profileEditor.displayNameStyleApplied"));
      } catch (e) {
        onToast?.(e instanceof Error ? e.message : t("chat.profileEditor.errorSaveProfile"));
      }
      return;
    }

    const revertedFrom = displayNameStyle;
    setDisplayNameStyle(next);
    emitDisplayNameStyleUpdated(next);
    try {
      await updateMyMessagingProfile({
        token,
        payload: {
          displayNameFontId: next.fontId,
          displayNameEffectId: next.effectId,
          displayNamePrimaryHex: next.primaryHex,
          displayNameAccentHex: next.accentHex,
        },
      });
      onToast?.(t("chat.profileEditor.displayNameStyleApplied"));
      await loadProfile();
    } catch (e) {
      setDisplayNameStyle(revertedFrom);
      emitDisplayNameStyleUpdated(revertedFrom);
      onToast?.(
        e instanceof Error ? e.message : t("chat.profileEditor.displayNameStyleError"),
      );
    }
  };

  const startCropWithFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        setCropSrc(result);
        setCropFile(file);
        setCropOpen(true);
      }
    };
    reader.readAsDataURL(file);
  };

  const onAvatarFile = (file: File) => {
    setPickerOpen(false);
    const isGif =
      file.type === "image/gif" || file.name.toLowerCase().endsWith(".gif");
    if (isGif) {
      if (!boostUnlocked) {
        onToast?.("Cần Boost để dùng avatar GIF.");
        return;
      }
      const form = new FormData();
      form.append("original", file, file.name);
      void submitAvatarForm(form);
      return;
    }
    startCropWithFile(file);
  };

  const onRecentAvatar = async (url: string) => {
    setPickerOpen(false);
    try {
      const f = await urlToImageFile(url);
      const isGif =
        f.type === "image/gif" || f.name.toLowerCase().endsWith(".gif");
      if (isGif) {
        if (!boostUnlocked) {
          onToast?.("Cần Boost để dùng avatar GIF.");
          return;
        }
        const form = new FormData();
        form.append("original", f, f.name);
        await submitAvatarForm(form);
        return;
      }
      startCropWithFile(f);
    } catch {
      onToast?.(t("chat.profileEditor.errorOpenRecent"));
    }
  };

  const onBannerFile = async (file: File) => {
    setPickerOpen(false);
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        setBannerCropSrc(result);
        setBannerCropFile(file);
        setBannerCropOpen(true);
      }
    };
    reader.readAsDataURL(file);
  };

  const submitBannerCrop = async (cropped: File) => {
    try {
      const optimized = await optimizeBannerImageFile(cropped);
      const up = await uploadMedia({
        token,
        file: optimized,
        cordigramUploadContext: "messages",
      });
      const url = up.secureUrl || up.url;
      if (!url) throw new Error(t("chat.profileEditor.errorGetUrl"));
      if (tab === "server" && serverId) {
        setServerBannerImageUrl(url);
        setServerBannerSolidHex(serverBannerSolidHex);
      } else {
        setBannerImageUrl(url);
        setBannerSolidHex(bannerSolidHex);
      }
      onToast?.(t("chat.profileEditor.updatedBanner"));
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : t("chat.profileEditor.errorLoadBanner"));
    }
  };

  const submitAvatarForm = async (form: FormData) => {
    if (tab === "server" && serverId) {
      const res = await serversApi.uploadMyServerAvatar({
        serverId,
        form,
        cordigramUploadContext: "messages",
      });
      setServerAvatarUrl(res.avatarUrl || null);
      if (res.avatarUrl) pushRecentProfileAvatar(res.avatarUrl);
      refreshRecent();
      onToast?.(t("chat.profileEditor.updatedAvatar"));
      return;
    }
    const res = await uploadMessagingProfileAvatar({
      token,
      form,
      cordigramUploadContext: "messages",
    });
    setAvatarUrl(res.avatarUrl || DEFAULT_AVATAR);
    if (res.avatarUrl) pushRecentProfileAvatar(res.avatarUrl);
    refreshRecent();
    onToast?.(t("chat.profileEditor.updatedAvatar"));
    await loadProfile();
  };

  if (!active) return null;

  return (
    <div className={styles.root}>
      {loading ? (
        <p className={styles.hint}>{t("chat.profileEditor.loading")}</p>
      ) : (
        <div className={styles.layout}>
          <div className={styles.left}>
            <div className={styles.boostPromo}>
              <div className={styles.boostPromoRow}>
                <div>
                  <div className={styles.boostPromoTitle}>
                    {boostUnlocked
                      ? t("chat.profileEditor.boostPromoTitleActive")
                      : t("chat.profileEditor.boostPromoTitleDemo")}
                    {!boostUnlocked ? (
                      <span className={styles.lockedTag}>
                        <span className={styles.lockedTagDot} aria-hidden />
                        {t("chat.profileEditor.boostPromoTagLocked")}
                      </span>
                    ) : (
                      <span className={styles.lockedTag}>
                        <span className={styles.lockedTagDot} aria-hidden />
                        {t("chat.profileEditor.boostPromoTagUnlock")}
                      </span>
                    )}
                  </div>
                  <div className={styles.boostPromoDesc}>
                    {boostUnlocked
                      ? t("chat.profileEditor.boostPromoDescActive")
                      : t("chat.profileEditor.boostPromoDescDemo")}
                  </div>
                </div>
                <button
                  type="button"
                  className={styles.btnGhost}
                  onClick={openDisplayNameStyleModal}
                >
                  {boostUnlocked
                    ? t("chat.profileEditor.boostPromoCtaActive")
                    : t("chat.profileEditor.boostPromoCtaDemo")}
                </button>
              </div>
            </div>

            {tab === "server" ? (
              <>
                <label className={styles.sectionTitle}>{t("chat.profileEditor.serverLabel")}</label>
                <select
                  className={styles.serverSelect}
                  value={serverId}
                  onChange={(e) => setServerId(e.target.value)}
                >
                  <option value="">{t("chat.profileEditor.selectServer")}</option>
                  {servers.map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <p className={styles.hint}>{t("chat.profileEditor.serverHint")}</p>
                <label className={styles.sectionTitle}>{t("chat.profileEditor.serverNickLabel")}</label>
                <input
                  className={styles.input}
                  value={serverNickname}
                  onChange={(e) => setServerNickname(e.target.value)}
                  disabled={!serverId}
                  placeholder={t("chat.profileEditor.serverNickPlaceholder")}
                />
                <hr className={styles.divider} />
              </>
            ) : null}

            <label className={styles.sectionTitle}>{t("chat.profileEditor.displayNameLabel")}</label>
            <input
              className={styles.input}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />

            <label className={styles.sectionTitle}>{t("chat.profileEditor.usernameLabel")}</label>
            <input
              className={styles.input}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={tab === "server"}
            />

            <label className={styles.sectionTitle}>{t("chat.profileEditor.pronounsLabel")}</label>
            <input
              className={styles.input}
              value={pronouns}
              maxLength={PRONOUNS_MAX}
              onChange={(e) =>
                setPronouns(e.target.value.slice(0, PRONOUNS_MAX))
              }
              placeholder={t("chat.profileEditor.pronounsPlaceholder")}
            />

            <hr className={styles.divider} />

            <label className={styles.sectionTitle}>{t("chat.profileEditor.avatarLabel")}</label>
            <div className={styles.row2}>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={() => {
                  setPickerMode("avatar");
                  setPickerOpen(true);
                }}
              >
                {t("chat.profileEditor.changeAvatar")}
              </button>
              <button
                type="button"
                className={styles.btnMuted}
                onClick={async () => {
                  try {
                      if (tab === "server" && serverId) {
                        await serversApi.resetMyServerAvatar(serverId);
                        setServerAvatarUrl(null);
                      } else {
                        const res = await resetMessagingProfileAvatar({ token });
                        setAvatarUrl(res.avatarUrl || DEFAULT_AVATAR);
                        await loadProfile();
                      }
                    onToast?.(t("chat.profileEditor.removeAvatarDone"));
                  } catch {
                    onToast?.(t("chat.profileEditor.errorRemoveAvatar"));
                  }
                }}
              >
                {t("chat.profileEditor.removeAvatar")}
              </button>
            </div>

            <hr className={styles.divider} />

            <label className={styles.sectionTitle}>{t("chat.profileEditor.bannerColorLabel")}</label>
            <div className={styles.bannerRow}>
              <button
                type="button"
                ref={swatchRef}
                className={styles.colorSwatch}
                style={
                  effectiveBannerImageUrl
                    ? {
                        backgroundImage: `url(${effectiveBannerImageUrl})`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                      }
                    : { background: effectiveBannerSolidHex }
                }
                aria-label={t("chat.profileEditor.changeBannerColorAria")}
                onClick={openColorPicker}
              >
                <span className={styles.editGlyph} aria-hidden>
                  ✎
                </span>
              </button>
              <button
                type="button"
                className={styles.btnPrimary}
                disabled={!boostUnlocked}
                onClick={() => {
                  if (!boostUnlocked) {
                    onToast?.("Cần Boost để upload banner.");
                    return;
                  }
                  setPickerMode("banner");
                  setPickerOpen(true);
                }}
              >
                {t("chat.profileEditor.uploadBanner")}
              </button>
              {effectiveBannerImageUrl ? (
                <button
                  type="button"
                  className={styles.btnMuted}
                  onClick={() => {
                    if (tab === "server" && serverId) setServerBannerImageUrl(null);
                    else setBannerImageUrl(null);
                  }}
                >
                  {t("chat.profileEditor.removeBanner")}
                </button>
              ) : null}
            </div>

            <hr className={styles.divider} />

            <label className={styles.sectionTitle}>
              {t("chat.profileEditor.displayNameStyleHeading")}
            </label>
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={openDisplayNameStyleModal}
            >
              {boostUnlocked
                ? t("chat.profileEditor.displayNameStyleOpen")
                : t("chat.profileEditor.displayNameStyleTry")}
            </button>

            <hr className={styles.divider} />

            <label className={styles.sectionTitle}>{t("chat.profileEditor.bioLabel")}</label>
            <p className={styles.hint}>{t("chat.profileEditor.bioHint")}</p>
            <div className={styles.bioWrap} data-bio-emoji-root>
              <textarea
                className={styles.textarea}
                value={bio}
                maxLength={BIO_MAX}
                onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX))}
              />
              <button
                type="button"
                className={styles.bioEmojiBtn}
                aria-label={t("chat.profileEditor.insertEmojiAria")}
                onClick={() => setEmojiOpen((v) => !v)}
              >
                🙂
              </button>
              {emojiOpen ? (
                <div className={styles.emojiPop}>
                  <EmojiPicker
                    onEmojiClick={(e) => {
                      setBio((prev) =>
                        (prev + e.emoji).slice(0, BIO_MAX),
                      );
                    }}
                    width={320}
                    height={380}
                  />
                </div>
              ) : null}
              <div className={styles.bioCount}>
                {BIO_MAX - bio.length}
              </div>
            </div>

            <div className={styles.footerActions}>
              <button
                type="button"
                className={styles.btnPrimary}
                disabled={saving || (tab === "server" && !serverId)}
                onClick={() => void (tab === "server" ? saveServerProfile() : saveMain())}
              >
                {tab === "server"
                  ? t("chat.profileEditor.saveServerProfile")
                  : t("chat.profileEditor.saveMain")}
              </button>
              {tab === "server" ? (
                <button
                  type="button"
                  className={styles.btnMuted}
                  disabled={!serverId || serverNickSaving}
                  onClick={() => void saveServerNick()}
                >
                  {t("chat.profileEditor.saveServerNick")}
                </button>
              ) : null}
            </div>
          </div>

          <aside className={styles.right}>
            <div className={styles.previewTitle}>{t("chat.profileEditor.previewTitle")}</div>
            <div className={styles.previewCard}>
              <div className={styles.banner} style={bannerStyle} />
              <div className={styles.bodyCard}>
                <img
                  className={styles.avatar}
                  src={effectiveAvatarUrl || DEFAULT_AVATAR}
                  alt=""
                />
                <div className={styles.statusPill}>{t("chat.profileEditor.statusPlaceholder")}</div>
                <h4 className={styles.displayName} style={displayNameTextStyle}>
                  {previewDisplayName}
                </h4>
                <p className={styles.subLine}>{subLine}</p>
                <p className={styles.bioPreview}>{bio.trim() || "\u00a0"}</p>
                <button type="button" className={styles.exampleBtn}>
                  {t("chat.profileEditor.exampleBtn")}
                </button>
              </div>
            </div>
            <div className={styles.nameplate}>
              <img
                className={styles.nameplateAv}
                src={effectiveAvatarUrl || DEFAULT_AVATAR}
                alt=""
              />
              <span className={styles.nameplateName} style={displayNameTextStyle}>
                {previewDisplayName}
              </span>
            </div>
          </aside>
        </div>
      )}

      <ProfileImagePickerModal
        open={pickerOpen}
        mode={pickerMode}
        recentAvatarUrls={recentList}
        onClose={() => setPickerOpen(false)}
        onPickFile={(file) => {
          if (pickerMode === "banner") void onBannerFile(file);
          else onAvatarFile(file);
        }}
        onPickRecentAvatar={(url) => void onRecentAvatar(url)}
      />

      <ProfileAvatarCropModal
        open={cropOpen}
        imageSrc={cropSrc}
        sourceFile={cropFile}
        onClose={() => {
          setCropOpen(false);
          setCropSrc(null);
          setCropFile(null);
        }}
        onSubmit={submitAvatarForm}
      />

      <ProfileBannerCropModal
        open={bannerCropOpen}
        imageSrc={bannerCropSrc}
        sourceFile={bannerCropFile}
        onClose={() => {
          setBannerCropOpen(false);
          setBannerCropSrc(null);
          setBannerCropFile(null);
        }}
        onSubmit={submitBannerCrop}
      />

      <ProfileBannerColorPicker
        open={colorOpen}
        anchorRect={swatchRect}
        valueHex={effectiveBannerSolidHex}
        onChange={(hex) => {
          if (tab === "server" && serverId) {
            setServerBannerSolidHex(hex);
            setServerBannerImageUrl(null);
          } else {
            setBannerSolidHex(hex);
            setBannerImageUrl(null);
          }
        }}
        onClose={() => setColorOpen(false)}
      />

      <DisplayNameStyleModal
        open={styleModalOpen}
        locked={!boostUnlocked}
        value={boostUnlocked ? appliedDisplayNameStyle : demoDisplayNameStyle}
        revertValue={styleModalBaseline}
        onToast={onToast}
        onClose={() => setStyleModalOpen(false)}
        onDraftPreview={(next) => emitDisplayNameStyleUpdated(next)}
        onChange={(next) => {
          void applyDisplayNameStyle(next);
        }}
      />
    </div>
  );
}
