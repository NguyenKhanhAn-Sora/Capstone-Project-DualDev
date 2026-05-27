"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import EmojiPicker from "emoji-picker-react";
import {
  createStripeCheckoutSession,
  getAdsCampaignDetail,
  performAdsCampaignAction,
  uploadMedia,
  uploadMediaBatch,
  type AdsCampaignDetail,
} from "@/lib/api";
import { useRequireAuth } from "@/hooks/use-require-auth";
import styles from "./campaign-detail.module.css";

const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);

const integer = (value: number) => new Intl.NumberFormat("en-US").format(value);
const pct = (value: number) => `${value.toFixed(2)}%`;
const DAY_MS = 24 * 60 * 60 * 1000;
const MEDIA_EDIT_LOCK_UNIQUE_VIEWS = 100;

const BOOST_KEYS: Array<{ id: "light" | "standard" | "strong"; price: number }> = [
  { id: "light", price: 79000 },
  { id: "standard", price: 149000 },
  { id: "strong", price: 299000 },
];

const DURATION_KEYS: Array<{ id: "none" | "d3" | "d7" | "d14" | "d30"; days: number; price: number }> = [
  { id: "none", days: 0, price: 0 },
  { id: "d3", days: 3, price: 29000 },
  { id: "d7", days: 7, price: 59000 },
  { id: "d14", days: 14, price: 99000 },
  { id: "d30", days: 30, price: 179000 },
];

const OBJECTIVE_KEYS = ["awareness", "traffic", "engagement", "leads", "sales", "messages"] as const;
const AD_FORMAT_KEYS = ["single", "carousel", "video"] as const;

const CTA_OPTIONS = [
  "Shop Now",
  "Learn More",
  "Sign Up",
  "Book Now",
  "Contact Us",
  "Get Offer",
  "Watch More",
];

const FALLBACK_COUNTRIES = [
  "United States", "United Kingdom", "Canada", "Australia", "Germany", "France",
  "Italy", "Spain", "Netherlands", "Sweden", "Norway", "Denmark", "Switzerland",
  "Japan", "South Korea", "Singapore", "India", "Indonesia", "Thailand", "Malaysia",
  "Vietnam", "Philippines", "China", "Brazil", "Mexico", "Argentina", "Chile",
  "Colombia", "South Africa", "United Arab Emirates", "Saudi Arabia", "Turkey",
  "Egypt", "New Zealand", "Ireland",
];

type BoostPackage = { id: "light" | "standard" | "strong"; title: string; level: string; price: number; highlight?: string };
type DurationPackage = { id: "none" | "d3" | "d7" | "d14" | "d30"; days: number; price: number; note: string };
type SelectOption = { value: string; label: string };

type EditDraft = {
  campaignName: string;
  objective: string;
  adFormat: string;
  primaryText: string;
  headline: string;
  adDescription: string;
  destinationUrl: string;
  cta: string;
  locationText: string;
  ageMin: string;
  ageMax: string;
  interests: string[];
  mediaUrls: string[];
};

