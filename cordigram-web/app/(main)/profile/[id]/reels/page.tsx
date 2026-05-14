"use client";

import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../../profile.module.css";
import type { FeedItem } from "@/lib/api";
import { pinReel, unpinReel, bulkDeleteReels } from "@/lib/api";
import { getStoredAccessToken } from "@/lib/auth";
import { useProfileContext } from "../profile-context";
import { useLanguage } from "@/component/language-provider";

const MAX_PINS = 3;

const formatCount = (value?: number) => {
  const n = value ?? 0;
  if (n >= 1_000_000)
    return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return `${n}`;
};

const sortItems = (items: FeedItem[]): FeedItem[] =>
  [...items].sort((a, b) => {
    const pa = a.pinnedAt ? new Date(a.pinnedAt).getTime() : 0;
    const pb = b.pinnedAt ? new Date(b.pinnedAt).getTime() : 0;
    if (pb !== pa) return pb - pa;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

const IconView = () => (
  <svg
    aria-hidden
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M1.5 12s4-7.5 10.5-7.5S22.5 12 22.5 12 18.5 19.5 12 19.5 1.5 12 1.5 12Z" />
    <circle cx="12" cy="12" r="3.2" fill="currentColor" />
  </svg>
);

export default function ProfileReelsPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const { profile, viewerId, tabs, prefetchTab, setTabBarAction } = useProfileContext();
  const ownerUserId = profile.userId || profile.id;
  const tab = tabs?.reels;

  const isOwner = Boolean(viewerId && profile.userId && viewerId === profile.userId);

  useEffect(() => {
    prefetchTab?.("reels");
  }, [prefetchTab]);

  const error = tab?.error ?? "";
  const rawItems = tab?.items ?? [];
  const showSkeleton = !!(
    tab &&
    (tab.loading || (!tab.loaded && !tab.error)) &&
    rawItems.length === 0
  );
  const showEmpty = !!(
    tab &&
    tab.loaded &&
    !tab.loading &&
    !error &&
    rawItems.length === 0
  );
  const suppressGrid = Boolean(error) && rawItems.length === 0 && !showSkeleton;

  // ── Manage state ──────────────────────────────────────────
  const [manageMode, setManageMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [localItems, setLocalItems] = useState<FeedItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [pinError, setPinError] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (rawItems.length > 0) {
      setLocalItems(sortItems(rawItems));
    }
  }, [rawItems]);

  const pinnedIds = useMemo(
    () => new Set(localItems.filter((i) => !!i.pinnedAt).map((i) => i.id)),
    [localItems],
  );

  const openManage = useCallback(() => {
    setManageMode(true);
    setSelectedIds(new Set());
    setPinError("");
  }, []);

  const closeManage = useCallback(() => {
    setManageMode(false);
    setSelectedIds(new Set());
    setPinError("");
    setShowDeleteConfirm(false);
  }, []);

  // Register Manage button into the tab nav row slot
  useEffect(() => {
    if (!isOwner || manageMode || suppressGrid || showSkeleton || showEmpty) {
      setTabBarAction?.(null);
      return () => setTabBarAction?.(null);
    }
    setTabBarAction?.(
      <button
        type="button"
        className={styles.navManageBtn}
        onClick={openManage}
        title={t("profilePage.manage.openBtn")}
        aria-label={t("profilePage.manage.openBtn")}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      </button>,
    );
    return () => setTabBarAction?.(null);
  }, [isOwner, manageMode, suppressGrid, showSkeleton, showEmpty, openManage, setTabBarAction, t]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setPinError("");
  };

  const handlePin = useCallback(async () => {
    if (!selectedIds.size) return;
    const token = getStoredAccessToken();
    if (!token) return;
    setPinError("");

    const selectedArr = Array.from(selectedIds);
    const alreadyPinned = selectedArr.filter((id) => pinnedIds.has(id));
    const toPin = selectedArr.filter((id) => !pinnedIds.has(id));

    const currentPinnedNotSelected = localItems.filter(
      (i) => !!i.pinnedAt && !selectedIds.has(i.id),
    ).length;

    if (toPin.length > 0 && currentPinnedNotSelected + toPin.length > MAX_PINS) {
      setPinError(
        t("profilePage.manage.pinReelLimitError", {
          max: String(MAX_PINS),
          current: String(currentPinnedNotSelected),
          remaining: String(MAX_PINS - currentPinnedNotSelected),
        }),
      );
      return;
    }

    setBusy(true);
    try {
      const now = new Date().toISOString();
      await Promise.all(alreadyPinned.map((id) => unpinReel({ token, reelId: id })));
      await Promise.all(toPin.map((id) => pinReel({ token, reelId: id })));

      setLocalItems((prev) =>
        sortItems(
          prev.map((item) => {
            if (!selectedIds.has(item.id)) return item;
            if (alreadyPinned.includes(item.id)) return { ...item, pinnedAt: null };
            return { ...item, pinnedAt: now };
          }),
        ),
      );
      setSelectedIds(new Set());
    } catch (e: unknown) {
      const msg =
        e instanceof Error ? e.message : t("profilePage.manage.pinFailed");
      setPinError(msg);
    } finally {
      setBusy(false);
    }
  }, [selectedIds, pinnedIds, localItems, t]);

  const handleDelete = useCallback(async () => {
    if (!selectedIds.size) return;
    const token = getStoredAccessToken();
    if (!token) return;
    setBusy(true);
    setShowDeleteConfirm(false);
    try {
      await bulkDeleteReels({ token, ids: Array.from(selectedIds) });
      setLocalItems((prev) => prev.filter((item) => !selectedIds.has(item.id)));
      setSelectedIds(new Set());
    } catch {
      // keep items if request failed
    } finally {
      setBusy(false);
    }
  }, [selectedIds]);

  const selectedPinnedCount = Array.from(selectedIds).filter((id) =>
    pinnedIds.has(id),
  ).length;
  const selectedUnpinnedCount = selectedIds.size - selectedPinnedCount;

  const pinLabel =
    selectedPinnedCount > 0 && selectedUnpinnedCount === 0
      ? t("profilePage.manage.unpin")
      : selectedPinnedCount > 0
        ? t("profilePage.manage.pinOrUnpin")
        : t("profilePage.manage.pin");

  const displayItems = manageMode
    ? localItems
    : localItems.length
      ? localItems
      : rawItems.length
        ? sortItems(rawItems)
        : [];

  return (
    <>
      {error ? <div className={styles.errorBox}>{error}</div> : null}

      {/* Manage toolbar */}
      {manageMode && (
        <div className={styles.manageBar}>
          <div className={styles.manageBarLeft}>
            <button
              type="button"
              className={`${styles.manageBtnGhost} ${styles.manageBtnPin}`}
              onClick={handlePin}
              disabled={busy || selectedIds.size === 0}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden>
                <path d="M16 2a1 1 0 0 1 .707 1.707L15.414 5l3.293 3.293a1 1 0 0 1-1.414 1.414L16 8.414l-2.586 2.586.707.707a1 1 0 0 1-1.414 1.414L12 12.414l-3.293 3.293V19a1 1 0 0 1-1.707.707l-4-4A1 1 0 0 1 4 14h3.293L10.586 10.707l-.707-.707a1 1 0 0 1 1.414-1.414l.707.707L14.586 6.7 13.293 5.41a1 1 0 0 1 1.414-1.414L16 5.293 17.293 4A1 1 0 0 1 16 2z" />
              </svg>
              {pinLabel} ({pinnedIds.size}/{MAX_PINS})
            </button>
            <button
              type="button"
              className={`${styles.manageBtnGhost} ${styles.manageBtnDanger}`}
              onClick={() => setShowDeleteConfirm(true)}
              disabled={busy || selectedIds.size === 0}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6M14 11v6" />
                <path d="M9 6V4h6v2" />
              </svg>
              {t("profilePage.manage.deleteBtn", { count: String(selectedIds.size) })}
            </button>
            {pinError && (
              <span style={{ fontSize: 12, color: "#f87171", fontWeight: 600, maxWidth: 260 }}>
                {pinError}
              </span>
            )}
          </div>
          <div className={styles.manageBarRight}>
            <span className={styles.manageCount}>
              {t("profilePage.manage.selectedCount", {
                count: String(selectedIds.size),
                total: String(localItems.length),
              })}
            </span>
            <button
              type="button"
              className={styles.manageBtnGhost}
              onClick={closeManage}
              disabled={busy}
            >
              {t("profilePage.manage.cancel")}
            </button>
          </div>
        </div>
      )}

      {suppressGrid ? null : showEmpty && !manageMode ? (
        <div className={styles.errorBox}>{t("profilePage.manage.noReelsYet")}</div>
      ) : (
        <ReelGrid
          items={displayItems}
          loading={showSkeleton}
          manageMode={manageMode}
          selectedIds={selectedIds}
          pinnedIds={pinnedIds}
          pinnedBadgeLabel={t("profilePage.manage.pinnedBadge")}
          onSelect={(item) => {
            if (manageMode) {
              toggleSelect(item.id);
              return;
            }
            const kind = (item as any)?.repostKind || item.kind;
            const isReel = kind === "reel" || item.media?.[0]?.type === "video";
            if (!isReel) {
              router.push(`/post/${item.id}`);
              return;
            }
            const query = new URLSearchParams();
            query.set("fromProfile", "1");
            if (ownerUserId) query.set("profileId", ownerUserId);
            router.push(`/reels/${item.id}?${query.toString()}`);
          }}
        />
      )}

      {/* Delete confirmation overlay */}
      {showDeleteConfirm && (
        <div
          className={`${styles.modalOverlay} ${styles.modalOverlayOpen}`}
          onClick={() => setShowDeleteConfirm(false)}
        >
          <div
            className={`${styles.modalCard} ${styles.modalCardOpen}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <div>
                <h2 className={styles.modalTitle}>
                  {t("profilePage.manage.deleteReelTitle")}
                </h2>
                <p className={styles.modalBody}>
                  {t("profilePage.manage.deleteReelBody", {
                    count: String(selectedIds.size),
                  })}
                </p>
              </div>
            </div>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.modalSecondary}
                onClick={() => setShowDeleteConfirm(false)}
                disabled={busy}
              >
                {t("profilePage.manage.cancel")}
              </button>
              <button
                type="button"
                className={`${styles.modalPrimary} ${styles.modalDanger}`}
                onClick={handleDelete}
                disabled={busy}
              >
                {busy
                  ? t("profilePage.manage.deleting")
                  : t("profilePage.manage.deleteBtn", { count: String(selectedIds.size) })}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ReelGrid({
  items,
  loading,
  manageMode,
  selectedIds,
  pinnedIds,
  pinnedBadgeLabel,
  onSelect,
}: {
  items: FeedItem[];
  loading: boolean;
  manageMode: boolean;
  selectedIds: Set<string>;
  pinnedIds: Set<string>;
  pinnedBadgeLabel: string;
  onSelect: (item: FeedItem) => void;
}) {
  const handleEnter = (e: React.MouseEvent<HTMLVideoElement>) => {
    const el = e.currentTarget;
    el.currentTime = 0;
    void el.play().catch(() => undefined);
  };

  const handleLeave = (e: React.MouseEvent<HTMLVideoElement>) => {
    const el = e.currentTarget;
    el.pause();
    el.currentTime = 0;
  };

  if (loading) {
    return (
      <div className={styles.grid}>
        {Array.from({ length: 9 }).map((_, idx) => (
          <div key={idx} className={`${styles.tile} ${styles.skeleton}`} />
        ))}
      </div>
    );
  }

  if (!items.length) {
    return null;
  }

  return (
    <div className={styles.grid}>
      {items.map((item) => {
        const media = item.media?.[0];
        if (!media) return null;
        const isPinned = pinnedIds.has(item.id);
        const isSelected = selectedIds.has(item.id);
        return (
          <button
            key={item.id}
            type="button"
            className={`${styles.tile} ${isSelected ? styles.tileSelected : ""}`}
            onClick={() => onSelect(item)}
          >
            <video
              className={styles.tileMedia}
              src={media.url}
              muted
              playsInline
              preload="metadata"
              onMouseEnter={!manageMode ? handleEnter : undefined}
              onMouseLeave={!manageMode ? handleLeave : undefined}
            />
            {isPinned && (
              <div className={styles.pinnedBadge}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M16 2a1 1 0 0 1 .707 1.707L15.414 5l3.293 3.293a1 1 0 0 1-1.414 1.414L16 8.414l-2.586 2.586.707.707a1 1 0 0 1-1.414 1.414L12 12.414l-3.293 3.293V19a1 1 0 0 1-1.707.707l-4-4A1 1 0 0 1 4 14h3.293L10.586 10.707l-.707-.707a1 1 0 0 1 1.414-1.414l.707.707L14.586 6.7 13.293 5.41a1 1 0 0 1 1.414-1.414L16 5.293 17.293 4A1 1 0 0 1 16 2z" />
                </svg>
                {pinnedBadgeLabel}
              </div>
            )}
            {!manageMode && (
              <div className={styles.viewBadge}>
                <IconView />
                {formatCount(item.stats?.views)}
              </div>
            )}
            {manageMode && (
              <>
                <div className={styles.tileManageOverlay} />
                <div className={styles.tileCheckWrap}>
                  <svg
                    aria-hidden
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={styles.tileCheckMark}
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}
