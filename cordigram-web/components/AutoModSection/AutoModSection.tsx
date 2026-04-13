"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import * as serversApi from "@/lib/servers-api";
import styles from "./AutoModSection.module.css";
import { useLanguage } from "@/component/language-provider";

interface Props {
  serverId: string;
  canManageSettings: boolean;
}

const DEFAULT_MSF: serversApi.MentionSpamFilter = {
  enabled: false,
  mentionLimit: 20,
  responses: { blockMessage: true, sendWarning: false, restrictMember: false },
  customNotification: "",
  blockDurationHours: 8,
  exemptRoleIds: [],
  exemptChannelIds: [],
};

export default function AutoModSection({ serverId, canManageSettings }: Props) {
  const { t } = useLanguage();
  const [settings, setSettings] = useState<serversApi.ServerSafetySettings | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [showNotifModal, setShowNotifModal] = useState(false);
  const [notifDraft, setNotifDraft] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [channels, setChannels] = useState<serversApi.Channel[]>([]);
  const [roles, setRoles] = useState<serversApi.Role[]>([]);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [draft, setDraft] = useState<serversApi.MentionSpamFilter>(DEFAULT_MSF);

  useEffect(() => {
    serversApi.getServerSafetySettings(serverId).then((s) => {
      setSettings(s);
      const loaded = s?.automod?.mentionSpamFilter;
      setDraft(loaded ? { ...DEFAULT_MSF, ...loaded } : DEFAULT_MSF);
    }).catch(() => setSettings(null));
    serversApi.getChannels(serverId).then(setChannels).catch(() => {});
    serversApi.getRoles(serverId).then(setRoles).catch(() => {});
  }, [serverId]);

  const savedMsf = useMemo<serversApi.MentionSpamFilter>(() => {
    if (!settings?.automod?.mentionSpamFilter) return DEFAULT_MSF;
    return { ...DEFAULT_MSF, ...settings.automod.mentionSpamFilter };
  }, [settings]);

  const updateDraft = useCallback((patch: Partial<serversApi.MentionSpamFilter>) => {
    setDraft((prev) => ({ ...prev, ...patch })); setDirty(true);
  }, []);

  const updateDraftResponses = useCallback((patch: Partial<serversApi.MentionSpamFilter["responses"]>) => {
    setDraft((prev) => ({ ...prev, responses: { ...prev.responses, ...patch } })); setDirty(true);
  }, []);

  const handleSave = async () => {
    if (!settings || !canManageSettings) return;
    setSaving(true);
    try {
      const next: serversApi.ServerSafetySettings = { ...settings, automod: { ...(settings.automod || {}), mentionSpamFilter: draft } };
      const saved = await serversApi.updateServerSafetySettings(serverId, next);
      setSettings(saved);
      const loaded = saved?.automod?.mentionSpamFilter;
      if (loaded) setDraft({ ...DEFAULT_MSF, ...loaded });
      setDirty(false);
    } catch { /* keep dirty */ } finally { setSaving(false); }
  };

  const handleCancel = () => { setDraft(savedMsf); setDirty(false); };

  const activeResponseTags = useMemo(() => {
    const src = dirty ? draft : savedMsf;
    const tags: Array<{ icon: string; label: string }> = [];
    if (src.responses.blockMessage) tags.push({ icon: "✕", label: t("chat.autoMod.tagBlock") });
    if (src.responses.sendWarning) tags.push({ icon: "#", label: t("chat.autoMod.tagWarn") });
    if (src.responses.restrictMember) tags.push({ icon: "👤", label: t("chat.autoMod.tagRestrict") });
    return tags;
  }, [draft, savedMsf, dirty, t]);

  const filteredChannels = useMemo(() => {
    if (!searchQuery.trim()) return channels;
    const q = searchQuery.toLowerCase();
    return channels.filter((c) => c.name.toLowerCase().includes(q));
  }, [channels, searchQuery]);

  const filteredRoles = useMemo(() => {
    if (!searchQuery.trim()) return roles.filter((r) => !r.isDefault);
    const q = searchQuery.toLowerCase();
    return roles.filter((r) => !r.isDefault && r.name.toLowerCase().includes(q));
  }, [roles, searchQuery]);

  const exemptChannelNames = useMemo(() => {
    const map = new Map(channels.map((c) => [c._id, c.name]));
    return draft.exemptChannelIds.map((id) => ({ id, name: map.get(id) || id }));
  }, [channels, draft.exemptChannelIds]);

  const exemptRoleNames = useMemo(() => {
    const map = new Map(roles.map((r) => [r._id, r.name]));
    return draft.exemptRoleIds.map((id) => ({ id, name: map.get(id) || id }));
  }, [roles, draft.exemptRoleIds]);

  const addExemptChannel = (id: string) => { if (!draft.exemptChannelIds.includes(id)) updateDraft({ exemptChannelIds: [...draft.exemptChannelIds, id] }); };
  const removeExemptChannel = (id: string) => updateDraft({ exemptChannelIds: draft.exemptChannelIds.filter((x) => x !== id) });
  const addExemptRole = (id: string) => { if (!draft.exemptRoleIds.includes(id)) updateDraft({ exemptRoleIds: [...draft.exemptRoleIds, id] }); };
  const removeExemptRole = (id: string) => updateDraft({ exemptRoleIds: draft.exemptRoleIds.filter((x) => x !== id) });

  if (!settings) return <div>{t("chat.autoMod.loadError")}</div>;

  const displayMsf = dirty ? draft : savedMsf;

  return (
    <div className={styles.container}>
      <div className={styles.summaryCard}>
        <div className={styles.summaryIcon}>@</div>
        <div className={styles.summaryBody}>
          <p className={styles.summaryTitle}>{t("chat.autoMod.spamTitle")}</p>
          <p className={styles.summaryDesc}>{t("chat.autoMod.spamDesc")}</p>
          {savedMsf.enabled && activeResponseTags.length > 0 && (
            <div className={styles.summaryTags}>
              {activeResponseTags.map((tag) => (
                <span key={tag.label} className={styles.tag}><span className={styles.tagIcon}>{tag.icon}</span>{tag.label}</span>
              ))}
            </div>
          )}
        </div>
        <button type="button" className={styles.settingsBtn} disabled={!canManageSettings} onClick={() => setExpanded((v) => !v)}>
          {t("chat.autoMod.settingsBtn")}
        </button>
      </div>

      {expanded && (
        <div className={styles.settingsPanel}>
          <p className={styles.headerLabel}>{t("chat.autoMod.ruleNameLabel")}</p>
          <div className={styles.settingsHeader}>
            <input type="text" className={styles.ruleNameInput} value={t("chat.autoMod.ruleNameValue")} readOnly />
            <div className={styles.toggleWrapper}>
              <button type="button" className={`${styles.toggleSwitch} ${draft.enabled ? styles.active : ""}`} disabled={!canManageSettings} onClick={() => updateDraft({ enabled: !draft.enabled })} aria-label={t("chat.autoMod.toggleAriaLabel")}>
                <span className={styles.toggleKnob} />
              </button>
            </div>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionNumber}>1</span>
              <h3 className={styles.sectionTitle}>{t("chat.autoMod.section1Title")}</h3>
            </div>
            <div className={styles.mentionLimitCard}>
              <div className={styles.mentionIcon}>@</div>
              <div className={styles.mentionBody}>
                <p className={styles.mentionTitle}>{t("chat.autoMod.mentionLimitTitle")}</p>
                <p className={styles.mentionDesc}>{t("chat.autoMod.mentionLimitDesc")}</p>
              </div>
              <div className={styles.counterGroup}>
                <button type="button" className={styles.counterBtn} disabled={!canManageSettings || draft.mentionLimit <= 1} onClick={() => updateDraft({ mentionLimit: Math.max(1, draft.mentionLimit - 1) })}>−</button>
                <span className={styles.counterValue}>{draft.mentionLimit}</span>
                <button type="button" className={styles.counterBtn} disabled={!canManageSettings || draft.mentionLimit >= 100} onClick={() => updateDraft({ mentionLimit: Math.min(100, draft.mentionLimit + 1) })}>+</button>
              </div>
            </div>
          </div>

          <div className={styles.arrowDown}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12l7 7 7-7" />
            </svg>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionNumber}>2</span>
              <h3 className={styles.sectionTitle}>{t("chat.autoMod.section2Title")}</h3>
            </div>
            <div className={styles.responseList}>
              <label className={styles.responseItem}>
                <div className={`${styles.responseIcon} ${styles.responseIconBlock}`}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.36 5.64a1 1 0 0 0-1.41 0L12 10.59 7.05 5.64a1 1 0 1 0-1.41 1.41L10.59 12l-4.95 4.95a1 1 0 1 0 1.41 1.41L12 13.41l4.95 4.95a1 1 0 0 0 1.41-1.41L13.41 12l4.95-4.95a1 1 0 0 0 0-1.41z" />
                  </svg>
                </div>
                <div className={styles.responseBody}>
                  <p className={styles.responseTitle}>{t("chat.autoMod.blockTitle")}</p>
                  <p className={styles.responseDesc}>
                    {t("chat.autoMod.blockDesc")}<br />
                    {t("chat.autoMod.blockDesc2")}{" "}
                    <button type="button" className={styles.editNotifLink} onClick={(e) => { e.preventDefault(); e.stopPropagation(); setNotifDraft(draft.customNotification); setShowNotifModal(true); }}>
                      {t("chat.autoMod.editNotifLink")}
                    </button>
                  </p>
                </div>
                <input type="checkbox" className={styles.responseCheckbox} checked={draft.responses.blockMessage} disabled={!canManageSettings} onChange={() => updateDraftResponses({ blockMessage: !draft.responses.blockMessage })} />
              </label>
              <label className={styles.responseItem}>
                <div className={`${styles.responseIcon} ${styles.responseIconWarn}`}><span style={{ fontWeight: 700, fontSize: 16 }}>#</span></div>
                <div className={styles.responseBody}>
                  <p className={styles.responseTitle}>{t("chat.autoMod.warnTitle")}</p>
                  <p className={styles.responseDesc}>{t("chat.autoMod.warnDesc")}</p>
                </div>
                <input type="checkbox" className={styles.responseCheckbox} checked={draft.responses.sendWarning} disabled={!canManageSettings} onChange={() => updateDraftResponses({ sendWarning: !draft.responses.sendWarning })} />
              </label>
              <label className={styles.responseItem}>
                <div className={`${styles.responseIcon} ${styles.responseIconRestrict}`}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.7 0 5-2.3 5-5s-2.3-5-5-5-5 2.3-5 5 2.3 5 5 5zm0 2c-3.3 0-10 1.7-10 5v2h20v-2c0-3.3-6.7-5-10-5z" /></svg>
                </div>
                <div className={styles.responseBody}>
                  <p className={styles.responseTitle}>{t("chat.autoMod.restrictTitle")}</p>
                  <p className={styles.responseDesc}>{t("chat.autoMod.restrictDesc")}</p>
                </div>
                <input type="checkbox" className={styles.responseCheckbox} checked={draft.responses.restrictMember} disabled={!canManageSettings} onChange={() => updateDraftResponses({ restrictMember: !draft.responses.restrictMember })} />
              </label>
            </div>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionNumber}>3</span>
              <h3 className={styles.sectionTitle}>{t("chat.autoMod.section3Title")}</h3>
            </div>
            <div className={styles.searchWrapper}>
              <input type="text" className={styles.searchInput} placeholder={t("chat.autoMod.searchPlaceholder")} value={searchQuery} disabled={!canManageSettings}
                onFocus={() => setSearchOpen(true)} onChange={(e) => { setSearchQuery(e.target.value); setSearchOpen(true); }}
                onBlur={() => setTimeout(() => setSearchOpen(false), 200)} />
              {searchOpen && (
                <div className={styles.searchDropdown}>
                  {filteredChannels.length > 0 && (
                    <>
                      <div className={styles.dropdownGroupTitle}>{t("chat.autoMod.groupChannels")}</div>
                      {filteredChannels.map((ch) => (
                        <div key={ch._id} className={styles.dropdownItem} onMouseDown={(e) => e.preventDefault()} onClick={() => { addExemptChannel(ch._id); setSearchQuery(""); setSearchOpen(false); }}>
                          <span className={styles.dropdownItemIcon}>{ch.type === "voice" ? "🔊" : "#"}</span>{ch.name}
                        </div>
                      ))}
                    </>
                  )}
                  {filteredRoles.length > 0 && (
                    <>
                      <div className={styles.dropdownGroupTitle}>{t("chat.autoMod.groupRoles")}</div>
                      {filteredRoles.map((r) => (
                        <div key={r._id} className={styles.dropdownItem} onMouseDown={(e) => e.preventDefault()} onClick={() => { addExemptRole(r._id); setSearchQuery(""); setSearchOpen(false); }}>
                          <span className={styles.dropdownItemIcon} style={{ color: r.color || undefined }}>@</span>{r.name}
                        </div>
                      ))}
                    </>
                  )}
                  {filteredChannels.length === 0 && filteredRoles.length === 0 && (
                    <div className={styles.dropdownItem} style={{ opacity: 0.5, cursor: "default" }}>{t("chat.autoMod.noResults")}</div>
                  )}
                </div>
              )}
            </div>
            <p className={styles.exemptNote}>{t("chat.autoMod.exemptNote")}</p>
            {(exemptChannelNames.length > 0 || exemptRoleNames.length > 0) && (
              <div className={styles.exemptTags}>
                {exemptChannelNames.map((c) => (
                  <span key={c.id} className={styles.exemptTag}># {c.name}<button type="button" className={styles.exemptTagRemove} onClick={() => removeExemptChannel(c.id)}>×</button></span>
                ))}
                {exemptRoleNames.map((r) => (
                  <span key={r.id} className={styles.exemptTag}>@ {r.name}<button type="button" className={styles.exemptTagRemove} onClick={() => removeExemptRole(r.id)}>×</button></span>
                ))}
              </div>
            )}
          </div>

          <div className={styles.actionBar}>
            <button type="button" className={styles.cancelBtn} disabled={!dirty || saving} onClick={handleCancel}>{t("chat.autoMod.cancelBtn")}</button>
            <button type="button" className={styles.saveBtn} disabled={!dirty || saving || !canManageSettings} onClick={handleSave}>
              {saving ? t("chat.autoMod.savingBtn") : t("chat.autoMod.saveBtn")}
            </button>
          </div>
        </div>
      )}

      {showNotifModal && (
        <div className={styles.modalOverlay} onClick={() => setShowNotifModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>{t("chat.autoMod.notifModalTitle")}</h3>
            <p className={styles.modalDesc}>{t("chat.autoMod.notifModalDesc")}</p>
            <textarea className={styles.modalTextarea} placeholder={t("chat.autoMod.notifPlaceholder")} value={notifDraft} onChange={(e) => setNotifDraft(e.target.value)} />
            <div className={styles.modalActions}>
              <button type="button" className={styles.modalCancelBtn} onClick={() => setShowNotifModal(false)}>{t("chat.autoMod.notifCancel")}</button>
              <button type="button" className={styles.modalSaveBtn} onClick={() => { updateDraft({ customNotification: notifDraft }); setShowNotifModal(false); }}>{t("chat.autoMod.notifSave")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
