"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useRequireAuth } from "@/hooks/use-require-auth";
import {
  createStripeCheckoutSession,
  type CreateStripeCheckoutSessionRequest,
  uploadMedia,
  uploadMediaBatch,
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

export default function AdsCreatePage() {
  const canRender = useRequireAuth();
  const router = useRouter();

  const [objective, setObjective] = useState<Objective>("traffic");
  const [adFormat, setAdFormat] = useState<AdFormat>("single");
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
  const [ctaOpen, setCtaOpen] = useState(false);
  const [publishMessage, setPublishMessage] = useState("");
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [isCreatingCheckout, setIsCreatingCheckout] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const ctaRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const carouselRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ctaOpen) return;

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (ctaRef.current?.contains(target)) return;
      setCtaOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCtaOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown, true);
    document.addEventListener("touchstart", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown, true);
      document.removeEventListener("touchstart", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [ctaOpen]);

  const audienceSummary = useMemo(() => {
    return `${locationText}, ${ageMin}-${ageMax}, Home Feed`;
  }, [ageMax, ageMin, locationText]);

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
      return;
    }

    setPaymentError("");
    setPaymentModalOpen(true);
  };

  const closePaymentModal = () => {
    if (isCreatingCheckout) return;
    setPaymentModalOpen(false);
  };

  const handleStartCheckout = async () => {
    const token =
      typeof window !== "undefined"
        ? window.localStorage.getItem("accessToken") || window.localStorage.getItem("token")
        : null;

    if (!token) {
      setPaymentError("Please login again before payment.");
      return;
    }

    const payload: CreateStripeCheckoutSessionRequest = {
      amount: totalBudget,
      currency: "vnd",
      campaignName: "Cordigram Ads Campaign",
      description: `${selectedBoost?.title ?? "Boost"} + ${selectedDuration?.days ?? 0} days`,
      objective,
      adFormat,
      boostPackageId: selectedBoostId,
      durationPackageId: selectedDurationId,
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

            <label className={styles.fieldLabel}>
              Primary text
              <textarea
                className={styles.textarea}
                value={primaryText}
                onChange={(e) => {
                  setPrimaryText(e.target.value);
                  setPublishValidationErrors((prev) => ({ ...prev, primaryText: undefined }));
                }}
                rows={4}
              />
            </label>
            {publishValidationErrors.primaryText ? (
              <p className={styles.uploadError}>{publishValidationErrors.primaryText}</p>
            ) : null}

            <div className={styles.twoCols}>
              <label className={styles.fieldLabel}>
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
                <div className={styles.dropdown} ref={ctaRef}>
                  <button
                    type="button"
                    className={`${styles.dropdownButton} ${ctaOpen ? styles.dropdownButtonOpen : ""}`}
                    onClick={() => setCtaOpen((prev) => !prev)}
                    aria-haspopup="listbox"
                    aria-expanded={ctaOpen}
                  >
                    <span className={styles.dropdownText}>{cta}</span>
                    <span className={`${styles.dropdownChevron} ${ctaOpen ? styles.dropdownChevronOpen : ""}`}>
                      <ChevronDownIcon />
                    </span>
                  </button>
                  {ctaOpen ? (
                    <div className={styles.dropdownMenu} role="listbox" aria-label="CTA button">
                      {CTA_OPTIONS.map((item) => {
                        const active = item === cta;
                        return (
                          <button
                            key={item}
                            type="button"
                            role="option"
                            aria-selected={active}
                            className={`${styles.dropdownOption} ${active ? styles.dropdownOptionActive : ""}`}
                            onClick={() => {
                              setCta(item);
                              setCtaOpen(false);
                            }}
                          >
                            <span>{item}</span>
                            <span className={`${styles.dropdownCheck} ${active ? styles.dropdownCheckActive : ""}`}>
                              {active ? "✓" : ""}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
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

            <label className={styles.fieldLabel}>
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

            <div className={styles.mediaPlaceholder}>
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
                <input
                  className={styles.input}
                  value={locationText}
                  onChange={(e) => setLocationText(e.target.value)}
                  placeholder="Country or city"
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
                <span className={styles.previewAvatar}>A</span>
                <div>
                  <p className={styles.previewName}>Your brand</p>
                  <p className={styles.previewMeta}>Sponsored • {audienceSummary}</p>
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
              You will be redirected to Stripe Checkout (test mode) to complete payment.
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
                disabled={isCreatingCheckout}
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
