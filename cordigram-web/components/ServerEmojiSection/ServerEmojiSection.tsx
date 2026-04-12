"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import styles from "./ServerEmojiSection.module.css";
import * as serversApi from "@/lib/servers-api";
import AddServerEmojiModal from "@/components/AddServerEmojiModal/AddServerEmojiModal";

const ACCEPT =
  "image/png,image/jpeg,image/jpg,image/gif,image/webp,image/x-png";

/** PNG/JPG/WebP/GIF — GIF có thể lớn hơn; giới hạn 2 MB */
const MAX_FILE_BYTES = 2 * 1024 * 1024;

function isAllowedFile(file: File): boolean {
  if (ACCEPT.split(",").some((t) => file.type === t.trim())) return true;
  return /\.(png|jpe?g|gif|webp)$/i.test(file.name);
}

type Props = {
  serverId: string;
  token: string;
  canManage: boolean;
  /** Gọi sau khi thêm emoji thành công (để chat refetch map :name: → ảnh). */
  onEmojisChanged?: () => void;
};

export default function ServerEmojiSection({
  serverId,
  token,
  canManage,
  onEmojisChanged,
}: Props) {
  const [data, setData] = useState<{
    max: number;
    count: number;
    emojis: serversApi.ServerEmojiManageRow[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const d = await serversApi.getServerEmojisManage(serverId);
      setData(d);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Lỗi tải emoji");
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

  const handleFiles = (files: FileList | null) => {
    if (!files?.length || !canManage) return;
    const file = files[0];
    if (file.size > MAX_FILE_BYTES) {
      setErr("File không được vượt quá 2 MB.");
      return;
    }
    if (!isAllowedFile(file)) {
      setErr("Chỉ hỗ trợ PNG, JPG, GIF hoặc WebP.");
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
        được emoji.
      </p>
    );
  }

  if (loading && !data) {
    return <div className={styles.loading}>Đang tải emoji…</div>;
  }

  const max = data?.max ?? 30;
  const count = data?.count ?? 0;
  const remaining = Math.max(0, max - count);
  const staticEmojis = data?.emojis.filter((e) => !e.animated) ?? [];
  const animatedEmojis = data?.emojis.filter((e) => e.animated) ?? [];

  const renderTable = (
    rows: serversApi.ServerEmojiManageRow[],
    emptyLabel: string,
    emptyStyle?: "ghost",
  ) => (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Hình ảnh</th>
            <th>Tên</th>
            <th>Tải lên bởi</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={3}
                className={`${styles.emptyCell} ${emptyStyle === "ghost" ? styles.emptyCellGhost : ""}`}
              >
                {emptyLabel}
              </td>
            </tr>
          ) : (
            rows.map((em) => (
              <tr key={em.id}>
                <td>
                  <img
                    src={em.imageUrl}
                    alt=""
                    className={`${styles.thumb} ${em.animated ? styles.thumbAnim : ""}`}
                    loading="lazy"
                  />
                </td>
                <td className={styles.nameCell}>
                  :{em.name || "emoji"}:
                </td>
                <td>
                  <div className={styles.uploader}>
                    {em.addedBy.avatarUrl ? (
                      <img
                        src={em.addedBy.avatarUrl}
                        alt=""
                        className={styles.uploaderAvatar}
                      />
                    ) : (
                      <div
                        className={styles.uploaderAvatar}
                        style={{
                          background: "#5865f2",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 11,
                          fontWeight: 700,
                          color: "#fff",
                        }}
                      >
                        {(em.addedBy.username || "?").slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <span className={styles.uploaderName}>
                      {em.addedBy.displayName || em.addedBy.username || "—"}
                    </span>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className={styles.wrap}>
      <AddServerEmojiModal
        isOpen={!!pendingFile}
        file={pendingFile}
        token={token}
        defaultServerId={serverId}
        onClose={() => setPendingFile(null)}
        onSuccess={async () => {
          await load();
          onEmojisChanged?.();
        }}
      />
      <h2 className={styles.title}>Emoji</h2>
      <p className={styles.desc}>
        Thành viên có thể dùng tối đa {max} emoji tùy chỉnh trên máy chủ này. Bạn
        có thể tải ảnh tĩnh (PNG, JPG, WebP) hoặc GIF động. Tên emoji mặc định
        lấy từ tên file (chỉ chữ, số và dấu gạch dưới).
      </p>

      <div className={styles.toolbar}>
        <input
          ref={inputRef}
          type="file"
          className={styles.hiddenInput}
          accept={ACCEPT}
          aria-hidden
          tabIndex={-1}
          onChange={(e) => handleFiles(e.target.files)}
        />
        <button
          type="button"
          className={styles.uploadBtn}
          disabled={remaining <= 0}
          onClick={() => inputRef.current?.click()}
        >
          Tải lên emoji
        </button>
        <span className={styles.meta}>
          Còn {remaining}/{max} chỗ
        </span>
      </div>

      <div
        className={`${styles.dropZone} ${dragOver ? styles.dropZoneActive : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(false);
          if (remaining <= 0) return;
          handleFiles(e.dataTransfer.files);
        }}
      >
        <p className={styles.hint}>
          Kéo thả file vào đây để tải lên nhanh (PNG, JPG, GIF, WebP — tối đa 2
          MB).
        </p>
      </div>

      {err ? <div className={styles.err}>{err}</div> : null}

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Emoji</h3>
        <p className={styles.sectionSub}>
          {remaining} chỗ trống sẵn có (tối đa {max} emoji tùy chỉnh, tĩnh + GIF)
        </p>
        {renderTable(staticEmojis, "Chưa có emoji tĩnh")}
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Emoji hoạt hình</h3>
        <p className={styles.sectionSub}>
          {animatedEmojis.length} GIF · còn {remaining} chỗ trong tổng {max}
        </p>
        {renderTable(animatedEmojis, "KHÔNG", "ghost")}
      </section>
    </div>
  );
}
