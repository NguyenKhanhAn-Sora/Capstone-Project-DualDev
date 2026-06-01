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
  fetchViolationHistory,
  fetchCreatorVerificationStatus,
  submitCreatorVerificationRequest,
  type NotificationCategoryKey,
  type NotificationSettingsResponse,
  type ViolationHistoryItem,
  type CreatorEligibilityResponse,
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
import {
  useLanguage,
  SUPPORTED_LANGUAGE_CODES,
  type LanguageCode,
} from "@/component/language-provider";
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
    key: "verification",
    label: "Creator verification",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m12 2.8 2.7 5.4 6 .9-4.3 4.2 1 6-5.4-2.8-5.4 2.8 1-6L3.3 9.1l6-.9Z" />
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
    key: "violations",
    label: "Violation Center",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2.5 4 6v6.1c0 5 3.3 9.5 8 10.9 4.7-1.4 8-5.9 8-10.9V6ZM12 13.8a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2Zm1.1-2.9a1.1 1.1 0 1 1-2.2 0V8.2a1.1 1.1 0 0 1 2.2 0Z" />
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

const formatRelativeTime = (value: string | null, lessMinText = "less than a minute") => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const diffMs = date.getTime() - Date.now();
  const past = diffMs < 0;
  const absSec = Math.abs(diffMs) / 1000;
  if (absSec < 60) return lessMinText;
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

const formatSeverityLabel = (value: "low" | "medium" | "high" | null) => {
  if (!value) return "N/A";
  if (value === "high") return "High";
  if (value === "medium") return "Medium";
  return "Low";
};

const formatActionLabel = (action: string) => {
  switch (action) {
    case "remove_post":
      return "Removed post";
    case "restrict_post":
      return "Restricted post";
    case "delete_comment":
      return "Deleted comment";
    case "warn":
    case "warn_user":
      return "Warning issued";
    case "mute_interaction":
      return "Interaction muted";
    case "suspend_user":
      return "Account suspended";
    case "limit_account":
      return "Account limited";
    default:
      return "Policy action";
  }
};

