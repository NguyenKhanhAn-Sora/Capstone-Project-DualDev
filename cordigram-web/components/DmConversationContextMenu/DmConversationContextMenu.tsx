"use client";

import React, { useEffect, useLayoutEffect, useRef, useState, useCallback } from "react";
import { useLanguage } from "@/component/language-provider";
import {
  DM_CATEGORY_COLORS,
  DM_CONVERSATION_CATEGORIES,
  type DmConversationCategory,
  type DmConversationPreferences,
  computeMutePatch,
  isDmConversationMuted,
} from "@/lib/dm-conversation-prefs";
import styles from "./DmConversationContextMenu.module.css";

export interface DmConversationContextMenuProps {
  x: number;
  y: number;
  peerName: string;
  preferences: DmConversationPreferences;
  isFollowing: boolean;
  isBlockedByMe: boolean;
  onClose: () => void;
  onMute: (
    patch: Pick<DmConversationPreferences, "mutedUntil" | "mutedForever">,
  ) => void;
  onCategory: (category: DmConversationCategory | null) => void;
  onUnfollow: () => void;
  onBlock: () => void;
  onUnblock: () => void;
  /** Mobile-only: show phone call action in bottom sheet */
  onPhoneCall?: () => void;
  /** Mobile-only: show video call action in bottom sheet */
  onVideoCall?: () => void;
  /** Mobile-only: show message search action in bottom sheet */
  onSearch?: () => void;
  /** Mobile-only: show conversation details panel (search/pinned/media) */
  onConversationDetails?: () => void;
  /** Mobile-only: show DM user profile sidebar */
  onViewProfile?: () => void;
}