function isVideoUrl(url: string) {
  return /\.(mp4|mov|webm|mkv)(\?|#|$)/i.test(url);
}

function resolveUniqueViews(detail: AdsCampaignDetail | null): number {
  if (!detail) return 0;
  const extended = detail as AdsCampaignDetail & {
    uniqueViews?: number;
    uniqueViewCount?: number;
    uniqueViewers?: number;
  };
  if (typeof extended.uniqueViews === "number") return extended.uniqueViews;
  if (typeof extended.uniqueViewCount === "number") return extended.uniqueViewCount;
  if (typeof extended.uniqueViewers === "number") return extended.uniqueViewers;
  if (typeof detail.reach === "number") return detail.reach;
  return detail.views;
}

function ChevronDownIcon() {
  return (
    <svg aria-hidden viewBox="0 0 20 20" fill="none">
      <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CustomSelect({
  value, options, placeholder, onChange, disabled,
}: {
  value: string;
  options: SelectOption[];
  placeholder?: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const root = rootRef.current;
      if (!root) return;
      if (root.contains(event.target as Node)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onPointerDown, true);
    document.addEventListener("touchstart", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown, true);
      document.removeEventListener("touchstart", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const selected = options.find((item) => item.value === value);

  return (
    <div className={styles.customSelect} ref={rootRef}>
      <button
        type="button"
        className={`${styles.customSelectBtn} ${open ? styles.customSelectBtnOpen : ""}`}
        onClick={() => !disabled && setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
      >
        <span className={styles.customSelectText}>{selected?.label || placeholder || "Select"}</span>
        <span className={`${styles.customSelectChevron} ${open ? styles.customSelectChevronOpen : ""}`}>
          <ChevronDownIcon />
        </span>
      </button>
      {open ? (
        <div className={styles.customSelectMenu} role="listbox">
          {options.map((item) => {
            const active = item.value === value;
            return (
              <button
                key={item.value || `empty-${item.label}`}
                type="button"
                role="option"
                aria-selected={active}
                className={`${styles.customSelectOption} ${active ? styles.customSelectOptionActive : ""}`}
                onClick={() => { onChange(item.value); setOpen(false); }}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export default function CampaignDetailPage() {
  const canRender = useRequireAuth();
  const router = useRouter();
  const params = useParams<{ campaignId: string }>();
  const campaignId = String(params?.campaignId ?? "");
  const t = useTranslations("ads");
  const tCreate = useTranslations("ads.create");

  // Build translated boost / duration packages
  const boostPackages = useMemo<BoostPackage[]>(
    () => BOOST_KEYS.map(({ id, price }) => ({
      id,
      price,
      title: tCreate(`package.boosts.${id}.title`),
      level: tCreate(`package.boosts.${id}.level`),
      highlight: tCreate(`package.boosts.${id}.highlight`),
    })),
    [tCreate],
  );

  const durationPackages = useMemo<DurationPackage[]>(
    () => DURATION_KEYS.map(({ id, days, price }) => ({
      id,
      days,
      price,
      note: tCreate(`package.durations.${id}`),
    })),
    [tCreate],
  );

  const objectiveOptions = useMemo<SelectOption[]>(
    () => [
      { value: "", label: t("detail.editModal.selectObjective") },
      ...OBJECTIVE_KEYS.map((key) => ({
        value: key,
        label: tCreate(`objective.options.${key}.label`),
      })),
    ],
    [t, tCreate],
  );

  const formatOptions = useMemo<SelectOption[]>(
    () => AD_FORMAT_KEYS.map((key) => ({
      value: key,
      label: tCreate(`creative.formatOptions.${key}`),
    })),
    [tCreate],
  );

  const ctaOptions = useMemo<SelectOption[]>(
    () => [
      { value: "", label: t("detail.editModal.selectCta") },
      ...CTA_OPTIONS.map((item) => ({ value: item, label: item })),
    ],
    [t],
  );

  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [detail, setDetail] = useState<AdsCampaignDetail | null>(null);
  const [activeMedia, setActiveMedia] = useState<{ url: string; isVideo: boolean } | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [countriesLoading, setCountriesLoading] = useState(true);
  const [countryOptions, setCountryOptions] = useState<string[]>(FALLBACK_COUNTRIES);
  const [pendingMediaUploads, setPendingMediaUploads] = useState<string[]>([]);
  const [interestDraft, setInterestDraft] = useState("");
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [selectedBoostUpgradeId, setSelectedBoostUpgradeId] = useState<BoostPackage["id"]>("standard");
  const [selectedDurationUpgradeId, setSelectedDurationUpgradeId] = useState<DurationPackage["id"]>("none");
  const [isCreatingUpgradeCheckout, setIsCreatingUpgradeCheckout] = useState(false);
  const [upgradeError, setUpgradeError] = useState("");
  const [isHideConfirmOpen, setIsHideConfirmOpen] = useState(false);
  const [isEditPrimaryEmojiOpen, setIsEditPrimaryEmojiOpen] = useState(false);
  const editMediaInputRef = useRef<HTMLInputElement | null>(null);
  const editPrimaryEmojiRef = useRef<HTMLDivElement | null>(null);
  const editPrimaryTextRef = useRef<HTMLTextAreaElement | null>(null);
  const editPrimarySelectionRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 });
  const upgradePanelRef = useRef<HTMLDivElement | null>(null);

  const buildDraftFromDetail = (item: AdsCampaignDetail): EditDraft => ({
    campaignName: item.campaignName ?? "",
    objective: item.objective ?? "",
    adFormat: item.adFormat ?? "single",
    primaryText: item.primaryText ?? "",
    headline: item.headline ?? "",
    adDescription: item.adDescription ?? "",
    destinationUrl: item.destinationUrl ?? "",
    cta: item.cta ?? "",
    locationText: item.locationText ?? "",
    ageMin: typeof item.ageMin === "number" ? String(item.ageMin) : "",
    ageMax: typeof item.ageMax === "number" ? String(item.ageMax) : "",
    interests: (item.interests ?? []).map((v) => v.trim()).filter(Boolean),
    mediaUrls: (item.mediaUrls ?? []).map((v) => v.trim()).filter(Boolean),
  });

  const normalizeDraft = (draft: EditDraft) => ({
    campaignName: draft.campaignName.trim(),
    objective: draft.objective.trim(),
    adFormat: draft.adFormat.trim(),
    primaryText: draft.primaryText.trim(),
    headline: draft.headline.trim(),
    adDescription: draft.adDescription.trim(),
    destinationUrl: draft.destinationUrl.trim(),
    cta: draft.cta.trim(),
    locationText: draft.locationText.trim(),
    ageMin: draft.ageMin.trim(),
    ageMax: draft.ageMax.trim(),
    interests: draft.interests.map((v) => v.trim()).filter(Boolean),
    mediaUrls: draft.mediaUrls.map((v) => v.trim()).filter(Boolean),
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const tk =
      window.localStorage.getItem("accessToken") ||
      window.localStorage.getItem("token") ||
      "";
    setToken(tk);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadCountries = async () => {
      try {
        setCountriesLoading(true);
        const response = await fetch("https://restcountries.com/v3.1/all?fields=name,population,region");
        if (!response.ok) throw new Error("Failed to fetch countries");
        const rows = (await response.json()) as Array<{ name?: { common?: string }; population?: number; region?: string }>;
        const list = rows
          .map((item) => ({ name: item.name?.common?.trim() ?? "", population: item.population ?? 0, region: item.region ?? "" }))
          .filter((item) => item.name && item.region !== "Antarctic")
          .sort((a, b) => b.population - a.population)
          .slice(0, 45)
          .map((item) => item.name);
        if (!cancelled && list.length > 0) {
          setCountryOptions(Array.from(new Set(list)).sort((a, b) => a.localeCompare(b, "en")));
        }
      } catch {
        if (!cancelled) setCountryOptions(FALLBACK_COUNTRIES);
      } finally {
        if (!cancelled) setCountriesLoading(false);
      }
    };
    void loadCountries();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!token || !campaignId) return;
    let cancelled = false;
    setLoading(true);
    setError("");

    getAdsCampaignDetail({ token, campaignId })
      .then((result) => {
        if (cancelled) return;
        setDetail(result);
        const initialBoost = BOOST_KEYS.some((item) => item.id === result.boostPackageId)
          ? (result.boostPackageId as BoostPackage["id"])
          : "standard";
        setSelectedBoostUpgradeId(initialBoost);
        setSelectedDurationUpgradeId("none");
        setUpgradeError("");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : t("detail.loadFailed"));
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [campaignId, token, t]);

  const statusClass = useMemo(() => {
    if (!detail) return styles.status_completed;
    if (detail.status === "active") return styles.status_active;
    if (detail.status === "hidden") return styles.status_hidden;
    if (detail.status === "paused") return styles.status_paused;
    if (detail.status === "canceled") return styles.status_canceled;
    return styles.status_completed;
  }, [detail]);

  const performance = useMemo(() => {
    if (!detail) return { elapsedDays: 0, totalDays: 0 };
    const startMs = new Date(detail.startsAt).getTime();
    const endMs = new Date(detail.expiresAt).getTime();
    const nowMs = Date.now();
    const totalDays = Math.max(1, Math.ceil((endMs - startMs) / DAY_MS));
    let elapsedDays = 0;
    if (nowMs > startMs) {
      const clampedNow = Math.min(nowMs, endMs);
      elapsedDays = Math.max(0, Math.ceil((clampedNow - startMs) / DAY_MS));
    }
    return { elapsedDays, totalDays };
  }, [detail]);

  const hasEditChanges = useMemo(() => {
    if (!detail || !editDraft) return false;
    const before = normalizeDraft(buildDraftFromDetail(detail));
    const after = normalizeDraft(editDraft);
    return JSON.stringify(before) !== JSON.stringify(after);
  }, [detail, editDraft]);

  const locationOptions = useMemo<SelectOption[]>(() => {
    const sortedCountries = [...countryOptions].sort((a, b) => a.localeCompare(b, "en"));
    const base = sortedCountries.map((name) => ({ value: name, label: name }));
    const current = editDraft?.locationText?.trim() || "";
    if (current && !base.some((item) => item.value.toLowerCase() === current.toLowerCase())) {
      base.unshift({ value: current, label: current });
    }
    return [
      { value: "", label: countriesLoading ? tCreate("audience.loadingCountries") : t("detail.editModal.selectLocation") },
      ...base,
    ];
  }, [countryOptions, countriesLoading, editDraft?.locationText, t, tCreate]);

  const isUploadingMedia = pendingMediaUploads.length > 0;
  const uniqueViews = useMemo(() => resolveUniqueViews(detail), [detail]);
  const isMediaEditLocked = uniqueViews > MEDIA_EDIT_LOCK_UNIQUE_VIEWS;

  const currentBoostPackage = useMemo(
    () => boostPackages.find((item) => item.id === detail?.boostPackageId) ?? boostPackages[1],
    [boostPackages, detail?.boostPackageId],
  );

  const selectedBoostPackage = useMemo(
    () => boostPackages.find((item) => item.id === selectedBoostUpgradeId) ?? currentBoostPackage,
    [boostPackages, selectedBoostUpgradeId, currentBoostPackage],
  );

  const selectedDurationPackage = useMemo(
    () => durationPackages.find((item) => item.id === selectedDurationUpgradeId) ?? durationPackages[0],
    [durationPackages, selectedDurationUpgradeId],
  );

  const boostUpgradeDelta = Math.max((selectedBoostPackage?.price ?? 0) - (currentBoostPackage?.price ?? 0), 0);
  const durationUpgradeCost = selectedDurationPackage?.price ?? 0;
  const upgradeTotalCost = boostUpgradeDelta + durationUpgradeCost;
  const projectedBudget = (detail?.budget ?? 0) + upgradeTotalCost;
  const hasUpgradeSelection = upgradeTotalCost > 0;

  const statusLabel = (status: AdsCampaignDetail["status"]) => t(`status.${status}`);

  const hiddenReasonLabel = (reason?: string | null) => {
    if (!reason) return t("detail.hiddenReason.visible");
    if (reason === "paused") return t("detail.hiddenReason.hiddenManually");
    if (reason === "canceled") return t("detail.hiddenReason.canceledManually");
    if (reason === "expired") return t("detail.hiddenReason.expired");
    return reason;
  };

  const startUpgradeCheckout = async () => {
    if (!token || !campaignId || !detail || !hasUpgradeSelection) return;
    setUpgradeError("");
    setIsCreatingUpgradeCheckout(true);
    try {
      const session = await createStripeCheckoutSession({
        token,
        payload: {
          actionType: "campaign_upgrade",
          targetCampaignId: campaignId,
          amount: upgradeTotalCost,
          currency: "vnd",
          campaignName: `${detail.campaignName} Upgrade`,
          description: `${currentBoostPackage.title} -> ${selectedBoostPackage.title} + ${selectedDurationPackage.days} day extension`,
          boostPackageId: selectedBoostPackage.id,
          durationPackageId: selectedDurationPackage.id,
        },
      });
      if (!session.url) {
        setUpgradeError(t("detail.upgrade.checkoutSessionFailed"));
        return;
      }
      window.location.href = session.url;
    } catch (err) {
      setUpgradeError(err instanceof Error ? err.message : t("detail.upgrade.checkoutFailed"));
    } finally {
      setIsCreatingUpgradeCheckout(false);
    }
  };

  const scrollToUpgradePanel = () => {
    upgradePanelRef.current?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
  };

  const openEditOverlay = () => {
    if (!detail) return;
    setEditDraft(buildDraftFromDetail(detail));
    setInterestDraft("");
    setEditError("");
    setIsEditOpen(true);
  };

  const closeEditOverlay = () => {
    if (editSaving) return;
    setIsEditOpen(false);
    setIsEditPrimaryEmojiOpen(false);
    setEditError("");
    setInterestDraft("");
    setPendingMediaUploads([]);
  };

  const insertEditPrimaryEmoji = (emoji: string) => {
    if (!emoji || !editDraft) return;
    const textarea = editPrimaryTextRef.current;
    const hasLiveSelection =
      textarea &&
      typeof textarea.selectionStart === "number" &&
      typeof textarea.selectionEnd === "number" &&
      document.activeElement === textarea;
    const start = hasLiveSelection ? (textarea?.selectionStart ?? 0) : editPrimarySelectionRef.current.start;
    const end = hasLiveSelection ? (textarea?.selectionEnd ?? start) : editPrimarySelectionRef.current.end;
    setEditDraft((prev) => {
      if (!prev) return prev;
      return { ...prev, primaryText: prev.primaryText.slice(0, start) + emoji + prev.primaryText.slice(end) };
    });
    const caret = start + emoji.length;
    editPrimarySelectionRef.current = { start: caret, end: caret };
    setTimeout(() => {
      const el = editPrimaryTextRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(caret, caret);
    }, 0);
  };

  const addInterest = () => {
    if (!editDraft) return;
    const next = interestDraft.trim();
    if (!next) return;
    const exists = editDraft.interests.some((item) => item.toLowerCase() === next.toLowerCase());
    if (exists) { setInterestDraft(""); return; }
    setEditDraft({ ...editDraft, interests: [...editDraft.interests, next] });
    setInterestDraft("");
  };

  const removeInterest = (interest: string) => {
    if (!editDraft) return;
    setEditDraft({ ...editDraft, interests: editDraft.interests.filter((item) => item !== interest) });
  };

  const removeMediaUrl = (url: string) => {
    if (!editDraft) return;
    if (isMediaEditLocked) {
      setEditError(t("detail.editModal.mediaLocked", { limit: MEDIA_EDIT_LOCK_UNIQUE_VIEWS }));
      return;
    }
    setEditDraft({ ...editDraft, mediaUrls: editDraft.mediaUrls.filter((item) => item !== url) });
  };

  const openEditMediaPicker = () => {
    if (isMediaEditLocked) {
      setEditError(t("detail.editModal.mediaLocked", { limit: MEDIA_EDIT_LOCK_UNIQUE_VIEWS }));
      return;
    }
    editMediaInputRef.current?.click();
  };

  const handleEditMediaUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!editDraft || files.length === 0) return;
    if (isMediaEditLocked) {
      setEditError(t("detail.editModal.mediaLocked", { limit: MEDIA_EDIT_LOCK_UNIQUE_VIEWS }));
      return;
    }
    if (!token) {
      setEditError(t("detail.editModal.loginToUpload"));
      return;
    }

    const format = editDraft.adFormat || "single";
    const isVideoFormat = format === "video";
    const validFiles = files.filter((file) =>
      isVideoFormat ? file.type.startsWith("video/") : file.type.startsWith("image/"),
    );

    if (validFiles.length === 0) {
      setEditError(isVideoFormat ? t("detail.editModal.selectVideoFile") : t("detail.editModal.selectImageFiles"));
      return;
    }

    const maxMedia = format === "carousel" ? 5 : 1;
    const remaining = Math.max(maxMedia - editDraft.mediaUrls.length, 0);
    if (remaining === 0) {
      setEditError(t("detail.editModal.mediaLimitReached"));
      return;
    }

    const filesToUpload = validFiles.slice(0, remaining);
    const pendingIds = filesToUpload.map(
      (_, index) => `pending-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
    );
    setPendingMediaUploads((prev) => [...prev, ...pendingIds]);

    try {
      setEditError("");
      const uploaded =
        filesToUpload.length === 1
          ? [await uploadMedia({ token, file: filesToUpload[0] })]
          : await uploadMediaBatch({ token, files: filesToUpload });

      const uploadedUrls = uploaded.map((item) => (item.secureUrl || item.url || "").trim()).filter(Boolean);
      setEditDraft((prev) => {
        if (!prev) return prev;
        const nextUrls = [...prev.mediaUrls, ...uploadedUrls];
        return { ...prev, mediaUrls: format === "carousel" ? nextUrls.slice(0, 5) : nextUrls.slice(0, 1) };
      });
    } catch (err) {
      setEditError(err instanceof Error ? err.message : t("detail.editModal.uploadFailed"));
    } finally {
      setPendingMediaUploads((prev) => prev.filter((id) => !pendingIds.includes(id)));
    }
  };

  const saveEditedDetails = async () => {
    if (!token || !campaignId || !detail || !editDraft || !hasEditChanges) return;
    setEditSaving(true);
    setEditError("");
    setSuccess("");
    const normalized = normalizeDraft(editDraft);
    const originalNormalized = normalizeDraft(buildDraftFromDetail(detail));
    const effectiveMediaUrls = isMediaEditLocked ? originalNormalized.mediaUrls : normalized.mediaUrls;
    try {
      const updated = await performAdsCampaignAction({
        token,
        campaignId,
        action: "update_details",
        campaignName: normalized.campaignName,
        objective: normalized.objective,
        adFormat: normalized.adFormat,
        primaryText: normalized.primaryText,
        headline: normalized.headline,
        adDescription: normalized.adDescription,
        destinationUrl: normalized.destinationUrl,
        cta: normalized.cta,
        interests: normalized.interests,
        placement: "home_feed",
        mediaUrls: effectiveMediaUrls,
      });
      setDetail(updated);
      setSuccess(t("detail.editModal.savedSuccess"));
      setIsEditOpen(false);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : t("detail.editModal.saveFailed"));
    } finally {
      setEditSaving(false);
    }
  };

  const runAction = async (action: "pause_campaign" | "resume_campaign") => {
    if (!token || !campaignId) return;
    if (action === "resume_campaign" && detail?.actions?.requiresExtendBeforeResume) {
      setError(t("detail.lifecycle.requiresExtend"));
      setUpgradeError(t("detail.lifecycle.requiresExtendHint"));
      scrollToUpgradePanel();
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const updated = await performAdsCampaignAction({ token, campaignId, action });
      setDetail(updated);
      setSuccess(action === "pause_campaign" ? t("detail.lifecycle.pauseSuccess") : t("detail.lifecycle.resumeSuccess"));
    } catch (err) {
      const message = err instanceof Error ? err.message : t("detail.lifecycle.updateFailed");
      setError(message);
      if (/expired|extend/i.test(message) && action === "resume_campaign") {
        setUpgradeError(t("detail.lifecycle.requiresExtendHint"));
        scrollToUpgradePanel();
      }
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!activeMedia) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setActiveMedia(null); };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = prevOverflow; document.removeEventListener("keydown", onKeyDown); };
  }, [activeMedia]);

  useEffect(() => {
    if (!isHideConfirmOpen) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setIsHideConfirmOpen(false); };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = prevOverflow; document.removeEventListener("keydown", onKeyDown); };
  }, [isHideConfirmOpen]);

  useEffect(() => {
    if (!isEditOpen || !isEditPrimaryEmojiOpen) return;
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (editPrimaryEmojiRef.current?.contains(target)) return;
      setIsEditPrimaryEmojiOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setIsEditPrimaryEmojiOpen(false); };
    document.addEventListener("mousedown", onPointerDown, true);
    document.addEventListener("touchstart", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown, true);
      document.removeEventListener("touchstart", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isEditOpen, isEditPrimaryEmojiOpen]);

  if (!canRender) return null;

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.topRow}>
          <button type="button" className={styles.backBtn} onClick={() => router.push("/ads/campaigns")}>
            {t("detail.backToCampaigns")}
          </button>
          {detail?.promotedPostId ? (
            <button
              type="button"
              className={styles.primaryBtn}
              style={{ marginLeft: "auto" }}
              onClick={() => router.push(`/post/${detail.promotedPostId}`)}
            >
              {t("detail.goToAds")}
            </button>
          ) : null}
        </div>

        {loading ? <p className={styles.helper}>{t("detail.loading")}</p> : null}
        {!loading && error ? <p className={styles.helper}>{error}</p> : null}

        {!loading && detail ? (
          <>
            <section className={styles.heroCard}>
              <div>
                <h1 className={styles.title}>{detail.campaignName}</h1>
                <p className={styles.subtitle}>
                  {new Date(detail.startsAt).toLocaleDateString()} - {new Date(detail.expiresAt).toLocaleDateString()}
                </p>
              </div>
              <span className={`${styles.status} ${statusClass}`}>{statusLabel(detail.status)}</span>
            </section>

            <section className={styles.metricGrid}>
              <article className={styles.metricCard}>
                <p>{t("detail.metrics.spent")}</p>
                <strong>{money(detail.spent)}</strong>
              </article>
              <article className={styles.metricCard}>
                <p>{t("detail.metrics.impressions")}</p>
                <strong>{integer(detail.impressions)}</strong>
              </article>
              <article className={styles.metricCard}>
                <p>{t("detail.metrics.clicks")}</p>
                <strong>{integer(detail.clicks)}</strong>
              </article>
              <article className={styles.metricCard}>
                <p>{t("detail.metrics.ctr")}</p>
                <strong>{pct(detail.ctr)}</strong>
              </article>
            </section>

            <section className={styles.infoCard}>
              <h2 className={styles.sectionTitle}>{t("detail.sections.performance")}</h2>
              <div className={styles.breakdownGrid}>
                <article className={styles.breakdownItem}>
                  <p>{t("detail.metrics.reach")}</p>
                  <strong>{integer(detail.reach)}</strong>
                </article>
                <article className={styles.breakdownItem}>
                  <p>{t("detail.metrics.views")}</p>
                  <strong>{integer(detail.views)}</strong>
                </article>
                <article className={styles.breakdownItem}>
                  <p>{t("detail.metrics.engagements")}</p>
                  <strong>{integer(detail.engagements)}</strong>
                </article>
                <article className={styles.breakdownItem}>
                  <p>{t("detail.metrics.engagementRate")}</p>
                  <strong>{pct(detail.engagementRate)}</strong>
                </article>
                <article className={styles.breakdownItem}>
                  <p>{t("detail.metrics.avgDwell")}</p>
                  <strong>{integer(Math.round(detail.averageDwellMs))} ms</strong>
                </article>
              </div>
            </section>

            <section className={styles.infoCard}>
              <h2 className={styles.sectionTitle}>{t("detail.sections.configuration")}</h2>
              <div className={styles.detailGrid}>
                <div className={styles.detailRow}>
                  <span>{t("detail.config.objective")}</span>
                  <strong>{detail.objective || t("detail.config.notAvailable")}</strong>
                </div>
                <div className={styles.detailRow}>
                  <span>{t("detail.config.adFormat")}</span>
                  <strong>{detail.adFormat || t("detail.config.notAvailable")}</strong>
                </div>
                <div className={styles.detailRow}>
                  <span>{t("detail.config.boostPackage")}</span>
                  <strong>
                    {boostPackages.find((item) => item.id === detail.boostPackageId)?.title ||
                      detail.boostPackageId ||
                      t("detail.config.notAvailable")}
                  </strong>
                </div>
                <div className={styles.detailRow}>
                  <span>{t("detail.config.durationDays")}</span>
                  <strong>
                    {detail.durationDays
                      ? t("detail.config.daysValue", { count: detail.durationDays })
                      : t("detail.config.notAvailable")}
                  </strong>
                </div>
                <div className={styles.detailRow}>
                  <span>{t("detail.config.deliveryStateReason")}</span>
                  <strong>{hiddenReasonLabel(detail.hiddenReason)}</strong>
                </div>
                {detail.status === "canceled" && detail.adminCancelReason?.trim() ? (
                  <div className={styles.detailRow}>
                    <span>{t("detail.config.adminCancelReason")}</span>
                    <strong>{detail.adminCancelReason.trim()}</strong>
                  </div>
                ) : null}
                <div className={styles.detailRow}>
                  <span>{t("detail.config.elapsedTotal")}</span>
                  <strong>
                    {t("detail.config.elapsedTotalValue", {
                      elapsed: performance.elapsedDays,
                      total: performance.totalDays,
                    })}
                  </strong>
                </div>
                <div className={styles.detailRow}>
                  <span>{t("detail.config.reactionsSplit")}</span>
                  <strong>
                    {t("detail.config.reactionsSplitValue", {
                      likes: integer(detail.likes),
                      comments: integer(detail.comments),
                      reposts: integer(detail.reposts),
                    })}
                  </strong>
                </div>
              </div>
            </section>

            <section className={styles.infoCard}>
              <div className={styles.sectionHeadRow}>
                <h2 className={styles.sectionTitle}>{t("detail.sections.creativeAudience")}</h2>
                <button type="button" className={styles.secondaryBtn} onClick={openEditOverlay}>
                  {t("detail.creative.edit")}
                </button>
              </div>
              <div className={styles.detailGrid}>
                <div className={styles.detailRow}>
                  <span>{t("detail.creative.primaryText")}</span>
                  <strong>{detail.primaryText?.trim() || t("detail.config.notAvailable")}</strong>
                </div>
                <div className={styles.detailRow}>
                  <span>{t("detail.creative.headline")}</span>
                  <strong>{detail.headline?.trim() || t("detail.config.notAvailable")}</strong>
                </div>
                <div className={styles.detailRow}>
                  <span>{t("detail.creative.description")}</span>
                  <strong>{detail.adDescription?.trim() || t("detail.config.notAvailable")}</strong>
                </div>
                <div className={styles.detailRow}>
                  <span>{t("detail.creative.ctaButton")}</span>
                  <strong>{detail.cta?.trim() || t("detail.config.notAvailable")}</strong>
                </div>
                <div className={styles.detailRow}>
                  <span>{t("detail.creative.destinationUrl")}</span>
                  <strong>{detail.destinationUrl?.trim() || t("detail.config.notAvailable")}</strong>
                </div>
                <div className={styles.detailRow}>
                  <span>{t("detail.creative.locationTargeting")}</span>
                  <strong>{detail.locationText?.trim() || t("detail.config.notAvailable")}</strong>
                </div>
                <div className={styles.detailRow}>
                  <span>{t("detail.creative.ageTargeting")}</span>
                  <strong>
                    {typeof detail.ageMin === "number" && typeof detail.ageMax === "number"
                      ? `${detail.ageMin} - ${detail.ageMax}`
                      : t("detail.config.notAvailable")}
                  </strong>
                </div>
                <div className={styles.detailRow}>
                  <span>{t("detail.creative.interests")}</span>
                  <strong>
                    {detail.interests && detail.interests.length > 0
                      ? detail.interests.join(" · ")
                      : t("detail.config.notAvailable")}
                  </strong>
                </div>
              </div>

              <div className={styles.mediaSection}>
                <p className={styles.mediaTitle}>{t("detail.creative.mediaTitle")}</p>
                {detail.mediaUrls && detail.mediaUrls.length > 0 ? (
                  <div className={styles.mediaGrid}>
                    {detail.mediaUrls.map((url, index) => (
                      <button
                        key={`${url}-${index}`}
                        type="button"
                        className={styles.mediaItemBtn}
                        onClick={() => setActiveMedia({ url, isVideo: isVideoUrl(url) })}
                        aria-label={`Open creative media ${index + 1}`}
                      >
                        <div className={styles.mediaItem}>
                          {isVideoUrl(url) ? (
                            <video className={styles.mediaPreview} src={url} preload="metadata" muted playsInline />
                          ) : (
                            <img className={styles.mediaPreview} src={url} alt={`Creative media ${index + 1}`} />
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className={styles.helper}>{t("detail.creative.noMedia")}</p>
                )}
              </div>
            </section>

            {/* Edit overlay */}
            {isEditOpen && editDraft ? (
              <div className={styles.editOverlay} onClick={closeEditOverlay}>
                <div className={styles.editModal} onClick={(event) => event.stopPropagation()}>
                  <div className={styles.editHead}>
                    <h3 className={styles.editTitle}>{t("detail.editModal.title")}</h3>
                    <button type="button" className={styles.editCloseBtn} onClick={closeEditOverlay} disabled={editSaving}>
                      x
                    </button>
                  </div>

                  <div className={styles.editBody}>
                    <label className={styles.editField}>
                      {t("detail.editModal.campaignName")}
                      <input
                        className={styles.input}
                        value={editDraft.campaignName}
                        onChange={(event) => setEditDraft({ ...editDraft, campaignName: event.target.value })}
                      />
                    </label>

                    <div className={styles.editTwoCols}>
                      <label className={styles.editField}>
                        {t("detail.editModal.objective")}
                        <CustomSelect
                          value={editDraft.objective}
                          options={objectiveOptions}
                          onChange={(value) => setEditDraft({ ...editDraft, objective: value })}
                          placeholder={t("detail.editModal.selectObjective")}
                        />
                      </label>

                      <label className={styles.editField}>
                        {t("detail.editModal.adFormat")}
                        <CustomSelect
                          value={editDraft.adFormat}
                          options={formatOptions}
                          onChange={(value) => {
                            setEditDraft({
                              ...editDraft,
                              adFormat: value,
                              mediaUrls: value === "carousel" ? editDraft.mediaUrls.slice(0, 5) : editDraft.mediaUrls.slice(0, 1),
                            });
                          }}
                        />
                      </label>
                    </div>

                    <div className={styles.editField}>
                      <span>{t("detail.editModal.primaryText")}</span>
                      <div className={styles.emojiRow}>
                        <div className={styles.emojiWrap} ref={editPrimaryEmojiRef}>
                          <button
                            type="button"
                            className={styles.emojiButton}
                            onClick={() => setIsEditPrimaryEmojiOpen((prev) => !prev)}
                            aria-label={tCreate("creative.addEmoji")}
                          >
                            <svg aria-label={tCreate("creative.emojiIcon")} fill="currentColor" height="20" role="img" viewBox="0 0 24 24" width="20">
                              <title>{tCreate("creative.emojiIcon")}</title>
                              <path d="M15.83 10.997a1.167 1.167 0 1 0 1.167 1.167 1.167 1.167 0 0 0-1.167-1.167Zm-6.5 1.167a1.167 1.167 0 1 0-1.166 1.167 1.167 1.167 0 0 0 1.166-1.167Zm5.163 3.24a3.406 3.406 0 0 1-4.982.007 1 1 0 1 0-1.557 1.256 5.397 5.397 0 0 0 8.09 0 1 1 0 0 0-1.55-1.263ZM12 .503a11.5 11.5 0 1 0 11.5 11.5A11.513 11.513 0 0 0 12 .503Zm0 21a9.5 9.5 0 1 1 9.5-9.5 9.51 9.51 0 0 1-9.5 9.5Z"></path>
                            </svg>
                          </button>
                          {isEditPrimaryEmojiOpen ? (
                            <div className={styles.emojiPopover}>
                              <EmojiPicker
                                onEmojiClick={(emojiData) => insertEditPrimaryEmoji(emojiData.emoji || "")}
                                autoFocusSearch={false}
                                lazyLoadEmojis
                              />
                            </div>
                          ) : null}
                        </div>
                      </div>
                      <textarea
                        ref={editPrimaryTextRef}
                        className={styles.textarea}
                        rows={4}
                        value={editDraft.primaryText}
                        onChange={(event) => {
                          const start = event.target.selectionStart ?? event.target.value.length;
                          const end = event.target.selectionEnd ?? start;
                          editPrimarySelectionRef.current = { start, end };
                          setEditDraft({ ...editDraft, primaryText: event.target.value });
                        }}
                        onSelect={(event) => {
                          const start = event.currentTarget.selectionStart ?? 0;
                          const end = event.currentTarget.selectionEnd ?? start;
                          editPrimarySelectionRef.current = { start, end };
                        }}
                        onClick={(event) => {
                          const start = event.currentTarget.selectionStart ?? 0;
                          const end = event.currentTarget.selectionEnd ?? start;
                          editPrimarySelectionRef.current = { start, end };
                        }}
                        onKeyUp={(event) => {
                          const start = event.currentTarget.selectionStart ?? 0;
                          const end = event.currentTarget.selectionEnd ?? start;
                          editPrimarySelectionRef.current = { start, end };
                        }}
                        onFocus={(event) => {
                          const start = event.currentTarget.selectionStart ?? 0;
                          const end = event.currentTarget.selectionEnd ?? start;
                          editPrimarySelectionRef.current = { start, end };
                        }}
                        onBlur={(event) => {
                          const start = event.currentTarget.selectionStart ?? 0;
                          const end = event.currentTarget.selectionEnd ?? start;
                          editPrimarySelectionRef.current = { start, end };
                        }}
                      />
                    </div>

                    <div className={styles.editTwoCols}>
                      <label className={styles.editField}>
                        {t("detail.editModal.headline")}
                        <input
                          className={styles.input}
                          value={editDraft.headline}
                          onChange={(event) => setEditDraft({ ...editDraft, headline: event.target.value })}
                        />
                      </label>

                      <label className={styles.editField}>
                        {t("detail.editModal.cta")}
                        <CustomSelect
                          value={editDraft.cta}
                          options={ctaOptions}
                          onChange={(value) => setEditDraft({ ...editDraft, cta: value })}
                          placeholder={t("detail.editModal.selectCta")}
                        />
                      </label>
                    </div>

                    <label className={styles.editField}>
                      {t("detail.editModal.description")}
                      <input
                        className={styles.input}
                        value={editDraft.adDescription}
                        onChange={(event) => setEditDraft({ ...editDraft, adDescription: event.target.value })}
                      />
                    </label>

                    <label className={styles.editField}>
                      {t("detail.editModal.destinationUrl")}
                      <input
                        className={styles.input}
                        value={editDraft.destinationUrl}
                        onChange={(event) => setEditDraft({ ...editDraft, destinationUrl: event.target.value })}
                        placeholder="https://"
                      />
                    </label>

                    <div className={styles.editTwoCols}>
                      <label className={`${styles.editField} ${styles.editFieldLocked}`}>
                        {t("detail.editModal.location")}
                        <CustomSelect
                          value={editDraft.locationText}
                          options={locationOptions}
                          onChange={(value) => setEditDraft({ ...editDraft, locationText: value })}
                          placeholder={t("detail.editModal.selectLocation")}
                          disabled
                        />
                        <small className={styles.helper}>{t("detail.editModal.locationLocked")}</small>
                      </label>

                      <div className={`${styles.editField} ${styles.editFieldLocked}`}>
                        {t("detail.editModal.ageRange")}
                        <div className={styles.editAgeRow}>
                          <input
                            className={styles.input}
                            type="number"
                            min={13}
                            max={120}
                            value={editDraft.ageMin}
                            onChange={(event) => setEditDraft({ ...editDraft, ageMin: event.target.value })}
                            disabled
                          />
                          <span className={styles.editAgeSep}>{t("detail.editModal.ageTo")}</span>
                          <input
                            className={styles.input}
                            type="number"
                            min={13}
                            max={120}
                            value={editDraft.ageMax}
                            onChange={(event) => setEditDraft({ ...editDraft, ageMax: event.target.value })}
                            disabled
                          />
                        </div>
                        <small className={styles.helper}>{t("detail.editModal.ageLocked")}</small>
                      </div>
                    </div>

                    <div className={styles.editField}>
                      {t("detail.editModal.interests")}
                      <div className={styles.editInterestComposer}>
                        <input
                          className={styles.input}
                          value={interestDraft}
                          onChange={(event) => setInterestDraft(event.target.value)}
                          placeholder={t("detail.editModal.interestPlaceholder")}
                        />
                        <button type="button" className={styles.secondaryBtn} onClick={addInterest}>
                          {t("detail.editModal.add")}
                        </button>
                      </div>
                      <div className={styles.editChipRow}>
                        {editDraft.interests.map((interest) => (
                          <button key={interest} type="button" className={styles.editChip} onClick={() => removeInterest(interest)}>
                            {interest} x
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className={styles.editField}>
                      {t("detail.editModal.creativeMedia")}
                      {isMediaEditLocked ? (
                        <small className={styles.helper}>
                          {t("detail.editModal.mediaLocked", { limit: MEDIA_EDIT_LOCK_UNIQUE_VIEWS })}
                        </small>
                      ) : null}
                      <div className={styles.editMediaControls}>
                        <button
                          type="button"
                          className={styles.secondaryBtn}
                          onClick={openEditMediaPicker}
                          disabled={editSaving || isMediaEditLocked}
                        >
                          {t("detail.editModal.chooseFiles")}
                        </button>
                        <input
                          ref={editMediaInputRef}
                          type="file"
                          className={styles.editMediaInput}
                          accept={editDraft.adFormat === "video" ? "video/*" : "image/*"}
                          multiple={editDraft.adFormat === "carousel"}
                          onChange={handleEditMediaUpload}
                          disabled={editSaving || isMediaEditLocked}
                        />
                      </div>
                      <div className={styles.editMediaGrid}>
                        {editDraft.mediaUrls.map((url) => (
                          <div key={url} className={styles.editMediaItem}>
                            {isVideoUrl(url) ? (
                              <video className={styles.editMediaPreview} src={url} preload="metadata" muted />
                            ) : (
                              <img className={styles.editMediaPreview} src={url} alt="Editable creative media" />
                            )}
                            <button
                              type="button"
                              className={styles.editRemoveMediaBtn}
                              onClick={() => removeMediaUrl(url)}
                              disabled={editSaving || isMediaEditLocked}
                            >
                              {t("detail.editModal.remove")}
                            </button>
                          </div>
                        ))}
                        {pendingMediaUploads.map((pendingId) => (
                          <div
                            key={pendingId}
                            className={`${styles.editMediaItem} ${styles.editMediaItemLoading}`}
                            aria-label="Uploading media"
                          >
                            <div className={styles.editMediaSkeleton} />
                            <div className={styles.editMediaSkeletonFooter}>{t("detail.editModal.uploading")}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {editError ? <p className={styles.error}>{editError}</p> : null}
                  </div>

                  <div className={styles.editActions}>
                    <button type="button" className={styles.secondaryBtn} onClick={closeEditOverlay} disabled={editSaving}>
                      {t("detail.editModal.cancel")}
                    </button>
                    <button
                      type="button"
                      className={styles.primaryBtn}
                      onClick={() => void saveEditedDetails()}
                      disabled={!hasEditChanges || editSaving || isUploadingMedia}
                    >
                      {t("detail.editModal.saveChanges")}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Media lightbox */}
            {activeMedia ? (
              <div className={styles.mediaLightbox} role="dialog" aria-modal="true" onClick={() => setActiveMedia(null)}>
                <button
                  type="button"
                  className={styles.mediaLightboxClose}
                  onClick={() => setActiveMedia(null)}
                  aria-label="Close media preview"
                >
                  x
                </button>
                <div className={styles.mediaLightboxInner} onClick={(event) => event.stopPropagation()}>
                  {activeMedia.isVideo ? (
                    <video className={styles.mediaLightboxContent} src={activeMedia.url} controls autoPlay />
                  ) : (
                    <img className={styles.mediaLightboxContent} src={activeMedia.url} alt="Creative media full view" />
                  )}
                </div>
              </div>
            ) : null}

            {/* Campaign actions */}
            <section className={styles.actionsCard}>
              <h2 className={styles.sectionTitle}>{t("detail.sections.actions")}</h2>

              <div className={styles.actionRow}>
                <div>
                  <p className={styles.actionTitle}>{t("detail.upgrade.title")}</p>
                  <p className={styles.actionHint}>{t("detail.upgrade.hint")}</p>
                </div>

                <div className={styles.upgradePanel} ref={upgradePanelRef}>
                  <p className={styles.packageSectionLabel}>{t("detail.upgrade.boostStrength")}</p>
                  <div className={styles.packageGrid}>
                    {boostPackages.map((item) => {
                      const disabled =
                        item.price < currentBoostPackage.price ||
                        saving ||
                        isCreatingUpgradeCheckout ||
                        !detail.actions?.canChangeBoost;
                      const active = item.id === selectedBoostUpgradeId;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          className={`${styles.packageBtn} ${active ? styles.packageBtnActive : ""}`}
                          onClick={() => { if (disabled) return; setSelectedBoostUpgradeId(item.id); }}
                          disabled={disabled}
                        >
                          <div className={styles.packageTopRow}>
                            <span className={styles.packageLabel}>{item.title}</span>
                            {item.highlight ? <span className={styles.packageBadge}>{item.highlight}</span> : null}
                          </div>
                          <span className={styles.packageAmount}>{money(item.price)}</span>
                          <span className={styles.packageHint}>{item.level}</span>
                          {item.price < currentBoostPackage.price ? (
                            <span className={styles.packageLock}>{t("detail.upgrade.notForDowngrade")}</span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>

                  <p className={styles.packageSectionLabel}>{t("detail.upgrade.extendDays")}</p>
                  <div className={styles.packageGrid}>
                    {durationPackages.map((item) => {
                      const active = item.id === selectedDurationUpgradeId;
                      const disabled = saving || isCreatingUpgradeCheckout || !detail.actions?.canExtend;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          className={`${styles.packageBtn} ${active ? styles.packageBtnActive : ""}`}
                          onClick={() => setSelectedDurationUpgradeId(item.id)}
                          disabled={disabled}
                        >
                          <div className={styles.packageTopRow}>
                            <span className={styles.packageLabel}>
                              {item.days > 0
                                ? tCreate("package.days", { count: item.days })
                                : tCreate("package.durations.none")}
                            </span>
                          </div>
                          <span className={styles.packageAmount}>{money(item.price)}</span>
                          <span className={styles.packageHint}>{item.note}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div className={styles.upgradeTotalCard}>
                    <div className={styles.totalRow}>
                      <span>{t("detail.upgrade.currentBoost")}</span>
                      <strong>{currentBoostPackage.title}</strong>
                    </div>
                    <div className={styles.totalRow}>
                      <span>{t("detail.upgrade.boostUpgradeDiff")}</span>
                      <strong>{money(boostUpgradeDelta)}</strong>
                    </div>
                    <div className={styles.totalRow}>
                      <span>{t("detail.upgrade.extendDaysPackage")}</span>
                      <strong>{money(durationUpgradeCost)}</strong>
                    </div>
                    <div className={styles.totalDivider} />
                    <div className={styles.totalRow}>
                      <span>{t("detail.upgrade.needToPayNow")}</span>
                      <strong className={styles.totalValue}>{money(upgradeTotalCost)}</strong>
                    </div>
                    <div className={styles.totalRow}>
                      <span>{t("detail.upgrade.newTotalBudget")}</span>
                      <strong>{money(projectedBudget)}</strong>
                    </div>
                  </div>

                  {upgradeError ? <p className={styles.error}>{upgradeError}</p> : null}

                  <div className={styles.actionControls}>
                    <button
                      type="button"
                      className={styles.primaryBtn}
                      onClick={() => void startUpgradeCheckout()}
                      disabled={saving || isCreatingUpgradeCheckout || !hasUpgradeSelection || (!detail.actions?.canChangeBoost && !detail.actions?.canExtend)}
                    >
                      {isCreatingUpgradeCheckout ? t("detail.upgrade.creatingCheckout") : t("detail.upgrade.payWithStripe")}
                    </button>
                  </div>
                </div>
              </div>

              {detail.status !== "canceled" ? (
                <div className={styles.actionRow}>
                  <div>
                    <p className={styles.actionTitle}>{t("detail.lifecycle.title")}</p>
                    <p className={styles.actionHint}>{t("detail.lifecycle.hint")}</p>
                  </div>
                  <div className={styles.actionControls}>
                    {detail.actions?.canPause ? (
                      <button
                        type="button"
                        className={styles.secondaryBtn}
                        disabled={saving}
                        onClick={() => setIsHideConfirmOpen(true)}
                      >
                        {t("detail.lifecycle.hide")}
                      </button>
                    ) : null}

                    {!detail.actions?.canPause && detail.actions?.canResume ? (
                      <button
                        type="button"
                        className={styles.primaryBtn}
                        disabled={saving}
                        onClick={() => void runAction("resume_campaign")}
                      >
                        {t("detail.lifecycle.reopen")}
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {success ? <p className={styles.success}>{success}</p> : null}
              {error ? <p className={styles.error}>{error}</p> : null}
            </section>

            {/* Hide confirm dialog */}
            {isHideConfirmOpen ? (
              <div
                className={styles.confirmOverlay}
                role="dialog"
                aria-modal="true"
                aria-label="Confirm hide campaign"
                onClick={() => setIsHideConfirmOpen(false)}
              >
                <div className={styles.confirmCard} onClick={(e) => e.stopPropagation()}>
                  <h3 className={styles.confirmTitle}>{t("detail.hideConfirm.title")}</h3>
                  <p className={styles.confirmBody}>{t("detail.hideConfirm.body")}</p>
                  <div className={styles.confirmActions}>
                    <button
                      type="button"
                      className={styles.secondaryBtn}
                      onClick={() => setIsHideConfirmOpen(false)}
                      disabled={saving}
                    >
                      {t("detail.hideConfirm.cancel")}
                    </button>
                    <button
                      type="button"
                      className={styles.primaryBtn}
                      disabled={saving}
                      onClick={async () => {
                        setIsHideConfirmOpen(false);
                        await runAction("pause_campaign");
                      }}
                    >
                      {t("detail.hideConfirm.confirm")}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
