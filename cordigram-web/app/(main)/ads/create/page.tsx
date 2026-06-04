"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
  ageRange?: string;
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

const OBJECTIVE_KEYS: Objective[] = [
  "awareness",
  "traffic",
  "engagement",
  "leads",
  "sales",
  "messages",
];

const CTA_OPTIONS: Cta[] = [
  "Learn More",
  "Shop Now",
  "Sign Up",
  "Book Now",
  "Contact Us",
];

const FORMAT_KEYS: AdFormat[] = ["single", "carousel", "video"];

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

const BOOST_KEYS: Array<{ id: BoostPackage["id"]; price: number }> = [
  { id: "light", price: 79000 },
  { id: "standard", price: 149000 },
  { id: "strong", price: 299000 },
];

const DURATION_KEYS: Array<{ id: DurationPackage["id"]; days: number; price: number }> = [
  { id: "d3", days: 3, price: 29000 },
  { id: "d7", days: 7, price: 59000 },
  { id: "d14", days: 14, price: 99000 },
  { id: "d30", days: 30, price: 179000 },
];

const PRIMARY_TEXT_MAX = 500;
const HEADLINE_MAX = 100;
const DESCRIPTION_MAX = 200;

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
  const t = useTranslations("ads.create");

  const [objective, setObjective] = useState<Objective>("traffic");
  const [adFormat, setAdFormat] = useState<AdFormat>("single");
  const [campaignName, setCampaignName] = useState("");
  const [primaryText, setPrimaryText] = useState("");
  const [headline, setHeadline] = useState("");
  const [description, setDescription] = useState("");
  const [destinationUrl, setDestinationUrl] = useState("");
  const [cta, setCta] = useState<Cta>("Learn More");
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
  const ageFieldRef = useRef<HTMLDivElement | null>(null);

  // Build translated objective options
  const objectiveOptions = useMemo(
    () =>
      OBJECTIVE_KEYS.map((key) => ({
        value: key,
        label: t(`objective.options.${key}.label`),
        desc: t(`objective.options.${key}.desc`),
      })),
    [t],
  );

  // Build translated format options
  const formatOptions = useMemo(
    () =>
      FORMAT_KEYS.map((key) => ({
        value: key,
        label: t(`creative.formatOptions.${key}`),
      })),
    [t],
  );

  // Build translated boost packages
  const boostPackages = useMemo<BoostPackage[]>(
    () =>
      BOOST_KEYS.map(({ id, price }) => ({
        id,
        price,
        title: t(`package.boosts.${id}.title`),
        level: t(`package.boosts.${id}.level`),
        highlight: t(`package.boosts.${id}.highlight`),
      })),
    [t],
  );

  // Build translated duration packages
  const durationPackages = useMemo<DurationPackage[]>(
    () =>
      DURATION_KEYS.map(({ id, days, price }) => ({
        id,
        days,
        price,
        note: t(`package.durations.${id}`),
      })),
    [t],
  );

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
    () => boostPackages.find((item) => item.id === selectedBoostId) ?? null,
    [boostPackages, selectedBoostId],
  );

  const selectedDuration = useMemo(
    () => durationPackages.find((item) => item.id === selectedDurationId) ?? null,
    [durationPackages, selectedDurationId],
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
        label: countriesLoading ? t("audience.loadingCountries") : t("audience.selectLocation"),
      },
      ...base,
    ];
  }, [countryOptions, countriesLoading, locationText, t]);

  const ctaOptions = useMemo<SelectOption[]>(
    () => CTA_OPTIONS.map((item) => ({ value: item, label: item })),
    [],
  );

  const selectedObjectiveLabel = useMemo(
    () => objectiveOptions.find((item) => item.value === objective)?.label ?? t("objective.title"),
    [objective, objectiveOptions, t],
  );

  const previewDomain = useMemo(() => {
    const url = destinationUrl.trim();
    if (!url) return "";
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return url.replace(/^https?:\/\//i, "").split("/")[0];
    }
  }, [destinationUrl]);

  const mediaInputConfig = useMemo(() => {
    if (adFormat === "video") {
      return {
        accept: "video/*",
        multiple: false,
        maxFiles: 1,
        label: t("creative.mediaConfig.video"),
      };
    }

    if (adFormat === "carousel") {
      return {
        accept: "image/*",
        multiple: true,
        maxFiles: 5,
        label: t("creative.mediaConfig.carousel"),
      };
    }

    return {
      accept: "image/*",
      multiple: false,
      maxFiles: 1,
      label: t("creative.mediaConfig.single"),
    };
  }, [adFormat, t]);

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

  // Reset cached post ID whenever creative content changes to prevent stale creative being submitted
  useEffect(() => {
    setPreparedAdPostId(null);
  }, [primaryText, headline, description, cta, destinationUrl, uploadedMedia]);

  const handleCancel = () => {
    router.push("/ads");
  };

  const handleFormatChange = (newFormat: AdFormat) => {
    if (newFormat === adFormat) return;
    if (uploadedMedia.length > 0) {
      if (!window.confirm(t("validation.formatChangeClearMedia"))) return;
    }
    setAdFormat(newFormat);
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
      nextErrors.primaryText = t("validation.primaryTextRequired");
    }

    if (!trimmedHeadline) {
      nextErrors.headline = t("validation.headlineRequired");
    }

    if (!trimmedDestinationUrl) {
      nextErrors.destinationUrl = t("validation.destinationUrlRequired");
    } else {
      try {
        const parsed = new URL(trimmedDestinationUrl);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          nextErrors.destinationUrl = t("validation.destinationUrlInvalidProtocol");
        }
      } catch {
        nextErrors.destinationUrl = t("validation.destinationUrlInvalid");
      }
    }

    if (uploadedMedia.length === 0) {
      nextErrors.media = t("validation.mediaRequired");
    }

    if (ageMin >= ageMax) {
      nextErrors.ageRange = t("validation.ageRangeInvalid");
    }

    setPublishValidationErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setPaymentError(t("validation.fillRequired"));

      const firstErrorKey = ([
        "primaryText",
        "headline",
        "destinationUrl",
        "media",
        "ageRange",
      ] as const).find((key) => Boolean(nextErrors[key]));

      if (firstErrorKey === "primaryText") {
        scrollFieldToCenter(primaryTextFieldRef.current);
      } else if (firstErrorKey === "headline") {
        scrollFieldToCenter(headlineFieldRef.current);
      } else if (firstErrorKey === "destinationUrl") {
        scrollFieldToCenter(destinationUrlFieldRef.current);
      } else if (firstErrorKey === "media") {
        scrollFieldToCenter(mediaFieldRef.current);
      } else if (firstErrorKey === "ageRange") {
        scrollFieldToCenter(ageFieldRef.current);
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
      setPaymentError(t("payment.acceptTermsFirst"));
      return;
    }

    const token =
      typeof window !== "undefined"
        ? window.localStorage.getItem("accessToken") || window.localStorage.getItem("token")
        : null;

    if (!token) {
      setPaymentError(t("payment.loginBeforePayment"));
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
            kind: "ads",
          },
        });
        promotedPostId = created.id;
        setPreparedAdPostId(created.id);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : t("validation.prepareCreativeFailed");
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
        setPaymentError(t("payment.checkoutSessionFailed"));
        return;
      }

      window.location.href = session.url;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("payment.checkoutFailed");
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
      setMediaUploadError(t("validation.loginToUpload"));
      return;
    }

    const validFiles = pickedFiles.filter((file) => {
      if (adFormat === "video") return file.type.startsWith("video/");
      return file.type.startsWith("image/");
    });

    if (validFiles.length === 0) {
      setMediaUploadError(
        adFormat === "video"
          ? t("validation.selectVideoFile")
          : t("validation.selectImageFiles"),
      );
      return;
    }

    const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
    const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
    const oversized = validFiles.find((file) =>
      file.size > (adFormat === "video" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES),
    );
    if (oversized) {
      setMediaUploadError(t("validation.fileTooLarge"));
      return;
    }

    const remainingSlots =
      adFormat === "carousel"
        ? Math.max(mediaInputConfig.maxFiles - uploadedMedia.length, 0)
        : mediaInputConfig.maxFiles;

    if (remainingSlots === 0) {
      setMediaUploadError(
        adFormat === "carousel"
          ? t("validation.carouselLimit")
          : t("validation.singleFileOnly"),
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
        error instanceof Error ? error.message : t("validation.uploadFailed");
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
          <h1 className={styles.title}>{t("title")}</h1>
          <p className={styles.subtitle}>{t("subtitle")}</p>
        </div>

        {hasCreatedAdsBefore ? (
          <div className={styles.topBarActions}>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={() => router.push("/ads")}
            >
              {t("backToDashboard")}
            </button>
          </div>
        ) : null}
      </header>

      <section className={styles.layout}>
        <div className={styles.formColumn}>
          <article className={styles.card}>
            <div className={styles.cardHead}>
              <h2>{t("objective.title")}</h2>
              <span className={styles.pill}>{t("objective.required")}</span>
            </div>

            <div className={styles.objectiveGrid}>
              {objectiveOptions.map((item) => (
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
              <h2>{t("creative.title")}</h2>
              <span className={styles.pill}>{t("creative.mainContent")}</span>
            </div>

            <label className={styles.fieldLabel}>
              {t("creative.campaignName")}
              <input
                className={styles.input}
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                placeholder={t("creative.campaignNamePlaceholder")}
              />
            </label>

            <div className={styles.formatTabs}>
              {formatOptions.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className={`${styles.tabBtn} ${adFormat === item.value ? styles.tabBtnActive : ""}`}
                  onClick={() => handleFormatChange(item.value as AdFormat)}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className={styles.fieldLabel} ref={primaryTextFieldRef}>
              <div className={styles.emojiRow}>
                <span>{t("creative.primaryText")}</span>
                <div className={styles.emojiWrap} ref={primaryEmojiRef}>
                  <button
                    type="button"
                    className={styles.emojiButton}
                    onClick={() => setPrimaryEmojiOpen((prev) => !prev)}
                    aria-label={t("creative.addEmoji")}
                  >
                    <svg
                      aria-label={t("creative.emojiIcon")}
                      fill="currentColor"
                      height="20"
                      role="img"
                      viewBox="0 0 24 24"
                      width="20"
                    >
                      <title>{t("creative.emojiIcon")}</title>
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
                maxLength={PRIMARY_TEXT_MAX}
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
              <span
                className={`${styles.charCounter} ${primaryText.length >= PRIMARY_TEXT_MAX ? styles.charCounterOver : ""}`}
              >
                {primaryText.length} / {PRIMARY_TEXT_MAX}
              </span>
            </div>
            {publishValidationErrors.primaryText ? (
              <p className={styles.uploadError}>{publishValidationErrors.primaryText}</p>
            ) : null}

            <div className={styles.twoCols}>
              <label className={styles.fieldLabel} ref={headlineFieldRef}>
                {t("creative.headline")}
                <input
                  className={styles.input}
                  value={headline}
                  maxLength={HEADLINE_MAX}
                  onChange={(e) => {
                    setHeadline(e.target.value);
                    setPublishValidationErrors((prev) => ({ ...prev, headline: undefined }));
                  }}
                />
                <span
                  className={`${styles.charCounter} ${headline.length >= HEADLINE_MAX ? styles.charCounterOver : ""}`}
                >
                  {headline.length} / {HEADLINE_MAX}
                </span>
              </label>

              <label className={styles.fieldLabel}>
                {t("creative.ctaButton")}
                <CustomSelect
                  value={cta}
                  options={ctaOptions}
                  onChange={(value) => setCta(value as Cta)}
                  placeholder={t("creative.selectCta")}
                />
              </label>
            </div>
            {publishValidationErrors.headline ? (
              <p className={styles.uploadError}>{publishValidationErrors.headline}</p>
            ) : null}

            <label className={styles.fieldLabel}>
              {t("creative.description")}
              <input
                className={styles.input}
                value={description}
                maxLength={DESCRIPTION_MAX}
                onChange={(e) => setDescription(e.target.value)}
              />
              <span
                className={`${styles.charCounter} ${description.length >= DESCRIPTION_MAX ? styles.charCounterOver : ""}`}
              >
                {description.length} / {DESCRIPTION_MAX}
              </span>
            </label>

            <label className={styles.fieldLabel} ref={destinationUrlFieldRef}>
              {t("creative.destinationUrl")}
              <input
                className={styles.input}
                value={destinationUrl}
                onChange={(e) => {
                  setDestinationUrl(e.target.value);
                  setPublishValidationErrors((prev) => ({ ...prev, destinationUrl: undefined }));
                }}
                placeholder={t("creative.destinationUrlPlaceholder")}
              />
            </label>
            {publishValidationErrors.destinationUrl ? (
              <p className={styles.uploadError}>{publishValidationErrors.destinationUrl}</p>
            ) : null}

            <div className={styles.mediaPlaceholder} ref={mediaFieldRef}>
              <div className={styles.mediaIcon}>+</div>
              <div>
                <p className={styles.mediaTitle}>{t("creative.uploadMedia")}</p>
                <p className={styles.mediaHint}>
                  {mediaInputConfig.label}. {t("creative.uploadHintSuffix")}
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
                {isUploadingMedia ? t("creative.uploading") : t("creative.chooseFiles")}
              </button>
            </div>

            {uploadedMedia.length > 0 ? (
              <div className={styles.uploadedMediaList}>
                {uploadedMedia.map((item, index) => (
                  <div key={`${item.publicId || item.url}-${index}`} className={styles.uploadedMediaItem}>
                    <span>
                      {item.resourceType === "video" ? t("creative.video") : t("creative.image")} {index + 1}
                    </span>
                    <button
                      type="button"
                      className={styles.removeMediaBtn}
                      onClick={() => removeUploadedMedia(index)}
                    >
                      {t("creative.remove")}
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
              <h2>{t("audience.title")}</h2>
              <span className={styles.pill}>{t("audience.targeting")}</span>
            </div>

            <div className={styles.twoCols}>
              <label className={styles.fieldLabel}>
                {t("audience.location")}
                <CustomSelect
                  value={locationText}
                  options={locationOptions}
                  onChange={(value) => setLocationText(value)}
                  placeholder={t("audience.selectLocation")}
                  disabled={countriesLoading && locationOptions.length <= 1}
                />
              </label>

              <div className={styles.fieldLabel} ref={ageFieldRef}>
                {t("audience.ageRange")}
                <div className={styles.ageRow}>
                  <input
                    className={styles.input}
                    type="number"
                    min={13}
                    max={65}
                    value={ageMin}
                    onChange={(e) => {
                      setAgeMin(Number(e.target.value || 13));
                      setPublishValidationErrors((prev) => ({ ...prev, ageRange: undefined }));
                    }}
                  />
                  <span className={styles.ageSep}>{t("audience.ageTo")}</span>
                  <input
                    className={styles.input}
                    type="number"
                    min={13}
                    max={65}
                    value={ageMax}
                    onChange={(e) => {
                      setAgeMax(Number(e.target.value || 65));
                      setPublishValidationErrors((prev) => ({ ...prev, ageRange: undefined }));
                    }}
                  />
                </div>
                {publishValidationErrors.ageRange ? (
                  <p className={styles.uploadError}>{publishValidationErrors.ageRange}</p>
                ) : null}
              </div>
            </div>

            <div className={styles.fieldLabel}>
              {t("audience.interests")}
              <div className={styles.interestComposer}>
                <input
                  className={styles.input}
                  value={interestDraft}
                  onChange={(e) => setInterestDraft(e.target.value)}
                  placeholder={t("audience.interestPlaceholder")}
                />
                <button
                  type="button"
                  className={styles.smallBtn}
                  onClick={() => addInterest(interestDraft)}
                >
                  {t("audience.add")}
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
              <span className={styles.feedOnlyTitle}>{t("audience.placement")}</span>
              <span className={styles.feedOnlyText}>{t("audience.placementText")}</span>
            </div>
          </article>

          <article className={styles.card}>
            <h3 className={styles.estimationTitle}>{t("package.title")}</h3>

            <p className={styles.packageSectionLabel}>{t("package.boostStrength")}</p>

            <div className={styles.quickBudgetGrid}>
              {boostPackages.map((item) => {
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
                    <span className={styles.quickBudgetHint}>{t("package.boostHint")}</span>
                  </button>
                );
              })}
            </div>

            <p className={styles.packageSectionLabel}>{t("package.durationPackage")}</p>

            <div className={styles.quickBudgetGrid}>
              {durationPackages.map((item) => {
                const active = item.id === selectedDurationId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`${styles.quickBudgetBtn} ${active ? styles.quickBudgetBtnActive : ""}`}
                    onClick={() => setSelectedDurationId(item.id)}
                  >
                    <div className={styles.packageTopRow}>
                      <span className={styles.quickBudgetLabel}>{t("package.days", { count: item.days })}</span>
                    </div>
                    <span className={styles.quickBudgetAmount}>{toCurrency(item.price)}</span>
                    <span className={styles.quickBudgetHint}>{item.note}</span>
                  </button>
                );
              })}
            </div>

            <div className={styles.totalCard}>
              <div className={styles.totalRow}>
                <span>{t("package.boostPackageLabel")}</span>
                <strong>{toCurrency(selectedBoost?.price ?? 0)}</strong>
              </div>
              <div className={styles.totalRow}>
                <span>{t("package.durationPackageLabel")}</span>
                <strong>{toCurrency(selectedDuration?.price ?? 0)}</strong>
              </div>
              <div className={styles.totalDivider} />
              <div className={styles.totalRow}>
                <span>{t("package.totalCost")}</span>
                <strong className={styles.totalValue}>{toCurrency(totalBudget)}</strong>
              </div>
              <p className={styles.helperSummary}>
                {t("package.selected", {
                  boost: selectedBoost?.title ?? "",
                  days: selectedDuration?.days ?? 0,
                })}
              </p>
            </div>
          </article>

          <footer className={styles.bottomActionBar}>
            <button type="button" className={styles.secondaryBtn} onClick={handleCancel}>
              {t("cancel")}
            </button>
            <button type="button" className={styles.primaryBtn} onClick={handlePublish}>
              {t("publish")}
            </button>
          </footer>

        </div>

        <aside className={styles.previewColumn}>
          <article className={styles.previewCard}>
            <div className={styles.previewHead}>
              <h3>{t("preview.title")}</h3>
              <span className={styles.previewBadge}>{t("preview.sponsored")}</span>
            </div>

            <div className={styles.previewPost}>
              <div className={styles.previewTopSection}>
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
                      @{currentProfile?.username || "username"} • {t("preview.sponsored")}
                    </p>
                  </div>
                </div>

                <p className={styles.previewText}>{primaryText || t("preview.primaryTextPlaceholder")}</p>
              </div>

              <div className={`${styles.previewMedia} ${uploadedMedia.length === 0 ? styles.previewMediaEmpty : ""}`}>
                {uploadedMedia.length === 0 ? (
                  <span>{adFormat === "video" ? t("creative.videoPreview") : t("creative.creativePreview")}</span>
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
                <div style={{ minWidth: 0 }}>
                  {previewDomain ? (
                    <p className={styles.previewDomain}>{previewDomain}</p>
                  ) : null}
                  <p className={styles.previewHeadline}>{headline || t("preview.headlinePlaceholder")}</p>
                  <p className={styles.previewDescription}>{description || t("preview.descriptionPlaceholder")}</p>
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
              <h3>{t("payment.title")}</h3>
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

            <p className={styles.paymentSubtext}>{t("payment.subtitle")}</p>

            <div className={styles.paymentSummary}>
              <div className={styles.paymentRow}>
                <span>{t("payment.objective")}</span>
                <strong>{selectedObjectiveLabel}</strong>
              </div>
              <div className={styles.paymentRow}>
                <span>{t("payment.adFormat")}</span>
                <strong>{formatOptions.find((f) => f.value === adFormat)?.label ?? adFormat}</strong>
              </div>
              <div className={styles.paymentRow}>
                <span>{t("payment.boostPackage")}</span>
                <strong>{toCurrency(selectedBoost?.price ?? 0)}</strong>
              </div>
              <div className={styles.paymentRow}>
                <span>{t("payment.durationPackage")}</span>
                <strong>{toCurrency(selectedDuration?.price ?? 0)}</strong>
              </div>
              <div className={styles.paymentDivider} />
              <div className={styles.paymentRow}>
                <span>{t("payment.total")}</span>
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
                {t("payment.termsText")}{" "}
                <Link
                  href="/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.paymentTermsLink}
                >
                  {t("payment.termsLink")}
                </Link>{" "}
                {t("payment.termsAnd")}
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
                {t("payment.back")}
              </button>
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={handleStartCheckout}
                disabled={isCreatingCheckout || !hasAcceptedPaymentTerms}
              >
                {isCreatingCheckout ? t("payment.creatingCheckout") : t("payment.payWithStripe")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
