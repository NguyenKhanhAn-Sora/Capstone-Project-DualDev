"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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

function statusLabel(status: AdsCampaignDetail["status"]) {
  if (status === "active") return "Active";
  if (status === "hidden") return "Hidden";
  if (status === "paused") return "Paused";
  if (status === "canceled") return "Canceled";
  return "Completed";
}

function hiddenReasonLabel(reason?: string | null) {
  if (!reason) return "Visible";
  if (reason === "paused") return "Hidden manually";
  if (reason === "canceled") return "Canceled manually";
  if (reason === "expired") return "Expired";
  return reason;
}

function placementLabel(value?: string) {
  if (!value) return "Home Feed";
  if (value === "home_feed") return "Home Feed";
  return value;
}

function isVideoUrl(url: string) {
  return /\.(mp4|mov|webm|mkv)(\?|#|$)/i.test(url);
}

type BoostPackage = {
  id: "light" | "standard" | "strong";
  title: string;
  level: string;
  price: number;
  highlight?: string;
};

type DurationPackage = {
  id: "none" | "d3" | "d7" | "d14" | "d30";
  days: number;
  price: number;
  note: string;
};

const BOOST_PACKAGES: BoostPackage[] = [
  {
    id: "light",
    title: "Light Boost",
    level: "Low competition",
    price: 79000,
    highlight: "Best for first ad",
  },
  {
    id: "standard",
    title: "Standard Boost",
    level: "Medium competition",
    price: 149000,
    highlight: "Most chosen",
  },
  {
    id: "strong",
    title: "Strong Boost",
    level: "High competition",
    price: 299000,
    highlight: "High visibility",
  },
];

const DURATION_PACKAGES: DurationPackage[] = [
  { id: "none", days: 0, price: 0, note: "No extension" },
  { id: "d3", days: 3, price: 29000, note: "Short burst" },
  { id: "d7", days: 7, price: 59000, note: "One week run" },
  { id: "d14", days: 14, price: 99000, note: "Sustained delivery" },
  { id: "d30", days: 30, price: 179000, note: "Full month coverage" },
];

const BOOST_OPTIONS = BOOST_PACKAGES.map((item) => ({
  id: item.id,
  label: item.title,
}));

const OBJECTIVE_OPTIONS = [
  { value: "awareness", label: "Awareness" },
  { value: "traffic", label: "Traffic" },
  { value: "engagement", label: "Engagement" },
  { value: "leads", label: "Leads" },
  { value: "sales", label: "Sales" },
  { value: "messages", label: "Messages" },
];

const AD_FORMAT_OPTIONS = [
  { value: "single", label: "Single image" },
  { value: "carousel", label: "Carousel" },
  { value: "video", label: "Video" },
];

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
  "United States",
  "United Kingdom",
  "Canada",
  "Australia",
  "Germany",
  "France",
  "Italy",
  "Spain",
  "Netherlands",
  "Sweden",
  "Norway",
  "Denmark",
  "Switzerland",
  "Japan",
  "South Korea",
  "Singapore",
  "India",
  "Indonesia",
  "Thailand",
  "Malaysia",
  "Vietnam",
  "Philippines",
  "China",
  "Brazil",
  "Mexico",
  "Argentina",
  "Chile",
  "Colombia",
  "South Africa",
  "United Arab Emirates",
  "Saudi Arabia",
  "Turkey",
  "Egypt",
  "New Zealand",
  "Ireland",
];

type SelectOption = {
  value: string;
  label: string;
};

