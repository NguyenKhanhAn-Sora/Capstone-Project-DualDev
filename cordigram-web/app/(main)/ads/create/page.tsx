"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import EmojiPicker from "emoji-picker-react";
import { useRequireAuth } from "@/hooks/use-require-auth";
import {
  createPost,
  createStripeCheckoutSession,
  type CreateStripeCheckoutSessionRequest,
  fetchCurrentProfile,
  getMyAdsCreationStatus,
  uploadMedia,
  uploadMediaBatch,
  type CurrentProfileResponse,
  type UploadMediaResponse,
} from "@/lib/api";
import styles from "./create-ads.module.css";

type Objective = "awareness" | "traffic" | "engagement" | "leads" | "sales" | "messages";
type AdFormat = "single" | "carousel" | "video";
type Cta =
  | "Learn More"
  | "Shop Now"
  | "Sign Up"
  | "Book Now"
  | "Contact Us";

type Interest = {
  id: string;
  label: string;
};

type SelectOption = {
  value: string;
  label: string;
};

type PublishValidationErrors = {
  primaryText?: string;
  headline?: string;
  destinationUrl?: string;
  media?: string;
};

type BoostPackage = {
  id: "light" | "standard" | "strong";
  title: string;
  level: string;
  price: number;
  highlight?: string;
};

type DurationPackage = {
  id: "d3" | "d7" | "d14" | "d30";
  days: number;
  price: number;
  note: string;
};

const OBJECTIVE_OPTIONS: Array<{
  value: Objective;
  label: string;
  desc: string;
}> = [
  {
    value: "awareness",
    label: "Awareness",
    desc: "Reach new people likely to remember your brand.",
  },
  {
    value: "traffic",
    label: "Traffic",
    desc: "Send people to your website or product page.",
  },
  {
    value: "engagement",
    label: "Engagement",
    desc: "Get more reactions, comments, and shares.",
  },
  {
    value: "leads",
    label: "Lead generation",
    desc: "Collect contact info from potential customers.",
  },
  {
    value: "sales",
    label: "Sales",
    desc: "Drive purchases and conversion actions.",
  },
  {
    value: "messages",
    label: "Messages",
    desc: "Start conversations with people interested in your offer.",
  },
];

const CTA_OPTIONS: Cta[] = [
  "Learn More",
  "Shop Now",
  "Sign Up",
  "Book Now",
  "Contact Us",
];

const FORMAT_OPTIONS: Array<{ value: AdFormat; label: string }> = [
  { value: "single", label: "Single image" },
  { value: "carousel", label: "Carousel" },
  { value: "video", label: "Video" },
];

const RECOMMENDED_INTERESTS: string[] = [
  "Technology",
  "Fashion",
  "Beauty",
  "Gaming",
  "Startup",
  "Education",
  "Fitness",
  "Food",
  "Travel",
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
  { id: "d3", days: 3, price: 29000, note: "Short burst" },
  { id: "d7", days: 7, price: 59000, note: "One week run" },
  { id: "d14", days: 14, price: 99000, note: "Sustained delivery" },
  { id: "d30", days: 30, price: 179000, note: "Full month coverage" },
];

const toCurrency = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);