const formatRemainingHourMinute = (
  value?: string | null,
  nowMs = Date.now(),
): string | null => {
  if (!value) return null;
  const expiresAt = new Date(value);
  if (Number.isNaN(expiresAt.getTime())) return null;
  const totalMinutes = Math.max(0, Math.floor((expiresAt.getTime() - nowMs) / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

const isWarnAction = (action: string) =>
  action === "warn" || action === "warn_user";

const getCreatorRequestStatusClassName = (status?: string | null) => {
  const normalized = (status ?? "").toLowerCase();
  if (normalized === "approved") return "approved";
  if (normalized === "rejected") return "rejected";
  return "pending";
};

const CONTENT_PAGE_SIZE = 10;

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

function EyeToggle({ show, onToggle }: { show: boolean; onToggle: () => void }) {
  const { t: tEye } = useLanguage();
  return (
    <button
      type="button"
      className={styles.iconButton}
      onClick={onToggle}
      aria-label={show ? tEye("settingsPage.common.hide") : tEye("settingsPage.common.show")}
    >
      <svg viewBox="0 0 24 24">
        {show ? (
          <>
            <path d="M17.94 17.94A10 10 0 0 1 12 20C5 20 1 12 1 12a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9 9 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24 4.24" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </>
        ) : (
          <>
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </>
        )}
      </svg>
    </button>
  );
}

export default function SettingsPage() {
  const canRender = useRequireAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { theme, setTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const tSystem = useTranslations("settings.system");
  const tDevices = useTranslations("settings.devices");
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
  const [hasPassword, setHasPassword] = useState(true);
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
  const [showEmailPassword, setShowEmailPassword] = useState(false);
  const [showPasswordCurrent, setShowPasswordCurrent] = useState(false);
  const [showPasswordNew, setShowPasswordNew] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [showPasskeyPassword, setShowPasskeyPassword] = useState(false);
  const [showPasskeyNew, setShowPasskeyNew] = useState(false);
  const [showPasskeyConfirm, setShowPasskeyConfirm] = useState(false);
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
  const [activityVisibleCount, setActivityVisibleCount] = useState(
    CONTENT_PAGE_SIZE,
  );
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityLoadingMore, setActivityLoadingMore] = useState(false);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [activityCursor, setActivityCursor] = useState<string | null>(null);
  const [activityFilter, setActivityFilter] = useState<"all" | ActivityType>(
    "all",
  );
  const [violationItems, setViolationItems] = useState<ViolationHistoryItem[]>(
    [],
  );
  const [violationLoading, setViolationLoading] = useState(false);
  const [violationError, setViolationError] = useState<string | null>(null);
  const [currentStrikeTotal, setCurrentStrikeTotal] = useState(0);
  const [violationNowMs, setViolationNowMs] = useState(() => Date.now());
  const [selectedViolation, setSelectedViolation] =
    useState<ViolationHistoryItem | null>(null);
  const [contentOpen, setContentOpen] = useState({
    activity: false,
    hidden: false,
    blocked: false,
  });
  const [hiddenPostsVisibleCount, setHiddenPostsVisibleCount] = useState(
    CONTENT_PAGE_SIZE,
  );

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
  const [creatorStatus, setCreatorStatus] =
    useState<CreatorEligibilityResponse | null>(null);
  const [creatorLoading, setCreatorLoading] = useState(false);
  const [creatorError, setCreatorError] = useState<string | null>(null);
  const [creatorSubmitting, setCreatorSubmitting] = useState(false);
  const [creatorNote, setCreatorNote] = useState("");
  const [creatorSuccess, setCreatorSuccess] = useState<string | null>(null);

  const formatRequirementLabel = (value: string) => {
    const map: Record<string, string> = {
      account_age: "Account age",
      followers_count: "Followers",
      posts_count: "Posts",
      active_posting_days_30d: "Active posting days (30d)",
      engagement_per_post_30d: "Average engagement/post (30d)",
      recent_violations_90d: "Recent violations (90d)",
      score: "Creator score",
    };
    return map[value] ?? value;
  };

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
              ? t("settingsPage.common.resendCooldown", { seconds: params.cooldown ?? 0 })
              : t("settingsPage.common.resendOtp")}
          </button>
          <button
            type="button"
            className={styles.primary}
            onClick={params.onConfirm}
            disabled={params.submitting}
          >
            {params.submitting
              ? t("settingsPage.common.verifying")
              : (params.confirmLabel ?? t("settingsPage.common.continue"))}
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
        if (active) {
          setPasswordChangedAt(res.lastChangedAt ?? null);
          setHasPassword(res.hasPassword);
        }
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
    setHiddenPostsVisibleCount(CONTENT_PAGE_SIZE);
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
      setHiddenPostsError(apiErr?.message || t("settingsPage.content.hidden.errors.loadFailed"));
    }

    if (blockedRes.status === "fulfilled") {
      setBlockedUsers(blockedRes.value.items ?? []);
    } else {
      const apiErr = blockedRes.reason as ApiError | undefined;
      setBlockedUsersError(apiErr?.message || t("settingsPage.content.blocked.errors.loadFailed"));
    }

    setHiddenPostsLoading(false);
    setBlockedUsersLoading(false);
  }, [token]);

  const activityFilterOptions = useMemo(
    () => [
      { key: "all" as const, label: t("settingsPage.content.activity.filterAll") },
      { key: "post_like" as const, label: t("settingsPage.content.activity.filterLikePost") },
      { key: "comment_like" as const, label: t("settingsPage.content.activity.filterLikeComment") },
      { key: "comment" as const, label: t("settingsPage.content.activity.filterComment") },
      { key: "repost" as const, label: t("settingsPage.content.activity.filterRepost") },
      { key: "save" as const, label: t("settingsPage.content.activity.filterSave") },
      { key: "follow" as const, label: t("settingsPage.content.activity.filterFollow") },
      { key: "report_post" as const, label: t("settingsPage.content.activity.filterReportPost") },
      { key: "report_user" as const, label: t("settingsPage.content.activity.filterReportUser") },
    ],
    [t],
  );

  const loadActivityLog = useCallback(
    async (mode: "reset" | "more" = "reset") => {
      if (!token) return;
      const isReset = mode === "reset";
      let loadedCount = 0;
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
        loadedCount = items.length;
        setActivityItems((prev) => (isReset ? items : [...prev, ...items]));
        setActivityCursor(res.nextCursor ?? null);
      } catch (err) {
        const apiErr = err as ApiError | undefined;
        setActivityError(apiErr?.message || t("settingsPage.content.activity.errors.loadFailed"));
      } finally {
        if (isReset) setActivityLoading(false);
        else setActivityLoadingMore(false);
      }

      return loadedCount;
    },
    [token, activityFilter, activityCursor],
  );

  const visibleActivityItems = useMemo(
    () => activityItems.slice(0, activityVisibleCount),
    [activityItems, activityVisibleCount],
  );

  const canSeeMoreActivity =
    activityVisibleCount < activityItems.length || Boolean(activityCursor);

  const handleSeeMoreActivity = useCallback(async () => {
    if (activityVisibleCount < activityItems.length) {
      setActivityVisibleCount((prev) => prev + CONTENT_PAGE_SIZE);
      return;
    }
    if (!activityCursor || activityLoadingMore) return;
    const loaded = await loadActivityLog("more");
    if ((loaded ?? 0) > 0) {
      setActivityVisibleCount((prev) => prev + CONTENT_PAGE_SIZE);
    }
  }, [
    activityVisibleCount,
    activityItems.length,
    activityCursor,
    activityLoadingMore,
    loadActivityLog,
  ]);

  const visibleHiddenPosts = useMemo(
    () => hiddenPosts.slice(0, hiddenPostsVisibleCount),
    [hiddenPosts, hiddenPostsVisibleCount],
  );

  const canSeeMoreHiddenPosts = hiddenPostsVisibleCount < hiddenPosts.length;

  const handleSeeMoreHiddenPosts = useCallback(() => {
    setHiddenPostsVisibleCount((prev) => prev + CONTENT_PAGE_SIZE);
  }, []);

  const loadViolationCenter = useCallback(async () => {
    if (!token) return;
    setViolationLoading(true);
    setViolationError(null);
    try {
      const res = await fetchViolationHistory({ token, limit: 100 });
      setViolationItems(res.items ?? []);
      setCurrentStrikeTotal(res.currentStrikeTotal ?? 0);
    } catch (err) {
      const apiErr = err as ApiError | undefined;
      setViolationError(apiErr?.message || "Unable to load violation history.");
    } finally {
      setViolationLoading(false);
    }
  }, [token]);

  const loadCreatorVerificationStatus = useCallback(async () => {
    if (!token) return;
    setCreatorLoading(true);
    setCreatorError(null);
    try {
      const res = await fetchCreatorVerificationStatus({ token });
      setCreatorStatus(res);
    } catch (err) {
      const apiErr = err as ApiError | undefined;
      setCreatorError(
        apiErr?.message || "Unable to load creator verification status.",
      );
    } finally {
      setCreatorLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token || activeKey !== "content") return;
    loadContentSettings();
  }, [token, activeKey, loadContentSettings]);

  useEffect(() => {
    if (!token || activeKey !== "content") return;
    setActivityVisibleCount(CONTENT_PAGE_SIZE);
    loadActivityLog("reset");
  }, [token, activeKey, activityFilter, loadActivityLog]);

  useEffect(() => {
    if (!token || activeKey !== "violations") return;
    loadViolationCenter();
  }, [token, activeKey, loadViolationCenter]);

  useEffect(() => {
    if (!token || activeKey !== "verification") return;
    loadCreatorVerificationStatus();
  }, [token, activeKey, loadCreatorVerificationStatus]);

  useEffect(() => {
    if (activeKey !== "violations") return;
    setViolationNowMs(Date.now());
    const timer = window.setInterval(() => {
      setViolationNowMs(Date.now());
    }, 60000);
    return () => window.clearInterval(timer);
  }, [activeKey]);

  useEffect(() => {
    if (activeKey !== "violations") {
      setSelectedViolation(null);
    }
  }, [activeKey]);

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
      { key: "5m", label: t("settingsPage.notifications.muteOptions.5m"), ms: 5 * 60 * 1000 },
      { key: "10m", label: t("settingsPage.notifications.muteOptions.10m"), ms: 10 * 60 * 1000 },
      { key: "15m", label: t("settingsPage.notifications.muteOptions.15m"), ms: 15 * 60 * 1000 },
      { key: "30m", label: t("settingsPage.notifications.muteOptions.30m"), ms: 30 * 60 * 1000 },
      { key: "1h", label: t("settingsPage.notifications.muteOptions.1h"), ms: 60 * 60 * 1000 },
      { key: "1d", label: t("settingsPage.notifications.muteOptions.1d"), ms: 24 * 60 * 60 * 1000 },
      { key: "until", label: t("settingsPage.notifications.muteOptions.until"), ms: null },
      { key: "custom", label: t("settingsPage.notifications.muteOptions.custom"), ms: null },
    ],
    [t],
  );

  const notificationCategories = useMemo(
    () => [
      {
        key: "follow" as const,
        label: t("settingsPage.notifications.categories.follows"),
        description: t("settingsPage.notifications.categories.followsDesc"),
      },
      {
        key: "comment" as const,
        label: t("settingsPage.notifications.categories.comments"),
        description: t("settingsPage.notifications.categories.commentsDesc"),
      },
      {
        key: "like" as const,
        label: t("settingsPage.notifications.categories.likes"),
        description: t("settingsPage.notifications.categories.likesDesc"),
      },
      {
        key: "mentions" as const,
        label: t("settingsPage.notifications.categories.mentions"),
        description: t("settingsPage.notifications.categories.mentionsDesc"),
      },
      {
        key: "system" as const,
        label: t("settingsPage.notifications.categories.system"),
        description: t("settingsPage.notifications.categories.systemDesc"),
      },
    ],
    [t],
  );

  const notificationStatusLabel = useMemo(() => {
    if (!notificationSettings) return "";
    if (notificationSettings.enabled) return t("settingsPage.notifications.statusEnabled");
    if (notificationSettings.mutedIndefinitely)
      return t("settingsPage.notifications.statusMutedForever");
    if (notificationSettings.mutedUntil) {
      return `${t("settingsPage.notifications.statusMuted")} ${formatDistanceToNow(
        new Date(notificationSettings.mutedUntil),
        { addSuffix: true },
      )}`;
    }
    return t("settingsPage.notifications.statusMuted");
  }, [notificationSettings, t]);

  const getCategoryStatusLabel = useCallback(
    (key: NotificationCategoryKey) => {
      const settings = notificationSettings?.categories?.[key];
      if (!settings) return t("settingsPage.notifications.statusEnabled");
      if (settings.enabled) return t("settingsPage.notifications.statusEnabled");
      if (settings.mutedIndefinitely) return t("settingsPage.notifications.statusMutedForever");
      if (settings.mutedUntil) {
        return `${t("settingsPage.notifications.statusMuted")} ${formatDistanceToNow(new Date(settings.mutedUntil), {
          addSuffix: true,
        })}`;
      }
      return t("settingsPage.notifications.statusMuted");
    },
    [notificationSettings?.categories, t],
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

  const handleSubmitCreatorVerification = async () => {
    if (!token) {
      setCreatorError("You need to sign in to continue.");
      return;
    }
    setCreatorSubmitting(true);
    setCreatorError(null);
    setCreatorSuccess(null);
    try {
      await submitCreatorVerificationRequest({
        token,
        note: creatorNote.trim() || undefined,
      });
      setCreatorNote("");
      setCreatorSuccess("Your creator verification request has been submitted.");
      await loadCreatorVerificationStatus();
    } catch (err) {
      const apiErr = err as ApiError | undefined;
      setCreatorError(
        apiErr?.message || "Unable to submit creator verification request.",
      );
    } finally {
      setCreatorSubmitting(false);
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
          setNotificationCustomError(t("settingsPage.notifications.overlay.invalidDateTime"));
          setNotificationSaving(false);
          return;
        }
        const dt = new Date(iso);
        if (dt.getTime() <= Date.now()) {
          setNotificationCustomError(t("settingsPage.notifications.overlay.futureTimeRequired"));
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
          setCategoryCustomError(t("settingsPage.notifications.overlay.invalidDateTime"));
          setCategorySaving(false);
          return;
        }
        const dt = new Date(iso);
        if (dt.getTime() <= Date.now()) {
          setCategoryCustomError(t("settingsPage.notifications.overlay.futureTimeRequired"));
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
    setPasskeyStep(hasPassword ? "password" : "otp");
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
      { value: "public", label: t("settingsPage.profileVisibility.visibility.public") },
      { value: "followers", label: t("settingsPage.profileVisibility.visibility.followers") },
      { value: "private", label: t("settingsPage.profileVisibility.visibility.private") },
    ],
    [t],
  );

  const visibilityLabelMap = useMemo(
    () =>
      ({
        public: t("settingsPage.profileVisibility.visibility.public"),
        followers: t("settingsPage.profileVisibility.visibility.followers"),
        private: t("settingsPage.profileVisibility.visibility.private"),
      }) satisfies Record<ProfileFieldVisibility, string>,
    [t],
  );

  const getVisibilityLabel = (value?: ProfileFieldVisibility) =>
    visibilityLabelMap[value ?? "public"];

  const languageLabelMap = useMemo(
    () =>
      ({
        vi: tSystem("language.options.vi"),
        en: tSystem("language.options.en"),
        ja: tSystem("language.options.ja"),
        zh: tSystem("language.options.zh"),
      }) satisfies Record<LanguageCode, string>,
    [tSystem],
  );

  const getLanguageLabel = (value: LanguageCode) => languageLabelMap[value];

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
    if (!hasPassword) {
      setStep("current-otp");
    }
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

  useEffect(() => {
    if (!showLoginDevices || !token) return;
    const interval = setInterval(async () => {
      const deviceId =
        typeof window !== "undefined"
          ? window.localStorage.getItem("cordigramDeviceId")
          : null;
      try {
        const res: LoginDevicesResponse = await fetchLoginDevices({ token, deviceId });
        setLoginDevices(res.devices ?? []);
        setLoginDevicesCurrent(res.currentDeviceIdHash ?? null);
      } catch (_err) {}
    }, 30_000);
    return () => clearInterval(interval);
  }, [showLoginDevices, token]);

  const resolveDeviceName = (device: LoginDeviceItem) => {
    if (device.deviceInfo?.trim()) return device.deviceInfo.trim();
    const parts = [device.browser, device.os].filter(Boolean);
    if (parts.length) return parts.join(" on ");
    return device.deviceType ? `${device.deviceType} device` : "Unknown device";
  };

  const resolveDeviceTime = (device: LoginDeviceItem, isCurrent: boolean) => {
    if (isCurrent) return null;
    if (device.isActive) return null;
    const value = device.lastSeenAt ?? device.firstSeenAt ?? null;
    return value ? tDevices("lastActive", { time: formatRelativeTime(value, t("settingsPage.common.lessMin")) }) : null;
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
      if (hasPassword) {
        setPasskeyStep("password");
      } else {
        setShowPasskeyFlow(false);
        resetPasskeyFlow();
      }
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
    if (hasPassword && !passkeyPassword.trim()) {
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
        password: hasPassword ? passkeyPassword : undefined,
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
    if (hasPassword && !passwordCurrent.trim()) {
      setPasswordError("Please enter your current password.");
      return;
    }
    if (!passwordNew.trim()) {
      setPasswordError("Please enter a new password.");
      return;
    }
    if (hasPassword && passwordNew === passwordCurrent) {
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
        currentPassword: hasPassword ? passwordCurrent : undefined,
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
    if (hasPassword && !password.trim()) {
      setError("Please enter your current password.");
      return;
    }
    if (!token) {
      setError("You need to sign in to continue.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await requestChangeEmailCurrentOtp({
        token,
        password: hasPassword ? password : undefined,
      });
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
            <p className={styles.kicker}>{t("settingsPage.title")}</p>
            <h1 className={styles.title}>{t("settingsPage.subtitle")}</h1>
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
                    <span className={styles.itemLabel}>{t(`settingsPage.nav.${section.key}`)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          <section className={styles.panel}>
            {activeKey === "account" ? (
              <>
                <div className={styles.sectionHeader}>
                  <h2 className={styles.sectionTitle}>{t("settingsPage.account.title")}</h2>
                  <p className={styles.sectionDesc}>
                    {t("settingsPage.account.desc")}
                  </p>
                </div>

                {!showChangeEmail ? (
                  <div className={styles.sectionCard}>
                    <div className={styles.emailCard}>
                      <div>
                        <p className={styles.hint}>{t("settingsPage.account.currentEmailLabel")}</p>
                        <p className={styles.emailValue}>
                          {currentEmail ?? t("settingsPage.common.loading")}
                        </p>
                      </div>
                      <button
                        type="button"
                        className={styles.primary}
                        onClick={openChangeEmail}
                      >
                        {t("settingsPage.account.changeEmail")}
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
                        {t("settingsPage.common.back")}
                      </button>
                      <span className={styles.stepBadge}>
                        {step === "password"
                          ? t("settingsPage.account.steps.step1Password")
                          : step === "current-otp"
                            ? hasPassword ? t("settingsPage.account.steps.step2CurrentOtp") : t("settingsPage.account.steps.step1CurrentOtp")
                            : step === "new-email"
                              ? hasPassword ? t("settingsPage.account.steps.step3NewEmail") : t("settingsPage.account.steps.step2NewEmail")
                              : step === "new-otp"
                                ? hasPassword ? t("settingsPage.account.steps.step4NewOtp") : t("settingsPage.account.steps.step3NewOtp")
                                : t("settingsPage.account.steps.completed")}
                      </span>
                    </div>

                    {step === "password" ? (
                      <div className={styles.stepContent} key="password">
                        <div className={styles.form}>
                          <label className={styles.label}>
                            {t("settingsPage.account.passwordLabel")}
                            <div className={styles.inputGroup}>
                              <input
                                className={`${styles.input} ${styles.inputWithIcon}`}
                                type={showEmailPassword ? "text" : "password"}
                                autoComplete="current-password"
                                placeholder={t("settingsPage.account.passwordPlaceholder")}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                              />
                              <EyeToggle
                                show={showEmailPassword}
                                onToggle={() => setShowEmailPassword((p) => !p)}
                              />
                            </div>
                          </label>
                          <p className={styles.hint}>
                            {t("settingsPage.account.sendCurrentOtpHint")}
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
                              {submitting ? t("settingsPage.common.sending") : t("settingsPage.common.sendOtp")}
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {step === "current-otp" ? (
                      <div className={styles.stepContent} key="current-otp">
                        <div className={styles.form}>
                          <label className={styles.label}>
                            {t("settingsPage.account.currentOtpLabel")}
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
                                {t("settingsPage.account.otpExpiresHint")}
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
                                ? t("settingsPage.common.resendCooldown", { seconds: currentCooldown })
                                : t("settingsPage.common.resendOtp")}
                            </button>
                            <button
                              type="button"
                              className={styles.primary}
                              onClick={handleVerifyCurrentOtp}
                              disabled={submitting}
                            >
                              {submitting ? t("settingsPage.common.verifying") : t("settingsPage.common.verify")}
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {step === "new-email" ? (
                      <div className={styles.stepContent} key="new-email">
                        <div className={styles.form}>
                          <label className={styles.label}>
                            {t("settingsPage.account.newEmailLabel")}
                            <input
                              className={styles.input}
                              type="email"
                              placeholder={t("settingsPage.account.newEmailPlaceholder")}
                              value={newEmail}
                              onChange={(e) => setNewEmail(e.target.value)}
                            />
                          </label>
                          <p className={styles.hint}>
                            {t("settingsPage.account.sendNewOtpHint")}
                          </p>
                          <p className={styles.hint}>
                            {t("settingsPage.account.newEmailWarning")}
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
                              {submitting ? t("settingsPage.common.sending") : t("settingsPage.common.sendOtp")}
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {step === "new-otp" ? (
                      <div className={styles.stepContent} key="new-otp">
                        <div className={styles.form}>
                          <label className={styles.label}>
                            {t("settingsPage.account.newOtpLabel")}
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
                                {t("settingsPage.account.otpExpiresHint")}
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
                                ? t("settingsPage.common.resendCooldown", { seconds: newCooldown })
                                : t("settingsPage.common.resendOtp")}
                            </button>
                            <button
                              type="button"
                              className={styles.primary}
                              onClick={handleVerifyNewOtp}
                              disabled={submitting}
                            >
                              {submitting ? t("settingsPage.common.verifying") : t("settingsPage.common.confirm")}
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {step === "done" ? (
                      <div className={styles.stepContent} key="done">
                        <div className={styles.successBox}>
                          {success ?? t("settingsPage.account.emailUpdatedSuccess")}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}

                <div className={styles.sectionRowHeader}>
                  <div>
                    <h3 className={styles.sectionTitle}>{t("settingsPage.personalInfo.title")}</h3>
                    <p className={styles.sectionDesc}>
                      {t("settingsPage.personalInfo.desc")}
                    </p>
                  </div>
                </div>

                <div className={styles.sectionCard}>
                  {profileLoading ? (
                    <p className={styles.hint}>{t("settingsPage.personalInfo.loading")}</p>
                  ) : null}
                  {profileError ? (
                    <p className={styles.error}>{profileError}</p>
                  ) : null}

                  <ul className={styles.infoList}>
                    <li className={styles.infoItem}>
                      <div className={styles.infoText}>
                        <p className={styles.infoTitle}>{t("settingsPage.personalInfo.displayName")}</p>
                        <p className={styles.infoValue}>
                          {profileDetail?.displayName || t("settingsPage.common.notSet")}
                        </p>
                      </div>
                    </li>
                    <li className={styles.infoItem}>
                      <div className={styles.infoText}>
                        <p className={styles.infoTitle}>{t("settingsPage.personalInfo.username")}</p>
                        <p className={styles.infoValue}>
                          @{profileDetail?.username || t("settingsPage.common.notSet")}
                        </p>
                      </div>
                    </li>
                    <li className={styles.infoItem}>
                      <div className={styles.infoText}>
                        <p className={styles.infoTitle}>{t("settingsPage.personalInfo.birthdate")}</p>
                        <p className={styles.infoValue}>
                          {profileDetail?.birthdate || t("settingsPage.common.notSet")}
                        </p>
                      </div>
                      <div className={styles.infoAction}>
                        {renderVisibilityControl(
                          "birthdate",
                          profileDetail?.visibility?.birthdate,
                          !profileDetail || visibilitySaving.birthdate,
                          t("settingsPage.personalInfo.birthdateVisibility"),
                        )}
                      </div>
                    </li>
                    <li className={styles.infoItem}>
                      <div className={styles.infoText}>
                        <p className={styles.infoTitle}>{t("settingsPage.personalInfo.gender")}</p>
                        <p className={styles.infoValue}>
                          {profileDetail?.gender || t("settingsPage.common.notSet")}
                        </p>
                      </div>
                      <div className={styles.infoAction}>
                        {renderVisibilityControl(
                          "gender",
                          profileDetail?.visibility?.gender,
                          !profileDetail || visibilitySaving.gender,
                          t("settingsPage.personalInfo.genderVisibility"),
                        )}
                      </div>
                    </li>
                    <li className={styles.infoItem}>
                      <div className={styles.infoText}>
                        <p className={styles.infoTitle}>{t("settingsPage.personalInfo.location")}</p>
                        <p className={styles.infoValue}>
                          {profileDetail?.location || t("settingsPage.common.notSet")}
                        </p>
                      </div>
                      <div className={styles.infoAction}>
                        {renderVisibilityControl(
                          "location",
                          profileDetail?.visibility?.location,
                          !profileDetail || visibilitySaving.location,
                          t("settingsPage.personalInfo.locationVisibility"),
                        )}
                      </div>
                    </li>
                    <li className={styles.infoItem}>
                      <div className={styles.infoText}>
                        <p className={styles.infoTitle}>{t("settingsPage.personalInfo.workplace")}</p>
                        <p className={styles.infoValue}>
                          {profileDetail?.workplace?.companyName || t("settingsPage.common.notSet")}
                        </p>
                      </div>
                      <div className={styles.infoAction}>
                        {renderVisibilityControl(
                          "workplace",
                          profileDetail?.visibility?.workplace,
                          !profileDetail || visibilitySaving.workplace,
                          t("settingsPage.personalInfo.workplaceVisibility"),
                        )}
                      </div>
                    </li>
                    <li className={styles.infoItem}>
                      <div className={styles.infoText}>
                        <p className={styles.infoTitle}>{t("settingsPage.personalInfo.bio")}</p>
                        <p className={styles.infoValue}>
                          {profileDetail?.bio || t("settingsPage.common.notSet")}
                        </p>
                      </div>
                      <div className={styles.infoAction}>
                        {renderVisibilityControl(
                          "bio",
                          profileDetail?.visibility?.bio,
                          !profileDetail || visibilitySaving.bio,
                          t("settingsPage.personalInfo.bioVisibility"),
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
                      {t("settingsPage.personalInfo.editProfile")}
                    </button>
                  </div>
                </div>
              </>
            ) : activeKey === "profile" ? (
              <>
                <div className={styles.sectionHeader}>
                  <h2 className={styles.sectionTitle}>{t("settingsPage.profileVisibility.title")}</h2>
                  <p className={styles.sectionDesc}>
                    {t("settingsPage.profileVisibility.desc")}
                  </p>
                </div>

                <div className={styles.sectionCard}>
                  <ul className={styles.infoList}>
                    <li className={styles.infoItem}>
                      <div className={styles.infoText}>
                        <p className={styles.infoTitle}>{t("settingsPage.profileVisibility.profilePage")}</p>
                        <p className={styles.infoValue}>
                          {t("settingsPage.profileVisibility.profilePageDesc")}
                        </p>
                      </div>
                      <div className={styles.infoAction}>
                        {renderVisibilityControl(
                          "profile",
                          profileDetail?.visibility?.profile,
                          !profileDetail || visibilitySaving.profile,
                          t("settingsPage.profileVisibility.profileVisibilityAria"),
                        )}
                      </div>
                    </li>
                    <li className={styles.infoItem}>
                      <div className={styles.infoText}>
                        <p className={styles.infoTitle}>{t("settingsPage.profileVisibility.aboutUser")}</p>
                        <p className={styles.infoValue}>
                          {t("settingsPage.profileVisibility.aboutUserDesc")}
                        </p>
                      </div>
                      <div className={styles.infoAction}>
                        {renderVisibilityControl(
                          "about",
                          profileDetail?.visibility?.about,
                          !profileDetail || visibilitySaving.about,
                          t("settingsPage.profileVisibility.aboutVisibilityAria"),
                        )}
                      </div>
                    </li>
                    <li className={styles.infoItem}>
                      <div className={styles.infoText}>
                        <p className={styles.infoTitle}>{t("settingsPage.profileVisibility.followersList")}</p>
                        <p className={styles.infoValue}>
                          {t("settingsPage.profileVisibility.followersListDesc")}
                        </p>
                      </div>
                      <div className={styles.infoAction}>
                        {renderVisibilityControl(
                          "followers",
                          profileDetail?.visibility?.followers,
                          !profileDetail || visibilitySaving.followers,
                          t("settingsPage.profileVisibility.followersVisibilityAria"),
                        )}
                      </div>
                    </li>
                    <li className={styles.infoItem}>
                      <div className={styles.infoText}>
                        <p className={styles.infoTitle}>{t("settingsPage.profileVisibility.followingList")}</p>
                        <p className={styles.infoValue}>
                          {t("settingsPage.profileVisibility.followingListDesc")}
                        </p>
                      </div>
                      <div className={styles.infoAction}>
                        {renderVisibilityControl(
                          "following",
                          profileDetail?.visibility?.following,
                          !profileDetail || visibilitySaving.following,
                          t("settingsPage.profileVisibility.followingVisibilityAria"),
                        )}
                      </div>
                    </li>
                  </ul>

                  {visibilityError ? (
                    <p className={styles.error}>{visibilityError}</p>
                  ) : null}
                </div>
              </>
            ) : activeKey === "verification" ? (
              <>
                <div className={styles.sectionHeader}>
                  <h2 className={styles.sectionTitle}>{t("settingsPage.verification.title")}</h2>
                  <p className={styles.sectionDesc}>
                    {t("settingsPage.verification.desc")}
                  </p>
                </div>

                <div className={styles.sectionCard}>
                  {creatorLoading ? (
                    <p className={styles.hint}>{t("settingsPage.verification.loading")}</p>
                  ) : null}

                  {creatorStatus ? (
                    <>
                      {creatorStatus.account.isCreatorVerified ? (
                        <div className={styles.creatorApprovedPanel}>
                          {creatorStatus.latestRequest ? (
                            <div className={styles.creatorLatestCard}>
                              <div className={styles.creatorLatestHeader}>
                                <p className={styles.infoTitle}>{t("settingsPage.verification.latestRequest")}</p>
                                <span
                                  className={`${styles.creatorStatusPill} ${
                                    styles[
                                      `creatorStatusPill_${getCreatorRequestStatusClassName(
                                        creatorStatus.latestRequest.status,
                                      )}`
                                    ]
                                  }`}
                                >
                                  {creatorStatus.latestRequest.status}
                                </span>
                              </div>
                              {creatorStatus.latestRequest.createdAt ? (
                                <p className={styles.hint}>
                                  Submitted {" "}
                                  {formatRelativeTime(creatorStatus.latestRequest.createdAt, t("settingsPage.common.lessMin"))}
                                </p>
                              ) : null}
                              {creatorStatus.latestRequest.reviewedAt ? (
                                <p className={styles.hint}>
                                  Reviewed {" "}
                                  {formatRelativeTime(
                                    creatorStatus.latestRequest.reviewedAt,
                                    t("settingsPage.common.lessMin"),
                                  )}
                                </p>
                              ) : null}
                            </div>
                          ) : null}
                          <div className={styles.creatorVerifiedNotice}>
                            {t("settingsPage.verification.alreadyVerified")}
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className={styles.verificationScoreCard}>
                            <p className={styles.infoTitle}>{t("settingsPage.verification.creatorScore")}</p>
                            <p className={styles.verificationScoreValue}>
                              {creatorStatus.eligibility.score} /{" "}
                              {creatorStatus.eligibility.minimumScore}
                            </p>
                          </div>

                          <ul className={styles.infoList}>
                            <li className={styles.infoItem}>
                              <div className={styles.infoText}>
                                <p className={styles.infoTitle}>{t("settingsPage.verification.accountAge")}</p>
                                <p className={styles.infoValue}>
                                  {creatorStatus.eligibility.accountAgeDays} days
                                </p>
                              </div>
                              <p className={styles.hint}>
                                {t("settingsPage.verification.minDays", { value: creatorStatus.criteria.minAccountAgeDays })}
                              </p>
                            </li>
                            <li className={styles.infoItem}>
                              <div className={styles.infoText}>
                                <p className={styles.infoTitle}>{t("settingsPage.verification.followers")}</p>
                                <p className={styles.infoValue}>
                                  {creatorStatus.eligibility.followersCount}
                                </p>
                              </div>
                              <p className={styles.hint}>
                                {t("settingsPage.verification.minimum", { value: creatorStatus.criteria.minFollowersCount })}
                              </p>
                            </li>
                            <li className={styles.infoItem}>
                              <div className={styles.infoText}>
                                <p className={styles.infoTitle}>{t("settingsPage.verification.publishedPosts")}</p>
                                <p className={styles.infoValue}>
                                  {creatorStatus.eligibility.postsCount}
                                </p>
                              </div>
                              <p className={styles.hint}>
                                {t("settingsPage.verification.minimum", { value: creatorStatus.criteria.minPostsCount })}
                              </p>
                            </li>
                            <li className={styles.infoItem}>
                              <div className={styles.infoText}>
                                <p className={styles.infoTitle}>{t("settingsPage.verification.activeDays")}</p>
                                <p className={styles.infoValue}>
                                  {creatorStatus.eligibility.activePostingDays30d}
                                </p>
                              </div>
                              <p className={styles.hint}>
                                {t("settingsPage.verification.minimum", { value: creatorStatus.criteria.minActivePostingDays30d })}
                              </p>
                            </li>
                            <li className={styles.infoItem}>
                              <div className={styles.infoText}>
                                <p className={styles.infoTitle}>{t("settingsPage.verification.avgEngagement")}</p>
                                <p className={styles.infoValue}>
                                  {creatorStatus.eligibility.engagementPerPost30d}
                                </p>
                              </div>
                              <p className={styles.hint}>
                                {t("settingsPage.verification.minimum", { value: creatorStatus.criteria.minEngagementPerPost30d })}
                              </p>
                            </li>
                            <li className={styles.infoItem}>
                              <div className={styles.infoText}>
                                <p className={styles.infoTitle}>{t("settingsPage.verification.recentViolations")}</p>
                                <p className={styles.infoValue}>
                                  {creatorStatus.eligibility.recentViolations90d}
                                </p>
                              </div>
                              <p className={styles.hint}>
                                {t("settingsPage.verification.maximum", { value: creatorStatus.criteria.maxRecentViolations90d })}
                              </p>
                            </li>
                          </ul>

                          {creatorStatus.eligibility.failedRequirements.length ? (
                            <p className={styles.error}>
                              {t("settingsPage.verification.missingReqs")}: {" "}
                              {creatorStatus.eligibility.failedRequirements
                                .map(formatRequirementLabel)
                                .join(", ")}
                            </p>
                          ) : null}

                          {creatorStatus.latestRequest ? (
                            <div className={styles.verificationStatusCard}>
                              <p className={styles.infoTitle}>{t("settingsPage.verification.latestRequest")}</p>
                              <p className={styles.infoValue}>
                                {t("settingsPage.verification.statusLabel", { value: creatorStatus.latestRequest.status })}
                              </p>
                              {creatorStatus.latestRequest.createdAt ? (
                                <p className={styles.hint}>
                                  Submitted {" "}
                                  {formatRelativeTime(creatorStatus.latestRequest.createdAt, t("settingsPage.common.lessMin"))}
                                </p>
                              ) : null}
                              {creatorStatus.latestRequest.reviewedAt ? (
                                <p className={styles.hint}>
                                  Reviewed {" "}
                                  {formatRelativeTime(
                                    creatorStatus.latestRequest.reviewedAt,
                                    t("settingsPage.common.lessMin"),
                                  )}
                                </p>
                              ) : null}
                              {creatorStatus.latestRequest.decisionReason ? (
                                <p className={styles.hint}>
                                  Reason: {creatorStatus.latestRequest.decisionReason}
                                </p>
                              ) : null}
                              {creatorStatus.latestRequest.cooldownUntil ? (
                                <p className={styles.hint}>
                                  You can request again {" "}
                                  {formatRelativeTime(
                                    creatorStatus.latestRequest.cooldownUntil,
                                    t("settingsPage.common.lessMin"),
                                  )}
                                </p>
                              ) : null}
                            </div>
                          ) : null}

                        <div className={styles.form}>
                          <label className={styles.label}>
                            Request note (optional)
                            <textarea
                              className={`${styles.input} ${styles.textarea}`}
                              rows={4}
                              placeholder="Share details that help admin understand your creator journey."
                              value={creatorNote}
                              onChange={(event) =>
                                setCreatorNote(event.target.value)
                              }
                            />
                          </label>
                          {creatorError ? (
                            <p className={styles.error}>{creatorError}</p>
                          ) : null}
                          {creatorSuccess ? (
                            <p className={styles.successBox}>{creatorSuccess}</p>
                          ) : null}
                          <div className={styles.actions}>
                            <button
                              type="button"
                              className={styles.secondary}
                              onClick={loadCreatorVerificationStatus}
                              disabled={creatorLoading || creatorSubmitting}
                            >
                              {t("settingsPage.verification.refreshStatus")}
                            </button>
                            <button
                              type="button"
                              className={styles.primary}
                              onClick={handleSubmitCreatorVerification}
                              disabled={
                                creatorSubmitting ||
                                creatorLoading ||
                                !creatorStatus.canRequest
                              }
                            >
                              {creatorSubmitting
                                ? t("settingsPage.common.submitting")
                                : t("settingsPage.verification.submit")}
                            </button>
                          </div>
                        </div>
                        </>
                      )}
                    </>
                  ) : null}

                  {creatorError && !creatorStatus ? (
                    <p className={styles.error}>{creatorError}</p>
                  ) : null}
                </div>
              </>
            ) : activeKey === "privacy" ? (
              <>
                <div className={styles.sectionHeader}>
                  <h2 className={styles.sectionTitle}>{t("settingsPage.privacy.title")}</h2>
                  <p className={styles.sectionDesc}>
                    {t("settingsPage.privacy.desc")}
                  </p>
                </div>

                <div className={styles.sectionCard}>
                  {!showChangePassword ? (
                    <div className={styles.sectionRowHeader}>
                      <div>
                        <h3 className={styles.sectionTitleSmall}>
                          {t("settingsPage.privacy.password.changePassword")}
                        </h3>
                        <p className={styles.sectionDesc}>
                          {passwordStatusLoading
                            ? t("settingsPage.common.loading")
                            : passwordChangedAt
                              ? `Last changed ${formatRelativeTime(passwordChangedAt, t("settingsPage.common.lessMin"))}.`
                              : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        className={styles.primary}
                        onClick={openChangePassword}
                      >
                        {t("settingsPage.privacy.password.changePassword")}
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
                          {t("settingsPage.common.back")}
                        </button>
                        <span className={styles.stepBadge}>
                          {passwordStep === "otp"
                            ? t("settingsPage.privacy.password.steps.step1Otp")
                            : passwordStep === "form"
                              ? hasPassword ? t("settingsPage.privacy.password.steps.step2Change") : t("settingsPage.privacy.password.steps.step2Set")
                              : t("settingsPage.privacy.password.steps.completed")}
                        </span>
                      </div>

                      {passwordStep === "otp"
                        ? renderOtpStep({
                            label: t("settingsPage.privacy.password.otpLabel"),
                            value: passwordOtp,
                            onChange: setPasswordOtp,
                            hint: t("settingsPage.privacy.password.otpHint"),
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
                            {hasPassword ? (
                              <label className={styles.label}>
                                {t("settingsPage.privacy.password.currentPasswordLabel")}
                                <div className={styles.inputGroup}>
                                  <input
                                    className={`${styles.input} ${styles.inputWithIcon}`}
                                    type={showPasswordCurrent ? "text" : "password"}
                                    autoComplete="current-password"
                                    placeholder={t("settingsPage.privacy.password.currentPasswordPlaceholder")}
                                    value={passwordCurrent}
                                    onChange={(e) =>
                                      setPasswordCurrent(e.target.value)
                                    }
                                  />
                                  <EyeToggle
                                    show={showPasswordCurrent}
                                    onToggle={() => setShowPasswordCurrent((p) => !p)}
                                  />
                                </div>
                              </label>
                            ) : null}
                            <label className={styles.label}>
                              {t("settingsPage.privacy.password.newPasswordLabel")}
                              <div className={styles.inputGroup}>
                                <input
                                  className={`${styles.input} ${styles.inputWithIcon}`}
                                  type={showPasswordNew ? "text" : "password"}
                                  autoComplete="new-password"
                                  placeholder={t("settingsPage.privacy.password.newPasswordPlaceholder")}
                                  value={passwordNew}
                                  onChange={(e) => setPasswordNew(e.target.value)}
                                />
                                <EyeToggle
                                  show={showPasswordNew}
                                  onToggle={() => setShowPasswordNew((p) => !p)}
                                />
                              </div>
                            </label>
                            <label className={styles.label}>
                              {t("settingsPage.privacy.password.confirmPasswordLabel")}
                              <div className={styles.inputGroup}>
                                <input
                                  className={`${styles.input} ${styles.inputWithIcon}`}
                                  type={showPasswordConfirm ? "text" : "password"}
                                  autoComplete="new-password"
                                  placeholder={t("settingsPage.privacy.password.confirmPasswordPlaceholder")}
                                  value={passwordConfirm}
                                  onChange={(e) =>
                                    setPasswordConfirm(e.target.value)
                                  }
                                />
                                <EyeToggle
                                  show={showPasswordConfirm}
                                  onToggle={() => setShowPasswordConfirm((p) => !p)}
                                />
                              </div>
                            </label>
                            <p className={styles.hint}>
                              {t("settingsPage.privacy.password.requirement")}
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
                                  ? t("settingsPage.common.updating")
                                  : t("settingsPage.privacy.password.changePassword")}
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : null}

                      {passwordStep === "done" ? (
                        <div className={styles.stepContent} key="pw-done">
                          <div className={styles.successBox}>
                            {passwordSuccess ??
                              t("settingsPage.privacy.password.updated")}
                          </div>
                          {passwordLogoutPrompt ? (
                            <div className={styles.form}>
                              <p className={styles.hint}>
                                {t("settingsPage.privacy.password.logoutPrompt.question")}
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
                                  {t("settingsPage.privacy.password.logoutPrompt.no")}
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
                                    ? t("settingsPage.common.loading")
                                    : t("settingsPage.privacy.password.logoutPrompt.yes")}
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
                          {t("settingsPage.privacy.twoFactor.title")}
                        </h3>
                        <p className={styles.sectionDesc}>
                          {t("settingsPage.privacy.twoFactor.desc")}
                        </p>
                      </div>
                      <button
                        type="button"
                        className={styles.primary}
                        onClick={() => openTwoFactorFlow(!twoFactorEnabled)}
                        disabled={twoFactorLoading}
                      >
                        {twoFactorLoading
                          ? t("settingsPage.common.loading")
                          : twoFactorEnabled
                            ? t("settingsPage.common.disable")
                            : t("settingsPage.common.enable")}
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
                          {t("settingsPage.common.back")}
                        </button>
                        <span className={styles.stepBadge}>
                          {twoFactorStep === "otp"
                            ? t("settingsPage.privacy.twoFactor.steps.step1Otp")
                            : t("settingsPage.privacy.twoFactor.steps.completed")}
                        </span>
                      </div>

                      {twoFactorStep === "otp"
                        ? renderOtpStep({
                            label: t("settingsPage.privacy.twoFactor.steps.step1Otp"),
                            value: twoFactorOtp,
                            onChange: setTwoFactorOtp,
                            hint: t("settingsPage.privacy.passkey.sendOtpHint"),
                            expiresSec: twoFactorExpiresSec,
                            error: twoFactorError,
                            submitting: twoFactorSubmitting,
                            cooldown: twoFactorCooldown,
                            onResend: () =>
                              handleRequestTwoFactorOtp(twoFactorTarget),
                            onConfirm: handleVerifyTwoFactorOtp,
                            confirmLabel: twoFactorTarget
                              ? t("settingsPage.common.enable")
                              : t("settingsPage.common.disable"),
                          })
                        : null}

                      {twoFactorStep === "done" ? (
                        <div className={styles.stepContent}>
                          <div className={styles.successBox}>
                            {twoFactorSuccess ?? t("settingsPage.privacy.twoFactor.steps.completed")}
                          </div>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>

                <div className={styles.sectionCard}>
                  <div className={styles.sectionRowHeader}>
                    <div>
                      <h3 className={styles.sectionTitleSmall}>{t("settingsPage.privacy.passkey.title")}</h3>
                      <p className={styles.sectionDesc}>
                        {t("settingsPage.privacy.passkey.desc")}
                      </p>
                      {hasPasskey ? (
                        <p className={styles.hint}>
                          {passkeyEnabled
                            ? t("settingsPage.privacy.passkey.statusEnabled")
                            : t("settingsPage.privacy.passkey.statusDisabled")}
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
                              ? t("settingsPage.common.updating")
                              : passkeyEnabled
                                ? t("settingsPage.common.disable")
                                : t("settingsPage.common.enable")}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className={styles.primary}
                          onClick={openPasskeyFlow}
                          disabled={passkeyStatusLoading}
                        >
                          {passkeyStatusLoading
                            ? t("settingsPage.common.loading")
                            : hasPasskey
                              ? t("settingsPage.privacy.passkey.changePasskey")
                              : t("settingsPage.privacy.passkey.setPasskey")}
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
                          {t("settingsPage.common.back")}
                        </button>
                        <span className={styles.stepBadge}>
                          {passkeyStep === "password"
                            ? t("settingsPage.privacy.passkey.steps.step1Password")
                            : passkeyStep === "otp"
                              ? hasPassword ? t("settingsPage.privacy.passkey.steps.step2Otp") : t("settingsPage.privacy.passkey.steps.step1Otp")
                              : passkeyStep === "form"
                                ? hasPasskey
                                  ? hasPassword ? t("settingsPage.privacy.passkey.steps.step3Change") : t("settingsPage.privacy.passkey.steps.step2Change")
                                  : hasPassword ? t("settingsPage.privacy.passkey.steps.step3Set") : t("settingsPage.privacy.passkey.steps.step2Set")
                                : t("settingsPage.privacy.passkey.steps.completed")}
                        </span>
                      </div>

                      {passkeyStep === "password" ? (
                        <div className={styles.stepContent}>
                          <div className={styles.form}>
                            <label className={styles.label}>
                              {t("settingsPage.privacy.passkey.passwordLabel")}
                              <div className={styles.inputGroup}>
                                <input
                                  className={`${styles.input} ${styles.inputWithIcon}`}
                                  type={showPasskeyPassword ? "text" : "password"}
                                  autoComplete="current-password"
                                  placeholder={t("settingsPage.privacy.passkey.passwordPlaceholder")}
                                  value={passkeyPassword}
                                  onChange={(e) =>
                                    setPasskeyPassword(e.target.value)
                                  }
                                />
                                <EyeToggle
                                  show={showPasskeyPassword}
                                  onToggle={() => setShowPasskeyPassword((p) => !p)}
                                />
                              </div>
                            </label>
                            <p className={styles.hint}>
                              {t("settingsPage.privacy.passkey.sendOtpHint")}
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
                                {passkeySubmitting ? t("settingsPage.common.sending") : t("settingsPage.common.sendOtp")}
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : null}

                      {passkeyStep === "otp"
                        ? renderOtpStep({
                            label: t("settingsPage.privacy.passkey.otpLabel"),
                            value: passkeyOtp,
                            onChange: setPasskeyOtp,
                            hint: t("settingsPage.privacy.passkey.otpHint"),
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
                                {t("settingsPage.privacy.passkey.currentPasskeyLabel")}
                                <div className={styles.inputGroup}>
                                  <input
                                    className={`${styles.input} ${styles.inputWithIcon}`}
                                    type={
                                      showCurrentPasskey ? "text" : "password"
                                    }
                                    value={passkeyCurrent}
                                    readOnly
                                  />
                                  <EyeToggle
                                    show={showCurrentPasskey}
                                    onToggle={() => setShowCurrentPasskey((p) => !p)}
                                  />
                                </div>
                              </label>
                            ) : null}
                            <label className={styles.label}>
                              {t("settingsPage.privacy.passkey.newPasskeyLabel")}
                              <div className={styles.inputGroup}>
                                <input
                                  className={`${styles.input} ${styles.inputWithIcon}`}
                                  type={showPasskeyNew ? "text" : "password"}
                                  inputMode="numeric"
                                  maxLength={6}
                                  placeholder={t("settingsPage.privacy.passkey.newPasskeyPlaceholder")}
                                  value={passkeyNew}
                                  onChange={(e) =>
                                    setPasskeyNew(
                                      normalizeDigits(e.target.value, 6),
                                    )
                                  }
                                />
                                <EyeToggle
                                  show={showPasskeyNew}
                                  onToggle={() => setShowPasskeyNew((p) => !p)}
                                />
                              </div>
                            </label>
                            <label className={styles.label}>
                              {t("settingsPage.privacy.passkey.confirmPasskeyLabel")}
                              <div className={styles.inputGroup}>
                                <input
                                  className={`${styles.input} ${styles.inputWithIcon}`}
                                  type={showPasskeyConfirm ? "text" : "password"}
                                  inputMode="numeric"
                                  maxLength={6}
                                  placeholder={t("settingsPage.privacy.passkey.confirmPasskeyPlaceholder")}
                                  value={passkeyConfirm}
                                  onChange={(e) =>
                                    setPasskeyConfirm(
                                      normalizeDigits(e.target.value, 6),
                                    )
                                  }
                                />
                                <EyeToggle
                                  show={showPasskeyConfirm}
                                  onToggle={() => setShowPasskeyConfirm((p) => !p)}
                                />
                              </div>
                            </label>
                            <p className={styles.hint}>
                              {t("settingsPage.privacy.passkey.requirement")}
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
                                {passkeySubmitting ? t("settingsPage.common.saving") : t("settingsPage.common.save")}
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : null}

                      {passkeyStep === "done" ? (
                        <div className={styles.stepContent}>
                          <div className={styles.successBox}>
                            {passkeySuccess ?? t("settingsPage.privacy.passkey.updated")}
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
                        {t("settingsPage.privacy.devices.overlayTitle")}
                      </h3>
                      <p className={styles.sectionDesc}>
                        {t("settingsPage.privacy.devices.overlaySubtitle")}
                      </p>
                    </div>
                    <button
                      type="button"
                      className={styles.primary}
                      onClick={openLoginDevices}
                    >
                      {t("settingsPage.privacy.devices.viewDevices")}
                    </button>
                  </div>
                </div>
              </>
            ) : activeKey === "notifications" ? (
              <>
                <div className={styles.sectionHeader}>
                  <h2 className={styles.sectionTitle}>{t("settingsPage.notifications.title")}</h2>
                  <p className={styles.sectionDesc}>
                    {t("settingsPage.notifications.desc")}
                  </p>
                </div>

                <div className={styles.sectionCard}>
                  <div className={styles.notificationRow}>
                    <div className={styles.notificationMeta}>
                      <p className={styles.infoTitle}>{t("settingsPage.notifications.title")}</p>
                      <p className={styles.infoValue}>
                        {notificationLoading
                          ? t("settingsPage.common.loading")
                          : notificationStatusLabel || t("settingsPage.notifications.statusEnabled")}
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
                          {t("settingsPage.notifications.muteBtn")}
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            className={styles.secondary}
                            onClick={openNotificationOverlay}
                            disabled={notificationSaving}
                          >
                            {t("settingsPage.notifications.editBtn")}
                          </button>
                          <button
                            type="button"
                            className={styles.primary}
                            onClick={handleEnableNotifications}
                            disabled={notificationSaving}
                          >
                            {t("settingsPage.notifications.enableBtn")}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <p className={styles.hint}>
                    {t("settingsPage.notifications.mutedDesc")}
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
                              {t("settingsPage.notifications.muteBtn")}
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
                                {t("settingsPage.notifications.editBtn")}
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
                                {t("settingsPage.notifications.enableBtn")}
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
                  <h2 className={styles.sectionTitle}>{t("settingsPage.content.title")}</h2>
                  <p className={styles.sectionDesc}>
                    {t("settingsPage.content.desc")}
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
                      <h3 className={styles.sectionTitleSmall}>{t("settingsPage.content.activity.title")}</h3>
                      <p className={styles.sectionDesc}>
                        {t("settingsPage.content.activity.desc")}
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
                      <p className={styles.hint}>{t("settingsPage.content.activity.loading")}</p>
                    ) : null}
                    {activityError ? (
                      <p className={styles.error}>{activityError}</p>
                    ) : null}

                    {activityItems.length ? (
                      <div className={styles.activityList}>
                        {visibleActivityItems.map((item) => {
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
                              ? t("settingsPage.content.activity.likedPost", { name: authorName })
                              : item.type === "comment_like"
                                ? t("settingsPage.content.activity.likedComment")
                                : item.type === "comment"
                                  ? t("settingsPage.content.activity.commentedOn", { name: authorName })
                                  : item.type === "repost"
                                    ? t("settingsPage.content.activity.reposted", { name: authorName })
                                    : item.type === "save"
                                      ? t("settingsPage.content.activity.saved", { name: authorName })
                                      : item.type === "follow"
                                        ? t("settingsPage.content.activity.followed", { name: targetName })
                                        : item.type === "report_post"
                                          ? t("settingsPage.content.activity.reportedPost", { name: authorName })
                                          : t("settingsPage.content.activity.reportedUser", { name: targetName });

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
                                      : null}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : !activityLoading ? (
                      <p className={styles.hint}>{t("settingsPage.content.activity.noActivity")}</p>
                    ) : null}

                    {canSeeMoreActivity ? (
                      <div className={styles.activityFooter}>
                        <button
                          type="button"
                          className={styles.secondary}
                          onClick={handleSeeMoreActivity}
                          disabled={activityLoadingMore}
                        >
                          {activityLoadingMore ? t("settingsPage.content.activity.loadingMore") : t("settingsPage.content.activity.seeMore")}
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
                      <h3 className={styles.sectionTitleSmall}>{t("settingsPage.content.hidden.title")}</h3>
                      <p className={styles.sectionDesc}>
                        {t("settingsPage.content.hidden.desc")}
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
                        {t("settingsPage.content.hidden.refreshBtn")}
                      </button>
                    </div>

                    {hiddenPostsLoading ? (
                      <p className={styles.hint}>{t("settingsPage.content.hidden.loading")}</p>
                    ) : null}
                    {hiddenPostsError ? (
                      <p className={styles.error}>{hiddenPostsError}</p>
                    ) : null}

                    {hiddenPosts.length ? (
                      <div className={styles.contentList}>
                        {visibleHiddenPosts.map((post) => {
                          const authorName =
                            post.authorDisplayName ||
                            post.authorUsername ||
                            "Unknown";
                          const authorHandle = post.authorUsername
                            ? `@${post.authorUsername}`
                            : "Unknown";
                          const isAdPost = Boolean((post as any).sponsored) || Boolean((post as any).kind === "ad");
                          const cleanContent = post.content
                            ?.replace(/\[\[\/?\w[\w_]*\]\]/g, "")
                            .replace(/\s+/g, " ")
                            .trim();
                          const caption = isAdPost && !cleanContent
                            ? t("settingsPage.content.hidden.sponsoredPost")
                            : (cleanContent || t("settingsPage.content.hidden.noCaption"));
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
                                    ? t("settingsPage.content.hidden.unhiding")
                                    : t("settingsPage.content.hidden.unhide")}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : !hiddenPostsLoading ? (
                      <p className={styles.hint}>{t("settingsPage.content.hidden.noHidden")}</p>
                    ) : null}

                    {canSeeMoreHiddenPosts ? (
                      <div className={styles.activityFooter}>
                        <button
                          type="button"
                          className={styles.secondary}
                          onClick={handleSeeMoreHiddenPosts}
                        >
                          {t("settingsPage.common.seeMore")}
                        </button>
                      </div>
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
                        {t("settingsPage.content.blocked.title")}
                      </h3>
                      <p className={styles.sectionDesc}>
                        {t("settingsPage.content.blocked.desc")}
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
                      <p className={styles.hint}>{t("settingsPage.content.blocked.loading")}</p>
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
                                    ? t("settingsPage.content.blocked.unblocking")
                                    : t("settingsPage.content.blocked.unblock")}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : !blockedUsersLoading ? (
                      <p className={styles.hint}>{t("settingsPage.content.blocked.noBlocked")}</p>
                    ) : null}
                  </div>
                </div>
              </>
            ) : activeKey === "violations" ? (
              <>
                <div className={styles.sectionHeader}>
                  <h2 className={styles.sectionTitle}>{t("settingsPage.violations.title")}</h2>
                  <p className={styles.sectionDesc}>
                    {t("settingsPage.violations.desc")}
                  </p>
                </div>

                <div className={styles.sectionCard}>
                  <div className={styles.notificationRow}>
                    <div className={styles.notificationMeta}>
                      <p className={styles.infoTitle}>{t("settingsPage.violations.currentStrikes")}</p>
                      <p className={styles.infoValue}>{currentStrikeTotal}</p>
                    </div>
                    <div className={styles.notificationActions}>
                      <button
                        type="button"
                        className={styles.secondary}
                        onClick={loadViolationCenter}
                        disabled={violationLoading}
                      >
                        {violationLoading ? t("settingsPage.violations.refreshing") : t("settingsPage.violations.refreshBtn")}
                      </button>
                    </div>
                  </div>
                </div>

                <div className={styles.sectionCard}>
                  {violationLoading ? (
                    <p className={styles.hint}>{t("settingsPage.violations.loading")}</p>
                  ) : null}
                  {violationError ? (
                    <p className={styles.error}>{violationError}</p>
                  ) : null}

                  {violationItems.length ? (
                    <div className={styles.activityList}>
                      {violationItems.map((item) => {
                        const timeLabel = item.createdAt
                          ? formatDistanceToNow(new Date(item.createdAt), {
                              addSuffix: true,
                            })
                          : "";
                        const isWarn = isWarnAction(item.action);
                        const canOpenDetail = item.targetType !== "user";
                        const isMuteInteraction =
                          item.action === "mute_interaction";
                        const remainingMute = isMuteInteraction
                          ? formatRemainingHourMinute(
                              item.actionExpiresAt,
                              violationNowMs,
                            )
                          : null;
                        return (
                          <div
                            key={item.id}
                            className={`${styles.activityRow} ${
                              canOpenDetail ? styles.activityRowClickable : ""
                            }`}
                            role={canOpenDetail ? "button" : undefined}
                            tabIndex={canOpenDetail ? 0 : -1}
                            onClick={() => {
                              if (!canOpenDetail) return;
                              setSelectedViolation(item);
                            }}
                            onKeyDown={(event) => {
                              if (!canOpenDetail) return;
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                setSelectedViolation(item);
                              }
                            }}
                          >
                            <div className={styles.activityIcon}>
                              <IconReport />
                            </div>
                            <div className={styles.activityBody}>
                              <div className={styles.activityHeader}>
                                <p className={styles.activityTitle}>
                                  {(() => {
                                    const actionKeyMap: Record<string, string> = {
                                      remove_post: "removePost",
                                      restrict_post: "restrictPost",
                                      delete_comment: "deleteComment",
                                      warn: "warnUser",
                                      warn_user: "warnUser",
                                      mute_interaction: "muteInteraction",
                                      suspend_user: "suspendUser",
                                      limit_account: "limitAccount",
                                    };
                                    const key = actionKeyMap[item.action] ?? "policyAction";
                                    return t(`settingsPage.violations.actions.${key}`);
                                  })()} ·{" "}
                                  {item.targetType.toUpperCase()}
                                </p>
                                <span className={styles.activityTime}>
                                  {timeLabel}
                                </span>
                              </div>
                              <p className={styles.activitySubtitle}>
                                {isMuteInteraction
                                  ? `${t("settingsPage.violations.interactionMuted")}${
                                      remainingMute
                                        ? ` · Remaining ${remainingMute}`
                                        : ` · ${t("settingsPage.violations.untilTurnOn")}`
                                    }`
                                  : `Severity ${t(`settingsPage.violations.severity.${item.severity ?? "na"}`)} · ${
                                      isWarn
                                        ? "No strike added"
                                        : `Strike ${item.strikeDelta > 0 ? "+" : ""}${item.strikeDelta} (Total ${item.strikeTotalAfter})`
                                    }`}
                              </p>
                              <p className={styles.contentSub}>
                                Reason: {item.reason}
                              </p>
                              {canOpenDetail ? (
                                <p className={styles.hint}>
                                  {t("settingsPage.violations.detail.violatedContent")}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : !violationLoading ? (
                    <p className={styles.hint}>{t("settingsPage.violations.noViolations")}</p>
                  ) : null}
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
                            {SUPPORTED_LANGUAGE_CODES.map((value) => (
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
                <h2 className={styles.sectionTitle}>{t("settingsPage.common.comingSoon")}</h2>
                <p className={styles.sectionDesc}>
                  {t("settingsPage.common.comingSoonDesc")}
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
                <p className={styles.kicker}>{t("settingsPage.notifications.title")}</p>
                <h2 className={styles.overlayTitle}>{t("settingsPage.notifications.overlay.muteTitle")}</h2>
              </div>
              <div className={styles.overlayActions}>
                <button
                  type="button"
                  className={styles.closeButton}
                  onClick={() => setNotificationOverlayOpen(false)}
                  aria-label={t("settingsPage.notifications.overlay.closeAria")}
                >
                  Ã—
                </button>
              </div>
            </div>

            <p className={styles.sectionDesc}>
              {t("settingsPage.notifications.overlay.chooseHowLong")}
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
                  <label className={styles.label}>{t("settingsPage.notifications.overlay.dateLabel")}</label>
                  <DateSelect
                    value={notificationCustomDate}
                    onChange={setNotificationCustomDate}
                    minDate={new Date()}
                    maxDate={null}
                    placeholder={t("settingsPage.notifications.overlay.datePlaceholder")}
                  />
                </div>
                <div className={styles.notificationPicker}>
                  <label className={styles.label}>{t("settingsPage.notifications.overlay.timeLabel")}</label>
                  <TimeSelect
                    value={notificationCustomTime}
                    onChange={setNotificationCustomTime}
                    selectedDate={notificationCustomDate}
                    minDateTime={new Date()}
                    disabled={!notificationCustomDate}
                    placeholder={t("settingsPage.notifications.overlay.timePlaceholder")}
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
                {t("settingsPage.common.cancel")}
              </button>
              <button
                type="button"
                className={styles.primary}
                onClick={handleSaveNotificationMute}
                disabled={notificationSaving}
              >
                {notificationSaving ? t("settingsPage.common.saving") : t("settingsPage.common.save")}
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
                <p className={styles.kicker}>{t("settingsPage.notifications.title")}</p>
                <h2 className={styles.overlayTitle}>
                  {t("settingsPage.notifications.overlay.categoryMuteTitle", { category: categoryKey ?? "" })}
                </h2>
              </div>
              <div className={styles.overlayActions}>
                <button
                  type="button"
                  className={styles.closeButton}
                  onClick={() => setCategoryOverlayOpen(false)}
                  aria-label={t("settingsPage.notifications.overlay.closeAria")}
                  disabled={categorySaving}
                >
                  Ã—
                </button>
              </div>
            </div>

            <p className={styles.sectionDesc}>
              {t("settingsPage.notifications.overlay.chooseHowLongCategory")}
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
                  <label className={styles.label}>{t("settingsPage.notifications.overlay.dateLabel")}</label>
                  <DateSelect
                    value={categoryCustomDate}
                    onChange={setCategoryCustomDate}
                    minDate={new Date()}
                    maxDate={null}
                    placeholder={t("settingsPage.notifications.overlay.datePlaceholder")}
                  />
                </div>
                <div className={styles.notificationPicker}>
                  <label className={styles.label}>{t("settingsPage.notifications.overlay.timeLabel")}</label>
                  <TimeSelect
                    value={categoryCustomTime}
                    onChange={setCategoryCustomTime}
                    selectedDate={categoryCustomDate}
                    minDateTime={new Date()}
                    disabled={!categoryCustomDate}
                    placeholder={t("settingsPage.notifications.overlay.timePlaceholder")}
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
                {t("settingsPage.common.cancel")}
              </button>
              <button
                type="button"
                className={styles.primary}
                onClick={handleSaveCategoryMute}
                disabled={categorySaving}
              >
                {categorySaving ? t("settingsPage.common.saving") : t("settingsPage.common.save")}
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
                <p className={styles.kicker}>{t("settingsPage.privacy.devices.overlayTitle")}</p>
                <h2 className={styles.overlayTitle}>{t("settingsPage.privacy.devices.overlaySubtitle")}</h2>
              </div>
              <div className={styles.overlayActions}>
                <button
                  type="button"
                  className={styles.closeButton}
                  onClick={() => setShowLoginDevices(false)}
                  aria-label={t("settingsPage.privacy.devices.overlayClose")}
                >
                  Ã—
                </button>
              </div>
            </div>

            {loginDevicesLoading ? (
              <p className={styles.hint}>{t("settingsPage.privacy.devices.loading")}</p>
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
                            {device.deviceType?.toLowerCase() === "mobile" ? (
                              <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true">
                                <path d="M15.5 2h-7A2.5 2.5 0 0 0 6 4.5v15A2.5 2.5 0 0 0 8.5 22h7a2.5 2.5 0 0 0 2.5-2.5v-15A2.5 2.5 0 0 0 15.5 2ZM12 21a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm4-4H8V5h8Z" />
                              </svg>
                            ) : device.deviceType?.toLowerCase() === "tablet" ? (
                              <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true">
                                <path d="M18.5 2h-13A2.5 2.5 0 0 0 3 4.5v15A2.5 2.5 0 0 0 5.5 22h13a2.5 2.5 0 0 0 2.5-2.5v-15A2.5 2.5 0 0 0 18.5 2ZM12 21a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm5-4H7V5h10Z" />
                              </svg>
                            ) : (
                              <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true">
                                <path d="M20 3H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h6v2H7v2h10v-2h-3v-2h6a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2Zm0 13H4V5h16Z" />
                              </svg>
                            )}
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
                            {(() => {
                              const timeLabel = resolveDeviceTime(device, isCurrent);
                              return timeLabel ? (
                                <p className={styles.deviceMeta}>{timeLabel}</p>
                              ) : null;
                            })()}
                            <div className={styles.deviceBadgeRow}>
                              {isCurrent ? (
                                <span className={styles.deviceBadge}>
                                  {tDevices("thisDevice")}
                                </span>
                              ) : null}
                              {!isCurrent && device.isActive ? (
                                <span className={styles.deviceBadgeOnline}>
                                  {tDevices("activeNow")}
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
                                  {t("settingsPage.privacy.devices.logOut")}
                                </button>
                              ) : null}
                            </div>
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
                    {t("settingsPage.privacy.devices.logOutAll")}
                  </button>
                </div>
              </>
            ) : loginDevicesLoading ? null : (
              <p className={styles.hint}>{t("settingsPage.privacy.devices.noDevices")}</p>
            )}
          </div>
        </div>
      ) : null}

      {selectedViolation && selectedViolation.targetType !== "user" ? (
        <div className={styles.overlayBackdrop}>
          <div
            className={`${styles.overlayCard} ${styles.violationDetailCard}`}
            role="dialog"
            aria-modal="true"
          >
            <div className={styles.overlayHeader}>
              <div>
                <p className={styles.kicker}>{t("settingsPage.violations.title")}</p>
                <h2 className={styles.overlayTitle}>{t("settingsPage.violations.detail.title")}</h2>
              </div>
              <div className={styles.overlayActions}>
                <button
                  type="button"
                  className={styles.closeButton}
                  onClick={() => setSelectedViolation(null)}
                  aria-label={t("settingsPage.violations.detail.closeAria")}
                >
                  Ã—
                </button>
              </div>
            </div>

            <div className={styles.violationContentBlock}>
              {selectedViolation.targetType === "comment" ? (
                <p className={styles.hint}>{t("settingsPage.violations.detail.yourComment")}</p>
              ) : null}
              <p className={styles.violationContentText}>
                {selectedViolation.previewText || t("settingsPage.violations.detail.noText")}
              </p>
            </div>

            {selectedViolation.previewMedia ? (
              <div className={styles.violationPreviewMedia}>
                {selectedViolation.previewMedia.type === "video" ? (
                  <video
                    src={selectedViolation.previewMedia.url}
                    controls
                    className={styles.violationPreviewMediaEl}
                  />
                ) : (
                  <img
                    src={selectedViolation.previewMedia.url}
                    alt="Violated content"
                    className={styles.violationPreviewMediaEl}
                  />
                )}
              </div>
            ) : null}

            {selectedViolation.targetType === "comment" &&
            selectedViolation.relatedPostPreview ? (
              <>
                <div className={styles.violationContentBlock}>
                  <p className={styles.hint}>{t("settingsPage.violations.detail.parentPost")}</p>
                  <p className={styles.violationContentText}>
                    {selectedViolation.relatedPostPreview.text ||
                      t("settingsPage.violations.detail.noCaptured")}
                  </p>
                </div>

                {selectedViolation.relatedPostPreview.media ? (
                  <div className={styles.violationPreviewMedia}>
                    {selectedViolation.relatedPostPreview.media.type ===
                    "video" ? (
                      <video
                        src={selectedViolation.relatedPostPreview.media.url}
                        controls
                        className={styles.violationPreviewMediaEl}
                      />
                    ) : (
                      <img
                        src={selectedViolation.relatedPostPreview.media.url}
                        alt="Parent post content"
                        className={styles.violationPreviewMediaEl}
                      />
                    )}
                  </div>
                ) : null}
              </>
            ) : null}

            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => setSelectedViolation(null)}
              >
                {t("settingsPage.common.close")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {logoutTarget ? (
        <div className={styles.confirmBackdrop}>
          <div className={styles.confirmCard} role="dialog" aria-modal="true">
            <h3 className={styles.confirmTitle}>{t("settingsPage.confirmDialogs.logoutDevice.title")}</h3>
            <p className={styles.confirmText}>
              {t("settingsPage.confirmDialogs.logoutDevice.desc")}
            </p>
            {logoutError ? <p className={styles.error}>{logoutError}</p> : null}
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => setLogoutTarget(null)}
                disabled={logoutSubmitting}
              >
                {t("settingsPage.confirmDialogs.logoutDevice.cancel")}
              </button>
              <button
                type="button"
                className={styles.primary}
                onClick={handleLogoutDevice}
                disabled={logoutSubmitting}
              >
                {logoutSubmitting ? t("settingsPage.common.loading") : t("settingsPage.confirmDialogs.logoutDevice.confirm")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {logoutAllOpen ? (
        <div className={styles.confirmBackdrop}>
          <div className={styles.confirmCard} role="dialog" aria-modal="true">
            <h3 className={styles.confirmTitle}>{t("settingsPage.confirmDialogs.logoutAll.title")}</h3>
            <p className={styles.confirmText}>
              {t("settingsPage.confirmDialogs.logoutAll.desc")}
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
                {t("settingsPage.confirmDialogs.logoutAll.cancel")}
              </button>
              <button
                type="button"
                className={styles.primary}
                onClick={handleLogoutAllDevices}
                disabled={logoutAllSubmitting}
              >
                {logoutAllSubmitting ? t("settingsPage.common.loading") : t("settingsPage.confirmDialogs.logoutAll.confirm")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmUnhide ? (
        <div className={styles.confirmBackdrop}>
          <div className={styles.confirmCard} role="dialog" aria-modal="true">
            <h3 className={styles.confirmTitle}>{t("settingsPage.confirmDialogs.unhidePost.title")}</h3>
            <p className={styles.confirmText}>
              {t("settingsPage.confirmDialogs.unhidePost.desc")}
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
                {t("settingsPage.confirmDialogs.unhidePost.cancel")}
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
                  ? t("settingsPage.content.hidden.unhiding")
                  : t("settingsPage.confirmDialogs.unhidePost.confirm")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmUnblock ? (
        <div className={styles.confirmBackdrop}>
          <div className={styles.confirmCard} role="dialog" aria-modal="true">
            <h3 className={styles.confirmTitle}>{t("settingsPage.confirmDialogs.unblockUser.title")}</h3>
            <p className={styles.confirmText}>
              {t("settingsPage.confirmDialogs.unblockUser.desc")}
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
                {t("settingsPage.confirmDialogs.unblockUser.cancel")}
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
                  ? t("settingsPage.content.blocked.unblocking")
                  : t("settingsPage.confirmDialogs.unblockUser.confirm")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

