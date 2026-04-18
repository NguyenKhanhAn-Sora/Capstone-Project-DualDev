"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import styles from "./ServerStickerSection.module.css";
import * as serversApi from "@/lib/servers-api";
import { fetchBoostStatus } from "@/lib/api";
import AddServerStickerModal from "@/components/AddServerStickerModal/AddServerStickerModal";
import { useLanguage } from "@/component/language-provider";
import { DEFAULT_FREE_MAX_UPLOAD_BYTES } from "@/lib/upload-limits";

const ACCEPT = "image/png,image/jpeg,image/jpg,image/gif,image/webp,image/x-png";
/** Đồng bộ với backend FREE_MAX_UPLOAD_BYTES khi chưa tải được boost-status. */
const DEFAULT_USER_UPLOAD_BYTES = DEFAULT_FREE_MAX_UPLOAD_BYTES;
const FREE_BASE_SLOTS = 5;

function isAllowedFile(file: File): boolean {
  if (ACCEPT.split(",").some((t) => file.type === t.trim())) return true;
  return /\.(png|jpe?g|gif|webp)$/i.test(file.name);
}

type BoostTier = "basic" | "boost" | null;

function tierUnlocked(level: number, boostActive: boolean, boostTier: BoostTier): boolean {
  if (!boostActive || !boostTier) return false;
  if (boostTier === "boost") return true;
  return boostTier === "basic" && level === 1;
}

type Props = {
  serverId: string;
  token: string;
  canManage: boolean;
  /** Chỉ chủ máy chủ mới thấy CTA đăng ký Boost và gán gói cho server này. */
  isServerOwner?: boolean;
  onStickersChanged?: () => void;
  /** Mở modal đăng ký Boost (chỉ dùng trong Messages). */
  onOpenBoostSubscribe?: () => void;
};

