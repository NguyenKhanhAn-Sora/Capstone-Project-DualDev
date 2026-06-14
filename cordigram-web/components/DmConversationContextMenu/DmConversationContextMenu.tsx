"use client";

import React, { useEffect, useRef, useState } from "react";
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
}: DmConversationContextMenuProps) {
  const { t } = useLanguage();
  const menuRef = useRef<HTMLDivElement>(null);
  const [openSubmenu, setOpenSubmenu] = useState<"mute" | "category" | null>(
    null,
  );

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  const muted = isDmConversationMuted(preferences);
  const categoryLabel = (key: DmConversationCategory) =>
    t(`chat.dmConversation.categories.${key}`);

  return (
    <>
      <div className={styles.overlay} onClick={onClose} aria-hidden />
      <div
        ref={menuRef}
        className={styles.menu}
        style={{ left: x, top: y }}
        role="menu"
        aria-label={t("chat.dmConversation.menuLabel").replace("{name}", peerName)}
      >
        <div
          className={styles.submenuWrap}
          onMouseEnter={() => setOpenSubmenu("category")}
          onMouseLeave={() =>
            setOpenSubmenu((prev) => (prev === "category" ? null : prev))
          }
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
            <div className={styles.submenu} role="menu">
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
          )}
        </div>

        <div
          className={styles.submenuWrap}
          onMouseEnter={() => setOpenSubmenu("mute")}
          onMouseLeave={() =>
            setOpenSubmenu((prev) => (prev === "mute" ? null : prev))
          }
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
            <div className={styles.submenu} role="menu">
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