function ChevronDownIcon() {
  return (
    <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path
        d="M7 10l5 5 5-5"
        stroke="currentColor"
        strokeWidth="2"
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

export default function AdsCreatePage() {
  const canRender = useRequireAuth();
  const router = useRouter();

  const [objective, setObjective] = useState<Objective>("traffic");
  const [adFormat, setAdFormat] = useState<AdFormat>("single");
  const [campaignName, setCampaignName] = useState("Student Promotion Campaign");
  const [primaryText, setPrimaryText] = useState(
    "Upgrade your setup with our newest collection. Limited launch offer available now.",
  );
  const [headline, setHeadline] = useState("Launch Offer - Save 30% Today");
  const [description, setDescription] = useState(
    "Premium quality products with fast nationwide shipping.",
  );
  const [destinationUrl, setDestinationUrl] = useState("https://example.com");
  const [cta, setCta] = useState<Cta>("Shop Now");
  const [selectedBoostId, setSelectedBoostId] = useState<BoostPackage["id"]>("standard");
  const [selectedDurationId, setSelectedDurationId] = useState<DurationPackage["id"]>("d7");
  const [ageMin, setAgeMin] = useState<number>(18);
  const [ageMax, setAgeMax] = useState<number>(35);
  const [locationText, setLocationText] = useState("Vietnam");
  const [countriesLoading, setCountriesLoading] = useState(true);
  const [countryOptions, setCountryOptions] = useState<string[]>(FALLBACK_COUNTRIES);
  const [interestDraft, setInterestDraft] = useState("");
  const [interests, setInterests] = useState<Interest[]>([
    { id: "i-tech", label: "Technology" },
    { id: "i-shopping", label: "Online Shopping" },
  ]);
  const [uploadedMedia, setUploadedMedia] = useState<UploadMediaResponse[]>([]);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [mediaUploadError, setMediaUploadError] = useState("");
  const [publishValidationErrors, setPublishValidationErrors] =
    useState<PublishValidationErrors>({});
  const [primaryEmojiOpen, setPrimaryEmojiOpen] = useState(false);
  const [publishMessage, setPublishMessage] = useState("");
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [isCreatingCheckout, setIsCreatingCheckout] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [hasAcceptedPaymentTerms, setHasAcceptedPaymentTerms] = useState(false);
  const [currentProfile, setCurrentProfile] = useState<CurrentProfileResponse | null>(null);
  const [hasCreatedAdsBefore, setHasCreatedAdsBefore] = useState(false);
  const [preparedAdPostId, setPreparedAdPostId] = useState<string | null>(null);
  const primaryEmojiRef = useRef<HTMLDivElement | null>(null);
  const primaryTextInputRef = useRef<HTMLTextAreaElement | null>(null);
  const primaryTextSelectionRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 });
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const carouselRef = useRef<HTMLDivElement | null>(null);
  const primaryTextFieldRef = useRef<HTMLDivElement | null>(null);
  const headlineFieldRef = useRef<HTMLLabelElement | null>(null);
  const destinationUrlFieldRef = useRef<HTMLLabelElement | null>(null);
  const mediaFieldRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!primaryEmojiOpen) return;

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (primaryEmojiRef.current?.contains(target)) return;
      setPrimaryEmojiOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPrimaryEmojiOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown, true);
    document.addEventListener("touchstart", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown, true);
      document.removeEventListener("touchstart", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [primaryEmojiOpen]);

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
    if (typeof window === "undefined") return;
    const token =
      window.localStorage.getItem("accessToken") ||
      window.localStorage.getItem("token");
    if (!token) return;

    let cancelled = false;
    fetchCurrentProfile({ token })
      .then((profile) => {
        if (cancelled) return;
        setCurrentProfile(profile);
      })
      .catch(() => {
        if (cancelled) return;
        setCurrentProfile(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const token =
      window.localStorage.getItem("accessToken") ||
      window.localStorage.getItem("token");
    if (!token) return;

    let cancelled = false;
    getMyAdsCreationStatus({ token })
      .then((result) => {
        if (cancelled) return;
        setHasCreatedAdsBefore(result.hasCreatedAds === true);
      })
      .catch(() => {
        if (cancelled) return;
        setHasCreatedAdsBefore(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedBoost = useMemo(
    () => BOOST_PACKAGES.find((item) => item.id === selectedBoostId) ?? null,
    [selectedBoostId],
  );

  const selectedDuration = useMemo(
    () => DURATION_PACKAGES.find((item) => item.id === selectedDurationId) ?? null,
    [selectedDurationId],
  );

  const totalBudget = useMemo(() => {
    const boost = selectedBoost?.price ?? 0;
    const duration = selectedDuration?.price ?? 0;
    return boost + duration;
  }, [selectedBoost, selectedDuration]);

  const locationOptions = useMemo<SelectOption[]>(() => {
    const sortedCountries = [...countryOptions].sort((a, b) => a.localeCompare(b, "en"));
    const base = sortedCountries.map((name) => ({ value: name, label: name }));
    const current = locationText.trim();
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
  }, [countryOptions, countriesLoading, locationText]);

  const ctaOptions = useMemo<SelectOption[]>(
    () => CTA_OPTIONS.map((item) => ({ value: item, label: item })),
    [],
  );

  const selectedObjectiveLabel = useMemo(
    () => OBJECTIVE_OPTIONS.find((item) => item.value === objective)?.label ?? "Objective",
    [objective],
  );

  const mediaInputConfig = useMemo(() => {
    if (adFormat === "video") {
      return {
        accept: "video/*",
        multiple: false,
        maxFiles: 1,
        label: "Upload one video",
      };
    }

    if (adFormat === "carousel") {
      return {
        accept: "image/*",
        multiple: true,
        maxFiles: 5,
        label: "Upload up to 5 images",
      };
    }

    return {
      accept: "image/*",
      multiple: false,
      maxFiles: 1,
      label: "Upload one image",
    };
  }, [adFormat]);

  useEffect(() => {
    setMediaUploadError("");
    setUploadedMedia((prev) => {
      if (adFormat === "video") {
        return prev.filter((item) => item.resourceType === "video").slice(0, 1);
      }

      const imageItems = prev.filter((item) => item.resourceType === "image");
      return adFormat === "single" ? imageItems.slice(0, 1) : imageItems.slice(0, 5);
    });
  }, [adFormat]);

  const handleCancel = () => {
    router.push("/ads");
  };

  const addInterest = (label: string) => {
    const cleaned = label.trim();
    if (!cleaned) return;
    const exists = interests.some(
      (item) => item.label.toLowerCase() === cleaned.toLowerCase(),
    );
    if (exists) {
      setInterestDraft("");
      return;
    }
    setInterests((prev) => [
      ...prev,
      { id: `i-${Date.now()}-${cleaned.toLowerCase().replace(/\s+/g, "-")}`, label: cleaned },
    ]);
    setInterestDraft("");
  };

  const removeInterest = (id: string) => {
    setInterests((prev) => prev.filter((item) => item.id !== id));
  };

  const scrollFieldToCenter = (element: HTMLElement | null) => {
    if (!element) return;
    element.scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "nearest",
    });
  };

  const insertPrimaryEmoji = (emoji: string) => {
    if (!emoji) return;

    const textarea = primaryTextInputRef.current;
    const hasLiveSelection =
      textarea &&
      typeof textarea.selectionStart === "number" &&
      typeof textarea.selectionEnd === "number" &&
      document.activeElement === textarea;

    const start = hasLiveSelection
      ? (textarea?.selectionStart ?? 0)
      : primaryTextSelectionRef.current.start;
    const end = hasLiveSelection
      ? (textarea?.selectionEnd ?? start)
      : primaryTextSelectionRef.current.end;

    setPrimaryText((value) => {
      return value.slice(0, start) + emoji + value.slice(end);
    });

    setPublishValidationErrors((prev) => ({ ...prev, primaryText: undefined }));

    const caret = start + emoji.length;
    primaryTextSelectionRef.current = { start: caret, end: caret };

    setTimeout(() => {
      const el = primaryTextInputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(caret, caret);
    }, 0);
  };

  const handlePublish = () => {
    const nextErrors: PublishValidationErrors = {};
    const trimmedPrimaryText = primaryText.trim();
    const trimmedHeadline = headline.trim();
    const trimmedDestinationUrl = destinationUrl.trim();

    if (!trimmedPrimaryText) {
      nextErrors.primaryText = "Primary text is required.";
    }

    if (!trimmedHeadline) {
      nextErrors.headline = "Headline is required.";
    }

    if (!trimmedDestinationUrl) {
      nextErrors.destinationUrl = "Destination URL is required.";
    } else {
      try {
        const parsed = new URL(trimmedDestinationUrl);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          nextErrors.destinationUrl = "Destination URL must start with http:// or https://.";
        }
      } catch {
        nextErrors.destinationUrl = "Destination URL is invalid.";
      }
    }

    if (uploadedMedia.length === 0) {
      nextErrors.media = "Please upload media before publishing.";
    }

    setPublishValidationErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setPaymentError("Please fill all required fields before payment.");

      const firstErrorKey = ([
        "primaryText",
        "headline",
        "destinationUrl",
        "media",
      ] as const).find((key) => Boolean(nextErrors[key]));

      if (firstErrorKey === "primaryText") {
        scrollFieldToCenter(primaryTextFieldRef.current);
      } else if (firstErrorKey === "headline") {
        scrollFieldToCenter(headlineFieldRef.current);
      } else if (firstErrorKey === "destinationUrl") {
        scrollFieldToCenter(destinationUrlFieldRef.current);
      } else if (firstErrorKey === "media") {
        scrollFieldToCenter(mediaFieldRef.current);
      }

      return;
    }

    setPaymentError("");
    setHasAcceptedPaymentTerms(false);
    setPaymentModalOpen(true);
  };

  const closePaymentModal = () => {
    if (isCreatingCheckout) return;
    setPaymentModalOpen(false);
  };

  const handleStartCheckout = async () => {
    if (!hasAcceptedPaymentTerms) {
      setPaymentError("Please accept the terms before continuing to payment.");
      return;
    }

    const token =
      typeof window !== "undefined"
        ? window.localStorage.getItem("accessToken") || window.localStorage.getItem("token")
        : null;

    if (!token) {
      setPaymentError("Please login again before payment.");
      return;
    }

    let promotedPostId = preparedAdPostId;
    if (!promotedPostId) {
      const creativeContent = [
        "[[AD_PRIMARY_TEXT]]",
        primaryText.trim(),
        "[[/AD_PRIMARY_TEXT]]",
        "",
        "[[AD_HEADLINE]]",
        headline.trim(),
        "[[/AD_HEADLINE]]",
        "",
        "[[AD_DESCRIPTION]]",
        description.trim(),
        "[[/AD_DESCRIPTION]]",
        "",
        "[[AD_CTA]]",
        cta.trim(),
        "[[/AD_CTA]]",
        "",
        "[[AD_URL]]",
        destinationUrl.trim(),
        "[[/AD_URL]]",
      ]
        .join("\n")
        .slice(0, 2200);

      const creativeMedia = uploadedMedia.map((item) => ({
        type: (item.resourceType === "video" ? "video" : "image") as
          | "image"
          | "video",
        url: item.secureUrl,
        metadata: {
          width: item.width,
          height: item.height,
          bytes: item.bytes,
          format: item.format,
        },
      }));

      try {
        const created = await createPost({
          token,
          payload: {
            content: creativeContent,
            media: creativeMedia,
            visibility: "private",
            allowComments: true,
            allowDownload: false,
            hideLikeCount: false,
          },
        });
        promotedPostId = created.id;
        setPreparedAdPostId(created.id);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to prepare ad creative for checkout.";
        setPaymentError(message);
        return;
      }
    }

    const payload: CreateStripeCheckoutSessionRequest = {
      amount: totalBudget,
      currency: "vnd",
      campaignName: campaignName.trim() || "Cordigram Ads Campaign",
      description: `${selectedBoost?.title ?? "Boost"} + ${selectedDuration?.days ?? 0} days`,
      objective,
      adFormat,
      boostPackageId: selectedBoostId,
      durationPackageId: selectedDurationId,
      promotedPostId,
      primaryText: primaryText.trim(),
      headline: headline.trim(),
      adDescription: description.trim(),
      destinationUrl: destinationUrl.trim(),
      cta,
      interests: interests.map((item) => item.label.trim()).filter(Boolean),
      locationText: locationText.trim(),
      ageMin,
      ageMax,
      placement: "home_feed",
      mediaUrls: uploadedMedia
        .map((item) => item.secureUrl || item.url)
        .filter((url): url is string => Boolean(url)),
    };

    setPaymentError("");
    setIsCreatingCheckout(true);
    try {
      const session = await createStripeCheckoutSession({ token, payload });
      if (!session.url) {
        setPaymentError("Unable to create Stripe checkout session.");
        return;
      }

      window.location.href = session.url;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to start checkout session.";
      setPaymentError(message);
    } finally {
      setIsCreatingCheckout(false);
    }
  };

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  const removeUploadedMedia = (index: number) => {
    setUploadedMedia((prev) => prev.filter((_, idx) => idx !== index));
  };

  const navigateCarousel = (direction: -1 | 1) => {
    const container = carouselRef.current;
    if (!container) return;
    const step = container.clientWidth;
    container.scrollBy({
      left: direction * step,
      behavior: "smooth",
    });
  };

  const handleMediaUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const pickedFiles = Array.from(event.target.files ?? []);
    event.target.value = "";

    if (pickedFiles.length === 0) return;

    const token =
      typeof window !== "undefined"
        ? window.localStorage.getItem("accessToken") || window.localStorage.getItem("token")
        : null;

    if (!token) {
      setMediaUploadError("Please login again to upload media.");
      return;
    }

    const validFiles = pickedFiles.filter((file) => {
      if (adFormat === "video") return file.type.startsWith("video/");
      return file.type.startsWith("image/");
    });

    if (validFiles.length === 0) {
      setMediaUploadError(
        adFormat === "video"
          ? "Please select a video file."
          : "Please select image files.",
      );
      return;
    }

    const remainingSlots =
      adFormat === "carousel"
        ? Math.max(mediaInputConfig.maxFiles - uploadedMedia.length, 0)
        : mediaInputConfig.maxFiles;

    if (remainingSlots === 0) {
      setMediaUploadError(
        adFormat === "carousel"
          ? "Carousel supports up to 5 images. Remove one to upload more."
          : "This format only supports one file.",
      );
      return;
    }

    const filesToUpload = validFiles.slice(0, remainingSlots);

    setMediaUploadError("");
    setPublishValidationErrors((prev) => ({ ...prev, media: undefined }));
    setIsUploadingMedia(true);
    try {
      const uploaded =
        filesToUpload.length === 1
          ? [await uploadMedia({ token, file: filesToUpload[0] })]
          : await uploadMediaBatch({ token, files: filesToUpload });

      const normalized = uploaded.map((item) => ({
        ...item,
        resourceType: item.resourceType === "video" ? "video" : "image",
      }));

      setUploadedMedia((prev) => {
        if (adFormat === "carousel") {
          return [...prev, ...normalized].slice(0, mediaInputConfig.maxFiles);
        }
        return normalized.slice(0, 1);
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Upload failed. Please try again.";
      setMediaUploadError(message);
    } finally {
      setIsUploadingMedia(false);
    }
  };

  if (!canRender) return null;

  return (
    <div className={styles.page}>
      <div className={styles.bgShape} aria-hidden />

      <header className={styles.topBar}>
        <div>
          <h1 className={styles.title}>Create Ad Campaign</h1>
          <p className={styles.subtitle}>
            Build your ad in a simple flow: objective, creative, audience, and package pricing.
          </p>
        </div>

        {hasCreatedAdsBefore ? (
          <div className={styles.topBarActions}>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={() => router.push("/ads")}
            >
              Back to dashboard
            </button>
          </div>
        ) : null}
      </header>

      <section className={styles.layout}>
        <div className={styles.formColumn}>
          <article className={styles.card}>
            <div className={styles.cardHead}>
              <h2>Choose Campaign Objective</h2>
              <span className={styles.pill}>Required</span>
            </div>

            <div className={styles.objectiveGrid}>
              {OBJECTIVE_OPTIONS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className={`${styles.objectiveCard} ${
                    objective === item.value ? styles.objectiveCardActive : ""
                  }`}
                  onClick={() => setObjective(item.value)}
                >
                  <span className={styles.objectiveName}>{item.label}</span>
                  <span className={styles.objectiveDesc}>{item.desc}</span>
                </button>
              ))}
            </div>
          </article>

          <article className={styles.card}>
            <div className={styles.cardHead}>
              <h2>Ad Creative</h2>
              <span className={styles.pill}>Main content</span>
            </div>

            <label className={styles.fieldLabel}>
              Campaign name
              <input
                className={styles.input}
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                placeholder="e.g. Back to school promo"
              />
            </label>

            <div className={styles.formatTabs}>
              {FORMAT_OPTIONS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className={`${styles.tabBtn} ${adFormat === item.value ? styles.tabBtnActive : ""}`}
                  onClick={() => setAdFormat(item.value)}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className={styles.fieldLabel} ref={primaryTextFieldRef}>
              <div className={styles.emojiRow}>
                <span>Primary text</span>
                <div className={styles.emojiWrap} ref={primaryEmojiRef}>
                  <button
                    type="button"
                    className={styles.emojiButton}
                    onClick={() => setPrimaryEmojiOpen((prev) => !prev)}
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
                  {primaryEmojiOpen ? (
                    <div className={styles.emojiPopover}>
                      <EmojiPicker
                        onEmojiClick={(emojiData) => {
                          insertPrimaryEmoji(emojiData.emoji || "");
                        }}
                        autoFocusSearch={false}
                        lazyLoadEmojis
                      />
                    </div>
                  ) : null}
                </div>
              </div>
              <textarea
                ref={primaryTextInputRef}
                className={styles.textarea}
                value={primaryText}
                onChange={(e) => {
                  setPrimaryText(e.target.value);
                  const start = e.target.selectionStart ?? e.target.value.length;
                  const end = e.target.selectionEnd ?? start;
                  primaryTextSelectionRef.current = { start, end };
                  setPublishValidationErrors((prev) => ({ ...prev, primaryText: undefined }));
                }}
                onSelect={(e) => {
                  const start = e.currentTarget.selectionStart ?? 0;
                  const end = e.currentTarget.selectionEnd ?? start;
                  primaryTextSelectionRef.current = { start, end };
                }}
                onClick={(e) => {
                  const start = e.currentTarget.selectionStart ?? 0;
                  const end = e.currentTarget.selectionEnd ?? start;
                  primaryTextSelectionRef.current = { start, end };
                }}
                onKeyUp={(e) => {
                  const start = e.currentTarget.selectionStart ?? 0;
                  const end = e.currentTarget.selectionEnd ?? start;
                  primaryTextSelectionRef.current = { start, end };
                }}
                onFocus={(e) => {
                  const start = e.currentTarget.selectionStart ?? 0;
                  const end = e.currentTarget.selectionEnd ?? start;
                  primaryTextSelectionRef.current = { start, end };
                }}
                onBlur={(e) => {
                  const start = e.currentTarget.selectionStart ?? 0;
                  const end = e.currentTarget.selectionEnd ?? start;
                  primaryTextSelectionRef.current = { start, end };
                }}
                rows={4}
              />
            </div>
            {publishValidationErrors.primaryText ? (
              <p className={styles.uploadError}>{publishValidationErrors.primaryText}</p>
            ) : null}

            <div className={styles.twoCols}>
              <label className={styles.fieldLabel} ref={headlineFieldRef}>
                Headline
                <input
                  className={styles.input}
                  value={headline}
                  onChange={(e) => {
                    setHeadline(e.target.value);
                    setPublishValidationErrors((prev) => ({ ...prev, headline: undefined }));
                  }}
                />
              </label>

              <label className={styles.fieldLabel}>
                CTA button
                <CustomSelect
                  value={cta}
                  options={ctaOptions}
                  onChange={(value) => setCta(value as Cta)}
                  placeholder="Select CTA"
                />
              </label>
            </div>

            <label className={styles.fieldLabel}>
              Description
              <input
                className={styles.input}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>

            <label className={styles.fieldLabel} ref={destinationUrlFieldRef}>
              Destination URL
              <input
                className={styles.input}
                value={destinationUrl}
                onChange={(e) => {
                  setDestinationUrl(e.target.value);
                  setPublishValidationErrors((prev) => ({ ...prev, destinationUrl: undefined }));
                }}
                placeholder="https://"
              />
            </label>
            {publishValidationErrors.headline ? (
              <p className={styles.uploadError}>{publishValidationErrors.headline}</p>
            ) : null}
            {publishValidationErrors.destinationUrl ? (
              <p className={styles.uploadError}>{publishValidationErrors.destinationUrl}</p>
            ) : null}

            <div className={styles.mediaPlaceholder} ref={mediaFieldRef}>
              <div className={styles.mediaIcon}>+</div>
              <div>
                <p className={styles.mediaTitle}>Upload media</p>
                <p className={styles.mediaHint}>
                  {mediaInputConfig.label}. Files are uploaded to server and reflected in preview.
                </p>
              </div>
              <input
                ref={fileInputRef}
                className={styles.mediaInput}
                type="file"
                accept={mediaInputConfig.accept}
                multiple={mediaInputConfig.multiple}
                onChange={handleMediaUpload}
              />
              <button
                type="button"
                className={styles.smallBtn}
                onClick={openFilePicker}
                disabled={isUploadingMedia}
              >
                {isUploadingMedia ? "Uploading..." : "Choose files"}
              </button>
            </div>

            {uploadedMedia.length > 0 ? (
              <div className={styles.uploadedMediaList}>
                {uploadedMedia.map((item, index) => (
                  <div key={`${item.publicId || item.url}-${index}`} className={styles.uploadedMediaItem}>
                    <span>
                      {item.resourceType === "video" ? "Video" : "Image"} {index + 1}
                    </span>
                    <button
                      type="button"
                      className={styles.removeMediaBtn}
                      onClick={() => removeUploadedMedia(index)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            {publishValidationErrors.media ? (
              <p className={styles.uploadError}>{publishValidationErrors.media}</p>
            ) : null}

            {mediaUploadError ? <p className={styles.uploadError}>{mediaUploadError}</p> : null}
          </article>

          <article className={styles.card}>
            <div className={styles.cardHead}>
              <h2>Audience Targeting</h2>
              <span className={styles.pill}>Targeting</span>
            </div>

            <div className={styles.twoCols}>
              <label className={styles.fieldLabel}>
                Location
                <CustomSelect
                  value={locationText}
                  options={locationOptions}
                  onChange={(value) => setLocationText(value)}
                  placeholder="Select location"
                  disabled={countriesLoading && locationOptions.length <= 1}
                />
              </label>

              <div className={styles.fieldLabel}>
                Age range
                <div className={styles.ageRow}>
                  <input
                    className={styles.input}
                    type="number"
                    min={13}
                    max={65}
                    value={ageMin}
                    onChange={(e) => setAgeMin(Number(e.target.value || 13))}
                  />
                  <span className={styles.ageSep}>to</span>
                  <input
                    className={styles.input}
                    type="number"
                    min={13}
                    max={65}
                    value={ageMax}
                    onChange={(e) => setAgeMax(Number(e.target.value || 65))}
                  />
                </div>
              </div>
            </div>

            <div className={styles.fieldLabel}>
              Interests
              <div className={styles.interestComposer}>
                <input
                  className={styles.input}
                  value={interestDraft}
                  onChange={(e) => setInterestDraft(e.target.value)}
                  placeholder="Type an interest and press Add"
                />
                <button
                  type="button"
                  className={styles.smallBtn}
                  onClick={() => addInterest(interestDraft)}
                >
                  Add
                </button>
              </div>

              <div className={styles.chipRow}>
                {interests.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={styles.chip}
                    onClick={() => removeInterest(item.id)}
                    title="Remove"
                  >
                    {item.label} x
                  </button>
                ))}
              </div>

              <div className={styles.recoRow}>
                {RECOMMENDED_INTERESTS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={styles.recoChip}
                    onClick={() => addInterest(item)}
                  >
                    + {item}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.feedOnlyNotice}>
              <span className={styles.feedOnlyTitle}>Placement</span>
              <span className={styles.feedOnlyText}>
                This ad will be delivered only on Home Feed.
              </span>
            </div>
          </article>

          <article className={styles.card}>
            <h3 className={styles.estimationTitle}>Promotion package</h3>

            <p className={styles.packageSectionLabel}>1. Boost strength</p>

            <div className={styles.quickBudgetGrid}>
              {BOOST_PACKAGES.map((item) => {
                const active = item.id === selectedBoostId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`${styles.quickBudgetBtn} ${active ? styles.quickBudgetBtnActive : ""}`}
                    onClick={() => setSelectedBoostId(item.id)}
                  >
                    <div className={styles.packageTopRow}>
                      <span className={styles.quickBudgetLabel}>{item.title}</span>
                      {item.highlight ? <span className={styles.packageBadge}>{item.highlight}</span> : null}
                    </div>
                    <span className={styles.quickBudgetAmount}>{toCurrency(item.price)}</span>
                    <span className={styles.quickBudgetNote}>{item.level}</span>
                    <span className={styles.quickBudgetHint}>Controls how strongly your ad is boosted in Home Feed.</span>
                  </button>
                );
              })}
            </div>

            <p className={styles.packageSectionLabel}>2. Duration package</p>

            <div className={styles.quickBudgetGrid}>
              {DURATION_PACKAGES.map((item) => {
                const active = item.id === selectedDurationId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`${styles.quickBudgetBtn} ${active ? styles.quickBudgetBtnActive : ""}`}
                    onClick={() => setSelectedDurationId(item.id)}
                  >
                    <div className={styles.packageTopRow}>
                      <span className={styles.quickBudgetLabel}>{item.days} days</span>
                    </div>
                    <span className={styles.quickBudgetAmount}>{toCurrency(item.price)}</span>
                    <span className={styles.quickBudgetHint}>{item.note}</span>
                  </button>
                );
              })}
            </div>

            <div className={styles.totalCard}>
              <div className={styles.totalRow}>
                <span>Boost package</span>
                <strong>{toCurrency(selectedBoost?.price ?? 0)}</strong>
              </div>
              <div className={styles.totalRow}>
                <span>Duration package</span>
                <strong>{toCurrency(selectedDuration?.price ?? 0)}</strong>
              </div>
              <div className={styles.totalDivider} />
              <div className={styles.totalRow}>
                <span>Total cost</span>
                <strong className={styles.totalValue}>{toCurrency(totalBudget)}</strong>
              </div>
              <p className={styles.helperSummary}>
                You selected <strong>{selectedBoost?.title}</strong> for <strong>{selectedDuration?.days} days</strong>.
              </p>
            </div>
          </article>

          {publishMessage ? <p className={styles.publishInfo}>{publishMessage}</p> : null}

          <footer className={styles.bottomActionBar}>
            <button type="button" className={styles.secondaryBtn} onClick={handleCancel}>
              Cancel
            </button>
            <button type="button" className={styles.primaryBtn} onClick={handlePublish}>
              Publish Ad
            </button>
          </footer>

        </div>

        <aside className={styles.previewColumn}>
          <article className={styles.previewCard}>
            <div className={styles.previewHead}>
              <h3>Live preview</h3>
              <span className={styles.previewBadge}>Sponsored</span>
            </div>

            <div className={styles.previewPost}>
              <div className={styles.previewAuthorRow}>
                {currentProfile?.avatarUrl ? (
                  <img
                    className={styles.previewAvatar}
                    src={currentProfile.avatarUrl}
                    alt={currentProfile.displayName || currentProfile.username || "User avatar"}
                  />
                ) : (
                  <span className={styles.previewAvatar}>
                    {(currentProfile?.displayName || currentProfile?.username || "U")
                      .charAt(0)
                      .toUpperCase()}
                  </span>
                )}
                <div>
                  <p className={styles.previewName}>
                    {currentProfile?.displayName || "Display name"}
                  </p>
                  <p className={styles.previewMeta}>
                    @{currentProfile?.username || "username"} • Sponsored
                  </p>
                </div>
              </div>

              <p className={styles.previewText}>{primaryText || "Your primary text will appear here."}</p>

              <div className={styles.previewMedia}>
                {uploadedMedia.length === 0 ? (
                  <span>{adFormat === "video" ? "Video preview" : "Creative preview"}</span>
                ) : null}

                {uploadedMedia.length > 0 && adFormat === "video" ? (
                  <video
                    className={styles.previewVideo}
                    src={uploadedMedia[0].secureUrl || uploadedMedia[0].url}
                    controls
                    playsInline
                  />
                ) : null}

                {uploadedMedia.length > 0 && adFormat === "single" ? (
                  <img
                    className={styles.previewImage}
                    src={uploadedMedia[0].secureUrl || uploadedMedia[0].url}
                    alt="Ad creative preview"
                  />
                ) : null}

                {uploadedMedia.length > 0 && adFormat === "carousel" ? (
                  <div className={styles.previewCarouselWrap}>
                    <div className={styles.previewCarousel} ref={carouselRef}>
                      {uploadedMedia.slice(0, 5).map((item, index) => (
                        <img
                          key={`${item.publicId || item.url}-${index}`}
                          className={styles.previewCarouselImage}
                          src={item.secureUrl || item.url}
                          alt={`Carousel creative ${index + 1}`}
                        />
                      ))}
                    </div>

                    {uploadedMedia.length > 1 ? (
                      <>
                        <button
                          type="button"
                          className={`${styles.carouselNavBtn} ${styles.carouselNavPrev}`}
                          onClick={() => navigateCarousel(-1)}
                          aria-label="Previous carousel image"
                        >
                          ‹
                        </button>
                        <button
                          type="button"
                          className={`${styles.carouselNavBtn} ${styles.carouselNavNext}`}
                          onClick={() => navigateCarousel(1)}
                          aria-label="Next carousel image"
                        >
                          ›
                        </button>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className={styles.previewFooter}>
                <div>
                  <p className={styles.previewHeadline}>{headline || "Headline"}</p>
                  <p className={styles.previewDescription}>{description || "Description"}</p>
                </div>
                <button type="button" className={styles.previewCtaBtn}>{cta}</button>
              </div>
            </div>
          </article>
        </aside>
      </section>

      {paymentModalOpen ? (
        <div className={styles.paymentOverlay} role="dialog" aria-modal="true" aria-label="Payment">
          <div className={styles.paymentDialog}>
            <div className={styles.paymentHead}>
              <h3>Confirm Payment</h3>
              <button
                type="button"
                className={styles.paymentCloseBtn}
                onClick={closePaymentModal}
                disabled={isCreatingCheckout}
                aria-label="Close payment modal"
              >
                x
              </button>
            </div>

            <p className={styles.paymentSubtext}>
              You will be redirected to Stripe Checkout to complete payment.
            </p>

            <div className={styles.paymentSummary}>
              <div className={styles.paymentRow}>
                <span>Objective</span>
                <strong>{selectedObjectiveLabel}</strong>
              </div>
              <div className={styles.paymentRow}>
                <span>Ad format</span>
                <strong>{adFormat}</strong>
              </div>
              <div className={styles.paymentRow}>
                <span>Boost package</span>
                <strong>{toCurrency(selectedBoost?.price ?? 0)}</strong>
              </div>
              <div className={styles.paymentRow}>
                <span>Duration package</span>
                <strong>{toCurrency(selectedDuration?.price ?? 0)}</strong>
              </div>
              <div className={styles.paymentDivider} />
              <div className={styles.paymentRow}>
                <span>Total</span>
                <strong className={styles.paymentTotal}>{toCurrency(totalBudget)}</strong>
              </div>
            </div>

            <label className={styles.paymentTermsRow}>
              <input
                type="checkbox"
                className={styles.paymentTermsCheckbox}
                checked={hasAcceptedPaymentTerms}
                onChange={(event) => {
                  setHasAcceptedPaymentTerms(event.target.checked);
                  if (event.target.checked) setPaymentError("");
                }}
                disabled={isCreatingCheckout}
              />
              <span className={styles.paymentTermsText}>
                I agree to the{" "}
                <Link
                  href="/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.paymentTermsLink}
                >
                  Term
                </Link>{" "}
                and advertising rules of Cordigram.
              </span>
            </label>

            {paymentError ? <p className={styles.paymentError}>{paymentError}</p> : null}

            <div className={styles.paymentActions}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={closePaymentModal}
                disabled={isCreatingCheckout}
              >
                Back
              </button>
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={handleStartCheckout}
                disabled={isCreatingCheckout || !hasAcceptedPaymentTerms}
              >
                {isCreatingCheckout ? "Creating checkout..." : "Pay with Stripe"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
