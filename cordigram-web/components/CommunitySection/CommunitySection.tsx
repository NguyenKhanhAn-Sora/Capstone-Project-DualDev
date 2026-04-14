"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import * as serversApi from "@/lib/servers-api";
import styles from "./CommunitySection.module.css";

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
  const [community, setCommunity] = useState<serversApi.CommunitySettings | null>(null);
  const [channels, setChannels] = useState<serversApi.Channel[]>([]);
  const [roles, setRoles] = useState<serversApi.Role[]>([]);
  const [safety, setSafety] = useState<serversApi.ServerSafetySettings | null>(null);
  const [loading, setLoading] = useState(true);

  const [showWizard, setShowWizard] = useState(false);
  const [step, setStep] = useState(1);
  const [discoveryEligible, setDiscoveryEligible] = useState<boolean | null>(null);
  const [eligibilityChecking, setEligibilityChecking] = useState(false);

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
    if (!p.manageEvents) disabled.push("Tạo sự kiện");
    if (!p.mentionEveryone) disabled.push("Đề cập @everyone");
    if (!p.addReactions) disabled.push("Thêm biểu cảm");
    if (!p.createPolls) disabled.push("Tạo khảo sát");
    return disabled;
  }, [everyoneRole]);

  const dangerousPerms = useMemo(() => {
    const list: string[] = [];
    list.push("Tạo emoji");
    list.push("Tạo sự kiện");
    list.push("Đề cập @everyone, @here");
    return list;
  }, []);

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
      alert("Không kích hoạt được cộng đồng. Vui lòng thử lại.");
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
      if (id === CREATE_FOR_ME) return "Tạo cho tôi";
      const ch = channels.find((c) => c._id === id);
      return ch ? `#${ch.name}` : id;
    },
    [channels],
  );

  if (loading) return <div className={styles.container}>Đang tải...</div>;

  if (community?.enabled) {
    return (
      <div className={styles.container}>
        <div className={styles.activatedBanner}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
          <h2 className={styles.activatedTitle}>
            Máy Chủ Cộng Đồng đã được kích hoạt!
          </h2>
          <p className={styles.activatedDesc}>
            Cộng đồng của bạn đã sẵn sàng. Bạn có thể quản lý tổng quan cộng đồng và hướng dẫn làm quen trong các tab bên trái.
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
          Bạn đang xây dựng Cộng Đồng của mình?
        </h1>
        <p className={styles.bannerDesc}>
          Hãy chuyển đổi sang Máy Chủ Cộng Đồng để có thể sử dụng các công cụ
          quản trị bổ sung có thể giúp bạn quản lý, điều hành và phát triển máy
          chủ của mình.{" "}
          <span className={styles.bannerLink}>Tìm hiểu thêm.</span>
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
          Kích Hoạt Cộng Đồng
        </button>
        {discoveryEligible === false && (
          <p style={{ color: "var(--color-panel-danger)", fontSize: 13, marginTop: 8 }}>
            Máy chủ chưa đạt đủ điều kiện Khám Phá. Vui lòng kiểm tra điều kiện trong phần Truy cập.
          </p>
        )}

        <hr className={styles.bannerDivider} />

        <p className={styles.bannerSubDesc}>
          Máy Chủ Cộng Đồng là các không gian rộng lớn, nơi tụ tập của những
          người có cùng chung sở thích. Kích hoạt chế độ Cộng Đồng không đồng
          nghĩa với việc máy chủ của bạn sẽ hiện trên Khám Phá Máy Chủ.{" "}
          <span className={styles.bannerLink}>Tìm hiểu thêm tại đây.</span>
        </p>

        <div className={styles.featureCards}>
          <div className={styles.featureCard}>
            <div className={`${styles.featureCardIcon} ${styles.green}`}>📈</div>
            <h3 className={styles.featureCardTitle}>Phát triển cộng đồng</h3>
            <p className={styles.featureCardDesc}>
              Hãy đăng ký <strong>Khám Phá Máy Chủ</strong> để nhiều người có
              thể trực tiếp tìm máy chủ của bạn trên Cordigram.
            </p>
          </div>
          <div className={styles.featureCard}>
            <div className={`${styles.featureCardIcon} ${styles.blue}`}>📊</div>
            <h3 className={styles.featureCardTitle}>
              Duy trì mức độ tương tác của thành viên
            </h3>
            <p className={styles.featureCardDesc}>
              Có quyền sử dụng các công cụ như <strong>Thống Kê Máy Chủ</strong>{" "}
              để quản lý và duy trì sức hút của máy chủ tốt hơn.
            </p>
          </div>
          <div className={styles.featureCard}>
            <div className={`${styles.featureCardIcon} ${styles.red}`}>ℹ️</div>
            <h3 className={styles.featureCardTitle}>Liên tục cập nhật</h3>
            <p className={styles.featureCardDesc}>
              Nhận trực tiếp các cập nhật từ Cordigram về các tính năng mới dành
              cho cộng đồng.
            </p>
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
                  Hãy thiết lập Máy Chủ Cộng Đồng của bạn.
                </h2>
                <div className={styles.wizardSteps}>
                  <div className={`${styles.wizardStep} ${step === 1 ? styles.active : step > 1 ? styles.done : ""}`}>
                    <span className={styles.stepNumber}>1</span>
                    Kiểm tra tính an toàn
                  </div>
                  <div className={`${styles.wizardStep} ${step === 2 ? styles.active : step > 2 ? styles.done : ""}`}>
                    <span className={styles.stepNumber}>2</span>
                    Thiết lập các cài đặt cơ bản
                  </div>
                  <div className={`${styles.wizardStep} ${step === 3 ? styles.active : ""}`}>
                    <span className={styles.stepNumber}>3</span>
                    Hoàn thiện
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
                  <div className={styles.wizardContentIcon}>🛡️</div>
                  <h3 className={styles.wizardContentTitle}>
                    Giữ gìn sự an toàn của cộng đồng
                  </h3>
                  <p className={styles.wizardContentDesc}>
                    Để đảm bảo an toàn cho người dùng, các Máy Chủ Cộng Đồng bắt
                    buộc phải bật những cài đặt kiểm duyệt sau.
                  </p>

                  <div className={styles.checkSection}>
                    <h4 className={styles.checkSectionTitle}>
                      Cần phải xác thực email.
                    </h4>
                    <p className={styles.checkSectionDesc}>
                      Máy chủ của bạn đã đáp ứng hoặc vượt quá yêu cầu về mức xác minh.
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
                        Cần phải xác thực email.
                      </span>
                    </div>
                  </div>

                  <div className={styles.checkSection}>
                    <h4 className={styles.checkSectionTitle}>
                      Bộ Lọc Nội Dung Đa Phương Tiện Không Phù Hợp
                    </h4>
                    <p className={styles.checkSectionDesc}>
                      Cordigram sẽ tự động quét và xóa các tập tin đa phương tiện
                      có chứa nội dung độc hại được gửi đi trong máy chủ này (trừ
                      các kênh giới hạn độ tuổi).
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
                        Quét nội dung đa phương tiện của tất cả các thành viên.
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
                      Tiếp theo
                    </button>
                  </div>
                </>
              )}

              {/* ── STEP 2 ── */}
              {step === 2 && (
                <>
                  <div className={styles.wizardContentIcon}>🔧</div>
                  <h3 className={styles.wizardContentTitle}>
                    Thiết lập các cài đặt cơ bản
                  </h3>
                  <p className={styles.wizardContentDesc}>
                    Hãy cho chúng tôi biết kênh có áp dụng các quy tắc máy chủ
                    của bạn và kênh để nhận thông báo của chúng tôi!
                  </p>

                  {/* Rules channel */}
                  <div className={styles.fieldGroup}>
                    <h4 className={styles.fieldLabel}>
                      Kênh Quy Tắc Hoặc Hướng Dẫn
                    </h4>
                    <p className={styles.fieldDesc}>
                      Máy Chủ Cộng Đồng phải có bài đăng quy định máy chủ
                      và/hoặc nguyên tắc rõ ràng dành cho các thành viên. Hãy
                      chọn kênh để đăng tải nội dung này.
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
                            Tạo cho tôi
                            {rulesChannelId === CREATE_FOR_ME && <span className={styles.selectOptionCheck}>✓</span>}
                          </div>
                          {textChannels.map((ch) => (
                            <div
                              key={ch._id}
                              className={`${styles.selectOption} ${rulesChannelId === ch._id ? styles.selected : ""}`}
                              onClick={() => { setRulesChannelId(ch._id); setRulesDropdownOpen(false); }}
                            >
                              #{ch.name}
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
                      Kênh Cập Nhật Cộng Đồng
                    </h4>
                    <p className={styles.fieldDesc}>
                      Cordigram sẽ gửi các cập nhật có liên quan cho quản trị
                      viên và điều phối viên của máy chủ Cộng Đồng vào kênh này.
                      Vì một số thông tin có thể sẽ nhạy cảm nên chúng tôi
                      khuyến nghị bạn nên chọn một kênh có giới hạn vai trò.
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
                            Tạo cho tôi
                            {updatesChannelId === CREATE_FOR_ME && <span className={styles.selectOptionCheck}>✓</span>}
                          </div>
                          {textChannels.map((ch) => (
                            <div
                              key={ch._id}
                              className={`${styles.selectOption} ${updatesChannelId === ch._id ? styles.selected : ""}`}
                              onClick={() => { setUpdatesChannelId(ch._id); setUpdatesDropdownOpen(false); }}
                            >
                              #{ch.name}
                              {updatesChannelId === ch._id && <span className={styles.selectOptionCheck}>✓</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className={styles.wizardFooter}>
                    <button className={styles.backBtn} onClick={() => setStep(1)}>
                      Trở lại
                    </button>
                    <button className={styles.nextBtn} onClick={() => setStep(3)}>
                      Tiếp theo
                    </button>
                  </div>
                </>
              )}

              {/* ── STEP 3 ── */}
              {step === 3 && (
                <>
                  <div className={styles.wizardContentIcon}>📋</div>
                  <h3 className={styles.wizardContentTitle}>Hoàn thiện</h3>
                  <p className={styles.wizardContentDesc}>
                    Xem lại các thay đổi sẽ được áp dụng cho máy chủ của bạn.
                  </p>

                  <div className={styles.infoBlock}>
                    <h4 className={styles.infoBlockTitle}>
                      Đang vô hiệu các quyền hạn nguy hiểm
                    </h4>
                    {dangerousPerms.map((p) => (
                      <div key={p} className={styles.infoBlockItem}>
                        • {p}
                      </div>
                    ))}
                    <p style={{ color: "#b5bac1", fontSize: 12, marginTop: 8 }}>
                      Chủ server có thể tự thiết lập lại trong tab Quyền hạn.
                    </p>
                  </div>

                  <div className={styles.infoBlock}>
                    <h4 className={styles.infoBlockTitle}>
                      Hiện đang tắt ở @everyone
                    </h4>
                    {disabledPerms.length > 0 ? (
                      disabledPerms.map((p) => (
                        <div key={p} className={styles.infoBlockItem}>
                          • {p}
                        </div>
                      ))
                    ) : (
                      <div className={styles.infoBlockItem}>
                        Tất cả quyền hạn @everyone đều đã bật.
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
                      Tôi hiểu và đồng ý với các thay đổi trên. Tôi xác nhận
                      muốn kích hoạt chế độ Cộng Đồng cho máy chủ này.
                    </span>
                  </div>

                  <div className={styles.wizardFooter}>
                    <button className={styles.backBtn} onClick={() => setStep(2)}>
                      Trở lại
                    </button>
                    <button
                      className={styles.nextBtn}
                      disabled={!agreed || activating}
                      onClick={handleActivate}
                    >
                      {activating ? "Đang thiết lập..." : "Thiết lập hoàn thành"}
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
