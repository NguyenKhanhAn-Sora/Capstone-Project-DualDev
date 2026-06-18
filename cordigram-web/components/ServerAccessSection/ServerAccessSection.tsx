"use client";

import { appAlert, appConfirm, appPrompt } from "@/lib/app-dialog";
import React, { useEffect, useMemo, useState } from "react";
import * as serversApi from "@/lib/servers-api";
import styles from "./ServerAccessSection.module.css";
import { useLanguage } from "@/component/language-provider";

const IcoLock = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
);
const IcoEnvelope = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
  </svg>
);
const IcoGlobe = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
  </svg>
);
const IcoCheck = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);
const IcoWarn = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
);
const IcoX = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);
const IcoGear = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
);

type AccessMode = "invite_only" | "apply" | "discoverable";
type RuleRow = { id: string; content: string };
type JoinFormQuestionType = "short" | "paragraph" | "multiple_choice";
type JoinFormQuestion = { id: string; title: string; type: JoinFormQuestionType; required: boolean; options?: string[] };

/** Must match `server-discovery.constants` on backend. */
const DISCOVERY_MIN_EVALUATE = 2;
const DISCOVERY_MIN_MEMBERS = 3;
const DISCOVERY_MIN_AGE_MINUTES = 3;

function localizedDiscoveryCheck(
  check: serversApi.DiscoveryCheck,
  t: (key: string, vars?: Record<string, string | number>) => string,
): { label: string; description: string } {
  switch (check.id) {
    case "evaluate":
      if (check.passed) {
        return {
          label: t("chat.serverAccess.discoveryCheckEvaluatePassTitle"),
          description: t("chat.serverAccess.discoveryCheckEvaluatePassDesc"),
        };
      }
      return {
        label: t("chat.serverAccess.discoveryCheckEvaluateWaitTitle"),
        description: t("chat.serverAccess.discoveryCheckEvaluateWaitDesc", {
          minEvaluate: DISCOVERY_MIN_EVALUATE,
        }),
      };
    case "members":
      if (check.passed) {
        return {
          label: t("chat.serverAccess.discoveryCheckMembersPassTitle", { minMembers: DISCOVERY_MIN_MEMBERS }),
          description: t("chat.serverAccess.discoveryCheckMembersDesc", { minMembers: DISCOVERY_MIN_MEMBERS }),
        };
      }
      return {
        label: t("chat.serverAccess.discoveryCheckMembersFailTitle", { minMembers: DISCOVERY_MIN_MEMBERS }),
        description: t("chat.serverAccess.discoveryCheckMembersDesc", { minMembers: DISCOVERY_MIN_MEMBERS }),
      };
    case "age":
      if (check.passed) {
        return {
          label: t("chat.serverAccess.discoveryCheckAgePassTitle"),
          description: t("chat.serverAccess.discoveryCheckAgePassDesc", {
            minAgeMinutes: DISCOVERY_MIN_AGE_MINUTES,
          }),
        };
      }
      return {
        label: t("chat.serverAccess.discoveryCheckAgeFailTitle"),
        description: t("chat.serverAccess.discoveryCheckAgeFailDesc", {
          minAgeMinutes: DISCOVERY_MIN_AGE_MINUTES,
        }),
      };
    case "content":
      if (check.passed) {
        return {
          label: t("chat.serverAccess.discoveryCheckContentPassTitle"),
          description: t("chat.serverAccess.discoveryCheckContentPassDesc"),
        };
      }
      return {
        label: t("chat.serverAccess.discoveryCheckContentFailTitle"),
        description: t("chat.serverAccess.discoveryCheckContentFailDesc"),
      };
    default:
      return { label: check.label, description: check.description };
  }
}

type ServerAccessSettings = {
  accessMode: AccessMode;
  isAgeRestricted: boolean;
  hasRules: boolean;
  rules: RuleRow[];
  joinApplicationForm?: { enabled: boolean; questions: JoinFormQuestion[] };
};