export default function ServerStickerSection({
  serverId,
  token,
  canManage,
  isServerOwner = false,
  onStickersChanged,
  onOpenBoostSubscribe,
}: Props) {
  const { t } = useLanguage();
  const [data, setData] = useState<{
    max: number;
    count: number;
    stickers: serversApi.ServerStickerManageRow[];
    boostActive?: boolean;
    boostTier?: BoostTier;
    stickerBoostTierOnServer?: BoostTier | null;
    ownerStickerBoostSlotsUsed?: number;
    ownerStickerBoostSlotsMax?: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [assignBusy, setAssignBusy] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [userMaxUploadBytes, setUserMaxUploadBytes] = useState(DEFAULT_USER_UPLOAD_BYTES);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!token || !canManage) return;
    let c = false;
    void fetchBoostStatus({ token, serverId })
      .then((b) => {
        if (c) return;
        const n = Number(b?.limits?.maxUploadBytes);
        if (Number.isFinite(n) && n > 0) setUserMaxUploadBytes(n);
        else setUserMaxUploadBytes(DEFAULT_USER_UPLOAD_BYTES);
      })
      .catch(() => {
        if (!c) setUserMaxUploadBytes(DEFAULT_USER_UPLOAD_BYTES);
      });
    return () => {
      c = true;
    };
  }, [token, canManage, serverId]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const d = await serversApi.getServerStickersManage(serverId);
      setData({
        max: d.max,
        count: d.count,
        stickers: d.stickers,
        boostActive: d.boostActive ?? false,
        boostTier: d.boostTier ?? null,
        stickerBoostTierOnServer: d.stickerBoostTierOnServer ?? null,
        ownerStickerBoostSlotsUsed: d.ownerStickerBoostSlotsUsed,
        ownerStickerBoostSlotsMax: d.ownerStickerBoostSlotsMax,
      });
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : t("chat.serverSticker.loadError"));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [serverId, t]);

  useEffect(() => {
    if (!canManage) {
      setLoading(false);
      return;
    }
    void load();
  }, [canManage, load]);

  const handlePick = (files: FileList | null) => {
    if (!files?.length || !canManage) return;
    const file = files[0];
    if (file.size > userMaxUploadBytes) {
      setErr(
        t("chat.serverSticker.fileTooLarge").replace(
          "{n}",
          String(Math.round(userMaxUploadBytes / (1024 * 1024))),
        ),
      );
      return;
    }
    if (!isAllowedFile(file)) {
      setErr(t("chat.serverSticker.fileInvalid"));
      return;
    }
    setErr(null);
    setPendingFile(file);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleAssign = async (tier: "basic" | "boost" | null) => {
    if (!isServerOwner || assignBusy) return;
    setAssignBusy(true);
    setErr(null);
    try {
      await serversApi.setServerStickerBoostTier(serverId, { tier });
      await load();
      onStickersChanged?.();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : t("chat.serverSticker.assignError"));
    } finally {
      setAssignBusy(false);
    }
  };

  if (!canManage) return <p className={styles.denied}>{t("chat.serverSticker.denied")}</p>;
  if (loading && !data) return <div className={styles.loading}>{t("chat.serverSticker.loading")}</div>;

  const max = data?.max ?? FREE_BASE_SLOTS;
  const count = data?.count ?? 0;
  const remaining = Math.max(0, max - count);
  const stickers = data?.stickers ?? [];
  const boostActive = Boolean(data?.boostActive);
  const boostTier: BoostTier = data?.boostTier ?? null;
  const tierOnServer = data?.stickerBoostTierOnServer ?? null;
  const slotsUsed = data?.ownerStickerBoostSlotsUsed ?? 0;
  const slotsMax = data?.ownerStickerBoostSlotsMax ?? 2;

  const slots: (serversApi.ServerStickerManageRow | null)[] = [];
  for (let i = 0; i < max; i++) slots.push(stickers[i] ?? null);

  const gridCols = Math.min(Math.max(max, 1), 10);

  const TIERS = [
    { level: 1, boosts: 2, bonus: t("chat.serverSticker.tierBonus10") },
    { level: 2, boosts: 7, bonus: t("chat.serverSticker.tierBonus15") },
    { level: 3, boosts: 14, bonus: t("chat.serverSticker.tierBonus30") },
  ];

  const tierSubFor = (level: number, unlocked: boolean) => {
    if (unlocked) return t("chat.serverSticker.tierUnlockedNote");
    if (boostTier === "basic" && level >= 2) return t("chat.serverSticker.tierHintNeedFull");
    return t("chat.serverSticker.tierHintSubscribe");
  };

  return (
    <div className={styles.wrap}>
      <AddServerStickerModal
        isOpen={!!pendingFile}
        file={pendingFile}
        token={token}
        maxGifUploadBytes={userMaxUploadBytes}
        defaultServerId={serverId}
        onClose={() => setPendingFile(null)}
        onSuccess={async () => {
          await load();
          onStickersChanged?.();
        }}
      />

      {isServerOwner ? (
        !boostActive ? (
          <section className={styles.banner} aria-label={t("chat.serverSticker.bannerAriaLabel")}>
            <h2 className={styles.bannerTitle}>{t("chat.serverSticker.bannerTitle")}</h2>
            <p className={styles.bannerDesc}>
              {t("chat.serverSticker.bannerDesc").replace("{n}", String(FREE_BASE_SLOTS))}
            </p>
            <div className={styles.bannerActions}>
              <button
                type="button"
                className={`${styles.btnBannerPrimary} ${styles.btnBannerPrimaryActive}`}
                onClick={() => onOpenBoostSubscribe?.()}
              >
                {t("chat.serverSticker.btnSubscribeBoost")}
              </button>
            </div>
          </section>
        ) : boostTier === "basic" ? (
          <section className={styles.banner} aria-label={t("chat.serverSticker.bannerAriaLabel")}>
            <h2 className={styles.bannerTitle}>{t("chat.serverSticker.bannerActiveBasicTitle")}</h2>
            <p className={styles.bannerDesc}>{t("chat.serverSticker.bannerActiveBasicDesc")}</p>
            <div className={styles.bannerActions}>
              <button
                type="button"
                className={`${styles.btnBannerPrimary} ${styles.btnBannerPrimaryActive}`}
                onClick={() => onOpenBoostSubscribe?.()}
              >
                {t("chat.serverSticker.btnSubscribeBoost")}
              </button>
            </div>
          </section>
        ) : (
          <section className={styles.banner} aria-label={t("chat.serverSticker.bannerAriaLabel")}>
            <h2 className={styles.bannerTitle}>{t("chat.serverSticker.bannerActiveFullTitle")}</h2>
            <p className={styles.bannerDesc}>{t("chat.serverSticker.bannerActiveFullDesc")}</p>
          </section>
        )
      ) : !boostActive ? (
        <p className={styles.ownerNote}>{t("chat.serverSticker.nonOwnerNeedOwnerBoost")}</p>
      ) : null}

      {isServerOwner ? (
        <section className={styles.assignCard} aria-label={t("chat.serverSticker.ownerAssignAria")}>
          <h3 className={styles.assignTitle}>{t("chat.serverSticker.ownerAssignTitle")}</h3>
          <p className={styles.assignDesc}>{t("chat.serverSticker.ownerAssignDesc")}</p>
          <p className={styles.assignSlots}>
            {t("chat.serverSticker.ownerAssignSlots")
              .replace("{u}", String(slotsUsed))
              .replace("{m}", String(slotsMax))}
          </p>
          {tierOnServer ? (
            <p className={styles.assignCurrent}>
              {t("chat.serverSticker.ownerAssignCurrent").replace(
                "{tier}",
                tierOnServer === "boost"
                  ? t("chat.serverSticker.assignTierFull")
                  : t("chat.serverSticker.assignTierBasic"),
              )}
            </p>
          ) : null}
          <div className={styles.assignActions}>
            <button
              type="button"
              className={styles.assignBtn}
              disabled={assignBusy}
              onClick={() => void handleAssign("basic")}
            >
              {t("chat.serverSticker.assignBasicBtn")}
            </button>
            <button
              type="button"
              className={styles.assignBtn}
              disabled={assignBusy}
              onClick={() => void handleAssign("boost")}
            >
              {t("chat.serverSticker.assignFullBtn")}
            </button>
            <button
              type="button"
              className={styles.assignBtnSecondary}
              disabled={assignBusy || !tierOnServer}
              onClick={() => void handleAssign(null)}
            >
              {t("chat.serverSticker.assignClearBtn")}
            </button>
          </div>
        </section>
      ) : null}

      <div className={styles.timeline}>
        <div className={styles.tierRow}>
          <div className={styles.rail}>
            <div className={styles.railDot}>✓</div>
            <div className={styles.railLine} />
          </div>
          <div className={styles.tierCard}>
            <div className={styles.tierHead}>
              <div>
                <h3 className={styles.tierTitle}>{t("chat.serverSticker.freeTitle")}</h3>
                <p className={styles.tierSub}>
                  {t("chat.serverSticker.freeSub").replace("{n}", String(remaining)).replace("{total}", String(max))}
                </p>
              </div>
              <input
                ref={inputRef}
                type="file"
                className={styles.hiddenInput}
                accept={ACCEPT}
                aria-hidden
                tabIndex={-1}
                onChange={(e) => handlePick(e.target.files)}
              />
              <button type="button" className={styles.uploadBtn} disabled={remaining <= 0} onClick={() => inputRef.current?.click()}>
                {t("chat.serverSticker.uploadBtn")}
              </button>
            </div>
            <div className={styles.slotGrid} style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }}>
              {slots.map((st, i) => (
                <div key={st?.id ?? `empty-${i}`} className={`${styles.slot} ${st ? styles.slotFilled : ""}`} title={st?.name || undefined}>
                  {st ? (
                    <img src={st.imageUrl} alt={st.name || ""} className={`${styles.slotImg} ${st.animated ? styles.slotImgAnim : ""}`} loading="lazy" />
                  ) : (
                    <span className={styles.slotPh} aria-hidden>
                      ◆
                    </span>
                  )}
                </div>
              ))}
            </div>
            <p className={styles.notice}>
              {t("chat.serverSticker.notice")
                .replace("{max}", String(max))
                .replace(
                  "{gifMb}",
                  String(Math.round(userMaxUploadBytes / (1024 * 1024))),
                )}
            </p>
            {err ? <div className={styles.err}>{err}</div> : null}
          </div>
        </div>

        {TIERS.map((tier) => {
          const unlocked = tierUnlocked(tier.level, boostActive, boostTier);
          return (
            <div key={tier.level} className={styles.tierRow}>
              <div className={styles.rail}>
                <div className={`${styles.railDot} ${unlocked ? "" : styles.railDotLocked}`}>{unlocked ? "✓" : "◆"}</div>
                <div className={styles.railLine} />
              </div>
              <div className={`${styles.tierCard} ${unlocked ? styles.tierCardOpen : styles.tierCardLocked}`}>
                <div className={styles.tierHead}>
                  <div>
                    <h3 className={styles.tierTitle}>{t("chat.serverSticker.tierTitle").replace("{n}", String(tier.level))}</h3>
                    <p className={styles.tierSub}>{tierSubFor(tier.level, unlocked)}</p>
                  </div>
                  {unlocked ? (
                    <div className={styles.tierMetaUnlocked} aria-hidden>
                      ✓
                    </div>
                  ) : (
                    <div className={styles.tierMeta}>
                      <span>{t("chat.serverSticker.boosts").replace("{n}", String(tier.boosts))}</span>
                      <span aria-hidden>🔒</span>
                    </div>
                  )}
                </div>
                <div className={unlocked ? styles.unlockedBody : styles.lockedBody}>
                  <div className={unlocked ? styles.unlockedPh : styles.lockedPh}>◇</div>
                  <div>{tier.bonus}</div>
                  <button type="button" className={unlocked ? styles.btnIncluded : styles.btnFake} disabled>
                    {unlocked ? t("chat.serverSticker.includedBtn") : t("chat.serverSticker.buyBtn")}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
