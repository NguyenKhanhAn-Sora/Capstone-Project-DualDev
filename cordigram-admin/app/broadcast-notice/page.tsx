"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./broadcast-notice.module.css";
import { getApiBaseUrl } from "@/lib/api";

type AdminPayload = {
  roles?: string[];
  exp?: number;
};

type NoticeLevel = "info" | "warning" | "critical";
type TargetMode = "all" | "include" | "exclude";

type UserSuggestionItem = {
  userId: string;
  username: string;
  displayName: string | null;
  email: string | null;
  avatarUrl: string | null;
};

type BroadcastHistoryItem = {
  id: string;
  title: string | null;
  body: string;
  level: NoticeLevel;
  actionUrl: string | null;
  targetMode: TargetMode;
  includeCount: number;
  excludeCount: number;
  targetUserCount: number;
  realtimeDeliveredCount: number;
  createdAt: string;
  admin: {
    userId: string;
    displayName: string | null;
    username: string | null;
    email: string | null;
  };
};

const decodeJwt = (token: string): AdminPayload | null => {
  try {
    const payload = token.split(".")[1];
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return json as AdminPayload;
  } catch {
    return null;
  }
};

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return "--";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "--";
  return dt.toLocaleString();
};

const levelLabel: Record<NoticeLevel, string> = {
  info: "Info",
  warning: "Warning",
  critical: "Critical",
};

