"use client";

import {
  ChangeEvent,
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
import { DateSelect } from "@/ui/date-select/date-select";

type Step = "email" | "otp" | "profile" | "avatar";

type GeoStatus = "idle" | "requesting" | "granted" | "denied" | "error";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const usernameRegex = /^[a-z0-9_.]{3,30}$/;

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

function validateDisplayName(name: string): string | null {
  if (!name) return null;
  const condensed = name.replace(/\s/g, "");
  if (name.length < 3 || name.length > 30) {
    return "Atleast 3 and maximum 30 character";
  }
  if (condensed.length < 3) {
    return "Display name needs at least 3 letters after removing spaces";
  }
  if (!/^[\p{L}\s]+$/u.test(name)) {
    return "Display name can only contain letters and spaces";
  }
  return null;
}

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

export default function SignupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const canRender = useRedirectIfAuthed();

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
  const [birthdate, setBirthdate] = useState("");

  const [gender, setGender] = useState<
    "male" | "female" | "other" | "prefer_not_to_say" | ""
  >("");
  const [genderOpen, setGenderOpen] = useState(false);
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

  const saveRecentAccount = (account: {
    email: string;
    username?: string;
    displayName?: string;
    avatarUrl?: string | null;
  }) => {
    if (typeof window === "undefined") return;
    const normalizedEmail = account.email.trim().toLowerCase();
    if (!emailRegex.test(normalizedEmail)) return;

    try {
      const raw = window.localStorage.getItem("recentAccounts");
      const parsed = raw ? (JSON.parse(raw) as any[]) : [];
      const filtered = Array.isArray(parsed)
        ? parsed.filter((item) => item?.email !== normalizedEmail)
        : [];
      const next = [
        {
          email: normalizedEmail,
          username: account.username,
          displayName: account.displayName,
          avatarUrl: account.avatarUrl || undefined,
          lastUsed: Date.now(),
        },
        ...filtered,
      ].slice(0, 6);
      window.localStorage.setItem("recentAccounts", JSON.stringify(next));
    } catch (_err) {
      // ignore localStorage errors
    }
  };

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

    if (username.length < 3) {
      setUsernameError(null);
      setFieldError((prev) => ({
        ...prev,
        username: "Username must be at least 3 characters",
      }));
      return;
    }
    if (username.length > 30) {
      setUsernameError(null);
      setFieldError((prev) => ({
        ...prev,
        username: "Username must be at most 30 characters",
      }));
      return;
    }
    if (!usernameRegex.test(username)) {
      setUsernameError(null);
      setFieldError((prev) => ({
        ...prev,
        username:
          "Username can only include letters, numbers, underscores, and dots",
      }));
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
      showInfo("Verification successful. Complete your account info.");
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
        username: usernameError || "Đang kiểm tra username",
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
        setFieldError((prev) => ({
          ...prev,
          password: "Password is reqiure",
        }));
        return;
      }
      if (trimmedPassword.length < 8) {
        setFieldError((prev) => ({
          ...prev,
          password: "Password must be at least 8 characters",
        }));
        return;
      }
      if (trimmedPassword !== confirmPassword) {
        setFieldError((prev) => ({
          ...prev,
          confirmPassword: "Passwords do not match",
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
    setStep("avatar");
  };

  const handleAvatarFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
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

    setStoredAccessToken(res.accessToken);
    saveRecentAccount({
      email,
      username,
      displayName,
      avatarUrl: avatarData?.avatarUrl ?? null,
    });

    if (typeof window !== "undefined") {
      localStorage.setItem("ui-theme", "light");
    }
    if (typeof document !== "undefined") {
      document.documentElement.dataset.theme = "light";
      document.body.dataset.theme = "light";
    }
    showInfo("Sign-up successful. Redirecting...");
    router.push("/");
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
        const croppedBlob = await getCroppedBlob(
          avatarPreview,
          croppedAreaPixels,
        );
        const form = new FormData();
        form.append("original", avatarFile, avatarFile.name);
        form.append(
          "cropped",
          new File([croppedBlob], `avatar-cropped-${Date.now()}.jpg`, {
            type: "image/jpeg",
          }),
        );

        const uploadRes = await fetch(`${getApiBaseUrl()}/auth/upload-avatar`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${signupToken}`,
          },
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

  const renderEmailStep = () => {
    if (isGoogleFlow) return null;
    return (
      <form className="space-y-[16px]" onSubmit={handleRequestOtp}>
        <div className="space-y-[6px]">
          <label className={styles.label}>Email address</label>
          <input
            type="email"
            name="email"
            value={email}
            onChange={(e) => setEmail(e.target.value.toLowerCase())}
            placeholder="email@example.com"
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
          {loading ? "Sending..." : "Send OTP"}
        </button>
      </form>
    );
  };

  const renderOtpStep = () => {
    if (isGoogleFlow) return null;
    return (
      <form className="space-y-[16px]" onSubmit={handleVerifyOtp}>
        <div className="space-y-[6px]">
          <div className={styles.labelRow}>
            <label className={styles.label}>Enter OTP code</label>
            <span className={styles.muted}>Sent to {email}</span>
          </div>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={otpCode}
            onChange={(e) => setOtpCode(e.target.value.replace(/[^0-9]/g, ""))}
            className={styles.input}
            placeholder="Example: 123456"
          />
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
            placeholder="E.g. Cordigrammer"
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
            placeholder="username"
            pattern="^[a-z0-9_\\.]{3,30}$"
            required
          />
          {fieldError.username ? (
            <p className={styles.fieldError}>{fieldError.username}</p>
          ) : (
            <p className="text-[12px]">
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
                className={`${styles.input} ${styles.passwordInput}`}
                placeholder="At least 8 characters"
              />
              <button
                type="button"
                className={styles.passwordToggle}
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                <EyeIcon open={showPassword} />
              </button>
            </div>
            {fieldError.password && (
              <p className={styles.fieldError}>{fieldError.password}</p>
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
                className={`${styles.input} ${styles.passwordInput}`}
                placeholder="Re-enter to confirm"
              />
              <button
                type="button"
                className={styles.passwordToggle}
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                aria-label={
                  showConfirmPassword ? "Hide password" : "Show password"
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
              placeholder="Add a city, landmark, or place"
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
          placeholder="Share a little about yourself"
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
        <div className={styles.cropperCard}>
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
            <div className={styles.avatarPlaceholder}>
              <p className="text-[14px] text-slate-600">
                Pick an image to preview and crop.
              </p>
            </div>
          )}
        </div>

        <div className={styles.avatarControls}>
          <label className={styles.fileButton}>
            Choose image from device
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

  return (
    <div className={`${styles.page} ${styles["page-transition"]}`}>
      <div className="min-h-screen">
        <div className="grid min-h-screen w-full grid-cols-1 lg:grid-cols-2">
          <div className={styles["signup-left"]}>
            <div className="w-full max-w-[520px] rounded-2xl border border-[#e5edf5] bg-white p-10 shadow-xl">
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
                <h1 className="text-[32px] font-semibold leading-[1.2] text-slate-900">
                  Create a Cordigram account
                </h1>
                <p className="whitespace-nowrap text-[14px] text-slate-600">
                  Step {currentStepIndex + 1} / {steps.length}
                </p>
              </div>

              <div className={styles.stepper}>
                {steps.map(({ key, label }) => {
                  const index = steps.findIndex((s) => s.key === key);
                  const active = visualStep === key;
                  const done = currentStepIndex > index;
                  return (
                    <div key={key} className={styles.stepItem}>
                      <div
                        className={`${styles.stepBullet} ${
                          active ? styles.stepBulletActive : ""
                        } ${done ? styles.stepBulletDone : ""}`}
                      >
                        {done ? "✓" : index + 1}
                      </div>
                      <span className={styles.stepLabel}>{label}</span>
                    </div>
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
                <h2 className="mt-4 text-[38px] font-semibold leading-tight text-white">
                  Welcome to Cordigram!
                </h2>
                <p className="mt-3 text-[16px] leading-6 text-slate-100/90">
                  A social platform with real-time chat channels. Create
                  Discord-style channels, share photos/videos like Instagram,
                  and connect communities the modern way.
                </p>

                <div className={styles["hero-chip-row"]}>
                  <div className={styles["hero-chip"]}>
                    <span className={styles["hero-chip-dot"]} /> Realtime
                    channels
                  </div>
                  <div className={styles["hero-chip"]}>
                    <span className={styles["hero-chip-dot"]} /> Media feed &
                    stories
                  </div>
                  <div className={styles["hero-chip"]}>
                    <span className={styles["hero-chip-dot"]} /> Voice-ready
                  </div>
                </div>

                <div className={styles["hero-badges"]}>
                  <div className={styles["hero-badge"]}>
                    <span className={styles["hero-badge-icon"]}>◆</span>
                    <p>Permissions and roles to manage communities safely.</p>
                  </div>
                  <div className={styles["hero-badge"]}>
                    <span className={styles["hero-badge-icon"]}>⇆</span>
                    Multi-device sync with instant notifications.
                  </div>
                  <div className={styles["hero-badge"]}>
                    <span className={styles["hero-badge-icon"]}>★</span>
                    Modern UI optimized for sharing content.
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