function ChevronDownIcon() {
  return (
    <svg aria-hidden viewBox="0 0 20 20" fill="none">
      <path
        d="M5 7.5L10 12.5L15 7.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CustomSelect({
  value,
  options,
  placeholder,
  onChange,
  disabled,
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

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

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
                onClick={() => {
                  onChange(item.value);
                  setOpen(false);
                }}
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

export default function CampaignDetailPage() {
  const canRender = useRequireAuth();
  const router = useRouter();
  const params = useParams<{ campaignId: string }>();
  const campaignId = String(params?.campaignId ?? "");

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
  const [selectedBoostUpgradeId, setSelectedBoostUpgradeId] =
    useState<BoostPackage["id"]>("standard");
  const [selectedDurationUpgradeId, setSelectedDurationUpgradeId] =
    useState<DurationPackage["id"]>("none");
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
        const response = await fetch(
          "https://restcountries.com/v3.1/all?fields=name,population,region",
        );
        if (!response.ok) throw new Error("Failed to fetch countries");

        const rows = (await response.json()) as Array<{
          name?: { common?: string };
          population?: number;
          region?: string;
        }>;

        const list = rows
          .map((item) => ({
            name: item.name?.common?.trim() ?? "",
            population: item.population ?? 0,
            region: item.region ?? "",
          }))
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
    return () => {
      cancelled = true;
    };
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
        const initialBoost = BOOST_PACKAGES.some((item) => item.id === result.boostPackageId)
          ? (result.boostPackageId as BoostPackage["id"])
          : "standard";
        setSelectedBoostUpgradeId(initialBoost);
        setSelectedDurationUpgradeId("none");
        setUpgradeError("");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load campaign details.");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [campaignId, token]);

  const statusClass = useMemo(() => {
    if (!detail) return styles.status_completed;
    if (detail.status === "active") return styles.status_active;
    if (detail.status === "hidden") return styles.status_hidden;
    if (detail.status === "paused") return styles.status_paused;
    if (detail.status === "canceled") return styles.status_canceled;
    return styles.status_completed;
  }, [detail]);

  const performance = useMemo(() => {
    if (!detail) {
      return {
        budgetUsagePct: 0,
        budgetRemaining: 0,
        cpc: 0,
        cpm: 0,
        cpv: 0,
        cpe: 0,
        elapsedDays: 0,
        remainingDays: 0,
        totalDays: 0,
      };
    }

    const budgetUsagePct = detail.budget > 0 ? (detail.spent / detail.budget) * 100 : 0;
    const budgetRemaining = Math.max(detail.budget - detail.spent, 0);
    const cpc = detail.clicks > 0 ? detail.spent / detail.clicks : 0;
    const cpm = detail.impressions > 0 ? (detail.spent * 1000) / detail.impressions : 0;
    const cpv = detail.views > 0 ? detail.spent / detail.views : 0;
    const cpe = detail.engagements > 0 ? detail.spent / detail.engagements : 0;

    const startMs = new Date(detail.startsAt).getTime();
    const endMs = new Date(detail.expiresAt).getTime();
    const nowMs = Date.now();
    const totalDays = Math.max(1, Math.ceil((endMs - startMs) / DAY_MS));

    let elapsedDays = 0;
    if (nowMs > startMs) {
      const clampedNow = Math.min(nowMs, endMs);
      elapsedDays = Math.max(0, Math.ceil((clampedNow - startMs) / DAY_MS));
    }

    const remainingDays = nowMs >= endMs ? 0 : Math.max(0, Math.ceil((endMs - nowMs) / DAY_MS));

    return {
      budgetUsagePct,
      budgetRemaining,
      cpc,
      cpm,
      cpv,
      cpe,
      elapsedDays,
      remainingDays,
      totalDays,
    };
  }, [detail]);

  const hasEditChanges = useMemo(() => {
    if (!detail || !editDraft) return false;
    const before = normalizeDraft(buildDraftFromDetail(detail));
    const after = normalizeDraft(editDraft);
    return JSON.stringify(before) !== JSON.stringify(after);
  }, [detail, editDraft]);

  const objectiveOptions = useMemo<SelectOption[]>(
    () => [
      { value: "", label: "Select objective" },
      ...OBJECTIVE_OPTIONS.map((item) => ({ value: item.value, label: item.label })),
    ],
    [],
  );

  const formatOptions = useMemo<SelectOption[]>(
    () => AD_FORMAT_OPTIONS.map((item) => ({ value: item.value, label: item.label })),
    [],
  );

  const ctaOptions = useMemo<SelectOption[]>(
    () => [{ value: "", label: "Select CTA" }, ...CTA_OPTIONS.map((item) => ({ value: item, label: item }))],
    [],
  );

  const locationOptions = useMemo<SelectOption[]>(() => {
    const sortedCountries = [...countryOptions].sort((a, b) => a.localeCompare(b, "en"));
    const base = sortedCountries.map((name) => ({ value: name, label: name }));
    const current = editDraft?.locationText?.trim() || "";
    if (current && !base.some((item) => item.value.toLowerCase() === current.toLowerCase())) {
      base.unshift({ value: current, label: current });
    }

    return [
      {
        value: "",
        label: countriesLoading ? "Loading countries..." : "Select location",
      },
      ...base,
    ];
  }, [countryOptions, countriesLoading, editDraft?.locationText]);

  const isUploadingMedia = pendingMediaUploads.length > 0;

  const currentBoostPackage = useMemo(
    () => BOOST_PACKAGES.find((item) => item.id === detail?.boostPackageId) ?? BOOST_PACKAGES[1],
    [detail?.boostPackageId],
  );

  const selectedBoostPackage = useMemo(
    () => BOOST_PACKAGES.find((item) => item.id === selectedBoostUpgradeId) ?? currentBoostPackage,
    [selectedBoostUpgradeId, currentBoostPackage],
  );

  const selectedDurationPackage = useMemo(
    () => DURATION_PACKAGES.find((item) => item.id === selectedDurationUpgradeId) ?? DURATION_PACKAGES[0],
    [selectedDurationUpgradeId],
  );

  const boostUpgradeDelta = Math.max(
    (selectedBoostPackage?.price ?? 0) - (currentBoostPackage?.price ?? 0),
    0,
  );
  const durationUpgradeCost = selectedDurationPackage?.price ?? 0;
  const upgradeTotalCost = boostUpgradeDelta + durationUpgradeCost;
  const projectedBudget = (detail?.budget ?? 0) + upgradeTotalCost;
  const hasUpgradeSelection = upgradeTotalCost > 0;

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
        setUpgradeError("Unable to create Stripe checkout session.");
        return;
      }

      window.location.href = session.url;
    } catch (err) {
      setUpgradeError(err instanceof Error ? err.message : "Failed to start checkout session.");
    } finally {
      setIsCreatingUpgradeCheckout(false);
    }
  };

  const scrollToUpgradePanel = () => {
    upgradePanelRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "nearest",
    });
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

    const start = hasLiveSelection
      ? (textarea?.selectionStart ?? 0)
      : editPrimarySelectionRef.current.start;
    const end = hasLiveSelection
      ? (textarea?.selectionEnd ?? start)
      : editPrimarySelectionRef.current.end;

    setEditDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        primaryText: prev.primaryText.slice(0, start) + emoji + prev.primaryText.slice(end),
      };
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
    if (exists) {
      setInterestDraft("");
      return;
    }
    setEditDraft({ ...editDraft, interests: [...editDraft.interests, next] });
    setInterestDraft("");
  };

  const removeInterest = (interest: string) => {
    if (!editDraft) return;
    setEditDraft({
      ...editDraft,
      interests: editDraft.interests.filter((item) => item !== interest),
    });
  };

  const removeMediaUrl = (url: string) => {
    if (!editDraft) return;
    setEditDraft({
      ...editDraft,
      mediaUrls: editDraft.mediaUrls.filter((item) => item !== url),
    });
  };

  const openEditMediaPicker = () => {
    editMediaInputRef.current?.click();
  };

  const handleEditMediaUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!editDraft || files.length === 0) return;
    if (!token) {
      setEditError("Please login again to upload media.");
      return;
    }

    const format = editDraft.adFormat || "single";
    const isVideoFormat = format === "video";
    const validFiles = files.filter((file) =>
      isVideoFormat ? file.type.startsWith("video/") : file.type.startsWith("image/"),
    );

    if (validFiles.length === 0) {
      setEditError(isVideoFormat ? "Please select a video file." : "Please select image files.");
      return;
    }

    const maxMedia = format === "carousel" ? 5 : 1;
    const remaining = Math.max(maxMedia - editDraft.mediaUrls.length, 0);
    if (remaining === 0) {
      setEditError("Media limit reached for current ad format.");
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

      const uploadedUrls = uploaded
        .map((item) => (item.secureUrl || item.url || "").trim())
        .filter(Boolean);

      setEditDraft((prev) => {
        if (!prev) return prev;
        const nextUrls = [...prev.mediaUrls, ...uploadedUrls];
        return {
          ...prev,
          mediaUrls: format === "carousel" ? nextUrls.slice(0, 5) : nextUrls.slice(0, 1),
        };
      });
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to upload media.");
    } finally {
      setPendingMediaUploads((prev) => prev.filter((id) => !pendingIds.includes(id)));
    }
  };

  const saveEditedDetails = async () => {
    if (!token || !campaignId || !editDraft || !hasEditChanges) return;

    setEditSaving(true);
    setEditError("");
    setSuccess("");

    const normalized = normalizeDraft(editDraft);

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
        locationText: normalized.locationText,
        ageMin: normalized.ageMin ? Number(normalized.ageMin) : null,
        ageMax: normalized.ageMax ? Number(normalized.ageMax) : null,
        placement: "home_feed",
        mediaUrls: normalized.mediaUrls,
      });
      setDetail(updated);
      setSuccess("Campaign details updated successfully.");
      setIsEditOpen(false);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to save campaign details.");
    } finally {
      setEditSaving(false);
    }
  };

  const runAction = async (action: "pause_campaign" | "resume_campaign") => {
    if (!token || !campaignId) return;

    if (action === "resume_campaign" && detail?.actions?.requiresExtendBeforeResume) {
      setError("This campaign has expired. Please purchase an extension package before reopening.");
      setUpgradeError("Select an extension package, complete payment, then reopen the campaign.");
      scrollToUpgradePanel();
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const updated = await performAdsCampaignAction({
        token,
        campaignId,
        action,
      });
      setDetail(updated);
      setSuccess(
        action === "pause_campaign"
          ? "Campaign has been hidden successfully."
          : "Campaign has been reopened successfully.",
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update campaign.";
      setError(message);
      if (/expired|extend/i.test(message) && action === "resume_campaign") {
        setUpgradeError("Please extend campaign days first, then reopen the campaign.");
        scrollToUpgradePanel();
      }
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!activeMedia) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActiveMedia(null);
    };

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [activeMedia]);

  useEffect(() => {
    if (!isHideConfirmOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsHideConfirmOpen(false);
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isHideConfirmOpen]);

  useEffect(() => {
    if (!isEditOpen || !isEditPrimaryEmojiOpen) return;

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (editPrimaryEmojiRef.current?.contains(target)) return;
      setIsEditPrimaryEmojiOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsEditPrimaryEmojiOpen(false);
    };

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
          <button
            type="button"
            className={styles.backBtn}
            onClick={() => router.push("/ads/campaigns")}
          >
            Back to campaigns
          </button>
        </div>

        {loading ? <p className={styles.helper}>Loading campaign details...</p> : null}
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
                <p>Spent</p>
                <strong>{money(detail.spent)}</strong>
              </article>
              <article className={styles.metricCard}>
                <p>Impressions</p>
                <strong>{integer(detail.impressions)}</strong>
              </article>
              <article className={styles.metricCard}>
                <p>Clicks</p>
                <strong>{integer(detail.clicks)}</strong>
              </article>
              <article className={styles.metricCard}>
                <p>CTR</p>
                <strong>{pct(detail.ctr)}</strong>
              </article>
            </section>

            <section className={styles.infoCard}>
              <h2 className={styles.sectionTitle}>Performance Breakdown</h2>
              <div className={styles.breakdownGrid}>
                <article className={styles.breakdownItem}>
                  <p>Reach</p>
                  <strong>{integer(detail.reach)}</strong>
                </article>
                <article className={styles.breakdownItem}>
                  <p>Views</p>
                  <strong>{integer(detail.views)}</strong>
                </article>
                <article className={styles.breakdownItem}>
                  <p>Engagements</p>
                  <strong>{integer(detail.engagements)}</strong>
                </article>
                <article className={styles.breakdownItem}>
                  <p>Engagement rate</p>
                  <strong>{pct(detail.engagementRate)}</strong>
                </article>
                <article className={styles.breakdownItem}>
                  <p>Avg dwell</p>
                  <strong>{integer(Math.round(detail.averageDwellMs))} ms</strong>
                </article>
              </div>
            </section>

            <section className={styles.infoCard}>
              <h2 className={styles.sectionTitle}>Campaign Configuration</h2>
              <div className={styles.detailGrid}>
                <div className={styles.detailRow}>
                  <span>Objective</span>
                  <strong>{detail.objective || "N/A"}</strong>
                </div>
                <div className={styles.detailRow}>
                  <span>Ad format</span>
                  <strong>{detail.adFormat || "N/A"}</strong>
                </div>
                <div className={styles.detailRow}>
                  <span>Boost package</span>
                  <strong>
                    {BOOST_OPTIONS.find((item) => item.id === detail.boostPackageId)?.label ||
                      detail.boostPackageId ||
                      "N/A"}
                  </strong>
                </div>
                <div className={styles.detailRow}>
                  <span>Duration days</span>
                  <strong>{detail.durationDays ? `${detail.durationDays} days` : "N/A"}</strong>
                </div>
                <div className={styles.detailRow}>
                  <span>Delivery state reason</span>
                  <strong>{hiddenReasonLabel(detail.hiddenReason)}</strong>
                </div>
                {detail.status === "canceled" && detail.adminCancelReason?.trim() ? (
                  <div className={styles.detailRow}>
                    <span>Admin cancellation reason</span>
                    <strong>{detail.adminCancelReason.trim()}</strong>
                  </div>
                ) : null}
                <div className={styles.detailRow}>
                  <span>Elapsed / total</span>
                  <strong>{performance.elapsedDays} / {performance.totalDays} days</strong>
                </div>
                <div className={styles.detailRow}>
                  <span>Reactions split</span>
                  <strong>
                    {integer(detail.likes)} likes · {integer(detail.comments)} comments · {integer(detail.reposts)} reposts
                  </strong>
                </div>
              </div>
            </section>

            <section className={styles.infoCard}>
              <div className={styles.sectionHeadRow}>
                <h2 className={styles.sectionTitle}>Ad Creative & Audience</h2>
                <button type="button" className={styles.secondaryBtn} onClick={openEditOverlay}>
                  Edit
                </button>
              </div>
              <div className={styles.detailGrid}>
                <div className={styles.detailRow}>
                  <span>Primary text</span>
                  <strong>{detail.primaryText?.trim() || "N/A"}</strong>
                </div>
                <div className={styles.detailRow}>
                  <span>Headline</span>
                  <strong>{detail.headline?.trim() || "N/A"}</strong>
                </div>
                <div className={styles.detailRow}>
                  <span>Description</span>
                  <strong>{detail.adDescription?.trim() || "N/A"}</strong>
                </div>
                <div className={styles.detailRow}>
                  <span>CTA button</span>
                  <strong>{detail.cta?.trim() || "N/A"}</strong>
                </div>
                <div className={styles.detailRow}>
                  <span>Destination URL</span>
                  <strong>{detail.destinationUrl?.trim() || "N/A"}</strong>
                </div>
                <div className={styles.detailRow}>
                  <span>Placement</span>
                  <strong>{placementLabel(detail.placement)}</strong>
                </div>
                <div className={styles.detailRow}>
                  <span>Location targeting</span>
                  <strong>{detail.locationText?.trim() || "N/A"}</strong>
                </div>
                <div className={styles.detailRow}>
                  <span>Age targeting</span>
                  <strong>
                    {typeof detail.ageMin === "number" && typeof detail.ageMax === "number"
                      ? `${detail.ageMin} - ${detail.ageMax}`
                      : "N/A"}
                  </strong>
                </div>
                <div className={styles.detailRow}>
                  <span>Interests</span>
                  <strong>
                    {detail.interests && detail.interests.length > 0
                      ? detail.interests.join(" · ")
                      : "N/A"}
                  </strong>
                </div>
              </div>

              <div className={styles.mediaSection}>
                <p className={styles.mediaTitle}>Creative Media</p>
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
                          <video
                            className={styles.mediaPreview}
                            src={url}
                            preload="metadata"
                            muted
                            playsInline
                          />
                        ) : (
                          <img className={styles.mediaPreview} src={url} alt={`Creative media ${index + 1}`} />
                        )}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className={styles.helper}>No media available for this campaign.</p>
                )}
              </div>
            </section>

            {isEditOpen && editDraft ? (
              <div className={styles.editOverlay} onClick={closeEditOverlay}>
                <div className={styles.editModal} onClick={(event) => event.stopPropagation()}>
                  <div className={styles.editHead}>
                    <h3 className={styles.editTitle}>Edit Campaign Details</h3>
                    <button
                      type="button"
                      className={styles.editCloseBtn}
                      onClick={closeEditOverlay}
                      disabled={editSaving}
                    >
                      x
                    </button>
                  </div>

                  <div className={styles.editBody}>
                    <label className={styles.editField}>
                      Campaign name
                      <input
                        className={styles.input}
                        value={editDraft.campaignName}
                        onChange={(event) =>
                          setEditDraft({ ...editDraft, campaignName: event.target.value })
                        }
                      />
                    </label>

                    <div className={styles.editTwoCols}>
                      <label className={styles.editField}>
                        Objective
                        <CustomSelect
                          value={editDraft.objective}
                          options={objectiveOptions}
                          onChange={(value) => setEditDraft({ ...editDraft, objective: value })}
                          placeholder="Select objective"
                        />
                      </label>

                      <label className={styles.editField}>
                        Ad format
                        <CustomSelect
                          value={editDraft.adFormat}
                          options={formatOptions}
                          onChange={(value) => {
                            const nextFormat = value;
                            setEditDraft({
                              ...editDraft,
                              adFormat: nextFormat,
                              mediaUrls:
                                nextFormat === "carousel"
                                  ? editDraft.mediaUrls.slice(0, 5)
                                  : editDraft.mediaUrls.slice(0, 1),
                            });
                          }}
                        />
                      </label>
                    </div>

                    <div className={styles.editField}>
                      <span>Primary text</span>
                      <div className={styles.emojiRow}>
                        <div className={styles.emojiWrap} ref={editPrimaryEmojiRef}>
                          <button
                            type="button"
                            className={styles.emojiButton}
                            onClick={() => setIsEditPrimaryEmojiOpen((prev) => !prev)}
                            aria-label="Add emoji"
                          >
                            <svg
                              aria-label="Emoji icon"
                              fill="currentColor"
                              height="20"
                              role="img"
                              viewBox="0 0 24 24"
                              width="20"
                            >
                              <title>Emoji icon</title>
                              <path d="M15.83 10.997a1.167 1.167 0 1 0 1.167 1.167 1.167 1.167 0 0 0-1.167-1.167Zm-6.5 1.167a1.167 1.167 0 1 0-1.166 1.167 1.167 1.167 0 0 0 1.166-1.167Zm5.163 3.24a3.406 3.406 0 0 1-4.982.007 1 1 0 1 0-1.557 1.256 5.397 5.397 0 0 0 8.09 0 1 1 0 0 0-1.55-1.263ZM12 .503a11.5 11.5 0 1 0 11.5 11.5A11.513 11.513 0 0 0 12 .503Zm0 21a9.5 9.5 0 1 1 9.5-9.5 9.51 9.51 0 0 1-9.5 9.5Z"></path>
                            </svg>
                          </button>
                          {isEditPrimaryEmojiOpen ? (
                            <div className={styles.emojiPopover}>
                              <EmojiPicker
                                onEmojiClick={(emojiData) => {
                                  insertEditPrimaryEmoji(emojiData.emoji || "");
                                }}
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
                        Headline
                        <input
                          className={styles.input}
                          value={editDraft.headline}
                          onChange={(event) =>
                            setEditDraft({ ...editDraft, headline: event.target.value })
                          }
                        />
                      </label>

                      <label className={styles.editField}>
                        CTA
                        <CustomSelect
                          value={editDraft.cta}
                          options={ctaOptions}
                          onChange={(value) => setEditDraft({ ...editDraft, cta: value })}
                          placeholder="Select CTA"
                        />
                      </label>
                    </div>

                    <label className={styles.editField}>
                      Description
                      <input
                        className={styles.input}
                        value={editDraft.adDescription}
                        onChange={(event) =>
                          setEditDraft({ ...editDraft, adDescription: event.target.value })
                        }
                      />
                    </label>

                    <label className={styles.editField}>
                      Destination URL
                      <input
                        className={styles.input}
                        value={editDraft.destinationUrl}
                        onChange={(event) =>
                          setEditDraft({ ...editDraft, destinationUrl: event.target.value })
                        }
                        placeholder="https://"
                      />
                    </label>

                    <div className={styles.editTwoCols}>
                      <label className={styles.editField}>
                        Location
                        <CustomSelect
                          value={editDraft.locationText}
                          options={locationOptions}
                          onChange={(value) => setEditDraft({ ...editDraft, locationText: value })}
                          placeholder="Select location"
                          disabled={countriesLoading && locationOptions.length <= 1}
                        />
                      </label>

                      <div className={styles.editField}>
                        Age range
                        <div className={styles.editAgeRow}>
                          <input
                            className={styles.input}
                            type="number"
                            min={13}
                            max={120}
                            value={editDraft.ageMin}
                            onChange={(event) =>
                              setEditDraft({ ...editDraft, ageMin: event.target.value })
                            }
                          />
                          <span className={styles.editAgeSep}>to</span>
                          <input
                            className={styles.input}
                            type="number"
                            min={13}
                            max={120}
                            value={editDraft.ageMax}
                            onChange={(event) =>
                              setEditDraft({ ...editDraft, ageMax: event.target.value })
                            }
                          />
                        </div>
                      </div>
                    </div>

                    <div className={styles.editField}>
                      Interests
                      <div className={styles.editInterestComposer}>
                        <input
                          className={styles.input}
                          value={interestDraft}
                          onChange={(event) => setInterestDraft(event.target.value)}
                          placeholder="Type interest and click Add"
                        />
                        <button type="button" className={styles.secondaryBtn} onClick={addInterest}>
                          Add
                        </button>
                      </div>
                      <div className={styles.editChipRow}>
                        {editDraft.interests.map((interest) => (
                          <button
                            key={interest}
                            type="button"
                            className={styles.editChip}
                            onClick={() => removeInterest(interest)}
                          >
                            {interest} x
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className={styles.editField}>
                      Creative media
                      <div className={styles.editMediaControls}>
                        <button
                          type="button"
                          className={styles.secondaryBtn}
                          onClick={openEditMediaPicker}
                          disabled={editSaving}
                        >
                          Choose files
                        </button>
                        <input
                          ref={editMediaInputRef}
                          type="file"
                          className={styles.editMediaInput}
                          accept={editDraft.adFormat === "video" ? "video/*" : "image/*"}
                          multiple={editDraft.adFormat === "carousel"}
                          onChange={handleEditMediaUpload}
                          disabled={editSaving}
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
                              disabled={editSaving}
                            >
                              Remove
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
                            <div className={styles.editMediaSkeletonFooter}>Uploading...</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {editError ? <p className={styles.error}>{editError}</p> : null}
                  </div>

                  <div className={styles.editActions}>
                    <button
                      type="button"
                      className={styles.secondaryBtn}
                      onClick={closeEditOverlay}
                      disabled={editSaving}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className={styles.primaryBtn}
                      onClick={() => void saveEditedDetails()}
                      disabled={!hasEditChanges || editSaving || isUploadingMedia}
                    >
                      Save changes
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {activeMedia ? (
              <div
                className={styles.mediaLightbox}
                role="dialog"
                aria-modal="true"
                onClick={() => setActiveMedia(null)}
              >
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

            <section className={styles.actionsCard}>
              <h2 className={styles.sectionTitle}>Campaign Actions</h2>

              <div className={styles.actionRow}>
                <div>
                  <p className={styles.actionTitle}>Upgrade boost and extend duration</p>
                  <p className={styles.actionHint}>
                    Choose package cards like Create Ads. Boost can only be upgraded, not downgraded.
                  </p>
                </div>

                <div className={styles.upgradePanel} ref={upgradePanelRef}>
                  <p className={styles.packageSectionLabel}>1. Boost strength</p>
                  <div className={styles.packageGrid}>
                    {BOOST_PACKAGES.map((item) => {
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
                          onClick={() => {
                            if (disabled) return;
                            setSelectedBoostUpgradeId(item.id);
                          }}
                          disabled={disabled}
                        >
                          <div className={styles.packageTopRow}>
                            <span className={styles.packageLabel}>{item.title}</span>
                            {item.highlight ? <span className={styles.packageBadge}>{item.highlight}</span> : null}
                          </div>
                          <span className={styles.packageAmount}>{money(item.price)}</span>
                          <span className={styles.packageHint}>{item.level}</span>
                          {item.price < currentBoostPackage.price ? (
                            <span className={styles.packageLock}>Not available for downgrade</span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>

                  <p className={styles.packageSectionLabel}>2. Extend campaign days</p>
                  <div className={styles.packageGrid}>
                    {DURATION_PACKAGES.map((item) => {
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
                              {item.days > 0 ? `${item.days} days` : "No extension"}
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
                      <span>Current boost</span>
                      <strong>{currentBoostPackage.title}</strong>
                    </div>
                    <div className={styles.totalRow}>
                      <span>Boost upgrade difference</span>
                      <strong>{money(boostUpgradeDelta)}</strong>
                    </div>
                    <div className={styles.totalRow}>
                      <span>Extend days package</span>
                      <strong>{money(durationUpgradeCost)}</strong>
                    </div>
                    <div className={styles.totalDivider} />
                    <div className={styles.totalRow}>
                      <span>Need to pay now</span>
                      <strong className={styles.totalValue}>{money(upgradeTotalCost)}</strong>
                    </div>
                    <div className={styles.totalRow}>
                      <span>New total budget</span>
                      <strong>{money(projectedBudget)}</strong>
                    </div>
                  </div>

                  {upgradeError ? <p className={styles.error}>{upgradeError}</p> : null}

                  <div className={styles.actionControls}>
                    <button
                      type="button"
                      className={styles.primaryBtn}
                      onClick={() => void startUpgradeCheckout()}
                      disabled={
                        saving ||
                        isCreatingUpgradeCheckout ||
                        !hasUpgradeSelection ||
                        (!detail.actions?.canChangeBoost && !detail.actions?.canExtend)
                      }
                    >
                      {isCreatingUpgradeCheckout ? "Creating checkout..." : "Pay with Stripe"}
                    </button>
                  </div>
                </div>
              </div>

              {detail.status !== "canceled" ? (
                <div className={styles.actionRow}>
                  <div>
                    <p className={styles.actionTitle}>Lifecycle Management</p>
                    <p className={styles.actionHint}>
                      Hide the campaign temporarily or reopen it when delivery should resume.
                    </p>
                  </div>
                  <div className={styles.actionControls}>
                    {detail.actions?.canPause ? (
                      <button
                        type="button"
                        className={styles.secondaryBtn}
                        disabled={saving}
                        onClick={() => setIsHideConfirmOpen(true)}
                      >
                        Hide Campaign
                      </button>
                    ) : null}

                    {!detail.actions?.canPause && detail.actions?.canResume ? (
                      <button
                        type="button"
                        className={styles.primaryBtn}
                        disabled={saving}
                        onClick={() => void runAction("resume_campaign")}
                      >
                        Reopen Campaign
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {success ? <p className={styles.success}>{success}</p> : null}
              {error ? <p className={styles.error}>{error}</p> : null}
            </section>

            {isHideConfirmOpen ? (
              <div
                className={styles.confirmOverlay}
                role="dialog"
                aria-modal="true"
                aria-label="Confirm hide campaign"
                onClick={() => setIsHideConfirmOpen(false)}
              >
                <div className={styles.confirmCard} onClick={(e) => e.stopPropagation()}>
                  <h3 className={styles.confirmTitle}>Hide this campaign?</h3>
                  <p className={styles.confirmBody}>
                    All reposts of this ads post will be removed. Before removal, all repost
                    likes and views will be merged into the original ads post.
                  </p>
                  <div className={styles.confirmActions}>
                    <button
                      type="button"
                      className={styles.secondaryBtn}
                      onClick={() => setIsHideConfirmOpen(false)}
                      disabled={saving}
                    >
                      Cancel
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
                      Confirm hide
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
