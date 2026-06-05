"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  votePoll,
  getPollResults,
  getMyVote,
  type PollFeedData,
} from "@/lib/api";
import ImageViewerOverlay from "@/ui/image-viewer-overlay/image-viewer-overlay";
import PollVotersOverlay from "@/ui/poll-voters-overlay/poll-voters-overlay";
import { useLanguage } from "@/component/language-provider";
import styles from "./poll-widget.module.css";

type TFn = (key: string, vars?: Record<string, string | number>) => string;

function formatCountdown(expiresAt: string, t: TFn): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return t("poll.ended");
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h > 0) return t("poll.timeLeftHM", { h, m });
  return t("poll.timeLeftM", { m });
}

function formatVoteCount(n: number, t: TFn, language: string): string {
  if (n === 0) return t("poll.noVotes");
  return t("poll.votes", { count: n.toLocaleString(language) });
}

interface PollWidgetProps {
  poll: PollFeedData;
  token?: string | null;
  /** If true, widget is shown in a narrow container (profile grid, etc.) */
  compact?: boolean;
  /** Current viewer userId — used to show "You" label in voters overlay */
  viewerId?: string;
}

export default function PollWidget({ poll, token, compact, viewerId }: PollWidgetProps) {
  const { t, language } = useLanguage();

  const isExpired = useMemo(() => {
    if (poll.isExpired) return true;
    return new Date(poll.expiresAt).getTime() <= Date.now();
  }, [poll.isExpired, poll.expiresAt]);

  // Local results state (may be updated after voting)
  const [results, setResults] = useState(poll.results ?? []);
  const [totalVotes, setTotalVotes] = useState(poll.totalVotes ?? 0);

  // User's selected options before submitting (pending selection)
  const [pending, setPending] = useState<number[]>([]);

  // Indices the user has already voted for (from server or local after vote)
  const [votedIndices, setVotedIndices] = useState<number[]>(
    poll.userVotes ?? [],
  );

  const hasVoted = votedIndices.length > 0;
  const showResults = hasVoted || isExpired;

  const [voting, setVoting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Countdown ticker
  const [countdown, setCountdown] = useState(() =>
    isExpired ? t("poll.ended") : formatCountdown(poll.expiresAt, t),
  );

  useEffect(() => {
    if (isExpired) return;
    const id = setInterval(() => {
      setCountdown(formatCountdown(poll.expiresAt, t));
    }, 30_000);
    return () => clearInterval(id);
  }, [isExpired, poll.expiresAt]);

  // Fetch my vote if not provided in poll data and user is logged in
  useEffect(() => {
    if (!token || poll.userVotes !== undefined) return;
    let cancelled = false;
    getMyVote({ token, pollId: poll.id })
      .then((indices) => {
        if (!cancelled && indices.length > 0) setVotedIndices(indices);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [token, poll.id, poll.userVotes]);

  const togglePending = useCallback(
    (idx: number) => {
      if (poll.allowMultipleAnswers) {
        setPending((prev) =>
          prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx],
        );
      } else {
        setPending([idx]);
      }
    },
    [poll.allowMultipleAnswers],
  );

  const handleSingleVote = useCallback(
    async (idx: number) => {
      if (!token || voting) return;
      setVoting(true);
      setError(null);
      try {
        const updated = await votePoll({ token, pollId: poll.id, optionIndexes: [idx] });
        const res = await getPollResults({ token, pollId: poll.id });
        setVotedIndices([idx]);
        setResults(res.results);
        setTotalVotes(res.totalVotes);
        void updated; // suppress unused warning
      } catch (err: any) {
        setError(err?.message ?? t("poll.error"));
      } finally {
        setVoting(false);
      }
    },
    [token, poll.id, voting, t],
  );

  const handleMultiVoteSubmit = useCallback(async () => {
    if (!token || voting || pending.length === 0) return;
    setVoting(true);
    setError(null);
    try {
      const updated = await votePoll({ token, pollId: poll.id, optionIndexes: pending });
      const res = await getPollResults({ token, pollId: poll.id });
      setVotedIndices(pending);
      setResults(res.results);
      setTotalVotes(res.totalVotes);
      setPending([]);
      void updated;
    } catch (err: any) {
      setError(err?.message ?? t("poll.error"));
    } finally {
      setVoting(false);
    }
  }, [token, poll.id, voting, pending, t]);

  const hasImages = poll.optionImages?.some(Boolean);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [votersOpen, setVotersOpen] = useState(false);

  return (
    <div className={styles.wrap}>
      {/* Poll badge only */}
      <div className={styles.header}>
        <span className={styles.pollBadge}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <rect x="2" y="14" width="4" height="8" rx="1" />
            <rect x="10" y="8" width="4" height="14" rx="1" />
            <rect x="18" y="2" width="4" height="20" rx="1" />
          </svg>
          {t("poll.badge")}
        </span>
      </div>

      {/* Options */}
      <div className={styles.options}>
        {showResults ? (
          // Result bars
          poll.options.map((optText, idx) => {
            const r = results[idx];
            const pct = r?.percentage ?? 0;
            const isVoted = votedIndices.includes(idx);
            const imgUrl = poll.optionImages?.[idx];
            return (
              <div key={idx} className={styles.optionResult}>
                <div
                  className={`${styles.optionResultBar} ${isVoted ? styles.optionResultBarVoted : ""}`}
                  style={{ width: `${pct}%` }}
                />
                <div className={styles.optionResultContent}>
                  {hasImages && (
                    <div
                      className={styles.optionResultThumbWrap}
                      onClick={imgUrl ? (e) => { e.stopPropagation(); setViewerUrl(imgUrl); } : undefined}
                      style={imgUrl ? { cursor: "zoom-in" } : undefined}
                    >
                      {imgUrl ? (
                        <img src={imgUrl} alt={optText} className={styles.optionResultThumb} />
                      ) : null}
                    </div>
                  )}
                  <span className={styles.optionResultText}>{optText}</span>
                  {isVoted && <span className={styles.optionResultVotedDot} />}
                  <span className={styles.optionResultPct}>{Math.round(pct)}%</span>
                </div>
              </div>
            );
          })
        ) : (
          // Vote buttons
          poll.options.map((optText, idx) => {
            const imgUrl = poll.optionImages?.[idx];
            const isMulti = poll.allowMultipleAnswers;
            const isSelected = pending.includes(idx);
            return (
              <button
                key={idx}
                type="button"
                className={styles.optionVoteBtn}
                disabled={voting || !token}
                onClick={() => {
                  if (isMulti) {
                    togglePending(idx);
                  } else {
                    void handleSingleVote(idx);
                  }
                }}
              >
                {hasImages && (
                  <div
                    className={styles.optionThumbWrap}
                    onClick={imgUrl ? (e) => { e.stopPropagation(); setViewerUrl(imgUrl); } : undefined}
                    style={imgUrl ? { cursor: "zoom-in" } : undefined}
                  >
                    {imgUrl ? (
                      <img src={imgUrl} alt={optText} className={styles.optionThumb} />
                    ) : null}
                  </div>
                )}
                {isMulti ? (
                  <span className={`${styles.optionCheckbox} ${isSelected ? styles.optionCheckboxSelected : ""}`}>
                    {isSelected && (
                      <svg className={styles.checkIcon} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <polyline points="1.5,6 4.5,9 10.5,3" />
                      </svg>
                    )}
                  </span>
                ) : (
                  <span className={`${styles.optionRadio} ${isSelected ? styles.optionRadioSelected : ""}`} />
                )}
                <span className={styles.optionVoteText}>{optText}</span>
              </button>
            );
          })
        )}
      </div>

      {/* Error */}
      {error && (
        <p style={{ margin: "6px 14px", fontSize: 12, color: "#ef4444" }}>{error}</p>
      )}

      {/* Footer */}
      <div className={styles.footer}>
        <span
          className={`${styles.footerMeta} ${totalVotes > 0 ? styles.footerMetaClickable : ""}`}
          onClick={totalVotes > 0 ? () => setVotersOpen(true) : undefined}
          role={totalVotes > 0 ? "button" : undefined}
          tabIndex={totalVotes > 0 ? 0 : undefined}
          onKeyDown={totalVotes > 0 ? (e) => { if (e.key === "Enter" || e.key === " ") setVotersOpen(true); } : undefined}
        >
          {formatVoteCount(totalVotes, t, language)}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Multi-choice submit */}
          {!showResults && poll.allowMultipleAnswers && (
            <button
              type="button"
              className={styles.submitBtn}
              disabled={pending.length === 0 || voting || !token}
              onClick={() => void handleMultiVoteSubmit()}
            >
              {voting ? t("poll.voting") : t("poll.vote")}
            </button>
          )}
          {isExpired ? (
            <span className={styles.footerBadgeClosed}>{t("poll.ended")}</span>
          ) : compact ? (
            <span className={styles.footerBadgeLive}>
              <span className={styles.liveDot} />
              {t("poll.open")}
            </span>
          ) : (
            <span className={styles.footerBadgeLive}>
              <span className={styles.liveDot} />
              {countdown}
            </span>
          )}
        </div>
      </div>

      {viewerUrl && (
        <ImageViewerOverlay
          url={viewerUrl}
          mediaType="image"
          onClose={() => setViewerUrl(null)}
        />
      )}

      <PollVotersOverlay
        open={votersOpen}
        pollId={poll.id}
        viewerId={viewerId}
        onClose={() => setVotersOpen(false)}
      />
    </div>
  );
}
