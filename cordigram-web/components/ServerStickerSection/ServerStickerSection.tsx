"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import styles from "./ServerStickerSection.module.css";
import * as serversApi from "@/lib/servers-api";
import AddServerStickerModal from "@/components/AddServerStickerModal/AddServerStickerModal";
import { useLanguage } from "@/component/language-provider";

const ACCEPT = "image/png,image/jpeg,image/jpg,image/gif,image/webp,image/x-png";
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const FREE_SLOTS = 5;

function isAllowedFile(file: File): boolean {
  if (ACCEPT.split(",").some((t) => file.type === t.trim())) return true;
  return /\.(png|jpe?g|gif|webp)$/i.test(file.name);
}

type Props = {
  serverId: string;
  token: string;
  canManage: boolean;
  onStickersChanged?: () => void;
};

export default function ServerStickerSection({ serverId, token, canManage, onStickersChanged }: Props) {
  const { t } = useLanguage();
  const [data, setData] = useState<{ max: number; count: number; stickers: serversApi.ServerStickerManageRow[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const d = await serversApi.getServerStickersManage(serverId);
      setData(d);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : t("chat.serverSticker.loadError"));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [serverId, t]);

  useEffect(() => {
    if (!canManage) { setLoading(false); return; }
    void load();
  }, [canManage, load]);

  const handlePick = (files: FileList | null) => {
    if (!files?.length || !canManage) return;
    const file = files[0];
    if (file.size > MAX_FILE_BYTES) { setErr(t("chat.serverSticker.fileTooLarge")); return; }
    if (!isAllowedFile(file)) { setErr(t("chat.serverSticker.fileInvalid")); return; }
    setErr(null);
    setPendingFile(file);
    if (inputRef.current) inputRef.current.value = "";
  };

  if (!canManage) return <p className={styles.denied}>{t("chat.serverSticker.denied")}</p>;
  if (loading && !data) return <div className={styles.loading}>{t("chat.serverSticker.loading")}</div>;

  const max = data?.max ?? FREE_SLOTS;
  const count = data?.count ?? 0;
  const remaining = Math.max(0, max - count);
  const stickers = data?.stickers ?? [];
  const slots: (serversApi.ServerStickerManageRow | null)[] = [];
  for (let i = 0; i < FREE_SLOTS; i++) slots.push(stickers[i] ?? null);

  const TIERS = [
    { level: 1, boosts: 2, bonus: t("chat.serverSticker.tierBonus10") },
    { level: 2, boosts: 7, bonus: t("chat.serverSticker.tierBonus15") },
    { level: 3, boosts: 14, bonus: t("chat.serverSticker.tierBonus30") },
  ];

  return (
    <div className={styles.wrap}>
      <AddServerStickerModal
        isOpen={!!pendingFile}
        file={pendingFile}
        token={token}
        defaultServerId={serverId}
        onClose={() => setPendingFile(null)}
        onSuccess={async () => { await load(); onStickersChanged?.(); }}
      />

      <section className={styles.banner} aria-label={t("chat.serverSticker.bannerAriaLabel")}>
        <h2 className={styles.bannerTitle}>{t("chat.serverSticker.bannerTitle")}</h2>
        <p className={styles.bannerDesc}>
          {t("chat.serverSticker.bannerDesc").replace("{n}", String(FREE_SLOTS))}
        </p>
        <div className={styles.bannerActions}>
          <button type="button" className={styles.btnBannerPrimary} disabled>{t("chat.serverSticker.btnUpgrade")}</button>
          <button type="button" className={styles.btnBannerGhost} disabled>{t("chat.serverSticker.btnLearnMore")}</button>
        </div>
      </section>

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
                <p className={styles.tierSub}>{t("chat.serverSticker.freeSub").replace("{n}", String(remaining)).replace("{total}", String(FREE_SLOTS))}</p>
              </div>
              <input ref={inputRef} type="file" className={styles.hiddenInput} accept={ACCEPT} aria-hidden tabIndex={-1} onChange={(e) => handlePick(e.target.files)} />
              <button type="button" className={styles.uploadBtn} disabled={remaining <= 0} onClick={() => inputRef.current?.click()}>
                {t("chat.serverSticker.uploadBtn")}
              </button>
            </div>
            <div className={styles.slotGrid}>
              {slots.map((st, i) => (
                <div key={st?.id ?? `empty-${i}`} className={`${styles.slot} ${st ? styles.slotFilled : ""}`} title={st?.name || undefined}>
                  {st ? (
                    <img src={st.imageUrl} alt={st.name || ""} className={`${styles.slotImg} ${st.animated ? styles.slotImgAnim : ""}`} loading="lazy" />
                  ) : (
                    <span className={styles.slotPh} aria-hidden>◆</span>
                  )}
                </div>
              ))}
            </div>
            <p className={styles.notice}>{t("chat.serverSticker.notice").replace("{max}", String(max))}</p>
            {err ? <div className={styles.err}>{err}</div> : null}
          </div>
        </div>

        {TIERS.map((tier) => (
          <div key={tier.level} className={styles.tierRow}>
            <div className={styles.rail}>
              <div className={`${styles.railDot} ${styles.railDotLocked}`}>◆</div>
              <div className={styles.railLine} />
            </div>
            <div className={`${styles.tierCard} ${styles.tierCardLocked}`}>
              <div className={styles.tierHead}>
                <div>
                  <h3 className={styles.tierTitle}>{t("chat.serverSticker.tierTitle").replace("{n}", String(tier.level))}</h3>
                  <p className={styles.tierSub}>{t("chat.serverSticker.tierNote")}</p>
                </div>
                <div className={styles.tierMeta}>
                  <span>{t("chat.serverSticker.boosts").replace("{n}", String(tier.boosts))}</span>
                  <span aria-hidden>🔒</span>
                </div>
              </div>
              <div className={styles.lockedBody}>
                <div className={styles.lockedPh}>◇</div>
                <div>{tier.bonus}</div>
                <button type="button" className={styles.btnFake} disabled>{t("chat.serverSticker.buyBtn")}</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
