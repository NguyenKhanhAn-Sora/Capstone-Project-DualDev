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
  fetchCurrentProfile,
  fetchProfileDetail,
  resetProfileAvatar,
  updateMyProfile,
  uploadMedia,
  uploadProfileAvatar,
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

const EmojiPicker = dynamic(() => import("emoji-picker-react"), {
  ssr: false,
});

const BIO_MAX = 300;
const PRONOUNS_MAX = 80;
const DEFAULT_AVATAR =
  "https://res.cloudinary.com/doicocgeo/image/upload/v1765850274/user-avatar-default_gfx5bs.jpg";

type Props = {
  active: boolean;
  token: string;
  currentUserId: string;
  tab: "main" | "server";
  servers: Array<{ _id: string; name: string }>;
  onToast?: (message: string) => void;
};

async function urlToImageFile(url: string): Promise<File> {
  const res = await fetch(url, { mode: "cors" });
  if (!res.ok) throw new Error("Could not load image.");
  const blob = await res.blob();
  const type = blob.type && blob.type.startsWith("image/") ? blob.type : "image/jpeg";
  const ext = type.includes("png") ? "png" : "jpg";
  return new File([blob], `avatar-recent.${ext}`, { type });
}

export default function MessagesProfileEditor({
  active,
  token,
  currentUserId,
  tab,
  servers,
  onToast,
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

  const [serverId, setServerId] = useState("");
  const [serverNickname, setServerNickname] = useState("");
  const [serverNickSaving, setServerNickSaving] = useState(false);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState<"avatar" | "banner">("avatar");
  const [cropOpen, setCropOpen] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [colorOpen, setColorOpen] = useState(false);
  const swatchRef = useRef<HTMLButtonElement>(null);
  const [swatchRect, setSwatchRect] = useState<DOMRect | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [recentList, setRecentList] = useState<string[]>([]);

  const refreshRecent = useCallback(() => {
    setRecentList(getRecentProfileAvatars());
  }, []);

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
      const detail = await fetchProfileDetail({
        token,
        id: currentUserId,
      });
      setDisplayName(detail.displayName ?? "");
      setUsername(detail.username ?? "");
      setPronouns((detail.pronouns ?? "").slice(0, PRONOUNS_MAX));
      setBio((detail.bio ?? "").slice(0, BIO_MAX));
      setAvatarUrl(detail.avatarUrl || DEFAULT_AVATAR);
      const parsed = parseUserCover(detail.coverUrl);
      setBannerImageUrl(parsed.bannerImageUrl);
      setBannerSolidHex(parsed.bannerSolidHex);
    } catch {
      try {
        const cur = await fetchCurrentProfile({ token });
        setDisplayName(cur.displayName ?? "");
        setUsername(cur.username ?? "");
        setPronouns("");
        setBio("");
        setAvatarUrl(cur.avatarUrl || DEFAULT_AVATAR);
        const parsed = parseUserCover("");
        setBannerImageUrl(parsed.bannerImageUrl);
        setBannerSolidHex(parsed.bannerSolidHex);
      } catch {
        onToastRef.current?.(t("chat.profileEditor.errorLoadProfile"));
      }
    } finally {
      setLoading(false);
    }
  }, [token, currentUserId]);

  useEffect(() => {
    if (!active) return;
    void loadProfile();
    refreshRecent();
  }, [active, loadProfile, refreshRecent]);

  useEffect(() => {
    if (!active || tab !== "server" || !serverId) {
      setServerNickname((prev) => (prev === "" ? prev : ""));
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

  const bannerStyle = useMemo(() => {
    if (bannerImageUrl) {
      return {
        backgroundImage: `url('${bannerImageUrl.replace(/'/g, "%27")}')`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundColor: "#111214",
      } as React.CSSProperties;
    }
    return { background: bannerSolidHex } as React.CSSProperties;
  }, [bannerImageUrl, bannerSolidHex]);

  const saveMain = async () => {
    setSaving(true);
    try {
      const coverUrl = buildUserCoverUrlForSave({
        bannerImageUrl,
        bannerSolidHex,
      });
      await updateMyProfile({
        token,
        payload: {
          displayName: displayName.trim(),
          username: username.trim().toLowerCase(),
          bio: bio.slice(0, BIO_MAX),
          pronouns: pronouns.trim().slice(0, PRONOUNS_MAX),
          coverUrl: coverUrl || undefined,
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
    startCropWithFile(file);
  };

  const onRecentAvatar = async (url: string) => {
    setPickerOpen(false);
    try {
      const f = await urlToImageFile(url);
      startCropWithFile(f);
    } catch {
      onToast?.(t("chat.profileEditor.errorOpenRecent"));
    }
  };

  const onBannerFile = async (file: File) => {
    setPickerOpen(false);
    try {
      const optimized = await optimizeBannerImageFile(file);
      const up = await uploadMedia({ token, file: optimized });
      const url = up.secureUrl || up.url;
      if (!url) throw new Error(t("chat.profileEditor.errorGetUrl"));
      setBannerImageUrl(url);
      setBannerSolidHex(bannerSolidHex);
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : t("chat.profileEditor.errorLoadBanner"));
    }
  };

  const submitAvatarForm = async (form: FormData) => {
    const res = await uploadProfileAvatar({ token, form });
    setAvatarUrl(res.avatarUrl || DEFAULT_AVATAR);
    if (res.avatarUrl) pushRecentProfileAvatar(res.avatarUrl);
    refreshRecent();
    onToast?.(t("chat.profileEditor.updatedAvatar"));
    await loadProfile();
  };

  const placeholderSoon = () =>
    onToast?.(t("chat.profileEditor.comingSoon"));

  if (!active) return null;

  return (
    <div className={styles.root}>
      {loading ? (
        <p className={styles.hint}>{t("chat.profileEditor.loading")}</p>
      ) : (
        <div className={styles.layout}>
          <div className={styles.left}>
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
                    const res = await resetProfileAvatar({ token });
                    setAvatarUrl(res.avatarUrl || DEFAULT_AVATAR);
                    onToast?.(t("chat.profileEditor.removeAvatarDone"));
                    await loadProfile();
                  } catch {
                    onToast?.(t("chat.profileEditor.errorRemoveAvatar"));
                  }
                }}
              >
                {t("chat.profileEditor.removeAvatar")}
              </button>
            </div>

            <hr className={styles.divider} />

            <label className={styles.sectionTitle}>{t("chat.profileEditor.avatarDecoLabel")}</label>
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={placeholderSoon}
            >
              {t("chat.profileEditor.changeAvatarDeco")}
            </button>

            <hr className={styles.divider} />

            <label className={styles.sectionTitle}>{t("chat.profileEditor.nameplateLabel")}</label>
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={placeholderSoon}
            >
              {t("chat.profileEditor.changeNameplate")}
            </button>

            <hr className={styles.divider} />

            <label className={styles.sectionTitle}>{t("chat.profileEditor.profileEffectLabel")}</label>
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={placeholderSoon}
            >
              {t("chat.profileEditor.changeProfileEffect")}
            </button>

            <hr className={styles.divider} />

            <label className={styles.sectionTitle}>{t("chat.profileEditor.bannerColorLabel")}</label>
            <div className={styles.bannerRow}>
              <button
                type="button"
                ref={swatchRef}
                className={styles.colorSwatch}
                style={
                  bannerImageUrl
                    ? {
                        backgroundImage: `url(${bannerImageUrl})`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                      }
                    : { background: bannerSolidHex }
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
                onClick={() => {
                  setPickerMode("banner");
                  setPickerOpen(true);
                }}
              >
                {t("chat.profileEditor.uploadBanner")}
              </button>
              {bannerImageUrl ? (
                <button
                  type="button"
                  className={styles.btnMuted}
                  onClick={() => setBannerImageUrl(null)}
                >
                  {t("chat.profileEditor.removeBanner")}
                </button>
              ) : null}
            </div>

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
                disabled={saving}
                onClick={() => void saveMain()}
              >
                {t("chat.profileEditor.saveMain")}
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
                <div className={styles.avatar}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={avatarUrl || DEFAULT_AVATAR} alt="" />
                </div>
                <div className={styles.statusPill}>{t("chat.profileEditor.statusPlaceholder")}</div>
                <h4 className={styles.displayName}>{previewDisplayName}</h4>
                <p className={styles.subLine}>{subLine}</p>
                <p className={styles.bioPreview}>{bio.trim() || "\u00a0"}</p>
                <button type="button" className={styles.exampleBtn}>
                  {t("chat.profileEditor.exampleBtn")}
                </button>
              </div>
            </div>
            <div className={styles.nameplate}>
              <div className={styles.nameplateAv}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={avatarUrl || DEFAULT_AVATAR} alt="" />
              </div>
              <span className={styles.nameplateName}>{previewDisplayName}</span>
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

      <ProfileBannerColorPicker
        open={colorOpen}
        anchorRect={swatchRect}
        valueHex={bannerSolidHex}
        onChange={(hex) => {
          setBannerSolidHex(hex);
          setBannerImageUrl(null);
        }}
        onClose={() => setColorOpen(false)}
      />
    </div>
  );
}
