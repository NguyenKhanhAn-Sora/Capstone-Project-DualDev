"use client";

import React, { useEffect, useMemo, useState } from "react";
import * as serversApi from "@/lib/servers-api";
import styles from "./ServerAccessSection.module.css";

type AccessMode = "invite_only" | "apply" | "discoverable";

type RuleRow = {
  id: string;
  content: string;
};

type ServerAccessSettings = {
  accessMode: AccessMode;
  isAgeRestricted: boolean;
  hasRules: boolean;
  rules: RuleRow[];
  joinApplicationForm?: {
    enabled: boolean;
    questions: JoinFormQuestion[];
  };
};

type JoinFormQuestionType = "short" | "paragraph" | "multiple_choice";

type JoinFormQuestion = {
  id: string;
  title: string;
  type: JoinFormQuestionType;
  required: boolean;
  options?: string[];
};

const RULE_TEMPLATES: string[] = [
  "Lịch sự và văn minh",
  "Không spam hoặc tự quảng bá bản thân (mời tham gia máy chủ, quảng cáo, v.v) khi chưa được sự cho phép của ban quản trị máy chủ. Bao gồm cả hành vi nhắn tin trực tiếp cho các thành viên trong máy chủ.",
  "Không có hành động bạo lực hoặc nội dung phản cảm",
  "Giúp đảm bảo môi trường lành mạnh",
];

const QUESTION_TEMPLATES: string[] = [
  "Bạn có chơi trò chơi nào giống với chúng tôi không?",
  "Bạn tìm thấy chúng tôi bằng cách nào?",
  "Đâu là điểm độc nhất vô nhị của bạn?",
];

