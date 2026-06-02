"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./profile-edit-overlay.module.css";
import { useLanguage } from "@/component/language-provider";
import { DateSelect } from "@/ui/date-select/date-select";
import {
  apiFetch,
  suggestCompanies,
  updateMyProfile,
  type CompanySuggestItem,
  type ProfileDetailResponse,
  type UpdateMyProfilePayload,
} from "@/lib/api";

const USERNAME_REGEX = /^(?!.*\.\.)[a-z0-9][a-z0-9_.]{1,18}[a-z0-9]$/;
type GeoStatus = "idle" | "requesting" | "granted" | "denied" | "error";

const BIO_CHAR_LIMIT = 300;

const cleanLocationLabel = (label: string) =>
  label
    .replace(/\b\d{4,6}\b/g, "")
    .replace(/,\s*,+/g, ", ")
    .replace(/\s{2,}/g, " ")
    .replace(/\s*,\s*$/g, "")
    .replace(/^\s*,\s*/g, "")
    .trim();

const IconClose = ({ size = 18 }: { size?: number }) => (
  <svg
    aria-hidden
    width={size}
    height={size}
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M6 6l12 12M18 6 6 18"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
    />
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

const GENDER_VALUES = ["male", "female", "other", "prefer_not_to_say"] as const;

type GenderValue = "" | (typeof GENDER_VALUES)[number];

type ProfileEditOverlayProps = {
  open: boolean;
  token: string | null;
  viewerId?: string;
  profile: ProfileDetailResponse | null;
  onClose: () => void;
  onSaved: (updated: ProfileDetailResponse) => void;
};

export default function ProfileEditOverlay({
  open,
  token,
  viewerId,
  profile,
  onClose,
  onSaved,
}: ProfileEditOverlayProps) {
  const { t } = useLanguage();

  const usernameLockedDaysLeft = useMemo(() => {
    const changedAt = profile?.usernameChangedAt;
    if (!changedAt) return 0;
    const COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
    const elapsed = Date.now() - new Date(changedAt).getTime();
    const remaining = COOLDOWN_MS - elapsed;
    if (remaining <= 0) return 0;
    return Math.ceil(remaining / (24 * 60 * 60 * 1000));
  }, [profile?.usernameChangedAt]);

  const genderOptions = useMemo(
    () => [
      { value: "male" as const, label: t("profilePage.editOverlay.genderMale") },
      { value: "female" as const, label: t("profilePage.editOverlay.genderFemale") },
      { value: "other" as const, label: t("profilePage.editOverlay.genderOther") },
      { value: "prefer_not_to_say" as const, label: t("profilePage.editOverlay.genderPreferNot") },
    ],
    [t],
  );

  const validateDisplayName = (name: string): string | null => {
    if (!name) return t("profilePage.editOverlay.displayNameRequired");
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 30) return t("profilePage.editOverlay.displayNameLengthError");
    const letterCount = [...trimmed].filter((c) => /\p{L}/u.test(c)).length;
    if (letterCount < 2) return t("profilePage.editOverlay.displayNameLettersError");
    if (!/^[\p{L}\p{N}\s'.,\-]+$/u.test(trimmed)) return t("profilePage.editOverlay.displayNameCharsError");
    return null;
  };

  const validateBirthdate = (dateStr: string): string | null => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return t("profilePage.editOverlay.birthdateInvalid");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const chosen = new Date(date);
    chosen.setHours(0, 0, 0, 0);
    if (chosen > today) return t("profilePage.editOverlay.birthdateFuture");
    return null;
  };

  const [mounted, setMounted] = useState(false);
  const [saving, setSaving] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [gender, setGender] = useState<GenderValue>("");
  const [location, setLocation] = useState("");
  const [workplaceInput, setWorkplaceInput] = useState("");
  const [workplaceQuery, setWorkplaceQuery] = useState("");
  const [workplaceSuggestions, setWorkplaceSuggestions] = useState<
    CompanySuggestItem[]
  >([]);
  const [workplaceLoading, setWorkplaceLoading] = useState(false);
  const [workplaceError, setWorkplaceError] = useState("");
  const [workplaceOpen, setWorkplaceOpen] = useState(false);
  const [workplaceHighlight, setWorkplaceHighlight] = useState(-1);
  const [workplaceSelectedId, setWorkplaceSelectedId] = useState<string | null>(
    null,
  );
  const [workplaceInteracted, setWorkplaceInteracted] = useState(false);
  const [bio, setBio] = useState("");
  const [birthdate, setBirthdate] = useState("");

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
  const [locationInteracted, setLocationInteracted] = useState(false);

  const [fieldError, setFieldError] = useState<{
    [k: string]: string | undefined;
  }>({});
  const [usernameChecking, setUsernameChecking] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);

  const [genderOpen, setGenderOpen] = useState(false);
  const genderRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
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
  }, [open, genderOpen]);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    if (!profile) return;

    setDisplayName(profile.displayName || "");
    setUsername(profile.username || "");
    setGender((profile.gender as GenderValue) || "");
    const nextLocation = profile.location || "";
    setLocation(nextLocation);
    setLocationInput(nextLocation);
    setLocationQuery(nextLocation);
    setLocationSuggestions([]);
    setLocationOpen(false);
    setLocationHighlight(-1);
    setLocationError("");
    setLocationLoading(false);
    setGeoStatus("idle");
    setLocationInteracted(false);

    const nextWorkplace = profile.workplace?.companyName || "";
    setWorkplaceInput(nextWorkplace);
    setWorkplaceQuery(nextWorkplace);
    setWorkplaceSuggestions([]);
    setWorkplaceOpen(false);
    setWorkplaceHighlight(-1);
    setWorkplaceError("");
    setWorkplaceLoading(false);
    setWorkplaceSelectedId(profile.workplace?.companyId || null);
    setWorkplaceInteracted(false);

    setBio(profile.bio || "");
    setBirthdate(profile.birthdate || "");

    setFieldError({});
    setUsernameError(null);
    setGenderOpen(false);
  }, [open, profile]);

  useEffect(() => {
    if (!open) return;
    if (!token) return;
    if (!workplaceInteracted) return;

    if (!workplaceQuery.trim()) {
      setWorkplaceSuggestions([]);
      setWorkplaceOpen(false);
      setWorkplaceHighlight(-1);
      setWorkplaceError("");
      setWorkplaceLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setWorkplaceLoading(true);
      setWorkplaceError("");
      try {
        const res = await suggestCompanies({
          token,
          query: workplaceQuery,
          limit: 8,
          signal: controller.signal,
        });
        const items = res?.items ?? [];
        setWorkplaceSuggestions(items);
        setWorkplaceOpen(true);
        setWorkplaceHighlight(items.length ? 0 : -1);
      } catch (err) {
        if (controller.signal.aborted) return;
        setWorkplaceSuggestions([]);
        setWorkplaceOpen(false);
        setWorkplaceHighlight(-1);
        const message =
          typeof err === "object" && err && "message" in err
            ? String((err as { message?: unknown }).message)
            : "Unable to fetch suggestions";
        setWorkplaceError(message || t("profilePage.editOverlay.workplaceError"));
      } finally {
        if (!controller.signal.aborted) setWorkplaceLoading(false);
      }
    }, 250);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [open, token, workplaceQuery]);

  useEffect(() => {
    if (!open) return;
    if (!locationInteracted) return;

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
      } catch (_err) {
        if (controller.signal.aborted) return;
        setLocationSuggestions([]);
        setLocationOpen(false);
        setLocationHighlight(-1);
        setLocationError(t("profilePage.editOverlay.locationNoSuggestionsKeyword"));
      } finally {
        if (!controller.signal.aborted) setLocationLoading(false);
      }
    }, 350);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [open, locationQuery, locationInteracted]);

  const selectLocation = (option: {
    label: string;
    lat: string;
    lon: string;
  }) => {
    setLocation(option.label);
    setLocationInput(option.label);
    setLocationQuery(option.label);
    setLocationSuggestions([]);
    setLocationOpen(false);
    setLocationHighlight(-1);
  };

  const onLocationChange = (value: string) => {
    setLocationInteracted(true);
    setLocation(value);
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
    setLocationInteracted(true);
    if (locationSuggestions.length) setLocationOpen(true);
  };

  const onLocationKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
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

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;

    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onDocClick = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (
        genderOpen &&
        genderRef.current &&
        !genderRef.current.contains(target)
      ) {
        setGenderOpen(false);
      }
    };

    document.addEventListener("mousedown", onDocClick, true);
    document.addEventListener("touchstart", onDocClick, true);
    return () => {
      document.removeEventListener("mousedown", onDocClick, true);
      document.removeEventListener("touchstart", onDocClick, true);
    };
  }, [open, genderOpen]);

  useEffect(() => {
    if (!open) return;

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
      if (!/^[a-z0-9_.]+$/.test(username)) return t("profilePage.editOverlay.usernameCharsError");
      return null;
    })();

    if (usernameFormatError) {
      setUsernameError(null);
      setFieldError((prev) => ({ ...prev, username: usernameFormatError }));
      return;
    }

    if (!token) return;

    const timer = setTimeout(async () => {
      setUsernameChecking(true);
      setUsernameError(null);
      try {
        const qs = new URLSearchParams();
        qs.set("username", username);
        if (viewerId) qs.set("excludeUserId", viewerId);

        const res = await apiFetch<{ available: boolean }>({
          path: `/profiles/check-username?${qs.toString()}`,
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!res.available) {
          setUsernameError(t("profilePage.editOverlay.usernameTaken"));
          setFieldError((prev) => ({
            ...prev,
            username: t("profilePage.editOverlay.usernameTaken"),
          }));
        } else {
          setUsernameError(null);
          setFieldError((prev) => ({ ...prev, username: undefined }));
        }
      } catch (_err) {
        // ignore availability failures
      } finally {
        setUsernameChecking(false);
      }
    }, 450);

    return () => clearTimeout(timer);
  }, [open, username, token, viewerId]);

  const normalizedInitial = useMemo(() => {
    return {
      displayName: (profile?.displayName ?? "").trim(),
      username: (profile?.username ?? "").trim().toLowerCase(),
      gender: ((profile?.gender ?? "") as GenderValue) || "",
      location: (profile?.location ?? "").trim(),
      workplace: (profile?.workplace?.companyName ?? "").trim(),
      bio: profile?.bio ?? "",
      birthdate: (profile?.birthdate ?? "").trim(),
    };
  }, [profile]);

  const normalizedCurrent = useMemo(() => {
    return {
      displayName: displayName.trim(),
      username: username.trim().toLowerCase(),
      gender: gender || "",
      location: locationInput.trim(),
      workplace: workplaceInput.trim(),
      bio,
      birthdate: birthdate.trim(),
    };
  }, [
    displayName,
    username,
    gender,
    locationInput,
    workplaceInput,
    bio,
    birthdate,
  ]);

  const dirty = useMemo(() => {
    return (
      normalizedCurrent.displayName !== normalizedInitial.displayName ||
      normalizedCurrent.username !== normalizedInitial.username ||
      normalizedCurrent.gender !== normalizedInitial.gender ||
      normalizedCurrent.location !== normalizedInitial.location ||
      normalizedCurrent.workplace !== normalizedInitial.workplace ||
      normalizedCurrent.bio !== normalizedInitial.bio ||
      normalizedCurrent.birthdate !== normalizedInitial.birthdate
    );
  }, [normalizedCurrent, normalizedInitial]);

  const canSave =
    dirty &&
    !saving &&
    !usernameChecking &&
    !usernameError &&
    !fieldError.username;

  const submit = async () => {
    if (!token) {
      setFieldError((prev) => ({
        ...prev,
        form: t("profilePage.editOverlay.formSessionExpired"),
      }));
      return;
    }

    const displayErr = validateDisplayName(displayName);
    if (displayErr) {
      setFieldError((prev) => ({ ...prev, displayName: displayErr }));
      return;
    }

    if (usernameLockedDaysLeft === 0) {
      const submitUsernameErr = (() => {
        if (username.length < 3) return t("profilePage.editOverlay.usernameTooShort");
        if (username.length > 20) return t("profilePage.editOverlay.usernameTooLong");
        if (/^[._]|[._]$/.test(username)) return t("profilePage.editOverlay.usernameStartEndError");
        if (/\.\./.test(username)) return t("profilePage.editOverlay.usernameConsecutiveDotsError");
        if (!USERNAME_REGEX.test(username)) return t("profilePage.editOverlay.usernameCharsError");
        return null;
      })();
      if (submitUsernameErr) {
        setFieldError((prev) => ({ ...prev, username: submitUsernameErr }));
        return;
      }
    }

    const birthErr = validateBirthdate(birthdate);
    if (birthErr) {
      setFieldError((prev) => ({ ...prev, birthdate: birthErr }));
      return;
    }

    if (!gender) {
      setFieldError((prev) => ({
        ...prev,
        gender: t("profilePage.editOverlay.genderRequired"),
      }));
      return;
    }

    setSaving(true);
    setFieldError((prev) => ({ ...prev, form: undefined }));

    try {
      const payload: UpdateMyProfilePayload = {
        displayName: displayName.trim(),
        // Không gửi username nếu đang trong cooldown
        ...(usernameLockedDaysLeft === 0 && { username: username.trim().toLowerCase() }),
        gender: gender as Exclude<GenderValue, "">,
        location: locationInput.trim(),
        workplaceName: workplaceInput.trim(),
        workplaceCompanyId: workplaceSelectedId || undefined,
        bio,
        birthdate: birthdate.trim() || undefined,
      };

      const updated = await updateMyProfile({ token, payload });
      onSaved(updated);
      onClose();
    } catch (err) {
      const message =
        typeof err === "object" && err && "message" in err
          ? String((err as { message?: unknown }).message)
          : t("profilePage.editOverlay.formUpdateFailed");
      setFieldError((prev) => ({ ...prev, form: message }));
    } finally {
      setSaving(false);
    }
  };

  const selectedGenderLabel =
    genderOptions.find((o) => o.value === gender)?.label || t("profilePage.editOverlay.genderPlaceholder");

  const bioCharCount = bio.length;

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-label={t("profilePage.editOverlay.title")}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.sheet} onMouseDown={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.title}>{t("profilePage.editOverlay.title")}</div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label={t("profilePage.close")}
          >
            <IconClose />
          </button>
        </div>

        <div className={styles.body}>
          <div className={styles.gridTwoCols}>
            <div>
              <label className={styles.label}>{t("profilePage.editOverlay.displayNameLabel")}</label>
              <input
                className={styles.input}
                value={displayName}
                onChange={(e) => {
                  setDisplayName(e.target.value);
                  setFieldError((prev) => ({
                    ...prev,
                    displayName: undefined,
                  }));
                }}
                placeholder={t("profilePage.editOverlay.displayNamePlaceholder")}
              />
              {fieldError.displayName ? (
                <div className={styles.error}>{fieldError.displayName}</div>
              ) : null}
            </div>

            <div>
              <label className={styles.label}>
                {t("profilePage.editOverlay.usernameLabel")}
              </label>
              <input
                className={styles.input}
                value={username}
                disabled={usernameLockedDaysLeft > 0}
                onChange={(e) => {
                  const cleaned = e.target.value
                    .normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "")
                    .toLowerCase()
                    .replace(/[^a-z0-9_.]/g, "")
                    .slice(0, 30);
                  setUsername(cleaned);
                }}
                placeholder={t("profilePage.editOverlay.usernamePlaceholder")}
                inputMode="text"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
              {usernameLockedDaysLeft > 0 ? (
                <div className={styles.usernameCooldownHint}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  {t("profilePage.editOverlay.usernameCooldown", { days: String(usernameLockedDaysLeft) })}
                </div>
              ) : fieldError.username ? (
                <div className={styles.error}>{fieldError.username}</div>
              ) : (
                <div className={styles.hint}>
                  {t("profilePage.editOverlay.usernameHint")}
                </div>
              )}
            </div>
          </div>

          <div className={styles.gridTwoCols} style={{ marginTop: 12 }}>
            <div>
              <label className={styles.label}>{t("profilePage.editOverlay.birthdateLabel")}</label>
              <DateSelect
                value={birthdate}
                onChange={(next) => {
                  setBirthdate(next);
                  setFieldError((prev) => ({
                    ...prev,
                    birthdate: undefined,
                  }));
                }}
              />
              {fieldError.birthdate ? (
                <div className={styles.error}>{fieldError.birthdate}</div>
              ) : null}
            </div>

            <div>
              <label className={styles.label}>{t("profilePage.editOverlay.genderLabel")}</label>
              <div className={styles.selectShell} ref={genderRef}>
                <button
                  type="button"
                  className={styles.selectButton}
                  onClick={() => setGenderOpen((v) => !v)}
                  aria-haspopup="listbox"
                  aria-expanded={genderOpen}
                >
                  <span>{selectedGenderLabel}</span>
                  <span className={styles.chevron} aria-hidden />
                </button>
                {genderOpen ? (
                  <div
                    className={styles.selectMenu}
                    role="listbox"
                    aria-label={t("profilePage.editOverlay.genderLabel")}
                  >
                    {genderOptions.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        className={`${styles.selectOption} ${
                          gender === opt.value ? styles.selectOptionActive : ""
                        }`}
                        onClick={() => {
                          setGender(opt.value);
                          setFieldError((prev) => ({
                            ...prev,
                            gender: undefined,
                          }));
                          setGenderOpen(false);
                        }}
                        role="option"
                        aria-selected={gender === opt.value}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              {fieldError.gender ? (
                <div className={styles.error}>{fieldError.gender}</div>
              ) : null}
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <label className={styles.label}>{t("profilePage.editOverlay.locationLabel")}</label>
            <div className={styles.locationCombo}>
              <div className={styles.locationInputShell}>
                <input
                  className={styles.input}
                  type="text"
                  name="location"
                  value={locationInput}
                  onChange={(e) => onLocationChange(e.target.value)}
                  onKeyDown={onLocationKeyDown}
                  onBlur={onLocationBlur}
                  onFocus={onLocationFocus}
                  placeholder={t("profilePage.editOverlay.locationPlaceholder")}
                  aria-autocomplete="list"
                  aria-expanded={locationOpen}
                  aria-haspopup="listbox"
                />
                <button
                  type="button"
                  className={styles.locationButton}
                  onClick={requestCurrentLocation}
                  disabled={geoStatus === "requesting"}
                  aria-label={t("profilePage.editOverlay.locationCurrentAria")}
                >
                  <LocationIcon />
                </button>
              </div>

              {locationOpen ? (
                <div className={styles.locationSuggestions} role="listbox">
                  {locationLoading ? (
                    <div className={styles.locationSuggestionMuted}>
                      {t("profilePage.editOverlay.locationSearching")}
                    </div>
                  ) : null}
                  {!locationLoading && locationSuggestions.length === 0 ? (
                    <div className={styles.locationSuggestionMuted}>
                      {locationError || t("profilePage.editOverlay.locationNoSuggestions")}
                    </div>
                  ) : null}
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
              ) : null}
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <label className={styles.label}>{t("profilePage.editOverlay.workplaceLabel")}</label>
            <div className={styles.selectShell}>
              <input
                className={styles.input}
                value={workplaceInput}
                onChange={(e) => {
                  const next = e.target.value;
                  setWorkplaceInteracted(true);
                  setWorkplaceInput(next);
                  setWorkplaceQuery(next);
                  setWorkplaceSelectedId(null);
                }}
                onFocus={() => {
                  setWorkplaceInteracted(true);
                  if (workplaceInput.trim()) setWorkplaceOpen(true);
                }}
                onBlur={() => {
                  // Let option clicks land before closing.
                  setTimeout(() => setWorkplaceOpen(false), 120);
                }}
                placeholder={t("profilePage.editOverlay.workplacePlaceholder")}
              />

              {workplaceOpen ? (
                <div className={styles.locationSuggestions} role="listbox">
                  {!workplaceLoading && workplaceInput.trim() ? (
                    <button
                      type="button"
                      className={styles.locationSuggestion}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        // Keep typed value; save will create/link company.
                        setWorkplaceSelectedId(null);
                        setWorkplaceOpen(false);
                      }}
                      role="option"
                      aria-selected={false}
                    >
                      <span className={styles.locationSuggestionText}>
                        {t("profilePage.editOverlay.workplaceAdd", { name: workplaceInput.trim() })}
                      </span>
                    </button>
                  ) : null}
                  {workplaceLoading ? (
                    <div className={styles.locationSuggestionMuted}>
                      {t("profilePage.editOverlay.workplaceSearching")}
                    </div>
                  ) : null}
                  {!workplaceLoading && workplaceSuggestions.length === 0 ? (
                    <div className={styles.locationSuggestionMuted}>
                      {workplaceError ||
                        (workplaceInput.trim()
                          ? t("profilePage.editOverlay.workplaceNoMatches")
                          : t("profilePage.editOverlay.workplaceNoSuggestions"))}
                    </div>
                  ) : null}
                  {!workplaceLoading &&
                    workplaceSuggestions.map((option, idx) => (
                      <button
                        type="button"
                        key={option.id}
                        className={`${styles.locationSuggestion} ${
                          idx === workplaceHighlight
                            ? styles.locationSuggestionActive
                            : ""
                        }`}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setWorkplaceInput(option.name);
                          setWorkplaceQuery(option.name);
                          setWorkplaceSelectedId(option.id);
                          setWorkplaceOpen(false);
                        }}
                        onMouseEnter={() => setWorkplaceHighlight(idx)}
                        role="option"
                        aria-selected={idx === workplaceHighlight}
                      >
                        <span className={styles.locationSuggestionText}>
                          {option.name}
                        </span>
                      </button>
                    ))}
                </div>
              ) : null}
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <div className={styles.labelRow}>
              <label className={styles.label}>{t("profilePage.editOverlay.bioLabel")}</label>
              <span className={styles.counter}>
                {bioCharCount}/{BIO_CHAR_LIMIT}
              </span>
            </div>
            <textarea
              className={styles.textarea}
              value={bio}
              maxLength={BIO_CHAR_LIMIT}
              onChange={(e) => {
                setBio(e.target.value.slice(0, BIO_CHAR_LIMIT));
              }}
              placeholder={t("profilePage.editOverlay.bioPlaceholder")}
            />
          </div>

          {fieldError.form ? (
            <div className={styles.error}>{fieldError.form}</div>
          ) : null}
        </div>

        <div className={styles.footer}>
          <button
            type="button"
            className={`${styles.button} ${styles.secondary}`}
            onClick={onClose}
            disabled={saving}
          >
            {t("profilePage.editOverlay.cancel")}
          </button>
          <button
            type="button"
            className={`${styles.button} ${styles.primary}`}
            onClick={submit}
            disabled={!canSave}
          >
            {saving ? t("profilePage.editOverlay.saving") : t("profilePage.editOverlay.save")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
