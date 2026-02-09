"use client";

import styles from "./settings.module.css";
import { useRequireAuth } from "@/hooks/use-require-auth";
import {
  requestChangeEmailCurrentOtp,
  requestChangeEmailNewOtp,
  verifyChangeEmailCurrentOtp,
  verifyChangeEmailNewOtp,
  requestPasswordChangeOtp,
  verifyPasswordChangeOtp,
  confirmPasswordChange,
  fetchPasswordChangeStatus,
  fetchPasskeyStatus,
  fetchTwoFactorStatus,
  requestTwoFactorOtp,
  verifyTwoFactorOtp,
  requestPasskeyOtp,
  verifyPasskeyOtp,
  confirmPasskey,
  togglePasskey,
  fetchCurrentProfile,
  fetchProfileDetail,
  updateMyProfile,
  fetchLoginDevices,
  logoutLoginDevice,
  logoutAllDevices,
  type LoginDeviceItem,
  type LoginDevicesResponse,
  fetchHiddenPosts,
  unhidePost,
  unblockUser,
  fetchBlockedUsers,
  fetchActivityLog,
  type HiddenPostItem,
  type BlockedUserItem,
  type ActivityItem,
  type ActivityType,
  fetchNotificationSettings,
  updateNotificationSettings,
  type NotificationCategoryKey,
  type NotificationSettingsResponse,
  upsertRecentAccount,
  removeRecentAccount,
  type ProfileDetailResponse,
  type ProfileFieldVisibility,
  type ProfileVisibility,
  type ApiError,
} from "@/lib/api";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { decodeJwt, setStoredAccessToken } from "@/lib/auth";
import ProfileEditOverlay from "@/ui/profile-edit-overlay/profile-edit-overlay";
import { useTheme } from "@/component/theme-provider";
import { useTranslations } from "next-intl";
import { useLanguage } from "@/component/language-provider";
import { formatDistanceToNow } from "date-fns";
import { DateSelect } from "@/ui/date-select/date-select";
import { TimeSelect } from "@/ui/time-select/time-select";

const SETTINGS_SECTIONS = [
  {
    key: "account",
    label: "Personal info",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-3.3 0-8 1.7-8 5v1h16v-1c0-3.3-4.7-5-8-5Z" />
      </svg>
    ),
  },
  {
    key: "profile",
    label: "Profile",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 13a4.5 4.5 0 1 0-4.5-4.5A4.5 4.5 0 0 0 12 13Zm0 2.2c-4 0-7.5 2.1-7.5 5v1h15v-1c0-2.9-3.5-5-7.5-5Z" />
      </svg>
    ),
  },
  {
    key: "privacy",
    label: "Password & Security",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M17 9h-1V7a4 4 0 0 0-8 0v2H7a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2Zm-7-2a2 2 0 0 1 4 0v2h-4Z" />
      </svg>
    ),
  },
  {
    key: "notifications",
    label: "Notifications",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm6-6V11a6 6 0 0 0-5-5.91V4a1 1 0 1 0-2 0v1.09A6 6 0 0 0 6 11v5l-2 2v1h16v-1Z" />
      </svg>
    ),
  },
  {
    key: "content",
    label: "Content",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 3h12a2 2 0 0 1 2 2v16l-8-4-8 4V5a2 2 0 0 1 2-2Z" />
      </svg>
    ),
  },
  {
    key: "system",
    label: "System",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 7h10a2 2 0 0 0 4 0h2V5h-2a2 2 0 0 0-4 0H4Zm0 12h2a2 2 0 0 0 4 0h10v-2H10a2 2 0 0 0-4 0H4Z" />
      </svg>
    ),
  },
];

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
const passkeyRegex = /^\d{6}$/;
const RECENT_ACCOUNTS_KEY = "recentAccounts";

const relativeFormatter = new Intl.RelativeTimeFormat("en", {
  numeric: "auto",
});

const formatRelativeTime = (value: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const diffMs = date.getTime() - Date.now();
  const past = diffMs < 0;
  const absSec = Math.abs(diffMs) / 1000;
  if (absSec < 60) return "less than a minute";
  const minutes = Math.ceil(absSec / 60);
  if (minutes < 60)
    return relativeFormatter.format(past ? -minutes : minutes, "minute");
  const hours = Math.ceil(minutes / 60);
  if (hours < 24)
    return relativeFormatter.format(past ? -hours : hours, "hour");
  const days = Math.ceil(hours / 24);
  if (days < 30) return relativeFormatter.format(past ? -days : days, "day");
  const months = Math.ceil(days / 30);
  if (months < 12)
    return relativeFormatter.format(past ? -months : months, "month");
  const years = Math.ceil(days / 365);
  return relativeFormatter.format(past ? -years : years, "year");
};

const formatOtpValue = (value: string) => value.replace(/\D/g, "");

const normalizeDigits = (value: string, maxLength: number) =>
  value.replace(/\D/g, "").slice(0, maxLength);

const formatLocalDate = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const splitDateTime = (value?: string | null) => {
  if (!value) return { date: "", time: "" };
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return { date: "", time: "" };
  const date = formatLocalDate(dt);
  const hour = String(dt.getHours()).padStart(2, "0");
  const minute = String(dt.getMinutes()).padStart(2, "0");
  return { date, time: `${hour}:${minute}` };
};

const buildLocalDateTimeIso = (date: string, time: string) => {
  if (!date || !time) return null;
  const dt = new Date(`${date}T${time}:00`);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
};

const getInitials = (value?: string | null) => {
  if (!value) return "?";
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
};

type IconProps = { size?: number; filled?: boolean };

const IconLike = ({ size = 18, filled }: IconProps) => (
  <svg
    aria-hidden
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={filled ? "currentColor" : "none"}
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M6 10h3.2V6.6a2.1 2.1 0 0 1 2.1-2.1c.46 0 .91.16 1.27.45l.22.18c.32.26.51.66.51 1.07V10h3.6a2 2 0 0 1 1.97 2.35l-1 5.3A2.2 2.2 0 0 1 15.43 20H8.2A2.2 2.2 0 0 1 6 17.8Z"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M4 10h2v10H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill={filled ? "currentColor" : "none"}
    />
  </svg>
);

const IconComment = ({ size = 18 }: IconProps) => (
  <svg
    aria-hidden
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M5.5 5.5h13a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H10l-3.6 2.8a.6.6 0 0 1-.96-.48V7.5a2 2 0 0 1 2-2Z"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const IconReup = ({ size = 18 }: IconProps) => (
  <svg
    aria-hidden
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="var(--color-text-muted)"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      stroke="none"
      strokeWidth={1}
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M4.5 3.88l4.432 4.14-1.364 1.46L5.5 7.55V16c0 1.1.896 2 2 2H13v2H7.5c-2.209 0-4-1.79-4-4V7.55L1.432 9.48.068 8.02 4.5 3.88zM16.5 6H11V4h5.5c2.209 0 4 1.79 4 4v8.45l2.068-1.93 1.364 1.46-4.432 4.14-4.432-4.14 1.364-1.46 2.068 1.93V8c0-1.1-.896-2-2-2z"
    ></path>
  </svg>
);

const IconSave = ({ size = 18, filled }: IconProps) => (
  <svg
    aria-hidden
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={filled ? "currentColor" : "none"}
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M7 4.8A1.8 1.8 0 0 1 8.8 3h8.4A1.8 1.8 0 0 1 19 4.8v15.1l-6-3.6-6 3.6Z"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill={filled ? "currentColor" : "none"}
    />
  </svg>
);

