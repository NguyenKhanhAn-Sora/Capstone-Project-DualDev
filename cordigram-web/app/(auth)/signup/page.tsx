"use client";

import {
  ChangeEvent,
  Fragment,
  FormEvent,
  KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "./signup.module.css";
import Cropper, { Area } from "react-easy-crop";
import { apiFetch, ApiError, getApiBaseUrl } from "@/lib/api";
import { setStoredAccessToken } from "@/lib/auth";
import { useRedirectIfAuthed } from "@/hooks/use-require-auth";
import { useLanguage } from "@/component/language-provider";
import { DateSelect } from "@/ui/date-select/date-select";
import { MobileDatePicker } from "@/ui/mobile-date-picker/mobile-date-picker";

type Step = "email" | "otp" | "profile" | "avatar";

type GeoStatus = "idle" | "requesting" | "granted" | "denied" | "error";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const usernameRegex = /^(?!.*\.\.)[a-z0-9][a-z0-9_.]{1,18}[a-z0-9]$/;

const EyeIcon = ({ open }: { open: boolean }) => (
  <svg
    aria-hidden
    width={20}
    height={20}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M2 12s4.5-7 10-7 10 7 10 7-4.5 7-10 7S2 12 2 12Z" />
    <circle cx="12" cy="12" r="3.5" />
    {!open && <line x1="4" y1="4" x2="20" y2="20" />}
  </svg>
);

function LocationIcon() {
  return (
    <svg
      aria-hidden
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 21s-6-5.5-6-10a6 6 0 1 1 12 0c0 4.5-6 10-6 10Z" />
      <circle cx="12" cy="11" r="2.5" />
    </svg>
  );
}

const ArrowLeftIcon = () => (
  <svg
    aria-hidden
    width={25}
    height={25}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

const MailIcon = () => (
  <svg aria-hidden width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2" /><path d="M22 7l-10 7L2 7" />
  </svg>
);
const LockIcon = () => (
  <svg aria-hidden width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);
const BadgeIcon = () => (
  <svg aria-hidden width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="7" width="20" height="14" rx="2" /><path d="M8 7V5a4 4 0 0 1 8 0v2" /><circle cx="12" cy="14" r="2" />
  </svg>
);
const AtIcon = () => (
  <svg aria-hidden width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="4" /><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94" />
  </svg>
);
const CakeIcon = () => (
  <svg aria-hidden width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8" /><path d="M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1" /><path d="M2 21h20M7 8v3M12 8v3M17 8v3M7 5h.01M12 5h.01M17 5h.01" />
  </svg>
);
const CalendarIcon = () => (
  <svg aria-hidden width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
  </svg>
);
const PersonOutlineIcon = () => (
  <svg aria-hidden width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
  </svg>
);
const ChevronDownIcon = () => (
  <svg aria-hidden width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);
const EditNoteIcon = () => (
  <svg aria-hidden width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);
const PhotoIcon = () => (
  <svg aria-hidden width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
  </svg>
);
const PersonPlaceholderIcon = () => (
  <svg aria-hidden width={60} height={60} viewBox="0 0 24 24" fill="none" stroke="#B0C4D8" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
  </svg>
);

type AvatarUploadResponse = {
  avatarUrl: string;
  avatarOriginalUrl: string;
  avatarPublicId: string;
  avatarOriginalPublicId: string;
};

const cleanLocationLabel = (label: string) =>
  label
    .replace(/\b\d{4,6}\b/g, "")
    .replace(/,\s*,+/g, ", ")
    .replace(/\s{2,}/g, " ")
    .replace(/\s*,\s*$/g, "")
    .replace(/^\s*,\s*/g, "")
    .trim();

function validateBirthdate(dateStr: string): string | null {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) {
    return "Birthdate is invalid";
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const birth = new Date(date);
  birth.setHours(0, 0, 0, 0);
  if (birth > today) {
    return "Birthdate cannot be in the future";
  }
  return null;
}

function decodeJwtEmail(token: string): string | null {
  try {
    const payload = token.split(".")[1];
    const json = JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/")),
    );
    return typeof json?.email === "string" ? json.email : null;
  } catch (_err) {
    return null;
  }
}

// Moved inside component to access t() — see SignupPage below

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = src;
  });
}

async function getCroppedBlob(
  imageSrc: string,
  croppedAreaPixels: Area,
): Promise<Blob> {
  const image = await loadImage(imageSrc);
  const canvas = document.createElement("canvas");
  canvas.width = croppedAreaPixels.width;
  canvas.height = croppedAreaPixels.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas not supported");
  }

  ctx.drawImage(
    image,
    croppedAreaPixels.x,
    croppedAreaPixels.y,
    croppedAreaPixels.width,
    croppedAreaPixels.height,
    0,
    0,
    croppedAreaPixels.width,
    croppedAreaPixels.height,
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error("Could not create blob"));
        resolve(blob);
      },
      "image/jpeg",
      0.9,
    );
  });
}

async function getCroppedDataUrl(
  imageSrc: string,
  croppedAreaPixels: Area,
): Promise<string> {
  const image = await loadImage(imageSrc);
  const canvas = document.createElement("canvas");
  canvas.width = croppedAreaPixels.width;
  canvas.height = croppedAreaPixels.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas not supported");
  }

  ctx.drawImage(
    image,
    croppedAreaPixels.x,
    croppedAreaPixels.y,
    croppedAreaPixels.width,
    croppedAreaPixels.height,
    0,
    0,
    croppedAreaPixels.width,
    croppedAreaPixels.height,
  );

  return canvas.toDataURL("image/jpeg", 0.9);
}

// Scale output xuống maxSize để tránh iOS Safari canvas limit — dùng cho preview
async function getCroppedDataUrlScaled(
  imageSrc: string,
  croppedAreaPixels: Area,
  maxSize = 512,
): Promise<string> {
  const image = await loadImage(imageSrc);
  const size = Math.min(maxSize, croppedAreaPixels.width, croppedAreaPixels.height);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.drawImage(
    image,
    croppedAreaPixels.x,
    croppedAreaPixels.y,
    croppedAreaPixels.width,
    croppedAreaPixels.height,
    0,
    0,
    size,
    size,
  );
  return canvas.toDataURL("image/jpeg", 0.9);
}

// Scale output xuống maxSize — dùng cho upload (chất lượng cao hơn preview)
async function getCroppedBlobScaled(
  imageSrc: string,
  croppedAreaPixels: Area,
  maxSize = 1024,
): Promise<Blob> {
  const image = await loadImage(imageSrc);
  const size = Math.min(maxSize, croppedAreaPixels.width, croppedAreaPixels.height);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.drawImage(
    image,
    croppedAreaPixels.x,
    croppedAreaPixels.y,
    croppedAreaPixels.width,
    croppedAreaPixels.height,
    0,
    0,
    size,
    size,
  );
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error("Could not create blob"));
        resolve(blob);
      },
      "image/jpeg",
      0.92,
    );
  });
}

