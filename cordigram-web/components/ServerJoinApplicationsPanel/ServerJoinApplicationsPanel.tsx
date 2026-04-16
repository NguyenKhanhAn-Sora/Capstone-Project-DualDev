"use client";

import React, { useCallback, useEffect, useState } from "react";
import * as serversApi from "@/lib/servers-api";
import styles from "./ServerJoinApplicationsPanel.module.css";
import { useLanguage, localeTagForLanguage } from "@/component/language-provider";

type Tab = serversApi.JoinApplicationListStatus;

export default function ServerJoinApplicationsPanel({
  serverId,
  serverName,
  canBan,
  canKick,
  canTimeout,
  ownerId,
  onApplicationsChanged,
  onViewProfile,
  onSendMessage,
}: {
  serverId: string;
  serverName: string;
  canBan?: boolean;
  canKick?: boolean;
  canTimeout?: boolean;
  ownerId?: string;
  onApplicationsChanged?: () => void;
  onViewProfile?: (userId: string) => void;
  onSendMessage?: (userId: string) => void;
}) {
  const { t, language } = useLanguage();
  const [tab, setTab] = useState<Tab>("pending");
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [items, setItems] = useState<serversApi.JoinApplicationListItem[]>([]);
  const [pendingCount, setPendingCount] = useState(0);

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [detail, setDetail] = useState<serversApi.JoinApplicationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const [menu, setMenu] = useState<{ userId: string; x: number; y: number } | null>(null);

  const localeTag = localeTagForLanguage(language);

  const fmtRegistered = useCallback((iso: string) => {
    try {
      return new Date(iso).toLocaleString(localeTag, {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  }, [localeTag]);

  const fmtDateOnly = useCallback((iso: string | null) => {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleDateString(localeTag, {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch {
      return "—";
    }
  }, [localeTag]);

  const normalizeUserId = useCallback((v: string | undefined) => String(v ?? "").trim(), []);

  const loadList = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const res = await serversApi.listJoinApplications(serverId, tab);
      const ownerNorm = normalizeUserId(ownerId);
      const rows = ownerNorm
        ? res.items.filter((row) => normalizeUserId(row.userId) !== ownerNorm)
        : res.items;
      setItems(rows);
      setPendingCount(tab === "pending" ? rows.length : res.pendingCount);
    } catch (e) {
      setListError(e instanceof Error ? e.message : t("chat.joinApplications.errorLoad"));
      setItems([]);
    } finally {
      setListLoading(false);
    }
  }, [serverId, tab, t, ownerId, normalizeUserId]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (!selectedUserId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    serversApi
      .getJoinApplicationDetail(serverId, selectedUserId)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch(() => {
        if (!cancelled) setDetail(null);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [serverId, selectedUserId]);

  const refresh = async () => {
    await loadList();
    onApplicationsChanged?.();
    if (selectedUserId) {
      try {
        const d = await serversApi.getJoinApplicationDetail(serverId, selectedUserId);
        setDetail(d);
      } catch {
        setDetail(null);
      }
    }
  };

  const handleApprove = async () => {
    if (!selectedUserId || !detail || detail.status !== "pending") return;
    setActionLoading(true);
    try {
      await serversApi.approveServerAccessUser(serverId, selectedUserId);
      setSelectedUserId(null);
      await refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : t("chat.joinApplications.approveError"));
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!selectedUserId || !detail || detail.status !== "pending") return;
    setActionLoading(true);
    try {
      await serversApi.rejectAccessUser(serverId, selectedUserId);
      setSelectedUserId(null);
      await refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : t("chat.joinApplications.rejectError"));
    } finally {
      setActionLoading(false);
    }
  };

  const openKebab = (e: React.MouseEvent, userId: string) => {
    e.stopPropagation();
    setMenu({ userId, x: e.clientX, y: e.clientY });
  };

  const tabLabel = (tabKey: Tab) => {
    if (tabKey === "all") return t("chat.joinApplications.tabAll");
    if (tabKey === "pending") return `${t("chat.joinApplications.tabPending")}${pendingCount > 0 ? ` (${pendingCount})` : ""}`;
    if (tabKey === "rejected") return t("chat.joinApplications.tabRejected");
    return t("chat.joinApplications.tabApproved");
  };

  return (
    <div className={styles.root}>
      <div className={styles.main}>
        <h2 className={styles.title}>{t("chat.joinApplications.title").replace("{serverName}", serverName)}</h2>
        <div className={styles.tabs}>
          {(["all", "pending", "rejected", "approved"] as Tab[]).map((tabKey) => (
            <button
              key={tabKey}
              type="button"
              className={`${styles.tab} ${tab === tabKey ? styles.tabActive : ""}`}
              onClick={() => {
                setTab(tabKey);
                setSelectedUserId(null);
              }}
            >
              {tabLabel(tabKey)}
            </button>
          ))}
        </div>

        {listError && <div className={styles.error}>{listError}</div>}
        {listLoading ? (
          <div className={styles.loading}>{t("chat.joinApplications.loading")}</div>
        ) : items.length === 0 ? (
          <div className={styles.empty}>{t("chat.joinApplications.empty")}</div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th}>{t("chat.joinApplications.colName")}</th>
                  <th className={styles.th}>{t("chat.joinApplications.colRegistered")}</th>
                  <th className={styles.th} aria-hidden style={{ width: 48 }} />
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr
                    key={row.userId}
                    className={`${styles.tr} ${selectedUserId === row.userId ? styles.trSelected : ""}`}
                    onClick={() => setSelectedUserId(row.userId)}
                  >
                    <td className={styles.td}>
                      <div className={styles.userCell}>
                        <div className={styles.avatar}>
                          {row.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={row.avatarUrl} alt="" />
                          ) : (
                            (row.displayName || row.username || "?").charAt(0).toUpperCase()
                          )}
                        </div>
                        <div className={styles.userMeta}>
                          <div className={styles.displayName}>{row.displayName}</div>
                          <div className={styles.username}>{row.username}</div>
                        </div>
                      </div>
                    </td>
                    <td className={styles.td}>{fmtRegistered(row.registeredAt)}</td>
                    <td className={styles.td}>
                      {row.userId !== ownerId && (
                        <div className={styles.rowActions}>
                          <button
                            type="button"
                            className={styles.kebab}
                            aria-label={t("chat.joinApplications.optionsBtn")}
                            onClick={(e) => openKebab(e, row.userId)}
                          >
                            ⋮
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {menu && (
        <>
          <button
            type="button"
            className={styles.menuBackdrop}
            aria-label={t("chat.joinApplications.closeMenu")}
            onClick={() => setMenu(null)}
          />
          <div
            className={styles.menu}
            style={{ left: Math.min(menu.x, typeof window !== "undefined" ? window.innerWidth - 220 : menu.x), top: menu.y }}
          >
            <button
              type="button"
              className={styles.menuItem}
              onClick={() => {
                const uid = menu.userId;
                setMenu(null);
                onViewProfile?.(uid);
              }}
            >
              {t("chat.joinApplications.menuProfile")}
              <span>👤</span>
            </button>
            <button
              type="button"
              className={styles.menuItem}
              onClick={() => {
                const uid = menu.userId;
                setMenu(null);
                onSendMessage?.(uid);
              }}
            >
              {t("chat.joinApplications.menuMessage")}
              <span>💬</span>
            </button>

            {(canKick || canBan || canTimeout) && (
              <>
                <div className={styles.menuDivider} />
                {canTimeout && (
                  <button
                    type="button"
                    className={styles.menuItem}
                    onClick={async () => {
                      const uid = menu.userId;
                      setMenu(null);
                      const minsRaw = window.prompt(t("chat.joinApplications.menuTimeoutPrompt"), "10");
                      if (!minsRaw) return;
                      const mins = Math.max(1, Math.min(60 * 24 * 7, Number(minsRaw)));
                      if (!Number.isFinite(mins)) return;
                      const reason = window.prompt(t("chat.joinApplications.menuReasonPrompt"), "") || undefined;
                      try {
                        await serversApi.timeoutMember(serverId, uid, mins * 60, reason);
                        await refresh();
                      } catch (e) {
                        alert(e instanceof Error ? e.message : t("chat.joinApplications.menuTimeoutError"));
                      }
                    }}
                  >
                    {t("chat.joinApplications.menuTimeout")}
                    <span>⏳</span>
                  </button>
                )}
                {canKick && (
                  <button
                    type="button"
                    className={styles.menuItem}
                    onClick={async () => {
                      const uid = menu.userId;
                      setMenu(null);
                      const ok = window.confirm(t("chat.joinApplications.menuKickConfirm"));
                      if (!ok) return;
                      const reason = window.prompt(t("chat.joinApplications.menuReasonPrompt"), "") || undefined;
                      try {
                        await serversApi.kickMember(serverId, uid, reason);
                        await refresh();
                      } catch (e) {
                        alert(e instanceof Error ? e.message : t("chat.joinApplications.menuKickError"));
                      }
                    }}
                  >
                    {t("chat.joinApplications.menuKick")}
                    <span>🚪</span>
                  </button>
                )}
                {canBan && (
                  <button
                    type="button"
                    className={styles.menuItem}
                    onClick={async () => {
                      const uid = menu.userId;
                      setMenu(null);
                      const ok = window.confirm(t("chat.joinApplications.menuBanConfirm"));
                      if (!ok) return;
                      const reason = window.prompt(t("chat.joinApplications.menuReasonPrompt"), "") || undefined;
                      try {
                        await serversApi.banMember(serverId, uid, reason);
                        await refresh();
                      } catch (e) {
                        alert(e instanceof Error ? e.message : t("chat.joinApplications.menuBanError"));
                      }
                    }}
                  >
                    {t("chat.joinApplications.menuBan")}
                    <span>⛔</span>
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}

      {selectedUserId && (
        <aside className={styles.detail}>
          <div className={styles.detailHeader}>
            <div className={styles.detailUser}>
              <div className={styles.detailAvatar}>
                {detail?.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={detail.avatarUrl} alt="" />
                ) : detail ? (
                  (detail.displayName || detail.username || "?").charAt(0).toUpperCase()
                ) : (
                  "…"
                )}
              </div>
              <div className={styles.userMeta}>
                <div className={styles.displayName}>{detail?.displayName ?? "…"}</div>
                <div className={styles.username}>{detail?.username ?? ""}</div>
              </div>
            </div>
            <button
              type="button"
              className={styles.closeBtn}
              aria-label={t("chat.joinApplications.close")}
              onClick={() => setSelectedUserId(null)}
            >
              ×
            </button>
          </div>
          <div className={styles.detailBody}>
            {detailLoading && <div className={styles.loading}>{t("chat.joinApplications.detailLoading")}</div>}
            {!detailLoading && detail && (
              <>
                {detail.status === "pending" && (
                  <div className={styles.actionsRow}>
                    <button
                      type="button"
                      className={`${styles.circleBtn} ${styles.approveBtn}`}
                      title={t("chat.joinApplications.approveTitle")}
                      disabled={actionLoading}
                      onClick={() => void handleApprove()}
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      className={`${styles.circleBtn} ${styles.rejectBtn}`}
                      title={t("chat.joinApplications.rejectTitle")}
                      disabled={actionLoading}
                      onClick={() => void handleReject()}
                    >
                      ✕
                    </button>
                  </div>
                )}

                {detail.questionsWithAnswers.map((q) => {
                  const text =
                    q.type === "multiple_choice"
                      ? q.selectedOption || "—"
                      : q.answerText || "—";
                  if (!q.title && text === "—") return null;
                  return (
                    <div key={q.questionId} className={styles.qBlock}>
                      <div className={styles.qLabel}>{q.title}</div>
                      <div className={styles.qAnswer}>{text}</div>
                    </div>
                  );
                })}

                <div className={styles.accountBlock}>
                  <div className={styles.qLabel}>{t("chat.joinApplications.accountLabel")}</div>
                  <div className={styles.accountRow}>
                    <span>{t("chat.joinApplications.joinedCordigram")}</span>
                    <span>{fmtDateOnly(detail.accountCreatedAt)}</span>
                  </div>
                  <div className={styles.accountRow}>
                    <span>{t("chat.joinApplications.submittedAt")}</span>
                    <span>{fmtDateOnly(detail.applicationSubmittedAt)}</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </aside>
      )}
    </div>
  );
}
