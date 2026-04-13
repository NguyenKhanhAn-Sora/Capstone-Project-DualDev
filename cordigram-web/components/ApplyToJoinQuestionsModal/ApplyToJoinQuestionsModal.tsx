"use client";

import React, { useEffect, useState } from "react";
import ServerBannerStrip from "@/components/ServerBannerStrip/ServerBannerStrip";
import type { ServerBannerFields } from "@/lib/server-banner";
import styles from "./ApplyToJoinQuestionsModal.module.css";
import { useLanguage, localeTagForLanguage } from "@/component/language-provider";

export type ApplyJoinQuestion = {
  id: string;
  title: string;
  type: "short" | "paragraph" | "multiple_choice";
  required: boolean;
  options?: string[];
};

type ServerCard = {
  name: string;
  avatarUrl?: string | null;
  memberCount?: number;
  createdAt?: string;
} & ServerBannerFields;

type Props = {
  open: boolean;
  onClose: () => void;
  server: ServerCard;
  questions: ApplyJoinQuestion[];
  submitting?: boolean;
  error?: string | null;
  onSubmit: (answers: Record<string, { text?: string; selectedOption?: string }>) => void | Promise<void>;
};

export default function ApplyToJoinQuestionsModal({
  open,
  onClose,
  server,
  questions,
  submitting = false,
  error,
  onSubmit,
}: Props) {
  const { t, language } = useLanguage();
  const [answers, setAnswers] = useState<Record<string, { text?: string; selectedOption?: string }>>({});

  useEffect(() => {
    if (open) setAnswers({});
  }, [open, questions]);

  if (!open) return null;

  const hasAvatar =
    typeof server.avatarUrl === "string" &&
    (server.avatarUrl.startsWith("http://") ||
      server.avatarUrl.startsWith("https://") ||
      server.avatarUrl.startsWith("/"));

  const established =
    server.createdAt != null && server.createdAt !== ""
      ? new Date(server.createdAt).toLocaleDateString(localeTagForLanguage(language), {
          month: "numeric",
          year: "numeric",
        })
      : "";

  const handleSubmit = () => {
    void onSubmit(answers);
  };

  return (
    <div
      role="dialog"
      aria-modal
      aria-label={t("chat.popups.applyToJoin.ariaLabel")}
      className={styles.overlay}
      onClick={() => {
        if (submitting) return;
        onClose();
      }}
    >
      <div className={styles.card} onClick={(e) => e.stopPropagation()}>
        <ServerBannerStrip server={server} height={72} className={styles.cardBanner} />
        <div className={styles.cardMain}>
        <div className={styles.left}>
          <div
            className={styles.avatar}
            style={
              hasAvatar && server.avatarUrl
                ? { backgroundImage: `url(${server.avatarUrl})` }
                : undefined
            }
          >
            {!hasAvatar && (server.name?.charAt(0)?.toUpperCase() ?? "S")}
          </div>
          <p className={styles.serverName}>{server.name || t("chat.popups.applyToJoin.serverFallback")}</p>
          <div className={styles.memberRow}>
            <span className={styles.onlineDot} />
            <span className={styles.muted}>
              {t("chat.popups.applyToJoin.members", { count: server.memberCount ?? 0 })}
            </span>
          </div>
          {established && (
            <p className={styles.established}>
              {t("chat.popups.applyToJoin.establishedPrefix")} {established}
            </p>
          )}
        </div>

        <div className={styles.right}>
          <div className={styles.rightHeader}>
            <div>
              <h2 className={styles.title}>{t("chat.popups.applyToJoin.titleBeforeChat")}</h2>
              <p className={styles.subtitle}>{t("chat.popups.applyToJoin.subtitleSteps")}</p>
            </div>
            <button
              type="button"
              className={styles.closeBtn}
              aria-label={t("chat.popups.closeAria")}
              disabled={submitting}
              onClick={onClose}
            >
              ×
            </button>
          </div>

          <p className={styles.sectionLabel}>{t("chat.popups.applyToJoin.sectionLabel")}</p>

          {questions.length === 0 && (
            <p className={styles.emptyHint}>{t("chat.popups.applyToJoin.emptyHint")}</p>
          )}

          <div className={styles.questions}>
            {questions.map((q) => {
              const a = answers[q.id] || {};
              return (
                <div key={q.id} className={styles.qBlock}>
                  <div className={styles.qTitle}>
                    {q.title}
                    {q.required && <span className={styles.req}>*</span>}
                  </div>
                  {q.type === "multiple_choice" ? (
                    <div className={styles.choiceList}>
                      {(q.options ?? []).map((opt) => (
                        <label key={opt} className={styles.choiceRow}>
                          <input
                            type="radio"
                            name={`apply-q-${q.id}`}
                            checked={a.selectedOption === opt}
                            onChange={() =>
                              setAnswers((prev) => ({
                                ...prev,
                                [q.id]: { ...prev[q.id], selectedOption: opt },
                              }))
                            }
                          />
                          <span>{opt}</span>
                        </label>
                      ))}
                    </div>
                  ) : q.type === "paragraph" ? (
                    <textarea
                      className={styles.textarea}
                      value={a.text ?? ""}
                      onChange={(e) =>
                        setAnswers((prev) => ({
                          ...prev,
                          [q.id]: { ...prev[q.id], text: e.target.value },
                        }))
                      }
                      rows={4}
                      placeholder={t("chat.popups.applyToJoin.answerPlaceholder")}
                    />
                  ) : (
                    <input
                      type="text"
                      className={styles.input}
                      value={a.text ?? ""}
                      onChange={(e) =>
                        setAnswers((prev) => ({
                          ...prev,
                          [q.id]: { ...prev[q.id], text: e.target.value },
                        }))
                      }
                      placeholder={t("chat.popups.applyToJoin.answerPlaceholder")}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {error && <p className={styles.err}>{error}</p>}

          <div className={styles.footer}>
            <button
              type="button"
              className={styles.submitBtn}
              disabled={submitting}
              onClick={handleSubmit}
            >
              {submitting ? t("chat.popups.applyToJoin.submitting") : t("chat.popups.applyToJoin.submit")}
            </button>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
