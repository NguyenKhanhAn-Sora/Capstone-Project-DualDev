"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import styles from "./ServerStickerSection.module.css";
import * as serversApi from "@/lib/servers-api";
import AddServerStickerModal from "@/components/AddServerStickerModal/AddServerStickerModal";

const ACCEPT =
  "image/png,image/jpeg,image/jpg,image/gif,image/webp,image/x-png";

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

export default function ServerStickerSection({
  serverId,
  token,
  canManage,
  onStickersChanged,
}: Props) {
  const [data, setData] = useState<{
    max: number;
    count: number;
    stickers: serversApi.ServerStickerManageRow[];
  } | null>(null);
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
      setErr(e instanceof Error ? e.message : "Lỗi tải sticker");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [serverId]);

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
    if (file.size > MAX_FILE_BYTES) {
      setErr("File không được vượt quá 2 MB.");
      return;
    }
    if (!isAllowedFile(file)) {
      setErr("Chỉ hỗ trợ PNG, JPG hoặc WebP.");
      return;
    }
    setErr(null);
    setPendingFile(file);
    if (inputRef.current) inputRef.current.value = "";
  };

  if (!canManage) {
    return (
      <p className={styles.denied}>
        Chỉ chủ máy chủ hoặc thành viên có quyền quản lý máy chủ mới chỉnh sửa
        được sticker.
      </p>
    );
  }

  if (loading && !data) {
    return <div className={styles.loading}>Đang tải sticker…</div>;
  }

  const max = data?.max ?? FREE_SLOTS;
  const count = data?.count ?? 0;
  const remaining = Math.max(0, max - count);
  const stickers = data?.stickers ?? [];
  const slots: (serversApi.ServerStickerManageRow | null)[] = [];
  for (let i = 0; i < FREE_SLOTS; i++) {
    slots.push(stickers[i] ?? null);
  }

  return (
    <div className={styles.wrap}>
      <AddServerStickerModal
        isOpen={!!pendingFile}
        file={pendingFile}
        token={token}
        defaultServerId={serverId}
        onClose={() => setPendingFile(null)}
        onSuccess={async () => {
          await load();
          onStickersChanged?.();
        }}
      />

      <section className={styles.banner} aria-label="Nâng cấp máy chủ">
        <h2 className={styles.bannerTitle}>Nhận Nâng Cấp</h2>
        <p className={styles.bannerDesc}>
          Nâng cấp máy chủ lên Cấp 1 trở lên sẽ mở thêm ô sticker và các đặc
          quyền khác. Hiện tại máy chủ chỉ dùng{" "}
          <strong>{FREE_SLOTS} ô sticker miễn phí</strong> — phần nâng cấp sẽ
          được bổ sung sau.
        </p>
        <div className={styles.bannerActions}>
          <button type="button" className={styles.btnBannerPrimary} disabled>
            Nâng Cấp Máy Chủ
          </button>
          <button type="button" className={styles.btnBannerGhost} disabled>
            Tìm hiểu thêm
          </button>
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
                <h3 className={styles.tierTitle}>Ô miễn phí</h3>
                <p className={styles.tierSub}>
                  {remaining} trong số {FREE_SLOTS} ô sẵn có
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
              <button
                type="button"
                className={styles.uploadBtn}
                disabled={remaining <= 0}
                onClick={() => inputRef.current?.click()}
              >
                Tải Lên Sticker
              </button>
            </div>
            <div className={styles.slotGrid}>
              {slots.map((st, i) => (
                <div
                  key={st?.id ?? `empty-${i}`}
                  className={`${styles.slot} ${st ? styles.slotFilled : ""}`}
                  title={st?.name || undefined}
                >
                  {st ? (
                    <img
                      src={st.imageUrl}
                      alt={st.name || ""}
                      className={`${styles.slotImg} ${st.animated ? styles.slotImgAnim : ""}`}
                      loading="lazy"
                    />
                  ) : (
                    <span className={styles.slotPh} aria-hidden>
                      ◆
                    </span>
                  )}
                </div>
              ))}
            </div>
            <p className={styles.notice}>
              Ảnh tĩnh (PNG/JPG/WebP): cắt vuông, nén ~500 KB rồi tải lên Cloudinary
              (URL lưu DB). Sticker GIF: tải nguyên file tối đa 2 MB lên Cloudinary.
              Giới hạn hiện tại: <strong>{max} sticker</strong> trên máy chủ.
            </p>
            {err ? <div className={styles.err}>{err}</div> : null}
          </div>
        </div>

        {[
          {
            level: 1,
            boosts: 2,
            bonus: "+10 Ô Sticker",
            note: "Cần nâng cấp máy chủ (sắp có)",
          },
          {
            level: 2,
            boosts: 7,
            bonus: "+15 Ô Sticker (tổng cộng là 30)",
            note: "Cần nâng cấp máy chủ (sắp có)",
          },
          {
            level: 3,
            boosts: 14,
            bonus: "+30 Ô Sticker (tổng cộng là 60)",
            note: "Cần nâng cấp máy chủ (sắp có)",
          },
        ].map((tier) => (
          <div key={tier.level} className={styles.tierRow}>
            <div className={styles.rail}>
              <div className={`${styles.railDot} ${styles.railDotLocked}`}>
                ◆
              </div>
              <div className={styles.railLine} />
            </div>
            <div className={`${styles.tierCard} ${styles.tierCardLocked}`}>
              <div className={styles.tierHead}>
                <div>
                  <h3 className={styles.tierTitle}>Cấp {tier.level}</h3>
                  <p className={styles.tierSub}>{tier.note}</p>
                </div>
                <div className={styles.tierMeta}>
                  <span>{tier.boosts} Nâng Cấp</span>
                  <span aria-hidden>🔒</span>
                </div>
              </div>
              <div className={styles.lockedBody}>
                <div className={styles.lockedPh}>◇</div>
                <div>{tier.bonus}</div>
                <button type="button" className={styles.btnFake} disabled>
                  Mua Cấp Độ
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
