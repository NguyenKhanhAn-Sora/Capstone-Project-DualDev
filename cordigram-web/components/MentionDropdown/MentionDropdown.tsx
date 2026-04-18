"use client";

import React, { useEffect, useRef, useCallback, useMemo } from "react";
import styles from "./MentionDropdown.module.css";
import type { MentionSuggestion } from "@/lib/servers-api";
import { useLanguage } from "@/component/language-provider";

interface MentionDropdownProps {
  suggestions: MentionSuggestion[];
  activeIndex: number;
  keyword: string;
  onSelect: (suggestion: MentionSuggestion) => void;
  onActiveIndexChange: (index: number) => void;
}

function highlightMatch(text: string, keyword: string) {
  if (!keyword) return text;
  const idx = text.toLowerCase().indexOf(keyword.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <span className={styles.highlight}>{text.slice(idx, idx + keyword.length)}</span>
      {text.slice(idx + keyword.length)}
    </>
  );
}

function SpecialMentionIcon({ id }: { id: string }) {
  if (id === "special_everyone") {
    return (
      <div className={styles.specialIconEveryone} aria-hidden>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18 11v-1A6 6 0 0 0 6 10v1H4v8h2v1a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-1h2v-8h-2zm-8 9a1 1 0 0 1-1-1v-3h2v3a1 1 0 0 1-1 1zm5-1a1 1 0 0 1-1 1h-1v-4H9v4H8a1 1 0 0 1-1-1v-1h8v1zM6 10a4 4 0 0 1 8 0v1H6v-1z" />
        </svg>
      </div>
    );
  }
  if (id === "special_here") {
    return (
      <div className={styles.specialIconHere} aria-hidden>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
        </svg>
      </div>
    );
  }
  return (
    <div className={styles.specialIconFallback} aria-hidden>
      @
    </div>
  );
}

export default function MentionDropdown({
  suggestions,
  activeIndex,
  keyword,
  onSelect,
  onActiveIndexChange,
}: MentionDropdownProps) {
  const { t } = useLanguage();
  const listRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  const sectionLabelFor = useMemo(
    () =>
      (item: MentionSuggestion, prev: MentionSuggestion | undefined): string | null => {
        if (!prev || prev.type !== item.type) {
          if (item.type === "special") return t("chat.mention.sectionQuick");
          if (item.type === "user") return t("chat.mention.sectionMembers");
          if (item.type === "role") return t("chat.mention.sectionRoles");
        }
        return null;
      },
    [t],
  );

  const displayPrimary = useCallback(
    (item: MentionSuggestion) => {
      if (item.type === "special" && item.id === "special_everyone") {
        return t("chat.mention.everyoneTitle");
      }
      if (item.type === "special" && item.id === "special_here") {
        return t("chat.mention.hereTitle");
      }
      return item.name;
    },
    [t],
  );

  const displayDescription = useCallback(
    (item: MentionSuggestion) => {
      if (item.type === "special" && item.id === "special_everyone") {
        return t("chat.mention.everyoneDesc");
      }
      if (item.type === "special" && item.id === "special_here") {
        return t("chat.mention.hereDesc");
      }
      return item.description;
    },
    [t],
  );

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const renderItem = useCallback(
    (item: MentionSuggestion, globalIndex: number) => {
      const isActive = globalIndex === activeIndex;
      const primary = displayPrimary(item);
      const desc = displayDescription(item);
      return (
        <button
          key={`${item.id}-${globalIndex}`}
          ref={isActive ? activeRef : undefined}
          type="button"
          className={`${styles.item} ${isActive ? styles.itemActive : ""}`}
          onMouseEnter={() => onActiveIndexChange(globalIndex)}
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(item);
          }}
        >
          {item.type === "special" && <SpecialMentionIcon id={item.id} />}
          {item.type === "role" && (
            <div
              className={styles.roleIcon}
              style={{ border: `2px solid ${item.color || "#99aab5"}`, color: item.color || "#99aab5" }}
            >
              @
            </div>
          )}
          {item.type === "user" && (
            <div
              className={styles.avatar}
              style={
                item.avatarUrl
                  ? { backgroundImage: `url(${item.avatarUrl})` }
                  : undefined
              }
            >
              {!item.avatarUrl && item.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className={styles.info}>
            <span
              className={`${styles.name} ${item.type === "role" ? styles.nameRole : ""}`}
              style={item.type === "role" && item.color ? { color: item.color } : undefined}
            >
              {highlightMatch(primary, keyword)}
            </span>
            <span className={styles.description}>{desc}</span>
          </div>
        </button>
      );
    },
    [activeIndex, keyword, onActiveIndexChange, onSelect, displayPrimary, displayDescription],
  );

  if (suggestions.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.empty}>{t("chat.mention.empty")}</div>
      </div>
    );
  }

  return (
    <div className={styles.container} ref={listRef}>
      {suggestions.map((item, idx) => {
        const label = sectionLabelFor(item, suggestions[idx - 1]);
        return (
          <React.Fragment key={`${item.id}-${idx}`}>
            {label && <div className={styles.sectionLabel}>{label}</div>}
            {renderItem(item, idx)}
          </React.Fragment>
        );
      })}
    </div>
  );
}