export default function BroadcastNoticePage() {
  const router = useRouter();

  const [ready, setReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [level, setLevel] = useState<NoticeLevel>("info");
  const [actionUrl, setActionUrl] = useState("");
  const [targetMode, setTargetMode] = useState<TargetMode>("all");
  const [includeIdsText, setIncludeIdsText] = useState("");
  const [excludeIdsText, setExcludeIdsText] = useState("");
  const [includeLookup, setIncludeLookup] = useState("");
  const [excludeLookup, setExcludeLookup] = useState("");
  const [suggestions, setSuggestions] = useState<UserSuggestionItem[]>([]);
  const [suggestionOpen, setSuggestionOpen] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  const [history, setHistory] = useState<BroadcastHistoryItem[]>([]);
  const [historyFilter, setHistoryFilter] = useState<"all" | NoticeLevel>("all");

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = localStorage.getItem("adminAccessToken") || "";
    if (!token) {
      router.replace("/login");
      return;
    }

    const payload = decodeJwt(token);
    const roles = payload?.roles || [];
    const exp = payload?.exp ? payload.exp * 1000 : 0;
    if (!roles.includes("admin") || (exp && Date.now() > exp)) {
      router.replace("/login");
      return;
    }

    setReady(true);
  }, [router]);

  const loadHistory = async () => {
    const token = localStorage.getItem("adminAccessToken") || "";
    if (!token) return;

    try {
      setLoadingHistory(true);
      const response = await fetch(`${getApiBaseUrl()}/admin/broadcast-notice/history?limit=30`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to load history");
      }

      const payload = (await response.json()) as { items?: BroadcastHistoryItem[] };
      setHistory(payload.items ?? []);
    } catch {
      setHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (!ready) return;
    void loadHistory();
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    const keyword = targetMode === "include" ? includeLookup : excludeLookup;
    const trimmed = keyword.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setSuggestionOpen(false);
      return;
    }

    const token = localStorage.getItem("adminAccessToken") || "";
    if (!token) return;

    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        setLoadingSuggestions(true);
        const query = new URLSearchParams({ q: trimmed, limit: "8" });
        const response = await fetch(
          `${getApiBaseUrl()}/admin/broadcast-notice/users/suggest?${query.toString()}`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );
        if (!response.ok) {
          throw new Error("Failed to load suggestions");
        }
        const payload = (await response.json()) as { items?: UserSuggestionItem[] };
        if (!active) return;
        setSuggestions(payload.items ?? []);
        setSuggestionOpen(true);
      } catch {
        if (!active) return;
        setSuggestions([]);
        setSuggestionOpen(false);
      } finally {
        if (active) {
          setLoadingSuggestions(false);
        }
      }
    }, 220);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [excludeLookup, includeLookup, ready, targetMode]);

  const canSubmit = useMemo(() => {
    if (!body.trim()) return false;
    if (title.trim().length > 120) return false;
    if (body.trim().length > 2000) return false;
    if (actionUrl.trim() && !/^https?:\/\//i.test(actionUrl.trim())) return false;
    if (targetMode === "include" && !includeIdsText.trim()) return false;
    if (targetMode === "exclude" && !excludeIdsText.trim()) return false;
    return true;
  }, [actionUrl, body, excludeIdsText, includeIdsText, targetMode, title]);

  const filteredHistory = useMemo(() => {
    if (historyFilter === "all") return history;
    return history.filter((item) => item.level === historyFilter);
  }, [history, historyFilter]);

  const handleSend = async () => {
    const token = localStorage.getItem("adminAccessToken") || "";
    if (!token) return;

    try {
      setSubmitting(true);
      setError(null);

      const parseIds = (raw: string) =>
        Array.from(
          new Set(
            raw
              .split(/[\n,]/g)
              .map((item) => item.trim())
              .filter(Boolean),
          ),
        );

      const response = await fetch(`${getApiBaseUrl()}/admin/broadcast-notice/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          level,
          actionUrl: actionUrl.trim() || null,
          targetMode,
          includeUserIds: targetMode === "include" ? parseIds(includeIdsText) : [],
          excludeUserIds: targetMode === "exclude" ? parseIds(excludeIdsText) : [],
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { message?: string | string[] };
        const text = Array.isArray(payload.message)
          ? payload.message.join("; ")
          : payload.message || "Failed to send broadcast";
        throw new Error(text);
      }

      const payload = (await response.json()) as {
        targetUserCount: number;
        realtimeDeliveredCount: number;
      };

      setToast(
        `Notice sent successfully. Target users: ${payload.targetUserCount.toLocaleString()} · Realtime delivered: ${payload.realtimeDeliveredCount.toLocaleString()}`,
      );
      setTitle("");
      setBody("");
      setLevel("info");
      setActionUrl("");
      setTargetMode("all");
      setIncludeIdsText("");
      setExcludeIdsText("");
      await loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send broadcast");
    } finally {
      setSubmitting(false);
    }
  };

  if (!ready) return null;

  const addIdentifier = (value: string) => {
    const token = value.trim();
    if (!token) return;

    const appendUnique = (prev: string) => {
      const existing = new Set(
        prev
          .split(/[\n,]/g)
          .map((item) => item.trim().toLowerCase())
          .filter(Boolean),
      );
      if (existing.has(token.toLowerCase())) {
        return prev;
      }
      return prev.trim() ? `${prev.trim()}\n${token}` : token;
    };

    if (targetMode === "include") {
      setIncludeIdsText((prev) => appendUnique(prev));
      setIncludeLookup("");
    } else if (targetMode === "exclude") {
      setExcludeIdsText((prev) => appendUnique(prev));
      setExcludeLookup("");
    }
    setSuggestionOpen(false);
    setSuggestions([]);
  };

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.topbar}>
          <div>
            <p className={styles.eyebrow}>Global Communication</p>
            <h1 className={styles.title}>Broadcast Notice</h1>
            <p className={styles.subtitle}>
              Send a real-time system notice to all active users instantly.
            </p>
          </div>
        </header>

        <section className={styles.panel}>
          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span className={styles.label}>Title (optional)</span>
              <input
                className={styles.input}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="e.g. Scheduled maintenance at 10:00 PM UTC"
                maxLength={120}
              />
              <span className={styles.counter}>{title.length}/120</span>
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Severity</span>
              <div className={styles.levelRow}>
                {(["info", "warning", "critical"] as NoticeLevel[]).map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={`${styles.levelChip} ${level === item ? styles.levelChipActive : ""}`}
                    onClick={() => setLevel(item)}
                  >
                    {levelLabel[item]}
                  </button>
                ))}
              </div>
            </label>

            <label className={styles.fieldFull}>
              <span className={styles.label}>Message</span>
              <textarea
                className={styles.textarea}
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder="Write clear, concise instructions for all users."
                rows={6}
                maxLength={2000}
              />
              <span className={styles.counter}>{body.length}/2000</span>
            </label>

            <label className={styles.fieldFull}>
              <span className={styles.label}>Optional action URL</span>
              <input
                className={styles.input}
                value={actionUrl}
                onChange={(event) => setActionUrl(event.target.value)}
                placeholder="https://status.example.com"
                maxLength={300}
              />
            </label>

            <label className={styles.fieldFull}>
              <span className={styles.label}>Target audience</span>
              <div className={styles.historyFilters}>
                {(["all", "include", "exclude"] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={`${styles.filterChip} ${targetMode === item ? styles.filterChipActive : ""}`}
                    onClick={() => setTargetMode(item)}
                  >
                    {item === "all" ? "All Users" : item === "include" ? "Only Specific Users" : "All Except Specific Users"}
                  </button>
                ))}
              </div>
            </label>

            {targetMode === "include" ? (
              <label className={styles.fieldFull}>
                <span className={styles.label}>Include user IDs (comma or new line)</span>
                <div className={styles.suggestionWrap}>
                  <input
                    className={styles.input}
                    value={includeLookup}
                    onChange={(event) => {
                      setIncludeLookup(event.target.value);
                      setSuggestionOpen(true);
                    }}
                    placeholder="Type username to suggest, then click to add"
                  />
                  {suggestionOpen && targetMode === "include" ? (
                    <div className={styles.suggestionBox}>
                      {loadingSuggestions ? (
                        <p className={styles.suggestionHint}>Loading...</p>
                      ) : suggestions.length === 0 ? (
                        <p className={styles.suggestionHint}>No matching usernames</p>
                      ) : (
                        suggestions.map((item) => (
                          <button
                            key={`${item.userId}-include`}
                            type="button"
                            className={styles.suggestionItem}
                            onClick={() => addIdentifier(item.username)}
                          >
                            <span className={styles.suggestionUserRow}>
                              {item.avatarUrl ? (
                                <img src={item.avatarUrl} alt={item.username} className={styles.suggestionAvatar} />
                              ) : (
                                <span className={styles.suggestionAvatarFallback}>
                                  {item.username.charAt(0).toUpperCase()}
                                </span>
                              )}
                              <span className={styles.suggestionUserText}>
                                <span>@{item.username}</span>
                                <small>{item.displayName || item.email || item.userId}</small>
                              </span>
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  ) : null}
                </div>
                <textarea
                  className={styles.textarea}
                  value={includeIdsText}
                  onChange={(event) => setIncludeIdsText(event.target.value)}
                  placeholder="You can paste ObjectId(s) or username(s), separated by comma/new line"
                  rows={3}
                />
              </label>
            ) : null}

            {targetMode === "exclude" ? (
              <label className={styles.fieldFull}>
                <span className={styles.label}>Exclude user IDs (comma or new line)</span>
                <div className={styles.suggestionWrap}>
                  <input
                    className={styles.input}
                    value={excludeLookup}
                    onChange={(event) => {
                      setExcludeLookup(event.target.value);
                      setSuggestionOpen(true);
                    }}
                    placeholder="Type username to suggest, then click to add"
                  />
                  {suggestionOpen && targetMode === "exclude" ? (
                    <div className={styles.suggestionBox}>
                      {loadingSuggestions ? (
                        <p className={styles.suggestionHint}>Loading...</p>
                      ) : suggestions.length === 0 ? (
                        <p className={styles.suggestionHint}>No matching usernames</p>
                      ) : (
                        suggestions.map((item) => (
                          <button
                            key={`${item.userId}-exclude`}
                            type="button"
                            className={styles.suggestionItem}
                            onClick={() => addIdentifier(item.username)}
                          >
                            <span className={styles.suggestionUserRow}>
                              {item.avatarUrl ? (
                                <img src={item.avatarUrl} alt={item.username} className={styles.suggestionAvatar} />
                              ) : (
                                <span className={styles.suggestionAvatarFallback}>
                                  {item.username.charAt(0).toUpperCase()}
                                </span>
                              )}
                              <span className={styles.suggestionUserText}>
                                <span>@{item.username}</span>
                                <small>{item.displayName || item.email || item.userId}</small>
                              </span>
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  ) : null}
                </div>
                <textarea
                  className={styles.textarea}
                  value={excludeIdsText}
                  onChange={(event) => setExcludeIdsText(event.target.value)}
                  placeholder="You can paste ObjectId(s) or username(s), separated by comma/new line"
                  rows={3}
                />
              </label>
            ) : null}
          </div>

          {error ? <p className={styles.error}>{error}</p> : null}

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.sendButton}
              onClick={handleSend}
              disabled={!canSubmit || submitting}
            >
              {submitting ? "Sending..." : "Send Broadcast Now"}
            </button>
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Recent Broadcast History</h2>
            <div className={styles.historyFilters}>
              {(["all", "info", "warning", "critical"] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`${styles.filterChip} ${historyFilter === item ? styles.filterChipActive : ""}`}
                  onClick={() => setHistoryFilter(item)}
                >
                  {item === "all" ? "All" : levelLabel[item]}
                </button>
              ))}
            </div>
          </div>

          {loadingHistory ? <p className={styles.muted}>Loading history...</p> : null}
          {!loadingHistory && filteredHistory.length === 0 ? (
            <p className={styles.muted}>No broadcasts have been sent yet.</p>
          ) : null}

          <div className={styles.historyList}>
            {filteredHistory.map((item) => (
              <article key={item.id} className={styles.historyCard}>
                <div className={styles.historyHeader}>
                  <div>
                    <p className={styles.historyTitle}>{item.title || "No title"}</p>
                    <p className={styles.historyMeta}>
                      {formatDateTime(item.createdAt)} · by {item.admin.displayName || item.admin.email || item.admin.userId}
                    </p>
                  </div>
                  <span className={`${styles.badge} ${styles[`badge_${item.level}`]}`}>
                    {levelLabel[item.level]}
                  </span>
                </div>
                <p className={styles.historyBody}>{item.body}</p>
                <div className={styles.historyFooter}>
                  <span>
                    Target mode: {item.targetMode === "all" ? "All" : item.targetMode === "include" ? "Include only" : "Exclude list"}
                  </span>
                  <span>Include count: {item.includeCount.toLocaleString()}</span>
                  <span>Exclude count: {item.excludeCount.toLocaleString()}</span>
                  <span>Target users: {item.targetUserCount.toLocaleString()}</span>
                  <span>Realtime delivered: {item.realtimeDeliveredCount.toLocaleString()}</span>
                  {item.actionUrl ? <a href={item.actionUrl} target="_blank" rel="noreferrer">Action URL</a> : null}
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
      {toast ? <div className={styles.toast}>{toast}</div> : null}
    </div>
  );
}
