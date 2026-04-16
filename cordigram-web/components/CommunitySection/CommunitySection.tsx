"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import * as serversApi from "@/lib/servers-api";
import styles from "./CommunitySection.module.css";
import { useLanguage } from "@/component/language-provider";
import { translateChannelName } from "@/lib/system-names";

interface Props {
  serverId: string;
  canManageSettings: boolean;
  onCommunityActivated?: () => void;
}

const CREATE_FOR_ME = "__create__";

export default function CommunitySection({
  serverId,
  canManageSettings,
  onCommunityActivated,
}: Props) {
  const { t, language } = useLanguage();
  const [community, setCommunity] = useState<serversApi.CommunitySettings | null>(null);
  const [channels, setChannels] = useState<serversApi.Channel[]>([]);
  const [roles, setRoles] = useState<serversApi.Role[]>([]);
  const [safety, setSafety] = useState<serversApi.ServerSafetySettings | null>(null);
  const [loading, setLoading] = useState(true);

  const [showWizard, setShowWizard] = useState(false);
  const [step, setStep] = useState(1);
  const [discoveryEligible, setDiscoveryEligible] = useState<boolean | null>(null);

  const [rulesChannelId, setRulesChannelId] = useState<string>(CREATE_FOR_ME);
  const [updatesChannelId, setUpdatesChannelId] = useState<string>(CREATE_FOR_ME);
  const [rulesDropdownOpen, setRulesDropdownOpen] = useState(false);
  const [updatesDropdownOpen, setUpdatesDropdownOpen] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);
  const [checkContentFilter, setCheckContentFilter] = useState(false);
  const [activating, setActivating] = useState(false);

  useEffect(() => {
    Promise.all([
      serversApi.getCommunitySettings(serverId),
      serversApi.getChannels(serverId),
      serversApi.getRoles(serverId),
      serversApi.getServerSafetySettings(serverId),
      serversApi.getDiscoveryEligibility(serverId),
    ])
      .then(([c, ch, r, s, de]) => {
        setCommunity(c);
        setChannels(ch);
        setRoles(r);
        setSafety(s);
        setDiscoveryEligible(de.eligible);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [serverId]);

  const step1Ready = checkEmail && checkContentFilter;

  const everyoneRole = useMemo(
    () => roles.find((r) => r.isDefault),
    [roles],
  );

  const disabledPerms = useMemo(() => {
    if (!everyoneRole) return [];
    const p = everyoneRole.permissions;
    const disabled: string[] = [];
    if (!p.manageEvents) disabled.push(t("chat.community.permCreateEvent"));
    if (!p.mentionEveryone) disabled.push(t("chat.community.permMentionEveryone"));
    if (!p.addReactions) disabled.push(t("chat.community.permAddReactions"));
    if (!p.createPolls) disabled.push(t("chat.community.permCreatePolls"));
    return disabled;
  }, [everyoneRole, t]);

  const dangerousPerms = useMemo(() => [
    t("chat.community.permCreateEmoji"),
    t("chat.community.permCreateEvent"),
    t("chat.community.permMentionEveryoneHere"),
  ], [t]);

  const handleActivate = async () => {
    setActivating(true);
    try {
      const body: Parameters<typeof serversApi.activateCommunity>[1] = {};
      if (rulesChannelId === CREATE_FOR_ME) {
        body.createRulesChannel = true;
      } else {
        body.rulesChannelId = rulesChannelId;
      }
      if (updatesChannelId === CREATE_FOR_ME) {
        body.createUpdatesChannel = true;
      } else {
        body.updatesChannelId = updatesChannelId;
      }
      const result = await serversApi.activateCommunity(serverId, body);
      setCommunity(result);
      setShowWizard(false);
      onCommunityActivated?.();
    } catch {
      alert(t("chat.community.activateError"));
    } finally {
      setActivating(false);
    }
  };

  const textChannels = useMemo(
    () => channels.filter((c) => c.type !== "voice"),
    [channels],
  );

  const getChannelLabel = useCallback(
    (id: string) => {
      if (id === CREATE_FOR_ME) return t("chat.community.createForMe");
      const ch = channels.find((c) => c._id === id);
      return ch ? `#${translateChannelName(ch.name, language)}` : id;
    },
    [channels, t, language],
  );

  if (loading) return <div className={styles.container}>{t("chat.community.loading")}</div>;

  if (community?.enabled) {
    return (
      <div className={styles.container}>
        <div className={styles.activatedBanner}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
          <h2 className={styles.activatedTitle}>
            {t("chat.community.activatedTitle")}
          </h2>
          <p className={styles.activatedDesc}>
            {t("chat.community.activatedDesc")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Pre-activation banner */}
      <div className={styles.banner}>
        <h1 className={styles.bannerTitle}>
          {t("chat.community.bannerTitle")}
        </h1>
        <p className={styles.bannerDesc}>
          {t("chat.community.bannerDesc")}{" "}
          <span className={styles.bannerLink}>{t("chat.community.bannerLearnMore")}</span>
        </p>
        <button
          className={styles.activateBtn}
          disabled={!canManageSettings || discoveryEligible === false}
          onClick={() => {
            setStep(1);
            setAgreed(false);
            setCheckEmail(false);
            setCheckContentFilter(false);
            setShowWizard(true);
          }}
        >
          {t("chat.community.activateBtn")}
        </button>
        {discoveryEligible === false && (
          <p style={{ color: "var(--color-panel-danger)", fontSize: 13, marginTop: 8 }}>
            {t("chat.community.notEligible")}
          </p>
        )}

        <hr className={styles.bannerDivider} />

        <p className={styles.bannerSubDesc}>
          {t("chat.community.subDesc")}{" "}
          <span className={styles.bannerLink}>{t("chat.community.subDescLink")}</span>
        </p>

        <div className={styles.featureCards}>
          <div className={styles.featureCard}>
            <div className={`${styles.featureCardIcon} ${styles.green}`}>📈</div>
            <h3 className={styles.featureCardTitle}>{t("chat.community.feature1Title")}</h3>
            <p className={styles.featureCardDesc}>
              {t("chat.community.feature1Desc").split(t("chat.community.feature1Highlight")).map((part, i, arr) =>
                i < arr.length - 1
                  ? <React.Fragment key={i}>{part}<strong>{t("chat.community.feature1Highlight")}</strong></React.Fragment>
                  : <React.Fragment key={i}>{part}</React.Fragment>
              )}
            </p>
          </div>
          <div className={styles.featureCard}>
            <div className={`${styles.featureCardIcon} ${styles.blue}`}>📊</div>
            <h3 className={styles.featureCardTitle}>{t("chat.community.feature2Title")}</h3>
            <p className={styles.featureCardDesc}>
              {t("chat.community.feature2Desc").split(t("chat.community.feature2Highlight")).map((part, i, arr) =>
                i < arr.length - 1
                  ? <React.Fragment key={i}>{part}<strong>{t("chat.community.feature2Highlight")}</strong></React.Fragment>
                  : <React.Fragment key={i}>{part}</React.Fragment>
              )}
            </p>
          </div>
          <div className={styles.featureCard}>
            <div className={`${styles.featureCardIcon} ${styles.red}`}>ℹ️</div>
            <h3 className={styles.featureCardTitle}>{t("chat.community.feature3Title")}</h3>
            <p className={styles.featureCardDesc}>{t("chat.community.feature3Desc")}</p>
          </div>
        </div>
      </div>

      {/* ── 3-step Wizard Modal ── */}
      {showWizard && (
        <div className={styles.modalOverlay} onClick={() => setShowWizard(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <button
              className={styles.modalClose}
              onClick={() => setShowWizard(false)}
            >
              ×
            </button>

            {/* Sidebar */}
            <div className={styles.wizardSidebar}>
              <div>
                <h2 className={styles.wizardSidebarTitle}>
                  {t("chat.community.wizardTitle")}
                </h2>
                <div className={styles.wizardSteps}>
                  <div className={`${styles.wizardStep} ${step === 1 ? styles.active : step > 1 ? styles.done : ""}`}>
                    <span className={styles.stepNumber}>1</span>
                    {t("chat.community.step1Label")}
                  </div>
                  <div className={`${styles.wizardStep} ${step === 2 ? styles.active : step > 2 ? styles.done : ""}`}>
                    <span className={styles.stepNumber}>2</span>
                    {t("chat.community.step2Label")}
                  </div>
                  <div className={`${styles.wizardStep} ${step === 3 ? styles.active : ""}`}>
                    <span className={styles.stepNumber}>3</span>
                    {t("chat.community.step3Label")}
                  </div>
                </div>
              </div>
              <div className={styles.wizardIllustration}>🏠</div>
            </div>

            {/* Content */}
            <div className={styles.wizardContent}>
              {/* ── STEP 1 ── */}
              {step === 1 && (
                <>
                  <div className={styles.wizardContentIcon}>{t("chat.community.step1Icon")}</div>
                  <h3 className={styles.wizardContentTitle}>
                    {t("chat.community.step1Title")}
                  </h3>
                  <p className={styles.wizardContentDesc}>
                    {t("chat.community.step1Desc")}
                  </p>

                  <div className={styles.checkSection}>
                    <h4 className={styles.checkSectionTitle}>
                      {t("chat.community.check1Title")}
                    </h4>
                    <p className={styles.checkSectionDesc}>
                      {t("chat.community.check1Desc")}
                    </p>
                    <div
                      className={styles.checkItem}
                      style={{ cursor: "pointer" }}
                      onClick={() => setCheckEmail((v) => !v)}
                    >
                      <div className={`${styles.checkIcon} ${checkEmail ? styles.checked : styles.unchecked}`}>
                        {checkEmail ? "✓" : ""}
                      </div>
                      <span className={styles.checkLabel}>
                        {t("chat.community.check1Label")}
                      </span>
                    </div>
                  </div>

                  <div className={styles.checkSection}>
                    <h4 className={styles.checkSectionTitle}>
                      {t("chat.community.check2Title")}
                    </h4>
                    <p className={styles.checkSectionDesc}>
                      {t("chat.community.check2Desc")}
                    </p>
                    <div
                      className={styles.checkItem}
                      style={{ cursor: "pointer" }}
                      onClick={() => setCheckContentFilter((v) => !v)}
                    >
                      <div className={`${styles.checkIcon} ${checkContentFilter ? styles.checked : styles.unchecked}`}>
                        {checkContentFilter ? "✓" : ""}
                      </div>
                      <span className={styles.checkLabel}>
                        {t("chat.community.check2Label")}
                      </span>
                    </div>
                  </div>

                  <div className={styles.wizardFooter}>
                    <span />
                    <button
                      className={styles.nextBtn}
                      disabled={!step1Ready}
                      onClick={() => setStep(2)}
                    >
                      {t("chat.community.nextBtn")}
                    </button>
                  </div>
                </>
              )}

              {/* ── STEP 2 ── */}
              {step === 2 && (
                <>
                  <div className={styles.wizardContentIcon}>🔧</div>
                  <h3 className={styles.wizardContentTitle}>
                    {t("chat.community.step2Title")}
                  </h3>
                  <p className={styles.wizardContentDesc}>
                    {t("chat.community.step2Desc")}
                  </p>

                  {/* Rules channel */}
                  <div className={styles.fieldGroup}>
                    <h4 className={styles.fieldLabel}>
                      {t("chat.community.rulesChannelLabel")}
                    </h4>
                    <p className={styles.fieldDesc}>
                      {t("chat.community.rulesChannelDesc")}
                    </p>
                    <div className={styles.selectWrapper}>
                      <button
                        className={styles.selectBtn}
                        onClick={() => {
                          setRulesDropdownOpen((v) => !v);
                          setUpdatesDropdownOpen(false);
                        }}
                      >
                        {getChannelLabel(rulesChannelId)}
                        <span>{rulesDropdownOpen ? "∧" : "∨"}</span>
                      </button>
                      {rulesDropdownOpen && (
                        <div className={styles.selectDropdown}>
                          <div
                            className={`${styles.selectOption} ${rulesChannelId === CREATE_FOR_ME ? styles.selected : ""}`}
                            onClick={() => { setRulesChannelId(CREATE_FOR_ME); setRulesDropdownOpen(false); }}
                          >
                            {t("chat.community.createForMe")}
                            {rulesChannelId === CREATE_FOR_ME && <span className={styles.selectOptionCheck}>✓</span>}
                          </div>
                          {textChannels.map((ch) => (
                            <div
                              key={ch._id}
                              className={`${styles.selectOption} ${rulesChannelId === ch._id ? styles.selected : ""}`}
                              onClick={() => { setRulesChannelId(ch._id); setRulesDropdownOpen(false); }}
                            >
                              #{translateChannelName(ch.name, language)}
                              {rulesChannelId === ch._id && <span className={styles.selectOptionCheck}>✓</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Updates channel */}
                  <div className={styles.fieldGroup}>
                    <h4 className={styles.fieldLabel}>
                      {t("chat.community.updatesChannelLabel")}
                    </h4>
                    <p className={styles.fieldDesc}>
                      {t("chat.community.updatesChannelDesc")}
                    </p>
                    <div className={styles.selectWrapper}>
                      <button
                        className={styles.selectBtn}
                        onClick={() => {
                          setUpdatesDropdownOpen((v) => !v);
                          setRulesDropdownOpen(false);
                        }}
                      >
                        {getChannelLabel(updatesChannelId)}
                        <span>{updatesDropdownOpen ? "∧" : "∨"}</span>
                      </button>
                      {updatesDropdownOpen && (
                        <div className={styles.selectDropdown}>
                          <div
                            className={`${styles.selectOption} ${updatesChannelId === CREATE_FOR_ME ? styles.selected : ""}`}
                            onClick={() => { setUpdatesChannelId(CREATE_FOR_ME); setUpdatesDropdownOpen(false); }}
                          >
                            {t("chat.community.createForMe")}
                            {updatesChannelId === CREATE_FOR_ME && <span className={styles.selectOptionCheck}>✓</span>}
                          </div>
                          {textChannels.map((ch) => (
                            <div
                              key={ch._id}
                              className={`${styles.selectOption} ${updatesChannelId === ch._id ? styles.selected : ""}`}
                              onClick={() => { setUpdatesChannelId(ch._id); setUpdatesDropdownOpen(false); }}
                            >
                              #{translateChannelName(ch.name, language)}
                              {updatesChannelId === ch._id && <span className={styles.selectOptionCheck}>✓</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className={styles.wizardFooter}>
                    <button className={styles.backBtn} onClick={() => setStep(1)}>
                      {t("chat.community.backBtn")}
                    </button>
                    <button className={styles.nextBtn} onClick={() => setStep(3)}>
                      {t("chat.community.nextBtn")}
                    </button>
                  </div>
                </>
              )}

              {/* ── STEP 3 ── */}
              {step === 3 && (
                <>
                  <div className={styles.wizardContentIcon}>📋</div>
                  <h3 className={styles.wizardContentTitle}>{t("chat.community.step3Title")}</h3>
                  <p className={styles.wizardContentDesc}>
                    {t("chat.community.step3Desc")}
                  </p>

                  <div className={styles.infoBlock}>
                    <h4 className={styles.infoBlockTitle}>
                      {t("chat.community.dangerPermsTitle")}
                    </h4>
                    {dangerousPerms.map((p) => (
                      <div key={p} className={styles.infoBlockItem}>• {p}</div>
                    ))}
                    <p style={{ color: "#b5bac1", fontSize: 12, marginTop: 8 }}>
                      {t("chat.community.dangerPermsNote")}
                    </p>
                  </div>

                  <div className={styles.infoBlock}>
                    <h4 className={styles.infoBlockTitle}>
                      {t("chat.community.disabledPermsTitle")}
                    </h4>
                    {disabledPerms.length > 0 ? (
                      disabledPerms.map((p) => (
                        <div key={p} className={styles.infoBlockItem}>• {p}</div>
                      ))
                    ) : (
                      <div className={styles.infoBlockItem}>
                        {t("chat.community.allPermsEnabled")}
                      </div>
                    )}
                  </div>

                  <div className={styles.agreeRow}>
                    <div
                      className={`${styles.radioBox} ${agreed ? styles.checked : ""}`}
                      onClick={() => setAgreed((v) => !v)}
                    >
                      {agreed && <div className={styles.radioBoxInner} />}
                    </div>
                    <span className={styles.agreeLabel}>
                      {t("chat.community.agreeLabel")}
                    </span>
                  </div>

                  <div className={styles.wizardFooter}>
                    <button className={styles.backBtn} onClick={() => setStep(2)}>
                      {t("chat.community.backBtn")}
                    </button>
                    <button
                      className={styles.nextBtn}
                      disabled={!agreed || activating}
                      onClick={handleActivate}
                    >
                      {activating ? t("chat.community.activating") : t("chat.community.setupDone")}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