export default function SignupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const canRender = useRedirectIfAuthed();
  const { t } = useLanguage();

  const validateDisplayName = (name: string): string | null => {
    if (!name) return null;
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 30) return t("profilePage.editOverlay.displayNameLengthError");
    const letterCount = [...trimmed].filter((c) => /\p{L}/u.test(c)).length;
    if (letterCount < 2) return t("profilePage.editOverlay.displayNameLettersError");
    if (!/^[\p{L}\p{N}\s'.,\-]+$/u.test(trimmed)) return t("profilePage.editOverlay.displayNameCharsError");
    return null;
  };

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [signupToken, setSignupToken] = useState("");
  const [isGoogleFlow, setIsGoogleFlow] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [usernameChecking, setUsernameChecking] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordBlurred, setPasswordBlurred] = useState(false);
  const [birthdate, setBirthdate] = useState("");

  const [gender, setGender] = useState<
    "male" | "female" | "other" | "prefer_not_to_say" | ""
  >("");
  const [genderOpen, setGenderOpen] = useState(false);
  const [mobileGenderOpen, setMobileGenderOpen] = useState(false);
  const [mobileDateOpen, setMobileDateOpen] = useState(false);
  const [mobileCropOpen, setMobileCropOpen] = useState(false);
  const [genderHighlight, setGenderHighlight] = useState(0);
  const genderRef = useRef<HTMLDivElement | null>(null);
  const [locationInput, setLocationInput] = useState("");
  const [locationQuery, setLocationQuery] = useState("");
  const [locationSuggestions, setLocationSuggestions] = useState<
    Array<{ label: string; lat: string; lon: string }>
  >([]);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [locationOpen, setLocationOpen] = useState(false);
  const [locationHighlight, setLocationHighlight] = useState(-1);
  const [geoStatus, setGeoStatus] = useState<GeoStatus>("idle");
  const BIO_CHAR_LIMIT = 300;
  const [bio, setBio] = useState("");

  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarThumb, setAvatarThumb] = useState<string | null>(null);
  const [crop, setCrop] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [fieldError, setFieldError] = useState<{
    email?: string;
    password?: string;
    confirmPassword?: string;
    birthdate?: string;
    username?: string;
    displayName?: string;
    gender?: string;
  }>({});
  const [cooldownLeft, setCooldownLeft] = useState<number | null>(null);

  useEffect(() => {
    if (step === "avatar" && typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [step]);

  const handleGoogleAuth = () => {
    window.location.href = `${getApiBaseUrl()}/auth/google`;
  };

  useEffect(() => {
    if (cooldownLeft === null) return;
    if (cooldownLeft <= 0) {
      setCooldownLeft(null);
      return;
    }
    const timer = setTimeout(() => {
      setCooldownLeft((val) => (val !== null ? val - 1 : null));
    }, 1000);
    return () => clearTimeout(timer);
  }, [cooldownLeft]);

  useEffect(() => {
    if (!avatarPreview || !croppedAreaPixels) return;
    let cancelled = false;
    (async () => {
      try {
        const url = await getCroppedDataUrl(avatarPreview, croppedAreaPixels);
        if (!cancelled) {
          setAvatarThumb(url);
        }
      } catch (err) {
        // ignore preview errors
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [avatarPreview, croppedAreaPixels]);

  useEffect(() => {
    if (isGoogleFlow) {
      setFieldError((prev) => ({ ...prev, confirmPassword: undefined }));
      return;
    }
    if (!confirmPassword) {
      setFieldError((prev) => ({ ...prev, confirmPassword: undefined }));
      return;
    }
    const handle = setTimeout(() => {
      if (confirmPassword !== password) {
        setFieldError((prev) => ({
          ...prev,
          confirmPassword: "Passwords do not match",
        }));
      } else {
        setFieldError((prev) => ({ ...prev, confirmPassword: undefined }));
      }
    }, 1000);

    return () => clearTimeout(handle);
  }, [confirmPassword, password, isGoogleFlow]);

  useEffect(() => {
    const googleParam = searchParams.get("google");
    const storedToken =
      typeof window !== "undefined"
        ? sessionStorage.getItem("googleSignupToken")
        : null;
    const storedEmail =
      typeof window !== "undefined"
        ? sessionStorage.getItem("googleSignupEmail")
        : null;

    if (googleParam === "1" && storedToken) {
      setIsGoogleFlow(true);
      setSignupToken(storedToken);
      if (storedEmail) setEmail(storedEmail);
      setStep("profile");
    }
  }, [searchParams]);

  useEffect(() => {
    if (!isGoogleFlow) return;
    setPassword("");
    setConfirmPassword("");
    setFieldError((prev) => ({ ...prev, password: undefined }));
  }, [isGoogleFlow]);

  useEffect(() => {
    if (!username) {
      setUsernameError(null);
      setFieldError((prev) => ({ ...prev, username: undefined }));
      return;
    }

    const usernameFormatError = (() => {
      if (username.length < 3) return t("profilePage.editOverlay.usernameTooShort");
      if (username.length > 20) return t("profilePage.editOverlay.usernameTooLong");
      if (/^[._]|[._]$/.test(username)) return t("profilePage.editOverlay.usernameStartEndError");
      if (/\.\./.test(username)) return t("profilePage.editOverlay.usernameConsecutiveDotsError");
      if (!usernameRegex.test(username)) return t("profilePage.editOverlay.usernameCharsError");
      return null;
    })();

    if (usernameFormatError) {
      setUsernameError(null);
      setFieldError((prev) => ({ ...prev, username: usernameFormatError }));
      return;
    }

    const handle = setTimeout(async () => {
      setUsernameChecking(true);
      setUsernameError(null);
      try {
        const res = await apiFetch<{ available: boolean }>({
          path: `/profiles/check-username?username=${encodeURIComponent(
            username,
          )}`,
          method: "GET",
        });
        if (!res.available) {
          setUsernameError("Username already taken");
          setFieldError((prev) => ({
            ...prev,
            username: "Username already taken",
          }));
        } else {
          setUsernameError(null);
          setFieldError((prev) => ({ ...prev, username: undefined }));
        }
      } catch (_err) {
        // Nếu API lỗi, không chặn nhưng cũng không đặt available
      } finally {
        setUsernameChecking(false);
      }
    }, 1000);

    return () => clearTimeout(handle);
  }, [username]);

  useEffect(() => {
    if (!displayName) {
      setFieldError((prev) => ({ ...prev, displayName: undefined }));
      return;
    }
    const handle = setTimeout(() => {
      const err = validateDisplayName(displayName);
      setFieldError((prev) => ({ ...prev, displayName: err || undefined }));
    }, 1000);
    return () => clearTimeout(handle);
  }, [displayName]);

  useEffect(() => {
    if (!locationQuery.trim()) {
      setLocationSuggestions([]);
      setLocationOpen(false);
      setLocationHighlight(-1);
      setLocationError("");
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLocationLoading(true);
      setLocationError("");
      try {
        const url = new URL("https://nominatim.openstreetmap.org/search");
        url.searchParams.set("q", locationQuery);
        url.searchParams.set("format", "jsonv2");
        url.searchParams.set("addressdetails", "1");
        url.searchParams.set("limit", "8");
        url.searchParams.set("countrycodes", "vn");
        const res = await fetch(url.toString(), {
          headers: {
            Accept: "application/json",
            "Accept-Language": "vi",
          },
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("search failed");
        const data = await res.json();
        const mapped = Array.isArray(data)
          ? data.map((item: any) => ({
              label: cleanLocationLabel(item.display_name as string),
              lat: item.lat as string,
              lon: item.lon as string,
            }))
          : [];
        setLocationSuggestions(mapped);
        setLocationOpen(true);
        setLocationHighlight(mapped.length ? 0 : -1);
      } catch (err) {
        if (controller.signal.aborted) return;
        setLocationSuggestions([]);
        setLocationOpen(false);
        setLocationHighlight(-1);
        setLocationError("No suggestions found, try different keywords.");
      } finally {
        if (!controller.signal.aborted) setLocationLoading(false);
      }
    }, 350);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [locationQuery]);

  const steps: Array<{ key: Step; label: string }> = useMemo(
    () => [
      { key: "email", label: "Enter email" },
      { key: "otp", label: "Verify OTP" },
      { key: "profile", label: "Profile info" },
    ],
    [],
  );

  const visualStep = step === "avatar" ? "profile" : step;
  const currentStepIndex = Math.max(
    steps.findIndex((s) => s.key === visualStep),
    0,
  );

  const showError = (message: string) => {
    setError(message);
    setInfo("");
    setFieldError((prev) => ({ ...prev, email: undefined }));
  };

  const showInfo = (message: string) => {
    setInfo(message);
    setError("");
    setFieldError((prev) => ({ ...prev, email: undefined }));
  };

  const selectLocation = (option: {
    label: string;
    lat: string;
    lon: string;
  }) => {
    setLocationInput(option.label);
    setLocationQuery(option.label);
    setLocationSuggestions([]);
    setLocationOpen(false);
    setLocationHighlight(-1);
  };

  const onLocationChange = (value: string) => {
    setLocationInput(value);
    setLocationQuery(value);
    setLocationOpen(Boolean(value.trim()));
  };

  const onLocationBlur = () => {
    setTimeout(() => {
      setLocationOpen(false);
      setLocationHighlight(-1);
    }, 120);
  };

  const onLocationFocus = () => {
    if (locationSuggestions.length) {
      setLocationOpen(true);
    }
  };

  const onLocationKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      if (locationOpen && locationHighlight >= 0) {
        e.preventDefault();
        e.stopPropagation();
        const chosen = locationSuggestions[locationHighlight];
        if (chosen) selectLocation(chosen);
        return;
      }
      e.preventDefault();
      e.stopPropagation();
    }
    if (e.key === "ArrowDown") {
      if (!locationSuggestions.length) return;
      e.preventDefault();
      setLocationOpen(true);
      setLocationHighlight((prev) =>
        prev + 1 < locationSuggestions.length ? prev + 1 : 0,
      );
    }
    if (e.key === "ArrowUp") {
      if (!locationSuggestions.length) return;
      e.preventDefault();
      setLocationOpen(true);
      setLocationHighlight((prev) =>
        prev - 1 >= 0 ? prev - 1 : locationSuggestions.length - 1,
      );
    }
    if (e.key === "Escape") {
      setLocationOpen(false);
      setLocationHighlight(-1);
    }
  };

  const requestCurrentLocation = () => {
    if (typeof window === "undefined") return;
    if (!("geolocation" in navigator)) {
      setGeoStatus("error");
      return;
    }

    setGeoStatus("requesting");

    const highOptions: PositionOptions = {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 5000,
    };

    const resolveAddress = async (
      latitude: number,
      longitude: number,
      fallback: string,
    ) => {
      try {
        const url = new URL("https://nominatim.openstreetmap.org/reverse");
        url.searchParams.set("format", "jsonv2");
        url.searchParams.set("lat", latitude.toString());
        url.searchParams.set("lon", longitude.toString());
        url.searchParams.set("addressdetails", "1");
        url.searchParams.set("accept-language", "en");

        const res = await fetch(url.toString(), {
          headers: {
            Accept: "application/json",
          },
        });
        if (!res.ok) throw new Error("reverse geocode failed");
        const data = await res.json();
        const addr = data.display_name as string;
        const city =
          data?.address?.city || data?.address?.town || data?.address?.village;
        const road = data?.address?.road as string | undefined;
        const compact = [road, city].filter(Boolean).join(", ") || addr;
        const chosen = compact || fallback;
        selectLocation({
          label: chosen,
          lat: latitude.toString(),
          lon: longitude.toString(),
        });
      } catch (_err) {
        selectLocation({
          label: fallback,
          lat: latitude.toString(),
          lon: longitude.toString(),
        });
      }
    };

    const handleSuccess = (pos: GeolocationPosition) => {
      const { latitude, longitude } = pos.coords;
      setGeoStatus("granted");
      const pretty = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
      resolveAddress(latitude, longitude, pretty);
    };

    const handleError = (
      err: GeolocationPositionError,
      isFallback: boolean,
    ) => {
      const shouldRetry =
        !isFallback &&
        (err.code === err.TIMEOUT || err.code === err.POSITION_UNAVAILABLE);

      if (shouldRetry) {
        navigator.geolocation.getCurrentPosition(
          handleSuccess,
          (err2) => handleError(err2, true),
          highOptions,
        );
        return;
      }

      setGeoStatus(err.code === err.PERMISSION_DENIED ? "denied" : "error");
    };

    navigator.geolocation.getCurrentPosition(
      handleSuccess,
      (err) => handleError(err, false),
      highOptions,
    );
  };

  const handleRequestOtp = async (e: FormEvent) => {
    e.preventDefault();
    if (!email) {
      showError("Please enter your email");
      return;
    }

    setLoading(true);
    setError("");
    setFieldError({});
    try {
      await apiFetch({
        path: "/auth/request-otp",
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setCooldownLeft(null);
      setStep("otp");
      showInfo("OTP sent to your email");
    } catch (err) {
      const apiErr = err as ApiError<{ retryAfterSec?: number }>;
      if (
        apiErr.message?.toLowerCase().includes("email") &&
        apiErr.message?.toLowerCase().includes("đã")
      ) {
        setFieldError({ email: apiErr.message });
        setError("");
      } else if (apiErr.data?.retryAfterSec) {
        setCooldownLeft(apiErr.data.retryAfterSec);
        setError("");
        setInfo("");
      } else {
        showError(apiErr.message || "Could not send OTP");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: FormEvent) => {
    e.preventDefault();
    if (!otpCode || otpCode.length < 4) {
      showError("OTP code is invalid");
      return;
    }

    setLoading(true);
    setError("");
    setFieldError((prev) => ({
      ...prev,
      password: undefined,
      confirmPassword: undefined,
      birthdate: undefined,
      username: undefined,
      gender: undefined,
    }));
    try {
      const res = await apiFetch<{ signupToken: string }>({
        path: "/auth/verify-otp",
        method: "POST",
        body: JSON.stringify({ email, code: otpCode }),
      });
      setSignupToken(res.signupToken);
      setStep("profile");
      setInfo("");
      setError("");
    } catch (err) {
      const apiErr = err as ApiError;
      showError(apiErr.message || "Could not verify OTP");
    } finally {
      setLoading(false);
    }
  };

  const handleProfileNext = (e: FormEvent) => {
    e.preventDefault();
    setFieldError((prev) => ({
      ...prev,
      password: undefined,
      confirmPassword: undefined,
      birthdate: undefined,
      username: undefined,
    }));

    if (usernameError || usernameChecking) {
      setFieldError((prev) => ({
        ...prev,
        username: usernameError || "Checking username",
      }));
      return;
    }

    const displayErr = validateDisplayName(displayName);
    if (displayErr) {
      setFieldError((prev) => ({ ...prev, displayName: displayErr }));
      return;
    }

    if (!isGoogleFlow) {
      const trimmedPassword = password.trim();
      if (!trimmedPassword) {
        setFieldError((prev) => ({ ...prev, password: t("settingsPage.privacy.password.errors.passwordRequired") }));
        setPasswordBlurred(true);
        return;
      }
      if (trimmedPassword.length > 72) {
        setFieldError((prev) => ({ ...prev, password: t("settingsPage.privacy.password.errors.passwordTooLong") }));
        return;
      }
      if (!allRulesMet) {
        setPasswordBlurred(true);
        return;
      }
      if (trimmedPassword !== confirmPassword) {
        setFieldError((prev) => ({
          ...prev,
          confirmPassword: t("settingsPage.privacy.password.errors.passwordMismatch"),
        }));
        return;
      }
    } else {
      if (password) setPassword("");
      if (confirmPassword) setConfirmPassword("");
    }
    if (!displayName || !username) {
      showError("Display name and username are required");
      return;
    }

    const birthErr = validateBirthdate(birthdate);
    if (birthErr) {
      setFieldError((prev) => ({ ...prev, birthdate: birthErr }));
      return;
    }
    if (!gender) {
      setFieldError((prev) => ({
        ...prev,
        gender: "Please select your gender",
      }));
      return;
    }
    setError("");
    setInfo("");
    setStep("avatar");
  };

  const processAvatarFile = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      setAvatarPreview(reader.result as string);
      setZoom(1);
      setCrop({ x: 0, y: 0 });
      setCroppedAreaPixels(null);
      setAvatarThumb(null);
    };
    reader.readAsDataURL(file);
  };

  const handleAvatarFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processAvatarFile(file);
  };

  const completeSignup = async (avatarData?: AvatarUploadResponse) => {
    const res = await apiFetch<{ accessToken: string }>({
      path: "/auth/complete-profile",
      method: "POST",
      headers: {
        Authorization: `Bearer ${signupToken}`,
      },
      body: JSON.stringify({
        email,
        displayName,
        username,
        birthdate: birthdate || undefined,
        bio: bio || undefined,
        gender: gender || undefined,
        location: locationInput.trim() || undefined,
        password: isGoogleFlow ? undefined : password || undefined,
        avatarUrl: avatarData?.avatarUrl,
        avatarOriginalUrl: avatarData?.avatarOriginalUrl,
        avatarPublicId: avatarData?.avatarPublicId,
        avatarOriginalPublicId: avatarData?.avatarOriginalPublicId,
      }),
    });

    if (typeof window !== "undefined") {
      localStorage.setItem("ui-theme", "light");
    }
    if (typeof document !== "undefined") {
      document.documentElement.dataset.theme = "light";
      document.body.dataset.theme = "light";
    }
    showInfo("Sign-up successful. Please log in to continue.");
    router.push("/login");
  };

  const genderOptions = useMemo(
    () => [
      { value: "male" as const, label: "Male" },
      { value: "female" as const, label: "Female" },
      { value: "other" as const, label: "Other" },
      {
        value: "prefer_not_to_say" as const,
        label: "Prefer not to say",
      },
    ],
    [],
  );

  const currentGenderLabel = useMemo(() => {
    const found = genderOptions.find((opt) => opt.value === gender);
    return found?.label ?? "Select an option";
  }, [gender, genderOptions]);

  const passwordRules = useMemo(
    () => [
      {
        key: "len",
        label: t("settingsPage.privacy.password.errors.passwordTooShort"),
        met: password.trim().length >= 8,
      },
      {
        key: "upper",
        label: t("settingsPage.privacy.password.errors.passwordNoUpper"),
        met: /[A-Z]/.test(password),
      },
      {
        key: "lower",
        label: t("settingsPage.privacy.password.errors.passwordNoLower"),
        met: /[a-z]/.test(password),
      },
      {
        key: "num",
        label: t("settingsPage.privacy.password.errors.passwordNoNumber"),
        met: /\d/.test(password),
      },
    ],
    [password, t],
  );
  const allRulesMet = passwordRules.every((r) => r.met);

  useEffect(() => {
    if (!genderOpen) return;

    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const node = genderRef.current;
      if (!node) return;
      if (e.target instanceof Node && !node.contains(e.target)) {
        setGenderOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown, true);
    document.addEventListener("touchstart", onPointerDown, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown, true);
      document.removeEventListener("touchstart", onPointerDown, true);
    };
  }, [genderOpen]);

  const handleSubmitAvatar = async () => {
    if (!signupToken) {
      showError("Missing signup token, please verify OTP again");
      return;
    }
    setLoading(true);
    setError("");
    try {
      let avatarPayload: AvatarUploadResponse | undefined;

      if (avatarFile && avatarPreview && croppedAreaPixels) {
        // Tạo blob ảnh đã crop — fallback chain để đảm bảo luôn có "cropped" blob:
        // 1. Full resolution (tốt nhất, desktop)
        // 2. 1024px scaled (an toàn trên iOS mobile)
        // 3. 512px scaled (avatarThumb đã có sẵn, đảm bảo lưu được)
        let croppedBlob: Blob | null = null;

        try {
          croppedBlob = await getCroppedBlob(avatarPreview, croppedAreaPixels);
        } catch {
          try {
            croppedBlob = await getCroppedBlobScaled(avatarPreview, croppedAreaPixels, 1024);
          } catch {
            // Fallback cuối: dùng avatarThumb (512px) đã được compute khi crop
            if (avatarThumb) {
              const res = await fetch(avatarThumb);
              croppedBlob = await res.blob();
            }
          }
        }

        if (!croppedBlob) {
          throw new Error("Could not process avatar image. Please try again.");
        }

        const form = new FormData();
        // Bản gốc: file thật từ thiết bị, không qua canvas
        form.append("original", avatarFile, avatarFile.name);
        // Bản đã chỉnh sửa: crop + (optional) zoom theo ý người dùng
        form.append(
          "cropped",
          new File([croppedBlob], `avatar-cropped-${Date.now()}.jpg`, {
            type: "image/jpeg",
          }),
        );

        const uploadRes = await fetch(`${getApiBaseUrl()}/auth/upload-avatar`, {
          method: "POST",
          headers: { Authorization: `Bearer ${signupToken}` },
          body: form,
        });

        if (!uploadRes.ok) {
          const errText = await uploadRes.text();
          throw new Error(errText || "Avatar upload failed");
        }

        avatarPayload = (await uploadRes.json()) as AvatarUploadResponse;
      }

      await completeSignup(avatarPayload);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not complete profile";
      showError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleSkipAvatar = async () => {
    if (!signupToken) {
      showError("Missing signup token, please verify OTP again");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await completeSignup();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not complete profile";
      showError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleMobileCropConfirm = async () => {
    try {
      if (avatarPreview && croppedAreaPixels) {
        // Scale xuống 512px để tránh iOS Safari canvas limit
        const url = await getCroppedDataUrlScaled(avatarPreview, croppedAreaPixels, 512);
        setAvatarThumb(url);
      }
    } catch {
      // Nếu canvas fail, dùng ảnh gốc làm preview (upload vẫn crop đúng)
      if (avatarPreview) setAvatarThumb(avatarPreview);
    } finally {
      setMobileCropOpen(false);
    }
  };

  const renderEmailStep = () => {
    if (isGoogleFlow) return null;
    return (
      <form className="space-y-[16px]" onSubmit={handleRequestOtp}>
        <div className="space-y-[6px]">
          <label className={styles.label}>{t("auth.signup.emailAddress")}</label>
          <input
            type="email"
            name="email"
            value={email}
            onChange={(e) => setEmail(e.target.value.toLowerCase())}
            placeholder={t("auth.signup.emailPlaceholder")}
            className={styles.input}
            required
          />
          {fieldError.email && (
            <p className={styles.fieldError}>{fieldError.email}</p>
          )}
        </div>
        <button
          type="submit"
          className={styles.primaryButton}
          disabled={loading}
        >
          {loading ? t("auth.signup.sending") : t("auth.signup.sendOTP")}
        </button>
      </form>
    );
  };

  const renderOtpStep = () => {
    if (isGoogleFlow) return null;
    return (
      <form className="space-y-[20px]" onSubmit={handleVerifyOtp}>
        <div className="space-y-[10px]">
          <p className="text-[13px] text-slate-500 font-medium text-center">
            {t("auth.signup.otpInstruction")} <span className="font-semibold text-slate-700">{email}</span>
          </p>
          {/* 6-box OTP input */}
          <div className="relative flex gap-2.5 justify-center">
            {[0, 1, 2, 3, 4, 5].map((i) => {
              const filled = i < otpCode.length;
              const active = i === otpCode.length;
              return (
                <div
                  key={i}
                  className={`w-12 h-14 flex items-center justify-center rounded-xl text-[22px] font-bold select-none transition-all duration-150 ${
                    filled
                      ? "border-2 border-[#3470A2] bg-white text-slate-900 shadow-[0_0_0_3px_rgba(52,112,162,0.12)]"
                      : active
                      ? "border-2 border-[#3470A2] bg-[#f0f7ff]"
                      : "border-2 border-[#D7E5F2] bg-[#F8FBFF] text-slate-300"
                  }`}
                >
                  {filled ? (
                    otpCode[i]
                  ) : active ? (
                    <span className="w-[2px] h-5 bg-[#3470A2] rounded-full animate-pulse" />
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-[#C8D8EA]" />
                  )}
                </div>
              );
            })}
            {/* Invisible input overlay that captures all keyboard input */}
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/[^0-9]/g, ""))}
              autoFocus
              className="absolute inset-0 w-full h-full opacity-0 cursor-text"
              aria-label={t("auth.forgotPassword.otpAriaLabel")}
            />
          </div>
        </div>
        <div className={styles.inlineActions}>
          <button
            type="button"
            className={styles.linkButton}
            onClick={() => {
              setStep("email");
              setOtpCode("");
              setCooldownLeft(null);
              showInfo("You can change the email and request a new OTP.");
            }}
          >
            Change email
          </button>
          <button
            type="button"
            className={styles.linkButton}
            disabled={loading || cooldownLeft !== null}
            onClick={handleRequestOtp}
          >
            {cooldownLeft !== null
              ? `Resend in ${cooldownLeft}s`
              : "Resend code"}
          </button>
        </div>
        <button
          type="submit"
          className={styles.primaryButton}
          disabled={loading}
        >
          {loading ? "Verifying..." : "Verify"}
        </button>
      </form>
    );
  };

  const renderProfileStep = () => (
    <form className="space-y-[14px]" onSubmit={handleProfileNext}>
      <div className={styles.gridTwoCols}>
        <div className="space-y-[6px]">
          <label className={styles.label}>Display name</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className={styles.input}
            placeholder={t("auth.signup.displayNamePlaceholder")}
            required
          />
          {fieldError.displayName && (
            <p className={styles.fieldError}>{fieldError.displayName}</p>
          )}
        </div>
        <div className="space-y-[6px]">
          <label className={styles.label}>Username</label>
          <input
            type="text"
            value={username}
            onChange={(e) => {
              const cleaned = e.target.value
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .toLowerCase()
                .replace(/[^a-z0-9_.]/g, "")
                .slice(0, 30);
              setUsername(cleaned);
            }}
            className={styles.input}
            placeholder={t("auth.signup.usernamePlaceholder")}
            pattern="^[a-z0-9_\\.]{3,30}$"
            required
          />
          {fieldError.username ? (
            <p className={styles.fieldError}>{fieldError.username}</p>
          ) : (
            <p className="text-[12px] text-[#5b6378]">
              Username can only include letters, numbers, underscores, and dots
            </p>
          )}
        </div>
      </div>

      {!isGoogleFlow && (
        <div className={styles.gridTwoCols}>
          <div className="space-y-[6px]">
            <label className={styles.label}>Password</label>
            <div className={styles.passwordField}>
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setFieldError((prev) => ({ ...prev, password: undefined }));
                }}
                onBlur={() => {
                  if (password) setPasswordBlurred(true);
                }}
                className={`${styles.input} ${styles.passwordInput} ${passwordBlurred && !allRulesMet ? styles.inputError : ""}`}
                placeholder={t("settingsPage.privacy.password.requirement")}
              />
              <button
                type="button"
                className={styles.passwordToggle}
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? t("auth.signup.hidePassword") : t("auth.signup.showPassword")}
              >
                <EyeIcon open={showPassword} />
              </button>
            </div>
            {fieldError.password && !password && (
              <p className={styles.fieldError}>{fieldError.password}</p>
            )}
            {(password.length > 0 || passwordBlurred) && (
              <div className={styles.pwdRules}>
                {passwordRules.map((rule) => (
                  <div
                    key={rule.key}
                    className={`${styles.pwdRule} ${rule.met ? styles.pwdRuleMet : passwordBlurred ? styles.pwdRuleError : ""}`}
                  >
                    <div className={`${styles.pwdRuleIcon} ${rule.met ? styles.pwdRuleIconMet : passwordBlurred ? styles.pwdRuleIconError : ""}`}>
                      {rule.met && (
                        <svg width={10} height={10} viewBox="0 0 12 12" fill="none">
                          <polyline
                            points="2,7 5,10 10,3"
                            stroke="#fff"
                            strokeWidth={1.8}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </div>
                    <span>{rule.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-[6px]">
            <label className={styles.label}>Confirm password</label>
            <div className={styles.passwordField}>
              <input
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setFieldError((prev) => ({
                    ...prev,
                    confirmPassword: undefined,
                  }));
                }}
                onBlur={(e) => {
                  const val = e.target.value;
                  if (!val) return;
                  if (val !== password) {
                    setFieldError((prev) => ({
                      ...prev,
                      confirmPassword: t("settingsPage.privacy.password.errors.passwordMismatch"),
                    }));
                  }
                }}
                className={`${styles.input} ${styles.passwordInput}`}
                placeholder={t("auth.signup.confirmPasswordPlaceholder")}
              />
              <button
                type="button"
                className={styles.passwordToggle}
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                aria-label={
                  showConfirmPassword ? t("auth.signup.hidePassword") : t("auth.signup.showPassword")
                }
              >
                <EyeIcon open={showConfirmPassword} />
              </button>
            </div>
            {fieldError.confirmPassword && (
              <p className={styles.fieldError}>{fieldError.confirmPassword}</p>
            )}
          </div>
        </div>
      )}

      <div className={styles.gridTwoCols}>
        <div className="space-y-[6px]">
          <label className={styles.label}>Birthdate</label>
          <DateSelect
            value={birthdate}
            onChange={(next) => {
              setBirthdate(next);
              setFieldError((prev) => ({ ...prev, birthdate: undefined }));
            }}
            forceLight
          />
          {fieldError.birthdate && (
            <p className={styles.fieldError}>{fieldError.birthdate}</p>
          )}
        </div>
        <div className="space-y-[6px]">
          <label className={styles.label}>Gender</label>
          <div
            className={`${styles.genderSelect} ${genderOpen ? styles.genderSelectOpen : ""}`}
            ref={genderRef}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setGenderOpen(false);
                return;
              }

              if (e.key === "ArrowDown") {
                e.preventDefault();
                if (!genderOpen) {
                  const idx = Math.max(
                    0,
                    genderOptions.findIndex((opt) => opt.value === gender),
                  );
                  setGenderHighlight(idx);
                  setGenderOpen(true);
                  return;
                }
                setGenderHighlight((prev) =>
                  Math.min(genderOptions.length - 1, prev + 1),
                );
                return;
              }

              if (e.key === "ArrowUp") {
                e.preventDefault();
                if (!genderOpen) {
                  const idx = Math.max(
                    0,
                    genderOptions.findIndex((opt) => opt.value === gender),
                  );
                  setGenderHighlight(idx);
                  setGenderOpen(true);
                  return;
                }
                setGenderHighlight((prev) => Math.max(0, prev - 1));
                return;
              }

              if (e.key === "Enter" || e.key === " ") {
                if (!genderOpen) {
                  e.preventDefault();
                  const idx = Math.max(
                    0,
                    genderOptions.findIndex((opt) => opt.value === gender),
                  );
                  setGenderHighlight(idx);
                  setGenderOpen(true);
                  return;
                }
                e.preventDefault();
                const opt = genderOptions[genderHighlight];
                if (opt) {
                  setGender(opt.value);
                  setFieldError((prev) => ({ ...prev, gender: undefined }));
                }
                setGenderOpen(false);
              }
            }}
          >
            <button
              type="button"
              className={styles.genderSelectButton}
              aria-haspopup="listbox"
              aria-expanded={genderOpen}
              onClick={() => {
                const idx = Math.max(
                  0,
                  genderOptions.findIndex((opt) => opt.value === gender),
                );
                setGenderHighlight(idx);
                setGenderOpen((prev) => !prev);
                setFieldError((prev) => ({ ...prev, gender: undefined }));
              }}
            >
              <span
                className={
                  gender
                    ? styles.genderSelectValue
                    : styles.genderSelectPlaceholder
                }
              >
                {currentGenderLabel}
              </span>
              <span className={styles.genderSelectChevron} aria-hidden />
            </button>

            {genderOpen && (
              <div className={styles.genderSelectMenu} role="listbox">
                {genderOptions.map((opt, idx) => {
                  const active = idx === genderHighlight;
                  const selected = opt.value === gender;
                  return (
                    <button
                      type="button"
                      key={opt.value}
                      role="option"
                      aria-selected={selected}
                      className={`${styles.genderSelectOption} ${active ? styles.genderSelectOptionActive : ""} ${selected ? styles.genderSelectOptionSelected : ""}`}
                      onMouseEnter={() => setGenderHighlight(idx)}
                      onMouseDown={(ev) => {
                        ev.preventDefault();
                        setGender(opt.value);
                        setFieldError((prev) => ({
                          ...prev,
                          gender: undefined,
                        }));
                        setGenderOpen(false);
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          {fieldError.gender && (
            <p className={styles.fieldError}>{fieldError.gender}</p>
          )}
        </div>
      </div>

      <div className="space-y-[6px]">
        <div className={styles.labelRow}>
          <label className={styles.label}>Location (optional)</label>
        </div>
        <div className={styles.locationCombo}>
          <div className={styles.locationInputShell}>
            <input
              type="text"
              name="location"
              value={locationInput}
              onChange={(e) => onLocationChange(e.target.value)}
              onKeyDown={onLocationKeyDown}
              onBlur={onLocationBlur}
              onFocus={onLocationFocus}
              placeholder={t("auth.signup.locationPlaceholder")}
              aria-autocomplete="list"
              aria-expanded={locationOpen}
              aria-haspopup="listbox"
            />
            <button
              type="button"
              className={styles.locationButton}
              onClick={requestCurrentLocation}
              disabled={geoStatus === "requesting"}
              aria-label="Use current location"
            >
              <LocationIcon />
            </button>
          </div>

          {locationOpen && (
            <div className={styles.locationSuggestions} role="listbox">
              {locationLoading && (
                <div className={styles.locationSuggestionMuted}>
                  Searching...
                </div>
              )}
              {!locationLoading && locationSuggestions.length === 0 && (
                <div className={styles.locationSuggestionMuted}>
                  {locationError || "No suggestions found"}
                </div>
              )}
              {!locationLoading &&
                locationSuggestions.map((option, idx) => (
                  <button
                    type="button"
                    key={`${option.lat}-${option.lon}-${idx}`}
                    className={`${styles.locationSuggestion} ${
                      idx === locationHighlight
                        ? styles.locationSuggestionActive
                        : ""
                    }`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      selectLocation(option);
                    }}
                    onMouseEnter={() => setLocationHighlight(idx)}
                    role="option"
                    aria-selected={idx === locationHighlight}
                  >
                    <span className={styles.locationSuggestionText}>
                      {option.label}
                    </span>
                  </button>
                ))}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-[6px]">
        <label className={styles.label}>Short bio (optional)</label>
        <textarea
          value={bio}
          maxLength={BIO_CHAR_LIMIT}
          onChange={(e) => setBio(e.target.value.slice(0, BIO_CHAR_LIMIT))}
          className={styles.textarea}
          rows={3}
          placeholder={t("auth.signup.bioPlaceholder")}
        />
      </div>

      <button type="submit" className={styles.primaryButton} disabled={loading}>
        {loading ? "Processing..." : "Next"}
      </button>
    </form>
  );

  const renderAvatarStep = () => (
    <div className={styles.avatarStep}>
      <div className={styles.avatarHeader}>
        <div>
          <h3 className="text-[18px] font-semibold text-slate-900">
            Choose avatar
          </h3>
        </div>
        {(avatarThumb || avatarPreview) && (
          <div className={styles.avatarThumb}>
            <img
              src={avatarThumb || avatarPreview || ""}
              alt="Avatar preview"
            />
          </div>
        )}
      </div>

      <div className={styles.avatarGrid}>
        {/* Drop zone */}
        <div
          className={`${styles.cropperCard} transition-all duration-150 ${
            isDragOver
              ? "!border-2 !border-dashed !border-[#3470A2] !bg-[#f0f7ff]"
              : !avatarPreview
              ? "border-2 border-dashed border-[#d7e5f2] hover:border-[#559ac2] hover:bg-[#f8fbff] cursor-pointer"
              : ""
          }`}
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragEnter={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false); }}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file) processAvatarFile(file);
          }}
          onClick={() => {
            if (!avatarPreview) {
              document.getElementById("avatar-drop-input")?.click();
            }
          }}
        >
          {avatarPreview ? (
            <div className={styles.cropperWrapper}>
              <Cropper
                image={avatarPreview}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                restrictPosition
                minZoom={1}
                maxZoom={3}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_, areaPixels) =>
                  setCroppedAreaPixels(areaPixels)
                }
                zoomWithScroll
              />
            </div>
          ) : (
            <div className={`${styles.avatarPlaceholder} flex-col gap-3`}>
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors duration-150 ${isDragOver ? "bg-[#3470A2]" : "bg-[#e8f1fa]"}`}>
                <svg aria-hidden width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={isDragOver ? "#ffffff" : "#3470A2"} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
              </div>
              <div className="text-center">
                <p className={`text-[14px] font-semibold transition-colors duration-150 ${isDragOver ? "text-[#3470A2]" : "text-slate-700"}`}>
                  {isDragOver ? "Drop image here" : "Drag & drop an image here"}
                </p>
                <p className="text-[12px] text-slate-400 mt-0.5">or click to browse from device</p>
              </div>
            </div>
          )}
          {/* Hidden file input driven by drop zone click */}
          <input
            id="avatar-drop-input"
            type="file"
            accept="image/*"
            onChange={handleAvatarFileChange}
            hidden
          />
        </div>

        <div className={styles.avatarControls}>
          <label className={styles.fileButton}>
            {avatarPreview ? "Change image" : "Choose image from device"}
            <input
              type="file"
              accept="image/*"
              onChange={handleAvatarFileChange}
              hidden
            />
          </label>

          <div className={styles.sliderRow}>
            <span className={styles.sliderLabel}>Zoom</span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              disabled={!avatarPreview}
            />
            <span className={styles.sliderValue}>x{zoom.toFixed(2)}</span>
          </div>

          <div className={styles.avatarActions}>
            <button
              type="button"
              className={styles.ghostButton}
              onClick={handleSkipAvatar}
              disabled={loading}
            >
              Skip
            </button>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={handleSubmitAvatar}
              disabled={loading || !signupToken}
            >
              {loading ? "Finishing..." : "Finish"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const renderStepForm = () => {
    if (step === "email") return renderEmailStep();
    if (step === "otp") return renderOtpStep();
    if (step === "avatar") return renderAvatarStep();
    return renderProfileStep();
  };

  if (!canRender) return null;

  const stepToIdx: Record<Step, number> = { email: 0, otp: 1, profile: 2, avatar: 3 };
  const mobileStepIdx = stepToIdx[step];
  const mobileTitles = ["Create account", "Verify email", "Profile info", "Choose avatar"];
  const mobileSubtitles = [
    "Enter your email to get started",
    `Enter the OTP sent to ${email}`,
    "Complete your account details",
    "Add a profile photo (optional)",
  ];
  const mobileShowBack =
    (step === "otp" && !isGoogleFlow) ||
    (step === "profile" && !isGoogleFlow) ||
    step === "avatar";

  return (
    <div className={`${styles.page} ${styles["page-transition"]}`}>

      {/* ====== MOBILE LAYOUT — giống 100% Flutter app ====== */}
      <div
        className="md:hidden min-h-screen overflow-y-auto"
        style={{ background: "linear-gradient(to bottom, #1F4F7A 0%, #3470A2 35%, #F4F7FB 75%)" }}
      >
        <div className="px-5 pt-3 pb-6 max-w-[430px] mx-auto">

          {/* Brand */}
          <div className="flex flex-col items-center pt-3 pb-4">
            <img src="/logo.png" alt="Cordigram" width={100} height={100} className="rounded-2xl" />
            <span className="mt-2.5 text-white font-bold text-[14px] tracking-[2px]">CORDIGRAM</span>
          </div>

          {/* Step indicator */}
          <div className="flex items-center mb-4">
            {[0, 1, 2, 3].map((idx) => (
              <div key={idx} className="contents">
                {idx > 0 && (
                  <div
                    className="flex-1 h-0.5"
                    style={{ background: idx <= mobileStepIdx ? "rgba(255,255,255,1)" : "rgba(255,255,255,0.3)" }}
                  />
                )}
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-bold flex-shrink-0"
                  style={{
                    background: idx <= mobileStepIdx ? "#ffffff" : "rgba(255,255,255,0.24)",
                    color: idx < mobileStepIdx ? "#3470A2" : idx === mobileStepIdx ? "#3470A2" : "rgba(255,255,255,0.6)",
                  }}
                >
                  {idx < mobileStepIdx ? "✓" : idx + 1}
                </div>
              </div>
            ))}
          </div>

          {/* White card */}
          <div className="bg-white rounded-[20px] px-4 pt-[18px] pb-4" style={{ boxShadow: "0 10px 26px rgba(15,47,74,0.165)" }}>

            {/* Step header */}
            <div className="mb-[18px]">
              {mobileShowBack && (
                <button
                  type="button"
                  className="flex items-center gap-1 text-[#3470A2] text-[13px] font-medium mb-2"
                  onClick={() => {
                    if (step === "otp") { setStep("email"); setOtpCode(""); setCooldownLeft(null); }
                    else if (step === "profile") { setStep("otp"); setError(""); }
                    else if (step === "avatar") { setStep("profile"); setError(""); }
                  }}
                >
                  <svg aria-hidden width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                  Back
                </button>
              )}
              <h2 className="text-[22px] font-extrabold text-[#0F172A]">{mobileTitles[mobileStepIdx]}</h2>
              <p className="text-[13px] text-[#64748B] mt-1">{mobileSubtitles[mobileStepIdx]}</p>
            </div>

            {/* Error banner */}
            {error && (
              <div className="mb-3 px-3 py-2.5 rounded-[10px] bg-red-50 border border-red-200">
                <p className="text-red-700 text-[13px]">{error}</p>
              </div>
            )}

            {/* ── Step 0: Email ── */}
            {step === "email" && !isGoogleFlow && (
              <form onSubmit={handleRequestOtp}>
                <div className="relative mb-[18px]">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#64748B] pointer-events-none"><MailIcon /></span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value.toLowerCase())}
                    placeholder={t("auth.signup.emailPlaceholder")}
                    autoComplete="email"
                    className="w-full h-[52px] pl-[44px] pr-3.5 rounded-[14px] border border-[#D7E5F2] bg-[#F8FBFF] text-[14px] text-[#0F172A] placeholder:text-[#ADB8C7] focus:outline-none focus:border-[#3470A2]"
                  />
                  {fieldError.email && <p className="mt-1 text-red-600 text-[12px]">{fieldError.email}</p>}
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-[50px] rounded-[14px] bg-[#3470A2] text-white font-semibold text-[15px] flex items-center justify-center disabled:opacity-70 mb-[14px]"
                >
                  {loading
                    ? <span className="w-[22px] h-[22px] border-[2.5px] border-white border-t-transparent rounded-full animate-spin inline-block" />
                    : t("auth.signup.sendOTP")}
                </button>
                <button
                  type="button"
                  onClick={handleGoogleAuth}
                  className="w-full h-[50px] rounded-[14px] border border-[#D7E5F2] bg-white flex items-center justify-center gap-2 text-[#1F2937] font-medium text-[14px] mb-[14px]"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 48 48">
                    <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"/>
                    <path fill="#FF3D00" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"/>
                    <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"/>
                    <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"/>
                  </svg>
                  {t("auth.login.continueWithGoogle")}
                </button>
                <div className="flex items-center justify-center text-[13px]">
                  <span className="text-[#64748B]">{"Already have an account? "}</span>
                  <Link href="/login" className="text-[#3470A2] font-semibold ml-1">Sign in</Link>
                </div>
              </form>
            )}

            {/* ── Step 1: OTP ── */}
            {step === "otp" && !isGoogleFlow && (
              <form onSubmit={handleVerifyOtp}>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="• • • • • •"
                  className="w-full h-[58px] mb-2 rounded-[14px] border border-[#D7E5F2] bg-[#F8FBFF] text-center text-[28px] font-bold tracking-[12px] text-[#0F172A] placeholder:text-[#CBD5E1] placeholder:text-[22px] placeholder:tracking-[8px] focus:outline-none focus:border-[#3470A2]"
                />
                <div className="flex justify-between mb-[10px]">
                  <button
                    type="button"
                    className="text-[#3470A2] text-[13px] py-1.5"
                    onClick={() => { setStep("email"); setOtpCode(""); setCooldownLeft(null); }}
                  >
                    Change email
                  </button>
                  <button
                    type="button"
                    className="text-[#3470A2] text-[13px] py-1.5 disabled:opacity-50"
                    disabled={loading || cooldownLeft !== null}
                    onClick={handleRequestOtp}
                  >
                    {cooldownLeft !== null ? `Resend code (${cooldownLeft}s)` : "Resend code"}
                  </button>
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-[50px] rounded-[14px] bg-[#3470A2] text-white font-semibold text-[15px] flex items-center justify-center disabled:opacity-70"
                >
                  {loading
                    ? <span className="w-[22px] h-[22px] border-[2.5px] border-white border-t-transparent rounded-full animate-spin inline-block" />
                    : "Verify"}
                </button>
              </form>
            )}

            {/* ── Step 2: Profile ── */}
            {step === "profile" && (
              <form onSubmit={handleProfileNext} className="flex flex-col gap-3">
                {/* Display name */}
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#94A3B8] pointer-events-none"><BadgeIcon /></span>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder={t("auth.signup.displayNamePlaceholder")}
                    className="w-full h-[52px] pl-[44px] pr-3.5 rounded-[14px] border border-[#D7E5F2] bg-[#F8FBFF] text-[14px] text-[#0F172A] placeholder:text-[#ADB8C7] focus:outline-none focus:border-[#3470A2]"
                  />
                  {fieldError.displayName && <p className="mt-1 text-red-600 text-[12px]">{fieldError.displayName}</p>}
                </div>
                {/* Username */}
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#94A3B8] pointer-events-none"><AtIcon /></span>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => {
                      const cleaned = e.target.value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9_.]/g, "").slice(0, 30);
                      setUsername(cleaned);
                    }}
                    placeholder={t("auth.signup.usernamePlaceholder")}
                    className="w-full h-[52px] pl-[44px] pr-3.5 rounded-[14px] border border-[#D7E5F2] bg-[#F8FBFF] text-[14px] text-[#0F172A] placeholder:text-[#ADB8C7] focus:outline-none focus:border-[#3470A2]"
                  />
                  {fieldError.username && <p className="mt-1 text-red-600 text-[12px]">{fieldError.username}</p>}
                </div>
                {/* Password */}
                {!isGoogleFlow && (
                  <>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#94A3B8] pointer-events-none"><LockIcon /></span>
                      <input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          setFieldError((prev) => ({ ...prev, password: undefined }));
                        }}
                        onBlur={() => {
                          if (password) setPasswordBlurred(true);
                        }}
                        placeholder={t("auth.signup.passwordPlaceholder")}
                        className={`w-full h-[52px] pl-[44px] pr-[44px] rounded-[14px] border bg-[#F8FBFF] text-[14px] text-[#0F172A] placeholder:text-[#ADB8C7] focus:outline-none transition-colors ${passwordBlurred && !allRulesMet ? "border-red-400 focus:border-red-400" : "border-[#D7E5F2] focus:border-[#3470A2]"}`}
                      />
                      <button type="button" onClick={() => setShowPassword((p) => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] p-1">
                        <EyeIcon open={showPassword} />
                      </button>
                      {fieldError.password && !password && <p className="mt-1 text-red-600 text-[12px]">{fieldError.password}</p>}
                      {(password.length > 0 || passwordBlurred) && (
                        <div className="mt-2 flex flex-col gap-[5px]">
                          {passwordRules.map((rule) => (
                            <div key={rule.key} className={`flex items-center gap-2 text-[11px] font-medium transition-colors ${rule.met ? "text-[#3470a2]" : passwordBlurred ? "text-red-500" : "text-[#94A3B8]"}`}>
                              <div
                                className={`w-[16px] h-[16px] rounded-full border flex items-center justify-center flex-shrink-0 transition-all ${rule.met ? "border-[#3470a2]" : passwordBlurred ? "border-red-400 bg-transparent" : "border-[#CBD5E1] bg-transparent"}`}
                                style={rule.met ? { background: "linear-gradient(135deg, #559ac2 0%, #3470a2 55%, #9aacef 100%)", boxShadow: "0 2px 6px rgba(52,112,162,0.32)" } : undefined}
                              >
                                {rule.met && (
                                  <svg width={9} height={9} viewBox="0 0 12 12" fill="none">
                                    <polyline points="2,7 5,10 10,3" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                )}
                              </div>
                              <span>{rule.label}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#94A3B8] pointer-events-none"><LockIcon /></span>
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder={t("auth.signup.confirmPasswordPlaceholder")}
                        className="w-full h-[52px] pl-[44px] pr-[44px] rounded-[14px] border border-[#D7E5F2] bg-[#F8FBFF] text-[14px] text-[#0F172A] placeholder:text-[#ADB8C7] focus:outline-none focus:border-[#3470A2]"
                      />
                      <button type="button" onClick={() => setShowConfirmPassword((p) => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] p-1">
                        <EyeIcon open={showConfirmPassword} />
                      </button>
                      {fieldError.confirmPassword && <p className="mt-1 text-red-600 text-[12px]">{fieldError.confirmPassword}</p>}
                    </div>
                  </>
                )}
                {/* Birthdate — custom overlay giống Flutter DatePicker */}
                <button
                  type="button"
                  onClick={() => setMobileDateOpen(true)}
                  className="w-full h-[52px] flex items-center gap-3 px-3.5 rounded-[14px] border border-[#D7E5F2] bg-[#F8FBFF] text-left"
                >
                  <span className="text-[#94A3B8] flex-shrink-0"><CakeIcon /></span>
                  <span className={`flex-1 text-[14px] ${birthdate ? "text-[#0F172A]" : "text-[#ADB8C7]"}`}>
                    {birthdate
                      ? (() => { const [y, m, d] = birthdate.split("-"); return `${d}/${m}/${y}`; })()
                      : "Select birthdate"}
                  </span>
                  <span className="text-[#94A3B8] flex-shrink-0"><CalendarIcon /></span>
                </button>
                {fieldError.birthdate && <p className="text-red-600 text-[12px]">{fieldError.birthdate}</p>}
                {/* Gender — overlay dialog giống Flutter */}
                <button
                  type="button"
                  className="w-full h-[52px] flex items-center gap-3 px-3.5 rounded-[14px] border border-[#D7E5F2] bg-[#F8FBFF] text-left"
                  onClick={() => setMobileGenderOpen(true)}
                >
                  <span className="text-[#94A3B8] flex-shrink-0"><PersonOutlineIcon /></span>
                  <span className={`flex-1 text-[14px] ${gender ? "text-[#0F172A]" : "text-[#ADB8C7]"}`}>
                    {gender ? genderOptions.find((o) => o.value === gender)?.label : "Select gender"}
                  </span>
                  <span className="text-[#94A3B8] flex-shrink-0"><ChevronDownIcon /></span>
                </button>
                {fieldError.gender && <p className="text-red-600 text-[12px]">{fieldError.gender}</p>}
                {/* Bio */}
                <div className="relative">
                  <span className="absolute left-3.5 top-3.5 text-[#94A3B8] pointer-events-none"><EditNoteIcon /></span>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value.slice(0, 300))}
                    placeholder={t("auth.signup.bioPlaceholder")}
                    rows={3}
                    maxLength={300}
                    className="w-full pt-3.5 pb-3 pl-[44px] pr-3.5 rounded-[14px] border border-[#D7E5F2] bg-[#F8FBFF] text-[14px] text-[#0F172A] placeholder:text-[#ADB8C7] focus:outline-none focus:border-[#3470A2] resize-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-[50px] rounded-[14px] bg-[#3470A2] text-white font-semibold text-[15px] flex items-center justify-center disabled:opacity-70"
                >
                  {loading
                    ? <span className="w-[22px] h-[22px] border-[2.5px] border-white border-t-transparent rounded-full animate-spin inline-block" />
                    : "Create account"}
                </button>
              </form>
            )}

            {/* ── Step 3: Avatar ── */}
            {step === "avatar" && (
              <div className="flex flex-col items-stretch gap-4">
                <div className="flex flex-col items-center">
                  {/* Avatar circle */}
                  <div
                    style={{
                      width: 120,
                      height: 120,
                      borderRadius: "50%",
                      overflow: "hidden",
                      border: "2px solid #B0C4D8",
                      background: "#EAF0F6",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {(avatarThumb || avatarPreview) ? (
                      <img
                        src={avatarThumb || avatarPreview || ""}
                        alt="Avatar"
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          display: "block",
                        }}
                      />
                    ) : (
                      <PersonPlaceholderIcon />
                    )}
                  </div>
                  <p className="mt-2 text-center text-[12px] text-[#94A3B8]">
                    {avatarPreview
                      ? "Photo ready. Tap below to change."
                      : "No photo selected — a default avatar will be used"}
                  </p>
                </div>
                <label className="w-full h-[50px] rounded-[14px] border border-[#D7E5F2] flex items-center justify-center gap-2 text-[#3470A2] text-[14px] font-medium cursor-pointer">
                  <PhotoIcon /> Chọn từ thư viện
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      handleAvatarFileChange(e);
                      if (e.target.files?.[0]) setMobileCropOpen(true);
                    }}
                    hidden
                  />
                </label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={handleSkipAvatar}
                    disabled={loading}
                    className="flex-1 h-[50px] rounded-[14px] border border-[#D7E5F2] text-[#64748B] text-[14px] font-medium disabled:opacity-60"
                  >
                    Skip
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmitAvatar}
                    disabled={loading || !signupToken}
                    className="flex-[2] h-[50px] rounded-[14px] bg-[#3470A2] text-white font-semibold text-[15px] flex items-center justify-center disabled:opacity-70"
                  >
                    {loading
                      ? <span className="w-[22px] h-[22px] border-[2.5px] border-white border-t-transparent rounded-full animate-spin inline-block" />
                      : "Finish"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Crop overlay — mobile only, fullscreen giống Flutter */}
      {mobileCropOpen && avatarPreview && (
        <div className="md:hidden fixed inset-0 z-[70] bg-black flex flex-col">
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3 flex-shrink-0"
            style={{ background: "#1F4F7A" }}
          >
            <button
              type="button"
              onClick={() => setMobileCropOpen(false)}
              className="text-white p-2"
              aria-label="Cancel crop"
            >
              <svg aria-hidden width={22} height={22} viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
            <span className="text-white text-[16px] font-semibold">Cắt ảnh</span>
            <button
              type="button"
              onClick={handleMobileCropConfirm}
              className="text-white p-2"
              aria-label="Confirm crop"
            >
              <svg aria-hidden width={24} height={24} viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </button>
          </div>

          {/* Cropper area */}
          <div className="flex-1 relative">
            <Cropper
              image={avatarPreview}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid
              restrictPosition
              minZoom={1}
              maxZoom={3}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={(_, areaPixels) => setCroppedAreaPixels(areaPixels)}
            />
          </div>

          {/* Zoom slider */}
          <div className="bg-black px-6 py-5 flex-shrink-0 flex flex-col items-center gap-2">
            <span className="text-white text-[12px] font-medium">{Math.round(zoom * 100)}%</span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full accent-[#3470A2]"
            />
          </div>
        </div>
      )}

      {/* Birthdate overlay — mobile only */}
      <MobileDatePicker
        open={mobileDateOpen}
        value={birthdate}
        onChange={(next) => {
          setBirthdate(next);
          setFieldError((prev) => ({ ...prev, birthdate: undefined }));
        }}
        onClose={() => setMobileDateOpen(false)}
        maxDate={new Date()}
      />

      {/* Gender overlay — mobile only, fixed fullscreen */}
      {mobileGenderOpen && (
        <div
          className="md:hidden fixed inset-0 z-50 flex items-center justify-center px-6"
          style={{ background: "rgba(15,23,42,0.45)" }}
          onClick={() => setMobileGenderOpen(false)}
        >
          <div
            className="bg-white rounded-[20px] w-full max-w-[360px] px-4 pt-5 pb-2"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-center text-[16px] font-bold text-[#0F172A] mb-2">Select gender</h3>
            {([
              { value: "male", label: "Male" },
              { value: "female", label: "Female" },
              { value: "other", label: "Other" },
              { value: "prefer_not_to_say", label: "Prefer not to say" },
            ] as const).map((opt) => (
              <button
                key={opt.value}
                type="button"
                className="w-full text-left px-2 py-4 text-[15px] text-[#0F172A] border-b border-[#F1F5F9] last:border-0 flex items-center justify-between"
                onClick={() => {
                  setGender(opt.value);
                  setFieldError((prev) => ({ ...prev, gender: undefined }));
                  setMobileGenderOpen(false);
                }}
              >
                {opt.label}
                {gender === opt.value && (
                  <svg aria-hidden width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#3470A2" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ====== DESKTOP LAYOUT ====== */}
      <div className="hidden md:block min-h-screen">
        <div className="grid min-h-screen w-full grid-cols-1 lg:grid-cols-2">
          <div className={styles["signup-left"]}>
            <div className="w-full max-w-[520px] rounded-2xl bg-white px-10 py-9 shadow-[0_4px_32px_rgba(15,23,42,0.10),0_1px_4px_rgba(15,23,42,0.06)]">
              <div className="flex flex-col items-center mb-6">
                <img src="/logo.png" alt="Cordigram" width={48} height={48} className="rounded-[14px]" />
                <span className="mt-2 text-[11px] font-bold tracking-[2.5px] text-slate-400 uppercase">Cordigram</span>
              </div>
              <div className={styles.cardHeader}>
                {step === "avatar" && (
                  <button
                    type="button"
                    className={styles.backButton}
                    onClick={() => {
                      setStep("profile");
                      setError("");
                      setInfo("");
                    }}
                    aria-label="Back to profile info"
                  >
                    <ArrowLeftIcon />
                  </button>
                )}
                <div>
                  <h1 className="text-[26px] font-bold leading-[1.2] text-slate-900 tracking-tight">
                    Create your account
                  </h1>
                  <p className="mt-1 text-[13px] text-slate-500 font-medium">
                    Join Cordigram — it only takes a minute.
                  </p>
                </div>
                <p className="whitespace-nowrap text-[13px] text-slate-500 font-medium">
                  Step {currentStepIndex + 1} / {steps.length}
                </p>
              </div>

              <div className={styles.stepper}>
                {steps.map(({ key, label }, index) => {
                  const active = visualStep === key;
                  const done = currentStepIndex > index;
                  const isLast = index === steps.length - 1;
                  return (
                    <Fragment key={key}>
                      <div className={styles.stepItem}>
                        <div className={`${styles.stepBullet} ${active ? styles.stepBulletActive : ""} ${done ? styles.stepBulletDone : ""}`}>
                          {done ? (
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          ) : index + 1}
                        </div>
                        <span className={`${styles.stepLabel} ${active ? styles.stepLabelActive : ""} ${done ? styles.stepLabelDone : ""}`}>
                          {label}
                        </span>
                      </div>
                      {!isLast && (
                        <div className={`${styles.stepConnector} ${done ? styles.stepConnectorDone : ""}`} />
                      )}
                    </Fragment>
                  );
                })}
              </div>

              {error && <div className={styles.errorBox}>{error}</div>}
              {info && <div className={styles.infoBox}>{info}</div>}

              <div className="mt-[18px]">{renderStepForm()}</div>

              <div className="mt-[22px] text-center text-[14px] font-medium leading-[1.5] text-slate-700">
                Already have an account?{" "}
                <Link
                  href="/login"
                  className="font-semibold text-[#3470A2] underline decoration-[#559AC2]/60 underline-offset-4 transition hover:brightness-110"
                >
                  Log in
                </Link>
              </div>

              <div className="mt-5 space-y-3">
                <div className={styles.divider}>
                  <span className={styles.dividerLine} />
                  <span className={styles.dividerText}>or</span>
                  <span className={styles.dividerLine} />
                </div>
                <button
                  type="button"
                  onClick={handleGoogleAuth}
                  className={styles.oauthButton}
                >
                  <span className="">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      x="0px"
                      y="0px"
                      width="30"
                      height="30"
                      viewBox="0 0 48 48"
                    >
                      <path
                        fill="#FFC107"
                        d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"
                      ></path>
                      <path
                        fill="#FF3D00"
                        d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"
                      ></path>
                      <path
                        fill="#4CAF50"
                        d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,39.556,16.227,44,24,44z"
                      ></path>
                      <path
                        fill="#1976D2"
                        d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"
                      ></path>
                    </svg>
                  </span>
                  Sign up with Google
                </button>
              </div>
            </div>
          </div>

          <div className={styles["hero-panel"]}>
            <div className={styles["hero-tilt"]}>
              <div className={styles["hero-card"]}>
                <h2 className="mt-4 text-[40px] font-bold leading-tight text-white tracking-tight">
                  Welcome to Cordigram
                </h2>
                <p className="mt-3 text-[15px] leading-6 text-white/70 max-w-[360px]">
                  Channels, feeds, and communities — all in one place.
                  Built for the way people actually connect online.
                </p>

                <div className={styles["hero-chip-row"]}>
                  <div className={styles["hero-chip"]}>
                    <span className={styles["hero-chip-dot"]} /> Realtime channels
                  </div>
                  <div className={styles["hero-chip"]}>
                    <span className={styles["hero-chip-dot"]} /> Media feed & reels
                  </div>
                  <div className={styles["hero-chip"]}>
                    <span className={styles["hero-chip-dot"]} /> Voice-ready
                  </div>
                </div>

                <div className={styles["hero-badges"]}>
                  <div className={styles["hero-badge"]}>
                    <span className={styles["hero-badge-icon"]}>
                      <svg aria-hidden width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                    </span>
                    <p>Permissions and roles to manage communities safely.</p>
                  </div>
                  <div className={styles["hero-badge"]}>
                    <span className={styles["hero-badge-icon"]}>
                      <svg aria-hidden width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>
                    </span>
                    Multi-device sync with instant notifications.
                  </div>
                  <div className={styles["hero-badge"]}>
                    <span className={styles["hero-badge-icon"]}>
                      <svg aria-hidden width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
                    </span>
                    Modern UI optimized for sharing content.
                  </div>
                  <div className={styles["hero-badge"]}>
                    <span className={styles["hero-badge-icon"]}>
                      <svg aria-hidden width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
                    </span>
                    Share photos, videos, and reels with your network.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