export default function DmConversationContextMenu({
  x,
  y,
  peerName,
  preferences,
  isFollowing,
  isBlockedByMe,
  onClose,
  onMute,
  onCategory,
  onUnfollow,
  onBlock,
  onUnblock,
  onPhoneCall,
  onVideoCall,
  onSearch,
  onConversationDetails,
  onViewProfile,
}: DmConversationContextMenuProps) {
  const { t } = useLanguage();
  const menuRef = useRef<HTMLDivElement>(null);
  const submenuCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [openSubmenu, setOpenSubmenu] = useState<"mute" | "category" | null>(null);
  const [menuPos, setMenuPos] = useState({ left: x, top: y });
  const [isMobile, setIsMobile] = useState(false);
  const [mobileView, setMobileView] = useState<"main" | "category" | "mute">("main");

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 767);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useLayoutEffect(() => {
    if (isMobile || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const pad = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = x;
    let top = y;
    if (left + rect.width > vw - pad) {
      left = Math.max(pad, vw - pad - rect.width);
    }
    const spaceBelow = vh - y - pad;
    const spaceAbove = y - pad;
    if (rect.height > spaceBelow && spaceAbove > spaceBelow) {
      top = Math.max(pad, y - rect.height);
    } else if (top + rect.height > vh - pad) {
      top = Math.max(pad, vh - pad - rect.height);
    }
    setMenuPos({ left, top });
  }, [x, y, isFollowing, isBlockedByMe, preferences, isMobile]);

  const showSubmenu = useCallback((key: "mute" | "category") => {
    if (submenuCloseTimerRef.current) {
      clearTimeout(submenuCloseTimerRef.current);
      submenuCloseTimerRef.current = null;
    }
    setOpenSubmenu(key);
  }, []);

  const scheduleHideSubmenu = useCallback(() => {
    if (submenuCloseTimerRef.current) {
      clearTimeout(submenuCloseTimerRef.current);
    }
    submenuCloseTimerRef.current = setTimeout(() => {
      setOpenSubmenu(null);
      submenuCloseTimerRef.current = null;
    }, 160);
  }, []);

  useEffect(
    () => () => {
      if (submenuCloseTimerRef.current) {
        clearTimeout(submenuCloseTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!isMobile && menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose, isMobile]);

  const muted = isDmConversationMuted(preferences);
  const categoryLabel = (key: DmConversationCategory) =>
    t(`chat.dmConversation.categories.${key}`);

  /* ── MOBILE: Bottom sheet ── */
  if (isMobile) {
    return (
      <>
        <div className={styles.mobileBackdrop} onClick={onClose} aria-hidden />
        <div className={styles.bottomSheet} ref={menuRef} role="dialog">
          <div className={styles.bottomSheetHandle} />

          {/* Main view */}
          {mobileView === "main" && (
            <>
              {/* Quick action icons: phone / video / search / profile / details */}
              {(onPhoneCall || onVideoCall || onSearch || onViewProfile || onConversationDetails) && (
                <>
                  <div className={styles.bottomSheetActions}>
                    {onPhoneCall && (
                      <button
                        type="button"
                        className={styles.bottomSheetActionBtn}
                        onClick={() => { onPhoneCall(); onClose(); }}
                      >
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                        </svg>
                        <span>{t("chat.composer.voiceCall")}</span>
                      </button>
                    )}
                    {onVideoCall && (
                      <button
                        type="button"
                        className={styles.bottomSheetActionBtn}
                        onClick={() => { onVideoCall(); onClose(); }}
                      >
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polygon points="23 7 16 12 23 17 23 7" />
                          <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                        </svg>
                        <span>{t("chat.composer.videoCall")}</span>
                      </button>
                    )}
                    {onSearch && (
                      <button
                        type="button"
                        className={styles.bottomSheetActionBtn}
                        onClick={() => { onSearch(); onClose(); }}
                      >
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="11" cy="11" r="8" />
                          <line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                        <span>{t("chat.popups.messageSearch.title")}</span>
                      </button>
                    )}
                    {onViewProfile && (
                      <button
                        type="button"
                        className={styles.bottomSheetActionBtn}
                        onClick={() => { onViewProfile(); onClose(); }}
                      >
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="8" r="4" />
                          <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                        </svg>
                        <span>{t("chat.profile.title")}</span>
                      </button>
                    )}
                    {onConversationDetails && (
                      <button
                        type="button"
                        className={styles.bottomSheetActionBtn}
                        onClick={() => { onConversationDetails(); onClose(); }}
                      >
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="3" width="18" height="18" rx="3" />
                          <line x1="9" y1="9" x2="15" y2="9" />
                          <line x1="9" y1="13" x2="15" y2="13" />
                          <line x1="9" y1="17" x2="12" y2="17" />
                        </svg>
                        <span>{t("chat.conversationDetails.title")}</span>
                      </button>
                    )}
                  </div>
                  <div className={styles.bottomSheetDivider} />
                </>
              )}

              {/* Phân loại */}
              <button
                type="button"
                className={styles.bottomSheetItem}
                onClick={() => setMobileView("category")}
              >
                <span>{t("chat.dmConversation.categorize")}</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>

              {/* Tắt / Bật thông báo */}
              <button
                type="button"
                className={styles.bottomSheetItem}
                onClick={() => setMobileView("mute")}
              >
                <span>
                  {muted
                    ? t("chat.dmConversation.unmuteNotifications")
                    : t("chat.dmConversation.muteNotifications")}
                </span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>

              {isFollowing && (
                <>
                  <div className={styles.bottomSheetDivider} />
                  <button
                    type="button"
                    className={styles.bottomSheetItem}
                    onClick={() => { onUnfollow(); onClose(); }}
                  >
                    <span>{t("chat.dmConversation.unfollow")}</span>
                  </button>
                </>
              )}

              <div className={styles.bottomSheetDivider} />
              <button
                type="button"
                className={`${styles.bottomSheetItem} ${styles.bottomSheetItemDanger}`}
                onClick={() => { if (isBlockedByMe) onUnblock(); else onBlock(); onClose(); }}
              >
                <span>{isBlockedByMe ? t("chat.dmConversation.unblock") : t("chat.dmConversation.block")}</span>
              </button>

              <div className={styles.bottomSheetDivider} />
              <button
                type="button"
                className={`${styles.bottomSheetItem} ${styles.bottomSheetCancel}`}
                onClick={onClose}
              >
                Hủy
              </button>
            </>
          )}

          {/* Category sub-view */}
          {mobileView === "category" && (
            <>
              <div className={styles.bottomSheetSubHeader}>
                <button
                  type="button"
                  className={styles.bottomSheetBackBtn}
                  onClick={() => setMobileView("main")}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                </button>
                <span className={styles.bottomSheetSubTitle}>{t("chat.dmConversation.categorize")}</span>
              </div>
              {preferences.category && (
                <>
                  <button
                    type="button"
                    className={styles.bottomSheetItem}
                    onClick={() => { onCategory(null); onClose(); }}
                  >
                    <span>{t("chat.dmConversation.clearCategory")}</span>
                  </button>
                  <div className={styles.bottomSheetDivider} />
                </>
              )}
              {DM_CONVERSATION_CATEGORIES.map((key) => (
                <button
                  key={key}
                  type="button"
                  className={`${styles.bottomSheetItem} ${styles.bottomSheetCategoryRow}`}
                  onClick={() => { onCategory(key); onClose(); }}
                >
                  <span className={styles.categoryRowInner}>
                    <span
                      className={styles.categoryDot}
                      style={{ background: DM_CATEGORY_COLORS[key] }}
                    />
                    {categoryLabel(key)}
                  </span>
                  {preferences.category === key && (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
              ))}
            </>
          )}

          {/* Mute sub-view */}
          {mobileView === "mute" && (
            <>
              <div className={styles.bottomSheetSubHeader}>
                <button
                  type="button"
                  className={styles.bottomSheetBackBtn}
                  onClick={() => setMobileView("main")}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                </button>
                <span className={styles.bottomSheetSubTitle}>
                  {muted
                    ? t("chat.dmConversation.unmuteNotifications")
                    : t("chat.dmConversation.muteNotifications")}
                </span>
              </div>
              {muted && (
                <>
                  <button
                    type="button"
                    className={styles.bottomSheetItem}
                    onClick={() => { onMute(computeMutePatch("off")); onClose(); }}
                  >
                    <span>{t("chat.dmConversation.unmuteNotifications")}</span>
                  </button>
                  <div className={styles.bottomSheetDivider} />
                </>
              )}
              {!muted && (
                <>
                  <button
                    type="button"
                    className={styles.bottomSheetItem}
                    onClick={() => { onMute(computeMutePatch("1h")); onClose(); }}
                  >
                    <span>{t("chat.dmConversation.mute1h")}</span>
                  </button>
                  <button
                    type="button"
                    className={styles.bottomSheetItem}
                    onClick={() => { onMute(computeMutePatch("4h")); onClose(); }}
                  >
                    <span>{t("chat.dmConversation.mute4h")}</span>
                  </button>
                  <button
                    type="button"
                    className={styles.bottomSheetItem}
                    onClick={() => { onMute(computeMutePatch("8am")); onClose(); }}
                  >
                    <span>{t("chat.dmConversation.muteUntil8am")}</span>
                  </button>
                  <button
                    type="button"
                    className={styles.bottomSheetItem}
                    onClick={() => { onMute(computeMutePatch("forever")); onClose(); }}
                  >
                    <span>{t("chat.dmConversation.muteForever")}</span>
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </>
    );
  }

  /* ── DESKTOP: original positioned popup ── */
  return (
    <>
      <div className={styles.overlay} onClick={onClose} aria-hidden />
      <div
        ref={menuRef}
        className={styles.menu}
        style={{ left: menuPos.left, top: menuPos.top }}
        role="menu"
        aria-label={t("chat.dmConversation.menuLabel").replace("{name}", peerName)}
      >
        <div
          className={styles.submenuWrap}
          onMouseEnter={() => showSubmenu("category")}
          onMouseLeave={scheduleHideSubmenu}
        >
          <button
            type="button"
            className={`${styles.menuItemRow} ${openSubmenu === "category" ? styles.menuItemActive : ""}`}
            role="menuitem"
            aria-haspopup="true"
          >
            <span>{t("chat.dmConversation.categorize")}</span>
            <span className={styles.chevron}>›</span>
          </button>
          {openSubmenu === "category" && (
            <div
              className={styles.submenu}
              role="menu"
              onMouseEnter={() => showSubmenu("category")}
              onMouseLeave={scheduleHideSubmenu}
            >
              <div className={styles.submenuPanel}>
              {preferences.category && (
                <>
                  <button
                    type="button"
                    className={styles.menuItem}
                    onClick={() => {
                      onCategory(null);
                      onClose();
                    }}
                  >
                    {t("chat.dmConversation.clearCategory")}
                  </button>
                  <div className={styles.divider} />
                </>
              )}
              {DM_CONVERSATION_CATEGORIES.map((key) => (
                <button
                  key={key}
                  type="button"
                  className={`${styles.menuItem} ${styles.categoryRow}`}
                  onClick={() => {
                    onCategory(key);
                    onClose();
                  }}
                >
                  <span
                    className={styles.categoryDot}
                    style={{ background: DM_CATEGORY_COLORS[key] }}
                  />
                  {categoryLabel(key)}
                  {preferences.category === key ? " ✓" : ""}
                </button>
              ))}
              </div>
            </div>
          )}
        </div>

        <div
          className={styles.submenuWrap}
          onMouseEnter={() => showSubmenu("mute")}
          onMouseLeave={scheduleHideSubmenu}
        >
          <button
            type="button"
            className={`${styles.menuItemRow} ${openSubmenu === "mute" ? styles.menuItemActive : ""}`}
            role="menuitem"
            aria-haspopup="true"
          >
            <span>
              {muted
                ? t("chat.dmConversation.unmuteNotifications")
                : t("chat.dmConversation.muteNotifications")}
            </span>
            <span className={styles.chevron}>›</span>
          </button>
          {openSubmenu === "mute" && (
            <div
              className={styles.submenu}
              role="menu"
              onMouseEnter={() => showSubmenu("mute")}
              onMouseLeave={scheduleHideSubmenu}
            >
              <div className={styles.submenuPanel}>
              {muted && (
                <>
                  <button
                    type="button"
                    className={styles.menuItem}
                    onClick={() => {
                      onMute(computeMutePatch("off"));
                      onClose();
                    }}
                  >
                    {t("chat.dmConversation.unmuteNotifications")}
                  </button>
                  <div className={styles.divider} />
                </>
              )}
              {!muted && (
                <>
                  <button
                    type="button"
                    className={styles.menuItem}
                    onClick={() => {
                      onMute(computeMutePatch("1h"));
                      onClose();
                    }}
                  >
                    {t("chat.dmConversation.mute1h")}
                  </button>
                  <button
                    type="button"
                    className={styles.menuItem}
                    onClick={() => {
                      onMute(computeMutePatch("4h"));
                      onClose();
                    }}
                  >
                    {t("chat.dmConversation.mute4h")}
                  </button>
                  <button
                    type="button"
                    className={styles.menuItem}
                    onClick={() => {
                      onMute(computeMutePatch("8am"));
                      onClose();
                    }}
                  >
                    {t("chat.dmConversation.muteUntil8am")}
                  </button>
                  <button
                    type="button"
                    className={styles.menuItem}
                    onClick={() => {
                      onMute(computeMutePatch("forever"));
                      onClose();
                    }}
                  >
                    {t("chat.dmConversation.muteForever")}
                  </button>
                </>
              )}
              </div>
            </div>
          )}
        </div>

        {isFollowing && (
          <>
            <div className={styles.divider} />
            <button
              type="button"
              className={styles.menuItem}
              onClick={() => {
                onUnfollow();
                onClose();
              }}
              role="menuitem"
            >
              {t("chat.dmConversation.unfollow")}
            </button>
          </>
        )}

        <div className={styles.divider} />
        <button
          type="button"
          className={`${styles.menuItem} ${styles.menuItemDanger}`}
          onClick={() => {
            if (isBlockedByMe) onUnblock();
            else onBlock();
            onClose();
          }}
          role="menuitem"
        >
          {isBlockedByMe
            ? t("chat.dmConversation.unblock")
            : t("chat.dmConversation.block")}
        </button>
      </div>
    </>
  );
}
