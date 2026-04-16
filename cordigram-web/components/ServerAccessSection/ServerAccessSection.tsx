"use client";

import React, { useEffect, useMemo, useState } from "react";
import * as serversApi from "@/lib/servers-api";
import styles from "./ServerAccessSection.module.css";
import { useLanguage } from "@/component/language-provider";

type AccessMode = "invite_only" | "apply" | "discoverable";
type RuleRow = { id: string; content: string };
type JoinFormQuestionType = "short" | "paragraph" | "multiple_choice";
type JoinFormQuestion = { id: string; title: string; type: JoinFormQuestionType; required: boolean; options?: string[] };

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
  const [draftTitle, setDraftTitle] = useState("");
  const [draftOptions, setDraftOptions] = useState<string[]>([""]);
  const [discoveryChecks, setDiscoveryChecks] = useState<serversApi.DiscoveryCheck[]>([]);
  const [discoveryEligible, setDiscoveryEligible] = useState(false);
  const [discoveryLoading, setDiscoveryLoading] = useState(false);

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
    const s = await (serversApi as any).getServerAccessSettings(serverId);
    const settings = s as ServerAccessSettings;
    setAccessMode(settings.accessMode); setIsAgeRestricted(settings.isAgeRestricted);
    setHasRules(settings.hasRules); setRules(settings.rules || []);
    setJoinFormEnabled(Boolean(settings.joinApplicationForm?.enabled));
    setJoinFormQuestions(settings.joinApplicationForm?.questions || []);
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

  const commitPatch = async (patch: Partial<Omit<ServerAccessSettings, "rules">>) => {
    if (!canEdit) return; setSaving(true); setError(null);
    try { await (serversApi as any).updateServerAccessSettings(serverId, patch); await fetchSettings(); }
    catch (e) { setError(e instanceof Error ? e.message : t("chat.serverAccess.saveError")); }
    finally { setSaving(false); }
  };

  const handleAddRule = async () => {
    if (!canEdit || !hasRules) return;
    const content = ruleContent.trim(); if (!content) return;
    setSaving(true); setError(null);
    try { await (serversApi as any).addServerAccessRule(serverId, content); setRuleContent(""); await fetchSettings(); }
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
    try { await (serversApi as any).updateJoinApplicationForm(serverId, { enabled: true, questions: [q] }); await fetchSettings(); }
    catch (e) { setError(e instanceof Error ? e.message : t("chat.serverAccess.joinFormSaveError")); }
  };

  const saveJoinForm = async (nextEnabled: boolean, nextQuestions: JoinFormQuestion[]) => {
    if (!canEdit) return; setSaving(true); setError(null);
    try { await (serversApi as any).updateJoinApplicationForm(serverId, { enabled: nextEnabled, questions: nextQuestions }); await fetchSettings(); }
    catch (e) { setError(e instanceof Error ? e.message : t("chat.serverAccess.joinFormSaveError")); }
    finally { setSaving(false); }
  };

  const startModalForType = (tp: JoinFormQuestionType, existing?: JoinFormQuestion | null) => {
    setShowTypePicker(false);
    setEditingQuestion(existing ?? null);
    setDraftTitle(existing?.title ?? "");
    setDraftOptions(existing?.options?.length ? [...(existing.options ?? [])] : [""]);
    setShowShortModal(tp === "short"); setShowParagraphModal(tp === "paragraph"); setShowMultipleModal(tp === "multiple_choice");
  };

  const upsertQuestion = async (q: JoinFormQuestion) => {
    const next = editingQuestion ? joinFormQuestions.map((x) => (x.id === editingQuestion.id ? q : x)) : [...joinFormQuestions, q];
    setJoinFormQuestions(next); await saveJoinForm(true, next);
  };

  const addQuestionFromTemplate = async (title: string) => {
    if (remainingSlots <= 0) return;
    await upsertQuestion({ id: uid(), title, type: "short", required: true, options: [] });
  };

  const addRuleFromTemplate = async (content: string) => {
    setRuleContent(content);
    try { await (serversApi as any).addServerAccessRule(serverId, content); setRuleContent(""); await fetchSettings(); }
    catch (e) { setError(e instanceof Error ? e.message : t("chat.serverAccess.addRuleError")); }
  };

  if (loading) return <div style={{ color: "var(--color-panel-text-muted)" }}>{t("chat.serverAccess.loading")}</div>;

  return (
    <div className={styles.root}>
      {error && <div className={styles.errorBox}>{error}</div>}

      <section className={styles.sectionHeader}>
        <h3 className={styles.title}>{t("chat.serverAccess.title")}</h3>
        <p className={styles.description}>{t("chat.serverAccess.desc")}</p>
      </section>

      <section>
        <div className={styles.cardGrid} style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
          <button type="button" className={`${styles.cardBtn} ${accessMode === "invite_only" ? styles.cardSelected : ""}`} disabled={!canEdit || saving} onClick={() => commitPatch({ accessMode: "invite_only" }).then(() => setAccessMode("invite_only"))}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>🔒</div>
            <div className={styles.cardTitle}>{t("chat.serverAccess.inviteOnlyTitle")}</div>
            <div className={styles.cardHint}>{t("chat.serverAccess.inviteOnlyHint")}</div>
          </button>
          <button type="button" className={`${styles.cardBtn} ${accessMode === "apply" ? styles.cardSelected : ""}`} disabled={!canEdit || saving} onClick={() => commitPatch({ accessMode: "apply" }).then(() => setAccessMode("apply"))}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>✉️</div>
            <div className={styles.cardTitle}>{t("chat.serverAccess.applyTitle")}</div>
            <div className={styles.cardHint}>{t("chat.serverAccess.applyHint")}</div>
          </button>
          <button type="button" className={`${styles.cardBtn} ${accessMode === "discoverable" ? styles.cardSelected : ""}`} disabled={!canEdit || saving} onClick={() => commitPatch({ accessMode: "discoverable" }).then(() => setAccessMode("discoverable"))}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>🌐</div>
            <div className={styles.cardTitle}>{t("chat.serverAccess.discoverTitle")}</div>
            <div className={styles.cardHint}>{t("chat.serverAccess.discoverHint")}</div>
          </button>
        </div>
      </section>

      <section style={{ borderTop: "1px solid var(--color-panel-border)", paddingTop: 20, marginTop: 4 }}>
        <div style={{ background: "var(--color-panel-deep)", border: "1px solid var(--color-panel-border)", borderRadius: 12, padding: "20px 24px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 16 }}>
            <div style={{ width: 40, height: 40, borderRadius: "50%", background: discoveryEligible ? "rgba(35,165,90,0.15)" : "rgba(88,101,242,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>
              {discoveryEligible ? "✓" : "⚙"}
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: "var(--color-panel-text)" }}>
                {discoveryEligible
                  ? t("chat.serverAccess.discoveryMet")
                  : <>{t("chat.serverAccess.discoveryNotMet").replace("không", "").trim().split(" não")[0]}<strong style={{ color: "var(--color-panel-danger)" }}>không</strong>{t("chat.serverAccess.discoveryNotMet").split("không")[1]}</>
                }
              </div>
            </div>
          </div>
          {discoveryLoading && <div style={{ textAlign: "center", padding: 16, color: "var(--color-panel-text-muted)" }}>{t("chat.serverAccess.checkingDiscovery")}</div>}
          {!discoveryLoading && discoveryChecks.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {discoveryChecks.map((check) => (
                <div key={check.id} style={{ display: "flex", gap: 14, alignItems: "flex-start", padding: "14px 0", borderTop: "1px solid var(--color-panel-border)" }}>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800,
                    background: check.passed ? "rgba(35,165,90,0.15)" : check.warning ? "rgba(254,231,92,0.15)" : "rgba(242,63,67,0.15)",
                    color: check.passed ? "var(--color-panel-success)" : check.warning ? "var(--color-panel-warning)" : "var(--color-panel-danger)" }}>
                    {check.passed ? "✓" : check.warning ? "!" : "✕"}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "var(--color-panel-text)" }}>{check.label}</div>
                    <div style={{ fontSize: 13, color: "var(--color-panel-text-muted)", marginTop: 2, lineHeight: 1.45 }}>{check.description}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section style={{ borderTop: "1px solid var(--color-panel-border)", paddingTop: 16 }}>
        <div className={styles.toggleGrid}>
          <label className={styles.toggleRow}>
            <div className={styles.toggleLabel}>
              <div className={styles.toggleTitle}>{t("chat.serverAccess.ageTitle")}</div>
              <div className={styles.toggleDesc}>{t("chat.serverAccess.ageDesc")}</div>
            </div>
            <input className={styles.toggleInput} type="checkbox" checked={isAgeRestricted} disabled={!canEdit || saving} onChange={(e) => { setIsAgeRestricted(e.target.checked); commitPatch({ isAgeRestricted: e.target.checked }); }} />
          </label>
          <label className={styles.toggleRow}>
            <div className={styles.toggleLabel}>
              <div className={styles.toggleTitle}>{t("chat.serverAccess.rulesToggleTitle")}</div>
              <div className={styles.toggleDesc}>{t("chat.serverAccess.rulesToggleDesc")}</div>
            </div>
            <input className={styles.toggleInput} type="checkbox" checked={hasRules} disabled={!canEdit || saving} onChange={(e) => { setHasRules(e.target.checked); commitPatch({ hasRules: e.target.checked }); }} />
          </label>
        </div>
      </section>

      <section style={{ borderTop: "1px solid var(--color-panel-border)", paddingTop: 16 }}>
        <h4 style={{ margin: 0, fontSize: 20 }}>{t("chat.serverAccess.rulesSection")}</h4>
        <p style={{ marginTop: 4, color: "var(--color-panel-text-muted)", fontSize: 13 }}>
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
                <div className={styles.ruleContent}>{r.content}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {accessMode === "apply" && (
        <section style={{ borderTop: "1px solid var(--color-panel-border)", paddingTop: 16 }}>
          <div className={styles.applyHeaderRow}>
            <div>
              <h4 className={styles.applyTitle}>{t("chat.serverAccess.joinFormTitle")}</h4>
              <p className={styles.applySubtitle}>{t("chat.serverAccess.joinFormDesc")}</p>
            </div>
            <input className={styles.toggleInput} type="checkbox" checked={joinFormEnabled} disabled={!canEdit || saving}
              onChange={async (e) => { const next = e.target.checked; setJoinFormEnabled(next); if (next) await ensureDefaultQuestion(); await saveJoinForm(next, joinFormQuestions); }}
              title={t("chat.serverAccess.joinFormToggleTitle")} />
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
                        <button type="button" className={`${styles.linkBtn} ${styles.dangerLink}`} disabled={!canEdit || saving} onClick={() => { const next = joinFormQuestions.filter((x) => x.id !== q.id); setJoinFormQuestions(next); saveJoinForm(joinFormEnabled, next); }}>{t("chat.serverAccess.deleteQuestion")}</button>
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
              <button className={styles.closeBtn} onClick={() => setShowTypePicker(false)} aria-label="Close">×</button>
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
              <button className={styles.closeBtn} onClick={() => { setShowShortModal(false); setShowParagraphModal(false); }} aria-label="Close">×</button>
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

      {showMultipleModal && (
        <div className={styles.modalOverlay} onClick={() => setShowMultipleModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalTitleRow}>
              <h3 className={styles.modalTitle}>{t("chat.serverAccess.typeMultiple")}</h3>
              <button className={styles.closeBtn} onClick={() => setShowMultipleModal(false)} aria-label="Close">×</button>
            </div>
            <div className={styles.modalBody}>
              <input type="text" placeholder={t("chat.serverAccess.questionPlaceholder")} value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} />
              <div style={{ height: 1, background: "var(--color-panel-deep-border)" }} />
              {draftOptions.map((opt, idx) => (
                <div key={idx} style={{ display: "grid", gridTemplateColumns: "18px 1fr 28px", gap: 10, alignItems: "center" }}>
                  <span style={{ width: 14, height: 14, borderRadius: 999, border: "2px solid var(--color-panel-text-muted)", display: "inline-block", opacity: 0.7 }} />
                  <input type="text" placeholder={t("chat.serverAccess.optionPlaceholder").replace("{n}", String(idx + 1))} value={opt} onChange={(e) => { const next = [...draftOptions]; next[idx] = e.target.value; setDraftOptions(next); }} />
                  <button type="button" className={styles.linkBtn} onClick={() => { const next = draftOptions.filter((_, i) => i !== idx); setDraftOptions(next.length ? next : [""]); }} title={t("chat.serverAccess.removeOptionTitle")}>×</button>
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