function uid(): string { return `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }

export default function ServerAccessSection({ serverId, canManageSettings }: { serverId: string; canManageSettings: boolean }) {
  const { t } = useLanguage();

  const ruleTemplates = useMemo<string[]>(() => [
    t("chat.serverAccess.ruleTemplate1"),
    t("chat.serverAccess.ruleTemplate2"),
    t("chat.serverAccess.ruleTemplate3"),
    t("chat.serverAccess.ruleTemplate4"),
  ], [t]);

  const questionTemplates = useMemo<string[]>(() => [
    t("chat.serverAccess.questionTemplate1"),
    t("chat.serverAccess.questionTemplate2"),
    t("chat.serverAccess.questionTemplate3"),
  ], [t]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accessMode, setAccessMode] = useState<AccessMode>("discoverable");
  const [isAgeRestricted, setIsAgeRestricted] = useState(false);
  const [hasRules, setHasRules] = useState(false);
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [joinFormEnabled, setJoinFormEnabled] = useState(false);
  const [joinFormQuestions, setJoinFormQuestions] = useState<JoinFormQuestion[]>([]);
  const [ruleContent, setRuleContent] = useState("");
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<JoinFormQuestion | null>(null);
  const [showShortModal, setShowShortModal] = useState(false);
  const [showParagraphModal, setShowParagraphModal] = useState(false);
  const [showMultipleModal, setShowMultipleModal] = useState(false);
  const [showEditRuleModal, setShowEditRuleModal] = useState(false);
  const [editingRule, setEditingRule] = useState<RuleRow | null>(null);
  const [editRuleDraft, setEditRuleDraft] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftOptions, setDraftOptions] = useState<string[]>([""]);
  const [discoveryChecks, setDiscoveryChecks] = useState<serversApi.DiscoveryCheck[]>([]);
  const [discoveryEligible, setDiscoveryEligible] = useState(false);
  const [discoveryLoading, setDiscoveryLoading] = useState(false);
  const [initialAccessMode, setInitialAccessMode] = useState<AccessMode>("discoverable");
  const [initialIsAgeRestricted, setInitialIsAgeRestricted] = useState(false);
  const [initialHasRules, setInitialHasRules] = useState(false);
  const [initialJoinFormEnabled, setInitialJoinFormEnabled] = useState(false);
  const [initialJoinFormQuestions, setInitialJoinFormQuestions] = useState<JoinFormQuestion[]>([]);

  const canEdit = useMemo(() => Boolean(canManageSettings), [canManageSettings]);

  const labelType = (tp: JoinFormQuestionType): string => {
    if (tp === "paragraph") return t("chat.serverAccess.typeParagraph");
    if (tp === "multiple_choice") return t("chat.serverAccess.typeMultiple");
    return t("chat.serverAccess.typeShort");
  };

  const fetchDiscoveryEligibility = async () => {
    setDiscoveryLoading(true);
    try {
      const result = await serversApi.getDiscoveryEligibility(serverId);
      setDiscoveryChecks(result.checks); setDiscoveryEligible(result.eligible);
    } catch { setDiscoveryChecks([]); setDiscoveryEligible(false); } finally { setDiscoveryLoading(false); }
  };

  const fetchSettings = async () => {
    const s = await serversApi.getServerAccessSettings(serverId);
    const settings = s as ServerAccessSettings;
    setAccessMode(settings.accessMode); setIsAgeRestricted(settings.isAgeRestricted);
    setHasRules(settings.hasRules); setRules(settings.rules || []);
    setJoinFormEnabled(Boolean(settings.joinApplicationForm?.enabled));
    setJoinFormQuestions(settings.joinApplicationForm?.questions || []);
    setInitialAccessMode(settings.accessMode);
    setInitialIsAgeRestricted(settings.isAgeRestricted);
    setInitialHasRules(settings.hasRules);
    setInitialJoinFormEnabled(Boolean(settings.joinApplicationForm?.enabled));
    setInitialJoinFormQuestions(settings.joinApplicationForm?.questions || []);
  };

  /** Lưu Age Restricted / Server Rules nếu user đã tick nhưng chưa bấm "Lưu thay đổi" — tránh refetch làm mất chọn. */
  const persistAccessTogglesIfDirty = async () => {
    if (!canEdit) return;
    if (
      isAgeRestricted === initialIsAgeRestricted &&
      hasRules === initialHasRules
    ) {
      return;
    }
    await serversApi.updateServerAccessSettings(serverId, {
      isAgeRestricted,
      hasRules,
    });
  };

  const refreshAfterRuleMutation = async () => {
    await persistAccessTogglesIfDirty();
    await fetchSettings();
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    Promise.all([fetchSettings(), fetchDiscoveryEligibility()])
      .catch((e) => { if (cancelled) return; setError(e instanceof Error ? e.message : t("chat.serverAccess.loadError")); })
      .finally(() => { if (cancelled) return; setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId]);

  const normalizeJoinQuestions = (list: JoinFormQuestion[]): JoinFormQuestion[] =>
    list.map((q) => ({
      id: String(q.id || ""),
      title: String(q.title || "").trim(),
      type: q.type === "paragraph" || q.type === "multiple_choice" ? q.type : "short",
      required: q.required !== false,
      options:
        q.type === "multiple_choice"
          ? (q.options ?? []).map((x) => String(x || "").trim()).filter(Boolean)
          : [],
    }));

  const joinQuestionsEqual = (
    a: JoinFormQuestion[],
    b: JoinFormQuestion[],
  ): boolean => JSON.stringify(normalizeJoinQuestions(a)) === JSON.stringify(normalizeJoinQuestions(b));

  const hasUnsavedChanges =
    accessMode !== initialAccessMode ||
    isAgeRestricted !== initialIsAgeRestricted ||
    hasRules !== initialHasRules ||
    joinFormEnabled !== initialJoinFormEnabled ||
    !joinQuestionsEqual(joinFormQuestions, initialJoinFormQuestions);

  const saveAllAccessChanges = async () => {
    if (!canEdit || !hasUnsavedChanges) return;
    setSaving(true);
    setError(null);
    try {
      await serversApi.updateServerAccessSettings(serverId, {
        accessMode,
        isAgeRestricted,
        hasRules,
      });
      await serversApi.updateJoinApplicationForm(serverId, {
        enabled: joinFormEnabled,
        questions: normalizeJoinQuestions(joinFormQuestions),
      });
      await fetchSettings();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("chat.serverAccess.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const handleAddRule = async () => {
    if (!canEdit || !hasRules) return;
    const content = ruleContent.trim(); if (!content) return;
    setSaving(true); setError(null);
    try {
      await serversApi.addServerAccessRule(serverId, content);
      setRuleContent("");
      await refreshAfterRuleMutation();
    }
    catch (e) { setError(e instanceof Error ? e.message : t("chat.serverAccess.addRuleError")); }
    finally { setSaving(false); }
  };

  const defaultQuestionCount = hasRules ? 2 : 1;
  const maxQuestions = 5;
  const remainingSlots = Math.max(0, maxQuestions - defaultQuestionCount - joinFormQuestions.length);

  const ensureDefaultQuestion = async () => {
    if (!canEdit || joinFormQuestions.length > 0) return;
    const q: JoinFormQuestion = { id: uid(), title: t("chat.serverAccess.defaultQuestion"), type: "short", required: true, options: [] };
    setJoinFormQuestions([q]);
  };

  const saveJoinForm = async (_nextEnabled: boolean, _nextQuestions: JoinFormQuestion[]) => {};

  const startModalForType = (tp: JoinFormQuestionType, existing?: JoinFormQuestion | null) => {
    setShowTypePicker(false);
    setEditingQuestion(existing ?? null);
    setDraftTitle(existing?.title ?? "");
    setDraftOptions(existing?.options?.length ? [...(existing.options ?? [])] : [""]);
    setShowShortModal(tp === "short"); setShowParagraphModal(tp === "paragraph"); setShowMultipleModal(tp === "multiple_choice");
  };

  const upsertQuestion = async (q: JoinFormQuestion) => {
    const next = editingQuestion ? joinFormQuestions.map((x) => (x.id === editingQuestion.id ? q : x)) : [...joinFormQuestions, q];
    setJoinFormQuestions(next);
  };

  const addQuestionFromTemplate = async (title: string) => {
    if (remainingSlots <= 0) return;
    await upsertQuestion({ id: uid(), title, type: "short", required: true, options: [] });
  };

  const addRuleFromTemplate = async (content: string) => {
    if (!canEdit || !hasRules) return;
    setSaving(true);
    setError(null);
    try {
      await serversApi.addServerAccessRule(serverId, content);
      setRuleContent("");
      await refreshAfterRuleMutation();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("chat.serverAccess.addRuleError"));
    } finally {
      setSaving(false);
    }
  };

  const openEditRule = (r: RuleRow) => {
    setEditingRule(r);
    setEditRuleDraft(r.content);
    setShowEditRuleModal(true);
  };

  const handleSaveEditedRule = async () => {
    if (!canEdit || !editingRule) return;
    const trimmed = editRuleDraft.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    try {
      await serversApi.updateServerAccessRule(serverId, editingRule.id, trimmed);
      setShowEditRuleModal(false);
      setEditingRule(null);
      setEditRuleDraft("");
      await fetchSettings();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("chat.serverAccess.updateRuleError"));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    if (!canEdit) return;
    if (!await appConfirm(t("chat.serverAccess.ruleDeleteConfirm"))) return;
    setSaving(true);
    setError(null);
    try {
      await serversApi.deleteServerAccessRule(serverId, ruleId);
      await fetchSettings();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("chat.serverAccess.deleteRuleError"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div style={{ color: "var(--color-panel-text-muted)" }}>{t("chat.serverAccess.loading")}</div>;

  return (
    <div className={styles.root}>
      {error && <div className={styles.errorBox}>{error}</div>}

      <section className={styles.sectionHeader}>
        <h3 className={styles.title}>{t("chat.serverAccess.title")}</h3>
        <p className={styles.description}>{t("chat.serverAccess.desc")}</p>
        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            className={styles.btn}
            disabled={!canEdit || saving || !hasUnsavedChanges}
            onClick={saveAllAccessChanges}
          >
            {saving ? "Đang lưu..." : "Lưu thay đổi"}
          </button>
        </div>
      </section>

      <section>
        <div className={styles.cardGrid} style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
          <button type="button" className={`${styles.cardBtn} ${accessMode === "invite_only" ? styles.cardSelected : ""}`} disabled={!canEdit || saving} onClick={() => setAccessMode("invite_only")}>
            <div className={styles.cardIcon}><IcoLock /></div>
            <div className={styles.cardTitle}>{t("chat.serverAccess.inviteOnlyTitle")}</div>
            <div className={styles.cardHint}>{t("chat.serverAccess.inviteOnlyHint")}</div>
          </button>
          <button type="button" className={`${styles.cardBtn} ${accessMode === "apply" ? styles.cardSelected : ""}`} disabled={!canEdit || saving} onClick={() => setAccessMode("apply")}>
            <div className={styles.cardIcon}><IcoEnvelope /></div>
            <div className={styles.cardTitle}>{t("chat.serverAccess.applyTitle")}</div>
            <div className={styles.cardHint}>{t("chat.serverAccess.applyHint")}</div>
          </button>
          <button type="button" className={`${styles.cardBtn} ${accessMode === "discoverable" ? styles.cardSelected : ""}`} disabled={!canEdit || saving} onClick={() => setAccessMode("discoverable")}>
            <div className={styles.cardIcon}><IcoGlobe /></div>
            <div className={styles.cardTitle}>{t("chat.serverAccess.discoverTitle")}</div>
            <div className={styles.cardHint}>{t("chat.serverAccess.discoverHint")}</div>
          </button>
        </div>
      </section>

      <section>
        <div className={styles.discoveryPanel}>
          <div className={styles.discoveryHeader}>
            <div className={`${styles.discoveryStatusIcon} ${discoveryEligible ? styles.discoveryStatusIconPass : styles.discoveryStatusIconPending}`}>
              {discoveryEligible ? <IcoCheck /> : <IcoGear />}
            </div>
            <div className={styles.discoveryStatusText}>
              {discoveryEligible
                ? t("chat.serverAccess.discoveryMet")
                : t("chat.serverAccess.discoveryNotMet")}
            </div>
          </div>
          {discoveryLoading && <div style={{ textAlign: "center", padding: 16, color: "var(--color-panel-text-muted)" }}>{t("chat.serverAccess.checkingDiscovery")}</div>}
          {!discoveryLoading && discoveryChecks.length > 0 && (
            <div className={styles.checkList}>
              {discoveryChecks.map((check) => {
                const row = localizedDiscoveryCheck(check, t);
                return (
                <div key={check.id} className={styles.checkRow}>
                  <div className={`${styles.checkIcon} ${check.passed ? styles.checkIconPass : check.warning ? styles.checkIconWarn : styles.checkIconFail}`}>
                    {check.passed ? <IcoCheck /> : check.warning ? <IcoWarn /> : <IcoX />}
                  </div>
                  <div className={styles.checkBody}>
                    <div className={styles.checkLabel}>{row.label}</div>
                    <div className={styles.checkDesc}>{row.description}</div>
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section style={{ borderTop: "1px solid var(--color-panel-border)", paddingTop: 16 }}>
        <div className={styles.toggleGrid}>
          <div className={styles.toggleRow} onClick={() => { if (canEdit && !saving) setIsAgeRestricted((v) => !v); }} style={{ cursor: canEdit && !saving ? "pointer" : "default" }}>
            <div className={styles.toggleLabel}>
              <div className={styles.toggleTitle}>{t("chat.serverAccess.ageTitle")}</div>
              <div className={styles.toggleDesc}>{t("chat.serverAccess.ageDesc")}</div>
            </div>
            <button type="button" className={styles.togglePill} data-on={String(isAgeRestricted)} disabled={!canEdit || saving} onClick={(e) => { e.stopPropagation(); if (canEdit && !saving) setIsAgeRestricted((v) => !v); }}>
              <span className={styles.toggleThumb} />
            </button>
          </div>
          <div className={styles.toggleRow} onClick={() => { if (canEdit && !saving) setHasRules((v) => !v); }} style={{ cursor: canEdit && !saving ? "pointer" : "default" }}>
            <div className={styles.toggleLabel}>
              <div className={styles.toggleTitle}>{t("chat.serverAccess.rulesToggleTitle")}</div>
              <div className={styles.toggleDesc}>{t("chat.serverAccess.rulesToggleDesc")}</div>
            </div>
            <button type="button" className={styles.togglePill} data-on={String(hasRules)} disabled={!canEdit || saving} onClick={(e) => { e.stopPropagation(); if (canEdit && !saving) setHasRules((v) => !v); }}>
              <span className={styles.toggleThumb} />
            </button>
          </div>
        </div>
      </section>

      <section>
        <h4 className={styles.subTitle}>{t("chat.serverAccess.rulesSection")}</h4>
        <p className={styles.subDesc}>
          {hasRules ? t("chat.serverAccess.rulesEnabledDesc") : t("chat.serverAccess.rulesDisabledDesc")}
        </p>
        <div className={styles.ruleEditor} style={{ marginTop: 12 }}>
          <div className={styles.ruleInputRow}>
            <input type="text" placeholder={t("chat.serverAccess.rulesPlaceholder")} value={ruleContent} disabled={!canEdit || saving || !hasRules} onChange={(e) => setRuleContent(e.target.value)} />
            <button type="button" className={styles.btn} disabled={!canEdit || saving || !hasRules || !ruleContent.trim()} onClick={handleAddRule}>{t("chat.serverAccess.addRuleBtn")}</button>
          </div>
          <div className={styles.chipRow}>
            {ruleTemplates.map((tmpl) => (
              <button key={tmpl} type="button" className={styles.chip} disabled={!canEdit || saving || !hasRules} onClick={() => addRuleFromTemplate(tmpl)} title={t("chat.serverAccess.addRuleChipTitle")}>{tmpl}</button>
            ))}
          </div>
          <div className={styles.ruleList}>
            {rules.length === 0 ? (
              <div style={{ color: "var(--color-panel-text-muted)", fontSize: 13 }}>{t("chat.serverAccess.noRules")}</div>
            ) : rules.map((r, idx) => (
              <div key={r.id} className={styles.ruleItem}>
                <div className={styles.ruleIndex}>{idx + 1}</div>
                <div className={styles.ruleBody}>
                  <div className={styles.ruleContent}>{r.content}</div>
                  <div className={styles.ruleActions}>
                    <button
                      type="button"
                      className={styles.linkBtn}
                      disabled={!canEdit || saving}
                      onClick={() => openEditRule(r)}
                    >
                      {t("chat.serverAccess.editRule")}
                    </button>
                    <button
                      type="button"
                      className={`${styles.linkBtn} ${styles.dangerLink}`}
                      disabled={!canEdit || saving}
                      onClick={() => void handleDeleteRule(r.id)}
                    >
                      {t("chat.serverAccess.deleteRule")}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {accessMode === "apply" && (
        <section>
          <div className={styles.applyHeaderRow} onClick={async () => { if (!canEdit || saving) return; const next = !joinFormEnabled; setJoinFormEnabled(next); if (next) await ensureDefaultQuestion(); await saveJoinForm(next, joinFormQuestions); }} style={{ cursor: canEdit && !saving ? "pointer" : "default" }}>
            <div>
              <h4 className={styles.applyTitle}>{t("chat.serverAccess.joinFormTitle")}</h4>
              <p className={styles.applySubtitle}>{t("chat.serverAccess.joinFormDesc")}</p>
            </div>
            <button type="button" className={styles.togglePill} data-on={String(joinFormEnabled)} disabled={!canEdit || saving}
              onClick={async (e) => { e.stopPropagation(); if (!canEdit || saving) return; const next = !joinFormEnabled; setJoinFormEnabled(next); if (next) await ensureDefaultQuestion(); await saveJoinForm(next, joinFormQuestions); }}
              title={t("chat.serverAccess.joinFormToggleTitle")}>
              <span className={styles.toggleThumb} />
            </button>
          </div>
          {joinFormEnabled && (
            <div className={styles.applyCard}>
              <div className={styles.questionList}>
                {hasRules && (
                  <div className={styles.questionRow}>
                    <div className={styles.questionTop}>
                      <div>
                        <div className={styles.questionTitle}>{t("chat.serverAccess.agreeRulesQuestion")}</div>
                        <div className={styles.questionTypeBadge}>{t("chat.serverAccess.agreeRulesBadge")}</div>
                      </div>
                      <div className={styles.questionActions} />
                    </div>
                  </div>
                )}
                {joinFormQuestions.length > 0 && (
                  <div className={styles.questionRow}>
                    <div className={styles.questionTop}>
                      <div className={styles.questionTitle}>{joinFormQuestions[0].title}</div>
                      <div className={styles.questionActions}>
                        <button type="button" className={styles.linkBtn} disabled={!canEdit || saving} onClick={() => startModalForType(joinFormQuestions[0].type, joinFormQuestions[0])}>{t("chat.serverAccess.editQuestion")}</button>
                      </div>
                    </div>
                    <div className={styles.questionTypeBadge}>{labelType(joinFormQuestions[0].type)}</div>
                  </div>
                )}
                {joinFormQuestions.slice(1).map((q) => (
                  <div key={q.id} className={styles.questionRow}>
                    <div className={styles.questionTop}>
                      <div className={styles.questionTitle}>{q.title}</div>
                      <div className={styles.questionActions}>
                        <button type="button" className={styles.linkBtn} disabled={!canEdit || saving} onClick={() => startModalForType(q.type, q)}>{t("chat.serverAccess.editQuestion")}</button>
                        <button type="button" className={`${styles.linkBtn} ${styles.dangerLink}`} disabled={!canEdit || saving} onClick={() => { const next = joinFormQuestions.filter((x) => x.id !== q.id); setJoinFormQuestions(next); }}>{t("chat.serverAccess.deleteQuestion")}</button>
                      </div>
                    </div>
                    <div className={styles.questionTypeBadge}>{labelType(q.type)}</div>
                  </div>
                ))}
              </div>
              <div>
                <button type="button" className={styles.secondaryBtn} disabled={!canEdit || saving || remainingSlots <= 0} onClick={() => { if (!canEdit || saving || remainingSlots <= 0) return; setEditingQuestion(null); setShowTypePicker(true); }}>
                  {t("chat.serverAccess.addQuestionBtn")}
                </button>
                <div className={styles.chipRow}>
                  {questionTemplates.map((tmpl) => (
                    <button key={tmpl} type="button" className={styles.chip} disabled={!canEdit || saving || remainingSlots <= 0} onClick={() => addQuestionFromTemplate(tmpl)} title={t("chat.serverAccess.addQuestionChipTitle")}>{tmpl}</button>
                  ))}
                </div>
                <div style={{ marginTop: 8, fontSize: 12, color: "var(--color-panel-text-muted)" }}>
                  {t("chat.serverAccess.maxQuestions").replace("{max}", String(maxQuestions)).replace("{n}", String(remainingSlots))}
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {showTypePicker && (
        <div className={styles.modalOverlay} onClick={() => setShowTypePicker(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalTitleRow}>
              <h3 className={styles.modalTitle}>{t("chat.serverAccess.pickTypeTitle")}</h3>
              <button className={styles.closeBtn} onClick={() => setShowTypePicker(false)} aria-label="Close"><IcoX /></button>
            </div>
            <div className={styles.modalBody}>
              <button className={styles.secondaryBtn} onClick={() => startModalForType("short")}>{t("chat.serverAccess.typeShort")}</button>
              <button className={styles.secondaryBtn} onClick={() => startModalForType("paragraph")}>{t("chat.serverAccess.typeParagraph")}</button>
              <button className={styles.secondaryBtn} onClick={() => startModalForType("multiple_choice")}>{t("chat.serverAccess.typeMultiple")}</button>
            </div>
          </div>
        </div>
      )}

      {(showShortModal || showParagraphModal) && (
        <div className={styles.modalOverlay} onClick={() => { setShowShortModal(false); setShowParagraphModal(false); }}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalTitleRow}>
              <h3 className={styles.modalTitle}>{showShortModal ? t("chat.serverAccess.typeShort") : t("chat.serverAccess.typeParagraph")}</h3>
              <button className={styles.closeBtn} onClick={() => { setShowShortModal(false); setShowParagraphModal(false); }} aria-label="Close"><IcoX /></button>
            </div>
            <div className={styles.modalBody}>
              <input type="text" placeholder={t("chat.serverAccess.questionPlaceholder")} value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} />
            </div>
            <div className={styles.modalActions}>
              <button className={styles.secondaryBtn} onClick={() => { setShowShortModal(false); setShowParagraphModal(false); }}>{t("chat.serverAccess.modalCancel")}</button>
              <button className={styles.primaryBtn} disabled={!draftTitle.trim()}
                onClick={() => {
                  const q: JoinFormQuestion = { id: editingQuestion?.id ?? uid(), title: draftTitle.trim(), type: showShortModal ? "short" : "paragraph", required: true, options: [] };
                  void upsertQuestion(q); setShowShortModal(false); setShowParagraphModal(false);
                }}>
                {t("chat.serverAccess.modalSave")}
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditRuleModal && editingRule && (
        <div className={styles.modalOverlay} onClick={() => { if (!saving) { setShowEditRuleModal(false); setEditingRule(null); } }}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalTitleRow}>
              <h3 className={styles.modalTitle}>{t("chat.serverAccess.ruleEditTitle")}</h3>
              <button
                type="button"
                className={styles.closeBtn}
                disabled={saving}
                onClick={() => { setShowEditRuleModal(false); setEditingRule(null); }}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className={styles.modalBody}>
              <textarea
                className={styles.ruleEditTextarea}
                rows={5}
                value={editRuleDraft}
                onChange={(e) => setEditRuleDraft(e.target.value)}
                placeholder={t("chat.serverAccess.rulesPlaceholder")}
              />
            </div>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.secondaryBtn}
                disabled={saving}
                onClick={() => { setShowEditRuleModal(false); setEditingRule(null); }}
              >
                {t("chat.serverAccess.modalCancel")}
              </button>
              <button
                type="button"
                className={styles.primaryBtn}
                disabled={saving || !editRuleDraft.trim()}
                onClick={() => void handleSaveEditedRule()}
              >
                {t("chat.serverAccess.modalSave")}
              </button>
            </div>
          </div>
        </div>
      )}

      {showMultipleModal && (
        <div className={styles.modalOverlay} onClick={() => setShowMultipleModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalTitleRow}>
              <h3 className={styles.modalTitle}>{t("chat.serverAccess.typeMultiple")}</h3>
              <button className={styles.closeBtn} onClick={() => setShowMultipleModal(false)} aria-label="Close"><IcoX /></button>
            </div>
            <div className={styles.modalBody}>
              <input type="text" placeholder={t("chat.serverAccess.questionPlaceholder")} value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} />
              <div style={{ height: 1, background: "var(--color-panel-deep-border)" }} />
              {draftOptions.map((opt, idx) => (
                <div key={idx} style={{ display: "grid", gridTemplateColumns: "18px 1fr 28px", gap: 10, alignItems: "center" }}>
                  <span style={{ width: 14, height: 14, borderRadius: 999, border: "2px solid var(--color-panel-text-muted)", display: "inline-block", opacity: 0.7 }} />
                  <input type="text" placeholder={t("chat.serverAccess.optionPlaceholder").replace("{n}", String(idx + 1))} value={opt} onChange={(e) => { const next = [...draftOptions]; next[idx] = e.target.value; setDraftOptions(next); }} />
                  <button type="button" className={styles.linkBtn} onClick={() => { const next = draftOptions.filter((_, i) => i !== idx); setDraftOptions(next.length ? next : [""]); }} title={t("chat.serverAccess.removeOptionTitle")}><IcoX /></button>
                </div>
              ))}
              <button type="button" className={styles.linkBtn} onClick={() => setDraftOptions([...draftOptions, ""])}>{t("chat.serverAccess.addOption")}</button>
            </div>
            <div className={styles.modalActions}>
              <button className={styles.secondaryBtn} onClick={() => setShowMultipleModal(false)}>{t("chat.serverAccess.modalCancel")}</button>
              <button className={styles.primaryBtn} disabled={!draftTitle.trim() || draftOptions.map((x) => x.trim()).filter(Boolean).length < 1}
                onClick={() => {
                  const cleaned = draftOptions.map((x) => x.trim()).filter(Boolean);
                  const q: JoinFormQuestion = { id: editingQuestion?.id ?? uid(), title: draftTitle.trim(), type: "multiple_choice", required: true, options: cleaned };
                  void upsertQuestion(q); setShowMultipleModal(false);
                }}>
                {t("chat.serverAccess.modalSave")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