const IconFollow = ({ size = 18 }: IconProps) => (
  <svg
    aria-hidden
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M12 12.2a3.2 3.2 0 1 0-3.2-3.2 3.2 3.2 0 0 0 3.2 3.2Z"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M5 19a6.8 6.8 0 0 1 13.6 0"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M18 7.2h4M20 5v4"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const IconReport = ({ size = 18 }: IconProps) => (
  <svg
    aria-hidden
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M5 4v16"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M5 5h12l-1.5 3L17 11H5"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ActivityIcon = ({ type }: { type: ActivityType }) => {
  if (type === "post_like" || type === "comment_like") {
    return <IconLike filled />;
  }
  if (type === "comment") return <IconComment />;
  if (type === "repost") return <IconReup />;
  if (type === "save") return <IconSave filled />;
  if (type === "follow") return <IconFollow />;
  if (type === "report_post" || type === "report_user") {
    return <IconReport />;
  }
  return <IconComment />;
};

export default function SettingsPage() {
  const canRender = useRequireAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { theme, setTheme } = useTheme();
  const { language, setLanguage } = useLanguage();
  const tSystem = useTranslations("settings.system");
  const [activeKey, setActiveKey] = useState<string>("account");
  const [showChangeEmail, setShowChangeEmail] = useState(false);
  const [step, setStep] = useState<
    "password" | "current-otp" | "new-email" | "new-otp" | "done"
  >("password");
  const [password, setPassword] = useState("");
  const [currentOtp, setCurrentOtp] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newOtp, setNewOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [currentCooldown, setCurrentCooldown] = useState(0);
  const [newCooldown, setNewCooldown] = useState(0);
  const [currentExpiresSec, setCurrentExpiresSec] = useState<number | null>(
    null,
  );
  const [newExpiresSec, setNewExpiresSec] = useState<number | null>(null);
  const [passwordStep, setPasswordStep] = useState<"otp" | "form" | "done">(
    "otp",
  );
  const [passwordOtp, setPasswordOtp] = useState("");
  const [passwordCurrent, setPasswordCurrent] = useState("");
  const [passwordNew, setPasswordNew] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [passwordCooldown, setPasswordCooldown] = useState(0);
  const [passwordExpiresSec, setPasswordExpiresSec] = useState<number | null>(
    null,
  );
  const [passwordLogoutPrompt, setPasswordLogoutPrompt] = useState(false);
  const [passwordLogoutSubmitting, setPasswordLogoutSubmitting] =
    useState(false);
  const [passwordLogoutError, setPasswordLogoutError] = useState<string | null>(
    null,
  );
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [passwordChangedAt, setPasswordChangedAt] = useState<string | null>(
    null,
  );
  const [passwordStatusLoading, setPasswordStatusLoading] = useState(false);
  const [passkeyStep, setPasskeyStep] = useState<
    "password" | "otp" | "form" | "done"
  >("password");
  const [passkeyPassword, setPasskeyPassword] = useState("");
  const [passkeyOtp, setPasskeyOtp] = useState("");
  const [passkeyCurrent, setPasskeyCurrent] = useState("");
  const [passkeyNew, setPasskeyNew] = useState("");
  const [passkeyConfirm, setPasskeyConfirm] = useState("");
  const [passkeyError, setPasskeyError] = useState<string | null>(null);
  const [passkeySuccess, setPasskeySuccess] = useState<string | null>(null);
  const [passkeySubmitting, setPasskeySubmitting] = useState(false);
  const [passkeyCooldown, setPasskeyCooldown] = useState(0);
  const [passkeyExpiresSec, setPasskeyExpiresSec] = useState<number | null>(
    null,
  );
  const [showPasskeyFlow, setShowPasskeyFlow] = useState(false);
  const [hasPasskey, setHasPasskey] = useState(false);
  const [passkeyStatusLoading, setPasskeyStatusLoading] = useState(false);
  const [showCurrentPasskey, setShowCurrentPasskey] = useState(false);
  const [passkeyEnabled, setPasskeyEnabled] = useState(false);
  const [passkeyToggleSubmitting, setPasskeyToggleSubmitting] = useState(false);
  const [passkeyToggleError, setPasskeyToggleError] = useState<string | null>(
    null,
  );
  const [currentEmail, setCurrentEmail] = useState<string | null>(null);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [twoFactorLoading, setTwoFactorLoading] = useState(false);
  const [showTwoFactorFlow, setShowTwoFactorFlow] = useState(false);
  const [twoFactorStep, setTwoFactorStep] = useState<"otp" | "done">("otp");
  const [twoFactorTarget, setTwoFactorTarget] = useState(true);
  const [twoFactorOtp, setTwoFactorOtp] = useState("");
  const [twoFactorError, setTwoFactorError] = useState<string | null>(null);
  const [twoFactorSuccess, setTwoFactorSuccess] = useState<string | null>(null);
  const [twoFactorSubmitting, setTwoFactorSubmitting] = useState(false);
  const [twoFactorCooldown, setTwoFactorCooldown] = useState(0);
  const [twoFactorExpiresSec, setTwoFactorExpiresSec] = useState<number | null>(
    null,
  );
  const [profileDetail, setProfileDetail] =
    useState<ProfileDetailResponse | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [visibilityError, setVisibilityError] = useState<string | null>(null);
  const [visibilitySaving, setVisibilitySaving] = useState<
    Partial<
      Record<
        | "gender"
        | "birthdate"
        | "location"
        | "workplace"
        | "bio"
        | "followers"
        | "following"
        | "about"
        | "profile",
        boolean
      >
    >
  >({});
  const [openVisibilityField, setOpenVisibilityField] = useState<
    | "gender"
    | "birthdate"
    | "location"
    | "workplace"
    | "bio"
    | "followers"
    | "following"
    | "about"
    | "profile"
    | null
  >(null);
  const [showLoginDevices, setShowLoginDevices] = useState(false);
  const [loginDevices, setLoginDevices] = useState<LoginDeviceItem[]>([]);
  const [loginDevicesCurrent, setLoginDevicesCurrent] = useState<string | null>(
    null,
  );
  const [loginDevicesLoading, setLoginDevicesLoading] = useState(false);
  const [loginDevicesError, setLoginDevicesError] = useState<string | null>(
    null,
  );
  const [logoutTarget, setLogoutTarget] = useState<LoginDeviceItem | null>(
    null,
  );
  const [logoutSubmitting, setLogoutSubmitting] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [logoutAllOpen, setLogoutAllOpen] = useState(false);
  const [logoutAllSubmitting, setLogoutAllSubmitting] = useState(false);
  const [logoutAllError, setLogoutAllError] = useState<string | null>(null);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [hiddenPosts, setHiddenPosts] = useState<HiddenPostItem[]>([]);
  const [hiddenPostsLoading, setHiddenPostsLoading] = useState(false);
  const [hiddenPostsError, setHiddenPostsError] = useState<string | null>(null);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUserItem[]>([]);
  const [blockedUsersLoading, setBlockedUsersLoading] = useState(false);
  const [blockedUsersError, setBlockedUsersError] = useState<string | null>(
    null,
  );
  const [unhideSubmitting, setUnhideSubmitting] = useState<
    Record<string, boolean>
  >({});
  const [unblockSubmitting, setUnblockSubmitting] = useState<
    Record<string, boolean>
  >({});
  const [confirmUnhide, setConfirmUnhide] = useState<HiddenPostItem | null>(
    null,
  );
  const [confirmUnblock, setConfirmUnblock] = useState<BlockedUserItem | null>(
    null,
  );
  const [activityItems, setActivityItems] = useState<ActivityItem[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityLoadingMore, setActivityLoadingMore] = useState(false);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [activityCursor, setActivityCursor] = useState<string | null>(null);
  const [activityFilter, setActivityFilter] = useState<"all" | ActivityType>(
    "all",
  );
  const [contentOpen, setContentOpen] = useState({
    activity: false,
    hidden: false,
    blocked: false,
  });

  useEffect(() => {
    const section = searchParams.get("section");
    const changePassword = searchParams.get("changePassword");
    if (section && SETTINGS_SECTIONS.some((item) => item.key === section)) {
      setActiveKey(section);
    }
    if (section === "privacy" && changePassword === "1") {
      setShowChangePassword(true);
    }
  }, [searchParams]);
  const [notificationSettings, setNotificationSettings] =
    useState<NotificationSettingsResponse | null>(null);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [notificationError, setNotificationError] = useState<string | null>(
    null,
  );
  const [notificationOverlayOpen, setNotificationOverlayOpen] = useState(false);
  const [notificationOption, setNotificationOption] = useState("5m");
  const [notificationCustomDate, setNotificationCustomDate] = useState("");
  const [notificationCustomTime, setNotificationCustomTime] = useState("");
  const [notificationCustomError, setNotificationCustomError] = useState<
    string | null
  >(null);
  const [notificationSaving, setNotificationSaving] = useState(false);
  const [categoryOverlayOpen, setCategoryOverlayOpen] = useState(false);
  const [categoryKey, setCategoryKey] =
    useState<NotificationCategoryKey | null>(null);
  const [categoryOption, setCategoryOption] = useState("5m");
  const [categoryCustomDate, setCategoryCustomDate] = useState("");
  const [categoryCustomTime, setCategoryCustomTime] = useState("");
  const [categoryCustomError, setCategoryCustomError] = useState<string | null>(
    null,
  );
  const [categorySaving, setCategorySaving] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);

  const renderOtpStep = (params: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    hint: string;
    expiresSec?: number | null;
    error?: string | null;
    submitting?: boolean;
    cooldown?: number;
    onResend: () => void;
    onConfirm: () => void;
    confirmLabel?: string;
  }) => (
    <div className={styles.stepContent}>
      <div className={styles.form}>
        <label className={styles.label}>
          {params.label}
          <input
            className={`${styles.input} ${styles.otpInput}`}
            type="text"
            inputMode="numeric"
            maxLength={6}
            placeholder="------"
            value={params.value}
            onChange={(e) => params.onChange(formatOtpValue(e.target.value))}
          />
        </label>
        <div className={styles.otpRow}>
          <p className={styles.hint}>{params.hint}</p>
        </div>
        {params.error ? <p className={styles.error}>{params.error}</p> : null}
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.secondary}
            onClick={params.onResend}
            disabled={Boolean(params.submitting) || (params.cooldown ?? 0) > 0}
          >
            {(params.cooldown ?? 0) > 0
              ? `Resend (${params.cooldown}s)`
              : "Resend OTP"}
          </button>
          <button
            type="button"
            className={styles.primary}
            onClick={params.onConfirm}
            disabled={params.submitting}
          >
            {params.submitting
              ? "Verifying..."
              : (params.confirmLabel ?? "Continue")}
          </button>
        </div>
      </div>
    </div>
  );

  const toggleContentSection = (key: "activity" | "hidden" | "blocked") => {
    setContentOpen((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  useEffect(() => {
    if (currentCooldown <= 0) return;
    const id = setInterval(
      () => setCurrentCooldown((s) => Math.max(0, s - 1)),
      1000,
    );
    return () => clearInterval(id);
  }, [currentCooldown]);

  useEffect(() => {
    if (newCooldown <= 0) return;
    const id = setInterval(
      () => setNewCooldown((s) => Math.max(0, s - 1)),
      1000,
    );
    return () => clearInterval(id);
  }, [newCooldown]);

  useEffect(() => {
    if (passwordCooldown <= 0) return;
    const id = setInterval(
      () => setPasswordCooldown((s) => Math.max(0, s - 1)),
      1000,
    );
    return () => clearInterval(id);
  }, [passwordCooldown]);

  useEffect(() => {
    if (passkeyCooldown <= 0) return;
    const id = setInterval(
      () => setPasskeyCooldown((s) => Math.max(0, s - 1)),
      1000,
    );
    return () => clearInterval(id);
  }, [passkeyCooldown]);

  useEffect(() => {
    if (twoFactorCooldown <= 0) return;
    const id = setInterval(
      () => setTwoFactorCooldown((s) => Math.max(0, s - 1)),
      1000,
    );
    return () => clearInterval(id);
  }, [twoFactorCooldown]);

  const token = useMemo(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("accessToken");
  }, [canRender]);

  useEffect(() => {
    const payload = token ? (decodeJwt(token) as { email?: string }) : null;
    if (payload?.email) {
      setCurrentEmail(payload.email);
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    let active = true;
    const loadProfile = async () => {
      setProfileLoading(true);
      setProfileError(null);
      try {
        const current = await fetchCurrentProfile({ token });
        const detail = await fetchProfileDetail({ token, id: current.id });
        if (active) setProfileDetail(detail);
      } catch (err) {
        const apiErr = err as ApiError | undefined;
        if (active) {
          setProfileError(apiErr?.message || "Unable to load profile details.");
        }
      } finally {
        if (active) setProfileLoading(false);
      }
    };
    loadProfile();
    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    if (!token || activeKey !== "privacy") return;
    let active = true;
    const loadStatus = async () => {
      setPasswordStatusLoading(true);
      try {
        const res = await fetchPasswordChangeStatus({ token });
        if (active) setPasswordChangedAt(res.lastChangedAt ?? null);
      } catch (_err) {
        if (active) setPasswordChangedAt(null);
      } finally {
        if (active) setPasswordStatusLoading(false);
      }
    };
    loadStatus();
    return () => {
      active = false;
    };
  }, [token, activeKey]);

  useEffect(() => {
    if (!token || activeKey !== "privacy") return;
    let active = true;
    const loadTwoFactorStatus = async () => {
      setTwoFactorLoading(true);
      try {
        const res = await fetchTwoFactorStatus({ token });
        if (active) setTwoFactorEnabled(res.enabled);
      } catch (_err) {
        if (active) setTwoFactorEnabled(false);
      } finally {
        if (active) setTwoFactorLoading(false);
      }
    };
    loadTwoFactorStatus();
    return () => {
      active = false;
    };
  }, [token, activeKey]);

  useEffect(() => {
    if (!token || activeKey !== "privacy") return;
    let active = true;
    const loadPasskeyStatus = async () => {
      setPasskeyStatusLoading(true);
      try {
        const res = await fetchPasskeyStatus({ token });
        if (active) {
          setHasPasskey(res.hasPasskey);
          setPasskeyEnabled(res.hasPasskey ? res.enabled : false);
        }
      } catch (_err) {
        if (active) {
          setHasPasskey(false);
          setPasskeyEnabled(false);
        }
      } finally {
        if (active) setPasskeyStatusLoading(false);
      }
    };
    loadPasskeyStatus();
    return () => {
      active = false;
    };
  }, [token, activeKey]);

  const loadContentSettings = useCallback(async () => {
    if (!token) return;
    setHiddenPostsLoading(true);
    setBlockedUsersLoading(true);
    setHiddenPostsError(null);
    setBlockedUsersError(null);

    const [hiddenRes, blockedRes] = await Promise.allSettled([
      fetchHiddenPosts({ token, limit: 50 }),
      fetchBlockedUsers({ token, limit: 50 }),
    ]);

    if (hiddenRes.status === "fulfilled") {
      setHiddenPosts(hiddenRes.value.items ?? []);
    } else {
      const apiErr = hiddenRes.reason as ApiError | undefined;
      setHiddenPostsError(apiErr?.message || "Unable to load hidden posts.");
    }

    if (blockedRes.status === "fulfilled") {
      setBlockedUsers(blockedRes.value.items ?? []);
    } else {
      const apiErr = blockedRes.reason as ApiError | undefined;
      setBlockedUsersError(apiErr?.message || "Unable to load blocked users.");
    }

    setHiddenPostsLoading(false);
    setBlockedUsersLoading(false);
  }, [token]);

  const activityFilterOptions = useMemo(
    () => [
      { key: "all" as const, label: "All" },
      { key: "post_like" as const, label: "Like post" },
      { key: "comment_like" as const, label: "Like comment" },
      { key: "comment" as const, label: "Comment" },
      { key: "repost" as const, label: "Repost" },
      { key: "save" as const, label: "Save" },
      { key: "follow" as const, label: "Follow" },
      { key: "report_post" as const, label: "Report post/reel" },
      { key: "report_user" as const, label: "Report user" },
    ],
    [],
  );

  const loadActivityLog = useCallback(
    async (mode: "reset" | "more" = "reset") => {
      if (!token) return;
      const isReset = mode === "reset";
      if (isReset) {
        setActivityLoading(true);
        setActivityError(null);
      } else {
        setActivityLoadingMore(true);
      }

      try {
        const types = activityFilter === "all" ? undefined : [activityFilter];
        const res = await fetchActivityLog({
          token,
          limit: 30,
          cursor: isReset ? null : activityCursor,
          types,
        });
        const items = res.items ?? [];
        setActivityItems((prev) => (isReset ? items : [...prev, ...items]));
        setActivityCursor(res.nextCursor ?? null);
      } catch (err) {
        const apiErr = err as ApiError | undefined;
        setActivityError(apiErr?.message || "Unable to load activity log.");
      } finally {
        if (isReset) setActivityLoading(false);
        else setActivityLoadingMore(false);
      }
    },
    [token, activityFilter, activityCursor],
  );

  useEffect(() => {
    if (!token || activeKey !== "content") return;
    loadContentSettings();
  }, [token, activeKey, loadContentSettings]);

  useEffect(() => {
    if (!token || activeKey !== "content") return;
    loadActivityLog("reset");
  }, [token, activeKey, activityFilter, loadActivityLog]);

  useEffect(() => {
    if (!token || activeKey !== "notifications") return;
    let active = true;
    const loadNotificationSettings = async () => {
      setNotificationLoading(true);
      setNotificationError(null);
      try {
        const res = await fetchNotificationSettings({ token });
        if (active) setNotificationSettings(res);
      } catch (err) {
        const apiErr = err as ApiError | undefined;
        if (active) {
          setNotificationError(
            apiErr?.message || "Unable to load notification settings.",
          );
        }
      } finally {
        if (active) setNotificationLoading(false);
      }
    };
    loadNotificationSettings();
    return () => {
      active = false;
    };
  }, [token, activeKey]);

  const notificationOptions = useMemo(
    () => [
      { key: "5m", label: "5 minutes", ms: 5 * 60 * 1000 },
      { key: "10m", label: "10 minutes", ms: 10 * 60 * 1000 },
      { key: "15m", label: "15 minutes", ms: 15 * 60 * 1000 },
      { key: "30m", label: "30 minutes", ms: 30 * 60 * 1000 },
      { key: "1h", label: "1 hour", ms: 60 * 60 * 1000 },
      { key: "1d", label: "1 day", ms: 24 * 60 * 60 * 1000 },
      { key: "until", label: "Until I turn it back on", ms: null },
      { key: "custom", label: "Choose date & time", ms: null },
    ],
    [],
  );

  const notificationCategories = useMemo(
    () => [
      {
        key: "follow" as const,
        label: "Follows",
        description: "When someone follows you.",
      },
      {
        key: "comment" as const,
        label: "Comments",
        description: "When someone comments on your posts or reels.",
      },
      {
        key: "like" as const,
        label: "Likes",
        description: "When someone likes your posts, reels, or comments.",
      },
      {
        key: "mentions" as const,
        label: "Mentions & tags",
        description: "When someone mentions or tags you.",
      },
    ],
    [],
  );

  const notificationStatusLabel = useMemo(() => {
    if (!notificationSettings) return "";
    if (notificationSettings.enabled) return "Enabled";
    if (notificationSettings.mutedIndefinitely)
      return "Muted until you turn it back on";
    if (notificationSettings.mutedUntil) {
      return `Muted ${formatDistanceToNow(
        new Date(notificationSettings.mutedUntil),
        { addSuffix: true },
      )}`;
    }
    return "Muted";
  }, [notificationSettings]);

  const getCategoryStatusLabel = useCallback(
    (key: NotificationCategoryKey) => {
      const settings = notificationSettings?.categories?.[key];
      if (!settings) return "Enabled";
      if (settings.enabled) return "Enabled";
      if (settings.mutedIndefinitely) return "Muted until you turn it back on";
      if (settings.mutedUntil) {
        return `Muted ${formatDistanceToNow(new Date(settings.mutedUntil), {
          addSuffix: true,
        })}`;
      }
      return "Muted";
    },
    [notificationSettings?.categories],
  );

  const handleUnhidePost = async (postId?: string) => {
    if (!token || !postId) return;
    setUnhideSubmitting((prev) => ({ ...prev, [postId]: true }));
    setHiddenPostsError(null);
    try {
      await unhidePost({ token, postId });
      setHiddenPosts((prev) => prev.filter((item) => item.id !== postId));
    } catch (err) {
      const apiErr = err as ApiError | undefined;
      setHiddenPostsError(apiErr?.message || "Unable to unhide this post.");
    } finally {
      setUnhideSubmitting((prev) => ({ ...prev, [postId]: false }));
    }
  };

  const handleUnblockUser = async (userId?: string) => {
    if (!token || !userId) return;
    setUnblockSubmitting((prev) => ({ ...prev, [userId]: true }));
    setBlockedUsersError(null);
    try {
      await unblockUser({ token, userId });
      setBlockedUsers((prev) => prev.filter((item) => item.userId !== userId));
    } catch (err) {
      const apiErr = err as ApiError | undefined;
      setBlockedUsersError(
        apiErr?.message || "Unable to unblock this account.",
      );
    } finally {
      setUnblockSubmitting((prev) => ({ ...prev, [userId]: false }));
    }
  };

  const openNotificationOverlay = () => {
    setNotificationCustomError(null);
    if (notificationSettings?.mutedIndefinitely) {
      setNotificationOption("until");
      setNotificationCustomDate("");
      setNotificationCustomTime("");
    } else if (notificationSettings?.mutedUntil) {
      const parts = splitDateTime(notificationSettings.mutedUntil);
      setNotificationOption("custom");
      setNotificationCustomDate(parts.date);
      setNotificationCustomTime(parts.time);
    } else {
      setNotificationOption("5m");
      setNotificationCustomDate("");
      setNotificationCustomTime("");
    }
    setNotificationOverlayOpen(true);
  };

  const openCategoryOverlay = (key: NotificationCategoryKey) => {
    setCategoryCustomError(null);
    setCategoryError(null);
    const settings = notificationSettings?.categories?.[key];
    if (settings?.mutedIndefinitely) {
      setCategoryOption("until");
      setCategoryCustomDate("");
      setCategoryCustomTime("");
    } else if (settings?.mutedUntil) {
      const parts = splitDateTime(settings.mutedUntil);
      setCategoryOption("custom");
      setCategoryCustomDate(parts.date);
      setCategoryCustomTime(parts.time);
    } else {
      setCategoryOption("5m");
      setCategoryCustomDate("");
      setCategoryCustomTime("");
    }
    setCategoryKey(key);
    setCategoryOverlayOpen(true);
  };

  const handleEnableNotifications = async () => {
    if (!token) return;
    setNotificationSaving(true);
    setNotificationError(null);
    try {
      const res = await updateNotificationSettings({ token, enabled: true });
      setNotificationSettings(res);
    } catch (err) {
      const apiErr = err as ApiError | undefined;
      setNotificationError(
        apiErr?.message || "Unable to update notifications.",
      );
    } finally {
      setNotificationSaving(false);
    }
  };

  const handleEnableCategoryNotifications = async (
    key: NotificationCategoryKey,
  ) => {
    if (!token) return;
    setCategorySaving(true);
    setCategoryError(null);
    try {
      const res = await updateNotificationSettings({
        token,
        category: key,
        enabled: true,
      });
      setNotificationSettings(res);
    } catch (err) {
      const apiErr = err as ApiError | undefined;
      setCategoryError(apiErr?.message || "Unable to update notifications.");
    } finally {
      setCategorySaving(false);
    }
  };

  const handleSaveNotificationMute = async () => {
    if (!token) return;
    setNotificationSaving(true);
    setNotificationCustomError(null);
    setNotificationError(null);

    try {
      let mutedUntil: string | null = null;
      let mutedIndefinitely = false;

      const selected = notificationOptions.find(
        (option) => option.key === notificationOption,
      );

      if (notificationOption === "until") {
        mutedIndefinitely = true;
      } else if (notificationOption === "custom") {
        const iso = buildLocalDateTimeIso(
          notificationCustomDate,
          notificationCustomTime,
        );
        if (!iso) {
          setNotificationCustomError("Please select a valid date and time.");
          setNotificationSaving(false);
          return;
        }
        const dt = new Date(iso);
        if (dt.getTime() <= Date.now()) {
          setNotificationCustomError("Please choose a future time.");
          setNotificationSaving(false);
          return;
        }
        mutedUntil = iso;
      } else if (selected?.ms) {
        mutedUntil = new Date(Date.now() + selected.ms).toISOString();
      } else {
        mutedIndefinitely = true;
      }

      const res = await updateNotificationSettings({
        token,
        mutedUntil,
        mutedIndefinitely,
      });
      setNotificationSettings(res);
      setNotificationOverlayOpen(false);
    } catch (err) {
      const apiErr = err as ApiError | undefined;
      setNotificationError(
        apiErr?.message || "Unable to update notifications.",
      );
    } finally {
      setNotificationSaving(false);
    }
  };

  const handleSaveCategoryMute = async () => {
    if (!token || !categoryKey) return;
    setCategorySaving(true);
    setCategoryCustomError(null);
    setCategoryError(null);

    try {
      let mutedUntil: string | null = null;
      let mutedIndefinitely = false;

      const selected = notificationOptions.find(
        (option) => option.key === categoryOption,
      );

      if (categoryOption === "until") {
        mutedIndefinitely = true;
      } else if (categoryOption === "custom") {
        const iso = buildLocalDateTimeIso(
          categoryCustomDate,
          categoryCustomTime,
        );
        if (!iso) {
          setCategoryCustomError("Please select a valid date and time.");
          setCategorySaving(false);
          return;
        }
        const dt = new Date(iso);
        if (dt.getTime() <= Date.now()) {
          setCategoryCustomError("Please choose a future time.");
          setCategorySaving(false);
          return;
        }
        mutedUntil = iso;
      } else if (selected?.ms) {
        mutedUntil = new Date(Date.now() + selected.ms).toISOString();
      } else {
        mutedIndefinitely = true;
      }

      const res = await updateNotificationSettings({
        token,
        category: categoryKey,
        mutedUntil,
        mutedIndefinitely,
      });
      setNotificationSettings(res);
      setCategoryOverlayOpen(false);
      setCategoryKey(null);
    } catch (err) {
      const apiErr = err as ApiError | undefined;
      setCategoryError(apiErr?.message || "Unable to update notifications.");
    } finally {
      setCategorySaving(false);
    }
  };

  const resetFlow = () => {
    setStep("password");
    setPassword("");
    setCurrentOtp("");
    setNewEmail("");
    setNewOtp("");
    setError(null);
    setSuccess(null);
    setCurrentCooldown(0);
    setNewCooldown(0);
    setCurrentExpiresSec(null);
    setNewExpiresSec(null);
  };

  const resetPasswordFlow = () => {
    setPasswordStep("otp");
    setPasswordOtp("");
    setPasswordCurrent("");
    setPasswordNew("");
    setPasswordConfirm("");
    setPasswordError(null);
    setPasswordSuccess(null);
    setPasswordSubmitting(false);
    setPasswordCooldown(0);
    setPasswordExpiresSec(null);
    setPasswordLogoutPrompt(false);
    setPasswordLogoutSubmitting(false);
    setPasswordLogoutError(null);
  };

  const resetPasskeyFlow = () => {
    setPasskeyStep("password");
    setPasskeyPassword("");
    setPasskeyOtp("");
    setPasskeyCurrent("");
    setPasskeyNew("");
    setPasskeyConfirm("");
    setPasskeyError(null);
    setPasskeySuccess(null);
    setPasskeySubmitting(false);
    setPasskeyCooldown(0);
    setPasskeyExpiresSec(null);
    setShowCurrentPasskey(false);
  };

  const visibilityDefaults = useMemo<ProfileVisibility>(
    () => ({
      gender: "public",
      birthdate: "public",
      location: "public",
      workplace: "public",
      bio: "public",
      followers: "public",
      following: "public",
      about: "public",
      profile: "public",
    }),
    [],
  );

  const visibilityOptions: Array<{
    value: ProfileFieldVisibility;
    label: string;
  }> = useMemo(
    () => [
      { value: "public", label: "Public" },
      { value: "followers", label: "Followers" },
      { value: "private", label: "Private" },
    ],
    [],
  );

  const visibilityLabelMap = useMemo(
    () =>
      ({
        public: "Public",
        followers: "Followers",
        private: "Private",
      }) satisfies Record<ProfileFieldVisibility, string>,
    [],
  );

  const getVisibilityLabel = (value?: ProfileFieldVisibility) =>
    visibilityLabelMap[value ?? "public"];

  const languageLabelMap = useMemo(
    () =>
      ({
        en: tSystem("language.options.en"),
        vi: tSystem("language.options.vi"),
      }) satisfies Record<"en" | "vi", string>,
    [tSystem],
  );

  const getLanguageLabel = (value: "en" | "vi") => languageLabelMap[value];

  const visibilityKeyMap = useMemo(
    () =>
      ({
        gender: "genderVisibility",
        birthdate: "birthdateVisibility",
        location: "locationVisibility",
        workplace: "workplaceVisibility",
        bio: "bioVisibility",
        followers: "followersVisibility",
        following: "followingVisibility",
        about: "aboutVisibility",
        profile: "profileVisibility",
      }) as const,
    [],
  );

  useEffect(() => {
    if (!openVisibilityField) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest(`.${styles.visibilityControl}`)) return;
      setOpenVisibilityField(null);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [openVisibilityField]);

  useEffect(() => {
    if (!languageOpen) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest(`.${styles.languageControl}`)) return;
      setLanguageOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [languageOpen]);

  const handleVisibilityChange = async (
    field:
      | "gender"
      | "birthdate"
      | "location"
      | "workplace"
      | "bio"
      | "followers"
      | "following"
      | "about"
      | "profile",
    value: ProfileFieldVisibility,
  ) => {
    if (!token || !profileDetail) {
      setVisibilityError("You need to sign in to continue.");
      return;
    }
    setVisibilityError(null);
    const prevProfile = profileDetail;
    const prevVisibility: ProfileVisibility = {
      ...visibilityDefaults,
      ...(profileDetail.visibility ?? {}),
    };
    const nextVisibility: ProfileVisibility = {
      ...prevVisibility,
      [field]: value,
    };
    setProfileDetail({ ...prevProfile, visibility: nextVisibility });
    setVisibilitySaving((state) => ({ ...state, [field]: true }));
    try {
      const payloadKey = visibilityKeyMap[field];
      const updated = await updateMyProfile({
        token,
        payload: {
          [payloadKey]: value,
        } as Parameters<typeof updateMyProfile>[0]["payload"],
      });
      setProfileDetail(updated);
    } catch (err) {
      const apiErr = err as ApiError | undefined;
      setProfileDetail({ ...prevProfile, visibility: prevVisibility });
      setVisibilityError(
        apiErr?.message || "Unable to update visibility setting.",
      );
    } finally {
      setVisibilitySaving((state) => ({ ...state, [field]: false }));
    }
  };

  const renderVisibilityControl = (
    field:
      | "gender"
      | "birthdate"
      | "location"
      | "workplace"
      | "bio"
      | "followers"
      | "following"
      | "about"
      | "profile",
    currentValue?: ProfileFieldVisibility,
    disabled?: boolean,
    ariaLabel?: string,
  ) => {
    const selectedValue = currentValue ?? visibilityDefaults[field];
    const isOpen = openVisibilityField === field;
    return (
      <div className={styles.visibilityControl}>
        <button
          type="button"
          className={styles.visibilityButton}
          onClick={() =>
            setOpenVisibilityField((prev) => (prev === field ? null : field))
          }
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-label={ariaLabel}
          disabled={disabled}
        >
          <span>{getVisibilityLabel(selectedValue)}</span>
          <span className={styles.visibilityCaret} aria-hidden>
            ▾
          </span>
        </button>
        {isOpen ? (
          <div className={styles.visibilityMenu} role="listbox">
            {visibilityOptions.map((option) => {
              const active = option.value === selectedValue;
              return (
                <button
                  type="button"
                  key={option.value}
                  role="option"
                  aria-selected={active}
                  className={`${styles.visibilityOption} ${
                    active ? styles.visibilityOptionActive : ""
                  }`}
                  onClick={() => {
                    setOpenVisibilityField(null);
                    handleVisibilityChange(field, option.value);
                  }}
                >
                  <span>{option.label}</span>
                  {active ? (
                    <span className={styles.visibilityCheck} aria-hidden>
                      ✓
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    );
  };

  const openChangeEmail = () => {
    resetFlow();
    setShowChangeEmail(true);
  };

  const openChangePassword = async () => {
    resetPasswordFlow();
    setShowChangePassword(true);
    await handleRequestPasswordOtp(true);
  };

  const openPasskeyFlow = () => {
    resetPasskeyFlow();
    setShowPasskeyFlow(true);
  };

  const resetTwoFactorFlow = () => {
    setTwoFactorStep("otp");
    setTwoFactorOtp("");
    setTwoFactorError(null);
    setTwoFactorSuccess(null);
    setTwoFactorSubmitting(false);
    setTwoFactorCooldown(0);
    setTwoFactorExpiresSec(null);
  };

  const openTwoFactorFlow = async (enable: boolean) => {
    resetTwoFactorFlow();
    setTwoFactorTarget(enable);
    setShowTwoFactorFlow(true);
    await handleRequestTwoFactorOtp(enable, true);
  };

  const handleRequestTwoFactorOtp = async (enable: boolean, silent = false) => {
    if (!token) {
      if (!silent) setTwoFactorError("You need to sign in to continue.");
      return;
    }
    if (!silent) {
      setTwoFactorError(null);
      setTwoFactorSuccess(null);
    }
    setTwoFactorSubmitting(true);
    try {
      const res = await requestTwoFactorOtp({ token, enable });
      setTwoFactorExpiresSec(res.expiresSec);
      setTwoFactorCooldown(60);
      setTwoFactorStep("otp");
    } catch (err) {
      const apiErr = err as ApiError | undefined;
      const retryAfter = (apiErr?.data as { retryAfterSec?: number } | null)
        ?.retryAfterSec;
      if (retryAfter) {
        setTwoFactorCooldown(retryAfter);
        setTwoFactorError(`OTP was just sent. Please wait before retrying.`);
        return;
      }
      setTwoFactorError(apiErr?.message || "Unable to send OTP.");
    } finally {
      setTwoFactorSubmitting(false);
    }
  };

  const handleVerifyTwoFactorOtp = async () => {
    if (!twoFactorOtp.trim()) {
      setTwoFactorError("Please enter the OTP.");
      return;
    }
    if (!token) {
      setTwoFactorError("You need to sign in to continue.");
      return;
    }
    setTwoFactorSubmitting(true);
    setTwoFactorError(null);
    try {
      const res = await verifyTwoFactorOtp({
        token,
        code: twoFactorOtp.trim(),
        enable: twoFactorTarget,
      });
      setTwoFactorEnabled(res.enabled);
      setTwoFactorStep("done");
      setTwoFactorSuccess(
        res.enabled
          ? "Two-factor authentication enabled."
          : "Two-factor authentication disabled.",
      );
      setTwoFactorOtp("");
    } catch (err) {
      const apiErr = err as ApiError | undefined;
      setTwoFactorError(apiErr?.message || "Invalid or expired OTP.");
    } finally {
      setTwoFactorSubmitting(false);
    }
  };

  const handleTwoFactorBack = () => {
    setShowTwoFactorFlow(false);
    resetTwoFactorFlow();
  };

  const openLoginDevices = () => {
    setLoginDevicesError(null);
    setShowLoginDevices(true);
  };

  useEffect(() => {
    if (!showLoginDevices || !token) return;
    let active = true;
    const loadDevices = async () => {
      setLoginDevicesLoading(true);
      setLoginDevicesError(null);
      try {
        const deviceId =
          typeof window !== "undefined"
            ? window.localStorage.getItem("cordigramDeviceId")
            : null;
        const res: LoginDevicesResponse = await fetchLoginDevices({
          token,
          deviceId,
        });
        if (!active) return;
        setLoginDevices(res.devices ?? []);
        setLoginDevicesCurrent(res.currentDeviceIdHash ?? null);
      } catch (err) {
        const apiErr = err as ApiError | undefined;
        if (active) {
          setLoginDevicesError(
            apiErr?.message || "Unable to load login devices.",
          );
        }
      } finally {
        if (active) setLoginDevicesLoading(false);
      }
    };
    loadDevices();
    return () => {
      active = false;
    };
  }, [showLoginDevices, token]);

  const resolveDeviceName = (device: LoginDeviceItem) => {
    if (device.deviceInfo?.trim()) return device.deviceInfo.trim();
    const parts = [device.browser, device.os].filter(Boolean);
    if (parts.length) return parts.join(" on ");
    return device.deviceType ? `${device.deviceType} device` : "Unknown device";
  };

  const resolveDeviceTime = (device: LoginDeviceItem) => {
    const value = device.lastSeenAt ?? device.firstSeenAt ?? null;
    return value ? `Last active ${formatRelativeTime(value)}.` : "";
  };

  const hasOtherLoginDevices = Boolean(
    loginDevices.length &&
    loginDevices.some((item) => item.deviceIdHash !== loginDevicesCurrent),
  );

  const handleLogoutDevice = async () => {
    if (!token || !logoutTarget) return;
    setLogoutSubmitting(true);
    setLogoutError(null);
    try {
      await logoutLoginDevice({
        token,
        deviceIdHash: logoutTarget.deviceIdHash,
      });
      setLoginDevices((prev) =>
        prev.filter((item) => item.deviceIdHash !== logoutTarget.deviceIdHash),
      );
      setLogoutTarget(null);
    } catch (err) {
      const apiErr = err as ApiError | undefined;
      setLogoutError(apiErr?.message || "Unable to log out device.");
    } finally {
      setLogoutSubmitting(false);
    }
  };

  const handleLogoutAllDevices = async () => {
    if (!token) return;
    if (!loginDevicesCurrent) {
      setLogoutAllError("Unable to detect this device.");
      return;
    }
    setLogoutAllSubmitting(true);
    setLogoutAllError(null);
    try {
      const deviceId =
        typeof window !== "undefined"
          ? window.localStorage.getItem("cordigramDeviceId")
          : null;
      const res = await logoutAllDevices({ token, deviceId });
      const currentHash = res.currentDeviceIdHash ?? loginDevicesCurrent;
      setLoginDevices((prev) =>
        prev.filter((item) => item.deviceIdHash === currentHash),
      );
      setLogoutAllOpen(false);
    } catch (err) {
      const apiErr = err as ApiError | undefined;
      setLogoutAllError(apiErr?.message || "Unable to log out devices.");
    } finally {
      setLogoutAllSubmitting(false);
    }
  };

  const handlePasskeyBack = () => {
    if (passkeyStep === "password") {
      setShowPasskeyFlow(false);
      resetPasskeyFlow();
      return;
    }
    if (passkeyStep === "otp") {
      setPasskeyStep("password");
      return;
    }
    if (passkeyStep === "form") {
      setPasskeyStep("otp");
      return;
    }
    if (passkeyStep === "done") {
      setShowPasskeyFlow(false);
      resetPasskeyFlow();
    }
  };

  const handleRequestPasskeyOtp = async () => {
    setPasskeyError(null);
    setPasskeySuccess(null);
    if (!passkeyPassword.trim()) {
      setPasskeyError("Please enter your current password.");
      return;
    }
    if (!token) {
      setPasskeyError("You need to sign in to continue.");
      return;
    }
    setPasskeySubmitting(true);
    try {
      const res = await requestPasskeyOtp({
        token,
        password: passkeyPassword,
      });
      setPasskeyExpiresSec(res.expiresSec);
      setPasskeyCooldown(60);
      setPasskeyStep("otp");
    } catch (err) {
      const apiErr = err as ApiError | undefined;
      const retryAfter = (apiErr?.data as { retryAfterSec?: number } | null)
        ?.retryAfterSec;
      if (retryAfter) {
        setPasskeyCooldown(retryAfter);
        setPasskeyError(`OTP was just sent. Please wait before retrying.`);
        return;
      }
      setPasskeyError(apiErr?.message || "Unable to send OTP.");
    } finally {
      setPasskeySubmitting(false);
    }
  };

  const handleVerifyPasskeyOtp = async () => {
    setPasskeyError(null);
    setPasskeySuccess(null);
    if (!passkeyOtp.trim()) {
      setPasskeyError("Please enter the OTP.");
      return;
    }
    if (!token) {
      setPasskeyError("You need to sign in to continue.");
      return;
    }
    setPasskeySubmitting(true);
    try {
      const res = await verifyPasskeyOtp({ token, code: passkeyOtp.trim() });
      setHasPasskey(res.hasPasskey);
      setPasskeyCurrent(res.currentPasskey ?? "");
      setPasskeyStep("form");
    } catch (err) {
      const apiErr = err as ApiError | undefined;
      setPasskeyError(apiErr?.message || "Invalid or expired OTP.");
    } finally {
      setPasskeySubmitting(false);
    }
  };

  const handleConfirmPasskey = async () => {
    setPasskeyError(null);
    setPasskeySuccess(null);
    if (hasPasskey && !passkeyCurrent.trim()) {
      setPasskeyError("Current passkey is required.");
      return;
    }
    if (!passkeyNew.trim()) {
      setPasskeyError("Please enter a new passkey.");
      return;
    }
    if (!passkeyRegex.test(passkeyNew)) {
      setPasskeyError("Passkey must be exactly 6 digits.");
      return;
    }
    if (passkeyNew !== passkeyConfirm) {
      setPasskeyError("Passkeys do not match.");
      return;
    }
    if (hasPasskey && passkeyNew === passkeyCurrent) {
      setPasskeyError("New passkey must be different from current passkey.");
      return;
    }
    if (!token) {
      setPasskeyError("You need to sign in to continue.");
      return;
    }
    setPasskeySubmitting(true);
    try {
      await confirmPasskey({
        token,
        currentPasskey: hasPasskey ? passkeyCurrent : undefined,
        newPasskey: passkeyNew,
      });
      setHasPasskey(true);
      setPasskeyEnabled(true);
      setPasskeyCurrent(passkeyNew);
      setPasskeyStep("done");
      setPasskeySuccess("Passkey updated successfully.");
      setPasskeyNew("");
      setPasskeyConfirm("");
      setPasskeyOtp("");
    } catch (err) {
      const apiErr = err as ApiError | undefined;
      setPasskeyError(apiErr?.message || "Unable to update passkey.");
    } finally {
      setPasskeySubmitting(false);
    }
  };

  const handleTogglePasskey = async () => {
    setPasskeyToggleError(null);
    if (!token) {
      setPasskeyToggleError("You need to sign in to continue.");
      return;
    }
    setPasskeyToggleSubmitting(true);
    try {
      const res = await togglePasskey({
        token,
        enabled: !passkeyEnabled,
      });
      setPasskeyEnabled(res.enabled);
    } catch (err) {
      const apiErr = err as ApiError | undefined;
      setPasskeyToggleError(apiErr?.message || "Unable to update passkey.");
    } finally {
      setPasskeyToggleSubmitting(false);
    }
  };

  const handlePasswordBack = () => {
    if (passwordStep === "otp") {
      setShowChangePassword(false);
      resetPasswordFlow();
      return;
    }
    if (passwordStep === "form") {
      setPasswordStep("otp");
      return;
    }
    if (passwordStep === "done") {
      setShowChangePassword(false);
      resetPasswordFlow();
    }
  };

  const handleRequestPasswordOtp = async (silent = false) => {
    if (!token) {
      if (!silent) setPasswordError("You need to sign in to continue.");
      return;
    }
    if (!silent) {
      setPasswordError(null);
      setPasswordSuccess(null);
    }
    setPasswordSubmitting(true);
    try {
      const res = await requestPasswordChangeOtp({ token });
      setPasswordExpiresSec(res.expiresSec);
      setPasswordCooldown(60);
      setPasswordStep("otp");
    } catch (err) {
      const apiErr = err as ApiError | undefined;
      const retryAfter = (apiErr?.data as { retryAfterSec?: number } | null)
        ?.retryAfterSec;
      if (retryAfter) {
        setPasswordCooldown(retryAfter);
        setPasswordError(`OTP was just sent. Please wait before retrying.`);
        return;
      }
      setPasswordError(apiErr?.message || "Unable to send OTP.");
    } finally {
      setPasswordSubmitting(false);
    }
  };

  const handleVerifyPasswordOtp = async () => {
    setPasswordError(null);
    setPasswordSuccess(null);
    if (!passwordOtp.trim()) {
      setPasswordError("Please enter the OTP.");
      return;
    }
    if (!token) {
      setPasswordError("You need to sign in to continue.");
      return;
    }
    setPasswordSubmitting(true);
    try {
      await verifyPasswordChangeOtp({ token, code: passwordOtp.trim() });
      setPasswordStep("form");
    } catch (err) {
      const apiErr = err as ApiError | undefined;
      setPasswordError(apiErr?.message || "Invalid or expired OTP.");
    } finally {
      setPasswordSubmitting(false);
    }
  };

  const handleConfirmPasswordChange = async () => {
    setPasswordError(null);
    setPasswordSuccess(null);
    if (!passwordCurrent.trim()) {
      setPasswordError("Please enter your current password.");
      return;
    }
    if (!passwordNew.trim()) {
      setPasswordError("Please enter a new password.");
      return;
    }
    if (passwordNew === passwordCurrent) {
      setPasswordError(
        "New password must be different from your current password.",
      );
      return;
    }
    if (!passwordRegex.test(passwordNew)) {
      setPasswordError(
        "Password must be at least 8 characters and include uppercase, lowercase, and a number.",
      );
      return;
    }
    if (passwordNew !== passwordConfirm) {
      setPasswordError("New passwords do not match.");
      return;
    }
    if (!token) {
      setPasswordError("You need to sign in to continue.");
      return;
    }
    setPasswordSubmitting(true);
    try {
      await confirmPasswordChange({
        token,
        currentPassword: passwordCurrent,
        newPassword: passwordNew,
      });
      setPasswordChangedAt(new Date().toISOString());
      setPasswordStep("done");
      setPasswordSuccess("Password updated successfully.");
      setPasswordLogoutPrompt(true);
      setPasswordCurrent("");
      setPasswordNew("");
      setPasswordConfirm("");
      setPasswordOtp("");
    } catch (err) {
      const apiErr = err as ApiError | undefined;
      setPasswordError(apiErr?.message || "Unable to change password.");
    } finally {
      setPasswordSubmitting(false);
    }
  };

  const handleLogoutOtherDevicesAfterPassword = async () => {
    if (!token) return;
    setPasswordLogoutSubmitting(true);
    setPasswordLogoutError(null);
    try {
      const deviceId =
        typeof window !== "undefined"
          ? window.localStorage.getItem("cordigramDeviceId")
          : null;
      await logoutAllDevices({ token, deviceId });
      setPasswordLogoutPrompt(false);
    } catch (err) {
      const apiErr = err as ApiError | undefined;
      setPasswordLogoutError(
        apiErr?.message || "Unable to log out other devices.",
      );
    } finally {
      setPasswordLogoutSubmitting(false);
    }
  };

  const handleBack = () => {
    if (step === "password") {
      setShowChangeEmail(false);
      resetFlow();
      return;
    }
    if (step === "current-otp") {
      setStep("password");
      return;
    }
    if (step === "new-email") {
      setStep("current-otp");
      return;
    }
    if (step === "new-otp") {
      setStep("new-email");
      return;
    }
    if (step === "done") {
      setShowChangeEmail(false);
      resetFlow();
    }
  };

  const handleRequestCurrentOtp = async () => {
    setError(null);
    setSuccess(null);
    if (!password.trim()) {
      setError("Please enter your current password.");
      return;
    }
    if (!token) {
      setError("You need to sign in to continue.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await requestChangeEmailCurrentOtp({ token, password });
      setCurrentExpiresSec(res.expiresSec);
      setCurrentCooldown(60);
      setStep("current-otp");
    } catch (err) {
      const apiErr = err as ApiError | undefined;
      const retryAfter = (apiErr?.data as { retryAfterSec?: number } | null)
        ?.retryAfterSec;
      if (retryAfter) {
        setCurrentCooldown(retryAfter);
        setError(`OTP was just sent. Please wait before retrying.`);
        return;
      }
      setError(apiErr?.message || "Unable to send OTP.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyCurrentOtp = async () => {
    setError(null);
    setSuccess(null);
    if (!currentOtp.trim()) {
      setError("Please enter the OTP.");
      return;
    }
    if (!token) {
      setError("You need to sign in to continue.");
      return;
    }
    setSubmitting(true);
    try {
      await verifyChangeEmailCurrentOtp({ token, code: currentOtp.trim() });
      setStep("new-email");
    } catch (err) {
      const apiErr = err as ApiError | undefined;
      setError(apiErr?.message || "Invalid or expired OTP.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestNewOtp = async () => {
    setError(null);
    setSuccess(null);
    const normalized = newEmail.trim().toLowerCase();
    if (!normalized || !emailRegex.test(normalized)) {
      setError("The new email address is invalid.");
      return;
    }
    if (!token) {
      setError("You need to sign in to continue.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await requestChangeEmailNewOtp({
        token,
        newEmail: normalized,
      });
      setNewExpiresSec(res.expiresSec);
      setNewCooldown(60);
      setStep("new-otp");
    } catch (err) {
      const apiErr = err as ApiError | undefined;
      const retryAfter = (apiErr?.data as { retryAfterSec?: number } | null)
        ?.retryAfterSec;
      if (retryAfter) {
        setNewCooldown(retryAfter);
        setError(`OTP was just sent. Please wait before retrying.`);
        return;
      }
      setError(apiErr?.message || "Unable to send OTP to the new email.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyNewOtp = async () => {
    setError(null);
    setSuccess(null);
    if (!newOtp.trim()) {
      setError("Please enter the OTP.");
      return;
    }
    if (!token) {
      setError("You need to sign in to continue.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await verifyChangeEmailNewOtp({
        token,
        code: newOtp.trim(),
      });
      if (res.accessToken) {
        setStoredAccessToken(res.accessToken);
      }
      if (res.email) {
        setCurrentEmail(res.email);
      }

      if (res.email && currentEmail) {
        const newEmailValue = res.email.trim().toLowerCase();
        const oldEmailValue = currentEmail.trim().toLowerCase();

        try {
          const activeToken = res.accessToken ?? token;
          if (activeToken && oldEmailValue !== newEmailValue) {
            await removeRecentAccount({
              token: activeToken,
              email: oldEmailValue,
            }).catch(() => undefined);
          }
          const profile = await fetchCurrentProfile({
            token: res.accessToken ?? token,
          });
          await upsertRecentAccount({
            token: res.accessToken ?? token,
            payload: {
              email: newEmailValue,
              displayName: profile.displayName,
              username: profile.username,
              avatarUrl: profile.avatarUrl,
            },
          });

          if (typeof window !== "undefined") {
            const raw = window.localStorage.getItem(RECENT_ACCOUNTS_KEY);
            const parsed = raw ? (JSON.parse(raw) as Array<any>) : [];
            const list = Array.isArray(parsed) ? parsed : [];
            const hasOld = list.some(
              (item) => item?.email?.toLowerCase?.() === oldEmailValue,
            );
            const next = hasOld
              ? list.map((item) =>
                  item?.email?.toLowerCase?.() === oldEmailValue
                    ? {
                        ...item,
                        email: newEmailValue,
                        displayName: profile.displayName,
                        username: profile.username,
                        avatarUrl: profile.avatarUrl,
                      }
                    : item,
                )
              : [
                  {
                    email: newEmailValue,
                    displayName: profile.displayName,
                    username: profile.username,
                    avatarUrl: profile.avatarUrl,
                    lastUsed: Date.now(),
                  },
                  ...list,
                ];
            window.localStorage.setItem(
              RECENT_ACCOUNTS_KEY,
              JSON.stringify(next),
            );
          }
        } catch (_err) {
          if (typeof window !== "undefined") {
            try {
              const raw = window.localStorage.getItem(RECENT_ACCOUNTS_KEY);
              const parsed = raw ? (JSON.parse(raw) as Array<any>) : [];
              const list = Array.isArray(parsed) ? parsed : [];
              const hasOld = list.some(
                (item) => item?.email?.toLowerCase?.() === oldEmailValue,
              );
              const next = hasOld
                ? list.map((item) =>
                    item?.email?.toLowerCase?.() === oldEmailValue
                      ? { ...item, email: newEmailValue }
                      : item,
                  )
                : [
                    {
                      email: newEmailValue,
                      lastUsed: Date.now(),
                    },
                    ...list,
                  ];
              window.localStorage.setItem(
                RECENT_ACCOUNTS_KEY,
                JSON.stringify(next),
              );
            } catch (_err) {
              // ignore local recent account update errors
            }
          }
        }
      }

      setSuccess("Email updated. Returning to Settings...");
      setStep("done");
      setTimeout(() => {
        router.push("/settings");
      }, 1200);
    } catch (err) {
      const apiErr = err as ApiError | undefined;
      setError(apiErr?.message || "Invalid or expired OTP.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!canRender) return null;

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <header className={styles.header}>
          <div>
            <p className={styles.kicker}>Settings</p>
            <h1 className={styles.title}>Account & preferences</h1>
          </div>
        </header>

        <div className={styles.layout}>
          <aside className={styles.sidebar}>
            <ul className={styles.sideList}>
              {SETTINGS_SECTIONS.map((section) => (
                <li key={section.key}>
                  <button
                    type="button"
                    className={`${styles.sideButton} ${
                      activeKey === section.key ? styles.sideButtonActive : ""
                    }`}
                    onClick={() => setActiveKey(section.key)}
                  >
                    <span className={styles.itemIcon} aria-hidden="true">
                      {section.icon}
                    </span>
                    <span className={styles.itemLabel}>{section.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          <section className={styles.panel}>
            {activeKey === "account" ? (
              <>
                <div className={styles.sectionHeader}>
                  <h2 className={styles.sectionTitle}>Account email</h2>
                  <p className={styles.sectionDesc}>
                    Manage your sign-in email and verification steps.
                  </p>
                </div>

                {!showChangeEmail ? (
                  <div className={styles.sectionCard}>
                    <div className={styles.emailCard}>
                      <div>
                        <p className={styles.hint}>Current email</p>
                        <p className={styles.emailValue}>
                          {currentEmail ?? "Loading..."}
                        </p>
                      </div>
                      <button
                        type="button"
                        className={styles.primary}
                        onClick={openChangeEmail}
                      >
                        Change email
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className={styles.sectionCard}>
                    <div className={styles.actionRow}>
                      <button
                        type="button"
                        className={styles.backButton}
                        onClick={handleBack}
                      >
                        <span className={styles.backIcon} aria-hidden="true">
                          <svg viewBox="0 0 24 24">
                            <path d="M15 5L8 12l7 7" />
                          </svg>
                        </span>
                        Back
                      </button>
                      <span className={styles.stepBadge}>
                        {step === "password"
                          ? "Step 1 · Verify password"
                          : step === "current-otp"
                            ? "Step 2 · Current email OTP"
                            : step === "new-email"
                              ? "Step 3 · Enter new email"
                              : step === "new-otp"
                                ? "Step 4 · New email OTP"
                                : "Completed"}
                      </span>
                    </div>

                    {step === "password" ? (
                      <div className={styles.stepContent} key="password">
                        <div className={styles.form}>
                          <label className={styles.label}>
                            Current password
                            <input
                              className={styles.input}
                              type="password"
                              autoComplete="current-password"
                              placeholder="Enter your password"
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                            />
                          </label>
                          <p className={styles.hint}>
                            We’ll send a 6-digit OTP to your current email.
                          </p>
                          {error ? (
                            <p className={styles.error}>{error}</p>
                          ) : null}
                          <div className={styles.actions}>
                            <button
                              type="button"
                              className={styles.primary}
                              onClick={handleRequestCurrentOtp}
                              disabled={submitting}
                            >
                              {submitting ? "Sending..." : "Send OTP"}
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {step === "current-otp" ? (
                      <div className={styles.stepContent} key="current-otp">
                        <div className={styles.form}>
                          <label className={styles.label}>
                            Enter OTP from current email
                            <input
                              className={`${styles.input} ${styles.otpInput}`}
                              type="text"
                              inputMode="numeric"
                              maxLength={6}
                              placeholder="------"
                              value={currentOtp}
                              onChange={(e) =>
                                setCurrentOtp(e.target.value.replace(/\D/g, ""))
                              }
                            />
                          </label>
                          <div className={styles.otpRow}>
                            <p className={styles.hint}>
                              OTP expires in 5 minutes.
                            </p>
                          </div>
                          {error ? (
                            <p className={styles.error}>{error}</p>
                          ) : null}
                          <div className={styles.actions}>
                            <button
                              type="button"
                              className={styles.secondary}
                              onClick={handleRequestCurrentOtp}
                              disabled={submitting || currentCooldown > 0}
                            >
                              {currentCooldown > 0
                                ? `Resend (${currentCooldown}s)`
                                : "Resend OTP"}
                            </button>
                            <button
                              type="button"
                              className={styles.primary}
                              onClick={handleVerifyCurrentOtp}
                              disabled={submitting}
                            >
                              {submitting ? "Verifying..." : "Verify"}
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {step === "new-email" ? (
                      <div className={styles.stepContent} key="new-email">
                        <div className={styles.form}>
                          <label className={styles.label}>
                            New email
                            <input
                              className={styles.input}
                              type="email"
                              placeholder="name@example.com"
                              value={newEmail}
                              onChange={(e) => setNewEmail(e.target.value)}
                            />
                          </label>
                          <p className={styles.hint}>
                            We’ll send a 6-digit OTP to the new email.
                          </p>
                          <p className={styles.hint}>
                            After this change, your old email will be removed
                            and you’ll sign in using the new email only.
                          </p>
                          {error ? (
                            <p className={styles.error}>{error}</p>
                          ) : null}
                          <div className={styles.actions}>
                            <button
                              type="button"
                              className={styles.primary}
                              onClick={handleRequestNewOtp}
                              disabled={submitting}
                            >
                              {submitting ? "Sending..." : "Send OTP"}
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {step === "new-otp" ? (
                      <div className={styles.stepContent} key="new-otp">
                        <div className={styles.form}>
                          <label className={styles.label}>
                            OTP for new email
                            <input
                              className={`${styles.input} ${styles.otpInput}`}
                              type="text"
                              inputMode="numeric"
                              maxLength={6}
                              placeholder="------"
                              value={newOtp}
                              onChange={(e) =>
                                setNewOtp(e.target.value.replace(/\D/g, ""))
                              }
                            />
                          </label>
                          <div className={styles.otpRow}>
                            <p className={styles.hint}>
                              OTP expires in 5 minutes.
                            </p>
                          </div>
                          {error ? (
                            <p className={styles.error}>{error}</p>
                          ) : null}
                          {success ? (
                            <div className={styles.successBox}>{success}</div>
                          ) : null}
                          <div className={styles.actions}>
                            <button
                              type="button"
                              className={styles.secondary}
                              onClick={handleRequestNewOtp}
                              disabled={submitting || newCooldown > 0}
                            >
                              {newCooldown > 0
                                ? `Resend (${newCooldown}s)`
                                : "Resend OTP"}
                            </button>
                            <button
                              type="button"
                              className={styles.primary}
                              onClick={handleVerifyNewOtp}
                              disabled={submitting}
                            >
                              {submitting ? "Verifying..." : "Confirm"}
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {step === "done" ? (
                      <div className={styles.stepContent} key="done">
                        <div className={styles.successBox}>
                          {success ?? "Email updated successfully."}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}

                <div className={styles.sectionRowHeader}>
                  <div>
                    <h3 className={styles.sectionTitle}>Personal info</h3>
                    <p className={styles.sectionDesc}>
                      Details shown on your profile.
                    </p>
                  </div>
                </div>

                <div className={styles.sectionCard}>
                  {profileLoading ? (
                    <p className={styles.hint}>Loading personal info...</p>
                  ) : null}
                  {profileError ? (
                    <p className={styles.error}>{profileError}</p>
                  ) : null}

                  <ul className={styles.infoList}>
                    <li className={styles.infoItem}>
                      <div className={styles.infoText}>
                        <p className={styles.infoTitle}>Display name</p>
                        <p className={styles.infoValue}>
                          {profileDetail?.displayName || "Not set"}
                        </p>
                      </div>
                    </li>
                    <li className={styles.infoItem}>
                      <div className={styles.infoText}>
                        <p className={styles.infoTitle}>Username</p>
                        <p className={styles.infoValue}>
                          @{profileDetail?.username || "Not set"}
                        </p>
                      </div>
                    </li>
                    <li className={styles.infoItem}>
                      <div className={styles.infoText}>
                        <p className={styles.infoTitle}>Birthdate</p>
                        <p className={styles.infoValue}>
                          {profileDetail?.birthdate || "Not set"}
                        </p>
                      </div>
                      <div className={styles.infoAction}>
                        {renderVisibilityControl(
                          "birthdate",
                          profileDetail?.visibility?.birthdate,
                          !profileDetail || visibilitySaving.birthdate,
                          "Birthdate visibility",
                        )}
                      </div>
                    </li>
                    <li className={styles.infoItem}>
                      <div className={styles.infoText}>
                        <p className={styles.infoTitle}>Gender</p>
                        <p className={styles.infoValue}>
                          {profileDetail?.gender || "Not set"}
                        </p>
                      </div>
                      <div className={styles.infoAction}>
                        {renderVisibilityControl(
                          "gender",
                          profileDetail?.visibility?.gender,
                          !profileDetail || visibilitySaving.gender,
                          "Gender visibility",
                        )}
                      </div>
                    </li>
                    <li className={styles.infoItem}>
                      <div className={styles.infoText}>
                        <p className={styles.infoTitle}>Location</p>
                        <p className={styles.infoValue}>
                          {profileDetail?.location || "Not set"}
                        </p>
                      </div>
                      <div className={styles.infoAction}>
                        {renderVisibilityControl(
                          "location",
                          profileDetail?.visibility?.location,
                          !profileDetail || visibilitySaving.location,
                          "Location visibility",
                        )}
                      </div>
                    </li>
                    <li className={styles.infoItem}>
                      <div className={styles.infoText}>
                        <p className={styles.infoTitle}>Workplace</p>
                        <p className={styles.infoValue}>
                          {profileDetail?.workplace?.companyName || "Not set"}
                        </p>
                      </div>
                      <div className={styles.infoAction}>
                        {renderVisibilityControl(
                          "workplace",
                          profileDetail?.visibility?.workplace,
                          !profileDetail || visibilitySaving.workplace,
                          "Workplace visibility",
                        )}
                      </div>
                    </li>
                    <li className={styles.infoItem}>
                      <div className={styles.infoText}>
                        <p className={styles.infoTitle}>Bio</p>
                        <p className={styles.infoValue}>
                          {profileDetail?.bio || "Not set"}
                        </p>
                      </div>
                      <div className={styles.infoAction}>
                        {renderVisibilityControl(
                          "bio",
                          profileDetail?.visibility?.bio,
                          !profileDetail || visibilitySaving.bio,
                          "Bio visibility",
                        )}
                      </div>
                    </li>
                  </ul>

                  {visibilityError ? (
                    <p className={styles.error}>{visibilityError}</p>
                  ) : null}

                  <div className={styles.editRow}>
                    <button
                      type="button"
                      className={styles.primary}
                      onClick={() => setEditProfileOpen(true)}
                      disabled={!profileDetail}
                    >
                      Edit profile
                    </button>
                  </div>
                </div>
              </>
            ) : activeKey === "profile" ? (
              <>
                <div className={styles.sectionHeader}>
                  <h2 className={styles.sectionTitle}>Profile visibility</h2>
                  <p className={styles.sectionDesc}>
                    Control who can view your profile, About section, and
                    follower lists.
                  </p>
                </div>

                <div className={styles.sectionCard}>
                  <ul className={styles.infoList}>
                    <li className={styles.infoItem}>
                      <div className={styles.infoText}>
                        <p className={styles.infoTitle}>Profile page</p>
                        <p className={styles.infoValue}>
                          Who can view your profile page and tabs.
                        </p>
                      </div>
                      <div className={styles.infoAction}>
                        {renderVisibilityControl(
                          "profile",
                          profileDetail?.visibility?.profile,
                          !profileDetail || visibilitySaving.profile,
                          "Profile visibility",
                        )}
                      </div>
                    </li>
                    <li className={styles.infoItem}>
                      <div className={styles.infoText}>
                        <p className={styles.infoTitle}>About this user</p>
                        <p className={styles.infoValue}>
                          Who can open the About overlay on your profile.
                        </p>
                      </div>
                      <div className={styles.infoAction}>
                        {renderVisibilityControl(
                          "about",
                          profileDetail?.visibility?.about,
                          !profileDetail || visibilitySaving.about,
                          "About visibility",
                        )}
                      </div>
                    </li>
                    <li className={styles.infoItem}>
                      <div className={styles.infoText}>
                        <p className={styles.infoTitle}>Followers list</p>
                        <p className={styles.infoValue}>
                          Who can view your followers list.
                        </p>
                      </div>
                      <div className={styles.infoAction}>
                        {renderVisibilityControl(
                          "followers",
                          profileDetail?.visibility?.followers,
                          !profileDetail || visibilitySaving.followers,
                          "Followers list visibility",
                        )}
                      </div>
                    </li>
                    <li className={styles.infoItem}>
                      <div className={styles.infoText}>
                        <p className={styles.infoTitle}>Following list</p>
                        <p className={styles.infoValue}>
                          Who can view the accounts you follow.
                        </p>
                      </div>
                      <div className={styles.infoAction}>
                        {renderVisibilityControl(
                          "following",
                          profileDetail?.visibility?.following,
                          !profileDetail || visibilitySaving.following,
                          "Following list visibility",
                        )}
                      </div>
                    </li>
                  </ul>

                  {visibilityError ? (
                    <p className={styles.error}>{visibilityError}</p>
                  ) : null}
                </div>
              </>
            ) : activeKey === "privacy" ? (
              <>
                <div className={styles.sectionHeader}>
                  <h2 className={styles.sectionTitle}>Password & Security</h2>
                  <p className={styles.sectionDesc}>
                    Manage your login protection and password updates.
                  </p>
                </div>

                <div className={styles.sectionCard}>
                  {!showChangePassword ? (
                    <div className={styles.sectionRowHeader}>
                      <div>
                        <h3 className={styles.sectionTitleSmall}>
                          Change password
                        </h3>
                        <p className={styles.sectionDesc}>
                          {passwordStatusLoading
                            ? "Loading last password change..."
                            : passwordChangedAt
                              ? `Last changed ${formatRelativeTime(passwordChangedAt)}.`
                              : "Password has not been changed yet."}
                        </p>
                      </div>
                      <button
                        type="button"
                        className={styles.primary}
                        onClick={openChangePassword}
                      >
                        Change password
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className={styles.actionRow}>
                        <button
                          type="button"
                          className={styles.backButton}
                          onClick={handlePasswordBack}
                        >
                          <span className={styles.backIcon} aria-hidden="true">
                            <svg viewBox="0 0 24 24">
                              <path d="M15 5L8 12l7 7" />
                            </svg>
                          </span>
                          Back
                        </button>
                        <span className={styles.stepBadge}>
                          {passwordStep === "otp"
                            ? "Step 1 · Email OTP"
                            : passwordStep === "form"
                              ? "Step 2 · Update password"
                              : "Completed"}
                        </span>
                      </div>

                      {passwordStep === "otp"
                        ? renderOtpStep({
                            label: "OTP for password change",
                            value: passwordOtp,
                            onChange: setPasswordOtp,
                            hint: "We sent a 6-digit code to your email.",
                            expiresSec: passwordExpiresSec,
                            error: passwordError,
                            submitting: passwordSubmitting,
                            cooldown: passwordCooldown,
                            onResend: () => handleRequestPasswordOtp(),
                            onConfirm: handleVerifyPasswordOtp,
                          })
                        : null}

                      {passwordStep === "form" ? (
                        <div className={styles.stepContent} key="pw-form">
                          <div className={styles.form}>
                            <label className={styles.label}>
                              Current password
                              <input
                                className={styles.input}
                                type="password"
                                autoComplete="current-password"
                                placeholder="Enter current password"
                                value={passwordCurrent}
                                onChange={(e) =>
                                  setPasswordCurrent(e.target.value)
                                }
                              />
                            </label>
                            <label className={styles.label}>
                              New password
                              <input
                                className={styles.input}
                                type="password"
                                autoComplete="new-password"
                                placeholder="Create a new password"
                                value={passwordNew}
                                onChange={(e) => setPasswordNew(e.target.value)}
                              />
                            </label>
                            <label className={styles.label}>
                              Confirm new password
                              <input
                                className={styles.input}
                                type="password"
                                autoComplete="new-password"
                                placeholder="Re-enter new password"
                                value={passwordConfirm}
                                onChange={(e) =>
                                  setPasswordConfirm(e.target.value)
                                }
                              />
                            </label>
                            <p className={styles.hint}>
                              Password must be at least 8 characters and include
                              uppercase, lowercase, and a number.
                            </p>
                            {passwordError ? (
                              <p className={styles.error}>{passwordError}</p>
                            ) : null}
                            <div className={styles.actions}>
                              <button
                                type="button"
                                className={styles.primary}
                                onClick={handleConfirmPasswordChange}
                                disabled={passwordSubmitting}
                              >
                                {passwordSubmitting
                                  ? "Updating..."
                                  : "Change password"}
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : null}

                      {passwordStep === "done" ? (
                        <div className={styles.stepContent} key="pw-done">
                          <div className={styles.successBox}>
                            {passwordSuccess ??
                              "Password updated successfully."}
                          </div>
                          {passwordLogoutPrompt ? (
                            <div className={styles.form}>
                              <p className={styles.hint}>
                                Do you want to log out of all other devices?
                              </p>
                              {passwordLogoutError ? (
                                <p className={styles.error}>
                                  {passwordLogoutError}
                                </p>
                              ) : null}
                              <div className={styles.actions}>
                                <button
                                  type="button"
                                  className={styles.secondary}
                                  onClick={() => setPasswordLogoutPrompt(false)}
                                  disabled={passwordLogoutSubmitting}
                                >
                                  No, keep them signed in
                                </button>
                                <button
                                  type="button"
                                  className={styles.primary}
                                  onClick={
                                    handleLogoutOtherDevicesAfterPassword
                                  }
                                  disabled={passwordLogoutSubmitting}
                                >
                                  {passwordLogoutSubmitting
                                    ? "Logging out..."
                                    : "Yes, log out others"}
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </>
                  )}
                </div>

                <div className={styles.sectionCard}>
                  {!showTwoFactorFlow ? (
                    <div className={styles.sectionRowHeader}>
                      <div>
                        <h3 className={styles.sectionTitleSmall}>
                          Two-factor authentication
                        </h3>
                        <p className={styles.sectionDesc}>
                          Require an email OTP each time you sign in.
                        </p>
                      </div>
                      <button
                        type="button"
                        className={styles.primary}
                        onClick={() => openTwoFactorFlow(!twoFactorEnabled)}
                        disabled={twoFactorLoading}
                      >
                        {twoFactorLoading
                          ? "Loading..."
                          : twoFactorEnabled
                            ? "Disable"
                            : "Enable"}
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className={styles.actionRow}>
                        <button
                          type="button"
                          className={styles.backButton}
                          onClick={handleTwoFactorBack}
                        >
                          <span className={styles.backIcon} aria-hidden="true">
                            <svg viewBox="0 0 24 24">
                              <path d="M15 5L8 12l7 7" />
                            </svg>
                          </span>
                          Back
                        </button>
                        <span className={styles.stepBadge}>
                          {twoFactorStep === "otp"
                            ? "Step 1 · Email OTP"
                            : "Completed"}
                        </span>
                      </div>

                      {twoFactorStep === "otp"
                        ? renderOtpStep({
                            label: twoFactorTarget
                              ? "OTP to enable two-factor"
                              : "OTP to disable two-factor",
                            value: twoFactorOtp,
                            onChange: setTwoFactorOtp,
                            hint: "We sent a 6-digit code to your email.",
                            expiresSec: twoFactorExpiresSec,
                            error: twoFactorError,
                            submitting: twoFactorSubmitting,
                            cooldown: twoFactorCooldown,
                            onResend: () =>
                              handleRequestTwoFactorOtp(twoFactorTarget),
                            onConfirm: handleVerifyTwoFactorOtp,
                            confirmLabel: twoFactorTarget
                              ? "Enable"
                              : "Disable",
                          })
                        : null}

                      {twoFactorStep === "done" ? (
                        <div className={styles.stepContent}>
                          <div className={styles.successBox}>
                            {twoFactorSuccess ?? "Two-factor updated."}
                          </div>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>

                <div className={styles.sectionCard}>
                  <div className={styles.sectionRowHeader}>
                    <div>
                      <h3 className={styles.sectionTitleSmall}>Passkeys</h3>
                      <p className={styles.sectionDesc}>
                        Use a 6-digit passkey for quick verification.
                      </p>
                      {hasPasskey ? (
                        <p className={styles.hint}>
                          {passkeyEnabled
                            ? "Status: Enabled"
                            : "Status: Disabled"}
                        </p>
                      ) : null}
                    </div>
                    {!showPasskeyFlow ? (
                      <div className={styles.rowActions}>
                        {hasPasskey ? (
                          <button
                            type="button"
                            className={`${styles.secondary} ${styles.secondarySmall}`}
                            onClick={handleTogglePasskey}
                            disabled={
                              passkeyStatusLoading || passkeyToggleSubmitting
                            }
                          >
                            {passkeyToggleSubmitting
                              ? "Updating..."
                              : passkeyEnabled
                                ? "Disable"
                                : "Enable"}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className={styles.primary}
                          onClick={openPasskeyFlow}
                          disabled={passkeyStatusLoading}
                        >
                          {passkeyStatusLoading
                            ? "Loading..."
                            : hasPasskey
                              ? "Change passkey"
                              : "Set passkey"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                  {passkeyToggleError ? (
                    <p className={styles.error}>{passkeyToggleError}</p>
                  ) : null}

                  {showPasskeyFlow ? (
                    <>
                      <div className={styles.actionRow}>
                        <button
                          type="button"
                          className={styles.backButton}
                          onClick={handlePasskeyBack}
                        >
                          <span className={styles.backIcon} aria-hidden="true">
                            <svg viewBox="0 0 24 24">
                              <path d="M15 5L8 12l7 7" />
                            </svg>
                          </span>
                          Back
                        </button>
                        <span className={styles.stepBadge}>
                          {passkeyStep === "password"
                            ? "Step 1 · Verify password"
                            : passkeyStep === "otp"
                              ? "Step 2 · Email OTP"
                              : passkeyStep === "form"
                                ? hasPasskey
                                  ? "Step 3 · Change passkey"
                                  : "Step 3 · Set passkey"
                                : "Completed"}
                        </span>
                      </div>

                      {passkeyStep === "password" ? (
                        <div className={styles.stepContent}>
                          <div className={styles.form}>
                            <label className={styles.label}>
                              Current password
                              <input
                                className={styles.input}
                                type="password"
                                autoComplete="current-password"
                                placeholder="Enter your password"
                                value={passkeyPassword}
                                onChange={(e) =>
                                  setPasskeyPassword(e.target.value)
                                }
                              />
                            </label>
                            <p className={styles.hint}>
                              We’ll send a 6-digit OTP to confirm your passkey
                              change.
                            </p>
                            {passkeyError ? (
                              <p className={styles.error}>{passkeyError}</p>
                            ) : null}
                            <div className={styles.actions}>
                              <button
                                type="button"
                                className={styles.primary}
                                onClick={handleRequestPasskeyOtp}
                                disabled={passkeySubmitting}
                              >
                                {passkeySubmitting ? "Sending..." : "Send OTP"}
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : null}

                      {passkeyStep === "otp"
                        ? renderOtpStep({
                            label: "OTP for passkey setup",
                            value: passkeyOtp,
                            onChange: setPasskeyOtp,
                            hint: "We sent a 6-digit code to your email.",
                            expiresSec: passkeyExpiresSec,
                            error: passkeyError,
                            submitting: passkeySubmitting,
                            cooldown: passkeyCooldown,
                            onResend: handleRequestPasskeyOtp,
                            onConfirm: handleVerifyPasskeyOtp,
                          })
                        : null}

                      {passkeyStep === "form" ? (
                        <div className={styles.stepContent}>
                          <div className={styles.form}>
                            {hasPasskey ? (
                              <label className={styles.label}>
                                Current passkey
                                <div className={styles.inputGroup}>
                                  <input
                                    className={`${styles.input} ${styles.inputWithIcon}`}
                                    type={
                                      showCurrentPasskey ? "text" : "password"
                                    }
                                    value={passkeyCurrent}
                                    readOnly
                                  />
                                  <button
                                    type="button"
                                    className={styles.iconButton}
                                    onClick={() =>
                                      setShowCurrentPasskey((prev) => !prev)
                                    }
                                    aria-label={
                                      showCurrentPasskey
                                        ? "Hide passkey"
                                        : "Show passkey"
                                    }
                                  >
                                    <svg viewBox="0 0 24 24">
                                      <path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6-10-6-10-6Z" />
                                      <circle cx="12" cy="12" r="3" />
                                    </svg>
                                  </button>
                                </div>
                              </label>
                            ) : null}
                            <label className={styles.label}>
                              New passkey
                              <input
                                className={styles.input}
                                type="password"
                                inputMode="numeric"
                                maxLength={6}
                                placeholder="Enter 6-digit passkey"
                                value={passkeyNew}
                                onChange={(e) =>
                                  setPasskeyNew(
                                    normalizeDigits(e.target.value, 6),
                                  )
                                }
                              />
                            </label>
                            <label className={styles.label}>
                              Confirm passkey
                              <input
                                className={styles.input}
                                type="password"
                                inputMode="numeric"
                                maxLength={6}
                                placeholder="Re-enter passkey"
                                value={passkeyConfirm}
                                onChange={(e) =>
                                  setPasskeyConfirm(
                                    normalizeDigits(e.target.value, 6),
                                  )
                                }
                              />
                            </label>
                            <p className={styles.hint}>
                              Passkey must be exactly 6 digits.
                            </p>
                            {passkeyError ? (
                              <p className={styles.error}>{passkeyError}</p>
                            ) : null}
                            <div className={styles.actions}>
                              <button
                                type="button"
                                className={styles.primary}
                                onClick={handleConfirmPasskey}
                                disabled={passkeySubmitting}
                              >
                                {passkeySubmitting ? "Saving..." : "Save"}
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : null}

                      {passkeyStep === "done" ? (
                        <div className={styles.stepContent}>
                          <div className={styles.successBox}>
                            {passkeySuccess ?? "Passkey updated successfully."}
                          </div>
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </div>

                <div className={styles.sectionCard}>
                  <div className={styles.sectionRowHeader}>
                    <div>
                      <h3 className={styles.sectionTitleSmall}>
                        Where you’re logged in
                      </h3>
                      <p className={styles.sectionDesc}>
                        Review devices that have accessed your account.
                      </p>
                    </div>
                    <button
                      type="button"
                      className={styles.primary}
                      onClick={openLoginDevices}
                    >
                      View devices
                    </button>
                  </div>
                </div>
              </>
            ) : activeKey === "notifications" ? (
              <>
                <div className={styles.sectionHeader}>
                  <h2 className={styles.sectionTitle}>Notifications</h2>
                  <p className={styles.sectionDesc}>
                    Control when you receive notification alerts.
                  </p>
                </div>

                <div className={styles.sectionCard}>
                  <div className={styles.notificationRow}>
                    <div className={styles.notificationMeta}>
                      <p className={styles.infoTitle}>Push notifications</p>
                      <p className={styles.infoValue}>
                        {notificationLoading
                          ? "Loading..."
                          : notificationStatusLabel || "Enabled"}
                      </p>
                    </div>
                    <div className={styles.notificationActions}>
                      {notificationSettings?.enabled !== false ? (
                        <button
                          type="button"
                          className={styles.primary}
                          onClick={openNotificationOverlay}
                          disabled={notificationLoading || notificationSaving}
                        >
                          Mute
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            className={styles.secondary}
                            onClick={openNotificationOverlay}
                            disabled={notificationSaving}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className={styles.primary}
                            onClick={handleEnableNotifications}
                            disabled={notificationSaving}
                          >
                            Enable
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <p className={styles.hint}>
                    When muted, new notifications are still saved but won’t
                    alert you in real time.
                  </p>
                  {notificationError ? (
                    <p className={styles.error}>{notificationError}</p>
                  ) : null}
                </div>

                <div className={styles.sectionCard}>
                  {notificationCategories.map((category) => {
                    const settings =
                      notificationSettings?.categories?.[category.key];
                    const enabled = settings?.enabled !== false;
                    return (
                      <div
                        key={category.key}
                        className={styles.notificationRow}
                      >
                        <div className={styles.notificationMeta}>
                          <p className={styles.infoTitle}>{category.label}</p>
                          <p className={styles.infoValue}>
                            {notificationLoading
                              ? "Loading..."
                              : getCategoryStatusLabel(category.key)}
                          </p>
                          <p className={styles.hint}>{category.description}</p>
                        </div>
                        <div className={styles.notificationActions}>
                          {enabled ? (
                            <button
                              type="button"
                              className={styles.primary}
                              onClick={() => openCategoryOverlay(category.key)}
                              disabled={notificationLoading || categorySaving}
                            >
                              Mute
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                className={styles.secondary}
                                onClick={() =>
                                  openCategoryOverlay(category.key)
                                }
                                disabled={categorySaving}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className={styles.primary}
                                onClick={() =>
                                  handleEnableCategoryNotifications(
                                    category.key,
                                  )
                                }
                                disabled={categorySaving}
                              >
                                Enable
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {categoryError ? (
                    <p className={styles.error}>{categoryError}</p>
                  ) : null}
                </div>
              </>
            ) : activeKey === "content" ? (
              <>
                <div className={styles.sectionHeader}>
                  <h2 className={styles.sectionTitle}>Content</h2>
                  <p className={styles.sectionDesc}>
                    Manage hidden posts and blocked accounts.
                  </p>
                </div>

                <div className={styles.sectionCard}>
                  <button
                    type="button"
                    className={styles.accordionHeader}
                    onClick={() => toggleContentSection("activity")}
                    aria-expanded={contentOpen.activity}
                    aria-controls="content-activity-body"
                  >
                    <div>
                      <h3 className={styles.sectionTitleSmall}>Activity log</h3>
                      <p className={styles.sectionDesc}>
                        Track all of your interactions across the platform.
                      </p>
                    </div>
                    <span
                      className={`${styles.accordionChevron} ${
                        contentOpen.activity ? styles.accordionChevronOpen : ""
                      }`}
                      aria-hidden="true"
                    >
                      ▾
                    </span>
                  </button>

                  <div
                    id="content-activity-body"
                    className={`${styles.accordionBody} ${
                      contentOpen.activity ? styles.accordionBodyOpen : ""
                    }`}
                  >
                    <div className={styles.activityFilters}>
                      {activityFilterOptions.map((option) => (
                        <button
                          key={option.key}
                          type="button"
                          className={`${styles.filterPill} ${
                            activityFilter === option.key
                              ? styles.filterPillActive
                              : ""
                          }`}
                          onClick={() => setActivityFilter(option.key)}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>

                    {activityLoading ? (
                      <p className={styles.hint}>Loading activity...</p>
                    ) : null}
                    {activityError ? (
                      <p className={styles.error}>{activityError}</p>
                    ) : null}

                    {activityItems.length ? (
                      <div className={styles.activityList}>
                        {activityItems.map((item) => {
                          const meta = item.meta ?? {};
                          const authorName =
                            meta.postAuthorDisplayName ||
                            meta.postAuthorUsername ||
                            "this post";
                          const targetName =
                            meta.targetDisplayName ||
                            meta.targetUsername ||
                            "this account";
                          const commentSnippet =
                            meta.commentSnippet?.trim() || "Comment";
                          const captionSnippet =
                            meta.postCaption?.trim() || "Post";

                          const title =
                            item.type === "post_like"
                              ? `Liked ${authorName}`
                              : item.type === "comment_like"
                                ? `Liked a comment`
                                : item.type === "comment"
                                  ? `Commented on ${authorName}`
                                  : item.type === "repost"
                                    ? `Reposted ${authorName}`
                                    : item.type === "save"
                                      ? `Saved ${authorName}`
                                      : item.type === "follow"
                                        ? `Followed ${targetName}`
                                        : item.type === "report_post"
                                          ? `Reported ${authorName}`
                                          : `Reported ${targetName}`;

                          const subtitle =
                            item.type === "comment_like" ||
                            item.type === "comment"
                              ? commentSnippet
                              : captionSnippet;

                          const timeLabel = item.createdAt
                            ? formatDistanceToNow(new Date(item.createdAt), {
                                addSuffix: true,
                              })
                            : "";

                          const thumbUrl =
                            meta.postMediaUrl || meta.targetAvatarUrl || null;

                          const clickable = Boolean(item.postId);

                          return (
                            <div
                              key={item.id}
                              className={`${styles.activityRow} ${
                                clickable ? styles.activityRowClickable : ""
                              }`}
                              role={clickable ? "button" : undefined}
                              tabIndex={clickable ? 0 : -1}
                              onClick={() => {
                                if (item.postId)
                                  router.push(`/post/${item.postId}`);
                              }}
                              onKeyDown={(event) => {
                                if (!item.postId) return;
                                if (
                                  event.key === "Enter" ||
                                  event.key === " "
                                ) {
                                  event.preventDefault();
                                  router.push(`/post/${item.postId}`);
                                }
                              }}
                            >
                              <div className={styles.activityIcon}>
                                <ActivityIcon type={item.type} />
                              </div>
                              <div className={styles.activityBody}>
                                <div className={styles.activityHeader}>
                                  <p className={styles.activityTitle}>
                                    {title}
                                  </p>
                                  <span className={styles.activityTime}>
                                    {timeLabel}
                                  </span>
                                </div>
                                <p className={styles.activitySubtitle}>
                                  {subtitle}
                                </p>
                              </div>
                              <div className={styles.activityThumb}>
                                {thumbUrl ? (
                                  <img src={thumbUrl} alt="" />
                                ) : (
                                  <span
                                    className={styles.activityThumbPlaceholder}
                                  >
                                    {item.type === "follow" ||
                                    item.type === "report_user"
                                      ? getInitials(targetName)
                                      : "📝"}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : !activityLoading ? (
                      <p className={styles.hint}>No activity yet.</p>
                    ) : null}

                    {activityCursor ? (
                      <div className={styles.activityFooter}>
                        <button
                          type="button"
                          className={styles.secondary}
                          onClick={() => loadActivityLog("more")}
                          disabled={activityLoadingMore}
                        >
                          {activityLoadingMore ? "Loading..." : "Load more"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className={styles.sectionCard}>
                  <button
                    type="button"
                    className={styles.accordionHeader}
                    onClick={() => toggleContentSection("hidden")}
                    aria-expanded={contentOpen.hidden}
                    aria-controls="content-hidden-body"
                  >
                    <div>
                      <h3 className={styles.sectionTitleSmall}>Hidden posts</h3>
                      <p className={styles.sectionDesc}>
                        Posts you hide are removed from your feed. You can
                        unhide them anytime.
                      </p>
                    </div>
                    <span
                      className={`${styles.accordionChevron} ${
                        contentOpen.hidden ? styles.accordionChevronOpen : ""
                      }`}
                      aria-hidden="true"
                    >
                      ▾
                    </span>
                  </button>

                  <div
                    id="content-hidden-body"
                    className={`${styles.accordionBody} ${
                      contentOpen.hidden ? styles.accordionBodyOpen : ""
                    }`}
                  >
                    <div className={styles.sectionRowHeader}>
                      <div />
                      <button
                        type="button"
                        className={styles.secondary}
                        onClick={loadContentSettings}
                        disabled={hiddenPostsLoading || blockedUsersLoading}
                      >
                        Refresh
                      </button>
                    </div>

                    {hiddenPostsLoading ? (
                      <p className={styles.hint}>Loading hidden posts...</p>
                    ) : null}
                    {hiddenPostsError ? (
                      <p className={styles.error}>{hiddenPostsError}</p>
                    ) : null}

                    {hiddenPosts.length ? (
                      <div className={styles.contentList}>
                        {hiddenPosts.map((post) => {
                          const authorName =
                            post.authorDisplayName ||
                            post.authorUsername ||
                            "Unknown";
                          const authorHandle = post.authorUsername
                            ? `@${post.authorUsername}`
                            : "Unknown";
                          const caption = post.content?.trim()
                            ? post.content.trim()
                            : "No caption";
                          const media = post.media?.[0];
                          const thumbUrl = media?.url;
                          const postId = post.id;
                          return (
                            <div
                              className={`${styles.contentRow} ${styles.contentRowClickable}`}
                              key={postId}
                              role="button"
                              tabIndex={0}
                              onClick={() => {
                                if (postId) router.push(`/post/${postId}`);
                              }}
                              onKeyDown={(event) => {
                                if (!postId) return;
                                if (
                                  event.key === "Enter" ||
                                  event.key === " "
                                ) {
                                  event.preventDefault();
                                  router.push(`/post/${postId}`);
                                }
                              }}
                            >
                              <div className={styles.contentThumb}>
                                {thumbUrl ? (
                                  <img src={thumbUrl} alt="" />
                                ) : (
                                  <span
                                    className={styles.contentThumbPlaceholder}
                                  >
                                    📝
                                  </span>
                                )}
                              </div>
                              <div className={styles.contentMeta}>
                                <p className={styles.contentTitle}>
                                  {authorName}
                                </p>
                                <p className={styles.contentSub}>
                                  {authorHandle}
                                </p>
                                <p className={styles.contentSnippet}>
                                  {caption}
                                </p>
                              </div>
                              <div className={styles.contentActions}>
                                <button
                                  type="button"
                                  className={styles.secondary}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setConfirmUnhide(post);
                                  }}
                                  disabled={Boolean(
                                    postId && unhideSubmitting[postId],
                                  )}
                                >
                                  {postId && unhideSubmitting[postId]
                                    ? "Unhiding..."
                                    : "Unhide"}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : !hiddenPostsLoading ? (
                      <p className={styles.hint}>No hidden posts.</p>
                    ) : null}
                  </div>
                </div>

                <div className={styles.sectionCard}>
                  <button
                    type="button"
                    className={styles.accordionHeader}
                    onClick={() => toggleContentSection("blocked")}
                    aria-expanded={contentOpen.blocked}
                    aria-controls="content-blocked-body"
                  >
                    <div>
                      <h3 className={styles.sectionTitleSmall}>
                        Blocked users
                      </h3>
                      <p className={styles.sectionDesc}>
                        People you block can’t see your profile or content.
                      </p>
                    </div>
                    <span
                      className={`${styles.accordionChevron} ${
                        contentOpen.blocked ? styles.accordionChevronOpen : ""
                      }`}
                      aria-hidden="true"
                    >
                      ▾
                    </span>
                  </button>

                  <div
                    id="content-blocked-body"
                    className={`${styles.accordionBody} ${
                      contentOpen.blocked ? styles.accordionBodyOpen : ""
                    }`}
                  >
                    <div className={styles.sectionRowHeader}>
                      <div />
                    </div>

                    {blockedUsersLoading ? (
                      <p className={styles.hint}>Loading blocked users...</p>
                    ) : null}
                    {blockedUsersError ? (
                      <p className={styles.error}>{blockedUsersError}</p>
                    ) : null}

                    {blockedUsers.length ? (
                      <div className={styles.contentList}>
                        {blockedUsers.map((user) => {
                          const label =
                            user.displayName || user.username || "Unknown";
                          const handle = user.username
                            ? `@${user.username}`
                            : "Unknown";
                          return (
                            <div
                              className={styles.contentRow}
                              key={user.userId}
                            >
                              <div className={styles.avatar}>
                                {user.avatarUrl ? (
                                  <img src={user.avatarUrl} alt={label} />
                                ) : (
                                  <span>{getInitials(label)}</span>
                                )}
                              </div>
                              <div className={styles.contentMeta}>
                                <p className={styles.contentTitle}>{label}</p>
                                <p className={styles.contentSub}>{handle}</p>
                              </div>
                              <div className={styles.contentActions}>
                                <button
                                  type="button"
                                  className={styles.secondary}
                                  onClick={() => setConfirmUnblock(user)}
                                  disabled={Boolean(
                                    user.userId &&
                                    unblockSubmitting[user.userId],
                                  )}
                                >
                                  {user.userId && unblockSubmitting[user.userId]
                                    ? "Unblocking..."
                                    : "Unblock"}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : !blockedUsersLoading ? (
                      <p className={styles.hint}>No blocked users.</p>
                    ) : null}
                  </div>
                </div>
              </>
            ) : activeKey === "system" ? (
              <>
                <div className={styles.sectionHeader}>
                  <h2 className={styles.sectionTitle}>{tSystem("title")}</h2>
                  <p className={styles.sectionDesc}>{tSystem("description")}</p>
                </div>

                <div className={styles.sectionCard}>
                  <div className={styles.systemRow}>
                    <div className={styles.systemText}>
                      <h3 className={styles.sectionTitleSmall}>
                        {tSystem("language.title")}
                      </h3>
                      <p className={styles.sectionDesc}>
                        {tSystem("language.description")}
                      </p>
                    </div>
                    <div className={styles.systemControl}>
                      <div className={styles.languageControl}>
                        <button
                          type="button"
                          className={styles.languageButton}
                          onClick={() => setLanguageOpen((prev) => !prev)}
                          aria-haspopup="listbox"
                          aria-expanded={languageOpen}
                        >
                          <span>{getLanguageLabel(language)}</span>
                          <span
                            className={styles.languageCaret}
                            aria-hidden="true"
                          >
                            ▾
                          </span>
                        </button>
                        {languageOpen ? (
                          <div className={styles.languageMenu} role="listbox">
                            {(["en", "vi"] as const).map((value) => (
                              <button
                                key={value}
                                type="button"
                                className={`${styles.languageOption} ${
                                  language === value
                                    ? styles.languageOptionActive
                                    : ""
                                }`}
                                onClick={() => {
                                  setLanguage(value);
                                  setLanguageOpen(false);
                                }}
                                role="option"
                                aria-selected={language === value}
                              >
                                <span>{getLanguageLabel(value)}</span>
                                {language === value ? (
                                  <span className={styles.languageCheck}>
                                    ✓
                                  </span>
                                ) : null}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className={styles.systemRow}>
                    <div className={styles.systemText}>
                      <h3 className={styles.sectionTitleSmall}>
                        {tSystem("theme.title")}
                      </h3>
                      <p className={styles.sectionDesc}>
                        {tSystem("theme.description")}
                      </p>
                    </div>
                    <div className={styles.systemControl}>
                      <div className={styles.themeToggle} role="group">
                        <button
                          type="button"
                          className={`${styles.themeOption} ${
                            theme === "light" ? styles.themeOptionActive : ""
                          }`}
                          onClick={() => setTheme("light")}
                        >
                          {tSystem("theme.options.light")}
                        </button>
                        <button
                          type="button"
                          className={`${styles.themeOption} ${
                            theme === "dark" ? styles.themeOptionActive : ""
                          }`}
                          onClick={() => setTheme("dark")}
                        >
                          {tSystem("theme.options.dark")}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className={styles.sectionCard}>
                <h2 className={styles.sectionTitle}>Coming soon</h2>
                <p className={styles.sectionDesc}>
                  This section will be available soon.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>

      <ProfileEditOverlay
        open={editProfileOpen}
        token={token}
        viewerId={profileDetail?.userId}
        profile={profileDetail}
        onClose={() => setEditProfileOpen(false)}
        onSaved={(updated) => setProfileDetail(updated)}
      />

      {notificationOverlayOpen ? (
        <div className={styles.overlayBackdrop}>
          <div className={styles.overlayCard} role="dialog" aria-modal="true">
            <div className={styles.overlayHeader}>
              <div>
                <p className={styles.kicker}>Notifications</p>
                <h2 className={styles.overlayTitle}>Mute notifications</h2>
              </div>
              <div className={styles.overlayActions}>
                <button
                  type="button"
                  className={styles.closeButton}
                  onClick={() => setNotificationOverlayOpen(false)}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
            </div>

            <p className={styles.sectionDesc}>
              Choose how long to mute notification.
            </p>

            <div className={styles.notificationOptionGrid}>
              {notificationOptions.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  className={`${styles.notificationOption} ${
                    notificationOption === option.key
                      ? styles.notificationOptionActive
                      : ""
                  }`}
                  onClick={() => setNotificationOption(option.key)}
                >
                  <span className={styles.notificationOptionTitle}>
                    {option.label}
                  </span>
                </button>
              ))}
            </div>

            {notificationOption === "custom" ? (
              <div className={styles.notificationCustomRow}>
                <div className={styles.notificationPicker}>
                  <label className={styles.label}>Date</label>
                  <DateSelect
                    value={notificationCustomDate}
                    onChange={setNotificationCustomDate}
                    minDate={new Date()}
                    maxDate={null}
                    placeholder="yyyy-mm-dd"
                  />
                </div>
                <div className={styles.notificationPicker}>
                  <label className={styles.label}>Time</label>
                  <TimeSelect
                    value={notificationCustomTime}
                    onChange={setNotificationCustomTime}
                    selectedDate={notificationCustomDate}
                    minDateTime={new Date()}
                    disabled={!notificationCustomDate}
                    placeholder="hh:mm"
                  />
                </div>
              </div>
            ) : null}

            {notificationCustomError ? (
              <p className={styles.error}>{notificationCustomError}</p>
            ) : null}

            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => setNotificationOverlayOpen(false)}
                disabled={notificationSaving}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.primary}
                onClick={handleSaveNotificationMute}
                disabled={notificationSaving}
              >
                {notificationSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {categoryOverlayOpen && categoryKey ? (
        <div className={styles.overlayBackdrop}>
          <div className={styles.overlayCard} role="dialog" aria-modal="true">
            <div className={styles.overlayHeader}>
              <div>
                <p className={styles.kicker}>Notifications</p>
                <h2 className={styles.overlayTitle}>
                  Mute{" "}
                  {categoryKey === "mentions" ? "mentions & tags" : categoryKey}
                </h2>
              </div>
              <div className={styles.overlayActions}>
                <button
                  type="button"
                  className={styles.closeButton}
                  onClick={() => setCategoryOverlayOpen(false)}
                  aria-label="Close"
                  disabled={categorySaving}
                >
                  ×
                </button>
              </div>
            </div>

            <p className={styles.sectionDesc}>
              Choose how long to mute this notification type.
            </p>

            <div className={styles.notificationOptionGrid}>
              {notificationOptions.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  className={`${styles.notificationOption} ${
                    categoryOption === option.key
                      ? styles.notificationOptionActive
                      : ""
                  }`}
                  onClick={() => setCategoryOption(option.key)}
                >
                  <span className={styles.notificationOptionTitle}>
                    {option.label}
                  </span>
                </button>
              ))}
            </div>

            {categoryOption === "custom" ? (
              <div className={styles.notificationCustomRow}>
                <div className={styles.notificationPicker}>
                  <label className={styles.label}>Date</label>
                  <DateSelect
                    value={categoryCustomDate}
                    onChange={setCategoryCustomDate}
                    minDate={new Date()}
                    maxDate={null}
                    placeholder="yyyy-mm-dd"
                  />
                </div>
                <div className={styles.notificationPicker}>
                  <label className={styles.label}>Time</label>
                  <TimeSelect
                    value={categoryCustomTime}
                    onChange={setCategoryCustomTime}
                    selectedDate={categoryCustomDate}
                    minDateTime={new Date()}
                    disabled={!categoryCustomDate}
                    placeholder="hh:mm"
                  />
                </div>
              </div>
            ) : null}

            {categoryCustomError ? (
              <p className={styles.error}>{categoryCustomError}</p>
            ) : null}

            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => setCategoryOverlayOpen(false)}
                disabled={categorySaving}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.primary}
                onClick={handleSaveCategoryMute}
                disabled={categorySaving}
              >
                {categorySaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showLoginDevices ? (
        <div className={styles.overlayBackdrop}>
          <div className={styles.overlayCard} role="dialog" aria-modal="true">
            <div className={styles.overlayHeader}>
              <div>
                <p className={styles.kicker}>Security</p>
                <h2 className={styles.overlayTitle}>Logged-in devices</h2>
              </div>
              <div className={styles.overlayActions}>
                <button
                  type="button"
                  className={styles.closeButton}
                  onClick={() => setShowLoginDevices(false)}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
            </div>

            {loginDevicesLoading ? (
              <p className={styles.hint}>Loading devices...</p>
            ) : null}
            {loginDevicesError ? (
              <p className={styles.error}>{loginDevicesError}</p>
            ) : null}

            {loginDevices.length > 0 ? (
              <>
                <div className={styles.deviceList}>
                  {(() => {
                    const current = loginDevicesCurrent
                      ? loginDevices.find(
                          (item) => item.deviceIdHash === loginDevicesCurrent,
                        )
                      : null;
                    const rest = loginDevices.filter(
                      (item) => item.deviceIdHash !== loginDevicesCurrent,
                    );
                    const ordered = current ? [current, ...rest] : loginDevices;
                    return ordered.map((device) => {
                      const isCurrent =
                        device.deviceIdHash === loginDevicesCurrent;
                      return (
                        <div
                          key={device.deviceIdHash}
                          className={`${styles.deviceRow} ${
                            isCurrent ? styles.deviceRowActive : ""
                          }`}
                        >
                          <div className={styles.deviceIcon}>
                            {device.deviceType?.toLowerCase() === "mobile"
                              ? "📱"
                              : device.deviceType?.toLowerCase() === "tablet"
                                ? "📟"
                                : "💻"}
                          </div>
                          <div className={styles.deviceInfo}>
                            <div className={styles.deviceHeader}>
                              <p className={styles.deviceName}>
                                {resolveDeviceName(device)}
                              </p>
                            </div>
                            <p className={styles.deviceMeta}>
                              {device.location?.trim()
                                ? device.location
                                : "Ho Chi Minh, Vietnam"}
                            </p>
                            <p className={styles.deviceMeta}>
                              {resolveDeviceTime(device)}
                            </p>
                            {isCurrent ? (
                              <span className={styles.deviceBadge}>
                                This device
                              </span>
                            ) : null}
                            {!isCurrent ? (
                              <button
                                type="button"
                                className={styles.deviceLogout}
                                onClick={() => {
                                  setLogoutError(null);
                                  setLogoutTarget(device);
                                }}
                              >
                                Log out
                              </button>
                            ) : null}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
                <div className={styles.deviceListFooter}>
                  <button
                    type="button"
                    className={styles.logoutAllButton}
                    onClick={() => {
                      setLogoutAllError(null);
                      setLogoutAllOpen(true);
                    }}
                    disabled={!hasOtherLoginDevices || loginDevicesLoading}
                  >
                    Logout all devices
                  </button>
                </div>
              </>
            ) : loginDevicesLoading ? null : (
              <p className={styles.hint}>No devices recorded yet.</p>
            )}
          </div>
        </div>
      ) : null}
      {logoutTarget ? (
        <div className={styles.confirmBackdrop}>
          <div className={styles.confirmCard} role="dialog" aria-modal="true">
            <h3 className={styles.confirmTitle}>Log out this device?</h3>
            <p className={styles.confirmText}>
              {resolveDeviceName(logoutTarget)} will be signed out. You can log
              in again later if needed.
            </p>
            {logoutError ? <p className={styles.error}>{logoutError}</p> : null}
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => setLogoutTarget(null)}
                disabled={logoutSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.primary}
                onClick={handleLogoutDevice}
                disabled={logoutSubmitting}
              >
                {logoutSubmitting ? "Logging out..." : "Log out"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {logoutAllOpen ? (
        <div className={styles.confirmBackdrop}>
          <div className={styles.confirmCard} role="dialog" aria-modal="true">
            <h3 className={styles.confirmTitle}>Log out all devices?</h3>
            <p className={styles.confirmText}>
              All devices will be signed out except this one.
            </p>
            {logoutAllError ? (
              <p className={styles.error}>{logoutAllError}</p>
            ) : null}
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => setLogoutAllOpen(false)}
                disabled={logoutAllSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.primary}
                onClick={handleLogoutAllDevices}
                disabled={logoutAllSubmitting}
              >
                {logoutAllSubmitting ? "Logging out..." : "Log out all"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmUnhide ? (
        <div className={styles.confirmBackdrop}>
          <div className={styles.confirmCard} role="dialog" aria-modal="true">
            <h3 className={styles.confirmTitle}>Unhide this post?</h3>
            <p className={styles.confirmText}>
              This post will appear in your feed again.
            </p>
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => setConfirmUnhide(null)}
                disabled={Boolean(
                  confirmUnhide.id && unhideSubmitting[confirmUnhide.id],
                )}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.primary}
                onClick={() => {
                  const id = confirmUnhide.id;
                  setConfirmUnhide(null);
                  handleUnhidePost(id);
                }}
                disabled={Boolean(
                  confirmUnhide.id && unhideSubmitting[confirmUnhide.id],
                )}
              >
                {confirmUnhide.id && unhideSubmitting[confirmUnhide.id]
                  ? "Unhiding..."
                  : "Unhide"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmUnblock ? (
        <div className={styles.confirmBackdrop}>
          <div className={styles.confirmCard} role="dialog" aria-modal="true">
            <h3 className={styles.confirmTitle}>Unblock this account?</h3>
            <p className={styles.confirmText}>
              They will be able to see your profile and content again.
            </p>
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => setConfirmUnblock(null)}
                disabled={Boolean(
                  confirmUnblock.userId &&
                  unblockSubmitting[confirmUnblock.userId],
                )}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.primary}
                onClick={() => {
                  const id = confirmUnblock.userId;
                  setConfirmUnblock(null);
                  handleUnblockUser(id);
                }}
                disabled={Boolean(
                  confirmUnblock.userId &&
                  unblockSubmitting[confirmUnblock.userId],
                )}
              >
                {confirmUnblock.userId &&
                unblockSubmitting[confirmUnblock.userId]
                  ? "Unblocking..."
                  : "Unblock"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