function uid(): string {
  return `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function labelType(t: JoinFormQuestionType): string {
  if (t === "paragraph") return "Đoạn";
  if (t === "multiple_choice") return "Nhiều lựa chọn";
  return "Câu Trả Lời Ngắn";
}

export default function ServerAccessSection({
  serverId,
  canManageSettings,
}: {
  serverId: string;
  canManageSettings: boolean;
}) {
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

  const fetchDiscoveryEligibility = async () => {
    setDiscoveryLoading(true);
    try {
      const result = await serversApi.getDiscoveryEligibility(serverId);
      setDiscoveryChecks(result.checks);
      setDiscoveryEligible(result.eligible);
    } catch {
      setDiscoveryChecks([]);
      setDiscoveryEligible(false);
    } finally {
      setDiscoveryLoading(false);
    }
  };

  const fetchSettings = async () => {
    const s = await (serversApi as any).getServerAccessSettings(serverId);
    const settings = s as ServerAccessSettings;
    setAccessMode(settings.accessMode);
    setIsAgeRestricted(settings.isAgeRestricted);
    setHasRules(settings.hasRules);
    setRules(settings.rules || []);
    setJoinFormEnabled(Boolean(settings.joinApplicationForm?.enabled));
    setJoinFormQuestions(settings.joinApplicationForm?.questions || []);
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([fetchSettings(), fetchDiscoveryEligibility()])
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Không tải được cài đặt truy cập");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId]);

  const commitPatch = async (patch: Partial<Omit<ServerAccessSettings, "rules">>) => {
    if (!canEdit) return;
    setSaving(true);
    setError(null);
    try {
      await (serversApi as any).updateServerAccessSettings(serverId, patch);
      await fetchSettings();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không lưu được cài đặt truy cập");
    } finally {
      setSaving(false);
    }
  };

  const handleSelectAccessMode = async (mode: AccessMode) => {
    if (mode === accessMode) return;
    if (!canEdit) return;
    setAccessMode(mode);
    await commitPatch({ accessMode: mode });
  };

  const handleToggleAgeRestricted = async (next: boolean) => {
    setIsAgeRestricted(next);
    await commitPatch({ isAgeRestricted: next });
  };

  const handleToggleHasRules = async (next: boolean) => {
    setHasRules(next);
    await commitPatch({ hasRules: next });
  };

  const handleAddRule = async () => {
    if (!canEdit) return;
    if (!hasRules) return;
    const content = ruleContent.trim();
    if (!content) return;
    setSaving(true);
    setError(null);
    try {
      await (serversApi as any).addServerAccessRule(serverId, content);
      setRuleContent("");
      await fetchSettings();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thêm được quy định");
    } finally {
      setSaving(false);
    }
  };

  const defaultQuestionCount = hasRules ? 2 : 1;
  const maxQuestions = 5;
  const remainingSlots = Math.max(0, maxQuestions - defaultQuestionCount - joinFormQuestions.length);

  const ensureDefaultQuestion = async () => {
    if (!canEdit) return;
    if (joinFormQuestions.length > 0) return;
    const q: JoinFormQuestion = {
      id: uid(),
      title: "Tại sao bạn muốn tham gia máy chủ của chúng tôi?",
      type: "short",
      required: true,
      options: [],
    };
    setJoinFormQuestions([q]);
    try {
      await (serversApi as any).updateJoinApplicationForm(serverId, {
        enabled: true,
        questions: [q],
      });
      await fetchSettings();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không lưu được đơn đăng ký tham gia");
    }
  };

  const saveJoinForm = async (nextEnabled: boolean, nextQuestions: JoinFormQuestion[]) => {
    if (!canEdit) return;
    setSaving(true);
    setError(null);
    try {
      await (serversApi as any).updateJoinApplicationForm(serverId, {
        enabled: nextEnabled,
        questions: nextQuestions,
      });
      await fetchSettings();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không lưu được đơn đăng ký tham gia");
    } finally {
      setSaving(false);
    }
  };

  const openCreateQuestionFlow = () => {
    if (!canEdit || saving) return;
    if (remainingSlots <= 0) return;
    setEditingQuestion(null);
    setShowTypePicker(true);
  };

  const startModalForType = (t: JoinFormQuestionType, existing?: JoinFormQuestion | null) => {
    setShowTypePicker(false);
    const q = existing ?? null;
    setEditingQuestion(q);
    setDraftTitle(q?.title ?? "");
    setDraftOptions(q?.options?.length ? [...(q.options ?? [])] : [""]);
    setShowShortModal(t === "short");
    setShowParagraphModal(t === "paragraph");
    setShowMultipleModal(t === "multiple_choice");
  };

  const upsertQuestion = async (q: JoinFormQuestion) => {
    const next = editingQuestion
      ? joinFormQuestions.map((x) => (x.id === editingQuestion.id ? q : x))
      : [...joinFormQuestions, q];
    setJoinFormQuestions(next);
    await saveJoinForm(true, next);
  };

  const handleDeleteQuestion = async (id: string) => {
    const next = joinFormQuestions.filter((q) => q.id !== id);
    setJoinFormQuestions(next);
    await saveJoinForm(joinFormEnabled, next);
  };

  const addQuestionFromTemplate = async (title: string) => {
    if (remainingSlots <= 0) return;
    const q: JoinFormQuestion = { id: uid(), title, type: "short", required: true, options: [] };
    await upsertQuestion(q);
  };

  const addRuleFromTemplate = async (content: string) => {
    setRuleContent(content);
    try {
      await (serversApi as any).addServerAccessRule(serverId, content);
      setRuleContent("");
      await fetchSettings();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thêm được quy định");
    }
  };

  if (loading) {
    return <div style={{ color: "var(--color-panel-text-muted)" }}>Đang tải cài đặt truy cập...</div>;
  }

  return (
    <div className={styles.root}>
      {error && <div className={styles.errorBox}>{error}</div>}

      <section className={styles.sectionHeader}>
        <h3 className={styles.title}>Truy cập</h3>
        <p className={styles.description}>
          Chọn cách thành viên tham gia và (nếu bật) yêu cầu chấp nhận quy định trước khi chat.
        </p>
      </section>

      <section>
        <div className={styles.cardGrid} style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
          <button
            type="button"
            className={`${styles.cardBtn} ${accessMode === "invite_only" ? styles.cardSelected : ""}`}
            disabled={!canEdit || saving}
            onClick={() => handleSelectAccessMode("invite_only")}
          >
            <div style={{ fontSize: 24, marginBottom: 8 }}>🔒</div>
            <div className={styles.cardTitle}>Chỉ Dành Cho Lời Mời</div>
            <div className={styles.cardHint}>Mọi người có thể tham gia máy chủ của bạn trực tiếp bằng một lời mời</div>
          </button>

          <button
            type="button"
            className={`${styles.cardBtn} ${accessMode === "apply" ? styles.cardSelected : ""}`}
            disabled={!canEdit || saving}
            onClick={() => handleSelectAccessMode("apply")}
          >
            <div style={{ fontSize: 24, marginBottom: 8 }}>✉️</div>
            <div className={styles.cardTitle}>Đăng ký tham gia</div>
            <div className={styles.cardHint}>Phải nộp đơn đăng ký và được chấp thuận mới có thể tham gia</div>
          </button>

          <button
            type="button"
            className={`${styles.cardBtn} ${accessMode === "discoverable" ? styles.cardSelected : ""}`}
            disabled={!canEdit || saving}
            onClick={() => handleSelectAccessMode("discoverable")}
          >
            <div style={{ fontSize: 24, marginBottom: 8 }}>🌐</div>
            <div className={styles.cardTitle}>Có Thể Khám Phá</div>
            <div className={styles.cardHint}>Bất kỳ ai cũng có thể trực tiếp tham gia máy chủ của bạn thông qua Khám Phá Máy Chủ</div>
          </button>
        </div>
      </section>

      <section style={{ borderTop: "1px solid var(--color-panel-border)", paddingTop: 20, marginTop: 4 }}>
        <div style={{
          background: "var(--color-panel-deep)",
          border: "1px solid var(--color-panel-border)",
          borderRadius: 12,
          padding: "20px 24px",
        }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 16 }}>
            <div style={{
              width: 40, height: 40, borderRadius: "50%",
              background: discoveryEligible ? "rgba(35,165,90,0.15)" : "rgba(88,101,242,0.15)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 20, flexShrink: 0,
            }}>
              {discoveryEligible ? "✓" : "⚙"}
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: "var(--color-panel-text)" }}>
                {discoveryEligible
                  ? "Máy chủ của bạn đã đáp ứng đủ các yêu cầu để được hiển thị trong mục Khám Phá Máy Chủ"
                  : <>Máy chủ của bạn hiện <strong style={{ color: "var(--color-panel-danger)" }}>không</strong> đáp ứng đủ các yêu cầu để được hiển thị trong mục Khám Phá Máy Chủ</>}
              </div>
            </div>
          </div>

          {discoveryLoading && (
            <div style={{ textAlign: "center", padding: 16, color: "var(--color-panel-text-muted)" }}>Đang kiểm tra...</div>
          )}

          {!discoveryLoading && discoveryChecks.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {discoveryChecks.map((check) => (
                <div
                  key={check.id}
                  style={{
                    display: "flex", gap: 14, alignItems: "flex-start",
                    padding: "14px 0",
                    borderTop: "1px solid var(--color-panel-border)",
                  }}
                >
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 14, fontWeight: 800,
                    background: check.passed
                      ? "rgba(35,165,90,0.15)" : check.warning
                        ? "rgba(254,231,92,0.15)" : "rgba(242,63,67,0.15)",
                    color: check.passed
                      ? "var(--color-panel-success)" : check.warning
                        ? "var(--color-panel-warning)" : "var(--color-panel-danger)",
                  }}>
                    {check.passed ? "✓" : check.warning ? "!" : "✕"}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "var(--color-panel-text)" }}>
                      {check.label}
                    </div>
                    <div style={{ fontSize: 13, color: "var(--color-panel-text-muted)", marginTop: 2, lineHeight: 1.45 }}>
                      {check.description}
                    </div>
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
              <div className={styles.toggleTitle}>Age Restricted</div>
              <div className={styles.toggleDesc}>Bật để chặn người dưới 18 tuổi.</div>
            </div>
            <input
              className={styles.toggleInput}
              type="checkbox"
              checked={isAgeRestricted}
              disabled={!canEdit || saving}
              onChange={(e) => handleToggleAgeRestricted(e.target.checked)}
            />
          </label>

          <label className={styles.toggleRow}>
            <div className={styles.toggleLabel}>
              <div className={styles.toggleTitle}>Server Rules</div>
              <div className={styles.toggleDesc}>Bật để yêu cầu người dùng chấp nhận quy định.</div>
            </div>
            <input
              className={styles.toggleInput}
              type="checkbox"
              checked={hasRules}
              disabled={!canEdit || saving}
              onChange={(e) => handleToggleHasRules(e.target.checked)}
            />
          </label>
        </div>
      </section>

      <section style={{ borderTop: "1px solid var(--color-panel-border)", paddingTop: 16 }}>
        <h4 style={{ margin: 0, fontSize: 20 }}>Quy định</h4>
        <p style={{ marginTop: 4, color: "var(--color-panel-text-muted)", fontSize: 13 }}>
          {hasRules ? "Thêm và quản lý quy định áp dụng cho máy chủ." : "Bật Server Rules để thêm quy định."}
        </p>

        <div className={styles.ruleEditor} style={{ marginTop: 12 }}>
          <div className={styles.ruleInputRow}>
            <input
              type="text"
              placeholder="Nhập nội dung quy định"
              value={ruleContent}
              disabled={!canEdit || saving || !hasRules}
              onChange={(e) => setRuleContent(e.target.value)}
            />
            <button
              type="button"
              className={styles.btn}
              disabled={!canEdit || saving || !hasRules || !ruleContent.trim()}
              onClick={handleAddRule}
            >
              Thêm quy định
            </button>
          </div>

          <div className={styles.chipRow}>
            {RULE_TEMPLATES.map((t) => (
              <button
                key={t}
                type="button"
                className={styles.chip}
                disabled={!canEdit || saving || !hasRules}
                onClick={() => addRuleFromTemplate(t)}
                title="Thêm quy định mẫu"
              >
                {t}
              </button>
            ))}
          </div>

          <div className={styles.ruleList}>
            {rules.length === 0 ? (
              <div style={{ color: "var(--color-panel-text-muted)", fontSize: 13 }}>
                Chưa có quy định.
              </div>
            ) : (
              rules.map((r, idx) => (
                <div key={r.id} className={styles.ruleItem}>
                  <div className={styles.ruleIndex}>{idx + 1}</div>
                  <div className={styles.ruleContent}>{r.content}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      {accessMode === "apply" && (
        <section style={{ borderTop: "1px solid var(--color-panel-border)", paddingTop: 16 }}>
          <div className={styles.applyHeaderRow}>
            <div>
              <h4 className={styles.applyTitle}>Đơn đăng ký tham gia</h4>
              <p className={styles.applySubtitle}>
                Thêm câu hỏi vào đơn đăng ký của bạn. Mọi người không thể tham gia máy chủ cho đến khi được bạn phê duyệt đơn đăng ký.
              </p>
            </div>
            <input
              className={styles.toggleInput}
              type="checkbox"
              checked={joinFormEnabled}
              disabled={!canEdit || saving}
              onChange={async (e) => {
                const next = e.target.checked;
                setJoinFormEnabled(next);
                if (next) await ensureDefaultQuestion();
                await saveJoinForm(next, joinFormQuestions.length ? joinFormQuestions : joinFormQuestions);
              }}
              title="Bật/tắt đơn đăng ký tham gia"
            />
          </div>

          {joinFormEnabled && (
            <div className={styles.applyCard}>
                <div className={styles.questionList}>
                {hasRules && (
                  <div className={styles.questionRow}>
                    <div className={styles.questionTop}>
                      <div>
                        <div className={styles.questionTitle}>Đọc và đồng ý với các Quy Định Máy Chủ</div>
                        <div className={styles.questionTypeBadge}>Quy Định Máy Chủ</div>
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
                          <button
                            type="button"
                            className={styles.linkBtn}
                            disabled={!canEdit || saving}
                            onClick={() => startModalForType(joinFormQuestions[0].type, joinFormQuestions[0])}
                          >
                            Sửa
                          </button>
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
                        <button
                          type="button"
                          className={styles.linkBtn}
                          disabled={!canEdit || saving}
                          onClick={() => startModalForType(q.type, q)}
                        >
                          Sửa
                        </button>
                        <button
                          type="button"
                          className={`${styles.linkBtn} ${styles.dangerLink}`}
                          disabled={!canEdit || saving}
                          onClick={() => handleDeleteQuestion(q.id)}
                        >
                          Xóa
                        </button>
                      </div>
                    </div>
                    <div className={styles.questionTypeBadge}>{labelType(q.type)}</div>
                  </div>
                ))}
              </div>

              <div>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  disabled={!canEdit || saving || remainingSlots <= 0}
                  onClick={openCreateQuestionFlow}
                >
                  + Thêm câu hỏi
                </button>
                <div className={styles.chipRow}>
                  {QUESTION_TEMPLATES.map((t) => (
                    <button
                      key={t}
                      type="button"
                      className={styles.chip}
                      disabled={!canEdit || saving || remainingSlots <= 0}
                      onClick={() => addQuestionFromTemplate(t)}
                      title="Thêm câu hỏi mẫu"
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <div style={{ marginTop: 8, fontSize: 12, color: "var(--color-panel-text-muted)" }}>
                  Tối đa {maxQuestions} câu hỏi. Còn lại: {remainingSlots}.
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Type picker (ảnh mẫu 3) */}
      {showTypePicker && (
        <div className={styles.modalOverlay} onClick={() => setShowTypePicker(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalTitleRow}>
              <h3 className={styles.modalTitle}>Chọn loại câu hỏi</h3>
              <button className={styles.closeBtn} onClick={() => setShowTypePicker(false)} aria-label="Close">×</button>
            </div>
            <div className={styles.modalBody}>
              <button className={styles.secondaryBtn} onClick={() => startModalForType("short")}>Câu Trả Lời Ngắn</button>
              <button className={styles.secondaryBtn} onClick={() => startModalForType("paragraph")}>Đoạn</button>
              <button className={styles.secondaryBtn} onClick={() => startModalForType("multiple_choice")}>Nhiều Lựa Chọn</button>
            </div>
          </div>
        </div>
      )}

      {/* Short modal (ảnh mẫu 4) */}
      {showShortModal && (
        <div className={styles.modalOverlay} onClick={() => setShowShortModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalTitleRow}>
              <h3 className={styles.modalTitle}>Câu Trả Lời Ngắn</h3>
              <button className={styles.closeBtn} onClick={() => setShowShortModal(false)} aria-label="Close">×</button>
            </div>
            <div className={styles.modalBody}>
              <input
                type="text"
                placeholder="Nhập câu hỏi của bạn"
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
              />
            </div>
            <div className={styles.modalActions}>
              <button className={styles.secondaryBtn} onClick={() => setShowShortModal(false)}>Hủy bỏ</button>
              <button
                className={styles.primaryBtn}
                onClick={() => {
                  const q: JoinFormQuestion = {
                    id: editingQuestion?.id ?? uid(),
                    title: draftTitle.trim(),
                    type: "short",
                    required: true,
                    options: [],
                  };
                  void upsertQuestion(q);
                  setShowShortModal(false);
                }}
                disabled={!draftTitle.trim()}
              >
                Lưu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Paragraph modal (ảnh mẫu 5) */}
      {showParagraphModal && (
        <div className={styles.modalOverlay} onClick={() => setShowParagraphModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalTitleRow}>
              <h3 className={styles.modalTitle}>Đoạn</h3>
              <button className={styles.closeBtn} onClick={() => setShowParagraphModal(false)} aria-label="Close">×</button>
            </div>
            <div className={styles.modalBody}>
              <input
                type="text"
                placeholder="Nhập câu hỏi của bạn"
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
              />
            </div>
            <div className={styles.modalActions}>
              <button className={styles.secondaryBtn} onClick={() => setShowParagraphModal(false)}>Hủy bỏ</button>
              <button
                className={styles.primaryBtn}
                onClick={() => {
                  const q: JoinFormQuestion = {
                    id: editingQuestion?.id ?? uid(),
                    title: draftTitle.trim(),
                    type: "paragraph",
                    required: true,
                    options: [],
                  };
                  void upsertQuestion(q);
                  setShowParagraphModal(false);
                }}
                disabled={!draftTitle.trim()}
              >
                Lưu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Multiple choice modal (ảnh mẫu 6) */}
      {showMultipleModal && (
        <div className={styles.modalOverlay} onClick={() => setShowMultipleModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalTitleRow}>
              <h3 className={styles.modalTitle}>Nhiều Lựa Chọn</h3>
              <button className={styles.closeBtn} onClick={() => setShowMultipleModal(false)} aria-label="Close">×</button>
            </div>
            <div className={styles.modalBody}>
              <input
                type="text"
                placeholder="Nhập câu hỏi của bạn"
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
              />
              <div style={{ height: 1, background: "var(--color-panel-deep-border)" }} />
              {draftOptions.map((opt, idx) => (
                <div key={idx} style={{ display: "grid", gridTemplateColumns: "18px 1fr 28px", gap: 10, alignItems: "center" }}>
                  <span style={{ width: 14, height: 14, borderRadius: 999, border: "2px solid var(--color-panel-text-muted)", display: "inline-block", opacity: 0.7 }} />
                  <input
                    type="text"
                    placeholder={`Tùy chọn ${idx + 1}`}
                    value={opt}
                    onChange={(e) => {
                      const next = [...draftOptions];
                      next[idx] = e.target.value;
                      setDraftOptions(next);
                    }}
                  />
                  <button
                    type="button"
                    className={styles.linkBtn}
                    onClick={() => {
                      const next = draftOptions.filter((_, i) => i !== idx);
                      setDraftOptions(next.length ? next : [""]);
                    }}
                    title="Xóa tùy chọn"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                className={styles.linkBtn}
                onClick={() => setDraftOptions([...draftOptions, ""])}
              >
                + Thêm 1 tùy chọn
              </button>
            </div>
            <div className={styles.modalActions}>
              <button className={styles.secondaryBtn} onClick={() => setShowMultipleModal(false)}>Hủy bỏ</button>
              <button
                className={styles.primaryBtn}
                onClick={() => {
                  const cleaned = draftOptions.map((x) => x.trim()).filter(Boolean);
                  const q: JoinFormQuestion = {
                    id: editingQuestion?.id ?? uid(),
                    title: draftTitle.trim(),
                    type: "multiple_choice",
                    required: true,
                    options: cleaned,
                  };
                  void upsertQuestion(q);
                  setShowMultipleModal(false);
                }}
                disabled={!draftTitle.trim() || draftOptions.map((x) => x.trim()).filter(Boolean).length < 1}
              >
                Lưu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

