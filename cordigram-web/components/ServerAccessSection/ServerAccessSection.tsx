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
};

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

  const [ruleContent, setRuleContent] = useState("");

  const canEdit = useMemo(() => Boolean(canManageSettings), [canManageSettings]);

  const fetchSettings = async () => {
    const s = await (serversApi as any).getServerAccessSettings(serverId);
    const settings = s as ServerAccessSettings;
    setAccessMode(settings.accessMode);
    setIsAgeRestricted(settings.isAgeRestricted);
    setHasRules(settings.hasRules);
    setRules(settings.rules || []);
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchSettings()
      .then(() => {
        if (cancelled) return;
      })
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
        <div className={styles.cardGrid}>
          <button
            type="button"
            className={`${styles.cardBtn} ${accessMode === "invite_only" ? styles.cardSelected : ""}`}
            disabled={!canEdit || saving}
            onClick={() => handleSelectAccessMode("invite_only")}
          >
            <div className={styles.cardTitle}>Invite Only</div>
            <div className={styles.cardHint}>Chỉ người có invite link mới tham gia được.</div>
          </button>

          <button
            type="button"
            className={`${styles.cardBtn} ${accessMode === "apply" ? styles.cardSelected : ""}`}
            disabled={!canEdit || saving}
            onClick={() => handleSelectAccessMode("apply")}
          >
            <div className={styles.cardTitle}>Apply to Join</div>
            <div className={styles.cardHint}>Người tham gia sẽ yêu cầu và chờ duyệt.</div>
          </button>

          <button
            type="button"
            className={`${styles.cardBtn} ${accessMode === "discoverable" ? styles.cardSelected : ""}`}
            disabled={!canEdit || saving}
            onClick={() => handleSelectAccessMode("discoverable")}
          >
            <div className={styles.cardTitle}>Discoverable</div>
            <div className={styles.cardHint}>Vào thẳng máy chủ và chat ngay (nếu không bật quy định).</div>
          </button>
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
    </div>
  );
}

