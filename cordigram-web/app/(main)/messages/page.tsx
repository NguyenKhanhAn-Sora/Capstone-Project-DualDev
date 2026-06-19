"use client";

import { appAlert, appConfirm, appPrompt } from "@/lib/app-dialog";
import React, { useState, useEffect, useLayoutEffect, useRef, memo, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import styles from "./messages.module.css";
import { LinkPreviewCard } from "@/components/LinkPreviewCard/LinkPreviewCard";
import { apiBaseUrl } from "@/lib/api";
import { extractFirstUrl } from "@/components/LinkPreviewCard/LinkPreviewCard";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { ensureTabAccessToken, getTabAccessToken } from "@/lib/auth";
import {
  DM_CALL_ANSWER_EVENT,
  setActiveDmCallIdForHeartbeat,
  notifyDmCallMediaTransferred,
  type DmCallAnswerDetail,
  type DmCallSessionSyncItem,
} from "@/lib/dm-call-session-sync";
import { useLanguage, localeTagForLanguage, makeTranslator, isLanguageCode, ServerLanguageOverrideProvider, type LanguageCode } from "@/component/language-provider";
import { useTranslations } from "next-intl";
import {
  useDirectMessages,
  type DirectMessage,
} from "@/hooks/use-direct-messages";
import {
  isCallRejectedEvent,
  isIceCandidateEvent,
  isIncomingRingEvent,
} from "@/lib/call-event-guards";
import {
  getCallTabId,
  tryAcquireOutboundCallLock,
  ownsOutboundCallLock,
  hasForeignOutboundCallLock,
  releaseOutboundCallLock,
  subscribeOutboundCallLock,
} from "@/lib/call-tab-coordination";
import {
  addActiveDmCallPeer,
  getActiveDmCallPeerIds,
  isInActiveDmCall,
  removeActiveDmCallPeer,
} from "@/lib/dm-call-active-peers";
import { useChannelMessages } from "@/hooks/use-channel-messages";
import * as serversApi from "@/lib/servers-api";
import { assertAgeEligibleForServer } from "@/lib/server-age-gate";
import { translateCategoryName, translateChannelName, resolveServerDisplayLanguage, getServerLanguageOverride } from "@/lib/system-names";
import { clampFloatingPosition } from "@/lib/floating-ui";
import { DEFAULT_FREE_MAX_UPLOAD_BYTES, formatUploadLimitExceededMessage, isAllowedMessagingMediaFile, mapMessagingUploadErrorMessage } from "@/lib/upload-limits";
import { shouldPlayChannelMessageNotificationSound } from "@/lib/channel-notification-sound";
import { playMessageNotificationSound } from "@/lib/message-notification-sound";
import {
  CHAT_SCROLL_BOTTOM_THRESHOLD_PX,
  isChatNearBottom,
  scrollChatContainerToBottom,
} from "@/lib/chat-scroll";
import {
  sendDirectMessage,
  getDirectMessages,
  getConversationList,
  getAvailableUsers,
  fetchCurrentProfile,
  uploadMedia,
  uploadMediaBatch,
  type UploadMediaResponse,
  createPoll,
  getPollResults,
  votePoll,
  getMyVote,
  type Poll,
  type PollResults,
  fetchDeviceTrustStatus,
  verifyDeviceTrust,
  addMessageReaction,
  pinDirectMessage,
  getPinnedMessages,
  reportDirectMessage,
  deleteDirectMessage,
  markDmConversationRead,
  fetchUserSettings,
  fetchBoostStatus,
  fetchApiHealth,
  patchDmConversationPreferences,
  blockUser,
  unblockUser,
  unfollowUser,
  type BoostStatusResponse,
  fetchMessagingProfileByUserId,
  fetchMessagingProfileMe,
  type MessagingProfileCardResponse,
  type UserSettingsResponse,
  createStripeCheckoutSession,
  type CreateStripeCheckoutSessionRequest,
} from "@/lib/api";
import { CURRENT_PROFILE_UPDATED_EVENT } from "@/lib/events";
import { getLiveKitToken, getDMRoomName, getVoiceChannelParticipants } from "@/lib/livekit-api";
import IncomingCallPopup from "@/components/IncomingCallPopup";
import OutgoingCallPopup from "@/components/OutgoingCallPopup";
import { CallMessageCard } from "@/components/CallMessageCard";
import { extractDmCallFields } from "@/lib/dm-call-message";
import GiphyPicker, {
  type GiphyPickerSelection,
  type MediaPickerTab,
} from "@/components/GiphyPicker";
import VoiceRecorder from "@/components/VoiceRecorder";
import VoiceMessage from "@/components/VoiceMessage";
import ServerInviteCard from "@/components/ServerInviteCard/ServerInviteCard";
import { getGifById, getRandomWaveSticker, type GiphyGif } from "@/lib/giphy-api";
import QuickReactionBar from "@/components/QuickReactionBar";
import EmojiReactionPicker from "@/components/EmojiReactionPicker";
import MessageReactions from "@/components/MessageReactions";
import MessageActionsMenu from "@/components/MessageActionsMenu";
import ReportMessageDialog from "@/components/ReportMessageDialog";
import ReplyMessagePreview from "@/components/ReplyMessagePreview";
import CreateServerModal from "@/components/CreateServerModal/CreateServerModal";
import CreateChannelModal, {
  type ChannelTypeForCreate,
} from "@/components/CreateChannelModal/CreateChannelModal";
import CreateCategoryModal from "@/components/CreateCategoryModal/CreateCategoryModal";
import EventsPopup from "@/components/ServerEvents/EventsPopup";
import CreateEventWizard from "@/components/ServerEvents/CreateEventWizard";
import EventImageEditor from "@/components/ServerEvents/EventImageEditor";
import ShareEventPopup from "@/components/ServerEvents/ShareEventPopup";
import EventCreatedDetailPopup from "@/components/ServerEvents/EventCreatedDetailPopup";
import InviteToServerPopup from "@/components/InviteToServerPopup/InviteToServerPopup";
import MessagesInbox from "@/components/MessagesInbox/MessagesInbox";
import ServerContextMenu from "@/components/ServerContextMenu/ServerContextMenu";
import ServerProfileDropdown from "@/components/ServerProfileDropdown/ServerProfileDropdown";
import ChannelContextMenu from "@/components/ChannelContextMenu/ChannelContextMenu";
import CategoryContextMenu from "@/components/CategoryContextMenu/CategoryContextMenu";
import * as sidebarPrefs from "@/lib/sidebar-prefs";
import type { CategoryNotifyMode, ChannelNotifyMode } from "@/lib/sidebar-prefs";
import ServerSettingsPanel, {
  type ServerSettingsSection,
} from "@/components/ServerSettingsPanel/ServerSettingsPanel";
import ServerMembersSection from "@/components/ServerMembersSection/ServerMembersSection";
import RolesSection from "@/components/RolesSection/RolesSection";
import ServerInteractionsSection from "@/components/ServerInteractionsSection/ServerInteractionsSection";
import ServerAccessSection from "@/components/ServerAccessSection/ServerAccessSection";
import ServerJoinApplicationsPanel from "@/components/ServerJoinApplicationsPanel/ServerJoinApplicationsPanel";
import type { ExploreServer } from "@/lib/servers-api";
import ApplyToJoinQuestionsModal from "@/components/ApplyToJoinQuestionsModal/ApplyToJoinQuestionsModal";
import ServerProfileSection from "@/components/ServerProfileSection/ServerProfileSection";
import CommunitySection from "@/components/CommunitySection/CommunitySection";
import AutoModSection from "@/components/AutoModSection/AutoModSection";
import ServerSafetySection from "@/components/ServerSafetySection/ServerSafetySection";
import { mapSectionToSafetyTab } from "@/components/ServerSafetySection/safety-tab-map";
import ServerBansSection from "@/components/ServerBansSection/ServerBansSection";
import ServerEmojiSection from "@/components/ServerEmojiSection/ServerEmojiSection";
import ServerStickerSection from "@/components/ServerStickerSection/ServerStickerSection";
import MessageSearchPanel from "@/components/MessageSearchPanel/MessageSearchPanel";
import MentionDropdown from "@/components/MentionDropdown/MentionDropdown";
import { fetchInboxForYou } from "@/lib/inbox-api";
import {
  isMessagesDesktopNotificationsEnabled,
  requestDesktopNotificationPermission,
  showInboxForYouDesktopNotification,
  showMentionDesktopNotification,
  type MessagesDesktopNotificationCopy,
} from "@/lib/messages-desktop-notifications";
import MessagesDesktopNotificationHost from "@/components/MessagesDesktopNotification/MessagesDesktopNotificationHost";
import { normalizeServerBanner } from "@/lib/server-banner";
import type { VoiceChannelCallProps } from "@/components/VoiceChannelCall";
import ChannelUserProfileRoot, {
  type ChannelProfileAnchorContext,
} from "@/components/ChannelUserProfile/ChannelUserProfileRoot";
import MessagesUserSettingsModal from "@/components/MessagesUserSettings/MessagesUserSettingsModal";
import { applyAccentColor, ensureReadableForeground } from "@/component/theme-provider";
import {
  applyMessagesRootChromeFromStorage,
  migrateMessagesChromeStorageOnce,
  syncMessagesChromeVars,
} from "@/lib/messages-appearance-chrome";
import {
  getMessagesShellTheme,
  type MessagesShellTheme,
} from "@/lib/messages-shell-theme";
import { useMessagesUiTone } from "@/hooks/use-messages-ui-tone";
import { getDmSidebarPeersMode } from "@/lib/messages-dm-sidebar-prefs";
import { formatDmPresenceLabel, resolvePresenceStatus } from "@/lib/dm-presence-label";
import { buildServerEmojiRenderMapFromPickerGroups } from "@/lib/server-emoji-render";
import UserProfilePopup from "@/components/UserProfilePopup/UserProfilePopup";
import ChatMediaViewer, { type ChatMediaItem } from "@/components/ChatMediaViewer";
import { ConversationDetailsPanel, type DetailsPanelMessage, type DetailsPanelPinnedItem } from "@/components/ConversationDetailsPanel/ConversationDetailsPanel";
import DmConversationContextMenu from "@/components/DmConversationContextMenu/DmConversationContextMenu";
import {
  parseDmConversationPreferences,
  isDmConversationMuted,
  DM_CATEGORY_COLORS,
  type DmConversationPreferences,
  type DmConversationCategory,
  emptyDmConversationPreferences,
} from "@/lib/dm-conversation-prefs";

// Dynamic import VoiceChannelCall to avoid SSR issues with LiveKit
const VoiceChannelCall = dynamic<VoiceChannelCallProps>(
  () => import("@/components/VoiceChannelCall"),
  { ssr: false },
);
const UNCATEGORIZED_CATEGORY_ID = "__uncategorized__";

/** Giá trị mặc định trùng MessagesProfileEditor — không coi là “tùy chỉnh”, dùng màu chữ token UI. */
const MESSAGING_DEFAULT_SOLID_PRIMARY = "#f2f3f5";
const MESSAGING_DEFAULT_ACCENT = "#5865f2";

function hasMessagingDisplayNameOverride(
  source?: {
    displayNameFontId?: string | null;
    displayNameEffectId?: string | null;
    displayNamePrimaryHex?: string | null;
    displayNameAccentHex?: string | null;
  } | null,
): boolean {
  if (!source) return false;
  const font = String(source.displayNameFontId || "default").trim();
  if (font === "mono" || font === "rounded") return true;
  const effect = String(source.displayNameEffectId || "solid").trim();
  if (effect === "gradient" || effect === "neon") return true;
  const pRaw = String(source.displayNamePrimaryHex || "").trim();
  const aRaw = String(source.displayNameAccentHex || "").trim();
  const pOk = /^#[0-9a-f]{6}$/i.test(pRaw);
  const aOk = /^#[0-9a-f]{6}$/i.test(aRaw);
  const pNorm = pOk ? pRaw.toLowerCase() : "";
  const aNorm = aOk ? aRaw.toLowerCase() : "";
  if (pNorm && pNorm !== MESSAGING_DEFAULT_SOLID_PRIMARY) return true;
  if (aNorm && aNorm !== MESSAGING_DEFAULT_ACCENT.toLowerCase()) return true;
  return false;
}

function getDisplayNameTextStyle(
  source?: {
    displayNameFontId?: string | null;
    displayNameEffectId?: string | null;
    displayNamePrimaryHex?: string | null;
    displayNameAccentHex?: string | null;
  },
  messagesShellTheme: MessagesShellTheme = "dark",
): React.CSSProperties | undefined {
  if (!source || !hasMessagingDisplayNameOverride(source)) return undefined;
  const defaultPrimary = messagesShellTheme === "light" ? "#0F1629" : "#F2F3F5";
  let primary = /^#[0-9a-f]{6}$/i.test(String(source.displayNamePrimaryHex || ""))
    ? String(source.displayNamePrimaryHex)
    : defaultPrimary;
  let accent = /^#[0-9a-f]{6}$/i.test(String(source.displayNameAccentHex || ""))
    ? String(source.displayNameAccentHex)
    : "#5865F2";
  if (messagesShellTheme === "light") {
    primary = ensureReadableForeground(primary, { maxLuminance: 0.58 });
    accent = ensureReadableForeground(accent, { maxLuminance: 0.58 });
  }
  const fontFamily =
    source.displayNameFontId === "mono"
      ? 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
      : source.displayNameFontId === "rounded"
        ? 'ui-rounded, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif'
        : undefined;
  if (source.displayNameEffectId === "gradient") {
    return {
      backgroundImage: `linear-gradient(0deg, ${primary}, ${accent})`,
      WebkitBackgroundClip: "text",
      backgroundClip: "text",
      color: "transparent",
      fontFamily,
    };
  }
  if (source.displayNameEffectId === "neon") {
    return {
      color: primary,
      textShadow: `0 0 10px ${accent}, 0 0 18px ${accent}`,
      fontFamily,
    };
  }
  return {
    color: primary,
    fontFamily,
  };
}

interface BackendServer extends serversApi.Server {
  infoChannels?: serversApi.Channel[];
  textChannels?: serversApi.Channel[];
  voiceChannels?: serversApi.Channel[];
  serverCategories?: serversApi.ServerCategory[];
}

interface MessageReaction {
  emoji: string; 
  userIds: string[]; 
  count: number; 
}

interface UIMessage {
  id: string;
  text: string;
  senderId: string;
  senderEmail: string;
  /** Display name lấy từ Profile.displayName (userDisplayName). */
  senderDisplayName?: string;
  senderName?: string;
  senderAvatar?: string;
  timestamp: Date;
  isFromCurrentUser: boolean;
  type: "server" | "direct"; // Thêm field để phân biệt loại chat
  isRead?: boolean; // Trạng thái đã đọc
  messageType?: "text" | "gif" | "sticker" | "voice" | "call" | "system" | "welcome";
  callType?: "audio" | "video";
  callStatus?: "missed" | "completed" | "declined" | "cancelled";
  callDurationSec?: number | null;
  callInitiatorId?: string;
  giphyId?: string;
  customStickerUrl?: string;
  serverStickerId?: string;
  voiceUrl?: string;
  voiceDuration?: number;
  reactions?: MessageReaction[];
  isPinned?: boolean;
  replyTo?: string;
  stickerReplyWelcomeEnabled?: boolean;
  welcomeWaveDismissedByMe?: boolean;
  contentModerationResult?: "none" | "blurred" | "rejected";
  replyToMessage?: {
    id: string;
    senderId?: string;
    senderDisplayName?: string;
    senderName?: string;
    messageType?: "text" | "gif" | "sticker" | "voice" | "call" | "system" | "welcome";
    text: string;
  } | null;
  /** Biệt danh trong máy chủ (nếu có) — mở card hồ sơ từ kênh. */
  serverNickname?: string;
  senderDisplayNameFontId?: string | null;
  senderDisplayNameEffectId?: string | null;
  senderDisplayNamePrimaryHex?: string | null;
  senderDisplayNameAccentHex?: string | null;
  /**
   * True when the sender has "unsent" the message ("delete for everyone").
   * The bubble should stay in the list but render a greyed-out italic
   * placeholder instead of the original content.
   */
  isDeletedForEveryone?: boolean;
  deletedAt?: string;
  /** Raw attachment URLs — kept for backward compat with messages sent before the emoji-prefix format. */
  attachments?: string[];
  /** Pre-fetched link preview cards (same schema as social CommentLinkPreview). */
  linkPreviews?: Array<{
    url: string;
    canonicalUrl?: string | null;
    domain?: string | null;
    siteName?: string | null;
    title?: string | null;
    description?: string | null;
    image?: string | null;
    favicon?: string | null;
  }>;
}

type PendingMessageJump = {
  messageId: string;
  mode: "server" | "dm";
  channelId?: string;
  dmUserId?: string;
};

// GiphyMessage component for rendering GIF/Sticker
const GiphyMessage = memo(
  ({
    giphyId,
    messageType,
  }: {
    giphyId: string;
    messageType: "gif" | "sticker";
  }) => {
    const [gifData, setGifData] = useState<GiphyGif | null>(null);
    const [loading, setLoading] = useState(true);
    const { t } = useLanguage();

    useEffect(() => {
      getGifById(giphyId)
        .then((data) => {
          setGifData(data);
          setLoading(false);
        })
        .catch((err) => {
          console.error("Failed to load Giphy content:", err);
          setLoading(false);
        });
    }, [giphyId]);

    if (loading) {
      return (
        <div style={{ padding: "12px", color: "#7a8db8", fontSize: "14px" }}>
          {messageType === "gif"
            ? t("chat.loading.gif")
            : messageType === "sticker"
              ? t("chat.loading.sticker")
              : t("chat.loading.generic")}
        </div>
      );
    }

    if (!gifData) {
      return (
        <div style={{ fontSize: messageType === "sticker" ? 64 : 48, padding: "8px", lineHeight: 1 }}>
          👋
        </div>
      );
    }

    return (
      <img
        src={gifData.images.downsized.url}
        alt={gifData.title}
        style={{
          maxWidth: messageType === "sticker" ? "200px" : "300px",
          maxHeight: messageType === "sticker" ? "200px" : "300px",
          borderRadius: "8px",
          display: "block",
        }}
        loading="lazy"
      />
    );
  },
);

GiphyMessage.displayName = "GiphyMessage";

const PASSKEY_DEVICE_KEY = "cordigramDeviceId";

const getDeviceId = () => {
  if (typeof window === "undefined") return "";
  const existing = window.localStorage.getItem(PASSKEY_DEVICE_KEY);
  if (existing) return existing;
  const next =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  window.localStorage.setItem(PASSKEY_DEVICE_KEY, next);
  return next;
};

// ✅ Move PollMessage component outside to prevent re-creation on every render
const PollMessage = memo(
  ({
    pollId,
    token,
    onError,
  }: {
    pollId: string;
    token: string;
    onError: (msg: string) => void;
  }) => {
    const [pollData, setPollData] = useState<PollResults | null>(null);
    const [selectedOptions, setSelectedOptions] = useState<number[]>([]);
    const [hasVoted, setHasVoted] = useState(false);
    const [showResults, setShowResults] = useState(false);

    const loadPoll = useCallback(async () => {
      try {
        const [results, myVote] = await Promise.all([
          getPollResults({ token, pollId }),
          getMyVote({ token, pollId }),
        ]);
        setPollData(results);
        if (myVote && myVote.length > 0) {
          setSelectedOptions(myVote);
          setHasVoted(true);
          setShowResults(true);
        }
      } catch (error) {
        console.error("Failed to load poll:", error);
      }
    }, [token, pollId]);

    useEffect(() => {
      loadPoll();
    }, [loadPoll]);

    const handleOptionToggle = useCallback(
      (index: number) => {
        if (hasVoted || !pollData) return;

        if (pollData.allowMultipleAnswers) {
          setSelectedOptions((prev) =>
            prev.includes(index)
              ? prev.filter((i) => i !== index)
              : [...prev, index],
          );
        } else {
          setSelectedOptions([index]);
        }
      },
      [hasVoted, pollData],
    );

    const handleVote = useCallback(async () => {
      if (!pollData || selectedOptions.length === 0) return;

      try {
        await votePoll({ token, pollId, optionIndexes: selectedOptions });
        setHasVoted(true);
        setShowResults(true);
        await loadPoll();
      } catch (error: any) {
        onError(error?.message || "Không gửi được bình chọn");
      }
    }, [pollData, selectedOptions, token, pollId, loadPoll, onError]);

    if (!pollData) {
      return (
        <div className={styles.pollMessage}>
          <div className={styles.loadingWrap}>
            <div className={styles.cosmicSpinner} />
            <div className={styles.loadingDots}>
              <span /><span /><span />
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className={styles.pollMessage}>
        <div className={styles.pollQuestion}>{pollData.question}</div>
        <div className={styles.pollSubtitle}>
          {pollData.allowMultipleAnswers
            ? "Chọn một hoặc nhiều phương án"
            : "Chọn một phương án"}
        </div>

        <div className={styles.pollOptions}>
          {pollData.options.map((option, index) => (
            <div key={index} className={styles.pollOptionItem}>
              {!showResults ? (
                <>
                  <input
                    type={pollData.allowMultipleAnswers ? "checkbox" : "radio"}
                    id={`poll-${pollId}-option-${index}`}
                    checked={selectedOptions.includes(index)}
                    onChange={() => handleOptionToggle(index)}
                    disabled={hasVoted}
                  />
                  <label htmlFor={`poll-${pollId}-option-${index}`}>
                    {option}
                  </label>
                </>
              ) : (
                <div className={styles.pollResultBar}>
                  <div className={styles.pollResultLabel}>
                    <span>{option}</span>
                    <span className={styles.pollResultPercentage}>
                      {pollData.results[index].percentage}%
                    </span>
                  </div>
                  <div className={styles.pollResultProgress}>
                    <div
                      className={styles.pollResultFill}
                      style={{
                        width: `${pollData.results[index].percentage}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className={styles.pollFooter}>
          <span className={styles.pollStats}>
            {pollData.uniqueVoters} votes • {pollData.hoursLeft} hours left
          </span>
          <div className={styles.pollActions}>
            {!showResults && (
              <button
                className={styles.pollActionButton}
                onClick={() => setShowResults(true)}
              >
                Show results
              </button>
            )}
            {!hasVoted && !showResults && (
              <button
                className={`${styles.pollActionButton} ${styles.pollVoteButton}`}
                onClick={handleVote}
                disabled={selectedOptions.length === 0}
              >
                Vote
              </button>
            )}
            {hasVoted && <span className={styles.pollVoted}>✓ Voted</span>}
          </div>
        </div>
      </div>
    );
  },
);

PollMessage.displayName = "PollMessage";

function BlurredImage({ blurredUrl, canReveal, className, onError }: {
  blurredUrl: string;
  canReveal: boolean;
  className?: string;
  onError?: React.ReactEventHandler<HTMLImageElement>;
}) {
  const [revealed, setRevealed] = useState(false);
  const displayUrl = revealed ? blurredUrl.replace(/e_blur:\d+\//, "") : blurredUrl;

  return (
    <div style={{ position: "relative" }}>
      <img src={displayUrl} alt="Ảnh được chia sẻ" className={className} onError={onError} />
      {!revealed && (
        <>
          {canReveal && (
            <button
              type="button"
              onClick={() => setRevealed(true)}
              style={{
                position: "absolute", top: "50%", left: "50%",
                transform: "translate(-50%, -50%)",
                background: "rgba(0,0,0,0.75)", border: "none",
                borderRadius: 8, padding: "10px 20px",
                color: "#fff", fontSize: 14, fontWeight: 600,
                cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
                backdropFilter: "blur(4px)", transition: "background 0.15s",
                zIndex: 2,
              }}
              onMouseOver={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(0,0,0,0.9)"; }}
              onMouseOut={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(0,0,0,0.75)"; }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
              Xem hình ảnh
            </button>
          )}
          <div style={{
            position: "absolute", bottom: 8, left: 8, right: 8,
            background: "rgba(0,0,0,0.7)", borderRadius: 4,
            padding: "4px 8px", fontSize: 11, color: "#faa61a",
            display: "flex", alignItems: "center", gap: 4, zIndex: 1,
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
            Nội dung nhạy cảm đã bị làm mờ
          </div>
        </>
      )}
    </div>
  );
}

function LazyInViewVideo({
  src,
  className,
  preload = "metadata",
  controls = true,
  playsInline = true,
  onError,
}: {
  src: string;
  className?: string;
  preload?: "none" | "metadata" | "auto";
  controls?: boolean;
  playsInline?: boolean;
  onError?: React.ReactEventHandler<HTMLVideoElement>;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    const el = hostRef.current;
    if (!el || shouldLoad) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { root: null, rootMargin: "220px 0px", threshold: 0.01 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [shouldLoad]);

  return (
    <div ref={hostRef}>
      {shouldLoad ? (
        <video
          src={src}
          controls={controls}
          className={className}
          preload={preload}
          playsInline={playsInline}
          onError={onError}
        >
          Your browser does not support video playback.
        </video>
      ) : (
        <div
          className={className}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--color-text-muted)",
            fontSize: 12,
            background: "color-mix(in srgb, var(--color-surface-muted) 75%, black)",
          }}
        >
          Video sẽ tải khi cuộn tới
        </div>
      )}
    </div>
  );
}

// Custom comparison function for memo - only re-render if message content or read status changed
function areMessagesEqual(
  prevProps: {
    message: UIMessage;
    renderMessageContent: (message: UIMessage) => React.ReactNode;
    onVisible?: (messageId: string, isVisible: boolean) => void;
    senderColor?: string;
    senderNameStyle?: React.CSSProperties;
    messagesShellTheme?: MessagesShellTheme;
    onChannelUserProfileOpen?: (
      message: UIMessage,
      anchorRect: DOMRect,
    ) => void;
  },
  nextProps: {
    message: UIMessage;
    renderMessageContent: (message: UIMessage) => React.ReactNode;
    onVisible?: (messageId: string, isVisible: boolean) => void;
    senderColor?: string;
    senderNameStyle?: React.CSSProperties;
    messagesShellTheme?: MessagesShellTheme;
    onChannelUserProfileOpen?: (
      message: UIMessage,
      anchorRect: DOMRect,
    ) => void;
  },
) {
  if (prevProps.messagesShellTheme !== nextProps.messagesShellTheme) return false;
  if (prevProps.senderColor !== nextProps.senderColor) return false;
  if (prevProps.senderNameStyle !== nextProps.senderNameStyle) return false;
  if (prevProps.onChannelUserProfileOpen !== nextProps.onChannelUserProfileOpen)
    return false;
  if (prevProps.message.id !== nextProps.message.id) return false;

  if (
    prevProps.message.senderDisplayNameFontId !==
    nextProps.message.senderDisplayNameFontId
  )
    return false;
  if (
    prevProps.message.senderDisplayNameEffectId !==
    nextProps.message.senderDisplayNameEffectId
  )
    return false;
  if (
    prevProps.message.senderDisplayNamePrimaryHex !==
    nextProps.message.senderDisplayNamePrimaryHex
  )
    return false;
  if (
    prevProps.message.senderDisplayNameAccentHex !==
    nextProps.message.senderDisplayNameAccentHex
  )
    return false;

  // Re-render if read status changed (THIS IS KEY!)
  if (prevProps.message.isRead !== nextProps.message.isRead) {
    return false;
  }

  // Re-render if text content changed
  if (prevProps.message.text !== nextProps.message.text) return false;

  // Re-render if messageType or giphyId changed
  if (prevProps.message.messageType !== nextProps.message.messageType)
    return false;
  if (prevProps.message.giphyId !== nextProps.message.giphyId) return false;
  if (prevProps.message.customStickerUrl !== nextProps.message.customStickerUrl)
    return false;
  if (prevProps.message.voiceUrl !== nextProps.message.voiceUrl) return false;
  if (prevProps.message.voiceDuration !== nextProps.message.voiceDuration)
    return false;

  // ✅ Re-render if reactions changed (otherwise UI requires reload)
  if (prevProps.message.reactions !== nextProps.message.reactions) return false;
  if (prevProps.message.replyTo !== nextProps.message.replyTo) return false;
  if (prevProps.message.replyToMessage !== nextProps.message.replyToMessage)
    return false;

  // Re-render when the message gets unsent / re-displayed as "recalled"
  if (
    prevProps.message.isDeletedForEveryone !==
    nextProps.message.isDeletedForEveryone
  )
    return false;
  if (prevProps.message.deletedAt !== nextProps.message.deletedAt) return false;

  // Emoji map / jumbo sizing đi qua renderMessageContent — phải re-render khi callback đổi
  if (prevProps.renderMessageContent !== nextProps.renderMessageContent)
    return false;

  // Don't re-render if only timestamp changed
  return true;
}

// ✅ Memoized MessageItem component with Intersection Observer for read receipts
const MessageItem = memo(
  ({
    message,
    renderMessageContent,
    onVisible,
    currentUserId,
    onReaction,
    onReply,
    onPin,
    onReport,
    onDelete,
    onDeleteForMe,
    onDeleteForEveryone,
    scrollContainerRef,
    dmPartnerDisplayName,
    senderColor,
    senderNameStyle,
    messagesShellTheme = "dark",
    onChannelUserProfileOpen,
  }: {
    message: UIMessage;
    renderMessageContent: (message: UIMessage) => React.ReactNode;
    onVisible?: (messageId: string, isVisible: boolean) => void;
    currentUserId?: string;
    onReaction?: (messageId: string, emoji: string) => void;
    onReply?: (message: UIMessage) => void;
    onPin?: (messageId: string) => void;
    onReport?: (messageId: string) => void;
    onDelete?: (messageId: string) => void;
    /** "Delete for me" — immediate action, no confirmation dialog. */
    onDeleteForMe?: (messageId: string) => void;
    /** "Unsend / delete for everyone" — sender only. */
    onDeleteForEveryone?: (messageId: string) => void;
    scrollContainerRef?: React.RefObject<HTMLElement | null>;
    dmPartnerDisplayName?: string;
    senderColor?: string; // Màu hiển thị từ role cao nhất
    senderNameStyle?: React.CSSProperties;
    messagesShellTheme?: MessagesShellTheme;
    onChannelUserProfileOpen?: (
      message: UIMessage,
      anchorRect: DOMRect,
    ) => void;
  }) => {
    const { t } = useLanguage();
    const safeSenderColor = useMemo(() => {
      const c = senderColor?.trim();
      if (!c) return undefined;
      if (messagesShellTheme !== "light") return senderColor;
      return ensureReadableForeground(c, { maxLuminance: 0.58 });
    }, [senderColor, messagesShellTheme]);
    const messageRef = useRef<HTMLDivElement>(null);
    const [isHovered, setIsHovered] = useState(false);
    const [showQuickReactions, setShowQuickReactions] = useState(false);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [showActionsMenu, setShowActionsMenu] = useState(false);
    const [fixedReactionPosition, setFixedReactionPosition] = useState<{
      top: number;
      left: number;
    } | null>(null);
    const reactionBarRef = useRef<HTMLDivElement>(null);
    const [reactionBarSize, setReactionBarSize] = useState({ width: 420, height: 44 });

    const updateFixedPosition = useCallback(() => {
      const el = messageRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const fromRight = message.isFromCurrentUser && message.replyToMessage?.messageType !== "welcome";
      const containerRect = scrollContainerRef?.current?.getBoundingClientRect() ?? null;
      const measured = reactionBarRef.current?.getBoundingClientRect();
      const barW = measured?.width || reactionBarSize.width;
      const barH = measured?.height || reactionBarSize.height;
      const pos = clampFloatingPosition({
        anchorRect: rect,
        width: barW,
        height: barH,
        alignRight: fromRight,
        gap: 6,
        containerRect,
      });
      setFixedReactionPosition(pos);
    }, [
      message.isFromCurrentUser,
      message.replyToMessage?.messageType,
      scrollContainerRef,
      reactionBarSize.width,
      reactionBarSize.height,
    ]);

    useLayoutEffect(() => {
      if (!scrollContainerRef?.current || (!isHovered && !showEmojiPicker && !showActionsMenu)) {
        setFixedReactionPosition(null);
        return;
      }
      updateFixedPosition();
      const container = scrollContainerRef.current;
      const onScroll = () => updateFixedPosition();
      container.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onScroll);
      return () => {
        container.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", onScroll);
      };
    }, [scrollContainerRef, isHovered, showEmojiPicker, showActionsMenu, updateFixedPosition]);

    useLayoutEffect(() => {
      if (!isHovered && !showEmojiPicker && !showActionsMenu) return;
      const node = reactionBarRef.current;
      if (!node) return;
      const measure = () => {
        const box = node.getBoundingClientRect();
        if (box.width > 0 && box.height > 0) {
          setReactionBarSize((prev) =>
            prev.width === box.width && prev.height === box.height
              ? prev
              : { width: box.width, height: box.height },
          );
        }
      };
      measure();
      const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
      ro?.observe(node);
      return () => ro?.disconnect();
    }, [isHovered, showEmojiPicker, showActionsMenu, fixedReactionPosition]);

    useLayoutEffect(() => {
      if (!isHovered && !showEmojiPicker && !showActionsMenu) return;
      updateFixedPosition();
    }, [reactionBarSize, isHovered, showEmojiPicker, showActionsMenu, updateFixedPosition]);

    // ✅ Setup Intersection Observer to detect when message is visible
    useEffect(() => {
      if (
        !messageRef.current ||
        !onVisible ||
        message.isFromCurrentUser ||
        message.isRead
      ) {
        return;
      }

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            // Message is considered visible if at least 50% of it is in viewport
            const isVisible =
              entry.isIntersecting && entry.intersectionRatio >= 0.5;
            if (isVisible) {
            }
            onVisible(message.id, isVisible);
          });
        },
        {
          threshold: [0, 0.5, 1], // Trigger at 0%, 50%, and 100% visibility
          rootMargin: "0px",
        },
      );

      observer.observe(messageRef.current);

      return () => {
        observer.disconnect();
      };
    }, [message.id, message.isFromCurrentUser, message.isRead, onVisible]);

    /** Sticker/GIF trả lời welcome: hiển thị căn trái như tin nhận (không dùng bubble gửi bên phải). */
    const alignAsSent =
      message.isFromCurrentUser &&
      message.replyToMessage?.messageType !== "welcome";

    return (
      <div
        ref={messageRef}
        className={`${styles.messageGroup} ${
          alignAsSent ? styles.sent : styles.received
        }`}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => {
          setIsHovered(false);
          setShowQuickReactions(false);
        }}
        style={{ position: "relative" }}
      >
        {/* Avatar — kênh server: bấm mở card hồ sơ (không phải tin của mình). */}
        {onChannelUserProfileOpen &&
        !message.isFromCurrentUser &&
        message.type === "server" ? (
          <button
            type="button"
            className={`${styles.messageAvatar} ${styles.messageAvatarButton}`}
            aria-label="Xem hồ sơ người gửi"
            onClick={(e) => {
              e.stopPropagation();
              const r = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
              onChannelUserProfileOpen(message, r);
            }}
          >
            {isValidAvatarUrl(message.senderAvatar) ? (
              <img
                src={message.senderAvatar}
                alt={message.senderName || "Người dùng"}
              />
            ) : (
              <div className={styles.avatarPlaceholder}>
                {(message.senderName || message.senderEmail || "?")
                  .charAt(0)
                  .toUpperCase()}
              </div>
            )}
          </button>
        ) : (
          <div className={styles.messageAvatar}>
            {isValidAvatarUrl(message.senderAvatar) ? (
              <img
                src={message.senderAvatar}
                alt={message.senderName || "Người dùng"}
              />
            ) : (
              <div className={styles.avatarPlaceholder}>
                {(message.senderName || message.senderEmail || "?")
                  .charAt(0)
                  .toUpperCase()}
              </div>
            )}
          </div>
        )}

        <div className={styles.messageContent}>
          {message.messageType !== "call" && (
          <div className={styles.messageHeader}>
            <span 
              className={styles.messageSenderName}
              style={
                senderNameStyle
                  ? senderNameStyle
                  : safeSenderColor
                    ? { color: safeSenderColor }
                    : undefined
              }
            >
              {message.senderDisplayName ||
                message.senderName ||
                message.senderEmail ||
                "Unknown"}
            </span>
            <span className={styles.messageTime}>
              {formatMessageTime(message.timestamp)}
            </span>
          </div>
          )}

          {message.messageType === "call" ? (
            <div className={styles.callMessageWrap}>
              {renderMessageContent(message)}
            </div>
          ) : null}

          {/* Message bubble */}
          {message.messageType !== "call" && message.replyToMessage && (
            <div className={styles.replyContext}>
              <div className={styles.replyContextLine} />
              <div className={styles.replyContextContent}>
                <div className={styles.replyContextLabel}>
                  {(() => {
                    const replierName = message.isFromCurrentUser
                      ? "Bạn"
                      : message.senderDisplayName ||
                        message.senderName ||
                        message.senderEmail ||
                        "Người dùng";

                    // Case 1: A tự trả lời tin nhắn của A
                    if (
                      message.replyToMessage.senderId &&
                      message.replyToMessage.senderId === message.senderId
                    ) {
                      return `${replierName} đã trả lời chính mình`;
                    }

                    // Case 2: A trả lời tin nhắn của B (người đang xem là B) → "A đã trả lời tin nhắn của bạn"
                    if (
                      message.replyToMessage.senderId &&
                      message.replyToMessage.senderId === currentUserId
                    ) {
                      return `${replierName} đã trả lời tin nhắn của bạn`;
                    }

                    // Fallback: trả lời tin nhắn của người khác (hiếm trong DM)
                    return `${replierName} đã trả lời ${
                      message.replyToMessage.senderDisplayName ||
                      message.replyToMessage.senderName ||
                      dmPartnerDisplayName ||
                      "người dùng"
                    }`;
                  })()}
                </div>
                <div className={styles.replyContextText}>
                  {message.replyToMessage.messageType === "gif"
                    ? t("chat.composer.replyGif")
                    : message.replyToMessage.messageType === "sticker"
                      ? t("chat.composer.replySticker")
                      : message.replyToMessage.messageType === "voice"
                        ? t("chat.composer.replyVoice")
                        : message.replyToMessage.messageType === "welcome"
                          ? (message.replyToMessage.text || t("chat.composer.replyWelcomeFallback"))
                        : message.replyToMessage.text}
                </div>
              </div>
            </div>
          )}
          {message.messageType !== "call" ? (
            <div
              className={`${styles.messageBubble} ${
                alignAsSent ? styles.sent : styles.received
              }`}
            >
              {renderMessageContent(message)}
            </div>
          ) : null}

          {/* Message Reactions (ẩn khi đang hiện ở thanh sticky phía trên) */}
          {!message.isDeletedForEveryone &&
            message.reactions &&
            message.reactions.length > 0 && (
              <MessageReactions
                reactions={message.reactions}
                currentUserId={currentUserId || ""}
                onReactionClick={(emoji) => onReaction?.(message.id, emoji)}
                onAddClick={() => setShowEmojiPicker(true)}
              />
            )}

          {/* ✅ Read receipt indicator - only show for sent messages */}
          {alignAsSent && message.type === "direct" && (
            <div className={styles.readReceipt}>
              {message.isRead ? (
                <div className={styles.readStatus}>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    className={styles.readIcon}
                  >
                    {/* Double checkmark for read */}
                    <path
                      d="M2 8.5L5.5 12L14 3.5"
                      stroke="#4a9eff"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M5 8.5L8.5 12L14 6.5"
                      stroke="#4a9eff"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity="0.6"
                    />
                  </svg>
                  <span className={styles.readText}>{t("chat.dmList.seen")}</span>
                </div>
              ) : (
                <div className={styles.readStatus}>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    className={styles.unreadIcon}
                  >
                    {/* Single checkmark for sent but not read */}
                    <path
                      d="M2 8.5L5.5 12L14 3.5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity="0.5"
                    />
                  </svg>
                  <span className={styles.unreadText}>{t("chat.dmList.sent")}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Quick Reaction Bar on Hover — portal với position:fixed + z-index cao để đè lên chatHeader khi cần */}
        {isHovered &&
          message.messageType !== "call" &&
          !message.isDeletedForEveryone &&
          (scrollContainerRef && fixedReactionPosition ? (
          createPortal(
            <div
              ref={reactionBarRef}
              style={{
                position: "fixed",
                zIndex: 10005,
                top: fixedReactionPosition.top,
                left: fixedReactionPosition.left,
              }}
            >
              <QuickReactionBar
                onReactionSelect={(emoji) => onReaction?.(message.id, emoji)}
                onMoreClick={() => setShowEmojiPicker(true)}
                onReplyClick={() => onReply?.(message)}
                onMenuClick={() => setShowActionsMenu(true)}
              />
            </div>,
            document.body,
          )
        ) : (
          <QuickReactionBar
            onReactionSelect={(emoji) => onReaction?.(message.id, emoji)}
            onMoreClick={() => setShowEmojiPicker(true)}
            onReplyClick={() => onReply?.(message)}
            onMenuClick={() => setShowActionsMenu(true)}
            position={{
              top: -45,
              right: alignAsSent ? 10 : undefined,
              left: alignAsSent ? undefined : 50,
            }}
          />
        ))}

        {/* Emoji Reaction Picker — portal để đè lên chatHeader */}
        {showEmojiPicker && !message.isDeletedForEveryone && (scrollContainerRef && fixedReactionPosition ? (
          createPortal(
            <div
              style={{
                position: "fixed",
                zIndex: 10006,
                ...(() => {
                  const PICKER_W = 340;
                  const PICKER_H = 420;
                  const containerRect = scrollContainerRef?.current?.getBoundingClientRect() ?? null;
                  const below = clampFloatingPosition({
                    anchorRect: messageRef.current!.getBoundingClientRect(),
                    width: PICKER_W,
                    height: PICKER_H,
                    gap: 52,
                    containerRect,
                  });
                  return { top: below.top, left: below.left };
                })(),
              }}
            >
              <EmojiReactionPicker
                onSelect={(emoji) => {
                  onReaction?.(message.id, emoji);
                  setShowEmojiPicker(false);
                }}
                onClose={() => setShowEmojiPicker(false)}
              />
            </div>,
            document.body,
          )
        ) : (
          <EmojiReactionPicker
            onSelect={(emoji) => {
              onReaction?.(message.id, emoji);
              setShowEmojiPicker(false);
            }}
            onClose={() => setShowEmojiPicker(false)}
            position={{
              top: 50,
              right: alignAsSent ? 10 : undefined,
              left: alignAsSent ? undefined : 50,
            }}
          />
        ))}

        {/* Message Actions Menu — render via portal to avoid clipping/stack issues */}
        {showActionsMenu &&
          !message.isDeletedForEveryone &&
          (scrollContainerRef && fixedReactionPosition ? (
            createPortal(
              <div
                style={{
                  position: "fixed",
                  zIndex: 10007,
                  ...(() => {
                    const MENU_W = 220;
                    const MENU_H = 280;
                    const pos = clampFloatingPosition({
                      anchorRect: messageRef.current!.getBoundingClientRect(),
                      width: MENU_W,
                      height: MENU_H,
                      gap: 52,
                    });
                    return { top: pos.top, left: pos.left };
                  })(),
                }}
              >
                <MessageActionsMenu
                  onRemove={
                    onDelete && message.isFromCurrentUser
                      ? () => {
                          onDelete?.(message.id);
                        }
                      : undefined
                  }
                  onDeleteForMe={
                    onDeleteForMe
                      ? () => {
                          onDeleteForMe(message.id);
                        }
                      : undefined
                  }
                  onDeleteForEveryone={
                    onDeleteForEveryone && message.isFromCurrentUser
                      ? () => {
                          onDeleteForEveryone(message.id);
                        }
                      : undefined
                  }
                  onPin={() => {
                    onPin?.(message.id);
                    setShowActionsMenu(false);
                  }}
                  onReport={
                    !message.isFromCurrentUser
                      ? () => {
                          onReport?.(message.id);
                          setShowActionsMenu(false);
                        }
                      : undefined
                  }
                  onClose={() => setShowActionsMenu(false)}
                  position={{ top: 0, left: 0 }}
                  isOwnMessage={message.isFromCurrentUser}
                  isPinned={message.isPinned || false}
                />
              </div>,
              document.body,
            )
          ) : (
            <MessageActionsMenu
              onRemove={
                onDelete && message.isFromCurrentUser
                  ? () => {
                      onDelete?.(message.id);
                    }
                  : undefined
              }
              onDeleteForMe={
                onDeleteForMe
                  ? () => {
                      onDeleteForMe(message.id);
                    }
                  : undefined
              }
              onDeleteForEveryone={
                onDeleteForEveryone && message.isFromCurrentUser
                  ? () => {
                      onDeleteForEveryone(message.id);
                    }
                  : undefined
              }
              onPin={() => {
                onPin?.(message.id);
                setShowActionsMenu(false);
              }}
              onReport={
                !message.isFromCurrentUser
                  ? () => {
                      onReport?.(message.id);
                      setShowActionsMenu(false);
                    }
                  : undefined
              }
              onClose={() => setShowActionsMenu(false)}
              position={{
                top: 50,
                right: alignAsSent ? 10 : undefined,
                left: alignAsSent ? undefined : 50,
              }}
              isOwnMessage={message.isFromCurrentUser}
              isPinned={message.isPinned || false}
            />
          ))}
      </div>
    );
  },
  areMessagesEqual,
); // ✅ Use custom comparison

MessageItem.displayName = "MessageItem";

// ✅ Extracted formatTime to avoid re-creating on every render
function formatMessageTime(date: Date) {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

/** Kích thước emoji :name: trong dòng chữ (kênh + DM). */
const CUSTOM_EMOJI_INLINE_PX = 22;
/** Emoji “jumbo” khi tin chỉ có emoji máy chủ (giống Discord). */
const CUSTOM_EMOJI_JUMBO_PX = 48;
const CUSTOM_EMOJI_JUMBO_MAX_COUNT = 3;

/**
 * Nếu toàn bộ tin (bỏ khoảng trắng) chỉ gồm 1–3 token :ten: và mỗi token đều có trong map → trả về kích thước jumbo.
 */
function getServerCustomEmojiRenderSizePx(
  text: string,
  map: Record<string, string>,
): number {
  const trimmed = text.trim();
  if (!trimmed) return CUSTOM_EMOJI_INLINE_PX;
  const stripped = trimmed.replace(/\s+/g, "");
  if (!stripped.length) return CUSTOM_EMOJI_INLINE_PX;
  if (!/^(:[a-zA-Z0-9_]{1,80}:)+$/.test(stripped)) return CUSTOM_EMOJI_INLINE_PX;
  const tokens = stripped.match(/:[a-zA-Z0-9_]{1,80}:/g) ?? [];
  if (
    tokens.length === 0 ||
    tokens.length > CUSTOM_EMOJI_JUMBO_MAX_COUNT
  ) {
    return CUSTOM_EMOJI_INLINE_PX;
  }
  const allResolved = tokens.every((t) => {
    const name = t.slice(1, -1).toLowerCase();
    return Boolean(map[name]);
  });
  return allResolved ? CUSTOM_EMOJI_JUMBO_PX : CUSTOM_EMOJI_INLINE_PX;
}

/** API getMessages sort createdAt:-1; UI chat cần cũ → mới (trên xuống dưới) để khớp append/socket. */
function sortServerMessagesAscending(messages: UIMessage[]): UIMessage[] {
  return [...messages].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
  );
}

function appendServerMessage(prev: UIMessage[], ui: UIMessage): UIMessage[] {
  if (prev.some((m) => m.id === ui.id)) return prev;
  return sortServerMessagesAscending([...prev, ui]);
}

// ✅ Helper function to check if avatar URL is valid
function isValidAvatarUrl(url: string | undefined): boolean {
  if (!url) return false;
  return url.startsWith("http://") || url.startsWith("https://");
}

function normalizeReactions(
  raw:
    | Array<{ userId: any; emoji: string }>
    | Array<{ userIds: string[]; emoji: string; count: number }>
    | undefined
    | null,
): MessageReaction[] | undefined {
  if (!raw || raw.length === 0) return undefined;

  const first: any = raw[0];
  // Already UI format
  if (first && Array.isArray(first.userIds) && typeof first.count === "number") {
    return raw as any;
  }

  // Backend format: [{ userId, emoji }]
  const map = new Map<string, Set<string>>();
  for (const r of raw as any[]) {
    const emoji = r.emoji;
    const userId =
      typeof r.userId === "string"
        ? r.userId
        : r.userId?._id?.toString?.() || r.userId?.toString?.();
    if (!emoji || !userId) continue;
    const set = map.get(emoji) || new Set<string>();
    set.add(userId);
    map.set(emoji, set);
  }

  return Array.from(map.entries()).map(([emoji, set]) => ({
    emoji,
    userIds: Array.from(set),
    count: set.size,
  }));
}

/** Force any media URL to HTTPS. Old records in DB may have http:// Cloudinary URLs. */
function toHttps(url: string): string {
  if (!url) return url;
  return url.startsWith("http://") ? "https://" + url.slice(7) : url;
}

function mapReplyToMessage(raw: any): UIMessage["replyToMessage"] {
  if (!raw || !raw._id) return null;
  const sender = raw.senderId;
  return {
    id: raw._id,
    senderId: typeof sender === "string" ? sender : sender?._id,
    senderDisplayName:
      typeof sender === "object" ? sender?.displayName || undefined : undefined,
    senderName: typeof sender === "object" ? sender?.username || "" : "",
    messageType: raw.type || "text",
    text: raw.content || "",
  };
}

function mapCallFieldsToUiMessage(msg: any): Partial<UIMessage> {
  const call = extractDmCallFields(msg as Record<string, unknown>);
  if (!call) return {};
  return {
    callType: call.callType,
    callStatus: call.callStatus,
    callDurationSec: call.callDurationSec,
    callInitiatorId: call.callInitiatorId,
  };
}

/** Đồng bộ logic gate xác minh với backend. */
function isServerAccessVerificationSatisfied(
  s: serversApi.MyServerAccessStatus | null | undefined,
): boolean {
  if (!s) return false;
  const lvl = s.verificationLevel ?? "none";
  if (lvl === "none") return true;
  const c = s.verificationChecks;
  if (!c) return false;
  if (lvl === "low") return Boolean(c.emailVerified);
  if (lvl === "medium") return Boolean(c.emailVerified && c.accountOver5Min);
  if (lvl === "high") {
    return Boolean(c.emailVerified && c.accountOver5Min && c.memberOver10Min);
  }
  return true;
}

export default function MessagesPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { t: tUser, language: userLanguage } = useLanguage();
  const tMsg = useTranslations("messages");

  const isAdminView = searchParams.get("from") === "admin";
  const adminReturnUrl = searchParams.get("returnUrl");
  const adminViewServerId = isAdminView ? searchParams.get("server") : null;
  const adminTokenFromUrl = isAdminView ? searchParams.get("adminToken") : null;
  const dmUserIdFromUrl = searchParams.get("dm");
  const dmDisplayNameFromUrl = searchParams.get("dmName") ?? "";
  const dmUsernameFromUrl = searchParams.get("dmUsername") ?? "";
  const dmAvatarFromUrl = searchParams.get("dmAvatar") ?? "";

  // Skip login redirect entirely for admin view
  const canRender = useRequireAuth({ skip: isAdminView });

  const [messagesShellTheme, setMessagesShellTheme] = useState<MessagesShellTheme>("dark");

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    setMessagesShellTheme(getMessagesShellTheme());
  }, []);

  useEffect(() => {
    const fn = () => setMessagesShellTheme(getMessagesShellTheme());
    const onChatSettings = () => setMessagesShellTheme(getMessagesShellTheme());
    window.addEventListener("cordigram-messages-shell-theme", fn);
    window.addEventListener("cordigram-chat-settings", onChatSettings);
    return () => {
      window.removeEventListener("cordigram-messages-shell-theme", fn);
      window.removeEventListener("cordigram-chat-settings", onChatSettings);
    };
  }, []);

  const messagesUiTone = useMessagesUiTone();
  const isLightMessagesUi = messagesUiTone === "light";

  const [servers, setServers] = useState<BackendServer[]>([]);
  const [selectedServer, setSelectedServer] = useState<string | null>(null);
  const serversRef = useRef(servers);
  serversRef.current = servers;
  const selectedServerRef = useRef(selectedServer);
  selectedServerRef.current = selectedServer;

  const serverScopedLanguage = useMemo((): LanguageCode | null => {
    if (!selectedServer) return null;
    const row = servers.find((s) => s._id === selectedServer);
    const override = getServerLanguageOverride(row, userLanguage);
    if (!override.enabled) return null;
    if (override.language === userLanguage) return null;
    return override.language;
  }, [selectedServer, servers, userLanguage]);

  const selectedServerRow = useMemo(
    () => (selectedServer ? servers.find((s) => s._id === selectedServer) ?? null : null),
    [selectedServer, servers],
  );

  const activeServerLangOverride = useMemo(
    () => getServerLanguageOverride(selectedServerRow, userLanguage),
    [selectedServerRow, userLanguage],
  );

  const language = (serverScopedLanguage ?? userLanguage) as LanguageCode;
  const t = useMemo(() => makeTranslator(language), [language]);
  /** Tránh dùng `currentServerPermissions` của server trước khi GET my-permissions xong (gây 403 join-applications + UI sai). */
  const prevSelectedServerForMyPermsRef = useRef<string | null>(null);
  const [infoChannels, setInfoChannels] = useState<serversApi.Channel[]>([]);
  const [textChannels, setTextChannels] = useState<serversApi.Channel[]>([]);
  const [voiceChannels, setVoiceChannels] = useState<serversApi.Channel[]>([]);
  const [serverCategories, setServerCategories] = useState<serversApi.ServerCategory[]>([]);
  const [allChannels, setAllChannels] = useState<serversApi.Channel[]>([]);
  const [showCreateCategoryModal, setShowCreateCategoryModal] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);

  // Permission: can this user reorder channels/categories?
  const [canDragChannels, setCanDragChannels] = useState(false);
  /** Quyền dùng @ (mentionEveryone / owner) — không ảnh hưởng xem tin khi người khác đề cập bạn. */
  const [canUseMentions, setCanUseMentions] = useState(false);

  // Drag-and-drop state
  const [dragType, setDragType] = useState<"category" | "channel" | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dragOverCategoryId, setDragOverCategoryId] = useState<string | null>(null);
  const [dragPosition, setDragPosition] = useState<"before" | "after" | "inside">("after");
  const [serverInteractionSettings, setServerInteractionSettings] = useState<serversApi.ServerInteractionSettings | null>(null);
  // Map userId -> displayColor (màu role cao nhất) cho server hiện tại
  const [memberRoleColors, setMemberRoleColors] = useState<Record<string, string>>({});
  /** Thành viên đủ username/displayName (getServerMembersWithRoles) cho gợi ý `from:` trong tìm tin nhắn server */
  const [membersForMessageSearch, setMembersForMessageSearch] = useState<
    Array<{ userId: string; displayName?: string; username?: string; avatarUrl?: string }>
  >([]);
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [messageText, setMessageText] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateServerModal, setShowCreateServerModal] = useState(false);
  const [serverName, setServerName] = useState("");
  const [showCreateChannelModal, setShowCreateChannelModal] = useState(false);
  const [createChannelDefaultType, setCreateChannelDefaultType] =
    useState<ChannelTypeForCreate>("text");
  const [createChannelSectionLabel, setCreateChannelSectionLabel] = useState<string>("Kênh Chat");
  const [createChannelCategoryId, setCreateChannelCategoryId] = useState<string | undefined>(undefined);
  const [serverContextMenu, setServerContextMenu] = useState<{
    x: number;
    y: number;
    server: BackendServer;
    permissions?: serversApi.CurrentUserServerPermissions;
  } | null>(null);
  const [adminServerContextMenu, setAdminServerContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [channelContextMenu, setChannelContextMenu] = useState<{
    x: number;
    y: number;
    channel: { _id: string; name: string; isDefault?: boolean };
    categoryId: string | null;
  } | null>(null);
  const [categoryContextMenu, setCategoryContextMenu] = useState<{
    x: number;
    y: number;
    category: { _id: string; name: string };
  } | null>(null);
  const [renamingCategoryId, setRenamingCategoryId] = useState<string | null>(null);
  const [renamingCategoryName, setRenamingCategoryName] = useState("");
  const renameCancelledRef = useRef(false);
  const [serverSettingsPermissions, setServerSettingsPermissions] =
    useState<serversApi.CurrentUserServerPermissions | null>(null);
  const [showServerSettingsPanel, setShowServerSettingsPanel] = useState(false);
  const [showServerProfileDropdown, setShowServerProfileDropdown] = useState(false);
  const serverProfileDropdownRef = useRef<HTMLDivElement>(null);
  const [serverSettingsTarget, setServerSettingsTarget] = useState<{
    serverId: string;
    serverName: string;
    initialSection?: ServerSettingsSection;
  } | null>(null);
  const serverSettingsTargetRef = useRef(serverSettingsTarget);
  serverSettingsTargetRef.current = serverSettingsTarget;
  const [communityEnabled, setCommunityEnabled] = useState(false);
  const [showAllChannels, setShowAllChannels] = useState(false);
  const [serverNotificationLevel, setServerNotificationLevel] = useState<"all" | "mentions" | "none">("all");
  /** Tên vai trò (không phải default) để áp dụng «Bỏ vai trò @mention» khi phát âm thanh tin nhắn kênh. */
  const [notificationRoleNames, setNotificationRoleNames] = useState<string[]>([]);
  const [currentServerPermissions, setCurrentServerPermissions] =
    useState<serversApi.CurrentUserServerPermissions | null>(null);
  const [currentServerPermissionsForId, setCurrentServerPermissionsForId] =
    useState<string | null>(null);
  const [sidebarPrefsTick, setSidebarPrefsTick] = useState(0);
  const bumpSidebarPrefs = useCallback(() => setSidebarPrefsTick((t) => t + 1), []);
  const [wavingIds, setWavingIds] = useState<Set<string>>(new Set());

  // Mention system
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionKeyword, setMentionKeyword] = useState("");
  const [mentionSuggestions, setMentionSuggestions] = useState<serversApi.MentionSuggestion[]>([]);
  const [mentionActiveIndex, setMentionActiveIndex] = useState(0);
  const [mentionStartPos, setMentionStartPos] = useState(-1);
  const mentionFetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);
  const [showEventsPopup, setShowEventsPopup] = useState(false);
  const [showCreateEventWizard, setShowCreateEventWizard] = useState(false);
  const [showEventImageEditor, setShowEventImageEditor] = useState(false);
  const [eventImageEditorCurrentUrl, setEventImageEditorCurrentUrl] = useState<string | null>(null);
  const eventImageEditorResolveRef = useRef<((url: string | null) => void) | null>(null);
  const [shareEventLink, setShareEventLink] = useState<string>("");
  const [showShareEventPopup, setShowShareEventPopup] = useState(false);
  const [showMessagesInbox, setShowMessagesInbox] = useState(false);
  const [showMessageSearch, setShowMessageSearch] = useState(false);
  /** true = popup tìm tin từ header DM: chỉ nội dung, không @/#/!/*. */
  const [messageSearchDmConversationOnly, setMessageSearchDmConversationOnly] = useState(false);
  /** Có lời mời hoặc nội dung mới trong Hộp thư (Dành cho Bạn) → hiển thị chấm đỏ trên nút hộp thư. */
  const [hasInboxNotification, setHasInboxNotification] = useState(false);
  const [createdEventDetail, setCreatedEventDetail] = useState<serversApi.ServerEvent | null>(null);
  const [activeServerEvents, setActiveServerEvents] = useState<serversApi.ServerEvent[]>([]);
  /** Tổng số sự kiện (active + upcoming) để hiển thị badge bên cạnh "Sự Kiện", không giảm khi user đóng banner Đang Diễn Ra */
  const [serverEventsTotalCount, setServerEventsTotalCount] = useState(0);
  const [showJoinApplicationsView, setShowJoinApplicationsView] = useState(false);
  const [showExploreView, setShowExploreView] = useState(false);
  const [showBoostUpgradeView, setShowBoostUpgradeView] = useState(false);
  const [joinApplicationsRefreshTick, setJoinApplicationsRefreshTick] = useState(0);
  const [joinAppPendingCount, setJoinAppPendingCount] = useState(0);
  const [selectedEventDetail, setSelectedEventDetail] = useState<serversApi.ServerEvent | null>(null);
  const [eventDetailInterested, setEventDetailInterested] = useState(false);

  const [boostModalOpen, setBoostModalOpen] = useState(false);
  const [boostModalStep, setBoostModalStep] = useState<"plan" | "billing">("plan");
  const [boostMode, setBoostMode] = useState<"subscribe" | "gift">("subscribe");
  const [boostTier, setBoostTier] = useState<"basic" | "boost">("boost");
  const [boostBillingCycle, setBoostBillingCycle] = useState<"monthly" | "yearly">("monthly");
  const [boostRecipientUserId, setBoostRecipientUserId] = useState<string | null>(null);
  const [boostUserQuery, setBoostUserQuery] = useState("");
  const [boostUsers, setBoostUsers] = useState<any[]>([]);
  const [boostActivePeriodWarnOpen, setBoostActivePeriodWarnOpen] =
    useState(false);
  const [boostTierSwitchWarnOpen, setBoostTierSwitchWarnOpen] =
    useState(false);
  const [boostCheckoutBusy, setBoostCheckoutBusy] = useState(false);

  useEffect(() => {
    if (selectedEventDetail) setEventDetailInterested(false);
  }, [selectedEventDetail?._id]);

  useEffect(() => {
    if (!boostModalOpen) return;
    if (boostMode !== "gift") return;
    getAvailableUsers()
      .then((res) => setBoostUsers(Array.isArray(res) ? res : []))
      .catch(() => setBoostUsers([]));
  }, [boostModalOpen, boostMode]);

  useEffect(() => {
    if (!boostModalOpen) {
      setBoostActivePeriodWarnOpen(false);
      setBoostTierSwitchWarnOpen(false);
      setBoostCheckoutBusy(false);
    }
  }, [boostModalOpen]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const newMessagesPillRef = useRef<HTMLButtonElement>(null);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [friends, setFriends] = useState<serversApi.Friend[]>([]);
  const [selectedDirectMessageFriend, setSelectedDirectMessageFriend] =
    useState<serversApi.Friend | null>(null);

  const settingsServerRow = useMemo(
    () =>
      serverSettingsTarget?.serverId
        ? servers.find((s) => s._id === serverSettingsTarget.serverId) ?? null
        : null,
    [serverSettingsTarget?.serverId, servers],
  );

  const settingsLangOverride = useMemo(
    () => getServerLanguageOverride(settingsServerRow, userLanguage),
    [settingsServerRow, userLanguage],
  );

  const contextMenuServerRow = useMemo(
    () =>
      serverContextMenu?.server._id
        ? servers.find((s) => s._id === serverContextMenu.server._id) ??
          serverContextMenu.server
        : null,
    [serverContextMenu, servers],
  );

  const contextMenuLangOverride = useMemo(
    () => getServerLanguageOverride(contextMenuServerRow, userLanguage),
    [contextMenuServerRow, userLanguage],
  );

  const serverChatLangOverrideActive =
    activeServerLangOverride.enabled &&
    Boolean(selectedServer) &&
    !selectedDirectMessageFriend &&
    !showExploreView &&
    !showBoostUpgradeView &&
    !showJoinApplicationsView;

  const autoOpenedDmUserRef = useRef<string | null>(null);
  // Access Control (server rules approval modal)
  const [myServerAccessStatus, setMyServerAccessStatus] =
    useState<serversApi.MyServerAccessStatus | null>(null);
  const [verificationRulesOpen, setVerificationRulesOpen] = useState(false);
  const [verificationAccessSettings, setVerificationAccessSettings] =
    useState<serversApi.ServerAccessSettings | null>(null);
  const [verificationRulesAgreed, setVerificationRulesAgreed] = useState(false);
  const [verificationRulesSubmitting, setVerificationRulesSubmitting] = useState(false);
  const [ageAcknowledgeLoading, setAgeAcknowledgeLoading] = useState(false);
  const isAgeRestrictedRef = useRef(false);
  const [localWaitAccountSec, setLocalWaitAccountSec] = useState<number | null>(null);
  const [localWaitMemberSec, setLocalWaitMemberSec] = useState<number | null>(null);
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [emailOtpCode, setEmailOtpCode] = useState("");
  const [emailOtpSending, setEmailOtpSending] = useState(false);
  const [emailOtpVerifying, setEmailOtpVerifying] = useState(false);
  const [emailOtpError, setEmailOtpError] = useState<string | null>(null);
  const [emailOtpCooldown, setEmailOtpCooldown] = useState(0);
  const [dmProfileSidebarOpen, setDmProfileSidebarOpen] = useState(true);
  const [dmProfilePopupUserId, setDmProfilePopupUserId] = useState<string | null>(null);
  const [dmProfileDetail, setDmProfileDetail] = useState<MessagingProfileCardResponse | null>(null);
  const [inviteToServerTarget, setInviteToServerTarget] = useState<{
    serverId: string;
    serverName: string;
    canCreateInvite: boolean;
  } | null>(null);
  const [inviteToServerCandidates, setInviteToServerCandidates] = useState<serversApi.Friend[]>([]);
  const [inviteToServerInitialInvitedIds, setInviteToServerInitialInvitedIds] = useState<string[]>([]);
  const [voiceChannelCallToken, setVoiceChannelCallToken] = useState<string | null>(null);
  const [voiceChannelCallServerUrl, setVoiceChannelCallServerUrl] = useState<string>("");
  const [voiceChannelCallError, setVoiceChannelCallError] = useState<string | null>(null);
  const [voiceChannelParticipants, setVoiceChannelParticipants] = useState<
    Record<string, { identity: string; name: string }[]>
  >({});
  const [conversations, setConversations] = useState<Map<string, UIMessage[]>>(
    new Map(),
  );
  const [pendingMessageJump, setPendingMessageJump] =
    useState<PendingMessageJump | null>(null);
  const [highlightedJumpMessageId, setHighlightedJumpMessageId] = useState<string | null>(null);
  const jumpHighlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Unread count per DM conversation (userId -> count). Updated from getConversationList; cleared when user opens chat. */
  const [dmUnreadCounts, setDmUnreadCounts] = useState<Record<string, number>>({});
  /** Thời điểm tin nhắn DM gần nhất theo peer — dùng sắp xếp danh sách (mới nhất lên đầu). */
  const [dmPeerLastActivityAt, setDmPeerLastActivityAt] = useState<
    Record<string, number>
  >({});
  const [loadingDirectMessages, setLoadingDirectMessages] = useState(false);
  const [token, setToken] = useState<string>("");
  const [showMessagesUserSettings, setShowMessagesUserSettings] =
    useState(false);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [dmConversationPrefs, setDmConversationPrefs] = useState<
    Record<string, DmConversationPreferences>
  >({});
  const [dmBlockedByMe, setDmBlockedByMe] = useState<Set<string>>(new Set());
  const [dmBlockedByPeer, setDmBlockedByPeer] = useState<Set<string>>(new Set());
  const dmBlockedByMeRef = useRef<Set<string>>(new Set());
  const dmBlockedByPeerRef = useRef<Set<string>>(new Set());
  const dmBlockFetchGenRef = useRef(0);
  dmBlockedByMeRef.current = dmBlockedByMe;
  dmBlockedByPeerRef.current = dmBlockedByPeer;

  const persistDmBlockState = useCallback(
    (byMe: Set<string>, byPeer: Set<string>) => {
      if (!currentUserId) return;
      try {
        sessionStorage.setItem(
          `cordigram:dm-blocks:${currentUserId}`,
          JSON.stringify({ byMe: [...byMe], byPeer: [...byPeer] }),
        );
      } catch {
        /* ignore */
      }
    },
    [currentUserId],
  );

  const applyDmBlockSets = useCallback(
    (byMe: Set<string>, byPeer: Set<string>) => {
      dmBlockedByMeRef.current = byMe;
      dmBlockedByPeerRef.current = byPeer;
      setDmBlockedByMe(byMe);
      setDmBlockedByPeer(byPeer);
      persistDmBlockState(byMe, byPeer);
    },
    [persistDmBlockState],
  );

  const applyDmBlockSetsFromApi = useCallback(
    (byMe: Set<string>, byPeer: Set<string>, gen: number) => {
      if (gen !== dmBlockFetchGenRef.current) return;
      applyDmBlockSets(byMe, byPeer);
    },
    [applyDmBlockSets],
  );

  const applyDmBlockSetsLive = useCallback(
    (byMe: Set<string>, byPeer: Set<string>) => {
      dmBlockFetchGenRef.current += 1;
      applyDmBlockSets(byMe, byPeer);
    },
    [applyDmBlockSets],
  );

  const refreshDmBlockState = useCallback(async () => {
    if (!token) return;
    const gen = ++dmBlockFetchGenRef.current;
    try {
      const list = await getConversationList({ token });
      if (gen !== dmBlockFetchGenRef.current) return;
      const byMe = new Set<string>();
      const byPeer = new Set<string>();
      list.forEach((c) => {
        const peerId = String(c.userId ?? "");
        if (!peerId) return;
        if (c.isBlockedByMe) byMe.add(peerId);
        if (c.isBlockedByPeer) byPeer.add(peerId);
      });
      applyDmBlockSetsFromApi(byMe, byPeer, gen);
    } catch {
      /* ignore */
    }
  }, [token, applyDmBlockSetsFromApi]);
  const [dmContextMenu, setDmContextMenu] = useState<{
    x: number;
    y: number;
    friend: {
      _id: string;
      displayName?: string;
      username?: string;
    };
  } | null>(null);
  const [chatUserSettings, setChatUserSettings] =
    useState<UserSettingsResponse | null>(null);
  const [maxUploadBytes, setMaxUploadBytes] = useState<number>(
    DEFAULT_FREE_MAX_UPLOAD_BYTES,
  );
  const [boostStatus, setBoostStatus] = useState<BoostStatusResponse | null>(null);
  /** `supported` sau GET /health hoặc gửi sticker DM thành công; `unsupported` khi API cũ từ chối field sticker. */
  const [dmApiServerStickerSupport, setDmApiServerStickerSupport] = useState<
    "unknown" | "supported" | "unsupported"
  >("unknown");

  const submitMessagesBoostCheckout = useCallback(
    async (opts?: { skipTierChangeConfirm?: boolean }) => {
      if (
        !opts?.skipTierChangeConfirm &&
        boostMode === "subscribe" &&
        boostStatus?.active &&
        boostStatus.tier &&
        boostTier !== boostStatus.tier
      ) {
        setBoostTierSwitchWarnOpen(true);
        return;
      }
      if (!token) {
        showNoticePopup("Bạn cần đăng nhập để thanh toán.");
        return;
      }
      try {
        setBoostCheckoutBusy(true);
        const actionType =
          boostMode === "gift" ? "boost_gift" : "boost_subscribe";
        const payload: CreateStripeCheckoutSessionRequest = {
          actionType,
          boostTier,
          billingCycle: boostBillingCycle,
          boostScope: "messages",
          currency: "vnd",
        };
        if (boostMode === "gift" && boostRecipientUserId) {
          payload.recipientUserId = boostRecipientUserId;
        }
        const session = await createStripeCheckoutSession({
          token,
          payload,
        });
        if (session?.url) {
          window.location.href = session.url;
          return;
        }
        showNoticePopup("Không thể mở trang thanh toán.");
      } catch (e: unknown) {
        const err = e as { message?: string };
        showNoticePopup(err?.message || "Thanh toán thất bại.");
      } finally {
        setBoostCheckoutBusy(false);
      }
    },
    [
      token,
      boostMode,
      boostTier,
      boostBillingCycle,
      boostRecipientUserId,
      boostStatus,
    ],
  );

  const goToBoostBillingStep = useCallback(() => {
    if (
      boostMode === "subscribe" &&
      boostStatus?.active &&
      boostStatus.expiresAt
    ) {
      setBoostActivePeriodWarnOpen(true);
      return;
    }
    setBoostModalStep("billing");
  }, [boostMode, boostStatus]);

  const [dmSidebarPeersModeState, setDmSidebarPeersModeState] = useState<
    "all" | "online"
  >(() =>
    typeof window !== "undefined" ? getDmSidebarPeersMode() : "all",
  );
  const [currentUserProfile, setCurrentUserProfile] = useState<any>(null);
  const [currentMessagingProfile, setCurrentMessagingProfile] =
    useState<MessagingProfileCardResponse | null>(null);
  const [myServerChannelDisplayStyle, setMyServerChannelDisplayStyle] = useState<{
    displayNameFontId?: string | null;
    displayNameEffectId?: string | null;
    displayNamePrimaryHex?: string | null;
    displayNameAccentHex?: string | null;
  } | null>(null);
  /** Kiểu tên Boost lưu ở hồ sơ messaging; ghép vào nguồn style thanh sidebar để khớp token nền sáng/tối. */
  const selfSidebarDisplayStyleSource = useMemo(() => {
    const base = currentUserProfile;
    if (!base) return null;
    const mp = currentMessagingProfile;
    if (!mp) return base;
    return {
      ...base,
      displayNameFontId: mp.displayNameFontId ?? base.displayNameFontId,
      displayNameEffectId: mp.displayNameEffectId ?? base.displayNameEffectId,
      displayNamePrimaryHex: mp.displayNamePrimaryHex ?? base.displayNamePrimaryHex,
      displayNameAccentHex: mp.displayNameAccentHex ?? base.displayNameAccentHex,
    };
  }, [currentUserProfile, currentMessagingProfile]);
  /** Hồ sơ chính trong Messages (DM) — không dùng avatar/tên social. */
  const selfMessagingIdentity = useMemo(() => {
    const mp = currentMessagingProfile;
    const social = currentUserProfile;
    const displayName =
      (mp?.displayName && mp.displayName.trim()) ||
      social?.displayName ||
      social?.username ||
      "";
    const chatUsername =
      (mp?.chatUsername && mp.chatUsername.trim()) ||
      social?.username ||
      "";
    const avatarUrl =
      (mp?.avatarUrl && mp.avatarUrl.trim()) ||
      social?.avatarUrl ||
      social?.avatar ||
      "";
    return {
      displayName,
      chatUsername,
      username: chatUsername,
      avatarUrl,
      avatar: avatarUrl,
      displayNameFontId: mp?.displayNameFontId ?? social?.displayNameFontId,
      displayNameEffectId: mp?.displayNameEffectId ?? social?.displayNameEffectId,
      displayNamePrimaryHex: mp?.displayNamePrimaryHex ?? social?.displayNamePrimaryHex,
      displayNameAccentHex: mp?.displayNameAccentHex ?? social?.displayNameAccentHex,
    };
  }, [currentMessagingProfile, currentUserProfile]);
  const resolveMessageSenderStyle = useCallback(
    (message: UIMessage): React.CSSProperties | undefined => {
      const directFriend =
        selectedDirectMessageFriend &&
        String(selectedDirectMessageFriend._id) === String(message.senderId)
          ? selectedDirectMessageFriend
          : null;
      const directProfile =
        dmProfileDetail &&
        String(dmProfileDetail.userId) === String(message.senderId)
          ? dmProfileDetail
          : null;
      const sidebarFriend = friends.find((f) => String(f._id) === String(message.senderId));
      const selfDmSource =
        message.isFromCurrentUser
          ? selectedDirectMessageFriend
            ? currentMessagingProfile
            : selectedServer && myServerChannelDisplayStyle
              ? {
                  ...selfMessagingIdentity,
                  displayNameFontId:
                    myServerChannelDisplayStyle.displayNameFontId ??
                    selfMessagingIdentity.displayNameFontId,
                  displayNameEffectId:
                    myServerChannelDisplayStyle.displayNameEffectId ??
                    selfMessagingIdentity.displayNameEffectId,
                  displayNamePrimaryHex:
                    myServerChannelDisplayStyle.displayNamePrimaryHex ??
                    selfMessagingIdentity.displayNamePrimaryHex,
                  displayNameAccentHex:
                    myServerChannelDisplayStyle.displayNameAccentHex ??
                    selfMessagingIdentity.displayNameAccentHex,
                }
              : selfMessagingIdentity
          : null;
      const baseProfile =
        selfDmSource ||
        (message.isFromCurrentUser ? selfMessagingIdentity : null) ||
        directProfile ||
        directFriend ||
        sidebarFriend ||
        null;
      const fromMessage = {
        displayNameFontId: message.senderDisplayNameFontId,
        displayNameEffectId: message.senderDisplayNameEffectId,
        displayNamePrimaryHex: message.senderDisplayNamePrimaryHex,
        displayNameAccentHex: message.senderDisplayNameAccentHex,
      };
      const source = baseProfile
        ? {
            displayNameFontId:
              fromMessage.displayNameFontId ?? (baseProfile as any).displayNameFontId,
            displayNameEffectId:
              fromMessage.displayNameEffectId ?? (baseProfile as any).displayNameEffectId,
            displayNamePrimaryHex:
              fromMessage.displayNamePrimaryHex ?? (baseProfile as any).displayNamePrimaryHex,
            displayNameAccentHex:
              fromMessage.displayNameAccentHex ?? (baseProfile as any).displayNameAccentHex,
          }
        : fromMessage;
      return getDisplayNameTextStyle(source, messagesShellTheme);
    },
    [
      selfMessagingIdentity,
      currentMessagingProfile,
      myServerChannelDisplayStyle,
      selectedServer,
      dmProfileDetail,
      selectedDirectMessageFriend,
      friends,
      messagesShellTheme,
    ],
  );
  const [passkeyRequired, setPasskeyRequired] = useState(false);
  const [passkeyChecking, setPasskeyChecking] = useState(false);
  const [deviceId, setDeviceId] = useState("");
  const [passkeyInput, setPasskeyInput] = useState("");
  const [passkeyError, setPasskeyError] = useState<string | null>(null);
  const [passkeySubmitting, setPasskeySubmitting] = useState(false);

  // Media picker states
  const [showGiphyPicker, setShowGiphyPicker] = useState(false);
  const [mediaPickerTab, setMediaPickerTab] = useState<MediaPickerTab>("gif");
  const [serverEmojiRenderMap, setServerEmojiRenderMap] = useState<
    Record<string, string>
  >({});
  const [showPlusMenu, setShowPlusMenu] = useState(false);

  // Chat media viewer
  const [mediaViewerState, setMediaViewerState] = useState<{
    items: ChatMediaItem[];
    index: number;
  } | null>(null);

  // Voice recording states
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [isUploadingVoice, setIsUploadingVoice] = useState(false);

  /** Tắt/bật mic và loa trong thanh voice controls (dùng cả khi xem DM và khi ở server). */
  const [voiceMicMuted, setVoiceMicMuted] = useState(false);
  const [voiceSoundMuted, setVoiceSoundMuted] = useState(false);
  /** Lưu trạng thái mute theo từng kênh thoại (serverId:channelId). */
  const [voiceMuteByChannel, setVoiceMuteByChannel] = useState<
    Record<string, { micMuted: boolean; soundMuted: boolean }>
  >({});
  /** Kênh thoại đang kết nối LiveKit (giữ khi user chuyển sang kênh chat). */
  const [joinedVoiceChannelId, setJoinedVoiceChannelId] = useState<string | null>(null);

  // Poll states
  const [showCreatePollModal, setShowCreatePollModal] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [pollDuration, setPollDuration] = useState(24);
  const [pollAllowMultiple, setPollAllowMultiple] = useState(false);

  // Message reactions and actions states
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const [showReactionPicker, setShowReactionPicker] = useState<{
    messageId: string;
    position: { top?: number; bottom?: number; left?: number; right?: number };
  } | null>(null);
  const [showActionsMenu, setShowActionsMenu] = useState<{
    messageId: string;
    position: { top?: number; bottom?: number; left?: number; right?: number };
    isOwnMessage: boolean;
    isPinned: boolean;
  } | null>(null);
  const [showReportDialog, setShowReportDialog] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<UIMessage | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastActionLabel, setToastActionLabel] = useState<string | null>(null);
  const [toastActionHandler, setToastActionHandler] = useState<(() => void) | null>(
    null,
  );
  const [noticePopupMessage, setNoticePopupMessage] = useState<string | null>(
    null,
  );
  const [detailsPanelOpen, setDetailsPanelOpen] = useState(false);
  const [pinnedModalOpen, setPinnedModalOpen] = useState(false);
  const [pinnedModalLoading, setPinnedModalLoading] = useState(false);
  const [pinnedModalTitle, setPinnedModalTitle] = useState("Tin nhắn đã ghim");
  const [pinnedModalItems, setPinnedModalItems] = useState<UIMessage[]>([]);
  const [pinInlineNoticeOpen, setPinInlineNoticeOpen] = useState(false);
  const [pinInlineNoticeMessage, setPinInlineNoticeMessage] = useState(
    "Bạn đã ghim một tin nhắn.",
  );
  const pinInlineNoticeTimerRef = useRef<number | null>(null);
  const [channelProfileContext, setChannelProfileContext] =
    useState<ChannelProfileAnchorContext | null>(null);
  const showNoticePopup = useCallback((message: string) => {
    setNoticePopupMessage(message);
  }, []);

  // Call states — each active call lives in its own /call tab (per peer)
  const [activeCallTabPeers, setActiveCallTabPeers] = useState<string[]>([]);
  const errorDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const showTransientError = useCallback((message: string, ms = 5000) => {
    if (errorDismissTimerRef.current) {
      clearTimeout(errorDismissTimerRef.current);
    }
    setError(message);
    errorDismissTimerRef.current = setTimeout(() => {
      setError((prev) => (prev === message ? null : prev));
      errorDismissTimerRef.current = null;
    }, ms);
  }, []);
  const [incomingCall, setIncomingCall] = useState<{
    from: string;
    type: "audio" | "video";
    callerInfo: {
      userId: string;
      username: string;
      displayName: string;
      avatar?: string;
    };
    status?: "incoming" | "cancelled" | "accepted";
    roomName?: string;
    callId?: string;
  } | null>(null);
  type OutgoingCallEntry = {
    to: string;
    toUser: {
      displayName: string;
      username: string;
      avatarUrl?: string;
    };
    type: "audio" | "video";
    status: "calling" | "rejected" | "no-answer" | "answered";
    roomName?: string;
    callId?: string;
  };

  const [outgoingCallsByPeer, setOutgoingCallsByPeer] = useState<
    Record<string, OutgoingCallEntry>
  >({});

  /** Refs for call socket effect — avoid wrong incoming UI / stale deps (glare, self) */
  const outgoingCallsByPeerRef = useRef(outgoingCallsByPeer);
  const callIdsByPeerRef = useRef<Record<string, string>>({});
  const dmCallSessionsRef = useRef<DmCallSessionSyncItem[]>([]);
  const continueCallOnThisDeviceRef = useRef<
    (peerId: string, session?: DmCallSessionSyncItem) => Promise<void>
  >(async () => {});
  const openedCallTabPeersRef = useRef<Set<string>>(new Set());
  const openingCallTabForPeerRef = useRef<Set<string>>(new Set());
  const callTabIdRef = useRef<string>("");
  if (!callTabIdRef.current && typeof window !== "undefined") {
    callTabIdRef.current = getCallTabId();
  }
  const currentUserIdRef = useRef(currentUserId);
  const dismissOutgoingCallPopup = useCallback((peerId: string) => {
    setOutgoingCallsByPeer((prev) => {
      if (!prev[peerId]) return prev;
      const next = { ...prev };
      delete next[peerId];
      outgoingCallsByPeerRef.current = next;
      return next;
    });
  }, []);
  const isCallTabActiveForPeer = useCallback((peerId: string) => {
    return openedCallTabPeersRef.current.has(peerId);
  }, []);
  const markCallTabOpen = useCallback((peerId: string, callId?: string) => {
    openedCallTabPeersRef.current.add(peerId);
    addActiveDmCallPeer(peerId);
    setActiveCallTabPeers((prev) =>
      prev.includes(peerId) ? prev : [...prev, peerId],
    );
    const resolvedCallId = callId || callIdsByPeerRef.current[peerId];
    if (resolvedCallId) {
      setActiveDmCallIdForHeartbeat(resolvedCallId);
    }
    dismissOutgoingCallPopup(peerId);
  }, [dismissOutgoingCallPopup]);
  const markCallTabClosed = useCallback((peerId: string) => {
    openedCallTabPeersRef.current.delete(peerId);
    removeActiveDmCallPeer(peerId);
    delete callIdsByPeerRef.current[peerId];
    setActiveCallTabPeers((prev) => prev.filter((id) => id !== peerId));
    if (openedCallTabPeersRef.current.size === 0) {
      setActiveDmCallIdForHeartbeat(null);
    }
  }, []);
  useEffect(() => {
    outgoingCallsByPeerRef.current = outgoingCallsByPeer;
  }, [outgoingCallsByPeer]);
  useEffect(() => {
    currentUserIdRef.current = currentUserId;
  }, [currentUserId]);

  // Typing indicator
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isTypingRef = useRef(false); // ✅ Track typing state
  const shouldAutoScrollRef = useRef(true); // Track if we should auto-scroll
  const pendingConversationScrollRef = useRef(false);
  const [showNewMessagesBelow, setShowNewMessagesBelow] = useState(false);

  const scrollChatToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    scrollChatContainerToBottom(messagesContainerRef.current, behavior);
  }, []);

  const isChatScrolledNearBottom = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return true;
    return isChatNearBottom(el, CHAT_SCROLL_BOTTOM_THRESHOLD_PX);
  }, []);

  const scheduleScrollToBottom = useCallback(
    (behavior: ScrollBehavior = "auto") => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => scrollChatToBottom(behavior));
      });
    },
    [scrollChatToBottom],
  );

  const handleJumpToLatestMessages = useCallback(() => {
    shouldAutoScrollRef.current = true;
    setShowNewMessagesBelow(false);
    pendingConversationScrollRef.current = false;
    scheduleScrollToBottom("smooth");
  }, [scheduleScrollToBottom]);

  const prepareScrollToLatest = useCallback(() => {
    shouldAutoScrollRef.current = true;
    pendingConversationScrollRef.current = true;
    setShowNewMessagesBelow(false);
  }, []);

  useEffect(() => {
    if (!showNewMessagesBelow) return;
    const pill = newMessagesPillRef.current;
    if (!pill) return;
    const sync = () => syncMessagesChromeVars(pill);
    sync();
    window.addEventListener("cordigram-messages-chrome", sync);
    window.addEventListener("cordigram-messages-shell-theme", sync);
    window.addEventListener("cordigram-chat-settings", sync);
    return () => {
      window.removeEventListener("cordigram-messages-chrome", sync);
      window.removeEventListener("cordigram-messages-shell-theme", sync);
      window.removeEventListener("cordigram-chat-settings", sync);
    };
  }, [showNewMessagesBelow]);

  /** Tránh xử lý lại cùng một tin socket khi effect re-run (gây badge 99+). */
  const processedIncomingDmIdsRef = useRef<Set<string>>(new Set());
  /** Hội thoại đã mở/đánh dấu đọc — giữ badge 0 khi API chưa kịp cập nhật. */
  const dmReadPeersRef = useRef<Set<string>>(new Set());
  const friendsRef = useRef(friends);
  friendsRef.current = friends;
  const selectedDmFriendRef = useRef(selectedDirectMessageFriend);
  selectedDmFriendRef.current = selectedDirectMessageFriend;

  // Use direct messages hook
  const {
    isConnected,
    newMessage,
    messageSent,
    sendMessage: emitSendMessage,
    onlineUsers,
    presenceByUserId,
    subscribePresence,
    userTyping,
    notifyTyping,
    messagesRead,
    reactionUpdate,
    markAsRead,
    markAllAsRead,
    callEvent,
    callBusy,
    callEnded,
    callIncomingDismiss,
    callSessionsSync,
    callMediaTransferred,
    messageDeleted,
    dmUnreadCountEvent,
    dmBlockUpdatedEvent,
    initiateCall,
    answerCall,
    rejectCall,
    endCall,
    claimCallMedia,
    emitDeleteMessage,
  } = useDirectMessages({
    userId: currentUserId,
    token,
  });

  // DM presence subscriptions (only peers we render in DM list)
  useEffect(() => {
    if (!selectedServer && typeof subscribePresence === "function") {
      const ids = Array.isArray(friends) ? friends.map((f) => f._id).filter(Boolean) : [];
      subscribePresence(ids);
    }
  }, [friends, selectedServer, subscribePresence]);

  const prevChannelRef = useRef<string | null>(null);
  /** Luôn là kênh đang chọn (tránh closure cũ sau await trong loadMessages). */
  const selectedChannelRef = useRef<string | null>(null);
  const loadMessagesSeqRef = useRef(0);
  const lastLoadedMessagesChannelRef = useRef<string | null>(null);
  const loadChannelsSeqRef = useRef(0);
  /** Chọn kênh cụ thể ngay sau khi đổi server (tìm kiếm / deep link). */
  const pendingChannelSelectRef = useRef<{ serverId: string; channelId: string } | null>(
    null,
  );
  useEffect(() => {
    selectedChannelRef.current = selectedChannel;
  }, [selectedChannel]);
  const escapeMessageSelectorValue = useCallback((value: string) => {
    if (typeof window !== "undefined" && typeof window.CSS?.escape === "function") {
      return window.CSS.escape(value);
    }
    return value.replace(/["\\]/g, "\\$&");
  }, []);
  const scrollToMessageBubble = useCallback(
    (messageId: string) => {
      const container = messagesContainerRef.current;
      if (!container) return false;
      const selector = `[data-message-id="${escapeMessageSelectorValue(messageId)}"]`;
      const el = container.querySelector(selector) as HTMLElement | null;
      if (!el) return false;
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      setHighlightedJumpMessageId(messageId);
      if (jumpHighlightTimerRef.current) clearTimeout(jumpHighlightTimerRef.current);
      jumpHighlightTimerRef.current = setTimeout(() => {
        setHighlightedJumpMessageId((prev) => (prev === messageId ? null : prev));
      }, 2200);
      return true;
    },
    [escapeMessageSelectorValue],
  );

  // DM sidebar: hồ sơ messaging của người đang chat + mutual servers / member since.
  useEffect(() => {
    let cancelled = false;
    const uid = selectedDirectMessageFriend?._id;
    if (!uid || !token) {
      setDmProfileDetail(null);
      return;
    }
    fetchMessagingProfileByUserId({ token, userId: uid })
      .then((d) => {
        if (!cancelled) setDmProfileDetail(d);
      })
      .catch(() => {
        if (!cancelled) setDmProfileDetail(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedDirectMessageFriend?._id, token]);

  const dmSidebarIdentity = useMemo(() => {
    const d = dmProfileDetail;
    const f = selectedDirectMessageFriend;
    if (!f) return null;
    return {
      avatarUrl: d?.avatarUrl || f.avatarUrl,
      displayName: (d?.displayName && d.displayName.trim()) || f.displayName || f.username,
      username: (d?.chatUsername && d.chatUsername.trim()) || f.username,
      bio: (d?.bio && d.bio.trim()) || (f.bio && String(f.bio).trim()) || "",
    };
  }, [dmProfileDetail, selectedDirectMessageFriend]);

  const {
    isConnected: isChannelSocketConnected,
    newMessageChannel,
    messageUpdatedChannel,
    reactionUpdateChannel,
    channelNotification,
    inboxForYouItem,
    serverDeleted,
    joinChannel,
    leaveChannel,
    clearNewMessageChannel,
    clearMessageUpdatedChannel,
    clearChannelNotification,
    clearInboxForYouItem,
    clearServerDeleted,
    channelMessageDeleted,
  } = useChannelMessages({ token });

  const inboxRefetchTimerRef = useRef<number | null>(null);
  const scheduleInboxDotRefresh = useCallback(() => {
    if (typeof window === "undefined") return;
    if (inboxRefetchTimerRef.current != null) {
      window.clearTimeout(inboxRefetchTimerRef.current);
    }
    inboxRefetchTimerRef.current = window.setTimeout(() => {
      fetchInboxForYou()
        .then((res) => {
          const hasUnread = (res.items ?? []).some((i) => i.seen !== true);
          setHasInboxNotification(hasUnread);
        })
        .catch(() => undefined);
    }, 400);
  }, []);

  // Realtime: when a channel notification arrives, show inbox dot immediately (no reload).
  useEffect(() => {
    if (!channelNotification) return;
    setHasInboxNotification(true);
    scheduleInboxDotRefresh();

    const desktopEnabled = isMessagesDesktopNotificationsEnabled(chatUserSettings);
    if (
      desktopEnabled &&
      channelNotification.isMention === true &&
      channelNotification.messageId &&
      channelNotification.serverId &&
      channelNotification.channelId
    ) {
      const viewingSameChannel =
        typeof document !== "undefined" &&
        document.hasFocus() &&
        selectedServerRef.current === channelNotification.serverId &&
        selectedChannelRef.current === channelNotification.channelId;

      if (!viewingSameChannel) {
        showMentionDesktopNotification({
          messageId: channelNotification.messageId,
          senderName: channelNotification.senderName || "Ai đó",
          channelName: channelNotification.channelName || "general",
          serverName: channelNotification.serverName || "Máy chủ",
          excerpt: channelNotification.excerpt || "",
          senderAvatarUrl: channelNotification.senderAvatarUrl,
          enabled: desktopEnabled,
          onNavigate: () => {
            router.push(
              `/messages?server=${channelNotification.serverId}&channel=${channelNotification.channelId}`,
            );
          },
        });
      }
    }

    clearChannelNotification();
  }, [
    channelNotification,
    clearChannelNotification,
    scheduleInboxDotRefresh,
    chatUserSettings,
    router,
  ]);

  const inboxDesktopCopy = useMemo<MessagesDesktopNotificationCopy>(
    () => ({
      eventTitleLine: (topic, serverName) =>
        t("settings.notifications.desktopEventTitleLine")
          .replace("{topic}", topic)
          .replace("{server}", serverName),
      eventBody: (topic, startAt) => {
        if (!startAt) return topic;
        try {
          const when = new Date(startAt).toLocaleString(
            localeTagForLanguage(language),
            { dateStyle: "medium", timeStyle: "short" },
          );
          return t("settings.notifications.desktopEventBody").replace(
            "{when}",
            when,
          );
        } catch {
          return topic;
        }
      },
      roleTitleLine: (serverName) =>
        t("settings.notifications.desktopRoleTitleLine").replace(
          "{server}",
          serverName,
        ),
      roleBody: (title, content) => {
        const excerpt = content.trim().slice(0, 240);
        return excerpt ? `${title}\n${excerpt}` : title;
      },
      mentionTitleLine: (senderName, channelName, serverName) =>
        `${senderName} (#${channelName}, ${serverName})`,
    }),
    [t, language],
  );

  // Realtime: server event / role notification → inbox dot + OS desktop notification (messages only).
  useEffect(() => {
    if (!inboxForYouItem) return;
    setHasInboxNotification(true);
    scheduleInboxDotRefresh();
    showInboxForYouDesktopNotification({
      item: inboxForYouItem,
      copy: inboxDesktopCopy,
      enabled: isMessagesDesktopNotificationsEnabled(chatUserSettings),
      onNavigate: (item) => {
        if (item.type === "event") {
          router.push(`/messages?server=${item.serverId}&event=${item._id}`);
        } else if (item.type === "server_notification") {
          router.push(`/messages?server=${item.serverId}`);
        }
      },
    });
    clearInboxForYouItem();
  }, [
    inboxForYouItem,
    inboxDesktopCopy,
    chatUserSettings,
    scheduleInboxDotRefresh,
    clearInboxForYouItem,
    router,
  ]);

  // Realtime: server removed — drop from sidebar, clear open server/channel/voice, inbox + toast.
  useEffect(() => {
    if (!serverDeleted) return;
    const sid = serverDeleted.serverId;
    const label =
      (serverDeleted.serverName && String(serverDeleted.serverName).trim()) ||
      serversRef.current.find((s) => s._id === sid)?.name ||
      t("chat.popups.inbox.serverFallback");

    if (selectedServerRef.current === sid && selectedChannelRef.current) {
      leaveChannel(selectedChannelRef.current);
    }

    setServers((prev) => prev.filter((s) => s._id !== sid));

    if (selectedServerRef.current === sid) {
      setSelectedServer(null);
      setSelectedChannel(null);
      setInfoChannels([]);
      setTextChannels([]);
      setVoiceChannels([]);
      setAllChannels([]);
      setServerCategories([]);
      setMessages([]);
      setJoinedVoiceChannelId(null);
      setVoiceChannelCallToken(null);
      setVoiceChannelCallServerUrl("");
      setVoiceChannelCallError(null);
      setVoiceChannelParticipants({});
      setServerInteractionSettings(null);
      setMemberRoleColors({});
    }

    if (serverSettingsTargetRef.current?.serverId === sid) {
      setShowServerSettingsPanel(false);
      setServerSettingsTarget(null);
    }

    setHasInboxNotification(true);
    scheduleInboxDotRefresh();
    setToastMessage(t("chat.popups.inbox.serverDeletedToast", { server: label }));
    window.setTimeout(() => setToastMessage(null), 4000);
    clearServerDeleted();
  }, [serverDeleted, leaveChannel, scheduleInboxDotRefresh, clearServerDeleted, t]);

  // Fallback: cover non-socket cases (server_invite / for-you items) without requiring reload.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!currentUserId) return;

    let cancelled = false;
    const refetch = async () => {
      try {
        const res = await fetchInboxForYou();
        const hasUnread = (res.items ?? []).some((i) => i.seen !== true);
        if (!cancelled) setHasInboxNotification(hasUnread);
      } catch (_) {
        // ignore
      }
    };

    refetch();
    const id = window.setInterval(refetch, 8000);

    const onFocus = () => refetch();
    const onVis = () => {
      if (document.visibilityState === "visible") refetch();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [currentUserId]);

  // ✅ Sync reactions from WebSocket so both users see updates
  useEffect(() => {
    if (!reactionUpdate) return;
    const { messageId, reactions } = reactionUpdate;
    setConversations((prev) => {
      const newMap = new Map(prev);
      for (const [friendId, list] of newMap.entries()) {
        const idx = (list || []).findIndex((m) => m.id === messageId);
        if (idx === -1) continue;
        const updated = [...(list || [])];
        updated[idx] = {
          ...updated[idx],
          reactions: normalizeReactions(reactions),
        };
        newMap.set(friendId, updated);
      }
      return newMap;
    });
  }, [reactionUpdate]);

  // ✅ Sync channel reaction updates from WebSocket (nhiều thành viên trong kênh)
  useEffect(() => {
    if (!reactionUpdateChannel || !selectedChannel) return;
    const { messageId, reactions } = reactionUpdateChannel;
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === messageId);
      if (idx === -1) return prev;
      const next = [...prev];
      next[idx] = {
        ...next[idx],
        reactions: normalizeReactions(reactions),
      };
      return next;
    });
  }, [reactionUpdateChannel, selectedChannel]);

  // ✅ Channel: xóa cho tôi / thu hồi (socket — đồng bộ mọi client trong room kênh)
  useEffect(() => {
    if (!channelMessageDeleted) return;
    const { channelId, messageId, deleteType, deletedAt } = channelMessageDeleted;
    if (channelId !== selectedChannelRef.current) return;
    const asRecalled = deleteType === "for-everyone";
    const mid = messageId != null ? String(messageId) : "";
    if (!mid) return;

    setMessages((prev) => {
      const idx = prev.findIndex((m) => String(m.id) === mid);
      if (idx === -1) return prev;
      if (asRecalled) {
        if (prev[idx].isDeletedForEveryone) return prev;
        const next = prev.slice();
        next[idx] = {
          ...next[idx],
          isDeletedForEveryone: true,
          deletedAt: deletedAt || new Date().toISOString(),
          text: "",
          giphyId: undefined,
          customStickerUrl: undefined,
          voiceUrl: undefined,
          voiceDuration: undefined,
          reactions: [],
        };
        return next;
      }
      return prev.filter((m) => String(m.id) !== mid);
    });
  }, [channelMessageDeleted]);

  /** Cập nhật avatar tin nhắn kênh khi đổi hồ sơ máy chủ (không đụng social/messaging). */
  useEffect(() => {
    const onServerMemberProfileUpdated = (e: Event) => {
      const d = (e as CustomEvent).detail as {
        serverId?: string;
        userId?: string;
        avatarUrl?: string | null;
      };
      if (!d?.serverId || !d?.userId) return;
      if (String(d.serverId) !== String(selectedServerRef.current ?? "")) return;

      const uid = String(d.userId);
      const nextAvatar =
        typeof d.avatarUrl === "string" && d.avatarUrl.trim()
          ? d.avatarUrl.trim()
          : uid === String(currentUserId)
            ? selfMessagingIdentity.avatar
            : undefined;

      setMessages((prev) =>
        prev.map((m) => {
          if (m.type !== "server" || String(m.senderId) !== uid) return m;
          if (!nextAvatar) return m;
          return { ...m, senderAvatar: nextAvatar };
        }),
      );
    };
    window.addEventListener(
      "cordigram-server-member-profile-updated",
      onServerMemberProfileUpdated as EventListener,
    );
    return () =>
      window.removeEventListener(
        "cordigram-server-member-profile-updated",
        onServerMemberProfileUpdated as EventListener,
      );
  }, [currentUserId, selfMessagingIdentity.avatar]);

  // ✅ New message in channel from WebSocket (thành viên khác gửi → hiện ngay không cần reload)
  useEffect(() => {
    if (!newMessageChannel?.message || !selectedChannel) return;
    const skipBlockForApplyVerificationOnly =
      myServerAccessStatus?.accessMode === "apply" &&
      myServerAccessStatus.status === "accepted" &&
      myServerAccessStatus?.chatBlockReason === "verification";
    if (myServerAccessStatus?.chatViewBlocked && !skipBlockForApplyVerificationOnly) {
      clearNewMessageChannel();
      return;
    }
    const msg = newMessageChannel.message as any;
    const channelId = typeof msg.channelId === "string" ? msg.channelId : msg.channelId?._id ?? msg.channelId;
    if (channelId !== selectedChannel) return;
    const senderId = typeof msg.senderId === "string" ? msg.senderId : msg.senderId?._id;
    if (senderId === currentUserId) return;

    const srvId = selectedServerRef.current;
    const rawMentions = (msg as any).mentions ?? [];
    const mentionIds = Array.isArray(rawMentions)
      ? rawMentions.map((m: any) => (typeof m === "string" ? m : m?._id ?? m)).filter(Boolean)
      : [];
    const chMeta = allChannels.find((c) => c._id === channelId);
    const categoryId = chMeta?.categoryId ?? null;
    if (
      srvId &&
      currentUserId &&
      shouldPlayChannelMessageNotificationSound({
        content: String((msg as any).content ?? ""),
        mentionIds,
        currentUserId,
        currentUsername: currentUserProfile?.username,
        prefs: sidebarPrefs.getServerPrefs(currentUserId, srvId),
        channelId,
        categoryId,
        roleNames: notificationRoleNames,
      })
    ) {
      playMessageNotificationSound();
    }
    const senderNickname = srvId
      ? serversRef.current
          .find((s) => s._id === srvId)
          ?.members?.find((m) => String(m.userId) === String(senderId))?.nickname ?? null
      : null;
    const trimmedNick = typeof senderNickname === "string" ? senderNickname.trim() : "";
    const snd = typeof msg.senderId === "object" && msg.senderId ? (msg.senderId as any) : null;
    const uiMessage: UIMessage = {
      id: msg._id,
      text: msg.content,
      senderId: senderId ?? "",
      senderEmail: typeof msg.senderId === "object" ? msg.senderId?.email ?? "" : "",
      senderName: typeof msg.senderId === "object" ? (msg.senderId?.username || msg.senderId?.email) ?? "" : "",
      senderDisplayName: trimmedNick || (typeof msg.senderId === "object" ? msg.senderId?.displayName : undefined),
      senderAvatar: typeof msg.senderId === "object" ? (msg.senderId?.avatarUrl ?? msg.senderId?.avatar) : undefined,
      senderDisplayNameFontId: snd?.displayNameFontId ?? undefined,
      senderDisplayNameEffectId: snd?.displayNameEffectId ?? undefined,
      senderDisplayNamePrimaryHex: snd?.displayNamePrimaryHex ?? undefined,
      senderDisplayNameAccentHex: snd?.displayNameAccentHex ?? undefined,
      timestamp: new Date(msg.createdAt),
      isFromCurrentUser: false,
      type: "server",
      messageType: msg.messageType || "text",
      giphyId: msg.giphyId || undefined,
      customStickerUrl: (msg as serversApi.Message).customStickerUrl || undefined,
      serverStickerId:
        (msg as serversApi.Message).serverStickerId != null
          ? String((msg as serversApi.Message).serverStickerId)
          : undefined,
      voiceUrl: msg.voiceUrl ?? undefined,
      voiceDuration: msg.voiceDuration ?? undefined,
      stickerReplyWelcomeEnabled: msg.stickerReplyWelcomeEnabled,
      welcomeWaveDismissedByMe: (msg as any).welcomeWaveDismissedByMe === true,
      contentModerationResult: msg.contentModerationResult ?? "none",
      reactions: normalizeReactions(msg.reactions),
      replyTo: msg.replyTo && typeof msg.replyTo === "object" ? msg.replyTo._id : typeof msg.replyTo === "string" ? msg.replyTo : undefined,
      replyToMessage: mapReplyToMessage(msg.replyTo && typeof msg.replyTo === "object" ? msg.replyTo : null),
      isDeletedForEveryone: msg.isDeleted === true,
      deletedAt: msg.deletedAt || undefined,
      attachments: Array.isArray((msg as any).attachments) ? (msg as any).attachments : undefined,
    };
    setMessages((prev) => appendServerMessage(prev, uiMessage));
    if (isChatScrolledNearBottom()) {
      shouldAutoScrollRef.current = true;
      setShowNewMessagesBelow(false);
    } else {
      shouldAutoScrollRef.current = false;
      setShowNewMessagesBelow(true);
    }
    clearNewMessageChannel();
  }, [
    newMessageChannel,
    selectedChannel,
    currentUserId,
    clearNewMessageChannel,
    myServerAccessStatus?.chatViewBlocked,
    myServerAccessStatus?.accessMode,
    myServerAccessStatus?.status,
    allChannels,
    notificationRoleNames,
    currentUserProfile?.username,
    isChatScrolledNearBottom,
  ]);

  // Patch link previews (and other server-side enrichments) when they arrive async.
  useEffect(() => {
    if (!messageUpdatedChannel?.message || !selectedChannel) return;
    const msg = messageUpdatedChannel.message as any;
    const channelId =
      typeof msg.channelId === "string"
        ? msg.channelId
        : msg.channelId?._id ?? msg.channelId;
    if (channelId !== selectedChannel) {
      clearMessageUpdatedChannel();
      return;
    }
    const messageId = msg?._id != null ? String(msg._id) : "";
    if (!messageId) {
      clearMessageUpdatedChannel();
      return;
    }
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? {
              ...m,
              text: msg.content ?? m.text,
              linkPreviews: Array.isArray(msg.linkPreviews) ? msg.linkPreviews : m.linkPreviews,
            }
          : m,
      ),
    );
    clearMessageUpdatedChannel();
  }, [messageUpdatedChannel, selectedChannel, clearMessageUpdatedChannel]);

  // Cleanup typing timeout on unmount or friend change
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      if (isTypingRef.current && selectedDirectMessageFriend && notifyTyping) {
        notifyTyping(selectedDirectMessageFriend._id, false);
      }
    };
  }, [selectedDirectMessageFriend, notifyTyping]);

  // ✅ Call handlers - Show outgoing popup first
  const findConnectedSessionForPeer = useCallback((peerId: string) => {
    return dmCallSessionsRef.current.find(
      (s) =>
        s.peerId === peerId &&
        (s.state === "connected" ||
          s.state === "connecting" ||
          s.state === "reconnecting"),
    );
  }, []);

  const resolvePeerForCall = useCallback((peerId: string) => {
    const friend = friendsRef.current.find((f) => f._id === peerId);
    if (friend) {
      return {
        displayName: friend.displayName || friend.username,
        username: friend.username,
        avatarUrl: friend.avatarUrl,
      };
    }
    return {
      displayName: peerId,
      username: peerId,
      avatarUrl: undefined as string | undefined,
    };
  }, []);

  const handleStartCall = useCallback(
    async (isVideo: boolean) => {
      if (!selectedDirectMessageFriend || !token || !currentUserProfile) {
        console.error("Cannot start call: missing friend, token, or profile");
        return;
      }

      const tabId = callTabIdRef.current || getCallTabId();
      callTabIdRef.current = tabId;
      const peerId = selectedDirectMessageFriend._id;

      const connectedSession = findConnectedSessionForPeer(peerId);
      if (connectedSession?.roomId) {
        void continueCallOnThisDeviceRef.current(peerId, connectedSession);
        return;
      }

      if (openedCallTabPeersRef.current.has(peerId)) {
        return;
      }

      tryAcquireOutboundCallLock(tabId, peerId);
      openedCallTabPeersRef.current.delete(peerId);

      try {
        const { roomName } = await getDMRoomName(peerId, token);

        setIncomingCall(null);

        const entry: OutgoingCallEntry = {
          to: peerId,
          toUser: {
            displayName:
              selectedDirectMessageFriend.displayName ||
              selectedDirectMessageFriend.username,
            username: selectedDirectMessageFriend.username,
            avatarUrl: selectedDirectMessageFriend.avatarUrl,
          },
          type: isVideo ? "video" : "audio",
          status: "calling",
          roomName,
        };
        outgoingCallsByPeerRef.current = {
          ...outgoingCallsByPeerRef.current,
          [peerId]: entry,
        };
        setOutgoingCallsByPeer((prev) => ({
          ...prev,
          [peerId]: entry,
        }));

        const emitted = initiateCall(peerId, isVideo ? "video" : "audio");
        if (!emitted) {
          showTransientError("Mất kết nối. Không thể bắt đầu cuộc gọi.");
          setOutgoingCallsByPeer((prev) => {
            const next = { ...prev };
            delete next[peerId];
            outgoingCallsByPeerRef.current = next;
            return next;
          });
          releaseOutboundCallLock(tabId, peerId);
        }
      } catch (error) {
        releaseOutboundCallLock(tabId, peerId);
        console.error("❌ [CALL] Failed to start call:", error);
        showTransientError("Không thể bắt đầu cuộc gọi");
      }
    },
    [selectedDirectMessageFriend, token, currentUserProfile, initiateCall, showTransientError, findConnectedSessionForPeer],
  );

  const buildCallUrl = useCallback(
    (peerId: string, roomName: string, callType: "audio" | "video", callId?: string) => {
      const participantName =
        currentUserProfile?.username ||
        currentUserProfile?.displayName ||
        "Người dùng";
      const callAuthToken = getTabAccessToken() || token;
      const qpToken = callAuthToken
        ? `&accessToken=${encodeURIComponent(callAuthToken)}`
        : "";
      const qpCallId =
        callId && callId.trim()
          ? `&callId=${encodeURIComponent(callId)}`
          : "";
      return (
        `/call?roomName=${encodeURIComponent(roomName)}` +
        `&participantName=${encodeURIComponent(participantName)}` +
        `&audioOnly=${callType === "audio"}` +
        `&peerId=${encodeURIComponent(peerId)}` +
        qpToken +
        qpCallId
      );
    },
    [currentUserProfile, token],
  );

  const continueCallOnThisDevice = useCallback(
    async (peerId: string, session?: DmCallSessionSyncItem) => {
      const resolved = session ?? findConnectedSessionForPeer(peerId);
      const roomName = resolved?.roomId;
      if (!roomName) {
        showTransientError("Không thể tiếp tục cuộc gọi trên thiết bị này.");
        return;
      }

      const claim = await claimCallMedia(peerId);
      const callType = claim.type ?? resolved?.type ?? "audio";
      const callId = claim.callId ?? resolved?.callId;
      if (callId) {
        callIdsByPeerRef.current[peerId] = callId;
      }

      notifyDmCallMediaTransferred(peerId);
      removeActiveDmCallPeer(peerId);
      openedCallTabPeersRef.current.delete(peerId);

      const callUrl = buildCallUrl(peerId, roomName, callType, callId);
      const callWindowName = `cordigram-dm-call-${peerId}`;
      const win = window.open(callUrl, callWindowName, "noopener,noreferrer");
      if (win || openedCallTabPeersRef.current.has(peerId)) {
        markCallTabOpen(peerId, callId);
      }
      dismissOutgoingCallPopup(peerId);
      setIncomingCall(null);
    },
    [
      findConnectedSessionForPeer,
      claimCallMedia,
      buildCallUrl,
      markCallTabOpen,
      dismissOutgoingCallPopup,
      showTransientError,
    ],
  );

  useEffect(() => {
    continueCallOnThisDeviceRef.current = continueCallOnThisDevice;
  }, [continueCallOnThisDevice]);

  const openCallTabForPeer = useCallback(
    (peerId: string, roomNameOverride?: string): boolean => {
      if (!currentUserProfile || !token) return false;

      const outgoing = outgoingCallsByPeerRef.current[peerId];
      const roomName = roomNameOverride || outgoing?.roomName;
      if (!roomName) {
        console.warn("[CALL] Missing roomName for outgoing call");
        return false;
      }

      if (openedCallTabPeersRef.current.has(peerId)) {
        dismissOutgoingCallPopup(peerId);
        return true;
      }

      const tabId = callTabIdRef.current || getCallTabId();
      const callType = outgoing?.type ?? "audio";
      const callId = outgoing?.callId || callIdsByPeerRef.current[peerId];
      if (!ownsOutboundCallLock(tabId, peerId)) {
        tryAcquireOutboundCallLock(tabId, peerId);
      }

      void claimCallMedia(peerId);

      try {
        const callUrl = buildCallUrl(peerId, roomName, callType, callId);
        const callWindowName = `cordigram-dm-call-${peerId}`;
        const win = window.open(callUrl, callWindowName, "noopener,noreferrer");
        if (!win) {
          return isCallTabActiveForPeer(peerId);
        }
        markCallTabOpen(peerId, callId);
        dismissOutgoingCallPopup(peerId);
        return true;
      } catch (error) {
        console.error("❌ [CALLER] Failed to open call window:", error);
        return false;
      }
    },
    [
      currentUserProfile,
      token,
      buildCallUrl,
      markCallTabOpen,
      dismissOutgoingCallPopup,
      isCallTabActiveForPeer,
      claimCallMedia,
    ],
  );

  const scheduleDismissOutgoingPopup = useCallback(
    (peerId: string) => {
      dismissOutgoingCallPopup(peerId);
      if (typeof window === "undefined") return;
      window.setTimeout(() => {
        if (isCallTabActiveForPeer(peerId)) {
          dismissOutgoingCallPopup(peerId);
        }
      }, 400);
    },
    [dismissOutgoingCallPopup, isCallTabActiveForPeer],
  );

  const handlePeerAnsweredCall = useCallback(
    (peerId: string, roomFromAnswer?: string, callId?: string) => {
      if (isCallTabActiveForPeer(peerId)) {
        scheduleDismissOutgoingPopup(peerId);
        return;
      }
      if (openingCallTabForPeerRef.current.has(peerId)) {
        return;
      }

      const hasOutgoing = Boolean(outgoingCallsByPeerRef.current[peerId]);
      if (!hasOutgoing && !roomFromAnswer) return;

      if (callId) {
        callIdsByPeerRef.current[peerId] = callId;
      }
      if (hasOutgoing && roomFromAnswer) {
        const existing = outgoingCallsByPeerRef.current[peerId];
        if (existing) {
          const patched = {
            ...existing,
            roomName: roomFromAnswer,
            callId:
              callId ||
              existing.callId ||
              callIdsByPeerRef.current[peerId],
          };
          const next = { ...outgoingCallsByPeerRef.current, [peerId]: patched };
          outgoingCallsByPeerRef.current = next;
        }
      }

      openingCallTabForPeerRef.current.add(peerId);
      try {
        void claimCallMedia(peerId);
        notifyDmCallMediaTransferred(peerId);
        openCallTabForPeer(peerId, roomFromAnswer);
      } finally {
        openingCallTabForPeerRef.current.delete(peerId);
        scheduleDismissOutgoingPopup(peerId);
      }
    },
    [
      openCallTabForPeer,
      claimCallMedia,
      isCallTabActiveForPeer,
      scheduleDismissOutgoingPopup,
    ],
  );

  // ✅ Accept incoming call — notify caller and open dedicated /call tab
  const handleAcceptCall = useCallback(async () => {
    if (!incomingCall || !token || !currentUserProfile) {
      console.error("Cannot accept call: missing data");
      return;
    }

    const peerId = incomingCall.from;
    if (openedCallTabPeersRef.current.has(peerId)) {
      void continueCallOnThisDeviceRef.current(peerId);
      setIncomingCall(null);
      return;
    }

    const alreadyAccepted = incomingCall.status === "accepted";

    try {
      let roomName = incomingCall.roomName;
      if (!alreadyAccepted) {
        const resolved = await getDMRoomName(peerId, token);
        roomName = resolved.roomName;
        answerCall(peerId, { roomName });
        if (incomingCall.callId) {
          callIdsByPeerRef.current[peerId] = incomingCall.callId;
        }
        setIncomingCall((prev) =>
          prev
            ? {
                ...prev,
                status: "accepted",
                roomName,
              }
            : prev,
        );
      }

      if (!roomName) {
        showTransientError("Không thể chấp nhận cuộc gọi");
        return;
      }

      await claimCallMedia(peerId);
      notifyDmCallMediaTransferred(peerId);

      const callUrl = buildCallUrl(
        peerId,
        roomName,
        incomingCall.type,
        incomingCall.callId,
      );
      const callWindowName = `cordigram-dm-call-${peerId}`;
      const win = window.open(callUrl, callWindowName, "noopener,noreferrer");
      if (!win && !isCallTabActiveForPeer(peerId)) {
        window.open(callUrl, callWindowName, "noopener,noreferrer");
      }
      markCallTabOpen(peerId, incomingCall.callId);
      setIncomingCall(null);
    } catch (error) {
      console.error("❌ [ACCEPT] Failed to accept call:", error);
      showTransientError("Không thể chấp nhận cuộc gọi");
    }
  }, [
    incomingCall,
    token,
    currentUserProfile,
    answerCall,
    buildCallUrl,
    claimCallMedia,
    showTransientError,
    markCallTabOpen,
    rejectCall,
    isCallTabActiveForPeer,
  ]);

  // ✅ Reject incoming call — clear UI + ringtone first, then notify caller
  const handleRejectCall = useCallback(() => {
    if (!incomingCall) return;


    const peerId = incomingCall.from;
    setIncomingCall(null);
    rejectCall(peerId);
  }, [incomingCall, rejectCall]);

  const handleCancelCall = useCallback(
    (peerId: string) => {
      const outgoing = outgoingCallsByPeerRef.current[peerId];
      if (!outgoing) return;

      if (
        !endCall(peerId, {
          status: outgoing.status === "calling" ? "cancelled" : undefined,
        })
      ) {
        showTransientError("Mất kết nối. Không thể kết thúc cuộc gọi.");
      }
      releaseOutboundCallLock(callTabIdRef.current, peerId);
      markCallTabClosed(peerId);
      setOutgoingCallsByPeer((prev) => {
        const next = { ...prev };
        delete next[peerId];
        return next;
      });
    },
    [endCall, markCallTabClosed, showTransientError],
  );

  // ✅ Handle incoming call & call events
  useEffect(() => {
    const tabId = callTabIdRef.current || getCallTabId();
    callTabIdRef.current = tabId;
    return subscribeOutboundCallLock(tabId, (lock) => {
      setOutgoingCallsByPeer((prev) => {
        if (!prev[lock.peerId]) return prev;
        const next = { ...prev };
        delete next[lock.peerId];
        return next;
      });
    });
  }, []);

  useEffect(() => {
    if (!callBusy) return;
    const tabId = callTabIdRef.current;
    const peerId = callBusy.receiverId || callBusy.peerId;
    if (peerId) {
      releaseOutboundCallLock(tabId, peerId);
      setOutgoingCallsByPeer((prev) => {
        if (!prev[peerId]) return prev;
        const next = { ...prev };
        delete next[peerId];
        return next;
      });
    }
    if (callBusy.code === "already_in_call" && peerId) {
      const connectedSession = findConnectedSessionForPeer(peerId);
      if (connectedSession?.roomId) {
        void continueCallOnThisDeviceRef.current(peerId, connectedSession);
        return;
      }
    }
    showTransientError(
      callBusy.code === "peer_busy"
        ? "Người dùng này đang bận cuộc gọi khác."
        : callBusy.code === "blocked"
          ? "Không thể gọi người dùng này."
          : callBusy.code === "already_in_call"
            ? "Bạn đã có cuộc gọi đang diễn ra với người này."
            : "Bạn đang gọi người này từ tab, cửa sổ trình duyệt hoặc thiết bị khác.",
    );
  }, [callBusy, showTransientError, findConnectedSessionForPeer]);

  // ✅ Handle incoming call & call events
  useEffect(() => {
    if (!callEvent) return;

    // WebRTC ICE must not trigger incoming UI or "rejected" heuristics
    if (isIceCandidateEvent(callEvent)) return;

    // Incoming call notification (or repeat ring from same caller)
    if (isIncomingRingEvent(callEvent) && callEvent.callerInfo) {
      const ev = callEvent;

      if (
        currentUserIdRef.current &&
        String(ev.from) === String(currentUserIdRef.current)
      ) {
        return;
      }

      const oc = outgoingCallsByPeerRef.current[ev.from];
      if (oc && oc.status === "calling") {
        return;
      }

      if (openedCallTabPeersRef.current.has(ev.from)) {
        return;
      }

      setOutgoingCallsByPeer((prev) => {
        if (!prev[ev.from]) return prev;
        const next = { ...prev };
        delete next[ev.from];
        return next;
      });
      setIncomingCall((prev) => {
        if (prev && prev.from === ev.from) {

        } else {

        }
        return {
          from: ev.from,
          type: ev.type || "audio",
          callerInfo: ev.callerInfo!,
          status: "incoming" as const,
          callId:
            typeof ev.callId === "string" ? ev.callId : undefined,
        };
      });
      return;
    }

    // Call answered is handled via DM_CALL_ANSWER_EVENT (see effect below) to
    // avoid duplicate window.open attempts that trigger false popup-block toasts.
    // Do NOT list incomingCall in deps — setIncomingCall updates it and would retrigger this effect forever.
  }, [callEvent, rejectCall]);

  // Open caller tab immediately on call-answer (bypasses React state batching / short TTL).
  useEffect(() => {
    const onAnswer = (e: Event) => {
      const detail = (e as CustomEvent<DmCallAnswerDetail>).detail;
      if (!detail?.from) return;
      const peerId = String(detail.from);
      const roomFromAnswer =
        detail.sdpOffer &&
        typeof detail.sdpOffer === "object" &&
        typeof detail.sdpOffer.roomName === "string"
          ? detail.sdpOffer.roomName
          : undefined;
      handlePeerAnsweredCall(peerId, roomFromAnswer, detail.callId);
    };
    window.addEventListener(DM_CALL_ANSWER_EVENT, onAnswer);
    return () => window.removeEventListener(DM_CALL_ANSWER_EVENT, onAnswer);
  }, [handlePeerAnsweredCall]);

  // ✅ Handle call-ended event (when caller cancels while receiver has incoming popup)
  useEffect(() => {
    if (!callEnded) return;


    // If receiver has incoming call popup open, update it to show "cancelled"
    // ✅ Use callback to avoid dependency on incomingCall state
    setIncomingCall((prev) => {
      if (prev && prev.from === callEnded.from) {
        return { ...prev, status: "cancelled" };
      }
      return prev;
    });

    // Also relay the close signal to any active call tab — LiveKit's
    // ParticipantDisconnected fires eventually, but broadcasting "end" here
    // tears the tab down immediately so the UX matches what the user sees
    // on the peer side (mobile / web).
    if (typeof window !== "undefined" && "BroadcastChannel" in window) {
      try {
        const channel = new BroadcastChannel("cordigram-call");
        channel.postMessage({ type: "peer-ended", peerId: callEnded.from });
        channel.close();
      } catch (_) {}
    }

    const endedPeer = String(callEnded.from);
    releaseOutboundCallLock(callTabIdRef.current, endedPeer);
    markCallTabClosed(endedPeer);

    const outgoing = outgoingCallsByPeerRef.current[endedPeer];
    const endedReason = callEnded.reason;
    const isNoAnswer =
      outgoing?.status === "calling" &&
      (endedReason === "timeout" ||
        endedReason === "missed" ||
        endedReason === "no-answer");

    const timers: ReturnType<typeof setTimeout>[] = [];

    if (isNoAnswer && outgoing) {
      const next = {
        ...outgoingCallsByPeerRef.current,
        [endedPeer]: { ...outgoing, status: "no-answer" as const },
      };
      outgoingCallsByPeerRef.current = next;
      setOutgoingCallsByPeer(next);
      timers.push(
        setTimeout(() => {
          setOutgoingCallsByPeer((prev) => {
            if (prev[endedPeer]?.status !== "no-answer") return prev;
            const cleared = { ...prev };
            delete cleared[endedPeer];
            outgoingCallsByPeerRef.current = cleared;
            return cleared;
          });
        }, 3000),
      );
    } else {
      setOutgoingCallsByPeer((prev) => {
        if (!prev[endedPeer]) return prev;
        const next = { ...prev };
        delete next[endedPeer];
        outgoingCallsByPeerRef.current = next;
        return next;
      });
    }

    timers.push(
      setTimeout(() => {
        setIncomingCall((prev) => {
          if (
            prev &&
            prev.from === callEnded.from &&
            prev.status === "cancelled"
          ) {
            return null;
          }
          return prev;
        });
      }, 3000),
    );

    return () => {
      for (const timer of timers) clearTimeout(timer);
    };
  }, [callEnded, markCallTabClosed]); // ✅ Only depend on callEnded, not incomingCall

  // Đóng popup incoming trên tab/thiết bị khác khi đã accept/reject ở nơi khác.
  useEffect(() => {
    if (!callIncomingDismiss?.peerId) return;
    const peerId = String(callIncomingDismiss.peerId);
    setIncomingCall((prev) => (prev?.from === peerId ? null : prev));
    // Only clear outgoing ring UI when *this tab* was ringing someone else
    // (callee dismissed on another device). Do not clear our outbound call to
    // `peerId` when we are the caller waiting for `call-answer`.
    if (callIncomingDismiss.reason === "answered_elsewhere") {
      setOutgoingCallsByPeer((prev) => {
        const out = prev[peerId];
        if (!out || out.status !== "calling") return prev;
        const next = { ...prev };
        delete next[peerId];
        return next;
      });
    }
  }, [callIncomingDismiss]);

  // Đồng bộ session sau reconnect — xóa ring ảo nếu server không còn ringing.
  useEffect(() => {
    if (!callSessionsSync?.sessions) return;
    const sessions = callSessionsSync.sessions;
    dmCallSessionsRef.current = sessions;
    const ringingPeers = new Set(
      sessions
        .filter((s) => s.state === "ringing" && s.role === "callee")
        .map((s) => s.peerId),
    );
    setIncomingCall((prev) => {
      if (!prev) return prev;
      if (ringingPeers.has(prev.from)) return prev;
      return null;
    });

    const activeCallerPeers = new Set(
      sessions
        .filter(
          (s) =>
            s.role === "caller" &&
            (s.state === "ringing" ||
              s.state === "connected" ||
              s.state === "connecting"),
        )
        .map((s) => s.peerId),
    );

    for (const session of sessions) {
      if (session.role !== "caller" || !session.callId) continue;
      callIdsByPeerRef.current[session.peerId] = session.callId;
      const out = outgoingCallsByPeerRef.current[session.peerId];
      if (out && !out.callId) {
        const next = {
          ...outgoingCallsByPeerRef.current,
          [session.peerId]: { ...out, callId: session.callId },
        };
        outgoingCallsByPeerRef.current = next;
        setOutgoingCallsByPeer(next);
      }
    }

    // Hydrate caller UI when call was started on another device (e.g. mobile app).
    let hydratedOutgoing: Record<string, OutgoingCallEntry> | null = null;
    for (const session of sessions) {
      if (session.role !== "caller") continue;
      if (
        session.state !== "ringing" &&
        session.state !== "connecting" &&
        session.state !== "connected" &&
        session.state !== "reconnecting"
      ) {
        continue;
      }
      const peerId = session.peerId;
      if (outgoingCallsByPeerRef.current[peerId]) continue;
      if (openedCallTabPeersRef.current.has(peerId)) continue;
      if (isCallTabActiveForPeer(peerId)) continue;
      const peerInfo = resolvePeerForCall(peerId);
      const entry: OutgoingCallEntry = {
        to: peerId,
        toUser: peerInfo,
        type: session.type,
        status:
          session.state === "connected" || session.state === "connecting"
            ? "answered"
            : "calling",
        roomName: session.roomId,
        callId: session.callId,
      };
      hydratedOutgoing = {
        ...(hydratedOutgoing ?? outgoingCallsByPeerRef.current),
        [peerId]: entry,
      };
    }
    if (hydratedOutgoing) {
      outgoingCallsByPeerRef.current = hydratedOutgoing;
      setOutgoingCallsByPeer(hydratedOutgoing);
    }

    // Backup incoming ring when call-incoming socket event was missed.
    for (const session of sessions) {
      if (session.role !== "callee" || session.state !== "ringing") continue;
      const peerId = session.peerId;
      if (openedCallTabPeersRef.current.has(peerId)) continue;
      const peerInfo = resolvePeerForCall(peerId);
      setIncomingCall((prev) => {
        if (prev?.from === peerId) return prev;
        return {
          from: peerId,
          type: session.type,
          callerInfo: {
            userId: peerId,
            username: peerInfo.username,
            displayName: peerInfo.displayName,
            avatar: peerInfo.avatarUrl,
          },
          status: "incoming" as const,
          callId: session.callId,
        };
      });
    }

    for (const session of sessions) {
      if (session.role !== "caller") continue;
      if (session.state !== "connected" && session.state !== "connecting") {
        continue;
      }
      const peerId = session.peerId;
      dismissOutgoingCallPopup(peerId);
      if (isCallTabActiveForPeer(peerId)) {
        continue;
      }
      const out = outgoingCallsByPeerRef.current[peerId];
      if (!out) {
        handlePeerAnsweredCall(peerId, session.roomId, session.callId);
        continue;
      }
      if (out.status === "calling") {
        handlePeerAnsweredCall(peerId, session.roomId, session.callId);
      }
    }

    setOutgoingCallsByPeer((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const [peerId, out] of Object.entries(prev)) {
        if (out.status !== "calling") continue;
        if (!activeCallerPeers.has(peerId)) {
          delete next[peerId];
          delete callIdsByPeerRef.current[peerId];
          changed = true;
        }
      }
      if (changed) {
        outgoingCallsByPeerRef.current = next;
        return next;
      }
      return prev;
    });
  }, [
    callSessionsSync,
    handlePeerAnsweredCall,
    dismissOutgoingCallPopup,
    isCallTabActiveForPeer,
    resolvePeerForCall,
  ]);

  useEffect(() => {
    if (!callMediaTransferred?.peerId) return;
    const peerId = callMediaTransferred.peerId;
    notifyDmCallMediaTransferred(peerId);
    markCallTabClosed(peerId);
    openedCallTabPeersRef.current.delete(peerId);
  }, [callMediaTransferred, markCallTabClosed]);

  // ✅ Listen for the call tab telling us the user ended the call.
  //
  // Why a BroadcastChannel and not postMessage?
  //   window.open(..., "noopener,noreferrer") deliberately severs
  //   `window.opener`, so the tab can't reach us directly. BroadcastChannel
  //   is the only cross-tab messaging primitive that still works with that
  //   hardened `rel="noopener"` posture AND is already supported by all
  //   browsers we target.
  useEffect(() => {
    if (typeof window === "undefined" || !("BroadcastChannel" in window)) {
      return;
    }
    const channel = new BroadcastChannel("cordigram-call");
    const onMessage = (event: MessageEvent) => {
      const data = event.data as
        | {
            type: string;
            peerId?: string;
            callId?: string;
            status?: "completed" | "cancelled";
            durationSec?: number;
          }
        | null;
      if (!data || typeof data !== "object") return;
      if (data.type === "call-active" && data.peerId) {
        markCallTabOpen(data.peerId, data.callId);
        scheduleDismissOutgoingPopup(data.peerId);
        return;
      }
      if (data.type === "media-transferred" && data.peerId) {
        markCallTabClosed(data.peerId);
        openedCallTabPeersRef.current.delete(data.peerId);
        return;
      }
      if (data.type === "self-ended" && data.peerId) {
        endCall(data.peerId, {
          status: data.status,
          durationSec: data.durationSec,
        });
        releaseOutboundCallLock(callTabIdRef.current, data.peerId);
        markCallTabClosed(data.peerId);
        setIncomingCall(null);
        setOutgoingCallsByPeer((prev) => {
          if (!prev[data.peerId!]) return prev;
          const next = { ...prev };
          delete next[data.peerId!];
          return next;
        });
        return;
      }
      if (data.type === "peer-ended" && data.peerId) {
        markCallTabClosed(data.peerId);
      }
    };
    channel.addEventListener("message", onMessage);
    return () => {
      channel.removeEventListener("message", onMessage);
      channel.close();
    };
  }, [endCall, markCallTabClosed, markCallTabOpen, scheduleDismissOutgoingPopup]);

  // ✅ Listen for call-rejected event
  useEffect(() => {
    if (!callEvent) return;

    if (isIceCandidateEvent(callEvent)) return;

    if (isCallRejectedEvent(callEvent)) {
      const peerId = String(callEvent.from);

      setOutgoingCallsByPeer((prev) => {
        const cur = prev[peerId];
        if (!cur || cur.status === "rejected") return prev;
        return { ...prev, [peerId]: { ...cur, status: "rejected" } };
      });

      releaseOutboundCallLock(callTabIdRef.current, peerId);

      const timer = setTimeout(() => {
        setOutgoingCallsByPeer((prev) => {
          const cur = prev[peerId];
          if (!cur || cur.status !== "rejected") return prev;
          const next = { ...prev };
          delete next[peerId];
          return next;
        });
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [callEvent]);

  // ✅ Handle messages read event - update UI when messages are read
  useEffect(() => {
    if (
      messagesRead &&
      messagesRead.messageIds &&
      messagesRead.messageIds.length > 0
    ) {

      // ✅ ONLY update conversations Map (used for DM rendering)
      // This prevents duplicate key errors by maintaining a single source of truth
      setConversations((prev) => {
        const newMap = new Map(prev);
        let updateCount = 0;

        newMap.forEach((msgs, friendId) => {
          const updated = msgs.map((msg) => {
            if (messagesRead.messageIds.includes(msg.id)) {
              updateCount++;
              return { ...msg, isRead: true };
            }
            return msg;
          });
          newMap.set(friendId, updated);
        });

        return newMap;
      });
    }
  }, [messagesRead]); // ✅ FIX: Only depend on messagesRead, NOT conversations (Map object changes every time)

  // ✅ Track which messages are visible and mark them as read
  const visibleMessagesRef = useRef<Set<string>>(new Set());
  const markAsReadTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // ✅ Intersection Observer callback to detect visible messages
  const handleMessageVisible = useCallback(
    (messageId: string, isVisible: boolean) => {
      if (!selectedDirectMessageFriend || !markAsRead) return;

      // Check message in conversations (since we're using that for DM rendering)
      const conversationMessages =
        conversations.get(selectedDirectMessageFriend._id) || [];
      const message = conversationMessages.find((m) => m.id === messageId);

      if (!message || message.isFromCurrentUser || message.isRead) {
        // Skip if already marked or if it's our own message
        return;
      }

      if (isVisible) {
        // Message is visible - start timer to mark as read after 2 seconds
        if (!markAsReadTimersRef.current.has(messageId)) {

          const timer = setTimeout(() => {

            // Mark as read via WebSocket
            markAsRead([messageId], selectedDirectMessageFriend._id);

            // ✅ OPTIMISTIC UPDATE: Only update the conversations Map (used for DM rendering)
            // Don't update messages array to avoid duplicate renders
            setConversations((prev) => {
              const newMap = new Map(prev);
              const msgs = newMap.get(selectedDirectMessageFriend._id) || [];
              newMap.set(
                selectedDirectMessageFriend._id,
                msgs.map((m) =>
                  m.id === messageId ? { ...m, isRead: true } : m,
                ),
              );
              return newMap;
            });

            visibleMessagesRef.current.add(messageId);
            markAsReadTimersRef.current.delete(messageId);
          }, 2000); // 2 seconds of visibility required

          markAsReadTimersRef.current.set(messageId, timer);
        }
      } else {
        // Message is no longer visible - cancel timer
        const timer = markAsReadTimersRef.current.get(messageId);
        if (timer) {
          clearTimeout(timer);
          markAsReadTimersRef.current.delete(messageId);
        }
      }
    },
    [selectedDirectMessageFriend, conversations, markAsRead],
  );

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      markAsReadTimersRef.current.forEach((timer) => clearTimeout(timer));
      markAsReadTimersRef.current.clear();
    };
  }, []);

  // Store admin token in localStorage before the init effect reads it.
  // Effects fire in declaration order, so this runs first.
  useEffect(() => {
    if (adminTokenFromUrl) {
      localStorage.setItem("accessToken", adminTokenFromUrl);
    }
  }, [adminTokenFromUrl]);

  // Admin chỉ xem server: không mở Khám phá / tránh lệch giao diện (sidebar server + nội dung Explore).
  useEffect(() => {
    if (!isAdminView) return;
    setShowExploreView(false);
    setShowJoinApplicationsView(false);
  }, [isAdminView]);

  // Keep tab-scoped JWT in sync (two accounts in two tabs on one PC).
  useEffect(() => {
    const syncAuthFromTab = () => {
      const authToken = getTabAccessToken();
      if (!authToken) return;
      setToken(authToken);
      try {
        const payload = JSON.parse(atob(authToken.split(".")[1]));
        setCurrentUserId(String(payload.userId || payload.sub || ""));
      } catch {
        // ignore
      }
    };
    syncAuthFromTab();
    window.addEventListener("focus", syncAuthFromTab);
    return () => window.removeEventListener("focus", syncAuthFromTab);
  }, []);

  // Load servers on mount
  useEffect(() => {
    const authToken =
      ensureTabAccessToken() ||
      localStorage.getItem("accessToken") ||
      localStorage.getItem("token");
    if (authToken) {
      setToken(authToken);
      try {
        const payload = JSON.parse(atob(authToken.split(".")[1]));
        const userId = payload.userId || payload.sub;
        setCurrentUserId(userId);
        setError(null);
        if (!isAdminView) {
          loadServers();
          loadAvailableUsers();
          loadCurrentUserProfile(authToken);
        } else {
          setLoading(false);
        }
      } catch (e) {
        console.error("Failed to parse token", e);
        if (!isAdminView) {
          setError("Mã token không hợp lệ");
        } else {
          setLoading(false);
        }
      }
    } else if (!isAdminView) {
      setError("Vui lòng đăng nhập trước");
      setLoading(false);
    } else {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    const id = getDeviceId();
    setDeviceId(id);
    setPasskeyChecking(true);
    fetchDeviceTrustStatus({ token, deviceId: id })
      .then((res) => {
        if (res.hasPasskey && !res.trusted) {
          setPasskeyRequired(true);
        } else {
          setPasskeyRequired(false);
        }
      })
      .catch(() => {
        setPasskeyRequired(false);
      })
      .finally(() => setPasskeyChecking(false));
  }, [token]);

  const handleVerifyPasskeyGate = async () => {
    setPasskeyError(null);
    if (!passkeyInput.trim()) {
      setPasskeyError("Vui lòng nhập mã xác minh 6 số.");
      return;
    }
    if (!/^\d{6}$/.test(passkeyInput)) {
      setPasskeyError("Mã xác minh phải đúng 6 chữ số.");
      return;
    }
    if (!token || !deviceId) {
      setPasskeyError("Phiên hết hạn. Vui lòng đăng nhập lại.");
      return;
    }
    setPasskeySubmitting(true);
    try {
      await verifyDeviceTrust({ token, deviceId, passkey: passkeyInput });
      setPasskeyRequired(false);
      setPasskeyInput("");
    } catch (err) {
      const message =
        typeof err === "object" && err && "message" in err
          ? String((err as { message?: string }).message)
          : "Unable to verify passkey.";
      setPasskeyError(message || "Không thể xác minh mã.");
    } finally {
      setPasskeySubmitting(false);
    }
  };

  const loadSocialProfile = async (authToken: string) => {
    try {
      const profile = await fetchCurrentProfile({ token: authToken });
      setCurrentUserProfile(profile);
    } catch (err) {
      console.error("❌ Failed to load current user profile", err);
    }
  };

  const loadMessagingProfile = async (authToken: string) => {
    try {
      const mp = await fetchMessagingProfileMe({ token: authToken });
      setCurrentMessagingProfile(mp);
    } catch (err) {
      console.error("Failed to load messaging profile", err);
      setCurrentMessagingProfile(null);
    }
  };

  const loadCurrentUserProfile = async (authToken: string) => {
    await Promise.all([
      loadSocialProfile(authToken),
      loadMessagingProfile(authToken),
    ]);
  };

  /** Avatar social đồng bộ sang messaging (backend); UI làm mới cả hai. */
  useEffect(() => {
    if (typeof window === "undefined" || !token) return;
    const onSocialProfileUpdated = () => {
      void loadSocialProfile(token);
      void loadMessagingProfile(token);
    };
    window.addEventListener(CURRENT_PROFILE_UPDATED_EVENT, onSocialProfileUpdated);
    return () =>
      window.removeEventListener(CURRENT_PROFILE_UPDATED_EVENT, onSocialProfileUpdated);
  }, [token]);

  const loadFollowing = async () => {
    try {
      const followingList = await serversApi.getFollowing();
      setFriends(followingList);
    } catch (err) {
      console.error("Failed to load following", err);
      setFriends([]);
    }
  };

  const loadAvailableUsers = useCallback(async () => {
    try {
      const usersList = await getAvailableUsers({ token });
      setFriends(usersList);
    } catch (err: any) {
      console.error(
        "Failed to load available users",
        err?.status ?? err?.message ?? err,
      );
      // Fallback to loading following if available users endpoint is not ready
      loadFollowing();
    }
  }, [token]);

  const bumpDmPeerToTop = useCallback(
    (peerId: string, activityAt?: string | number | Date) => {
      if (!peerId) return;
      const ts =
        activityAt instanceof Date
          ? activityAt.getTime()
          : typeof activityAt === "string"
            ? new Date(activityAt).getTime() || Date.now()
            : typeof activityAt === "number" && Number.isFinite(activityAt)
              ? activityAt
              : Date.now();
      setDmPeerLastActivityAt((prev) => ({ ...prev, [peerId]: ts }));
      setFriends((prev) => {
        const idx = prev.findIndex((f) => String(f._id) === String(peerId));
        if (idx < 0) return prev;
        const next = prev.slice();
        const [item] = next.splice(idx, 1);
        return [item, ...next];
      });
    },
    [],
  );

  const upsertFriendToDmList = useCallback((friend: serversApi.Friend | null | undefined) => {
    if (!friend?._id) return;
    setFriends((prev) => {
      const idx = prev.findIndex((f) => f._id === friend._id);
      if (idx < 0) {
        return [friend, ...prev];
      }

      const current = prev[idx];
      const merged: serversApi.Friend = {
        ...current,
        ...friend,
        displayName: friend.displayName || current.displayName,
        username: friend.username || current.username,
        avatarUrl: friend.avatarUrl || current.avatarUrl,
        email: friend.email || current.email,
      };

      const next = prev.slice();
      next.splice(idx, 1);
      next.unshift(merged);
      return next;
    });
  }, []);

  const handleDmMutePreference = useCallback(
    async (
      peerId: string,
      patch: Pick<DmConversationPreferences, "mutedUntil" | "mutedForever">,
    ) => {
      if (!token || !peerId) return;
      try {
        const next = await patchDmConversationPreferences({
          token,
          peerUserId: peerId,
          mutedUntil: patch.mutedUntil,
          mutedForever: patch.mutedForever,
        });
        const parsed = parseDmConversationPreferences(next);
        setDmConversationPrefs((prev) => ({ ...prev, [peerId]: parsed }));
        if (isDmConversationMuted(parsed)) {
          setDmUnreadCounts((prev) => ({ ...prev, [peerId]: 0 }));
        }
      } catch (e) {
        console.error("Failed to update DM mute preference", e);
      }
    },
    [token],
  );

  const handleDmCategoryPreference = useCallback(
    async (peerId: string, category: DmConversationCategory | null) => {
      if (!token || !peerId) return;
      try {
        const next = await patchDmConversationPreferences({
          token,
          peerUserId: peerId,
          category,
        });
        setDmConversationPrefs((prev) => ({
          ...prev,
          [peerId]: parseDmConversationPreferences(next),
        }));
      } catch (e) {
        console.error("Failed to update DM category", e);
      }
    },
    [token],
  );

  const handleDmUnfollowPeer = useCallback(
    async (peerId: string) => {
      if (!token || !peerId) return;
      try {
        await unfollowUser({ token, userId: peerId });
        setFollowingIds((prev) => {
          const next = new Set(prev);
          next.delete(peerId);
          return next;
        });
      } catch (e) {
        console.error("Failed to unfollow DM peer", e);
      }
    },
    [token],
  );

  const handleDmBlockPeer = useCallback(
    async (peerId: string) => {
      if (!token || !peerId) return;
      try {
        await blockUser({ token, userId: peerId });
        applyDmBlockSetsLive(
          new Set(dmBlockedByMeRef.current).add(peerId),
          dmBlockedByPeerRef.current,
        );
      } catch (e) {
        console.error("Failed to block DM peer", e);
      }
    },
    [token, applyDmBlockSetsLive],
  );

  const handleDmUnblockPeer = useCallback(
    async (peerId: string) => {
      if (!token || !peerId) return;
      try {
        await unblockUser({ token, userId: peerId });
        const next = new Set(dmBlockedByMeRef.current);
        next.delete(peerId);
        applyDmBlockSetsLive(next, dmBlockedByPeerRef.current);
      } catch (e) {
        console.error("Failed to unblock DM peer", e);
      }
    },
    [token, applyDmBlockSetsLive],
  );
  const activeDmPeerId = selectedDirectMessageFriend?._id ?? "";
  const dmBlockedByMeActive = Boolean(
    activeDmPeerId && dmBlockedByMe.has(activeDmPeerId),
  );
  const dmBlockedByPeerActive = Boolean(
    activeDmPeerId && dmBlockedByPeer.has(activeDmPeerId),
  );
  const shouldBlockDmChatInput = dmBlockedByMeActive || dmBlockedByPeerActive;

  const openDmContextMenu = useCallback(
    (
      e: React.MouseEvent,
      friend: { _id: string; displayName?: string; username?: string },
    ) => {
      e.preventDefault();
      e.stopPropagation();
      setDmContextMenu({
        x: e.clientX,
        y: e.clientY,
        friend,
      });
    },
    [],
  );

  const friendsForDmSidebar = useMemo(() => {
    // Apply realtime presence overrides when available
    let list = friends.map((f) => {
      const st = resolvePresenceStatus(
        (presenceByUserId as Record<string, unknown>)?.[f._id] as any,
      );
      if (st === "online" || st === "idle") return { ...f, isOnline: true };
      if (st === "offline") return { ...f, isOnline: false };
      return f;
    });
    if (dmSidebarPeersModeState === "online") {
      list = list.filter((f) => f.isOnline === true);
    }
    if (chatUserSettings?.dmListFrom === "followers_only") {
      list = list.filter(
        (f) => followingIds.has(f._id) || conversations.has(f._id),
      );
    }
    list.sort((a, b) => {
      const ta = dmPeerLastActivityAt[a._id] ?? 0;
      const tb = dmPeerLastActivityAt[b._id] ?? 0;
      if (tb !== ta) return tb - ta;
      const na = (a.displayName || a.username || "").toLowerCase();
      const nb = (b.displayName || b.username || "").toLowerCase();
      return na.localeCompare(nb);
    });
    return list;
  }, [
    friends,
    presenceByUserId,
    dmSidebarPeersModeState,
    chatUserSettings?.dmListFrom,
    followingIds,
    conversations,
    dmPeerLastActivityAt,
  ]);

  useEffect(() => {
    const onDm = () => setDmSidebarPeersModeState(getDmSidebarPeersMode());
    const onChat = () => {
      const auth =
        typeof window !== "undefined"
          ? localStorage.getItem("accessToken")
          : null;
      if (!auth) return;
      void fetchUserSettings({ token: auth })
        .then(setChatUserSettings)
        .catch(() => {});
    };
    window.addEventListener("cordigram-dm-sidebar-prefs", onDm);
    window.addEventListener("cordigram-chat-settings", onChat);
    return () => {
      window.removeEventListener("cordigram-dm-sidebar-prefs", onDm);
      window.removeEventListener("cordigram-chat-settings", onChat);
    };
  }, []);

  // Realtime: reflect profile style/avatar updates in DM sidebar + open DM profile panel.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStyle = (e: Event) => {
      const ce = e as CustomEvent;
      const d = (ce?.detail ?? {}) as {
        profileContext?: "messaging" | "social";
        userId?: string;
        avatarUrl?: string | null;
        displayName?: string;
        username?: string;
        displayNameFontId?: string | null;
        displayNameEffectId?: string | null;
        displayNamePrimaryHex?: string | null;
        displayNameAccentHex?: string | null;
      };
      const uid = d?.userId ? String(d.userId) : "";
      if (!uid) return;

      const isMessaging = d.profileContext === "messaging";
      const hasIdentityPatch =
        "avatarUrl" in d || "displayName" in d || "username" in d;
      const hasStylePatch =
        "displayNameFontId" in d ||
        "displayNameEffectId" in d ||
        "displayNamePrimaryHex" in d ||
        "displayNameAccentHex" in d;

      if (hasIdentityPatch || hasStylePatch) {
        setFriends((prev) =>
          prev.map((f) =>
            String(f._id) !== uid
              ? f
              : ({
                  ...f,
                  avatarUrl:
                    isMessaging && "avatarUrl" in d
                      ? (d.avatarUrl ?? f.avatarUrl)
                      : f.avatarUrl,
                  displayName: "displayName" in d ? (d.displayName ?? f.displayName) : f.displayName,
                  ...(isMessaging
                    ? {}
                    : { username: "username" in d ? (d.username ?? f.username) : f.username }),
                  displayNameFontId:
                    "displayNameFontId" in d ? (d.displayNameFontId ?? f.displayNameFontId) : f.displayNameFontId,
                  displayNameEffectId:
                    "displayNameEffectId" in d ? (d.displayNameEffectId ?? f.displayNameEffectId) : f.displayNameEffectId,
                  displayNamePrimaryHex:
                    "displayNamePrimaryHex" in d ? (d.displayNamePrimaryHex ?? f.displayNamePrimaryHex) : f.displayNamePrimaryHex,
                  displayNameAccentHex:
                    "displayNameAccentHex" in d ? (d.displayNameAccentHex ?? f.displayNameAccentHex) : f.displayNameAccentHex,
                } as any),
          ),
        );
      }

      setSelectedDirectMessageFriend((prev) => {
        if (!prev || String(prev._id) !== uid) return prev;
        return {
          ...prev,
          avatarUrl:
            isMessaging && "avatarUrl" in d
              ? (d.avatarUrl ?? prev.avatarUrl)
              : prev.avatarUrl,
          displayName: d.displayName ?? prev.displayName,
          ...(isMessaging ? {} : { username: d.username ?? prev.username }),
          displayNameFontId:
            "displayNameFontId" in d ? (d.displayNameFontId ?? prev.displayNameFontId) : prev.displayNameFontId,
          displayNameEffectId:
            "displayNameEffectId" in d ? (d.displayNameEffectId ?? prev.displayNameEffectId) : prev.displayNameEffectId,
          displayNamePrimaryHex:
            "displayNamePrimaryHex" in d ? (d.displayNamePrimaryHex ?? prev.displayNamePrimaryHex) : prev.displayNamePrimaryHex,
          displayNameAccentHex:
            "displayNameAccentHex" in d ? (d.displayNameAccentHex ?? prev.displayNameAccentHex) : prev.displayNameAccentHex,
        } as any;
      });

      setDmProfileDetail((prev) => {
        if (!prev || String((prev as any).userId) !== uid) return prev;
        return {
          ...(prev as any),
          avatarUrl:
            isMessaging && "avatarUrl" in d
              ? (d.avatarUrl ?? (prev as any).avatarUrl)
              : (prev as any).avatarUrl,
          displayName: d.displayName ?? (prev as any).displayName,
          ...("username" in d
            ? { chatUsername: d.username ?? (prev as any).chatUsername }
            : {}),
          displayNameFontId:
            "displayNameFontId" in d ? (d.displayNameFontId ?? (prev as any).displayNameFontId) : (prev as any).displayNameFontId,
          displayNameEffectId:
            "displayNameEffectId" in d ? (d.displayNameEffectId ?? (prev as any).displayNameEffectId) : (prev as any).displayNameEffectId,
          displayNamePrimaryHex:
            "displayNamePrimaryHex" in d ? (d.displayNamePrimaryHex ?? (prev as any).displayNamePrimaryHex) : (prev as any).displayNamePrimaryHex,
          displayNameAccentHex:
            "displayNameAccentHex" in d ? (d.displayNameAccentHex ?? (prev as any).displayNameAccentHex) : (prev as any).displayNameAccentHex,
        } as any;
      });

      if (isMessaging && String(uid) === String(currentUserId)) {
        setCurrentMessagingProfile((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            displayName: "displayName" in d ? (d.displayName ?? prev.displayName) : prev.displayName,
            chatUsername: "username" in d ? (d.username ?? prev.chatUsername) : prev.chatUsername,
            avatarUrl: "avatarUrl" in d ? (d.avatarUrl ?? prev.avatarUrl) : prev.avatarUrl,
            displayNameFontId:
              "displayNameFontId" in d ? (d.displayNameFontId ?? prev.displayNameFontId) : prev.displayNameFontId,
            displayNameEffectId:
              "displayNameEffectId" in d ? (d.displayNameEffectId ?? prev.displayNameEffectId) : prev.displayNameEffectId,
            displayNamePrimaryHex:
              "displayNamePrimaryHex" in d ? (d.displayNamePrimaryHex ?? prev.displayNamePrimaryHex) : prev.displayNamePrimaryHex,
            displayNameAccentHex:
              "displayNameAccentHex" in d ? (d.displayNameAccentHex ?? prev.displayNameAccentHex) : prev.displayNameAccentHex,
          };
        });
      }

      if (!isMessaging) {
        setCurrentUserProfile((prev: any) => {
          if (!prev || String(prev.userId ?? prev.id ?? "") !== uid) return prev;
          return {
            ...prev,
            avatarUrl: "avatarUrl" in d ? (d.avatarUrl ?? prev.avatarUrl) : prev.avatarUrl,
            displayName: d.displayName ?? prev.displayName,
            username: d.username ?? prev.username,
            displayNameFontId:
              "displayNameFontId" in d ? (d.displayNameFontId ?? prev.displayNameFontId) : prev.displayNameFontId,
            displayNameEffectId:
              "displayNameEffectId" in d ? (d.displayNameEffectId ?? prev.displayNameEffectId) : prev.displayNameEffectId,
            displayNamePrimaryHex:
              "displayNamePrimaryHex" in d ? (d.displayNamePrimaryHex ?? prev.displayNamePrimaryHex) : prev.displayNamePrimaryHex,
            displayNameAccentHex:
              "displayNameAccentHex" in d ? (d.displayNameAccentHex ?? prev.displayNameAccentHex) : prev.displayNameAccentHex,
          };
        });
      } else if (String(uid) === String(currentUserId)) {
        setCurrentUserProfile((prev: any) => {
          if (!prev) return prev;
          return {
            ...prev,
            avatarUrl: "avatarUrl" in d ? (d.avatarUrl ?? prev.avatarUrl) : prev.avatarUrl,
            displayName: "displayName" in d ? (d.displayName ?? prev.displayName) : prev.displayName,
            displayNameFontId:
              "displayNameFontId" in d ? (d.displayNameFontId ?? prev.displayNameFontId) : prev.displayNameFontId,
            displayNameEffectId:
              "displayNameEffectId" in d ? (d.displayNameEffectId ?? prev.displayNameEffectId) : prev.displayNameEffectId,
            displayNamePrimaryHex:
              "displayNamePrimaryHex" in d ? (d.displayNamePrimaryHex ?? prev.displayNamePrimaryHex) : prev.displayNamePrimaryHex,
            displayNameAccentHex:
              "displayNameAccentHex" in d ? (d.displayNameAccentHex ?? prev.displayNameAccentHex) : prev.displayNameAccentHex,
          };
        });
      }
    };

    window.addEventListener("cordigram-user-profile-style-updated", onStyle as any);
    return () => window.removeEventListener("cordigram-user-profile-style-updated", onStyle as any);
  }, [currentUserId]);

  useEffect(() => {
    if (!dmUserIdFromUrl || !token) return;
    if (autoOpenedDmUserRef.current === dmUserIdFromUrl) return;

    const existing = friends.find((f) => f._id === dmUserIdFromUrl);
    const normalizedUsername =
      (dmUsernameFromUrl || existing?.username || "").trim() ||
      dmUserIdFromUrl.slice(0, 8);
    const normalizedDisplayName =
      (dmDisplayNameFromUrl || existing?.displayName || normalizedUsername).trim() ||
      normalizedUsername;

    const friend: serversApi.Friend = existing ?? {
      _id: dmUserIdFromUrl,
      displayName: normalizedDisplayName,
      username: normalizedUsername,
      avatarUrl: dmAvatarFromUrl || "",
      email: "",
    };

    if (!existing) {
      setFriends((prev) =>
        prev.some((f) => f._id === dmUserIdFromUrl) ? prev : [...prev, friend],
      );
    }

    autoOpenedDmUserRef.current = dmUserIdFromUrl;
    setSelectedDirectMessageFriend(friend);
    setMessageText("");
    setSelectedServer(null);
    setSelectedChannel(null);
    setDmUnreadCounts((prev) => ({ ...prev, [String(dmUserIdFromUrl)]: 0 }));
    dmReadPeersRef.current.add(String(dmUserIdFromUrl));
    prepareScrollToLatest();

    try {
      markAllAsRead?.(dmUserIdFromUrl);
      void markDmConversationRead({ token, userId: dmUserIdFromUrl });
    } catch (_err) {
      // ignore
    }

    void loadDirectMessages(dmUserIdFromUrl);
  }, [
    dmUserIdFromUrl,
    dmDisplayNameFromUrl,
    dmUsernameFromUrl,
    dmAvatarFromUrl,
    friends,
    token,
    markAllAsRead,
  ]);

  useEffect(() => {
    if (!token) return;
    void fetchUserSettings({ token })
      .then(setChatUserSettings)
      .catch(() => {});
    void fetchBoostStatus({ token, scope: "messages" })
      .then((b) => {
        setBoostStatus(b);
        const v = (b as any)?.limits?.maxUploadBytes;
        if (typeof v === "number" && Number.isFinite(v) && v > 0) {
          setMaxUploadBytes(v);
        } else {
          setMaxUploadBytes(DEFAULT_FREE_MAX_UPLOAD_BYTES);
        }
      })
      .catch(() => {
        setBoostStatus(null);
        setMaxUploadBytes(DEFAULT_FREE_MAX_UPLOAD_BYTES);
      });
    void fetchApiHealth().then((h) => {
      if (h?.features?.dmServerStickers === true) {
        setDmApiServerStickerSupport("supported");
      } else if (h?.features && h.features.dmServerStickers === false) {
        setDmApiServerStickerSupport("unsupported");
      }
    });
    void serversApi
      .getFollowing()
      .then((list) => setFollowingIds(new Set(list.map((f) => f._id))))
      .catch(() => setFollowingIds(new Set()));
  }, [token]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onBoost = (e: Event) => {
      const detail = (e as CustomEvent<any>).detail;
      if (
        detail &&
        typeof detail === "object" &&
        detail.scope &&
        detail.scope !== "messages"
      ) {
        return;
      }
      if (detail && typeof detail === "object") {
        setBoostStatus((prev) => ({
          ...(prev ?? {}),
          tier: detail?.tier ?? (prev as any)?.tier,
          active: typeof detail?.active === "boolean" ? detail.active : (prev as any)?.active,
          expiresAt: "expiresAt" in detail ? detail?.expiresAt : (prev as any)?.expiresAt,
          limits: detail?.limits ?? (prev as any)?.limits,
        }));
      }
      const v = detail?.limits?.maxUploadBytes;
      if (typeof v === "number" && Number.isFinite(v) && v > 0) {
        setMaxUploadBytes(v);
      }
    };
    window.addEventListener("cordigram-boost-entitlement-updated", onBoost as any);
    return () =>
      window.removeEventListener(
        "cordigram-boost-entitlement-updated",
        onBoost as any,
      );
  }, []);

  // Debug: Log current user profile when it changes
  useEffect(() => {
    if (currentUserProfile) {
    }
  }, [currentUserProfile]);

  // Load channels and active events when server changes
  const loadActiveEvents = useCallback(async (serverId: string) => {
    try {
      const { active, upcoming } = await serversApi.getServerEvents(serverId);
      setActiveServerEvents(active);
      setServerEventsTotalCount(active.length + upcoming.length);
    } catch {
      setActiveServerEvents([]);
      setServerEventsTotalCount(0);
    }
  }, []);

  useEffect(() => {
    if (selectedServer) {
      setMessages([]);
      loadMessagesSeqRef.current += 1;
      lastLoadedMessagesChannelRef.current = null;
      const prevCh = prevChannelRef.current;
      if (prevCh) {
        leaveChannel(prevCh);
        prevChannelRef.current = null;
      }
      setSelectedChannel(null);
      selectedChannelRef.current = null;
      setAllChannels([]);
      setInfoChannels([]);
      setTextChannels([]);
      setVoiceChannels([]);
      const pending = pendingChannelSelectRef.current;
      if (pending?.serverId === selectedServer) {
        pendingChannelSelectRef.current = null;
        void loadChannels(selectedServer, { preferredChannelId: pending.channelId });
      } else {
        void loadChannels(selectedServer);
      }
      loadActiveEvents(selectedServer);
      setSelectedDirectMessageFriend(null); // Clear selected DM friend when selecting server
      setShowBoostUpgradeView(false);

      if (
        selectedServer &&
        currentUserId &&
        typeof window !== "undefined"
      ) {
        const pendingNick = sessionStorage
          .getItem(`cordigram:joinNick:${selectedServer}`)
          ?.trim();
        if (pendingNick) {
          setServers((prev) =>
            prev.map((s) => {
              if (s._id !== selectedServer) return s;
              const members = [...(s.members || [])];
              const idx = members.findIndex(
                (m) => String(m.userId) === String(currentUserId),
              );
              if (idx >= 0) {
                members[idx] = { ...members[idx], nickname: pendingNick };
              } else {
                members.push({
                  userId: currentUserId,
                  role: "member",
                  joinedAt: new Date().toISOString(),
                  nickname: pendingNick,
                });
              }
              return { ...s, members };
            }),
          );
          sessionStorage.removeItem(`cordigram:joinNick:${selectedServer}`);
        }
      }
      
      const isAdminViewedServer = Boolean(isAdminView && adminViewServerId && selectedServer === adminViewServerId);
      if (!isAdminViewedServer) {
        // Fetch member role colors cho server
        serversApi.getServerMembersWithRoles(selectedServer)
          .then((response) => {
            const colorMap: Record<string, string> = {};
            const nickMap: Record<string, string> = {};
            response.members.forEach((member) => {
              if (member.displayColor && member.displayColor !== "#99AAB5") {
                colorMap[member.userId] = member.displayColor;
              }
              const nick = member.nickname?.trim();
              if (nick) nickMap[member.userId] = nick;
            });
            if (Object.keys(nickMap).length > 0) {
              setServers((prev) =>
                prev.map((s) => {
                  if (s._id !== selectedServer) return s;
                  const members = (s.members || []).map((m) => {
                    const nick = nickMap[String(m.userId)];
                    return nick ? { ...m, nickname: nick } : m;
                  });
                  for (const [uid, nick] of Object.entries(nickMap)) {
                    if (members.some((m) => String(m.userId) === uid)) continue;
                    members.push({
                      userId: uid,
                      role: "member",
                      joinedAt: new Date().toISOString(),
                      nickname: nick,
                    });
                  }
                  return { ...s, members };
                }),
              );
            }
            setMemberRoleColors(colorMap);
            setMembersForMessageSearch(
              response.members.map((m) => ({
                userId: m.userId,
                displayName: m.displayName,
                username: m.username,
                avatarUrl: m.avatarUrl,
              })),
            );
          })
          .catch((err) => {
            console.error("[MessagesPage] Failed to fetch member role colors:", err);
            setMemberRoleColors({});
            setMembersForMessageSearch([]);
          });
        // Fetch permissions to determine if user can drag channels
        serversApi.getCurrentUserPermissions(selectedServer)
          .then((perms) => {
            setCanDragChannels(perms.isOwner || perms.canManageChannels);
            setCanUseMentions(Boolean(perms.isOwner || perms.mentionEveryone));
          })
          .catch(() => {
            setCanDragChannels(false);
            setCanUseMentions(false);
          });
        // Fetch interaction settings for welcome banner
        serversApi.getInteractionSettings(selectedServer)
          .then((s) => setServerInteractionSettings(s))
          .catch(() => setServerInteractionSettings(null));
      } else {
        // Admin view: do not call member-only endpoints (will 403).
        setMemberRoleColors({});
        setMembersForMessageSearch([]);
        setCanDragChannels(false);
        setCanUseMentions(false);
        setServerInteractionSettings(null);
      }
    } else {
      setInfoChannels([]);
      setTextChannels([]);
      setVoiceChannels([]);
      setAllChannels([]);
      setServerCategories([]);
      setSelectedChannel(null);
      setActiveServerEvents([]);
      setServerEventsTotalCount(0);
      setMemberRoleColors({});
      setMembersForMessageSearch([]);
      setCanDragChannels(false);
      setCanUseMentions(false);
      setServerInteractionSettings(null);
    }
  }, [selectedServer, loadActiveEvents, leaveChannel]);

  // If selectedServer no longer exists (deleted/left), stop requesting it.
  useEffect(() => {
    if (!selectedServer) return;
    if (servers.some((s) => s._id === selectedServer)) return;
    setSelectedServer(null);
    setSelectedChannel(null);
    setShowServerSettingsPanel(false);
    setServerSettingsTarget(null);
    setServerSettingsPermissions(null);
  }, [selectedServer, servers]);

  // Xóa trạng thái gate **trước paint** khi đổi server / thoát DM — tránh 1 frame banner/input
  // dùng `myServerAccessStatus` của server trước (hiện "Hoàn thành" nhầm trên server khác).
  useLayoutEffect(() => {
    if (selectedDirectMessageFriend) {
      setMyServerAccessStatus(null);
      return;
    }
    if (!selectedServer) {
      setMyServerAccessStatus(null);
      return;
    }
    if (isAdminView && adminViewServerId && selectedServer === adminViewServerId) {
      setMyServerAccessStatus({
        chatViewBlocked: false,
        chatBlockReason: null,
        hasRules: false,
        acceptedRules: true,
        verificationLevel: "none",
        verificationChecks: { emailVerified: true, accountOver5Min: true, memberOver10Min: true },
        verificationWait: { waitAccountSec: 0, waitMemberSec: 0 },
        showAgeRestrictedChannelNotice: false,
      } as any);
      return;
    }
    setMyServerAccessStatus(null);
  }, [selectedServer, selectedDirectMessageFriend, isAdminView, adminViewServerId]);

  // Fetch "my access status" để biết có cần chấp nhận quy định hay không.
  useEffect(() => {
    if (!selectedServer || selectedDirectMessageFriend) {
      setMyServerAccessStatus(null);
      return;
    }

    // Admin view: bypass all restrictions
    if (isAdminView && selectedServer === adminViewServerId) {
      setMyServerAccessStatus({
        chatViewBlocked: false,
        chatBlockReason: null,
        hasRules: false,
        acceptedRules: true,
        verificationLevel: "none",
        verificationChecks: { emailVerified: true, accountOver5Min: true, memberOver10Min: true },
        verificationWait: { waitAccountSec: 0, waitMemberSec: 0 },
        showAgeRestrictedChannelNotice: false,
      } as any);
      return;
    }

    let cancelled = false;
    setMyServerAccessStatus(null);

    (async () => {
      try {
        const status = await serversApi.getMyServerAccessStatus(selectedServer);
        if (cancelled) return;
        setMyServerAccessStatus(status);
      } catch {
        if (cancelled) return;
        setMyServerAccessStatus(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedServer, selectedDirectMessageFriend]);

  useEffect(() => {
    if (!selectedServer || selectedDirectMessageFriend) {
      setMyServerChannelDisplayStyle(null);
      return;
    }
    let cancelled = false;
    void serversApi
      .getMyServerProfile(selectedServer)
      .then((res) => {
        if (cancelled) return;
        const hasServerStyle = Boolean(
          res.displayNameFontId ||
            res.displayNameEffectId ||
            res.displayNamePrimaryHex ||
            res.displayNameAccentHex,
        );
        setMyServerChannelDisplayStyle(
          hasServerStyle
            ? {
                displayNameFontId: res.displayNameFontId ?? null,
                displayNameEffectId: res.displayNameEffectId ?? null,
                displayNamePrimaryHex: res.displayNamePrimaryHex ?? null,
                displayNameAccentHex: res.displayNameAccentHex ?? null,
              }
            : null,
        );
      })
      .catch(() => {
        if (!cancelled) setMyServerChannelDisplayStyle(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedServer, selectedDirectMessageFriend]);

  useEffect(() => {
    if (typeof window === "undefined" || !selectedServer) return;
    const onServerProfile = (e: Event) => {
      const d = (e as CustomEvent).detail as {
        serverId?: string;
        userId?: string;
        displayNameFontId?: string | null;
        displayNameEffectId?: string | null;
        displayNamePrimaryHex?: string | null;
        displayNameAccentHex?: string | null;
      };
      if (!d?.serverId || String(d.serverId) !== String(selectedServer)) return;
      if (String(d.userId) !== String(currentUserId)) return;
      const hasStyle =
        "displayNameFontId" in d ||
        "displayNameEffectId" in d ||
        "displayNamePrimaryHex" in d ||
        "displayNameAccentHex" in d;
      if (!hasStyle) return;
      setMyServerChannelDisplayStyle((prev) => ({
        ...(prev ?? {}),
        displayNameFontId:
          "displayNameFontId" in d ? (d.displayNameFontId ?? null) : prev?.displayNameFontId,
        displayNameEffectId:
          "displayNameEffectId" in d
            ? (d.displayNameEffectId ?? null)
            : prev?.displayNameEffectId,
        displayNamePrimaryHex:
          "displayNamePrimaryHex" in d
            ? (d.displayNamePrimaryHex ?? null)
            : prev?.displayNamePrimaryHex,
        displayNameAccentHex:
          "displayNameAccentHex" in d
            ? (d.displayNameAccentHex ?? null)
            : prev?.displayNameAccentHex,
      }));
    };
    window.addEventListener(
      "cordigram-server-member-profile-updated",
      onServerProfile as EventListener,
    );
    return () =>
      window.removeEventListener(
        "cordigram-server-member-profile-updated",
        onServerProfile as EventListener,
      );
  }, [selectedServer, currentUserId]);

  // Khi bị chặn bởi mức xác minh (thời gian), refetch trạng thái để mở chat khi đủ điều kiện.
  useEffect(() => {
    if (!selectedServer || selectedDirectMessageFriend) return;
    if (myServerAccessStatus?.verificationLevel === "none") return;
    if (myServerAccessStatus?.chatBlockReason !== "verification") return;
    const t = setInterval(async () => {
      try {
        const status = await serversApi.getMyServerAccessStatus(selectedServer);
        setMyServerAccessStatus(status);
      } catch {
        /* ignore */
      }
    }, 35000);
    return () => clearInterval(t);
  }, [
    selectedServer,
    selectedDirectMessageFriend,
    myServerAccessStatus?.chatBlockReason,
    myServerAccessStatus?.verificationLevel,
  ]);

  // Cập nhật countdown / checklist xác minh trong modal; không tự đóng dialog (chỉ nút ×).
  useEffect(() => {
    if (!verificationRulesOpen || !selectedServer || selectedDirectMessageFriend) return;
    const id = setInterval(async () => {
      try {
        const s = await serversApi.getMyServerAccessStatus(selectedServer);
        setMyServerAccessStatus(s);
      } catch {
        /* ignore */
      }
    }, 3000);
    return () => clearInterval(id);
  }, [verificationRulesOpen, selectedServer, selectedDirectMessageFriend]);

  useEffect(() => {
    setLocalWaitAccountSec(myServerAccessStatus?.verificationWait?.waitAccountSec ?? null);
    setLocalWaitMemberSec(myServerAccessStatus?.verificationWait?.waitMemberSec ?? null);
  }, [myServerAccessStatus?.verificationWait?.waitAccountSec, myServerAccessStatus?.verificationWait?.waitMemberSec]);

  useEffect(() => {
    if (localWaitAccountSec == null && localWaitMemberSec == null) return;
    if ((localWaitAccountSec ?? 0) <= 0 && (localWaitMemberSec ?? 0) <= 0) return;
    const id = setInterval(() => {
      setLocalWaitAccountSec(prev => (prev != null && prev > 0 ? prev - 1 : prev));
      setLocalWaitMemberSec(prev => (prev != null && prev > 0 ? prev - 1 : prev));
    }, 1000);
    return () => clearInterval(id);
  }, [localWaitAccountSec != null && localWaitAccountSec > 0, localWaitMemberSec != null && localWaitMemberSec > 0]);

  useEffect(() => {
    if (emailOtpCooldown <= 0) return;
    const id = setInterval(() => {
      setEmailOtpCooldown(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [emailOtpCooldown > 0]);

  useEffect(() => {
    setEmailOtpSent(false);
    setEmailOtpCode("");
    setEmailOtpError(null);
    setEmailOtpCooldown(0);
  }, [selectedServer]);

  const refreshServerEmojiMap = useCallback(async () => {
    const authToken =
      localStorage.getItem("accessToken") || localStorage.getItem("token") || "";
    if (!authToken) {
      setServerEmojiRenderMap({});
      return;
    }
    const contextServerId = selectedServer || null;
    const adminViewingServer =
      isAdminView &&
      adminViewServerId &&
      contextServerId &&
      String(contextServerId) === String(adminViewServerId);
    try {
      const data = adminViewingServer
        ? await serversApi.adminGetEmojiPickerData(
            contextServerId,
            authToken,
          )
        : await serversApi.getEmojiPickerData(contextServerId || undefined);
      setServerEmojiRenderMap(
        buildServerEmojiRenderMapFromPickerGroups(data.groups),
      );
    } catch {
      setServerEmojiRenderMap({});
    }
  }, [
    selectedServer,
    selectedChannel,
    selectedDirectMessageFriend?._id,
    token,
    isAdminView,
    adminViewServerId,
  ]);

  useEffect(() => {
    void refreshServerEmojiMap();
  }, [refreshServerEmojiMap]);

  // Refetch active events mỗi 60s khi đang chọn server → sự kiện xuất hiện đúng lúc khi đến giờ
  useEffect(() => {
    if (!selectedServer) return;
    const interval = setInterval(() => loadActiveEvents(selectedServer), 60000);
    return () => clearInterval(interval);
  }, [selectedServer, loadActiveEvents]);

  // Fetch và cập nhật danh sách người trong từng kênh thoại — mọi thành viên server đều thấy (poll 5s + refetch khi quay lại tab)
  useEffect(() => {
    if (!selectedServer || voiceChannels.length === 0) {
      setVoiceChannelParticipants({});
      return;
    }
    const fetchAll = async () => {
      const next: Record<string, { identity: string; name: string }[]> = {};
      await Promise.all(
        voiceChannels.map(async (ch) => {
          try {
            const { participants } = await getVoiceChannelParticipants(selectedServer, ch._id);
            next[ch._id] = participants;
          } catch {
            next[ch._id] = [];
          }
        }),
      );
      setVoiceChannelParticipants((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };
    fetchAll();
    const interval = setInterval(fetchAll, 5000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") fetchAll();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [selectedServer, voiceChannels]);

  // Khi mở popup mời vào server: một API gộp follow/followers + loại thành viên server
  useEffect(() => {
    if (!inviteToServerTarget) {
      setInviteToServerCandidates([]);
      setInviteToServerInitialInvitedIds([]);
      return;
    }
    const { serverId: sid } = inviteToServerTarget;
    let cancelled = false;
    serversApi
      .getServerInviteCandidates(sid)
      .then(({ candidates, invitedUserIds }) => {
        if (cancelled) return;
        setInviteToServerCandidates(candidates);
        setInviteToServerInitialInvitedIds(invitedUserIds);
      })
      .catch(() => {
        if (!cancelled) {
          setInviteToServerCandidates([]);
          setInviteToServerInitialInvitedIds([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [inviteToServerTarget]);

  // Kiểm tra Hộp thư (Dành cho Bạn) có lời mời vào máy chủ → hiển thị chấm đỏ. Refetch khi quay lại trang (vd sau khi chấp nhận lời mời) để cập nhật badge.
  useEffect(() => {
    if (!currentUserId) return;
    let cancelled = false;
    fetchInboxForYou()
      .then((res) => {
        if (cancelled) return;
        const hasUnread = (res.items ?? []).some((i) => i.seen !== true);
        setHasInboxNotification(hasUnread);
      })
      .catch(() => {
        if (!cancelled) setHasInboxNotification(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentUserId, selectedServer]);

  // Load DM unread counts for friends list and DIRECT MESSAGES indicator
  useEffect(() => {
    if (!token || selectedServer) return;
    let cancelled = false;
    const gen = ++dmBlockFetchGenRef.current;
    getConversationList({ token })
      .then((list) => {
        if (cancelled) return;
        const counts: Record<string, number> = {};
        const activity: Record<string, number> = {};
        const prefs: Record<string, DmConversationPreferences> = {};
        const blocked = new Set<string>();
        const blockedByPeer = new Set<string>();
        list.forEach((c) => {
          const peerId = String(c.userId ?? "");
          if (!peerId) return;
          const apiCount = Math.max(0, Number(c.unreadCount) || 0);
          const pref = parseDmConversationPreferences(c.preferences);
          prefs[peerId] = pref;
          if (c.isBlockedByMe) blocked.add(peerId);
          if (c.isBlockedByPeer) blockedByPeer.add(peerId);
          if (c.isFollowing) {
            setFollowingIds((prev) => new Set(prev).add(peerId));
          }
          counts[peerId] =
            dmReadPeersRef.current.has(peerId) || isDmConversationMuted(pref)
              ? 0
              : apiCount;
          if (c.lastMessageTime) {
            const t = new Date(c.lastMessageTime).getTime();
            if (!Number.isNaN(t)) activity[peerId] = t;
          }
        });
        setDmConversationPrefs((prev) => ({ ...prev, ...prefs }));
        applyDmBlockSetsFromApi(blocked, blockedByPeer, gen);
        const activeDmId = selectedDmFriendRef.current?._id;
        if (activeDmId) counts[String(activeDmId)] = 0;
        setDmUnreadCounts(counts);
        if (Object.keys(activity).length > 0) {
          setDmPeerLastActivityAt((prev) => ({ ...prev, ...activity }));
          const rank = new Map(
            list.map((c, i) => [c.userId, i] as const),
          );
          setFriends((prev) =>
            [...prev].sort((a, b) => {
              const ra = rank.has(a._id)
                ? rank.get(a._id)!
                : Number.MAX_SAFE_INTEGER;
              const rb = rank.has(b._id)
                ? rank.get(b._id)!
                : Number.MAX_SAFE_INTEGER;
              if (ra !== rb) return ra - rb;
              const na = (a.displayName || a.username || "").toLowerCase();
              const nb = (b.displayName || b.username || "").toLowerCase();
              return na.localeCompare(nb);
            }),
          );
        }
      })
      .catch(() => {
        if (!cancelled) setDmUnreadCounts({});
      });
    return () => { cancelled = true; };
  }, [token, selectedServer, applyDmBlockSetsFromApi]);

  useEffect(() => {
    if (!currentUserId) return;
    try {
      const raw = sessionStorage.getItem(`cordigram:dm-blocks:${currentUserId}`);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          byMe?: string[];
          byPeer?: string[];
        };
        applyDmBlockSets(
          new Set(Array.isArray(parsed.byMe) ? parsed.byMe : []),
          new Set(Array.isArray(parsed.byPeer) ? parsed.byPeer : []),
        );
      }
    } catch {
      /* ignore */
    }
    void refreshDmBlockState();
  }, [currentUserId, applyDmBlockSets, refreshDmBlockState]);

  useEffect(() => {
    if (!token || selectedServer) return;
    const syncBlocks = () => {
      void refreshDmBlockState();
    };
    const onVis = () => {
      if (document.visibilityState === "visible") syncBlocks();
    };
    window.addEventListener("focus", syncBlocks);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("focus", syncBlocks);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [token, selectedServer, refreshDmBlockState]);

  // Đồng bộ badge từng hội thoại theo backend (socket dm-unread-count).
  useEffect(() => {
    if (!dmUnreadCountEvent) return;
    const peerId = dmUnreadCountEvent.fromUserId
      ? String(dmUnreadCountEvent.fromUserId)
      : "";
    const count = dmUnreadCountEvent.conversationUnread;
    if (!peerId || typeof count !== "number" || !Number.isFinite(count)) return;
    const normalized = Math.max(0, count);
    if (normalized === 0) {
      dmReadPeersRef.current.add(peerId);
    } else {
      dmReadPeersRef.current.delete(peerId);
    }
    if (String(selectedDmFriendRef.current?._id ?? "") === peerId) {
      setDmUnreadCounts((prev) => ({ ...prev, [peerId]: 0 }));
      return;
    }
    setDmUnreadCounts((prev) => ({ ...prev, [peerId]: normalized }));
  }, [dmUnreadCountEvent]);

  useEffect(() => {
    if (!dmBlockUpdatedEvent) return;
    if (dmBlockUpdatedEvent.direction === "outgoing") {
      const peerId = dmBlockUpdatedEvent.peerId;
      if (!peerId) return;
      const next = new Set(dmBlockedByMeRef.current);
      if (dmBlockUpdatedEvent.blocked) next.add(peerId);
      else next.delete(peerId);
      applyDmBlockSetsLive(next, dmBlockedByPeerRef.current);
      return;
    }
    const blockerId = dmBlockUpdatedEvent.blockerId;
    if (!blockerId) return;
    const nextPeer = new Set(dmBlockedByPeerRef.current);
    if (dmBlockUpdatedEvent.blocked) nextPeer.add(blockerId);
    else nextPeer.delete(blockerId);
    applyDmBlockSetsLive(dmBlockedByMeRef.current, nextPeer);
  }, [dmBlockUpdatedEvent, applyDmBlockSetsLive]);

  // Mở server từ link /messages?server=xxx (sau khi join từ event link)
  useEffect(() => {
    const serverIdFromUrl = searchParams.get("server");
    if (serverIdFromUrl && servers.length > 0) {
      const exists = servers.some((s) => s._id === serverIdFromUrl);
      if (exists) setSelectedServer(serverIdFromUrl);
    }
  }, [searchParams, servers]);

  // Admin read-only view: load server data via admin endpoint (no membership needed)
  useEffect(() => {
    if (!isAdminView || !adminViewServerId) return;
    const authToken = localStorage.getItem("accessToken") || localStorage.getItem("token") || "";
    if (!authToken) return;

    serversApi.adminGetServerView(adminViewServerId, authToken).then((data) => {
      const srv = data.server as any;
      const chs = (data.channels || []) as serversApi.Channel[];
      const cats = (data.categories || []) as serversApi.ServerCategory[];
      const bs: BackendServer = {
        _id: srv._id,
        name: srv.name,
        description: srv.description,
        avatarUrl: srv.avatarUrl,
        bannerUrl: srv.bannerUrl,
        ownerId: typeof srv.ownerId === "object" ? srv.ownerId._id : srv.ownerId,
        members: srv.members || [],
        channels: chs,
        memberCount: srv.memberCount,
        isActive: srv.isActive,
        isPublic: srv.isPublic,
        createdAt: srv.createdAt,
        updatedAt: srv.updatedAt,
        primaryLanguage: srv.primaryLanguage,
        communitySettings: srv.communitySettings,
        infoChannels: chs.filter((c) => c.type === "text" && c.category === "info" && !c.categoryId),
        textChannels: chs.filter((c) => c.type === "text" && c.category !== "info"),
        voiceChannels: chs.filter((c) => c.type === "voice"),
        serverCategories: cats,
      };
      setServers((prev) => {
        const without = prev.filter((s) => s._id !== bs._id);
        return [...without, bs];
      });
      setSelectedServer(bs._id);
    }).catch((err) => console.error("Admin view: failed to load server", err));
  }, [isAdminView, adminViewServerId]);

  // ✅ Handle message-sent event (sender confirmation)
  useEffect(() => {
    if (messageSent) {
      const msg = messageSent as any;
      const friendId = msg.receiverId._id; // For sent messages, friend is always the receiver

      const uiMessage: UIMessage = {
        id: String(msg._id),
        text: msg.content,
        senderId: msg.senderId._id,
        senderEmail: msg.senderId.email,
        senderDisplayName: msg.senderId.displayName || undefined,
        senderName: msg.senderId.username || msg.senderId.email,
        senderAvatar: msg.senderId.avatar,
        senderDisplayNameFontId: (msg.senderId as any).displayNameFontId ?? undefined,
        senderDisplayNameEffectId: (msg.senderId as any).displayNameEffectId ?? undefined,
        senderDisplayNamePrimaryHex: (msg.senderId as any).displayNamePrimaryHex ?? undefined,
        senderDisplayNameAccentHex: (msg.senderId as any).displayNameAccentHex ?? undefined,
        timestamp: new Date(msg.createdAt),
        isFromCurrentUser: true, // Always true for sent messages
        type: "direct",
        isRead: msg.isRead || false,
        messageType: msg.type || "text",
        ...mapCallFieldsToUiMessage(msg),
        giphyId: msg.giphyId || undefined,
        customStickerUrl: msg.customStickerUrl || undefined,
        serverStickerId:
          msg.serverStickerId != null ? String(msg.serverStickerId) : undefined,
        voiceUrl: msg.voiceUrl ?? undefined,
        voiceDuration: msg.voiceDuration ?? undefined,
        reactions: normalizeReactions(msg.reactions),
        replyTo: msg.replyTo?._id || undefined,
        replyToMessage: mapReplyToMessage(msg.replyTo),
        linkPreviews: Array.isArray(msg.linkPreviews) ? msg.linkPreviews : [],
      };

      //  Replace optimistic message with real message from server
      setConversations((prev) => {
        const newMap = new Map(prev);
        const currentMessages = newMap.get(friendId) || [];

        // Find and replace temporary message
        const existingIndex = currentMessages.findIndex(
          (m) => m.id.startsWith("temp-") && m.text === msg.content,
        );

        if (existingIndex !== -1) {
          const updated = [...currentMessages];
          updated[existingIndex] = uiMessage;
          newMap.set(friendId, updated);
        } else {
          // Fallback: add if not found (shouldn't happen)
          console.warn("⚠️ [SENT] Optimistic message not found, adding anyway");
          const updated = [...currentMessages, uiMessage];
          newMap.set(friendId, updated);
        }

        return newMap;
      });

      bumpDmPeerToTop(friendId, msg.createdAt);
    }
  }, [messageSent, currentUserId, bumpDmPeerToTop]);

  // ✅ Handle new-message event (incoming messages from others)
  useEffect(() => {
    if (!newMessage) return;
    const msg = newMessage.message as any;
    const messageId = msg?._id != null ? String(msg._id) : "";
    if (!messageId) return;
    if (processedIncomingDmIdsRef.current.has(messageId)) return;
    processedIncomingDmIdsRef.current.add(messageId);
    if (processedIncomingDmIdsRef.current.size > 400) {
      processedIncomingDmIdsRef.current = new Set(
        Array.from(processedIncomingDmIdsRef.current).slice(-200),
      );
    }

    const rawSender = msg.senderId;
    const senderIdStr =
      typeof rawSender === "string" ? rawSender : rawSender?._id ?? "";
    if (senderIdStr && senderIdStr === currentUserId) {
      return;
    }
    const friendId =
      typeof rawSender === "string" ? rawSender : rawSender?._id;
    if (!friendId) return;

    const uiMessage: UIMessage = {
        id: String(msg._id),
        text: msg.content,
        senderId: friendId,
        senderEmail: typeof rawSender === "object" ? rawSender.email ?? "" : "",
        senderDisplayName:
          typeof rawSender === "object" ? rawSender.displayName || undefined : undefined,
        senderName:
          typeof rawSender === "object"
            ? rawSender.username || rawSender.email || ""
            : "",
        senderAvatar: typeof rawSender === "object" ? rawSender.avatar : undefined,
        senderDisplayNameFontId:
          typeof rawSender === "object" ? (rawSender as any).displayNameFontId ?? undefined : undefined,
        senderDisplayNameEffectId:
          typeof rawSender === "object" ? (rawSender as any).displayNameEffectId ?? undefined : undefined,
        senderDisplayNamePrimaryHex:
          typeof rawSender === "object" ? (rawSender as any).displayNamePrimaryHex ?? undefined : undefined,
        senderDisplayNameAccentHex:
          typeof rawSender === "object" ? (rawSender as any).displayNameAccentHex ?? undefined : undefined,
        timestamp: new Date(msg.createdAt),
        isFromCurrentUser: false, // Always false for incoming messages
        type: "direct",
        isRead: msg.isRead || false,
        messageType: msg.type || "text",
        ...mapCallFieldsToUiMessage(msg),
        giphyId: msg.giphyId || undefined,
        customStickerUrl: msg.customStickerUrl || undefined,
        serverStickerId:
          msg.serverStickerId != null ? String(msg.serverStickerId) : undefined,
        voiceUrl: msg.voiceUrl ?? undefined,
        voiceDuration: msg.voiceDuration ?? undefined,
        reactions: normalizeReactions(msg.reactions),
        replyTo: msg.replyTo?._id || undefined,
        replyToMessage: mapReplyToMessage(msg.replyTo),
        isDeletedForEveryone: msg.isDeleted === true,
        deletedAt: msg.deletedAt || undefined,
        attachments: Array.isArray(msg.attachments) ? msg.attachments : undefined,
        linkPreviews: Array.isArray(msg.linkPreviews) ? msg.linkPreviews : [],
      };


      // ✅ Check if sender is in friends list
      const isSenderInFriendsList = friendsRef.current.some(
        (f) => String(f._id) === String(friendId),
      );
      if (!isSenderInFriendsList) {
        if (typeof rawSender === "object" && rawSender) {
          upsertFriendToDmList({
            _id: friendId,
            displayName:
              (rawSender as { displayName?: string }).displayName ||
              (rawSender as { username?: string }).username ||
              "",
            username: (rawSender as { username?: string }).username || "",
            avatarUrl:
              (rawSender as { avatar?: string }).avatar ||
              (rawSender as { avatarUrl?: string }).avatarUrl ||
              "",
            email: (rawSender as { email?: string }).email || "",
          });
        } else {
          loadAvailableUsers();
        }
      }
      bumpDmPeerToTop(friendId, msg.createdAt);

      // ✅ Add incoming message to conversations Map
      setConversations((prev) => {
        const newMap = new Map(prev);
        const currentMessages = newMap.get(friendId) || [];

        const isDuplicate = currentMessages.some(
          (m) => String(m.id) === messageId,
        );
        if (!isDuplicate) {
          playMessageNotificationSound();
          const updated = [...currentMessages, uiMessage];
          newMap.set(friendId, updated);
        } else {
          newMap.set(friendId, currentMessages);
        }

        return newMap;
      });

      // Badge unread: đồng bộ qua socket dm-unread-count (không cộng local để tránh lệch / 99+).

      if (
        selectedDmFriendRef.current &&
        friendId === selectedDmFriendRef.current._id
      ) {
        if (shouldAutoScrollRef.current || isChatScrolledNearBottom()) {
          shouldAutoScrollRef.current = true;
          setShowNewMessagesBelow(false);
          scheduleScrollToBottom();
        } else {
          setShowNewMessagesBelow(true);
        }
      }
  }, [
    newMessage,
    currentUserId,
    loadAvailableUsers,
    bumpDmPeerToTop,
    upsertFriendToDmList,
    isChatScrolledNearBottom,
    scheduleScrollToBottom,
  ]);

  // ✅ Handle message-deleted event
  //
  // Distinguish between the two delete modes so the UI matches the spec:
  //  - for-everyone → keep the bubble, mark as "recalled" (italic, grey).
  //  - for-me (or missing type, legacy) → remove the bubble locally.
  useEffect(() => {
    if (!messageDeleted) return;

    const { messageId, deleteType, deletedAt } = messageDeleted;
    // Backend also sends `type: "message_unsent"` for recall; treat as for-everyone if deleteType omitted.
    const asRecalled =
      deleteType === "for-everyone" ||
      (messageDeleted as { type?: string }).type === "message_unsent";
    const mid = messageId != null ? String(messageId) : "";

    setConversations((prev) => {
      const newMap = new Map(prev);
      for (const [friendId, messages] of newMap.entries()) {
        const idx = messages.findIndex((m) => String(m.id) === mid);
        if (idx === -1) continue;

        if (asRecalled) {
          if (messages[idx].isDeletedForEveryone) continue; // idempotent
          const next = messages.slice();
          next[idx] = {
            ...next[idx],
            isDeletedForEveryone: true,
            deletedAt: deletedAt || new Date().toISOString(),
            text: "",
            giphyId: undefined,
            customStickerUrl: undefined,
            voiceUrl: undefined,
            voiceDuration: undefined,
            reactions: [],
          };
          newMap.set(friendId, next);
        } else {
          const next = messages.filter((m) => m.id !== messageId);
          if (next.length !== messages.length) {
            newMap.set(friendId, next);
          }
        }
      }
      return newMap;
    });
  }, [messageDeleted]);

  // Load messages when any text chat channel is selected (includes category "info"; textChannels state excludes info only for sidebar grouping)
  /** Đang chọn kênh thoại trong sidebar (hiển thị UI kênh thoại đầy đủ). */
  const viewingVoiceChannel = selectedChannel
    ? voiceChannels.find((c) => c._id === selectedChannel) ?? null
    : null;
  /** Kênh thoại đang có phiên LiveKit (có thể đang xem kênh chat). */
  const connectedVoiceChannel = joinedVoiceChannelId
    ? voiceChannels.find((c) => c._id === joinedVoiceChannelId) ?? null
    : null;
  const selectedChatTextChannel = selectedChannel
    ? allChannels.find((c) => c._id === selectedChannel && c.type === "text")
    : null;

  const voiceMuteKey =
    selectedServer && joinedVoiceChannelId ? `${selectedServer}:${joinedVoiceChannelId}` : null;

  // Khi đổi kênh thoại, phục hồi mute state theo kênh đó (không ảnh hưởng kênh khác)
  useEffect(() => {
    if (!voiceMuteKey) return;
    const v = voiceMuteByChannel[voiceMuteKey];
    setVoiceMicMuted(Boolean(v?.micMuted));
    setVoiceSoundMuted(Boolean(v?.soundMuted));
  }, [voiceMuteKey, voiceMuteByChannel]);

  useEffect(() => {
    if (!selectedChannel) return;

    selectedChannelRef.current = selectedChannel;

    const prev = prevChannelRef.current;
    if (prev && prev !== selectedChannel) leaveChannel(prev);
    prevChannelRef.current = selectedChannel;
    joinChannel(selectedChannel);

    if (!selectedChatTextChannel) {
      if (lastLoadedMessagesChannelRef.current !== selectedChannel) {
        setMessages([]);
        loadMessagesSeqRef.current += 1;
        lastLoadedMessagesChannelRef.current = null;
      }
      return;
    }

    if (lastLoadedMessagesChannelRef.current === selectedChannel) {
      return;
    }

    lastLoadedMessagesChannelRef.current = selectedChannel;
    setReplyingTo(null);
    prepareScrollToLatest();
    setMessages([]);
    loadMessagesSeqRef.current += 1;
    loadMessages(selectedChannel);
  }, [selectedChannel, selectedChatTextChannel?._id, joinChannel, leaveChannel]);

  useEffect(() => {
    if (!selectedChannel && prevChannelRef.current) {
      leaveChannel(prevChannelRef.current);
      prevChannelRef.current = null;
    }
  }, [selectedChannel, leaveChannel]);

  useEffect(() => {
    if (isChannelSocketConnected && selectedChannel) joinChannel(selectedChannel);
  }, [isChannelSocketConnected, selectedChannel, joinChannel]);

  useEffect(() => {
    setJoinedVoiceChannelId(null);
    setVoiceChannelCallToken(null);
    setVoiceChannelCallServerUrl("");
    setVoiceChannelCallError(null);
  }, [selectedServer]);

  // Voice channel: auto-join LiveKit room when user is in a voice channel (no separate call button)
  useEffect(() => {
    if (!connectedVoiceChannel || !selectedServer || !token || !currentUserProfile) {
      setVoiceChannelCallToken(null);
      setVoiceChannelCallServerUrl("");
      setVoiceChannelCallError(null);
      return;
    }
    const roomName = `voice-${selectedServer}-${connectedVoiceChannel._id}`;
    const participantName =
      currentUserProfile.displayName || currentUserProfile.username || "Người dùng";

    let cancelled = false;
    setVoiceChannelCallError(null);
    getLiveKitToken(roomName, participantName, token)
      .then(({ token: livekitToken, url }) => {
        if (!cancelled) {
          setVoiceChannelCallToken(livekitToken);
          setVoiceChannelCallServerUrl(url);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setVoiceChannelCallToken(null);
          setVoiceChannelCallServerUrl("");
          setVoiceChannelCallError(
            err instanceof Error ? err.message : "Không thể kết nối kênh thoại",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [connectedVoiceChannel?._id, selectedServer, token, currentUserProfile?.username]);

  // Auto scroll to latest message - optimized to prevent jitter (server channels)
  useEffect(() => {
    if (!selectedChannel || selectedDirectMessageFriend) return;
    if (shouldAutoScrollRef.current && messages.length > 0) {
      scheduleScrollToBottom();
      setShowNewMessagesBelow(false);
    }
  }, [
    messages,
    selectedChannel,
    selectedDirectMessageFriend,
    scheduleScrollToBottom,
  ]);

  // Auto scroll for DM when opening a thread or when user is already at bottom
  useEffect(() => {
    if (!selectedDirectMessageFriend) return;
    const currentMessages = conversations.get(selectedDirectMessageFriend._id);
    if (!currentMessages?.length) return;
    if (
      !pendingConversationScrollRef.current &&
      !shouldAutoScrollRef.current
    ) {
      return;
    }
    scrollChatToBottom();
    requestAnimationFrame(() => {
      scrollChatToBottom();
      requestAnimationFrame(() => {
        scrollChatToBottom();
        if (pendingConversationScrollRef.current) {
          pendingConversationScrollRef.current = false;
        }
        setShowNewMessagesBelow(false);
      });
    });
  }, [
    conversations,
    selectedDirectMessageFriend,
    scrollChatToBottom,
  ]);


  const loadServers = async () => {
    try {
      setLoading(true);
      const serversList = await serversApi.getMyServers();
      // Organize channels by type for each server
      const serversWithChannels: BackendServer[] = await Promise.all(
        serversList.map(async (server) => {
          const channels = server.channels as serversApi.Channel[];
          const infoChannels = channels.filter(
            (c) => c.type === "text" && c.category === "info" && !c.categoryId,
          );
          const textChannels = channels.filter((c) => c.type === "text" && c.category !== "info");
          const voiceChannels = channels.filter((c) => c.type === "voice");
          return {
            ...server,
            infoChannels,
            textChannels,
            voiceChannels,
          };
        }),
      );

      setServers(serversWithChannels);
      // Don't auto-select server on load - let user choose
      setSelectedServer(null);
      setSelectedChannel(null);
      setError(null);
    } catch (err) {
      setError("Không tải được danh sách máy chủ");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadFriends = async () => {
    try {
      const friendsList = await serversApi.getMyFollowers();
      setFriends(friendsList);
    } catch (err) {
      console.error("Failed to load friends", err);
      // Set empty array if friends API is not available
      setFriends([]);
    }
  };

  const loadChannels = async (
    serverId: string,
    opts?: { keepSelectedChannel?: boolean; preferredChannelId?: string },
  ) => {
    const seq = ++loadChannelsSeqRef.current;
    try {
      let channels: serversApi.Channel[];
      let cats: serversApi.ServerCategory[];
      if (isAdminView && serverId === adminViewServerId) {
        const adminToken = localStorage.getItem("accessToken") || localStorage.getItem("token") || "";
        const view = await serversApi.adminGetServerView(serverId, adminToken);
        channels = view.channels || [];
        cats = view.categories || [];
      } else {
        [channels, cats] = await Promise.all([
          serversApi.getChannels(serverId),
          serversApi.getCategories(serverId).catch(() => [] as serversApi.ServerCategory[]),
        ]);
      }
      const sorted = (channels || []).sort(
        (a: serversApi.Channel, b: serversApi.Channel) => (a.position ?? 0) - (b.position ?? 0),
      );
      if (loadChannelsSeqRef.current !== seq) return;
      setAllChannels(sorted);
      const info = sorted.filter(
        (c: serversApi.Channel) => c.type === "text" && c.category === "info" && !c.categoryId,
      );
      const text = sorted.filter((c: serversApi.Channel) => c.type === "text" && c.category !== "info");
      const voice = sorted.filter((c: serversApi.Channel) => c.type === "voice");
      setInfoChannels(info);
      setTextChannels(text);
      setVoiceChannels(voice);
      setServerCategories(cats);
      if (opts?.preferredChannelId) {
        const preferred = sorted.find((c) => c._id === opts.preferredChannelId);
        if (preferred) {
          setSelectedChannel(preferred._id);
          return;
        }
      }
      if (opts?.keepSelectedChannel && selectedChannelRef.current) {
        const stillExists = sorted.some((c) => c._id === selectedChannelRef.current);
        if (stillExists) return;
      }
      if (text.length > 0) {
        setSelectedChannel(text[0]._id);
      } else if (info.length > 0) {
        setSelectedChannel(info[0]._id);
      } else {
        setSelectedChannel(null);
      }
    } catch (err) {
      console.error("Failed to load channels", err);
      setError("Không tải được danh sách kênh");
    }
  };

  const loadMessages = async (channelId: string) => {
    const seq = loadMessagesSeqRef.current;
    try {
      let pack;
      if (isAdminView && selectedServer && selectedServer === adminViewServerId) {
        const adminToken = localStorage.getItem("accessToken") || localStorage.getItem("token") || "";
        pack = await serversApi.adminGetChannelMessages(selectedServer, channelId, adminToken, 50, 0);
      } else {
        pack = await serversApi.getMessages(channelId, 50, 0);
      }
      // Nếu trong lúc chờ user đã chuyển kênh/server, bỏ qua kết quả cũ.
      if (loadMessagesSeqRef.current !== seq) return;
      if (selectedChannelRef.current !== channelId) return;

      if (!pack.chatViewBlocked) {
        serversApi.markChannelAsRead(channelId).catch(() => {});
      }

      const backendMessages = pack.messages;
      const nickByUserId = new Map<string, string>();
      const srv = selectedServer ? servers.find((s) => s._id === selectedServer) : null;
      (srv?.members || []).forEach((m: any) => {
        const n = typeof m?.nickname === "string" ? m.nickname.trim() : "";
        if (n) nickByUserId.set(String(m.userId), n);
      });
      const uiMessages: UIMessage[] = backendMessages.map((msg: serversApi.Message) => ({
        id: msg._id,
        text: msg.content,
        senderId:
          typeof msg.senderId === "string" ? msg.senderId : msg.senderId._id,
        senderEmail: typeof msg.senderId === "string" ? "" : (msg.senderId as any).email ?? "",
        senderName:
          typeof msg.senderId === "string"
            ? ""
            : (msg.senderId as any).username || (msg.senderId as any).email || "",
        senderDisplayName:
          typeof msg.senderId === "string"
            ? undefined
            : nickByUserId.get(String((msg.senderId as any)._id)) || (msg.senderId as any).displayName || undefined,
        senderDisplayNameFontId:
          typeof msg.senderId === "string"
            ? undefined
            : (msg.senderId as any).displayNameFontId ?? undefined,
        senderDisplayNameEffectId:
          typeof msg.senderId === "string"
            ? undefined
            : (msg.senderId as any).displayNameEffectId ?? undefined,
        senderDisplayNamePrimaryHex:
          typeof msg.senderId === "string"
            ? undefined
            : (msg.senderId as any).displayNamePrimaryHex ?? undefined,
        senderDisplayNameAccentHex:
          typeof msg.senderId === "string"
            ? undefined
            : (msg.senderId as any).displayNameAccentHex ?? undefined,
        serverNickname:
          typeof msg.senderId === "string"
            ? undefined
            : nickByUserId.get(String((msg.senderId as any)._id)) || undefined,
        senderAvatar:
          typeof msg.senderId === "string"
            ? undefined
            : (msg.senderId as any).avatarUrl || (msg.senderId as any).avatar,
        timestamp: new Date(msg.createdAt),
        isFromCurrentUser:
          (typeof msg.senderId === "string"
            ? msg.senderId
            : (msg.senderId as any)._id) === currentUserId,
        type: "server",
        messageType: (msg as any).messageType || "text",
        giphyId: (msg as any).giphyId || undefined,
        customStickerUrl: (msg as any).customStickerUrl || undefined,
        serverStickerId:
          (msg as any).serverStickerId != null
            ? String((msg as any).serverStickerId)
            : undefined,
        voiceUrl: (msg as any).voiceUrl ?? undefined,
        voiceDuration: (msg as any).voiceDuration ?? undefined,
        stickerReplyWelcomeEnabled: (msg as any).stickerReplyWelcomeEnabled,
        welcomeWaveDismissedByMe: (msg as any).welcomeWaveDismissedByMe === true,
        contentModerationResult: (msg as any).contentModerationResult ?? "none",
        reactions: normalizeReactions(msg.reactions),
        replyTo:
          msg.replyTo && typeof msg.replyTo === "object"
            ? msg.replyTo._id
            : typeof msg.replyTo === "string"
              ? msg.replyTo
              : undefined,
        replyToMessage: mapReplyToMessage(
          msg.replyTo && typeof msg.replyTo === "object" ? msg.replyTo : null,
        ),
        isDeletedForEveryone: (msg as serversApi.Message).isDeleted === true,
        deletedAt: (msg as serversApi.Message).deletedAt || undefined,
        attachments: Array.isArray((msg as any).attachments) ? (msg as any).attachments : undefined,
        linkPreviews: Array.isArray((msg as any).linkPreviews) ? (msg as any).linkPreviews : [],
      }));

      setMessages(sortServerMessagesAscending(uiMessages));
      prepareScrollToLatest();
      setError(null);
    } catch (err) {
      if (loadMessagesSeqRef.current !== seq) return;
      if (selectedChannelRef.current !== channelId) return;
      console.error("Failed to load messages", err);
      setError("Không tải được tin nhắn");
    }
  };

  // Track which conversations are being loaded to prevent race conditions
  const loadingConversationsRef = useRef<Set<string>>(new Set());
  // Track which conversations have been fully loaded from API
  const fullyLoadedConversationsRef = useRef<Set<string>>(new Set());

  const loadDirectMessages = async (
    friendId: string,
    forceReload: boolean = false,
  ) => {

    // Check if we already have FULLY loaded messages for this conversation
    if (fullyLoadedConversationsRef.current.has(friendId) && !forceReload) {
      if (
        selectedDmFriendRef.current &&
        String(selectedDmFriendRef.current._id) === String(friendId)
      ) {
        prepareScrollToLatest();
        scheduleScrollToBottom();
      }
      return;
    }

    // If conversation exists but wasn't fully loaded (e.g., from WebSocket only)
    if (
      conversations.has(friendId) &&
      !fullyLoadedConversationsRef.current.has(friendId)
    ) {
      const existingMessages = conversations.get(friendId) || [];
    }

    // Check if already loading this conversation
    if (loadingConversationsRef.current.has(friendId)) {
      return;
    }

    try {
      loadingConversationsRef.current.add(friendId);
      setLoadingDirectMessages(true);
      const backendMessages = await getDirectMessages(friendId, {
        token,
        limit: 50,
      });

      const uiMessages: UIMessage[] = backendMessages.map((msg: any) => ({
        id: String(msg._id),
        text: msg.content,
        senderId: msg.senderId._id,
        senderEmail: msg.senderId.email,
        senderDisplayName: msg.senderId.displayName || undefined,
        senderName: msg.senderId.username || msg.senderId.email,
        senderAvatar: msg.senderId.avatar,
        senderDisplayNameFontId: msg.senderId.displayNameFontId ?? undefined,
        senderDisplayNameEffectId: msg.senderId.displayNameEffectId ?? undefined,
        senderDisplayNamePrimaryHex: msg.senderId.displayNamePrimaryHex ?? undefined,
        senderDisplayNameAccentHex: msg.senderId.displayNameAccentHex ?? undefined,
        timestamp: new Date(msg.createdAt),
        isFromCurrentUser: msg.senderId._id === currentUserId,
        type: "direct",
        isRead: msg.isRead || false,
        messageType: msg.type || "text",
        ...mapCallFieldsToUiMessage(msg),
        giphyId: msg.giphyId || undefined,
        customStickerUrl: msg.customStickerUrl || undefined,
        serverStickerId:
          msg.serverStickerId != null ? String(msg.serverStickerId) : undefined,
        voiceUrl: msg.voiceUrl ?? undefined,
        voiceDuration: msg.voiceDuration ?? undefined,
        reactions: normalizeReactions(msg.reactions),
        replyTo: msg.replyTo?._id || undefined,
        replyToMessage: mapReplyToMessage(msg.replyTo),
        isDeletedForEveryone: msg.isDeleted === true,
        deletedAt: msg.deletedAt || undefined,
        attachments: Array.isArray(msg.attachments) ? msg.attachments : undefined,
        linkPreviews: Array.isArray(msg.linkPreviews) ? msg.linkPreviews : [],
      }));

      setConversations((prev) => {
        const newMap = new Map(prev);
        const existingMessages = newMap.get(friendId) || [];

        // ✅ CRITICAL FIX: Always replace with API data (full history)
        // But merge any very recent messages that might have arrived via WebSocket

        // Create a map of API messages by ID for quick lookup
        const apiMessageIds = new Set(uiMessages.map((m) => m.id));

        // Find WebSocket messages that aren't in API response (very recent)
        const recentWebSocketMessages = existingMessages.filter(
          (m) => !apiMessageIds.has(m.id),
        );

        const mergedMessages = [...uiMessages, ...recentWebSocketMessages].sort(
          (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
        );

        newMap.set(friendId, mergedMessages);
        return newMap;
      });

      // Mark as fully loaded
      fullyLoadedConversationsRef.current.add(friendId);

      if (
        selectedDmFriendRef.current &&
        String(selectedDmFriendRef.current._id) === String(friendId)
      ) {
        prepareScrollToLatest();
      }

      setError(null);
    } catch (err) {
      console.error("❌ [LOAD] Failed to load direct messages:", err);
      setError("Không tải được tin nhắn trực tiếp");
      setConversations((prev) => {
        const newMap = new Map(prev);
        if (!newMap.has(friendId)) {
          newMap.set(friendId, []);
        }
        return newMap;
      });
    } finally {
      loadingConversationsRef.current.delete(friendId);
      setLoadingDirectMessages(false);
    }
  };

  const handleSelectDirectMessageFriend = async (friend: serversApi.Friend) => {
    const peerId = String(friend._id);
    setJoinedVoiceChannelId(null);
    setVoiceChannelCallToken(null);
    setVoiceChannelCallServerUrl("");
    setShowExploreView(false);
    setSelectedDirectMessageFriend(friend);
    setMessageText("");
    setSelectedServer(null);
    setSelectedChannel(null);
    dmReadPeersRef.current.add(peerId);
    setDmUnreadCounts((prev) => ({ ...prev, [peerId]: 0 }));
    // Ensure backend read-state is updated immediately when opening the conversation
    try {
      // Fire socket for realtime (fast)
      markAllAsRead?.(peerId);
      // Also call REST to avoid race with getConversationList refresh
      if (token) await markDmConversationRead({ token, userId: peerId });
    } catch (_err) {}
    prepareScrollToLatest();
    await refreshDmBlockState();
    const peerBlocked =
      dmBlockedByPeerRef.current.has(peerId) ||
      dmBlockedByMeRef.current.has(peerId);
    if (!peerBlocked) {
      await loadDirectMessages(friend._id);
    }
    scheduleScrollToBottom();
  };

  useEffect(() => {
    return () => {
      if (jumpHighlightTimerRef.current) clearTimeout(jumpHighlightTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!pendingMessageJump) return;

    if (pendingMessageJump.mode === "server") {
      if (!pendingMessageJump.channelId) return;
      if (selectedChannel !== pendingMessageJump.channelId) return;
      let cancelled = false;
      let attempts = 0;
      const maxAttempts = 8;

      const attempt = () => {
        if (cancelled) return;
        if (scrollToMessageBubble(pendingMessageJump.messageId)) {
          setPendingMessageJump(null);
          return;
        }
        attempts += 1;
        if (attempts < maxAttempts) {
          window.setTimeout(attempt, 140);
        }
      };

      requestAnimationFrame(() => requestAnimationFrame(attempt));
      return () => {
        cancelled = true;
      };
    }

    if (pendingMessageJump.mode === "dm") {
      const activeDmId = selectedDirectMessageFriend?._id;
      if (!activeDmId || (pendingMessageJump.dmUserId && activeDmId !== pendingMessageJump.dmUserId)) {
        return;
      }

      let cancelled = false;
      let attempts = 0;
      const maxAttempts = 8;

      const attempt = () => {
        if (cancelled) return;
        if (scrollToMessageBubble(pendingMessageJump.messageId)) {
          setPendingMessageJump(null);
          return;
        }
        attempts += 1;
        if (attempts < maxAttempts) {
          window.setTimeout(attempt, 140);
        }
      };

      requestAnimationFrame(() => requestAnimationFrame(attempt));
      return () => {
        cancelled = true;
      };
    }
  }, [
    pendingMessageJump,
    selectedChannel,
    selectedDirectMessageFriend?._id,
    messages,
    conversations,
    scrollToMessageBubble,
  ]);

  const handleOpenChannelUserProfile = useCallback(
    (message: UIMessage, anchorRect: DOMRect) => {
      if (!selectedServer) return;
      const srv = servers.find((s) => s._id === selectedServer);
      if (!srv) return;
      setChannelProfileContext({
        anchorRect,
        serverId: selectedServer,
        serverName: srv.name || "Máy chủ",
        serverAvatarUrl: srv.avatarUrl ?? null,
        targetUserId: message.senderId,
        nicknameInChannel: message.serverNickname ?? null,
        fallbackDisplayName:
          message.senderDisplayName ||
          message.senderName ||
          message.senderEmail ||
          "Người dùng",
        fallbackUsername: message.senderName || message.senderEmail || "",
        fallbackAvatarUrl: message.senderAvatar,
      });
    },
    [selectedServer, servers],
  );

  const handleOpenDmFromChannelProfile = useCallback(
    (friend: serversApi.Friend, opts?: { openGifPicker?: boolean }) => {
      setChannelProfileContext(null);
      setSelectedServer(null);
      setSelectedChannel(null);
      prepareScrollToLatest();
      setSelectedDirectMessageFriend(friend);
      void loadDirectMessages(friend._id);
      scheduleScrollToBottom();
      if (opts?.openGifPicker) {
        setMediaPickerTab("gif");
        setShowGiphyPicker(true);
      }
    },
    [loadDirectMessages, prepareScrollToLatest, scheduleScrollToBottom],
  );

  const channelProfileInviteServers = useMemo(() => {
    const sid = channelProfileContext?.serverId;
    return servers
      .filter((s) => (sid ? s._id !== sid : true))
      .map((s) => ({
        _id: s._id,
        name: s.name || "Máy chủ",
        avatarUrl: s.avatarUrl ?? null,
      }));
  }, [servers, channelProfileContext?.serverId]);

  // Handler for adding/removing reactions (DM and channel)
  const applyReactionUpdate = (
    msg: UIMessage,
    messageId: string,
    emoji: string,
  ): UIMessage => {
    if (msg.id !== messageId) return msg;
    const reactions = msg.reactions || [];
    const existingReaction = reactions.find(
      (r) => r.userIds.includes(currentUserId) && r.emoji === emoji,
    );
    if (existingReaction) {
      return {
        ...msg,
        reactions: reactions
          .map((r) => ({
            ...r,
            userIds: r.userIds.filter((id) => id !== currentUserId),
            count: r.count - 1,
          }))
          .filter((r) => r.count > 0),
      };
    }
    const emojiReaction = reactions.find((r) => r.emoji === emoji);
    if (emojiReaction) {
      return {
        ...msg,
        reactions: reactions.map((r) =>
          r.emoji === emoji
            ? {
                ...r,
                userIds: [...r.userIds, currentUserId],
                count: r.count + 1,
              }
            : r,
        ),
      };
    }
    return {
      ...msg,
      reactions: [...reactions, { emoji, userIds: [currentUserId], count: 1 }],
    };
  };

  const handleReaction = async (messageId: string, emoji: string) => {
    try {
      if (selectedDirectMessageFriend) {
        const friendId = selectedDirectMessageFriend._id;
        setConversations((prev) => {
          const newMap = new Map(prev);
          const currentMessages = newMap.get(friendId) || [];
          const updatedMessages = currentMessages.map((msg) =>
            applyReactionUpdate(msg, messageId, emoji),
          );
          newMap.set(friendId, updatedMessages);
          return newMap;
        });
        const updatedFromServer = await addMessageReaction(messageId, emoji, { token });
        if (updatedFromServer?.reactions) {
          setConversations((prev) => {
            const newMap = new Map(prev);
            const list = newMap.get(friendId) || [];
            const idx = list.findIndex((m) => m.id === messageId);
            if (idx === -1) return newMap;
            const next = [...list];
            next[idx] = {
              ...next[idx],
              reactions: normalizeReactions(updatedFromServer.reactions),
            };
            newMap.set(friendId, next);
            return newMap;
          });
        }
        return;
      }

      if (selectedChannel) {
        setMessages((prev) =>
          prev.map((msg) => applyReactionUpdate(msg, messageId, emoji)),
        );
        const updatedFromServer = await serversApi.addMessageReaction(
          selectedChannel,
          messageId,
          emoji,
        );
        if (updatedFromServer?.reactions) {
          setMessages((prev) => {
            const idx = prev.findIndex((m) => m.id === messageId);
            if (idx === -1) return prev;
            const next = [...prev];
            next[idx] = {
              ...next[idx],
              reactions: normalizeReactions(updatedFromServer.reactions),
            };
            return next;
          });
        }
      }
    } catch (error) {
      console.error("Failed to add reaction:", error);
    }
  };

  const openPinnedMessagesModal = async () => {
    try {
      setPinnedModalLoading(true);
      if (selectedDirectMessageFriend) {
        const friendId = selectedDirectMessageFriend._id;
        const raw = await getPinnedMessages(friendId, { token });
        const mapped: UIMessage[] = (Array.isArray(raw) ? raw : []).map((msg: any) => ({
          id: String(msg._id),
          text: msg.content ?? "",
          senderId: msg.senderId?._id ?? "",
          senderEmail: msg.senderId?.email ?? "",
          senderDisplayName: msg.senderId?.displayName || undefined,
          senderName: msg.senderId?.username || msg.senderId?.email || "",
          senderAvatar: msg.senderId?.avatarUrl || msg.senderId?.avatar,
          timestamp: new Date(msg.createdAt),
          isFromCurrentUser: (msg.senderId?._id ?? "") === currentUserId,
          type: "direct",
          isRead: msg.isRead || false,
          messageType: msg.type || "text",
          giphyId: msg.giphyId || undefined,
          customStickerUrl: msg.customStickerUrl || undefined,
          voiceUrl: msg.voiceUrl ?? undefined,
          voiceDuration: msg.voiceDuration ?? undefined,
          reactions: normalizeReactions(msg.reactions),
          isPinned: true,
        }));
        setPinnedModalTitle("Tin nhắn đã ghim");
        setPinnedModalItems(mapped);
      } else if (selectedChannel) {
        const raw = await serversApi.getPinnedChannelMessages(selectedChannel);
        const mapped: UIMessage[] = raw.map((msg: serversApi.Message) => ({
          id: msg._id,
          text: msg.content,
          senderId:
            typeof msg.senderId === "string" ? msg.senderId : msg.senderId._id,
          senderEmail:
            typeof msg.senderId === "string" ? "" : (msg.senderId as any).email ?? "",
          senderDisplayName:
            typeof msg.senderId === "string"
              ? undefined
              : (msg.senderId as any).displayName || undefined,
          senderName:
            typeof msg.senderId === "string"
              ? ""
              : (msg.senderId as any).username || (msg.senderId as any).email || "",
          senderAvatar:
            typeof msg.senderId === "string"
              ? undefined
              : (msg.senderId as any).avatarUrl || (msg.senderId as any).avatar,
          timestamp: new Date(msg.createdAt),
          isFromCurrentUser:
            (typeof msg.senderId === "string"
              ? msg.senderId
              : (msg.senderId as any)._id) === currentUserId,
          type: "server",
          messageType: ((msg.messageType || "text") as UIMessage["messageType"]),
          giphyId: (msg as any).giphyId || undefined,
          customStickerUrl: (msg as any).customStickerUrl || undefined,
          voiceUrl: (msg as any).voiceUrl ?? undefined,
          voiceDuration: (msg as any).voiceDuration ?? undefined,
          reactions: normalizeReactions(msg.reactions),
          isPinned: true,
        }));
        setPinnedModalTitle("Tin nhắn đã ghim");
        setPinnedModalItems(mapped);
      } else {
        setPinnedModalItems([]);
      }
      setPinnedModalOpen(true);
    } catch (error) {
      console.error("Failed to fetch pinned messages:", error);
      showNoticePopup("Không tải được tin nhắn đã ghim");
    } finally {
      setPinnedModalLoading(false);
    }
  };

  const handlePinnedItemJump = (messageId: string) => {
    const jumped = scrollToMessageBubble(messageId);
    if (jumped) {
      setPinnedModalOpen(false);
    }
  };

  /** Loader for ConversationDetailsPanel pinned messages section */
  const loadPinnedMessagesForPanel = useCallback(async (): Promise<DetailsPanelPinnedItem[]> => {
    try {
      if (selectedDirectMessageFriend) {
        const raw = await getPinnedMessages(selectedDirectMessageFriend._id, { token });
        return (Array.isArray(raw) ? raw : []).map((msg: any) => ({
          id: String(msg._id),
          text: msg.content ?? "",
          senderDisplayName: msg.senderId?.displayName || undefined,
          senderName: msg.senderId?.username || msg.senderId?.email || "",
          timestamp: new Date(msg.createdAt),
        }));
      } else if (selectedChannel) {
        const raw = await serversApi.getPinnedChannelMessages(selectedChannel);
        return raw.map((msg: serversApi.Message) => ({
          id: msg._id,
          text: msg.content,
          senderDisplayName: typeof msg.senderId === "string" ? undefined : (msg.senderId as any).displayName || undefined,
          senderName: typeof msg.senderId === "string" ? "" : (msg.senderId as any).username || (msg.senderId as any).email || "",
          timestamp: new Date(msg.createdAt),
        }));
      }
      return [];
    } catch {
      return [];
    }
  }, [selectedDirectMessageFriend, selectedChannel, token]);

  // Handler for pinning messages
  const handlePinMessage = async (messageId: string) => {
    try {
      let isPinnedNext: boolean | null = null;
      if (selectedDirectMessageFriend) {
        const updatedFromServer = await pinDirectMessage(messageId, { token });
        const serverPinned =
          typeof updatedFromServer?.isPinned === "boolean"
            ? Boolean(updatedFromServer.isPinned)
            : null;
        const friendId = selectedDirectMessageFriend._id;
        const currentMessages = conversations.get(friendId) || [];
        const updatedMessages = currentMessages.map((msg) =>
          msg.id === messageId
            ? {
                ...msg,
                isPinned: serverPinned ?? !Boolean(msg.isPinned),
              }
            : msg,
        );
        setConversations(new Map(conversations.set(friendId, updatedMessages)));
        isPinnedNext =
          serverPinned ??
          updatedMessages.find((msg) => msg.id === messageId)?.isPinned ??
          null;
      } else if (selectedChannel) {
        const updatedFromServer = await serversApi.pinChannelMessage(
          selectedChannel,
          messageId,
        );
        const serverPinned =
          typeof (updatedFromServer as any)?.isPinned === "boolean"
            ? Boolean((updatedFromServer as any).isPinned)
            : null;
        let nextPinnedLocal: boolean | null = null;
        setMessages((prev) => {
          const next = prev.map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  isPinned: serverPinned ?? !Boolean(m.isPinned),
                }
              : m,
          );
          nextPinnedLocal =
            next.find((m) => m.id === messageId)?.isPinned ?? null;
          return next;
        });
        isPinnedNext = serverPinned ?? nextPinnedLocal;
      }
      if (pinInlineNoticeTimerRef.current) {
        window.clearTimeout(pinInlineNoticeTimerRef.current);
      }
      setPinInlineNoticeMessage(
        isPinnedNext === false
          ? "Bạn đã bỏ ghim một tin nhắn."
          : "Bạn đã ghim một tin nhắn.",
      );
      setPinInlineNoticeOpen(true);
      pinInlineNoticeTimerRef.current = window.setTimeout(() => {
        setPinInlineNoticeOpen(false);
      }, 5000);
    } catch (error) {
      console.error("Failed to pin message:", error);
      showNoticePopup("Không thể ghim tin nhắn");
    }
  };

  useEffect(() => {
    return () => {
      if (pinInlineNoticeTimerRef.current) {
        window.clearTimeout(pinInlineNoticeTimerRef.current);
      }
    };
  }, []);

  // Handler for reporting messages
  const handleReportMessage = async (
    messageId: string,
    reason: string,
    description?: string
  ) => {
    try {
      await reportDirectMessage(messageId, reason, description, { token });
      showNoticePopup(t("chat.messagesPage.reportDone"));
      setShowReportDialog(null);

      // Socket will be notified via backend gateway
    } catch (error: any) {
      console.error("Failed to report message:", error);
      showNoticePopup(error?.message || "Không thể báo cáo tin nhắn");
    }
  };

  // Handler for deleting messages
  //
  // Two distinct behaviours per spec:
  //  - "for-me":       removes the bubble locally (and only locally). The
  //                    backend adds the current user to `deletedFor[]` so
  //                    when we reload the history this user still can't
  //                    see it.
  //  - "for-everyone": keeps the bubble in place on every client but
  //                    replaces its content with a greyed italic placeholder.
  //                    Backend sets `isDeleted=true` + `deletedAt` and emits
  //                    a socket `message-deleted` event so the receiver's
  //                    UI updates instantly without reloading.
  const handleDeleteMessage = async (
    messageId: string,
    deleteType: "for-everyone" | "for-me",
  ) => {
    const midLocal = String(messageId);
    const applyChannelLocal = () => {
      setMessages((prev) => {
        const idx = prev.findIndex((m) => String(m.id) === midLocal);
        if (idx === -1) return prev;
        if (deleteType === "for-me") {
          return prev.filter((m) => String(m.id) !== midLocal);
        }
        if (prev[idx].isDeletedForEveryone) return prev;
        const next = prev.slice();
        next[idx] = {
          ...next[idx],
          isDeletedForEveryone: true,
          deletedAt: new Date().toISOString(),
          text: "",
          giphyId: undefined,
          customStickerUrl: undefined,
          voiceUrl: undefined,
          voiceDuration: undefined,
          reactions: [],
        };
        return next;
      });
    };

    try {
      if (selectedDirectMessageFriend) {
        await deleteDirectMessage(messageId, deleteType, { token });

        if (deleteType === "for-everyone" && emitDeleteMessage) {
          const friendId = selectedDirectMessageFriend._id;
          emitDeleteMessage(messageId, deleteType, friendId);
        }

        setConversations((prev) => {
          const newMap = new Map(prev);
          for (const [friendId, messages] of newMap.entries()) {
            const idx = messages.findIndex((m) => String(m.id) === midLocal);
            if (idx === -1) continue;

            if (deleteType === "for-me") {
              const next = messages.filter((m) => String(m.id) !== midLocal);
              newMap.set(friendId, next);
            } else {
              const next = messages.slice();
              next[idx] = {
                ...next[idx],
                isDeletedForEveryone: true,
                deletedAt: new Date().toISOString(),
                text: "",
                giphyId: undefined,
                customStickerUrl: undefined,
                voiceUrl: undefined,
                voiceDuration: undefined,
                reactions: [],
              };
              newMap.set(friendId, next);
            }
          }
          return newMap;
        });
      } else {
        const chId = selectedChannelRef.current;
        if (!chId) {
          showNoticePopup(
            t("chat.toast.deleteFailed") || "Không thể xóa tin nhắn",
          );
          return;
        }
        await serversApi.deleteChannelMessage(chId, messageId, deleteType);
        applyChannelLocal();
      }

      setToastMessage(
        deleteType === "for-everyone"
          ? t("chat.toast.recalled") || "Đã xóa tin nhắn với mọi người"
          : t("chat.toast.deletedForMe") || "Bạn đã xóa một tin nhắn",
      );
      setTimeout(() => setToastMessage(null), 3000);
    } catch (error) {
      console.error("Failed to delete message:", error);
      showNoticePopup(t("chat.toast.deleteFailed") || "Không thể xóa tin nhắn");
    }
  };

  // Handler for replying to a message
  const handleReplyToMessage = (message: UIMessage) => {
    setReplyingTo(message);
  };

  const mustCompleteServerVerification =
    Boolean(
      selectedServer &&
        !selectedDirectMessageFriend &&
        myServerAccessStatus &&
        !isServerAccessVerificationSatisfied(myServerAccessStatus),
    );

  /** Không dựa vào `chatViewBlocked` một mình: với đơn apply đã duyệt backend có thể trả false dù chưa xong xác minh. */
  const shouldBlockServerChatInput = Boolean(
    selectedServer &&
      !selectedDirectMessageFriend &&
      (myServerAccessStatus?.chatViewBlocked === true ||
        (myServerAccessStatus?.hasRules === true &&
          !myServerAccessStatus?.acceptedRules) ||
        mustCompleteServerVerification),
  );

  useEffect(() => {
    if (!shouldBlockServerChatInput) return;
    setMentionOpen(false);
    setShowPlusMenu(false);
    setShowGiphyPicker(false);
  }, [shouldBlockServerChatInput]);

  // Đóng modal xác minh / quy định khi đã đủ điều kiện (ví dụ xong OTP hoặc hết thời gian chờ).
  useEffect(() => {
    if (!verificationRulesOpen || !selectedServer || selectedDirectMessageFriend) return;
    if (shouldBlockServerChatInput) return;
    setVerificationRulesOpen(false);
    setVerificationAccessSettings(null);
  }, [
    verificationRulesOpen,
    shouldBlockServerChatInput,
    selectedServer,
    selectedDirectMessageFriend,
  ]);

  const handleSendMessage = async () => {
    if (shouldBlockDmChatInput) return;
    if (shouldBlockServerChatInput) {
      void openVerificationRulesModal();
      return;
    }
    if (!messageText.trim() || !selectedChannel) return;

    const content = messageText.trim();
    const tempId = `temp-send-${Date.now()}`;
    const pendingJoinNick =
      typeof window !== "undefined" && selectedServer
        ? sessionStorage.getItem(`cordigram:joinNick:${selectedServer}`)?.trim() ?? ""
        : "";
    const myServerNickname =
      servers
        .find((s) => s._id === selectedServer)
        ?.members?.find((m) => String(m.userId) === String(currentUserId))
        ?.nickname?.trim() ?? pendingJoinNick;
    const optimisticMessage: UIMessage = {
      id: tempId,
      text: content,
      senderId: currentUserId,
      senderEmail: "",
      senderName: selfMessagingIdentity.chatUsername || "",
      senderDisplayName: myServerNickname || selfMessagingIdentity.displayName || undefined,
      senderAvatar: selfMessagingIdentity.avatar,
      timestamp: new Date(),
      isFromCurrentUser: true,
      type: "server",
      messageType: "text",
      replyTo: replyingTo?.id,
      replyToMessage: replyingTo
        ? {
            id: replyingTo.id,
            senderId: replyingTo.senderId,
            senderDisplayName: replyingTo.senderDisplayName,
            senderName: replyingTo.senderName,
            messageType: replyingTo.messageType ?? "text",
            text: replyingTo.text,
          }
        : null,
      reactions: [],
      linkPreviews: [],
    };

    try {
      setMessageText("");
      setMentionOpen(false);
      setMentionKeyword("");
      setMentionStartPos(-1);
      setMessages((prev) => appendServerMessage(prev, optimisticMessage));
      prepareScrollToLatest();

      const newMessage = await serversApi.createMessage(
        selectedChannel,
        content,
        undefined,
        replyingTo?.id,
      );

      const senderDisplayNameResolved =
        myServerNickname ||
        (typeof newMessage.senderId === "string"
          ? selfMessagingIdentity.displayName
          : ((newMessage.senderId as any)?.displayName ?? selfMessagingIdentity.displayName)) ||
        undefined;

      const uiMessage: UIMessage = {
        id: newMessage._id,
        text: newMessage.content,
        senderId:
          typeof newMessage.senderId === "string"
            ? newMessage.senderId
            : (newMessage.senderId as any)?._id,
        senderEmail:
          typeof newMessage.senderId === "string"
            ? ""
            : (newMessage.senderId as any)?.email ?? "",
        senderName:
          typeof newMessage.senderId === "string"
            ? selfMessagingIdentity.chatUsername || ""
            : (newMessage.senderId as any)?.username || (newMessage.senderId as any)?.email || selfMessagingIdentity.chatUsername || "",
        senderDisplayName: senderDisplayNameResolved,
        senderAvatar:
          typeof newMessage.senderId === "string"
            ? selfMessagingIdentity.avatar
            : (newMessage.senderId as any)?.avatarUrl ?? (newMessage.senderId as any)?.avatar ?? selfMessagingIdentity.avatar,
        timestamp: new Date(newMessage.createdAt),
        isFromCurrentUser: true,
        type: "server",
        messageType: (newMessage as any).messageType || "text",
        giphyId: (newMessage as any).giphyId || undefined,
        customStickerUrl: (newMessage as any).customStickerUrl || undefined,
        serverStickerId:
          (newMessage as any).serverStickerId != null
            ? String((newMessage as any).serverStickerId)
            : undefined,
        voiceUrl: (newMessage as any).voiceUrl ?? undefined,
        voiceDuration: (newMessage as any).voiceDuration ?? undefined,
        replyTo: replyingTo?.id ?? (newMessage.replyTo && typeof newMessage.replyTo === "object" ? (newMessage.replyTo as any)._id : typeof newMessage.replyTo === "string" ? newMessage.replyTo : undefined),
        replyToMessage:
          mapReplyToMessage(
            newMessage.replyTo && typeof newMessage.replyTo === "object" ? newMessage.replyTo : null,
          ) ?? (replyingTo
            ? {
                id: replyingTo.id,
                senderId: replyingTo.senderId,
                senderDisplayName: replyingTo.senderDisplayName,
                senderName: replyingTo.senderName,
                messageType: replyingTo.messageType ?? "text",
                text: replyingTo.text,
              }
            : null),
        reactions: normalizeReactions((newMessage as any).reactions),
        linkPreviews: Array.isArray((newMessage as any).linkPreviews) ? (newMessage as any).linkPreviews : [],
      };

      setMessages((prev) => {
        const withoutTemp = prev.filter((m) => m.id !== tempId);
        return appendServerMessage(withoutTemp, uiMessage);
      });
      setReplyingTo(null);
      serversApi.markChannelAsRead(selectedChannel).catch(() => {});
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      const msg = err instanceof Error ? err.message : "Không gửi được tin nhắn";
      const isSpamBlock =
        msg.includes("spam đề cập") ||
        msg.includes("chặn đề cập") ||
        msg.includes("hạn chế gửi tin nhắn");
      setError(msg);
      if (!isSpamBlock) setMessageText(content);
      setTimeout(() => setError((prev) => (prev === msg ? null : prev)), 5000);
    }
  };

  const openVerificationRulesModal = async () => {
    if (!selectedServer) return;
    setVerificationRulesAgreed(false);
    try {
      const s = await serversApi.getServerAccessSettings(selectedServer);
      setVerificationAccessSettings(s);
      setVerificationRulesOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được quy định");
    }
  };

  // Apply-to-join: show join application popup before calling joinServer
  const [applyJoinOpen, setApplyJoinOpen] = useState(false);
  const [applyJoinServerId, setApplyJoinServerId] = useState<string | null>(null);
  const [applyJoinForm, setApplyJoinForm] = useState<{ enabled: boolean; questions: Array<{ id: string; title: string; type: "short" | "paragraph" | "multiple_choice"; required: boolean; options?: string[] }> } | null>(null);
  const [applyJoinSubmitting, setApplyJoinSubmitting] = useState(false);

  const openApplyJoinModalIfNeeded = async (serverId: string): Promise<boolean> => {
    try {
      const settings = await serversApi.getServerAccessSettings(serverId);
      if (settings.accessMode !== "apply") return false;
      const form = settings.joinApplicationForm ?? { enabled: false, questions: [] };
      setApplyJoinServerId(serverId);
      setApplyJoinForm({
        enabled: Boolean(form.enabled),
        questions: form.questions ?? [],
      });
      setApplyJoinOpen(true);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được đơn đăng ký tham gia");
      return false;
    }
  };

  const submitApplyJoin = async (applyJoinAnswers: Record<string, { text?: string; selectedOption?: string }>) => {
    if (!applyJoinServerId || !applyJoinForm) return;

    for (const q of applyJoinForm.questions) {
      if (!q.required) continue;
      const a = applyJoinAnswers[q.id];
      if (q.type === "multiple_choice") {
        if (!a?.selectedOption) {
          setError("Vui lòng trả lời tất cả câu hỏi bắt buộc");
          return;
        }
      } else if (!a?.text?.trim()) {
        setError("Vui lòng trả lời tất cả câu hỏi bắt buộc");
        return;
      }
    }

    setApplyJoinSubmitting(true);
    setError(null);
    try {
      await serversApi.joinServer(applyJoinServerId, {
        applicationAnswers: applyJoinForm.questions.map((q) => {
          const a = applyJoinAnswers[q.id] || {};
          return {
            questionId: q.id,
            text: q.type === "multiple_choice" ? undefined : (a.text ?? ""),
            selectedOption: q.type === "multiple_choice" ? a.selectedOption : undefined,
          };
        }),
      });
      setApplyJoinOpen(false);
      setApplyJoinServerId(null);
      setApplyJoinForm(null);
      showNoticePopup(
        "Đơn đăng ký đã được gửi thành công. Vui lòng chờ chủ máy chủ hoặc quản trị viên duyệt đơn.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tham gia được máy chủ");
    } finally {
      setApplyJoinSubmitting(false);
    }
  };

  const submitVerificationRulesModal = async () => {
    if (!selectedServer) return;
    const needsAgree = verificationAccessSettings?.hasRules && (verificationAccessSettings?.rules?.length ?? 0) > 0;
    if (needsAgree && !verificationRulesAgreed) return;
    setVerificationRulesSubmitting(true);
    setError(null);
    try {
      if (needsAgree && !myServerAccessStatus?.acceptedRules) {
        await serversApi.acceptServerRules(selectedServer);
      }
      const status = await serversApi.getMyServerAccessStatus(selectedServer);
      setMyServerAccessStatus(status);
      const ch = selectedChannelRef.current;
      if (ch) {
        try {
          await loadMessages(ch);
        } catch {
          /* ignore */
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không hoàn thành được");
    } finally {
      setVerificationRulesSubmitting(false);
    }
  };

  const handleAgeAcknowledgeContinue = async () => {
    if (!selectedServer) return;
    setAgeAcknowledgeLoading(true);
    setError(null);
    try {
      await serversApi.acknowledgeServerAgeRestriction(selectedServer);
      const status = await serversApi.getMyServerAccessStatus(selectedServer);
      setMyServerAccessStatus(status);
      if (status.hasRules && !status.acceptedRules) {
        void openVerificationRulesModal();
      }
      const ch = selectedChannelRef.current;
      if (ch) await loadMessages(ch);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không xác nhận được");
    } finally {
      setAgeAcknowledgeLoading(false);
    }
  };

  const handleSendDirectMessage = async () => {
    if (!messageText.trim() || !selectedDirectMessageFriend) return;

    const messageContent = messageText.trim();
    const friendId = selectedDirectMessageFriend._id;
    upsertFriendToDmList(selectedDirectMessageFriend);
    bumpDmPeerToTop(friendId);
    let optimisticMessage: UIMessage | null = null;

    try {
      // ✅ Stop typing indicator immediately
      if (isTypingRef.current && notifyTyping) {
        isTypingRef.current = false;
        notifyTyping(friendId, false);
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
        }
      }

      // Clear input immediately for better UX
      setMessageText("");

      // ✅ FIX: Create optimistic message
      optimisticMessage = {
        id: `temp-${Date.now()}-${Math.random()}`, // Unique temporary ID
        text: messageContent,
        senderId: currentUserId,
        senderEmail: "",
        senderDisplayName: selfMessagingIdentity.displayName || undefined,
        senderName: selfMessagingIdentity.chatUsername || "",
        senderAvatar: selfMessagingIdentity.avatar,
        timestamp: new Date(),
        isFromCurrentUser: true,
        type: "direct",
        isRead: false, // Not read yet
        messageType: "text",
        replyTo: replyingTo?.id,
        replyToMessage: replyingTo
          ? {
              id: replyingTo.id,
              senderId: replyingTo.senderId,
              senderDisplayName: replyingTo.senderDisplayName,
              senderName: replyingTo.senderName,
              messageType: replyingTo.messageType,
              text: replyingTo.text,
            }
          : null,
      };

      // ✅ Enable auto-scroll for new message
      shouldAutoScrollRef.current = true;

      // ✅ OPTIMISTIC UPDATE: thêm tin nhắn vào conversation ngay để hiển thị không cần reload
      setConversations((prev) => {
        const newMap = new Map(prev);
        const currentMessages = newMap.get(friendId) || [];
        newMap.set(friendId, [...currentMessages, optimisticMessage!]);
        return newMap;
      });

      // Gửi qua API (REST); response trả về tin nhắn đã tạo — dùng để thay temp bằng bản thật
      const created = await sendDirectMessage(friendId, {
        token,
        content: messageContent,
        replyTo: replyingTo?.id,
      });

      if (created && created._id) {
        const serverMessage: UIMessage = {
          id: created._id,
          text: created.content,
          senderId: typeof created.senderId === "string" ? created.senderId : created.senderId?._id,
          senderEmail: typeof created.senderId === "object" ? created.senderId?.email : "",
          senderDisplayName: typeof created.senderId === "object" ? (created.senderId?.displayName || undefined) : undefined,
          senderName: typeof created.senderId === "object" ? (created.senderId?.username || created.senderId?.email) : "",
          senderAvatar: typeof created.senderId === "object" ? created.senderId?.avatar : selfMessagingIdentity.avatar,
          timestamp: new Date(created.createdAt),
          isFromCurrentUser: true,
          type: "direct",
          isRead: created.isRead ?? false,
          messageType: created.type || "text",
          giphyId: created.giphyId ?? undefined,
          customStickerUrl: (created as any).customStickerUrl ?? undefined,
          serverStickerId:
            (created as any).serverStickerId != null
              ? String((created as any).serverStickerId)
              : undefined,
          voiceUrl: created.voiceUrl ?? undefined,
          voiceDuration: created.voiceDuration ?? undefined,
          replyTo:
            (created.replyTo?._id as any) ||
            (typeof created.replyTo === "string" ? created.replyTo : undefined) ||
            replyingTo?.id,
          replyToMessage:
            mapReplyToMessage(created.replyTo) ||
            (replyingTo
              ? {
                  id: replyingTo.id,
                  senderId: replyingTo.senderId,
                  senderDisplayName: replyingTo.senderDisplayName,
                  senderName: replyingTo.senderName,
                  messageType: replyingTo.messageType,
                  text: replyingTo.text,
                }
              : null),
          reactions: normalizeReactions(created.reactions),
        };
        setConversations((prev) => {
          const newMap = new Map(prev);
          const list = newMap.get(friendId) || [];
          const idx = optimisticMessage ? list.findIndex((m) => m.id === optimisticMessage!.id) : -1;
          const next = idx >= 0 ? [...list.slice(0, idx), serverMessage, ...list.slice(idx + 1)] : [...list, serverMessage];
          newMap.set(friendId, next);
          return newMap;
        });
      }

      setReplyingTo(null);
    } catch (err) {
      console.error("Failed to send direct message", err);
      setError("Không gửi được tin nhắn trực tiếp");
      // Khôi phục tin nhắn đã gửi vào input và gỡ optimistic message
      setMessageText(messageContent);
      if (!optimisticMessage) return;
      setConversations((prev) => {
        const newMap = new Map(prev);
        const list = newMap.get(friendId) || [];
        const next = list.filter((m) => m.id !== optimisticMessage!.id);
        newMap.set(friendId, next);
        return newMap;
      });
    }
  };

  const handleSendGiphy = async (gif: GiphyGif, type: "gif" | "sticker") => {
    if (selectedChannel && !selectedDirectMessageFriend) {
      try {
        shouldAutoScrollRef.current = true;
        const newMsg = await serversApi.createMessage(
          selectedChannel,
          gif.title || `Sent a ${type}`,
          undefined,
          replyingTo?.id,
          undefined,
          type,
          gif.id,
        );

        const uiMsg: UIMessage = {
          id: newMsg._id,
          text: newMsg.content,
          senderId: typeof newMsg.senderId === "string" ? newMsg.senderId : newMsg.senderId._id,
          senderEmail: "",
          senderName: selfMessagingIdentity.chatUsername || "",
          senderDisplayName:
            servers
              .find((s) => s._id === selectedServer)
              ?.members?.find((m) => String(m.userId) === String(currentUserId))
              ?.nickname?.trim() ||
            selfMessagingIdentity.displayName ||
            undefined,
          senderAvatar: selfMessagingIdentity.avatar,
          timestamp: new Date(newMsg.createdAt),
          isFromCurrentUser: true,
          type: "server",
          messageType: type,
          giphyId: gif.id,
          replyTo: replyingTo?.id,
          reactions: [],
        };
        setMessages((prev) => appendServerMessage(prev, uiMsg));
        setReplyingTo(null);
      } catch (err) {
        console.error(`Failed to send ${type}:`, err);
        setError(`Không gửi được ${type}`);
      }
      return;
    }

    if (!selectedDirectMessageFriend) return;
    const friendId = selectedDirectMessageFriend._id;

    try {
      const optimisticMessage: UIMessage = {
        id: `temp-${Date.now()}-${Math.random()}`,
        text: gif.title || `Sent a ${type}`,
        senderId: currentUserId,
        senderEmail: "",
        senderDisplayName: selfMessagingIdentity.displayName || undefined,
        senderName: selfMessagingIdentity.chatUsername || "",
        senderAvatar: selfMessagingIdentity.avatar,
        timestamp: new Date(),
        isFromCurrentUser: true,
        type: "direct",
        isRead: false,
        messageType: type,
        giphyId: gif.id,
      };

      shouldAutoScrollRef.current = true;

      setConversations((prev) => {
        const newMap = new Map(prev);
        const currentMessages = newMap.get(friendId) || [];
        newMap.set(friendId, [...currentMessages, optimisticMessage]);
        return newMap;
      });

      await sendDirectMessage(friendId, {
        token,
        content: gif.title || `Sent a ${type}`,
        type,
        giphyId: gif.id,
        replyTo: replyingTo?.id,
      });

      setReplyingTo(null);
    } catch (err) {
      console.error(`Failed to send ${type}:`, err);
      setError(`Không gửi được ${type}`);
    }
  };

  const handleSendServerSticker = async (
    sel: Extract<GiphyPickerSelection, { source: "server" }>,
  ) => {
    const label = sel.name?.trim() ? `:${sel.name}:` : "Sticker máy chủ";

    if (selectedChannel && !selectedDirectMessageFriend) {
      try {
        shouldAutoScrollRef.current = true;
        const newMsg = await serversApi.createMessage(
          selectedChannel,
          label,
          undefined,
          replyingTo?.id,
          undefined,
          "sticker",
          undefined,
          undefined,
          undefined,
          {
            customStickerUrl: sel.imageUrl,
            serverStickerId: sel.stickerId,
            serverStickerServerId: sel.serverId,
          },
        );
        const rawStickerId = (newMsg as serversApi.Message).serverStickerId;
        const serverStickerIdResolved: string =
          rawStickerId != null && String(rawStickerId).length > 0
            ? String(rawStickerId)
            : sel.stickerId;
        const uiMsg: UIMessage = {
          id: newMsg._id,
          text: newMsg.content,
          senderId:
            typeof newMsg.senderId === "string"
              ? newMsg.senderId
              : newMsg.senderId._id,
          senderEmail: "",
          senderName: selfMessagingIdentity.chatUsername || "",
          senderDisplayName:
            servers
              .find((s) => s._id === selectedServer)
              ?.members?.find((m) => String(m.userId) === String(currentUserId))
              ?.nickname?.trim() ||
            currentUserProfile?.displayName ||
            undefined,
          senderAvatar: selfMessagingIdentity.avatar,
          timestamp: new Date(newMsg.createdAt),
          isFromCurrentUser: true,
          type: "server",
          messageType: "sticker",
          customStickerUrl: (() => {
            const fromApi = (newMsg as serversApi.Message).customStickerUrl;
            return typeof fromApi === "string" && fromApi.length > 0
              ? fromApi
              : sel.imageUrl;
          })(),
          serverStickerId: serverStickerIdResolved,
          replyTo: replyingTo?.id ?? undefined,
          reactions: [],
        };
        setMessages((prev) => appendServerMessage(prev, uiMsg));
        setReplyingTo(null);
      } catch (err) {
        console.error("Failed to send server sticker:", err);
        setError("Không gửi được sticker máy chủ");
      }
      return;
    }

    if (!selectedDirectMessageFriend) {
      setError("Chọn cuộc trò chuyện để gửi sticker.");
      return;
    }

    const canDmServerStickers =
      boostStatus?.active === true ||
      boostStatus?.limits?.dmServerStickers === true;
    if (!canDmServerStickers) {
      setError(
        "Cần gói Boost hoặc Boost cơ bản để gửi sticker máy chủ trong tin nhắn trực tiếp.",
      );
      return;
    }

    if (dmApiServerStickerSupport === "unsupported") {
      setError(
        "Máy chủ API chưa được cập nhật để gửi sticker trong DM. Hãy deploy lại cordigram-backend (nhánh main mới nhất) rồi thử lại.",
      );
      return;
    }

    const friendId = selectedDirectMessageFriend._id;
    if (!sel.serverId?.trim() || !sel.stickerId?.trim() || !sel.imageUrl?.trim()) {
      setError("Sticker không hợp lệ. Hãy chọn lại từ danh sách máy chủ.");
      return;
    }
    try {
      shouldAutoScrollRef.current = true;
      const optimisticMessage: UIMessage = {
        id: `temp-${Date.now()}-${Math.random()}`,
        text: label,
        senderId: currentUserId,
        senderEmail: "",
        senderDisplayName: selfMessagingIdentity.displayName || undefined,
        senderName: selfMessagingIdentity.chatUsername || "",
        senderAvatar: selfMessagingIdentity.avatar,
        timestamp: new Date(),
        isFromCurrentUser: true,
        type: "direct",
        isRead: false,
        messageType: "sticker",
        customStickerUrl: sel.imageUrl,
        serverStickerId: sel.stickerId,
        replyTo: replyingTo?.id,
      };

      setConversations((prev) => {
        const newMap = new Map(prev);
        const currentMessages = newMap.get(friendId) || [];
        newMap.set(friendId, [...currentMessages, optimisticMessage]);
        return newMap;
      });

      await sendDirectMessage(friendId, {
        token,
        content: label,
        type: "sticker",
        customStickerUrl: sel.imageUrl,
        serverStickerId: sel.stickerId,
        serverStickerServerId: sel.serverId,
        replyTo: replyingTo?.id,
      });

      setDmApiServerStickerSupport("supported");
      setReplyingTo(null);
    } catch (err) {
      console.error("Failed to send server sticker in DM:", err);
      const apiMsg =
        err && typeof err === "object" && "message" in err
          ? String((err as { message?: string }).message || "")
          : "";
      const apiOutdated =
        apiMsg.includes("should not exist") &&
        (apiMsg.includes("customStickerUrl") ||
          apiMsg.includes("serverStickerId"));
      if (apiOutdated) {
        setDmApiServerStickerSupport("unsupported");
      }
      setError(
        apiOutdated
          ? "Máy chủ API (api.cordigram.com) chưa được cập nhật. Deploy lại cordigram-backend từ nhánh main (có hỗ trợ sticker DM) rồi thử lại."
          : apiMsg.trim() ||
              "Không gửi được sticker máy chủ. Kiểm tra gói Boost và thử lại.",
      );
      setConversations((prev) => {
        const newMap = new Map(prev);
        const list = newMap.get(friendId) || [];
        newMap.set(
          friendId,
          list.filter((m) => !m.id.startsWith("temp-")),
        );
        return newMap;
      });
    }
  };

  const handleEmojiCatalogLoaded = useCallback((map: Record<string, string>) => {
    if (Object.keys(map).length === 0) return;
    setServerEmojiRenderMap((prev) => ({ ...prev, ...map }));
  }, []);

  const handleGiphyPickerSelect = (sel: GiphyPickerSelection) => {
    setShowGiphyPicker(false);
    if (sel.source === "giphy") {
      void handleSendGiphy(sel.gif, sel.mediaType);
      return;
    }
    if (sel.source === "server") {
      void handleSendServerSticker(sel);
      return;
    }
    if (sel.source === "unicode") {
      setMessageText((p) => p + sel.emoji);
      return;
    }
    if (sel.source === "kaomoji") {
      setMessageText((p) => p + sel.text);
      return;
    }
    if (sel.source === "serverEmoji") {
      const safe = sel.name.replace(/[^a-zA-Z0-9_]/g, "") || "emoji";
      const key = safe.toLowerCase();
      setMessageText((p) => p + `:${safe}:`);
      setServerEmojiRenderMap((prev) => ({
        ...prev,
        [key]: sel.imageUrl,
      }));
    }
  };

  // Handle voice recording complete
  const handleVoiceRecordComplete = async (
    audioBlob: Blob,
    duration: number,
    metadata?: { mimeType: string; fileExtension: string },
  ) => {
    const isServerChannel = !selectedDirectMessageFriend && selectedChannel && selectedServer;

    if (isServerChannel) {
      try {
        setIsRecordingVoice(false);
        setIsUploadingVoice(true);

        const fileName = metadata?.fileExtension
          ? `voice-message.${metadata.fileExtension}`
          : "voice-message.m4a";
        const mimeType = metadata?.mimeType || "audio/mp4";
        const audioFile = new File([audioBlob], fileName, { type: mimeType });

        if (audioFile.size > maxUploadBytes) {
          setError(formatUploadLimitExceededMessage(maxUploadBytes, (key) => t(key)));
          setIsUploadingVoice(false);
          return;
        }

        const uploadResponse = await uploadMedia({
          token,
          file: audioFile,
          cordigramUploadContext: "messages",
        });
        if (!uploadResponse || (!uploadResponse.secureUrl && !uploadResponse.url)) {
          throw new Error("Failed to upload voice message");
        }
        const voiceUrl = uploadResponse.secureUrl || uploadResponse.url;

        const newMessage = await serversApi.createMessage(
          selectedChannel!,
          "Tin nhắn thoại",
          undefined,
          replyingTo?.id,
          undefined,
          "voice",
          undefined,
          voiceUrl,
          duration,
        );

        const uiMessage: UIMessage = {
          id: newMessage._id,
          text: newMessage.content,
          senderId: typeof newMessage.senderId === "string" ? newMessage.senderId : (newMessage.senderId as any)?._id,
          senderEmail: typeof newMessage.senderId === "string" ? "" : (newMessage.senderId as any)?.email ?? "",
          senderName: typeof newMessage.senderId === "string" ? selfMessagingIdentity.chatUsername || "" : (newMessage.senderId as any)?.username || "",
          senderDisplayName: typeof newMessage.senderId === "string" ? selfMessagingIdentity.displayName || undefined : (newMessage.senderId as any)?.displayName ?? undefined,
          senderAvatar: typeof newMessage.senderId === "string" ? selfMessagingIdentity.avatar : (newMessage.senderId as any)?.avatarUrl ?? (newMessage.senderId as any)?.avatar ?? selfMessagingIdentity.avatar,
          timestamp: new Date(newMessage.createdAt),
          isFromCurrentUser: true,
          type: "server",
          messageType: "voice",
          voiceUrl: (newMessage as any).voiceUrl ?? voiceUrl,
          voiceDuration: (newMessage as any).voiceDuration ?? duration,
        };

        shouldAutoScrollRef.current = true;
        setMessages((prev) => appendServerMessage(prev, uiMessage));
        setReplyingTo(null);
        setIsUploadingVoice(false);
      } catch (err) {
        console.error("Failed to send voice message:", err);
        setError("Không gửi được tin nhắn thoại");
        setIsUploadingVoice(false);
        setIsRecordingVoice(false);
      }
      return;
    }

    if (!selectedDirectMessageFriend) return;

    const friendId = selectedDirectMessageFriend._id;

    try {
      setIsRecordingVoice(false);
      setIsUploadingVoice(true);

      const fileName = metadata?.fileExtension 
        ? `voice-message.${metadata.fileExtension}`
        : "voice-message.m4a";
      const mimeType = metadata?.mimeType || "audio/mp4";
      
      const audioFile = new File([audioBlob], fileName, {
        type: mimeType,
      });

      if (audioFile.size > maxUploadBytes) {
        setError(formatUploadLimitExceededMessage(maxUploadBytes, (key) => t(key)));
        setIsUploadingVoice(false);
        return;
      }
      const uploadResponse = await uploadMedia({
        token,
        file: audioFile,
        cordigramUploadContext: "messages",
      });
      if (!uploadResponse || (!uploadResponse.secureUrl && !uploadResponse.url)) {
        throw new Error("Failed to upload voice message");
      }

      // Prefer secureUrl (https) over url (http) to avoid mixed content issues
      const voiceUrl = uploadResponse.secureUrl || uploadResponse.url;

      // Create optimistic message with transformed URL
      const optimisticMessage: UIMessage = {
        id: `temp-${Date.now()}-${Math.random()}`,
        text: "Tin nhắn thoại",
        senderId: currentUserId,
        senderEmail: "",
        senderDisplayName: selfMessagingIdentity.displayName || undefined,
        senderName: selfMessagingIdentity.chatUsername || "",
        senderAvatar: selfMessagingIdentity.avatar,
        timestamp: new Date(),
        isFromCurrentUser: true,
        type: "direct",
        isRead: false,
        messageType: "voice",
        voiceUrl: voiceUrl,
        voiceDuration: duration,
      };


      // Enable auto-scroll
      shouldAutoScrollRef.current = true;

      // OPTIMISTIC UPDATE
      setConversations((prev) => {
        const newMap = new Map(prev);
        const currentMessages = newMap.get(friendId) || [];
        newMap.set(friendId, [...currentMessages, optimisticMessage]);
        return newMap;
      });

      // Send to API

      const response = await sendDirectMessage(friendId, {
        token,
        content: "Tin nhắn thoại",
        type: "voice",
        voiceUrl: voiceUrl,
        voiceDuration: duration,
        replyTo: replyingTo?.id,
      });

      // Clear reply preview
      setReplyingTo(null);


      // Replace optimistic message with real message from server
      setConversations((prev) => {
        const newMap = new Map(prev);
        const currentMessages = newMap.get(friendId) || [];

        // Find optimistic message
        const optimisticIndex = currentMessages.findIndex(
          (m) => m.id === optimisticMessage.id,
        );

        if (optimisticIndex !== -1) {

          const realMessage: UIMessage = {
            id: response._id,
            text: response.content,
            senderId: response.senderId._id,
            senderEmail: response.senderId.email,
            senderDisplayName: response.senderId.displayName || undefined,
            senderName: response.senderId.username || response.senderId.email,
            senderAvatar: response.senderId.avatar,
            timestamp: new Date(response.createdAt),
            isFromCurrentUser: true,
            type: "direct",
            isRead: response.isRead || false,
            messageType: response.type || "voice",
            voiceUrl: response.voiceUrl ?? voiceUrl,
            voiceDuration: response.voiceDuration ?? duration,
          };


          const updated = [...currentMessages];
          updated[optimisticIndex] = realMessage;
          newMap.set(friendId, updated);
        } else {
          console.warn(
            "⚠️ [VOICE-SEND] Optimistic message not found, adding response",
          );
        }

        return newMap;
      });

      setIsUploadingVoice(false);
    } catch (err) {
      console.error("Failed to send voice message:", err);
      setError("Không gửi được tin nhắn thoại");
      setIsUploadingVoice(false);
      setIsRecordingVoice(false);
    }
  };

  // Handle cancel voice recording
  const handleVoiceCancelRecording = () => {
    setIsRecordingVoice(false);
  };

  const handleCreateServer = async () => {
    if (!serverName.trim()) return;

    try {
      const newServer = await serversApi.createServer(serverName, undefined, undefined, undefined, undefined, language as "vi" | "en" | "ja" | "zh");

      const allCh = newServer.channels as serversApi.Channel[];
      const serverWithChannels: BackendServer = {
        ...newServer,
        infoChannels: allCh.filter(
          (c) => c.type === "text" && c.category === "info" && !c.categoryId,
        ),
        textChannels: allCh.filter((c) => c.type === "text" && c.category !== "info"),
        voiceChannels: allCh.filter((c) => c.type === "voice"),
      };

      setServers([...servers, serverWithChannels]);
      setSelectedServer(serverWithChannels._id);
      setShowCreateServerModal(false);
      setServerName("");
    } catch (err) {
      console.error("Failed to create server", err);
      setError("Không tạo được máy chủ");
    }
  };

  const handleServerCreated = async (serverId: string) => {
    try {
      // Fetch the newly created server with its channels
      const newServer = await serversApi.getServer(serverId);
      const allChannels = newServer.channels as serversApi.Channel[];

      const serverWithChannels: BackendServer = {
        ...newServer,
        infoChannels: allChannels.filter(
          (c) => c.type === "text" && c.category === "info" && !c.categoryId,
        ),
        textChannels: allChannels.filter((c) => c.type === "text" && c.category !== "info"),
        voiceChannels: allChannels.filter((c) => c.type === "voice"),
      };

      setServers([...servers, serverWithChannels]);
      if (serverWithChannels.textChannels?.length) {
        pendingChannelSelectRef.current = {
          serverId: serverWithChannels._id,
          channelId: serverWithChannels.textChannels[0]._id,
        };
      }
      setSelectedServer(serverWithChannels._id);
    } catch (err) {
      console.error("Failed to fetch created server", err);
      setError("Không tải được thông tin máy chủ");
    }
  };

  const openCreateChannelModal = (type: ChannelTypeForCreate, sectionLabel?: string, categoryId?: string) => {
    setCreateChannelDefaultType(type);
    setCreateChannelSectionLabel(sectionLabel ?? "");
    setCreateChannelCategoryId(categoryId);
    setShowCreateChannelModal(true);
  };

  const handleCreateChannel = async (
    name: string,
    type: "text" | "voice",
    isPrivate: boolean,
  ) => {
    if (!selectedServer) return;
    await serversApi.createChannel(selectedServer, name, type, undefined, isPrivate, createChannelCategoryId);
    await loadChannels(selectedServer);
  };

  const handleEditChannel = async (channelId: string, newName: string) => {
    if (!selectedServer) return;
    await serversApi.updateChannel(selectedServer, channelId, newName);
    const updateName = (list: serversApi.Channel[]) =>
      list.map((c) => (c._id === channelId ? { ...c, name: newName } : c));
    setAllChannels((prev) => updateName(prev));
    setTextChannels((prev) => updateName(prev));
    setInfoChannels((prev) => updateName(prev));
    setVoiceChannels((prev) => updateName(prev));
  };

  const handleDeleteChannel = async (channelId: string) => {
    if (!selectedServer) return;
    await serversApi.deleteChannel(selectedServer, channelId);
    const removeChannel = (list: serversApi.Channel[]) => list.filter((c) => c._id !== channelId);
    setAllChannels((prev) => removeChannel(prev));
    setTextChannels((prev) => removeChannel(prev));
    setInfoChannels((prev) => removeChannel(prev));
    setVoiceChannels((prev) => removeChannel(prev));
    if (selectedChannel === channelId) {
      const remaining = textChannels.filter((c) => c._id !== channelId);
      setSelectedChannel(remaining.length > 0 ? remaining[0]._id : null);
    }
  };

  const handleCreateCategory = async (name: string, isPrivate: boolean) => {
    if (!selectedServer) return;
    const created = await serversApi.createCategory(selectedServer, name, isPrivate);
    setServerCategories((prev) => [...prev, created]);
  };

  const handleDeleteCategory = async (categoryId: string) => {
    if (!selectedServer) return;
    try {
      await serversApi.deleteCategory(selectedServer, categoryId);
      setServerCategories((prev) => prev.filter((c) => c._id !== categoryId));
      setAllChannels((prev) =>
        prev.map((c) => {
          const cid = typeof c.categoryId === "string" ? c.categoryId : String((c.categoryId as any)?._id ?? c.categoryId);
          return cid === categoryId ? { ...c, categoryId: null as any } : c;
        }),
      );
      await loadChannels(selectedServer, { keepSelectedChannel: true });
    } catch (err) {
      console.error("Failed to delete category", err);
    }
  };

  const handleDeleteUncategorizedCategory = async () => {
    if (!selectedServer) return;
    const uncategorized = getUncategorizedChannels().filter((ch) => !ch.isDefault);
    if (uncategorized.length === 0) return;
    try {
      for (const ch of uncategorized) {
        await serversApi.deleteChannel(selectedServer, ch._id);
      }
      if (selectedChannel && uncategorized.some((ch) => ch._id === selectedChannel)) {
        const remaining = textChannels.filter(
          (c) => !uncategorized.some((deleted) => deleted._id === c._id),
        );
        setSelectedChannel(remaining.length > 0 ? remaining[0]._id : null);
      }
      await loadChannels(selectedServer);
    } catch (err) {
      console.error("Failed to delete uncategorized channels", err);
    }
  };

  const handleRenameCategory = async (categoryId: string, newName: string) => {
    if (!selectedServer || !newName.trim()) return;
    try {
      const trimmed = newName.trim();
      await serversApi.updateCategory(selectedServer, categoryId, trimmed);
      setServerCategories((prev) =>
        prev.map((c) => (c._id === categoryId ? { ...c, name: trimmed } : c)),
      );
    } catch (err) {
      console.error("Failed to rename category", err);
    }
    setRenamingCategoryId(null);
    setRenamingCategoryName("");
  };

  // ── Mention helpers ──

  const fetchMentionSuggestions = useCallback(
    async (keyword: string) => {
      if (!selectedServer || !canUseMentions) return;
      try {
        const results = await serversApi.getMentionSuggestions(selectedServer, keyword);
        setMentionSuggestions(results);
        setMentionActiveIndex(0);
      } catch {
        setMentionSuggestions([]);
      }
    },
    [selectedServer, canUseMentions],
  );

  const handleMentionDetect = useCallback(
    (value: string, cursorPos: number) => {
      if (!canUseMentions) {
        setMentionOpen(false);
        return;
      }
      let atPos = -1;
      for (let i = cursorPos - 1; i >= 0; i--) {
        const ch = value[i];
        if (ch === "@") { atPos = i; break; }
        if (ch === " " || ch === "\n") break;
      }

      if (atPos === -1 || (atPos > 0 && value[atPos - 1] !== " " && value[atPos - 1] !== "\n" && atPos !== 0)) {
        if (atPos === -1) { setMentionOpen(false); return; }
      }

      const keyword = value.slice(atPos + 1, cursorPos);
      setMentionOpen(true);
      setMentionStartPos(atPos);
      setMentionKeyword(keyword);

      if (mentionFetchTimer.current) clearTimeout(mentionFetchTimer.current);
      mentionFetchTimer.current = setTimeout(() => fetchMentionSuggestions(keyword), 150);
    },
    [fetchMentionSuggestions, canUseMentions],
  );

  const handleMentionSelect = useCallback(
    (suggestion: serversApi.MentionSuggestion) => {
      const input = messageInputRef.current;
      if (!input || mentionStartPos === -1) return;

      let insertText: string;
      if (suggestion.type === "user") {
        insertText = `@${suggestion.description || suggestion.name}`;
      } else if (suggestion.type === "special") {
        insertText =
          suggestion.id === "special_here"
            ? "@here"
            : suggestion.id === "special_everyone"
              ? "@everyone"
              : suggestion.name;
      } else {
        insertText = suggestion.name;
      }

      const before = messageText.slice(0, mentionStartPos);
      const after = messageText.slice(input.selectionStart ?? messageText.length);
      const newText = before + insertText + " " + after;
      setMessageText(newText);
      setMentionOpen(false);
      setMentionKeyword("");
      setMentionStartPos(-1);

      requestAnimationFrame(() => {
        if (messageInputRef.current) {
          const pos = before.length + insertText.length + 1;
          messageInputRef.current.setSelectionRange(pos, pos);
          messageInputRef.current.focus();
        }
      });
    },
    [mentionStartPos, messageText],
  );

  const handleMentionKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!mentionOpen || mentionSuggestions.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionActiveIndex((prev) =>
          prev < mentionSuggestions.length - 1 ? prev + 1 : 0,
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionActiveIndex((prev) =>
          prev > 0 ? prev - 1 : mentionSuggestions.length - 1,
        );
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        e.stopPropagation();
        handleMentionSelect(mentionSuggestions[mentionActiveIndex]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        setMentionOpen(false);
      }
    },
    [mentionOpen, mentionSuggestions, mentionActiveIndex, handleMentionSelect],
  );

  // ── Drag-and-drop helpers ──

  const getChannelsForCategory = useCallback(
    (categoryId: string) =>
      allChannels
        .filter((c) => {
          const cid =
            typeof c.categoryId === "string"
              ? c.categoryId
              : c.categoryId
                ? String((c.categoryId as any)._id ?? c.categoryId)
                : null;
          return cid === categoryId;
        })
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    [allChannels],
  );

  const getUncategorizedChannels = useCallback(
    () =>
      allChannels
        .filter((c) => {
          if (!c.categoryId) return true;
          const cid =
            typeof c.categoryId === "string"
              ? c.categoryId
              : String((c.categoryId as any)?._id ?? c.categoryId);
          return !cid;
        })
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    [allChannels],
  );

  /** Theo menu máy chủ «Ẩn các kênh bị tắt âm» — lưu prefs theo server. */
  const hideMutedChannelsEffective = useMemo(() => {
    if (!currentUserId || !selectedServer) return false;
    return sidebarPrefs.getServerPrefs(currentUserId, selectedServer).hideMutedChannels === true;
  }, [currentUserId, selectedServer, sidebarPrefsTick]);

  const isChannelMutedInSidebarPrefs = useCallback(
    (channelId: string) => {
      if (!currentUserId || !selectedServer) return false;
      const sp = sidebarPrefs.getServerPrefs(currentUserId, selectedServer);
      return sidebarPrefs.isChannelMuted(sp.channels[channelId]);
    },
    [currentUserId, selectedServer, sidebarPrefsTick],
  );

  const visibleChannelsIfHideMuted = useCallback(
    <T extends { _id: string }>(list: T[]) => {
      if (!hideMutedChannelsEffective) return list;
      return list.filter((ch) => !isChannelMutedInSidebarPrefs(ch._id));
    },
    [hideMutedChannelsEffective, isChannelMutedInSidebarPrefs],
  );

  const resetDragState = useCallback(() => {
    setDragType(null);
    setDragId(null);
    setDragOverId(null);
    setDragOverCategoryId(null);
    setDragPosition("after");
  }, []);

  // ── Category drag ──

  const handleCategoryDragStart = useCallback(
    (e: React.DragEvent, catId: string) => {
      if (!canDragChannels) return;
      setDragType("category");
      setDragId(catId);
      e.dataTransfer.effectAllowed = "move";
      if (e.currentTarget instanceof HTMLElement) {
        e.currentTarget.style.opacity = "0.4";
      }
    },
    [canDragChannels],
  );

  const handleCategoryDragOver = useCallback(
    (e: React.DragEvent, targetCatId: string) => {
      if (dragType !== "category" || dragId === targetCatId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      setDragOverId(targetCatId);
      setDragPosition(e.clientY < midY ? "before" : "after");
    },
    [dragType, dragId],
  );

  const handleCategoryDrop = useCallback(
    async (e: React.DragEvent, targetCatId: string) => {
      e.preventDefault();
      if (dragType !== "category" || !dragId || dragId === targetCatId || !selectedServer) {
        resetDragState();
        return;
      }
      const ordered = [...serverCategories];
      const fromIdx = ordered.findIndex((c) => c._id === dragId);
      let toIdx = ordered.findIndex((c) => c._id === targetCatId);
      if (fromIdx === -1 || toIdx === -1) { resetDragState(); return; }
      const [moved] = ordered.splice(fromIdx, 1);
      if (dragPosition === "after") toIdx = Math.min(toIdx + 1, ordered.length);
      if (fromIdx < toIdx) toIdx = Math.max(0, toIdx);
      ordered.splice(toIdx, 0, moved);
      setServerCategories(ordered);
      resetDragState();
      try {
        await serversApi.reorderCategories(selectedServer, ordered.map((c) => c._id));
      } catch {
        await loadChannels(selectedServer);
      }
    },
    [dragType, dragId, dragPosition, serverCategories, selectedServer, loadChannels, resetDragState],
  );

  // ── Channel drag (cross-category supported) ──

  const handleChannelDragStart = useCallback(
    (e: React.DragEvent, channelId: string) => {
      if (!canDragChannels) return;
      e.stopPropagation();
      setDragType("channel");
      setDragId(channelId);
      e.dataTransfer.effectAllowed = "move";
      if (e.currentTarget instanceof HTMLElement) {
        e.currentTarget.style.opacity = "0.4";
      }
    },
    [canDragChannels],
  );

  const handleChannelDragOver = useCallback(
    (e: React.DragEvent, targetChannelId: string, targetCatId: string) => {
      if (dragType !== "channel" || dragId === targetChannelId) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      setDragOverId(targetChannelId);
      setDragOverCategoryId(targetCatId);
      setDragPosition(e.clientY < midY ? "before" : "after");
    },
    [dragType, dragId],
  );

  const handleChannelDrop = useCallback(
    async (e: React.DragEvent, targetChannelId: string, targetCatId: string) => {
      e.preventDefault();
      e.stopPropagation();
      if (dragType !== "channel" || !dragId || dragId === targetChannelId || !selectedServer) {
        resetDragState();
        return;
      }
      const draggedChannel = allChannels.find((c) => c._id === dragId);
      if (!draggedChannel) { resetDragState(); return; }

      const sourceCatId = draggedChannel.categoryId || "";
      const targetChannels = getChannelsForCategory(targetCatId).filter((c) => c._id !== dragId);
      const dropIdx = targetChannels.findIndex((c) => c._id === targetChannelId);
      const insertIdx = dragPosition === "after" ? dropIdx + 1 : dropIdx;
      targetChannels.splice(insertIdx, 0, { ...draggedChannel, categoryId: targetCatId });

      // Optimistic update
      const updated = allChannels.map((c) => {
        if (c._id === dragId) return { ...c, categoryId: targetCatId };
        return c;
      });
      setAllChannels(updated);
      setTextChannels(updated.filter((c) => c.type === "text"));
      setVoiceChannels(updated.filter((c) => c.type === "voice"));
      resetDragState();

      try {
        await serversApi.reorderChannels(
          selectedServer,
          targetCatId,
          targetChannels.map((c) => c._id),
        );
      } catch {
        await loadChannels(selectedServer);
      }
    },
    [dragType, dragId, dragPosition, selectedServer, allChannels, getChannelsForCategory, loadChannels, resetDragState],
  );

  // Drop channel on empty category area
  const handleCategoryBodyDrop = useCallback(
    async (e: React.DragEvent, targetCatId: string) => {
      e.preventDefault();
      if (dragType !== "channel" || !dragId || !selectedServer) {
        resetDragState();
        return;
      }
      const draggedChannel = allChannels.find((c) => c._id === dragId);
      if (!draggedChannel) { resetDragState(); return; }

      const targetChannels = getChannelsForCategory(targetCatId).filter((c) => c._id !== dragId);
      targetChannels.push({ ...draggedChannel, categoryId: targetCatId });

      const updated = allChannels.map((c) => {
        if (c._id === dragId) return { ...c, categoryId: targetCatId };
        return c;
      });
      setAllChannels(updated);
      setTextChannels(updated.filter((c) => c.type === "text"));
      setVoiceChannels(updated.filter((c) => c.type === "voice"));
      resetDragState();

      try {
        await serversApi.reorderChannels(
          selectedServer,
          targetCatId,
          targetChannels.map((c) => c._id),
        );
      } catch {
        await loadChannels(selectedServer);
      }
    },
    [dragType, dragId, selectedServer, allChannels, getChannelsForCategory, loadChannels, resetDragState],
  );

  const handleDragEnd = useCallback(
    (e: React.DragEvent) => {
      if (e.currentTarget instanceof HTMLElement) {
        e.currentTarget.style.opacity = "1";
      }
      resetDragState();
    },
    [resetDragState],
  );

  const handleOpenEventImageEditor = useCallback((currentImageUrl: string | null) => {
    return new Promise<string | null>((resolve) => {
      eventImageEditorResolveRef.current = resolve;
      setEventImageEditorCurrentUrl(currentImageUrl);
      setShowEventImageEditor(true);
    });
  }, []);

  const handleEventImageEditorConfirm = useCallback((url: string) => {
    eventImageEditorResolveRef.current?.(url);
    eventImageEditorResolveRef.current = null;
    setShowEventImageEditor(false);
  }, []);

  const handleEventImageEditorClose = useCallback(() => {
    eventImageEditorResolveRef.current?.(null);
    eventImageEditorResolveRef.current = null;
    setShowEventImageEditor(false);
  }, []);

  const handleEventCreated = useCallback((event: serversApi.ServerEvent, link: string) => {
    setShareEventLink(link);
    setCreatedEventDetail(event);
  }, []);

  const openCreateEventWizard = useCallback(() => {
    setShowEventsPopup(false);
    setShowCreateEventWizard(true);
  }, []);

  const handleWaveSticker = useCallback(
    async (
      channelId: string,
      welcomeMessageId: string,
      welcomeSenderId: string,
    ) => {
      if (!channelId) return;
      setWavingIds((prev) => new Set(prev).add(welcomeMessageId));
      try {
        const isNewMember = welcomeSenderId === currentUserId;

        const waveSticker = await getRandomWaveSticker();
        const giphyId = waveSticker?.id;

        const newMsg = await serversApi.sendWaveSticker(
          channelId,
          isNewMember ? undefined : welcomeMessageId,
          giphyId,
        );

        const replyRaw = newMsg.replyTo;
        let replyToMessage: UIMessage["replyToMessage"] = null;
        if (!isNewMember && replyRaw && typeof replyRaw === "object") {
          const rt = replyRaw as any;
          replyToMessage = {
            id: rt._id,
            senderId: rt.senderId?._id ?? rt.senderId,
            senderDisplayName: rt.senderId?.displayName,
            senderName: rt.senderId?.username || rt.senderId?.email,
            messageType: rt.messageType || "welcome",
            text: rt.content,
          };
        }

        const uiMsg: UIMessage = {
          id: newMsg._id,
          text: newMsg.content,
          senderId:
            typeof newMsg.senderId === "string"
              ? newMsg.senderId
              : newMsg.senderId._id,
          senderEmail: "",
          senderName: selfMessagingIdentity.chatUsername || "",
          senderDisplayName: selfMessagingIdentity.displayName || undefined,
          senderAvatar: selfMessagingIdentity.avatar,
          timestamp: new Date(newMsg.createdAt),
          isFromCurrentUser: true,
          type: "server",
          messageType: (newMsg as any).messageType || "sticker",
          giphyId: (newMsg as any).giphyId || undefined,
          replyTo: isNewMember ? undefined : welcomeMessageId,
          replyToMessage,
          reactions: [],
        };
        setMessages((prev) => {
          const withWave = appendServerMessage(prev, uiMsg);
          if (isNewMember) return withWave;
          return withWave.map((m) =>
            m.id === welcomeMessageId
              ? { ...m, welcomeWaveDismissedByMe: true }
              : m,
          );
        });
      } catch (e) {
        console.error("Wave sticker failed", e);
      } finally {
        setWavingIds((prev) => {
          const next = new Set(prev);
          next.delete(welcomeMessageId);
          return next;
        });
      }
    },
    [currentUserId, currentUserProfile],
  );

  const openMediaViewer = useCallback(
    (clickedUrl: string) => {
      const IMAGE_RE = /📷 \[Image\]: (https?:\/\/[^\s]+)/g;
      const VIDEO_RE = /🎬 \[Video\]: (https?:\/\/[^\s]+)/;
      const PLAIN_IMG_RE = /^https?:\/\/[^\s]+\.(jpe?g|png|webp)(\?[^\s]*)?$/i;
      const PLAIN_VID_RE = /^https?:\/\/[^\s]+\.(mp4|webm|mov)(\?[^\s]*)?$/i;
      const allMedia: ChatMediaItem[] = [];
      let clickedIndex = 0;

      // DM messages live in the `conversations` Map; server-channel messages live in `messages`.
      // Always pick the correct source to avoid showing images from the wrong context.
      const sourceMessages: UIMessage[] = selectedDirectMessageFriend
        ? (conversations.get(selectedDirectMessageFriend._id) || [])
        : messages;

      const pushMedia = (url: string, mediaType: "image" | "video", ts: Date, sender?: string) => {
        const safeUrl = toHttps(url);
        // deduplicate (compare after normalizing to https)
        if (allMedia.some((m) => m.url === safeUrl)) return;
        allMedia.push({ url: safeUrl, mediaType, timestamp: ts, senderName: sender });
        // match against both original and https-normalized clicked URL
        if (safeUrl === toHttps(clickedUrl)) clickedIndex = allMedia.length - 1;
      };

      for (const msg of sourceMessages) {
        const text = msg.text || "";
        const ts = msg.timestamp instanceof Date ? msg.timestamp : new Date(msg.timestamp);
        const sender = msg.senderDisplayName || msg.senderName;

        // 1. New format: emoji-prefix in text
        for (const match of text.matchAll(IMAGE_RE)) {
          pushMedia(match[1], "image", ts, sender);
        }
        const vMatch = text.match(VIDEO_RE);
        if (vMatch) pushMedia(vMatch[1], "video", ts, sender);

        // 2. Legacy format A: plain image/video URL as entire text
        const trimmed = text.trim();
        if (PLAIN_IMG_RE.test(trimmed)) pushMedia(trimmed, "image", ts, sender);
        else if (PLAIN_VID_RE.test(trimmed)) pushMedia(trimmed, "video", ts, sender);

        // 3. Legacy format B: raw URLs in attachments field
        if (msg.attachments && msg.attachments.length > 0) {
          for (const att of msg.attachments) {
            const a = att.trim();
            if (!a) continue;
            if (PLAIN_VID_RE.test(a)) pushMedia(a, "video", ts, sender);
            else if (a.startsWith("http")) pushMedia(a, "image", ts, sender);
          }
        }
      }

      if (allMedia.length === 0) return;
      setMediaViewerState({ items: allMedia, index: clickedIndex });
    },
    [messages, conversations, selectedDirectMessageFriend],
  );

  /** Messages fed to ConversationDetailsPanel — pick from correct source (DM or channel) */
  const detailsPanelMessages = useMemo((): DetailsPanelMessage[] => {
    const source: UIMessage[] = selectedDirectMessageFriend
      ? (conversations.get(selectedDirectMessageFriend._id) || [])
      : messages;
    return source.map((m) => ({
      id: m.id,
      text: m.text || "",
      senderId: m.senderId,
      senderDisplayName: m.senderDisplayName,
      senderName: m.senderName,
      timestamp: m.timestamp,
      attachments: m.attachments,
    }));
  }, [selectedDirectMessageFriend, conversations, messages]);

  const renderMessageContent = useCallback(
    (message: UIMessage) => {
      const boostVideoOptimizationEnabled = Boolean(boostStatus?.active);
      const optimizeHeavyVideoUrl = (rawUrl: string) => {
        const url = rawUrl.trim();
        if (!boostVideoOptimizationEnabled || !url) return url;
        if (!url.includes("/res.cloudinary.com/")) return url;
        if (url.includes("/upload/q_auto:eco,f_auto,vc_auto,w_960/")) return url;
        if (url.includes("/upload/")) {
          return url.replace(
            "/upload/",
            "/upload/q_auto:eco,f_auto,vc_auto,w_960/",
          );
        }
        return url;
      };
      const {
        text,
        messageType,
        giphyId,
        customStickerUrl,
        voiceUrl,
        voiceDuration,
      } = message;

      // "Delete for everyone" / unsend — preserve the bubble footprint so the
      // surrounding layout (avatars, reactions, read receipts) doesn't jump,
      // but replace the payload with a greyed-out italic placeholder.
      //
      // The placeholder is personalised so the deletor sees "You deleted a
      // message" while the other side sees "{senderName} deleted a message"
      // (matches the spec: identify who removed the message in chat).
      if (message.isDeletedForEveryone) {
        const senderName =
          message.senderDisplayName ||
          message.senderName ||
          message.senderEmail ||
          t("chat.welcome.unknownUser") ||
          "Người dùng";
        const label = message.isFromCurrentUser
          ? t("chat.messageRecalled.self") || "Bạn đã xóa tin nhắn"
          : (
              t("chat.messageRecalled.other") || "{name} đã xóa tin nhắn"
            ).replace("{name}", senderName);
        return (
          <span
            style={{
              fontStyle: "italic",
              color: "var(--color-text-muted)",
              opacity: 0.85,
              userSelect: "none",
            }}
          >
            {label}
          </span>
        );
      }

      if (messageType === "call") {
        return (
          <CallMessageCard
            callType={message.callType ?? "audio"}
            callStatus={message.callStatus ?? "missed"}
            callDurationSec={message.callDurationSec}
            callInitiatorId={message.callInitiatorId}
            currentUserId={currentUserId}
            timestamp={message.timestamp}
            onCallBack={() => handleStartCall(message.callType === "video")}
          />
        );
      }

      if (messageType === "system") {
        return (
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: "4px 16px",
            margin: "2px 0",
          }}>
            <div style={{
              flex: 1,
              height: 1,
              background: "var(--color-border)",
            }} />
            <span style={{
              fontSize: 13,
              color: "var(--color-text-muted)",
              whiteSpace: "nowrap",
            }}>
              <span style={{ color: "var(--color-panel-success)", marginRight: 4 }}>→</span>
              {text}
            </span>
            <span style={{
              fontSize: 12,
              color: "var(--color-text-muted)",
              whiteSpace: "nowrap",
              opacity: 0.7,
            }}>
              {formatMessageTime(message.timestamp)}
            </span>
            <div style={{
              flex: 1,
              height: 1,
              background: "var(--color-border)",
            }} />
          </div>
        );
      }

      if (messageType === "welcome") {
        const isWaving = wavingIds.has(message.id);
        const showWaveButton =
          message.stickerReplyWelcomeEnabled !== false &&
          !message.welcomeWaveDismissedByMe;
        const displayName =
          message.senderDisplayName || message.senderName || t("chat.welcome.unknownUser");
        return (
          <div style={{
            display: "flex",
            flexDirection: "column",
            gap: 0,
            padding: "8px 0",
            margin: "4px 0",
          }}>
            <div style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
            }}>
              <span style={{
                color: "var(--color-panel-success)",
                fontSize: 20,
                lineHeight: "24px",
                flexShrink: 0,
              }}>→</span>
              <div style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                minWidth: 0,
              }}>
                <div>
                  <span style={{ color: "var(--color-text)", fontSize: 14 }}>{t("chat.welcome.greeting").replace("{name}", displayName)}</span>
                  <span style={{
                    color: "var(--color-text-muted)",
                    fontSize: 12,
                    marginLeft: 8,
                  }}>
                    {formatMessageTime(message.timestamp)}
                  </span>
                </div>
                {showWaveButton && (
                  <button
                    type="button"
                    disabled={isWaving}
                    onClick={() => {
                      if (selectedChannel) {
                        handleWaveSticker(selectedChannel, message.id, message.senderId);
                      }
                    }}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "5px 12px",
                      background: isWaving
                        ? "var(--color-surface-muted)"
                        : "var(--color-panel-hover)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 6,
                      color: isWaving
                        ? "var(--color-text-muted)"
                        : "var(--color-text)",
                      cursor: isWaving ? "not-allowed" : "pointer",
                      fontSize: 13,
                      width: "fit-content",
                      transition: "all 0.15s ease",
                    }}
                  >
                    {isWaving ? (
                      <>
                        <span
                          style={{
                            display: "inline-block",
                            width: 14,
                            height: 14,
                            border: "2px solid var(--color-text-muted)",
                            borderTopColor: "transparent",
                            borderRadius: "50%",
                            animation: "spin 0.6s linear infinite",
                          }}
                        />
                        {t("chat.welcome.waving")}
                      </>
                    ) : (
                      <>
                        <span style={{ fontSize: 15 }}>👋</span>
                        {t("chat.welcome.waveBtn").replace("{name}", displayName)}
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      }

      if (messageType === "voice" && voiceUrl) {
        return (
          <VoiceMessage
            voiceUrl={voiceUrl}
            duration={voiceDuration ?? 0}
            isFromCurrentUser={message.isFromCurrentUser}
          />
        );
      }

      if (messageType === "sticker" && customStickerUrl) {
        return (
          <div className={styles.mediaMessage}>
            <img
              src={customStickerUrl}
              alt=""
              style={{
                maxWidth: "200px",
                maxHeight: "200px",
                borderRadius: "8px",
                display: "block",
              }}
              loading="lazy"
            />
          </div>
        );
      }

      // Check if message is GIF or Sticker from Giphy
      if ((messageType === "gif" || messageType === "sticker") && giphyId) {
        return (
          <div className={styles.mediaMessage}>
            <GiphyMessage giphyId={giphyId} messageType={messageType} />
          </div>
        );
      }

      if (messageType === "sticker" && !giphyId && !customStickerUrl) {
        return (
          <div style={{ fontSize: 64, padding: "8px", lineHeight: 1 }}>
            👋
          </div>
        );
      }

      // Check if message contains poll
      const pollMatch = text.match(/📊 \[Poll\]: ([a-f0-9]+)/);
      if (pollMatch) {
        const pollId = pollMatch[1];
        return <PollMessage pollId={pollId} token={token} onError={setError} />;
      }

      // ── Backward-compat: old images stored in `attachments` field without emoji prefix ──
      // If text doesn't contain the new-format prefix but there are raw attachment URLs,
      // synthesize the new format so the rest of the render path works uniformly.
      const PLAIN_IMAGE_URL_RE = /^https?:\/\/[^\s]+\.(jpe?g|png|webp|gif)(\?[^\s]*)?$/i;
      const PLAIN_VIDEO_URL_RE = /^https?:\/\/[^\s]+\.(mp4|webm|mov)(\?[^\s]*)?$/i;
      let resolvedText = text;
      if (
        message.attachments &&
        message.attachments.length > 0 &&
        !text.includes("📷 [Image]:") &&
        !text.includes("🎬 [Video]:")
      ) {
        const extraLines: string[] = [];
        for (const att of message.attachments) {
          const safeAtt = toHttps(att.trim());
          if (PLAIN_VIDEO_URL_RE.test(safeAtt)) {
            extraLines.push(`🎬 [Video]: ${safeAtt}`);
          } else if (safeAtt.startsWith("https://")) {
            extraLines.push(`📷 [Image]: ${safeAtt}`);
          }
        }
        if (extraLines.length > 0) {
          resolvedText = extraLines.join("\n");
        }
      }
      // Also handle bare image/video URL as the entire text (legacy direct URL format)
      if (
        !resolvedText.includes("📷 [Image]:") &&
        !resolvedText.includes("🎬 [Video]:")
      ) {
        const trimmed = toHttps(resolvedText.trim());
        if (PLAIN_IMAGE_URL_RE.test(trimmed)) {
          resolvedText = `📷 [Image]: ${trimmed}`;
        } else if (PLAIN_VIDEO_URL_RE.test(trimmed)) {
          resolvedText = `🎬 [Video]: ${trimmed}`;
        }
      }
      // Normalize any existing http:// URLs already embedded in resolvedText
      if (resolvedText.includes("http://res.cloudinary.com/")) {
        resolvedText = resolvedText.replace(/http:\/\/res\.cloudinary\.com\//g, "https://res.cloudinary.com/");
      }

      // Check if message contains media (single or multiple images)
      const IMAGE_RE_GLOBAL = /📷 \[Image\]: (https?:\/\/[^\s]+)/g;
      const allImageMatches = [...resolvedText.matchAll(IMAGE_RE_GLOBAL)];
      const videoMatch = resolvedText.match(/🎬 \[Video\]: (https?:\/\/[^\s]+)/);
      const gifMatch = resolvedText.match(/(https?:\/\/[^\s]+\.gif)/i);

      if (allImageMatches.length > 0) {
        const imageUrls = allImageMatches.map((m) => toHttps(m[1]));
        const modResult = message.contentModerationResult;
        const hasBlurred = imageUrls.some((u) => u.includes("e_blur:"));

        if (hasBlurred) {
          return (
            <div>
              <div className={styles.mediaMessage}>
                <BlurredImage
                  blurredUrl={imageUrls[0]}
                  canReveal={isAgeRestrictedRef.current}
                  className={styles.messageImage}
                />
              </div>
              {modResult === "rejected" && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "6px 10px", borderRadius: 4,
                  background: "rgba(237, 66, 69, 0.15)", color: "#ed4245",
                  fontSize: 12, marginTop: 4,
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
                  Hình ảnh đã bị xóa do vi phạm chính sách nội dung.
                </div>
              )}
            </div>
          );
        }

        // Multi-image grid (like Zalo) or single image
        if (imageUrls.length === 1) {
          return (
            <div>
              <div className={styles.mediaMessage}>
                <img
                  src={imageUrls[0]}
                  alt="Ảnh được chia sẻ"
                  className={styles.messageImage}
                  style={{ cursor: "pointer" }}
                  onClick={() => openMediaViewer(imageUrls[0])}
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
              </div>
              {modResult === "rejected" && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "6px 10px", borderRadius: 4,
                  background: "rgba(237, 66, 69, 0.15)", color: "#ed4245",
                  fontSize: 12, marginTop: 4,
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
                  Hình ảnh đã bị xóa do vi phạm chính sách nội dung.
                </div>
              )}
            </div>
          );
        }

        // Multiple images — render a grid
        const cols = imageUrls.length === 2 ? 2 : imageUrls.length === 4 ? 2 : 3;
        return (
          <div className={styles.mediaMessage}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${cols}, 1fr)`,
                gap: "3px",
                borderRadius: "10px",
                overflow: "hidden",
                maxWidth: "320px",
              }}
            >
              {imageUrls.map((url, idx) => (
                <img
                  key={idx}
                  src={url}
                  alt={`Ảnh ${idx + 1}`}
                  style={{
                    width: "100%",
                    aspectRatio: imageUrls.length <= 2 ? "4/3" : "1",
                    objectFit: "cover",
                    cursor: "pointer",
                    transition: "opacity 0.15s",
                  }}
                  onClick={() => openMediaViewer(url)}
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
              ))}
            </div>
          </div>
        );
      }

      if (videoMatch) {
        const rawVideoUrl = toHttps(videoMatch[1]);
        const videoUrl = optimizeHeavyVideoUrl(rawVideoUrl);
        return (
          <div className={styles.mediaMessage} style={{ position: "relative" }}>
            <LazyInViewVideo
              src={videoUrl}
              className={styles.messageVideo}
              preload={boostVideoOptimizationEnabled ? "none" : "metadata"}
              playsInline
              controls
              onError={(e) => {
                e.currentTarget.style.display = "none";
                e.currentTarget.nextElementSibling?.classList.remove(
                  styles.hidden,
                );
              }}
            />
            {/* Fullscreen button overlay */}
            <button
              aria-label={tMsg("viewFullscreen")}
              title={tMsg("viewFullscreen")}
              style={{
                position: "absolute",
                top: 8,
                right: 8,
                background: "rgba(0,0,0,0.55)",
                border: "none",
                borderRadius: "50%",
                width: 32,
                height: 32,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                color: "#fff",
                zIndex: 2,
              }}
              onClick={() => openMediaViewer(rawVideoUrl)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M16 21h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
              </svg>
            </button>
            <span
              className={styles.hidden}
              style={{ fontSize: "12px", color: "var(--color-text-muted)" }}
            >
              Không tải được video
            </span>
          </div>
        );
      }

      if (gifMatch) {
        const gifUrl = toHttps(gifMatch[1]);
        return (
          <div className={styles.mediaMessage}>
            <img src={gifUrl} alt="Ảnh GIF" className={styles.messageGif} />
          </div>
        );
      }

      // Server invite link detection
      const inviteLinkMatch = text.match(/(https?:\/\/[^\s]+\/invite\/server\/([a-f0-9]{24}))/i);
      if (inviteLinkMatch) {
        const fullUrl = inviteLinkMatch[1];
        const sid = inviteLinkMatch[2];
        const textBefore = text.slice(0, inviteLinkMatch.index).trim();
        const textAfter = text.slice((inviteLinkMatch.index ?? 0) + fullUrl.length).trim();
        return (
          <div>
            {textBefore && <div style={{ marginBottom: 4 }}>{textBefore}</div>}
            <ServerInviteCard serverId={sid} inviteUrl={fullUrl} />
            {textAfter && <div style={{ marginTop: 4 }}>{textAfter}</div>}
          </div>
        );
      }

      // Moderation rejection notice in text
      if (text.includes("⚠️ Hình ảnh đã bị xóa do vi phạm chính sách nội dung.")) {
        return (
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "6px 10px", borderRadius: 4,
            background: "rgba(237, 66, 69, 0.15)", color: "#ed4245",
            fontSize: 13,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
            Hình ảnh đã bị xóa do vi phạm chính sách nội dung.
          </div>
        );
      }

      // Regular text message (emoji máy chủ dạng :ten: — kênh chat & DM dùng chung)
      const map = serverEmojiRenderMap;
      const emojiPx = getServerCustomEmojiRenderSizePx(text, map);
      const isJumboEmojiRow = emojiPx >= CUSTOM_EMOJI_JUMBO_PX;
      const re = /:([a-zA-Z0-9_]{1,80}):/g;
      const nodes: React.ReactNode[] = [];
      let last = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        if (m.index > last) {
          nodes.push(<span key={`t-${last}`}>{text.slice(last, m.index)}</span>);
        }
        const url = map[m[1].toLowerCase()];
        if (url) {
          nodes.push(
            <img
              key={`e-${m.index}`}
              src={url}
              alt={m[0]}
              style={{
                width: emojiPx,
                height: emojiPx,
                verticalAlign: "middle",
                objectFit: "contain",
                display: "inline-block",
                margin: isJumboEmojiRow ? "2px 4px 2px 0" : undefined,
              }}
            />,
          );
        } else {
          nodes.push(<span key={`l-${m.index}`}>{m[0]}</span>);
        }
        last = m.index + m[0].length;
      }
      if (last < text.length) {
        nodes.push(<span key="tail">{text.slice(last)}</span>);
      }
      const storedPreviews =
        Array.isArray(message.linkPreviews) && message.linkPreviews.length > 0
          ? message.linkPreviews
          : null;

      // Fallback for messages sent before the server-side pre-fetch feature
      const fallbackUrl = !storedPreviews ? (extractFirstUrl(text) ?? undefined) : undefined;
      const hasPreviewData = storedPreviews || fallbackUrl;

      const textSpan = (
        <span
          style={{
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            ...(isJumboEmojiRow
              ? {
                  display: "inline-flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: 6,
                }
              : {}),
          }}
        >
          {nodes}
        </span>
      );

      if (!hasPreviewData) {
        return textSpan;
      }

      return (
        <div>
          {textSpan}
          <LinkPreviewCard
            previews={storedPreviews ?? []}
            fallbackUrl={fallbackUrl}
            apiBase={apiBaseUrl}
            token={token}
          />
        </div>
      );
    },
    [
      token,
      wavingIds,
      selectedChannel,
      handleWaveSticker,
      serverEmojiRenderMap,
      boostStatus?.active,
      currentUserId,
      handleStartCall,
      openMediaViewer,
      t,
    ],
  );

  const handleMediaFilesSelected = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setShowPlusMenu(false);

      try {
        const invalidType = files.find((f) => !isAllowedMessagingMediaFile(f));
        if (invalidType) {
          setError(t("chat.composer.onlyImageVideoAudioAllowed"));
          return;
        }

        const tooLarge = files.find((f) => f.size > maxUploadBytes);
        if (tooLarge) {
          setError(formatUploadLimitExceededMessage(maxUploadBytes, (key) => t(key)));
          return;
        }

        for (const file of files) {
          if (file.type.startsWith("video/")) {
            const duration = await getVideoDuration(file);
            if (duration > 180) {
              setError("Video phải dài 3 phút trở xuống");
              return;
            }
          }
        }

        const loadingMessages: UIMessage[] = [];
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const isImage = file.type.startsWith("image/");
          const isVideo = file.type.startsWith("video/");
          const isAudio = file.type.startsWith("audio/");
          const tempId = `temp-upload-${Date.now()}-${i}`;
          const loadingMessage: UIMessage = {
            id: tempId,
            text: isImage
              ? `📤 Uploading image...`
              : isVideo
                ? `📤 Uploading video...`
                : isAudio
                  ? `📤 Uploading audio...`
                  : `📤 Uploading...`,
            senderId: currentUserId,
            senderEmail: "",
            senderDisplayName: selfMessagingIdentity.displayName || undefined,
            senderName: selfMessagingIdentity.chatUsername || "",
            senderAvatar: selfMessagingIdentity.avatar,
            timestamp: new Date(),
            isFromCurrentUser: true,
            type: selectedDirectMessageFriend ? "direct" : "server",
          };
          loadingMessages.push(loadingMessage);

          if (selectedDirectMessageFriend) {
            setMessages((prev) => [...prev, loadingMessage]);
            setConversations((prev) => {
              const newMap = new Map(prev);
              const current = newMap.get(selectedDirectMessageFriend._id) || [];
              newMap.set(selectedDirectMessageFriend._id, [
                ...current,
                loadingMessage,
              ]);
              return newMap;
            });
          } else if (selectedChannel) {
            setMessages((prev) => appendServerMessage(prev, loadingMessage));
          }
        }

        prepareScrollToLatest();
        scheduleScrollToBottom();

        const uploadResults =
          files.length === 1
            ? [
                await uploadMedia({
                  token,
                  file: files[0],
                  cordigramUploadContext: "messages",
                }),
              ]
            : await uploadMediaBatch({
                token,
                files,
                cordigramUploadContext: "messages",
              });

        // Group all images into a single combined message; videos stay separate.
        const imageResults: UploadMediaResponse[] = [];
        const videoResults: { media: UploadMediaResponse; loadingMsgId: string }[] = [];
        const audioResults: { media: UploadMediaResponse; loadingMsgId: string }[] = [];
        for (let i = 0; i < uploadResults.length; i++) {
          const media = uploadResults[i];
          const sourceFile = files[i];
          if (media.resourceType === "image") {
            imageResults.push(media);
          } else if (sourceFile.type.startsWith("audio/")) {
            audioResults.push({ media, loadingMsgId: loadingMessages[i].id });
          } else if (media.resourceType === "video" || sourceFile.type.startsWith("video/")) {
            videoResults.push({ media, loadingMsgId: loadingMessages[i].id });
          }
        }

        // Send grouped images as ONE message (URLs separated by newline)
        if (imageResults.length > 0) {
          const combinedText = imageResults
            .map((m) => `📷 [Image]: ${m.url}`)
            .join("\n");
          const combinedUrls = imageResults.map((m) => m.url);
          const firstLoadingId = loadingMessages[0].id;

          const finalMessage: UIMessage = {
            id: `temp-${Date.now()}-img-group`,
            text: combinedText,
            senderId: currentUserId,
            senderEmail: "",
            senderDisplayName: selfMessagingIdentity.displayName || undefined,
            senderName: selfMessagingIdentity.chatUsername || "",
            senderAvatar: selfMessagingIdentity.avatar,
            timestamp: new Date(),
            isFromCurrentUser: true,
            type: selectedDirectMessageFriend ? "direct" : "server",
          };

          // Remove ALL image loading placeholders and insert one final message
          const imageLoadingIds = new Set(
            loadingMessages
              .slice(0, imageResults.length)
              .map((m) => m.id),
          );

          if (selectedDirectMessageFriend) {
            setMessages((prev) => {
              const filtered = prev.filter((m) => !imageLoadingIds.has(m.id));
              const idx = prev.findIndex((m) => m.id === firstLoadingId);
              const insertAt = Math.max(0, idx >= 0 ? idx : filtered.length);
              return [
                ...filtered.slice(0, insertAt),
                finalMessage,
                ...filtered.slice(insertAt),
              ];
            });
            setConversations((prev) => {
              const newMap = new Map(prev);
              const current = newMap.get(selectedDirectMessageFriend._id) || [];
              const filtered = current.filter((m) => !imageLoadingIds.has(m.id));
              newMap.set(selectedDirectMessageFriend._id, [...filtered, finalMessage]);
              return newMap;
            });
            emitSendMessage(
              selectedDirectMessageFriend._id,
              combinedText,
              combinedUrls,
            );
          } else if (selectedChannel) {
            setMessages((prev) => {
              const filtered = prev.filter((m) => !imageLoadingIds.has(m.id));
              return [...filtered, finalMessage];
            });
            await serversApi.createMessage(selectedChannel, combinedText);
          }
        }

        // Send videos individually (unchanged)
        for (const { media, loadingMsgId } of videoResults) {
          const mediaMessage = `🎬 [Video]: ${media.url}`;
          const finalMessage: UIMessage = {
            id: `temp-${Date.now()}-${loadingMsgId}`,
            text: mediaMessage,
            senderId: currentUserId,
            senderEmail: "",
            senderDisplayName: selfMessagingIdentity.displayName || undefined,
            senderName: selfMessagingIdentity.chatUsername || "",
            senderAvatar: selfMessagingIdentity.avatar,
            timestamp: new Date(),
            isFromCurrentUser: true,
            type: selectedDirectMessageFriend ? "direct" : "server",
          };

          if (selectedDirectMessageFriend) {
            setMessages((prev) =>
              prev.map((m) => (m.id === loadingMsgId ? finalMessage : m)),
            );
            setConversations((prev) => {
              const newMap = new Map(prev);
              const current = newMap.get(selectedDirectMessageFriend._id) || [];
              newMap.set(
                selectedDirectMessageFriend._id,
                current.map((m) => (m.id === loadingMsgId ? finalMessage : m)),
              );
              return newMap;
            });
            emitSendMessage(selectedDirectMessageFriend._id, mediaMessage, [
              media.url,
            ]);
          } else if (selectedChannel) {
            setMessages((prev) =>
              prev.map((m) => (m.id === loadingMsgId ? finalMessage : m)),
            );
            await serversApi.createMessage(selectedChannel, mediaMessage);
          }
        }

        for (const { media, loadingMsgId } of audioResults) {
          const mediaMessage = `🎵 [Audio]: ${media.url}`;
          const finalMessage: UIMessage = {
            id: `temp-${Date.now()}-${loadingMsgId}`,
            text: mediaMessage,
            senderId: currentUserId,
            senderEmail: "",
            senderDisplayName: selfMessagingIdentity.displayName || undefined,
            senderName: selfMessagingIdentity.chatUsername || "",
            senderAvatar: selfMessagingIdentity.avatar,
            timestamp: new Date(),
            isFromCurrentUser: true,
            type: selectedDirectMessageFriend ? "direct" : "server",
          };

          if (selectedDirectMessageFriend) {
            setMessages((prev) =>
              prev.map((m) => (m.id === loadingMsgId ? finalMessage : m)),
            );
            setConversations((prev) => {
              const newMap = new Map(prev);
              const current = newMap.get(selectedDirectMessageFriend._id) || [];
              newMap.set(
                selectedDirectMessageFriend._id,
                current.map((m) => (m.id === loadingMsgId ? finalMessage : m)),
              );
              return newMap;
            });
            emitSendMessage(selectedDirectMessageFriend._id, mediaMessage, [
              media.url,
            ]);
          } else if (selectedChannel) {
            setMessages((prev) =>
              prev.map((m) => (m.id === loadingMsgId ? finalMessage : m)),
            );
            await serversApi.createMessage(selectedChannel, mediaMessage);
          }
        }
      } catch (error: any) {
        console.error("❌ Failed to upload files:", error);
        setError(
          mapMessagingUploadErrorMessage(error?.message || "", {
            t: (key) => t(key),
            maxUploadBytes,
          }),
        );
      }
    },
    [
      maxUploadBytes,
      currentUserId,
      selfMessagingIdentity.displayName,
      selfMessagingIdentity.chatUsername,
      selfMessagingIdentity.avatar,
      selectedDirectMessageFriend,
      selectedChannel,
      token,
      emitSendMessage,
      t,
    ],
  );

  // Handle media upload (image / video / audio only)
  const handleFileUpload = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = "image/*,video/*,audio/*";
    input.onchange = async (e: any) => {
      const files: File[] = Array.from(e.target.files || []);
      await handleMediaFilesSelected(files);
    };
    input.click();
  };

  // Get video duration helper
  const getVideoDuration = (file: File): Promise<number> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement("video");
      video.preload = "metadata";

      video.onloadedmetadata = () => {
        window.URL.revokeObjectURL(video.src);
        resolve(video.duration);
      };

      video.onerror = () => {
        reject(new Error("Không tải được video"));
      };

      video.src = URL.createObjectURL(file);
    });
  };

  // Poll handlers
  const handleCreatePoll = () => {
    setShowPlusMenu(false);
    setShowCreatePollModal(true);
  };

  const handleAddPollOption = () => {
    setPollOptions([...pollOptions, ""]);
  };

  const handleRemovePollOption = (index: number) => {
    if (pollOptions.length > 2) {
      setPollOptions(pollOptions.filter((_, i) => i !== index));
    }
  };

  const handlePollOptionChange = (index: number, value: string) => {
    const newOptions = [...pollOptions];
    newOptions[index] = value;
    setPollOptions(newOptions);
  };

  const handleSubmitPoll = async () => {
    try {
      // Validate
      if (!pollQuestion.trim()) {
        setError("Vui lòng nhập câu hỏi");
        return;
      }

      const validOptions = pollOptions.filter((opt) => opt.trim());
      if (validOptions.length < 2) {
        setError("Cần ít nhất 2 phương án trả lời");
        return;
      }

      // ✅ FIX: Close modal immediately for better UX
      setShowCreatePollModal(false);

      // ✅ FIX: Show loading message
      const loadingMessage: UIMessage = {
        id: `temp-poll-${Date.now()}`,
        text: `📊 Creating poll...`,
        senderId: currentUserId,
        senderEmail: "",
        senderDisplayName: selfMessagingIdentity.displayName || undefined,
        senderName: selfMessagingIdentity.chatUsername || "",
        senderAvatar: selfMessagingIdentity.avatar,
        timestamp: new Date(),
        isFromCurrentUser: true,
        type: selectedDirectMessageFriend ? "direct" : "server",
      };

      if (selectedDirectMessageFriend) {
        setMessages((prev) => [...prev, loadingMessage]);
        setConversations((prev) => {
          const newMap = new Map(prev);
          const current = newMap.get(selectedDirectMessageFriend._id) || [];
          newMap.set(selectedDirectMessageFriend._id, [
            ...current,
            loadingMessage,
          ]);
          return newMap;
        });
      } else if (selectedChannel) {
        setMessages((prev) => appendServerMessage(prev, loadingMessage));
      }

      prepareScrollToLatest();
      scheduleScrollToBottom();

      // Create poll in background
      const poll = await createPoll({
        token,
        question: pollQuestion,
        options: validOptions,
        durationHours: pollDuration,
        allowMultipleAnswers: pollAllowMultiple,
      });

      // Send poll as message
      const pollMessage = `📊 [Poll]: ${poll._id}`;
      // ✅ FIX: Replace loading message with actual poll
      const finalMessage: UIMessage = {
        id: `temp-${Date.now()}`,
        text: pollMessage,
        senderId: currentUserId,
        senderEmail: "",
        senderDisplayName: selfMessagingIdentity.displayName || undefined,
        senderName: selfMessagingIdentity.chatUsername || "",
        senderAvatar: selfMessagingIdentity.avatar,
        timestamp: new Date(),
        isFromCurrentUser: true,
        type: selectedDirectMessageFriend ? "direct" : "server",
      };

      if (selectedDirectMessageFriend) {
        setMessages((prev) =>
          prev.map((m) => (m.id === loadingMessage.id ? finalMessage : m)),
        );
        setConversations((prev) => {
          const newMap = new Map(prev);
          const current = newMap.get(selectedDirectMessageFriend._id) || [];
          newMap.set(
            selectedDirectMessageFriend._id,
            current.map((m) => (m.id === loadingMessage.id ? finalMessage : m)),
          );
          return newMap;
        });
        emitSendMessage(selectedDirectMessageFriend._id, pollMessage, []);
      } else if (selectedChannel) {
        setMessages((prev) =>
          prev.map((m) => (m.id === loadingMessage.id ? finalMessage : m)),
        );
        await serversApi.createMessage(selectedChannel, pollMessage);
      }

      // Reset form
      setPollQuestion("");
      setPollOptions(["", ""]);
      setPollDuration(24);
      setPollAllowMultiple(false);
    } catch (error: any) {
      console.error("❌ Failed to create poll:", error);
      setError(error?.message || "Không tạo được khảo sát");
    }
  };

  const handleCancelPoll = () => {
    setShowCreatePollModal(false);
    setPollQuestion("");
    setPollOptions(["", ""]);
    setPollDuration(24);
    setPollAllowMultiple(false);
  };

  useEffect(() => {
    if (!selectedServer || !token) {
      prevSelectedServerForMyPermsRef.current = null;
      setCurrentServerPermissions(null);
      setCurrentServerPermissionsForId(null);
      return;
    }
    if (isAdminView && adminViewServerId && selectedServer === adminViewServerId) {
      prevSelectedServerForMyPermsRef.current = selectedServer;
      setCurrentServerPermissions(null);
      setCurrentServerPermissionsForId(null);
      return;
    }
    if (prevSelectedServerForMyPermsRef.current !== selectedServer) {
      prevSelectedServerForMyPermsRef.current = selectedServer;
      setCurrentServerPermissions(null);
      setCurrentServerPermissionsForId(null);
    }
    let cancelled = false;
    serversApi
      .getCurrentUserPermissions(selectedServer)
      .then((p) => {
        if (!cancelled) {
          setCurrentServerPermissions(p);
          setCurrentServerPermissionsForId(selectedServer);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCurrentServerPermissions(null);
          setCurrentServerPermissionsForId(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedServer, token, isAdminView, adminViewServerId]);

  const serverPermissionsReady =
    Boolean(selectedServer) &&
    currentServerPermissionsForId === selectedServer &&
    currentServerPermissions != null;

  const canCreateInviteOnCurrentServer = Boolean(
    serverPermissionsReady &&
      (currentServerPermissions?.canCreateInvite ||
        currentServerPermissions?.isOwner),
  );

  const showInviteServerBtn =
    !serverPermissionsReady || canCreateInviteOnCurrentServer;

  useEffect(() => {
    if (!currentUserId || !selectedServer) return;
    const sp = sidebarPrefs.getServerPrefs(currentUserId, selectedServer);
    if (sp.serverNotify) setServerNotificationLevel(sp.serverNotify);
  }, [currentUserId, selectedServer, sidebarPrefsTick]);

  useEffect(() => {
    if (!selectedServer || !token) {
      setNotificationRoleNames([]);
      return;
    }
    const isAdminViewedServer = Boolean(isAdminView && adminViewServerId && selectedServer === adminViewServerId);
    if (isAdminViewedServer) {
      setNotificationRoleNames([]);
      return;
    }
    let cancelled = false;
    serversApi
      .getRoles(selectedServer)
      .then((roles) => {
        if (cancelled) return;
        setNotificationRoleNames(roles.filter((r) => !r.isDefault).map((r) => r.name));
      })
      .catch(() => {
        if (!cancelled) setNotificationRoleNames([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedServer, token, isAdminView, adminViewServerId]);

  const selectedServerEntity = useMemo(
    () => servers.find((s) => s._id === selectedServer),
    [servers, selectedServer],
  );

  const selectedDmPeerId = selectedDirectMessageFriend?._id;
  const isSamePeerCallBlocked = useMemo(() => {
    if (!selectedDmPeerId) return false;
    const tabId = callTabIdRef.current || getCallTabId();
    if (outgoingCallsByPeer[selectedDmPeerId]) return true;
    if (activeCallTabPeers.includes(selectedDmPeerId)) return true;
    return hasForeignOutboundCallLock(tabId, selectedDmPeerId);
  }, [selectedDmPeerId, outgoingCallsByPeer, activeCallTabPeers]);

  /** Chủ server hoặc quản lý kênh — chỉnh sửa/xóa kênh & danh mục */
  const canManageChannelsStructure = useMemo(() => {
    if (!currentUserId || !selectedServerEntity) return false;
    const p = currentServerPermissions;
    if (p?.isOwner) return true;
    return Boolean(p?.canManageChannels);
  }, [currentUserId, selectedServerEntity, currentServerPermissions]);

  const canAccessPrivateChannel = useMemo(() => {
    if (!currentUserId || !selectedServerEntity) return false;
    const p = currentServerPermissions;
    if (p?.isOwner) return true;
    return !!(p?.canManageServer || p?.canManageChannels);
  }, [currentUserId, selectedServerEntity, currentServerPermissions]);

  const canManageJoinApplications = useMemo(() => {
    if (!serverPermissionsReady || !currentUserId || !selectedServerEntity) return false;
    if (currentServerPermissions?.isOwner) return true;
    return Boolean(currentServerPermissions?.canManageServer);
  }, [
    serverPermissionsReady,
    currentUserId,
    selectedServerEntity,
    currentServerPermissions,
  ]);

  const canManageEventsOnServer = useMemo(() => {
    if (!currentUserId || !selectedServerEntity) return false;
    if (currentServerPermissions?.isOwner) return true;
    return Boolean(currentServerPermissions?.canManageEvents);
  }, [currentUserId, selectedServerEntity, currentServerPermissions]);

  const ownedServersForPicker = useMemo(() => {
    if (!currentUserId) return [];
    return servers
      .filter(
        (s) =>
          String((s as any).ownerId?._id ?? (s as any).ownerId) === currentUserId,
      )
      .map((s) => ({
        id: s._id,
        name: s.name || "Máy chủ",
        avatarUrl: (s as any).avatarUrl ?? null,
      }));
  }, [servers, currentUserId]);

  const openServerSettingsFromMediaPicker = useCallback(
    async (serverId: string, section: ServerSettingsSection) => {
      const s = servers.find((x) => x._id === serverId);
      if (!s) return;
      setShowGiphyPicker(false);
      setServerSettingsTarget({
        serverId,
        serverName: s.name || "Máy chủ",
        initialSection: section,
      });
      try {
        const perms = await serversApi.getCurrentUserPermissions(serverId);
        setServerSettingsPermissions(perms);
      } catch {
        setServerSettingsPermissions(null);
      }
      try {
        const c = await serversApi.getCommunitySettings(serverId);
        setCommunityEnabled(c.enabled);
      } catch {
        setCommunityEnabled(false);
      }
      setShowServerSettingsPanel(true);
    },
    [servers],
  );

  useEffect(() => {
    setShowJoinApplicationsView(false);
  }, [selectedServer]);

  useEffect(() => {
    setShowServerProfileDropdown(false);
  }, [selectedServer]);

  useEffect(() => {
    if (!showServerProfileDropdown) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (serverProfileDropdownRef.current?.contains(target)) return;
      setShowServerProfileDropdown(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowServerProfileDropdown(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [showServerProfileDropdown]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (ev: Event) => {
      const d = (ev as CustomEvent<{ serverId: string }>).detail;
      if (!d?.serverId || d.serverId !== selectedServer || !canManageJoinApplications) return;
      setJoinApplicationsRefreshTick((x) => x + 1);
    };
    window.addEventListener("cordigram-join-application-updated", handler as EventListener);
    return () => window.removeEventListener("cordigram-join-application-updated", handler as EventListener);
  }, [selectedServer, canManageJoinApplications]);

  // Applicant: duyệt / từ chối / rút đơn — cập nhật trạng thái truy cập không cần reload trang.
  useEffect(() => {
    if (typeof window === "undefined" || !selectedServer || !currentUserId) return;
    if (isAdminView && selectedServer === adminViewServerId) return;
    const handler = (ev: Event) => {
      const d = (ev as CustomEvent<{ serverId: string; userId: string; status: string }>).detail;
      if (!d || d.serverId !== selectedServer || d.userId !== currentUserId) return;
      if (d.status !== "accepted" && d.status !== "rejected" && d.status !== "withdrawn") return;
      void serversApi.getMyServerAccessStatus(selectedServer).then(setMyServerAccessStatus).catch(() => undefined);
    };
    window.addEventListener("cordigram-join-application-updated", handler as EventListener);
    return () => window.removeEventListener("cordigram-join-application-updated", handler as EventListener);
  }, [selectedServer, currentUserId, isAdminView, adminViewServerId]);

  // Realtime: join/leave/update server without full page reload.
  useEffect(() => {
    if (typeof window === "undefined" || !currentUserId) return;
    const normalizeServers = (serversList: serversApi.Server[]): BackendServer[] =>
      serversList.map((server) => {
        const channels = server.channels as serversApi.Channel[];
        const infoChannels = channels.filter(
          (c) => c.type === "text" && c.category === "info" && !c.categoryId,
        );
        const textChannels = channels.filter(
          (c) => c.type === "text" && c.category !== "info",
        );
        const voiceChannels = channels.filter((c) => c.type === "voice");
        return {
          ...server,
          infoChannels,
          textChannels,
          voiceChannels,
        };
      });

    const onServerUpdated = (ev: Event) => {
      const d = (ev as CustomEvent<any>).detail;
      if (!d?.serverId || !d?.server) return;
      setServers((prev) =>
        prev.map((s) =>
          s._id === d.serverId
            ? {
                ...s,
                name: d.server.name ?? s.name,
                description: d.server.description ?? s.description,
                avatarUrl: d.server.avatarUrl ?? s.avatarUrl,
                bannerUrl: d.server.bannerUrl ?? s.bannerUrl,
                bannerImageUrl: d.server.bannerImageUrl ?? s.bannerImageUrl,
                bannerColor: d.server.bannerColor ?? s.bannerColor,
                memberCount:
                  typeof d.server.memberCount === "number"
                    ? d.server.memberCount
                    : s.memberCount,
              }
            : s,
        ),
      );
    };

    const onMembership = (ev: Event) => {
      const d = (ev as CustomEvent<any>).detail;
      if (!d?.serverId || !d?.userId || !d?.action) return;

      if (String(d.userId) !== String(currentUserId)) {
        if (d?.server && typeof d.server.memberCount === "number") {
          setServers((prev) =>
            prev.map((s) =>
              s._id === d.serverId ? { ...s, memberCount: d.server.memberCount } : s,
            ),
          );
        }
        return;
      }

      if (d.action === "left") {
        setServers((prev) => prev.filter((s) => s._id !== d.serverId));
        if (selectedServerRef.current === d.serverId) {
          setSelectedServer(null);
          setSelectedChannel(null);
          setInfoChannels([]);
          setTextChannels([]);
          setVoiceChannels([]);
          setAllChannels([]);
          setServerCategories([]);
          setMessages([]);
          setJoinedVoiceChannelId(null);
        }
        return;
      }

      if (d.action === "joined") {
        void serversApi
          .getMyServers()
          .then((list) => {
            setServers(normalizeServers(list));
          })
          .catch(() => undefined);
        const sid = String(d.serverId ?? "");
        if (sid && selectedServerRef.current === sid) {
          void serversApi
            .getMyServerAccessStatus(sid)
            .then(setMyServerAccessStatus)
            .catch(() => undefined);
        }
      }
    };

    window.addEventListener("cordigram-server-updated", onServerUpdated as EventListener);
    window.addEventListener(
      "cordigram-server-membership-updated",
      onMembership as EventListener,
    );

    const onInteractionSettings = (ev: Event) => {
      const d = (ev as CustomEvent<any>).detail;
      if (!d?.serverId) return;
      if (String(d.serverId) !== String(selectedServerRef.current)) return;
      const stickerEnabled = d.stickerReplyWelcomeEnabled !== false;
      setServerInteractionSettings((prev) =>
        prev
          ? {
              ...prev,
              stickerReplyWelcomeEnabled: stickerEnabled,
              systemChannelId:
                d.systemChannelId != null
                  ? String(d.systemChannelId)
                  : prev.systemChannelId,
            }
          : prev,
      );
      setMessages((prev) =>
        prev.map((m) =>
          m.messageType === "welcome"
            ? { ...m, stickerReplyWelcomeEnabled: stickerEnabled }
            : m,
        ),
      );
    };
    window.addEventListener(
      "cordigram-interaction-settings-updated",
      onInteractionSettings as EventListener,
    );

    return () => {
      window.removeEventListener(
        "cordigram-server-updated",
        onServerUpdated as EventListener,
      );
      window.removeEventListener(
        "cordigram-server-membership-updated",
        onMembership as EventListener,
      );
      window.removeEventListener(
        "cordigram-interaction-settings-updated",
        onInteractionSettings as EventListener,
      );
    };
  }, [currentUserId]);

  useEffect(() => {
    if (!selectedServer || !canManageJoinApplications) {
      setJoinAppPendingCount(0);
      return;
    }
    serversApi
      .listJoinApplications(selectedServer, "pending")
      .then((r) => setJoinAppPendingCount(r.pendingCount))
      .catch(() => setJoinAppPendingCount(0));
  }, [selectedServer, canManageJoinApplications, joinApplicationsRefreshTick]);

  // Realtime-ish refresh: avoid "must reload to see pending applications dot"
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!selectedServer || !canManageJoinApplications) return;

    let cancelled = false;
    const refetch = () => {
      serversApi
        .listJoinApplications(selectedServer, "pending")
        .then((r) => {
          if (!cancelled) setJoinAppPendingCount(r.pendingCount);
        })
        .catch(() => {
          if (!cancelled) setJoinAppPendingCount(0);
        });
    };

    // quick initial sync + polling
    refetch();
    const id = window.setInterval(refetch, 6000);

    const onFocus = () => refetch();
    const onVis = () => {
      if (document.visibilityState === "visible") refetch();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [selectedServer, canManageJoinApplications]);

  const leaveVoiceChannel = useCallback(() => {
    const vid = joinedVoiceChannelId;
    setJoinedVoiceChannelId(null);
    setVoiceChannelCallToken(null);
    setVoiceChannelCallServerUrl("");
    setVoiceChannelCallError(null);
    setVoiceMicMuted(false);
    setVoiceSoundMuted(false);
    if (vid && selectedChannel === vid) {
      setSelectedChannel(null);
    }
    if (selectedServer) void loadActiveEvents(selectedServer);
  }, [joinedVoiceChannelId, selectedChannel, selectedServer, loadActiveEvents]);

  const trySelectChannel = useCallback(
    (channelId: string) => {
      const channel = allChannels.find((c) => c._id === channelId);
      if (channel?.isPrivate && !canAccessPrivateChannel) {
        setError("Vai trò của bạn không được phép vào kênh riêng tư này");
        return;
      }
      // Apply mode: pending/rejected applicants cannot access channels yet
      if (
        myServerAccessStatus?.accessMode === "apply" &&
        (myServerAccessStatus?.status === "pending" ||
          myServerAccessStatus?.status === "rejected")
      ) {
        setSelectedChannel(null);
        setJoinedVoiceChannelId(null);
        return;
      }
      setError(null);
      setShowJoinApplicationsView(false);
      setShowExploreView(false);
      if (channel?.type === "voice") {
        setJoinedVoiceChannelId(channelId);
      }
      setMessages([]);
      loadMessagesSeqRef.current += 1;
      setSelectedChannel(channelId);
    },
    [
      allChannels,
      canAccessPrivateChannel,
      myServerAccessStatus?.accessMode,
      myServerAccessStatus?.status,
    ],
  );

  const getCategoryCollapseState = useCallback(
    (categoryId: string) => {
      if (!currentUserId || !selectedServer) return { enabled: false, collapsed: false };
      const p = sidebarPrefs.getServerPrefs(currentUserId, selectedServer).categories[categoryId];
      return { enabled: Boolean(p?.collapseUiEnabled), collapsed: Boolean(p?.collapsed) };
    },
    [currentUserId, selectedServer, sidebarPrefsTick],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!canRender) return;
    if (!currentUserId) return;
    const root = document.getElementById("cordigram-messages-root");
    if (!root) return;

    const apply = () => {
      migrateMessagesChromeStorageOnce(currentUserId);
      applyMessagesRootChromeFromStorage(root, currentUserId, getMessagesShellTheme());
    };
    apply();

    const onChrome = () => apply();
    const onShell = () => apply();
    window.addEventListener("cordigram-messages-chrome", onChrome);
    window.addEventListener("cordigram-messages-shell-theme", onShell);
    window.addEventListener("cordigram-chat-settings", onChrome);

    return () => {
      window.removeEventListener("cordigram-messages-chrome", onChrome);
      window.removeEventListener("cordigram-messages-shell-theme", onShell);
      window.removeEventListener("cordigram-chat-settings", onChrome);
      applyAccentColor("#5865F2", root);
    };
  }, [canRender, currentUserId]);

  if (!canRender) {
    return null;
  }

  const currentServer = servers.find((s) => s._id === selectedServer);
  const applyJoinServerMeta =
    (applyJoinServerId && servers.find((s) => s._id === applyJoinServerId)) || currentServer;
  isAgeRestrictedRef.current = Boolean(currentServer?.isAgeRestricted);

  const currentServerNickname = currentServer?.members?.find(
    (m) => String(m.userId) === currentUserId,
  )?.nickname;

  return (
    <ServerLanguageOverrideProvider
      enabled={serverChatLangOverrideActive}
      language={activeServerLangOverride.language}
    >
    <div
      id="cordigram-messages-root"
      className={styles.container}
      data-messages-theme={messagesShellTheme}
    >
      {passkeyRequired ? (
        <div className={styles.passkeyOverlay} role="dialog" aria-modal>
          <div className={styles.passkeyCard}>
            <h2 className={styles.passkeyTitle}>Enter passkey</h2>
            <p className={styles.passkeyDesc}>
              To access Messages on this device, please enter your 6-digit
              passkey.
            </p>
            <input
              className={styles.passkeyInput}
              type="password"
              inputMode="numeric"
              maxLength={6}
              placeholder={tMsg("channelPasswordPlaceholder")}
              value={passkeyInput}
              onChange={(e) =>
                setPasskeyInput(e.target.value.replace(/\D/g, ""))
              }
              disabled={passkeySubmitting || passkeyChecking}
            />
            {passkeyError ? (
              <p className={styles.passkeyError}>{passkeyError}</p>
            ) : null}
            <div className={styles.passkeyActions}>
              <button
                type="button"
                className={styles.passkeyButton}
                onClick={handleVerifyPasskeyGate}
                disabled={passkeySubmitting || passkeyChecking}
              >
                {passkeySubmitting ? "Đang xác minh..." : "Xác minh"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Left Sidebar - Logo & Create Group */}
      <div className={styles.leftSidebar}>
        <img
          src="/logo.png"
          alt={t("chat.messagesPage.socialHomeTitle")}
          className={styles.logoImage}
          role="button"
          tabIndex={0}
          title={t("chat.messagesPage.socialHomeTitle")}
          onClick={() => router.push("/")}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              router.push("/");
            }
          }}
          style={{ cursor: "pointer" }}
        />

        <button
          type="button"
          className={styles.socialHomeBtn}
          title={t("chat.messagesPage.messagesHomeTitle")}
          aria-label={t("chat.messagesPage.messagesHomeTitle")}
          onClick={() => {
            setJoinedVoiceChannelId(null);
            setVoiceChannelCallToken(null);
            setVoiceChannelCallServerUrl("");
            setSelectedServer(null);
            setSelectedChannel(null);
            setShowExploreView(false);
            setShowBoostUpgradeView(false);
            setShowJoinApplicationsView(false);
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
        </button>

        {!isAdminView ? (
          <button
            className={styles.createBtn}
            title={t("chat.messagesPage.createServerTitle")}
            onClick={() => setShowCreateServerModal(true)}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 5v14M5 12h14"></path>
            </svg>
          </button>
        ) : null}

        {!isAdminView ? (
          <button
            className={`${styles.exploreBtn} ${showExploreView ? styles.exploreBtnActive : ""}`}
            title={showExploreView ? t("chat.messagesPage.exploreClose") : t("chat.messagesPage.exploreTitle")}
            onClick={() => {
              setShowExploreView((prev) => {
                const next = !prev;
                if (next) {
                  setShowJoinApplicationsView(false);
                  setShowBoostUpgradeView(false);
                  setSelectedDirectMessageFriend(null);
                  setSelectedServer(null);
                  setSelectedChannel(null);
                }
                return next;
              });
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="9" />
              <path d="M14.5 9.5l-2.2 6.4-1.1-2.5-2.5-1.1 6.4-2.2z" />
            </svg>
          </button>
        ) : null}

        {/* Servers List */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          {servers.map((server) => {
            const hasAvatar = isValidAvatarUrl(server.avatarUrl);
            const initial = server.name.charAt(0).toUpperCase();
            const isAdminViewedServer = isAdminView && server._id === adminViewServerId;
            return (
              <button
                key={server._id}
                className={styles.navBtn}
                onClick={() => {
                  setShowExploreView(false);
                  setShowBoostUpgradeView(false);
                  setShowJoinApplicationsView(false);
                  setSelectedServer(server._id);
                }}
                onContextMenu={async (e) => {
                  e.preventDefault();
                  if (isAdminViewedServer) {
                    setAdminServerContextMenu({ x: e.clientX, y: e.clientY });
                    return;
                  }
                  let permissions: serversApi.CurrentUserServerPermissions | undefined;
                  try {
                    permissions = await serversApi.getCurrentUserPermissions(server._id);
                  } catch {
                    const isOwner = currentUserId !== "" && 
                      String((server as any).ownerId?._id ?? (server as any).ownerId) === currentUserId;
                    permissions = {
                      isOwner,
                      hasCustomRole: isOwner,
                      canKick: isOwner,
                      canBan: isOwner,
                      canTimeout: isOwner,
                      canManageServer: isOwner,
                      canManageChannels: isOwner,
                      canManageEvents: isOwner,
                      canManageExpressions: isOwner,
                      canCreateInvite: isOwner,
                      canChangeNickname: isOwner,
                      canManageNicknames: isOwner,
                      mentionEveryone: isOwner,
                    };
                  }
                  
                  if (permissions && typeof (permissions as any).hasCustomRole !== "boolean") {
                    try {
                      const membersResp = await serversApi.getServerMembersWithRoles(server._id);
                      const me = membersResp.members.find((m) => m.userId === currentUserId);
                      (permissions as any).hasCustomRole = Boolean(me?.roles?.length);
                    } catch {}
                  }

                  setServerContextMenu({
                    x: e.clientX,
                    y: e.clientY,
                    server,
                    permissions,
                  });
                }}
                title={server.name}
                style={{
                  opacity: selectedServer === server._id ? 1 : 0.6,
                  backgroundColor: hasAvatar
                    ? undefined
                    : selectedServer === server._id
                      ? "var(--color-primary)"
                      : "transparent",
                  backgroundImage: hasAvatar
                    ? `url(${server.avatarUrl})`
                    : undefined,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
              >
                {!hasAvatar && initial}
              </button>
            );
          })}
        </div>

        <div className={styles.sidebarFooter}>
          <button
            type="button"
            className={styles.settingsBtn}
            title={t("chat.messagesPage.settingsTitle")}
            aria-label={t("chat.messagesPage.settingsTitle")}
            onClick={() => setShowMessagesUserSettings(true)}
          >
            <span className={styles.settingsBtnIcon} aria-hidden>
              ⚙
            </span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className={styles.mainContent}>
        {/* Middle - Channels List */}
        <div className={styles.conversationsList}>
          {/* Thanh thể hiện đang ở DM hay Server + nút Hộp thư */}
          <div className={styles.contextBar}>
            <span className={styles.contextBarLabel}>
              {showExploreView && !selectedDirectMessageFriend
                ? t("chat.messagesPage.contextExplore")
                : selectedServer
                  ? (currentServer?.name ?? t("chat.messagesPage.contextServer"))
                  : t("chat.messagesPage.contextDm")}
            </span>
            <div className={styles.contextBarActions}>
              <span className={styles.inboxBtnWrap}>
                <button
                  type="button"
                  className={styles.inboxBtn}
                  onClick={() => {
                    setShowMessagesInbox(true);
                    setHasInboxNotification(false);
                  }}
                  title={t("chat.messagesPage.inboxTitle")}
                  aria-label={t("chat.messagesPage.inboxAria")}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                </button>
                {hasInboxNotification && <span className={styles.inboxDot} aria-hidden />}
              </span>
            </div>
          </div>
          <div className={styles.conversationsContainer}>
            {!selectedServer ? (
              // Main Messages Page - No Server Selected
              <>
                <div className={styles.conversationsScrollArea}>
                {/* Search: opens Discord-style message search modal */}
                <div className={styles.searchInputWrapper}>
                  <button
                    type="button"
                    className={styles.searchButton}
                    onClick={() => {
                      setMessageSearchDmConversationOnly(false);
                      setShowMessageSearch(true);
                    }}
                    title={t("chat.messagesPage.searchButtonAria")}
                    aria-label={t("chat.messagesPage.searchButtonAria")}
                  >
                    {t("chat.messagesPage.searchButtonLabel")}
                  </button>
                </div>

                <div className={styles.dmSidebarMenuList}>
                  <button
                    type="button"
                    className={styles.dmSidebarMenuEntry}
                    onClick={() => {
                      setShowBoostUpgradeView(true);
                      setShowExploreView(false);
                      setShowJoinApplicationsView(false);
                      setSelectedDirectMessageFriend(null);
                      setSelectedServer(null);
                      setSelectedChannel(null);
                    }}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M12 2l2.2 6.8H21l-5.5 4 2.1 7.2L12 16.9 6.4 20l2.1-7.2L3 8.8h6.8L12 2z" />
                    </svg>
                    <span>{t("chat.messagesPage.boostUpgrade")}</span>
                  </button>
                </div>

                {/* Direct Messages Section */}
                <div className={styles.directMessagesSection}>
                  <div className={styles.directMessagesTitleRow}>
                    <h3 className={styles.directMessagesTitle}>
                      {t("chat.messagesPage.directMessages")}
                    </h3>
                  </div>

                  {/* Friends List */}
                  <div className={styles.friendsList}>
                    {friendsForDmSidebar && friendsForDmSidebar.length > 0 ? (
                      friendsForDmSidebar.map((friend) => {
                        const initial =
                          friend.displayName?.charAt(0)?.toUpperCase() ||
                          friend.username?.charAt(0)?.toUpperCase() ||
                          "U";
                        const hue = Math.floor(Math.random() * 360);
                        const dmPref =
                          dmConversationPrefs[friend._id] ??
                          emptyDmConversationPreferences();
                        const category = dmPref.category;
                        const categoryColor = category
                          ? DM_CATEGORY_COLORS[category]
                          : null;
                        return (
                          <div
                            key={friend._id}
                            className={`${styles.friendItem} ${selectedDirectMessageFriend?._id === friend._id ? styles.active : ""}`}
                            onClick={() =>
                              handleSelectDirectMessageFriend(friend)
                            }
                            onContextMenu={(e) => openDmContextMenu(e, friend)}
                            style={{ cursor: "pointer" }}
                          >
                            <div
                              className={styles.friendAvatar}
                              style={{
                                backgroundImage: isValidAvatarUrl(
                                  friend.avatarUrl,
                                )
                                  ? `url(${friend.avatarUrl})`
                                  : `linear-gradient(${hue}deg, hsl(${hue}, 70%, 60%), hsl(${hue + 60}, 70%, 60%))`,
                                backgroundSize: "cover",
                                backgroundPosition: "center",
                              }}
                            >
                              {!isValidAvatarUrl(friend.avatarUrl) && (
                                <span>{initial}</span>
                              )}
                            </div>
                            <div className={styles.friendInfo}>
                              <p
                                className={styles.friendName}
                                style={getDisplayNameTextStyle(friend, messagesShellTheme)}
                              >
                                {friend.displayName || friend.username}
                              </p>
                              <p className={styles.friendStatus}>
                                {categoryColor ? (
                                  <span
                                    className={styles.dmCategoryMark}
                                    style={{ color: categoryColor }}
                                    title={t(
                                      `chat.dmConversation.categories.${category}`,
                                    )}
                                    aria-label={t(
                                      `chat.dmConversation.categories.${category}`,
                                    )}
                                  >
                                    <svg
                                      viewBox="0 0 24 24"
                                      fill="currentColor"
                                      aria-hidden
                                    >
                                      <path d="M21.41 11.59l-8.59 8.59a2 2 0 0 1-2.83 0l-7.17-7.17a2 2 0 0 1 0-2.83L11.17 2.59a2 2 0 0 1 2.83 0l7.41 7.41a2 2 0 0 1 0 2.83zM5.5 7A1.5 1.5 0 1 0 5.5 4 1.5 1.5 0 0 0 5.5 7z" />
                                    </svg>
                                  </span>
                                ) : null}
                                <span className={styles.friendStatusText}>
                                  {formatDmPresenceLabel({
                                    entry: (presenceByUserId as Record<string, unknown>)?.[
                                      friend._id
                                    ] as any,
                                    t,
                                    language,
                                    fallbackLastActiveAt: friend.lastActiveAt,
                                  })}
                                </span>
                              </p>
                            </div>
                            {(dmUnreadCounts[String(friend._id)] ?? 0) > 0 &&
                              !isDmConversationMuted(
                                dmConversationPrefs[friend._id],
                              ) && (
                              <span className={styles.friendUnreadWrap}>
                                <span className={styles.dmUnreadDot} aria-hidden />
                                <span className={styles.dmUnreadBadge}>
                                  {(dmUnreadCounts[String(friend._id)] ?? 0) > 99
                                    ? "99+"
                                    : dmUnreadCounts[String(friend._id)]}
                                </span>
                              </span>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <div
                        style={{
                          padding: "20px 16px",
                          textAlign: "center",
                          color: "var(--color-text-muted)",
                          fontSize: "14px",
                        }}
                      ></div>
                    )}
                  </div>
                </div>
                </div>

                {/* Voice Controls Footer - cùng vị trí như bên server */}
                <div className={styles.voiceControls}>
                  {/* User Info */}
                  <div className={styles.userInfoSection}>
                    <div
                      className={styles.userAvatar}
                      style={{
                        backgroundImage: isValidAvatarUrl(
                          selfMessagingIdentity.avatarUrl,
                        )
                          ? `url(${selfMessagingIdentity.avatarUrl})`
                          : undefined,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                      }}
                    >
                      {!isValidAvatarUrl(selfMessagingIdentity.avatarUrl) && (
                        <span>
                          {selfMessagingIdentity.displayName
                            ?.charAt(0)
                            ?.toUpperCase() ||
                            selfMessagingIdentity.chatUsername
                              ?.charAt(0)
                              ?.toUpperCase() ||
                            "U"}
                        </span>
                      )}
                      {chatUserSettings?.sharePresence !== false ? (
                        <div className={styles.onlineStatus}></div>
                      ) : null}
                    </div>
                    <div className={styles.userTextInfo}>
                      <div
                        className={styles.userDisplayName}
                        style={getDisplayNameTextStyle(
                          selfSidebarDisplayStyleSource ?? undefined,
                          messagesShellTheme,
                        )}
                      >
                        {selfMessagingIdentity.displayName ||
                          selfMessagingIdentity.chatUsername ||
                          t("chat.messagesPage.userFallback")}
                      </div>
                      <div className={styles.userUsername}>
                        {selfMessagingIdentity.chatUsername || ""}
                      </div>
                    </div>
                  </div>

                  {/* Voice Controls */}
                  <div className={styles.voiceButtons}>
                    <button
                      type="button"
                      className={`${styles.voiceButton} ${voiceMicMuted ? styles.voiceButtonMuted : ""}`}
                      title={voiceMicMuted ? t("chat.messagesPage.micOn") : t("chat.messagesPage.micOff")}
                      onClick={() => {
                        const next = !voiceMicMuted;
                        setVoiceMicMuted(next);
                        if (voiceMuteKey) {
                          setVoiceMuteByChannel((prev) => ({
                            ...prev,
                            [voiceMuteKey]: {
                              micMuted: next,
                              soundMuted: prev[voiceMuteKey]?.soundMuted ?? false,
                            },
                          }));
                        }
                      }}
                      aria-pressed={voiceMicMuted}
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                        <line x1="12" y1="19" x2="12" y2="23"></line>
                        <line x1="8" y1="23" x2="16" y2="23"></line>
                      </svg>
                    </button>
                    <button
                      type="button"
                      className={`${styles.voiceButton} ${voiceSoundMuted ? styles.voiceButtonMuted : ""}`}
                      title={voiceSoundMuted ? t("chat.messagesPage.soundOn") : t("chat.messagesPage.soundOff")}
                      onClick={() => {
                        const next = !voiceSoundMuted;
                        setVoiceSoundMuted(next);
                        if (voiceMuteKey) {
                          setVoiceMuteByChannel((prev) => ({
                            ...prev,
                            [voiceMuteKey]: {
                              micMuted: prev[voiceMuteKey]?.micMuted ?? false,
                              soundMuted: next,
                            },
                          }));
                        }
                      }}
                      aria-pressed={voiceSoundMuted}
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                        <path d="M15.54 8.46a7 7 0 0 1 0 9.9"></path>
                        <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
                      </svg>
                    </button>
                  </div>
                </div>
              </>
            ) : (
              // Server Selected - Header (tên máy chủ + mời) + Sự kiện + Kênh Chat & Kênh đàm thoại
              <>
                <div className={styles.conversationsScrollArea}>
                {/* Server header: tên máy chủ + hồ sơ máy chủ + mời tham gia */}
                <div ref={serverProfileDropdownRef} className={styles.serverHeaderBlock}>
                  <div className={styles.serverHeader}>
                    <button
                      type="button"
                      className={`${styles.serverNameBtn} ${showServerProfileDropdown ? styles.serverNameBtnOpen : ""}`}
                      title={currentServer?.name}
                      aria-expanded={showServerProfileDropdown}
                      aria-haspopup="dialog"
                      onClick={() => setShowServerProfileDropdown((open) => !open)}
                    >
                      <span className={styles.serverNameText}>
                        {currentServer?.name || t("chat.sidebar.serverFallback")}
                      </span>
                      <svg
                        className={`${styles.serverNameChevron} ${showServerProfileDropdown ? styles.serverNameChevronOpen : ""}`}
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        aria-hidden
                      >
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </button>
                    {showInviteServerBtn && (
                    <button
                      type="button"
                      className={styles.inviteServerBtn}
                      title={t("chat.sidebar.inviteServer")}
                      onClick={() => {
                        if (currentServer)
                          setInviteToServerTarget({
                            serverId: currentServer._id,
                            serverName: currentServer.name || t("chat.sidebar.serverFallback"),
                            canCreateInvite: canCreateInviteOnCurrentServer,
                          });
                      }}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                    </button>
                    )}
                  </div>
                  {showServerProfileDropdown && currentServer && (
                    <ServerProfileDropdown
                      server={currentServer}
                      canManageProfile={canManageJoinApplications}
                      canCreateInvite={currentServerPermissions?.canCreateInvite ?? Boolean(currentServerPermissions?.isOwner)}
                      onEditProfile={() => {
                        setShowServerProfileDropdown(false);
                        void openServerSettingsFromMediaPicker(currentServer._id, "profile");
                      }}
                      onInvite={() => {
                        setShowServerProfileDropdown(false);
                        setInviteToServerTarget({
                          serverId: currentServer._id,
                          serverName: currentServer.name || t("chat.sidebar.serverFallback"),
                          canCreateInvite: canCreateInviteOnCurrentServer,
                        });
                      }}
                    />
                  )}
                </div>
                {/* Sự kiện đang diễn ra - hiển thị bên trên Sự kiện khi đến đúng thời gian */}
                {activeServerEvents.length > 0 && (
                  <div className={styles.activeEventsBlock}>
                    {activeServerEvents.map((ev) => (
                      <div key={ev._id} className={styles.activeEventCard}>
                        <div className={styles.activeEventHeader}>
                          <span className={styles.activeEventLive}>
                            <span className={styles.activeEventDot} />
                            {t("chat.sidebar.liveEvent")}
                          </span>
                          <button
                            type="button"
                            className={styles.activeEventDismiss} 
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveServerEvents((prev) => prev.filter((x) => x._id !== ev._id));
                            }}
                            aria-label={t("chat.sidebar.closeAria")}>
                            ×
                          </button>
                        </div>
                        <div className={styles.activeEventTitle}>{ev.topic}</div>
                        <div className={styles.activeEventLocation}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                            <circle cx="12" cy="10" r="3" />
                          </svg>
                          <span>
                            {currentServer?.name}
                            {ev.channelId ? ` · # ${ev.channelId.name}` : ""}
                          </span>
                        </div>
                        <button
                          type="button"
                          className={styles.activeEventDetailBtn}
                          onClick={() => setSelectedEventDetail(ev)}
                        >
                          {t("chat.sidebar.eventDetail")}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {/* Sự Kiện - mở popup sự kiện */}
                <button
                  type="button"
                  className={styles.serverMenuItem}
                  onClick={() => {
                    setShowEventsPopup(true);
                    if (selectedServer) loadActiveEvents(selectedServer);
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  <span>{t("chat.sidebar.events")}</span>
                  {serverEventsTotalCount > 0 && (
                    <span className={styles.eventCountBadge}>{serverEventsTotalCount} {t("chat.sidebar.events")}</span>
                  )}
                </button>
                {canManageJoinApplications && selectedServer && (
                  <button
                    type="button"
                    className={`${styles.serverMenuItem} ${showJoinApplicationsView ? styles.serverMenuItemActive : ""}`}
                    onClick={() => {
                      setShowExploreView(false);
                      setShowJoinApplicationsView(true);
                      setSelectedChannel(null);
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                    <span>{t("chat.sidebar.members")}</span>
                    {joinAppPendingCount > 0 && (
                      <span
                        style={{
                          marginLeft: "auto",
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: "var(--color-panel-danger)",
                          flexShrink: 0,
                        }}
                      />
                    )}
                  </button>
                )}
                {/* Thông Tin section - only shown when info channels exist */}
                {visibleChannelsIfHideMuted(infoChannels).length > 0 && (() => {
                  const infoCatId = infoChannels.find(c => c.categoryId)?.categoryId;
                  const infoCat = infoCatId ? serverCategories.find(c => c._id === infoCatId) : null;
                  const infoCollapse = infoCat ? getCategoryCollapseState(infoCat._id) : { enabled: false, collapsed: false };
                  const hideInfoChannels = infoCollapse.enabled && infoCollapse.collapsed;
                  const infoChannelsVisible = visibleChannelsIfHideMuted(infoChannels);
                  return (
                  <div className={styles.section}>
                    <div
                      className={styles.sectionHeader}
                      style={{ display: "flex", alignItems: "center", gap: 6 }}
                      onContextMenu={infoCat ? (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setCategoryContextMenu({ x: e.clientX, y: e.clientY, category: { _id: infoCat._id, name: infoCat.name } });
                      } : undefined}
                    >
                      {infoCat && infoCollapse.enabled && currentUserId && selectedServer && (
                        <button
                          type="button"
                          title={infoCollapse.collapsed ? t("chat.sidebar.expandCategory") : t("chat.sidebar.collapseCategory")}
                          aria-label={infoCollapse.collapsed ? t("chat.sidebar.expand") : t("chat.sidebar.collapse")}
                          className={styles.addChannelBtn}
                          style={{ flexShrink: 0 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            sidebarPrefs.setCategoryCollapsed(
                              currentUserId,
                              selectedServer,
                              infoCat._id,
                              !infoCollapse.collapsed,
                            );
                            bumpSidebarPrefs();
                          }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            {infoCollapse.collapsed ? <path d="M6 9l6 6 6-6" /> : <path d="M18 15l-6-6-6 6" />}
                          </svg>
                        </button>
                      )}
                      {renamingCategoryId && infoCat && renamingCategoryId === infoCat._id ? (
                        <input
                          className={styles.sectionTitle}
                          style={{ background: "var(--color-bg-input, #1e1f22)", border: "1px solid var(--color-primary)", borderRadius: "3px", padding: "0 4px", color: "inherit", font: "inherit", outline: "none", flex: 1, minWidth: 0 }}
                          autoFocus
                          value={renamingCategoryName}
                          onChange={(e) => setRenamingCategoryName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleRenameCategory(infoCat._id, renamingCategoryName);
                            if (e.key === "Escape") { renameCancelledRef.current = true; setRenamingCategoryId(null); setRenamingCategoryName(""); }
                          }}
                          onBlur={() => { if (renameCancelledRef.current) { renameCancelledRef.current = false; return; } handleRenameCategory(infoCat._id, renamingCategoryName); }}
                        />
                      ) : (
                        <h3 className={styles.sectionTitle} style={{ flex: 1, margin: 0 }}>{infoCat?.name ? translateCategoryName(infoCat.name, language) : t("chat.sidebar.infoFallback")}</h3>
                      )}
                    </div>
                    {!hideInfoChannels && infoChannelsVisible.map((channel) => (
                      <div
                        key={channel._id}
                        className={`${styles.conversationItem} ${
                          selectedChannel === channel._id ? styles.active : ""
                        }`}
                        onClick={() => trySelectChannel(channel._id)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setChannelContextMenu({ x: e.clientX, y: e.clientY, channel: { _id: channel._id, name: channel.name, isDefault: channel.isDefault }, categoryId: channel.categoryId ?? null });
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%" }}>
                          {channel.isRulesChannel ? (
                            <span title={t("chat.sidebar.rulesChannel")} style={{ fontSize: "16px", flexShrink: 0 }}>
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.7 }}>
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 9h-2v6h2v-6zm0-4h-2v2h2V7z" />
                              </svg>
                            </span>
                          ) : (
                            <span style={{ fontSize: "18px" }}>#</span>
                          )}
                          <span style={{ fontSize: "18px" }}>{translateChannelName(channel.name, language)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  );
                })()}

                {/* Dynamic categories with drag-and-drop */}
                {(() => {
                  const visibleCategories = serverCategories;
                  return visibleCategories.length > 0 ? (
                  <>
                  {visibleCategories.map((cat) => {
                    const channelsInCat = visibleChannelsIfHideMuted(getChannelsForCategory(cat._id));
                    const isVoiceCategory = cat.type === "voice";
                    const isCatDragging = dragType === "category" && dragId === cat._id;
                    const isCatDropTarget = dragType === "category" && dragOverId === cat._id && dragId !== cat._id;
                    const isChannelDropOnCat = dragType === "channel" && dragOverCategoryId === cat._id;
                    const catCollapse = getCategoryCollapseState(cat._id);
                    const hideCatChannels = catCollapse.enabled && catCollapse.collapsed;
                    return (
                      <div
                        key={cat._id}
                        className={`${styles.section} ${isCatDragging ? styles.dragging : ""}`}
                        draggable={canDragChannels}
                        onDragStart={(e) => { e.stopPropagation(); handleCategoryDragStart(e, cat._id); }}
                        onDragOver={(e) => {
                          handleCategoryDragOver(e, cat._id);
                          if (dragType === "channel") { e.preventDefault(); setDragOverCategoryId(cat._id); }
                        }}
                        onDrop={(e) => {
                          if (dragType === "category") handleCategoryDrop(e, cat._id);
                          else if (dragType === "channel") handleCategoryBodyDrop(e, cat._id);
                        }}
                        onDragEnd={handleDragEnd}
                        style={{ position: "relative" }}
                      >
                        {isCatDropTarget && dragPosition === "before" && (
                          <div className={styles.dropIndicator} style={{ top: 0 }} />
                        )}
                        <div
                          className={styles.sectionHeader}
                          style={{
                            cursor: canDragChannels ? "grab" : "default",
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setCategoryContextMenu({ x: e.clientX, y: e.clientY, category: { _id: cat._id, name: cat.name } });
                          }}
                        >
                          {catCollapse.enabled && currentUserId && selectedServer && (
                            <button
                              type="button"
                              title={catCollapse.collapsed ? tMsg("expandCategory") : tMsg("collapseCategory")}
                              aria-label={catCollapse.collapsed ? tMsg("expandCategory") : tMsg("collapseCategory")}
                              className={styles.addChannelBtn}
                              style={{ flexShrink: 0 }}
                              onClick={(e) => {
                                e.stopPropagation();
                                sidebarPrefs.setCategoryCollapsed(
                                  currentUserId,
                                  selectedServer,
                                  cat._id,
                                  !catCollapse.collapsed,
                                );
                                bumpSidebarPrefs();
                              }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                {catCollapse.collapsed ? <path d="M6 9l6 6 6-6" /> : <path d="M18 15l-6-6-6 6" />}
                              </svg>
                            </button>
                          )}
                          {renamingCategoryId === cat._id ? (
                            <input
                              className={styles.sectionTitle}
                              style={{ background: "var(--color-bg-input, #1e1f22)", border: "1px solid var(--color-primary)", borderRadius: "3px", padding: "0 4px", color: "inherit", font: "inherit", outline: "none", flex: 1, minWidth: 0 }}
                              autoFocus
                              value={renamingCategoryName}
                              onChange={(e) => setRenamingCategoryName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleRenameCategory(cat._id, renamingCategoryName);
                                if (e.key === "Escape") { renameCancelledRef.current = true; setRenamingCategoryId(null); setRenamingCategoryName(""); }
                              }}
                              onBlur={() => { if (renameCancelledRef.current) { renameCancelledRef.current = false; return; } handleRenameCategory(cat._id, renamingCategoryName); }}
                            />
                          ) : (
                            <h3 className={styles.sectionTitle} style={{ flex: 1, margin: 0 }}>{translateCategoryName(cat.name, language)}</h3>
                          )}
                          <button
                            type="button"
                            className={styles.addChannelBtn}
                            title={isVoiceCategory ? t("chat.sidebar.createVoiceChannel") : t("chat.sidebar.createTextChannel")}
                            onClick={() => openCreateChannelModal(isVoiceCategory ? "voice" : "text", cat.name, cat._id)}
                          >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M12 5v14M5 12h14" />
                            </svg>
                          </button>
                        </div>
                        <div
                          className={styles.categoryChannelList}
                          style={{
                            display: hideCatChannels ? "none" : undefined,
                            minHeight: isChannelDropOnCat && channelsInCat.length === 0 ? "32px" : undefined,
                            background: isChannelDropOnCat && channelsInCat.length === 0 ? "var(--color-bg-hover)" : undefined,
                            borderRadius: "4px",
                            transition: "background 0.15s ease",
                          }}
                        >
                          {channelsInCat.map((channel) => {
                            const isVoice = channel.type === "voice";
                            const isSelected =
                              selectedChannel === channel._id || joinedVoiceChannelId === channel._id;
                            const isChDragging = dragType === "channel" && dragId === channel._id;
                            const isChDropTarget = dragType === "channel" && dragOverId === channel._id && dragId !== channel._id;
                            if (isVoice) {
                              const participantsInChannel = voiceChannelParticipants[channel._id] ?? [];
                              return (
                                <div
                                  key={channel._id}
                                  className={`${styles.voiceChannelWrap} ${isChDragging ? styles.dragging : ""}`}
                                  draggable={canDragChannels}
                                  onDragStart={(e) => { e.stopPropagation(); handleChannelDragStart(e, channel._id); }}
                                  onDragOver={(e) => { e.stopPropagation(); handleChannelDragOver(e, channel._id, cat._id); }}
                                  onDrop={(e) => handleChannelDrop(e, channel._id, cat._id)}
                                  onDragEnd={handleDragEnd}
                                  style={{ position: "relative" }}
                                >
                                  {isChDropTarget && dragPosition === "before" && <div className={styles.dropIndicator} style={{ top: 0 }} />}
                                  <div
                                    className={`${styles.conversationItem} ${isSelected ? styles.active : ""}`}
                                    onClick={() => trySelectChannel(channel._id)}
                                    onContextMenu={(e) => {
                                      e.preventDefault();
                                      setChannelContextMenu({ x: e.clientX, y: e.clientY, channel: { _id: channel._id, name: channel.name, isDefault: channel.isDefault }, categoryId: channel.categoryId ?? null });
                                    }}
                                  >
                                    <div className={styles.voiceChannelRow}>
                                      <span className={`${styles.voiceChannelIconSidebar} ${isSelected ? styles.voiceChannelIconActive : ""}`}>
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                          <path d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" />
                                          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                                          <line x1="12" y1="19" x2="12" y2="23" stroke="currentColor" strokeWidth="2" />
                                          <line x1="8" y1="23" x2="16" y2="23" stroke="currentColor" strokeWidth="2" />
                                        </svg>
                                      </span>
                                      <span>{translateChannelName(channel.name, language)}</span>
                                    </div>
                                  </div>
                                  {participantsInChannel.length > 0 && (
                                    <div className={styles.voiceChannelParticipants} aria-label="Người đang trong kênh thoại">
                                      <div className={styles.voiceChannelParticipantsLabel}>Đang trong kênh</div>
                                      {participantsInChannel.map((p) => (
                                        <div key={p.identity} className={styles.voiceChannelParticipant}>
                                          <div className={styles.voiceChannelParticipantAvatar} style={{ backgroundColor: "var(--color-primary)", backgroundSize: "cover", backgroundPosition: "center" }}>
                                            <span>{(p.name || "?").charAt(0).toUpperCase()}</span>
                                          </div>
                                          <span className={styles.voiceChannelParticipantName}>{p.name}</span>
                                          <div className={styles.voiceChannelParticipantIcons}>
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /><line x1="2" y1="2" x2="22" y2="22" /></svg>
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 18v-6a9 9 0 0 1 18 0v6" /><path d="M21 19a2 2 0 0 1-2 2h-1v-4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v4H5a2 2 0 0 1-2-2v-5" /><line x1="2" y1="2" x2="22" y2="22" /></svg>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  {isChDropTarget && dragPosition === "after" && <div className={styles.dropIndicator} style={{ bottom: 0 }} />}
                                </div>
                              );
                            }
                            return (
                              <div
                                key={channel._id}
                                className={`${styles.channelDragItem} ${isChDragging ? styles.dragging : ""}`}
                                draggable={canDragChannels}
                                onDragStart={(e) => { e.stopPropagation(); handleChannelDragStart(e, channel._id); }}
                                onDragOver={(e) => { e.stopPropagation(); handleChannelDragOver(e, channel._id, cat._id); }}
                                onDrop={(e) => handleChannelDrop(e, channel._id, cat._id)}
                                onDragEnd={handleDragEnd}
                                style={{ position: "relative" }}
                              >
                                {isChDropTarget && dragPosition === "before" && <div className={styles.dropIndicator} style={{ top: 0 }} />}
                                <div
                                  className={`${styles.conversationItem} ${isSelected ? styles.active : ""}`}
                                  onClick={() => trySelectChannel(channel._id)}
                                  onContextMenu={(e) => {
                                    e.preventDefault();
                                    setChannelContextMenu({ x: e.clientX, y: e.clientY, channel: { _id: channel._id, name: channel.name, isDefault: channel.isDefault }, categoryId: channel.categoryId ?? null });
                                  }}
                                  style={{ cursor: canDragChannels ? "grab" : "pointer" }}
                                >
                                  <div style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%" }}>
                                    {channel.isRulesChannel ? (
                                      <span title={t("chat.sidebar.rulesChannel")} style={{ fontSize: "16px", flexShrink: 0 }}>
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.7 }}>
                                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 9h-2v6h2v-6zm0-4h-2v2h2V7z" />
                                        </svg>
                                      </span>
                                    ) : (
                                      <span style={{ fontSize: "18px" }}>#</span>
                                    )}
                                    <span style={{ fontSize: "18px" }}>{translateChannelName(channel.name, language)}</span>
                                  </div>
                                </div>
                                {isChDropTarget && dragPosition === "after" && <div className={styles.dropIndicator} style={{ bottom: 0 }} />}
                              </div>
                            );
                          })}
                        </div>
                        {channelsInCat.length === 0 && (
                          <div style={{ padding: "12px 16px", fontSize: "12px", color: "var(--color-text-muted)" }}>
                            {t("chat.sidebar.noChannels")}
                          </div>
                        )}
                        {isCatDropTarget && dragPosition === "after" && (
                          <div className={styles.dropIndicator} style={{ bottom: 0 }} />
                        )}
                      </div>
                    );
                  })}
                  {visibleChannelsIfHideMuted(getUncategorizedChannels()).length > 0 && (
                    <div className={styles.section}>
                      <div
                        className={styles.sectionHeader}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setCategoryContextMenu({
                            x: e.clientX,
                            y: e.clientY,
                            category: {
                              _id: UNCATEGORIZED_CATEGORY_ID,
                              name: t("chat.sidebar.otherChannels"),
                            },
                          });
                        }}
                      >
                        <h3 className={styles.sectionTitle}>{t("chat.sidebar.otherChannels")}</h3>
                      </div>
                      {visibleChannelsIfHideMuted(getUncategorizedChannels()).map((channel) => (
                        <div
                          key={channel._id}
                          className={`${styles.channelDragItem} ${dragType === "channel" && dragId === channel._id ? styles.dragging : ""}`}
                          draggable={canDragChannels}
                          onDragStart={(e) => {
                            e.stopPropagation();
                            handleChannelDragStart(e, channel._id);
                          }}
                          onDragEnd={handleDragEnd}
                          style={{ position: "relative" }}
                        >
                          <div
                            className={`${styles.conversationItem} ${selectedChannel === channel._id ? styles.active : ""}`}
                            onClick={() => trySelectChannel(channel._id)}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              setChannelContextMenu({
                                x: e.clientX,
                                y: e.clientY,
                                channel: { _id: channel._id, name: channel.name, isDefault: channel.isDefault },
                                categoryId: channel.categoryId ?? null,
                              });
                            }}
                            style={{ cursor: canDragChannels ? "grab" : "pointer" }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%" }}>
                              {channel.type === "voice" ? (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0, opacity: 0.7 }}>
                                  <path d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" />
                                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                                </svg>
                              ) : channel.isRulesChannel ? (
                                <span title={t("chat.sidebar.rulesChannel")} style={{ fontSize: "16px", flexShrink: 0 }}>
                                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style={{ opacity: 0.7 }}>
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 9h-2v6h2v-6zm0-4h-2v2h2V7z" />
                                  </svg>
                                </span>
                              ) : (
                                <span style={{ fontSize: "18px" }}>#</span>
                              )}
                              <span style={{ fontSize: channel.type === "voice" ? "14px" : "18px" }}>{translateChannelName(channel.name, language)}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  </>
                ) : (
                  <>
                    <div className={styles.section}>
                      <div className={styles.sectionHeader}>
                        <h3 className={styles.sectionTitle}>{t("chat.messagesPage.sectionChat")}</h3>
                        <button type="button" className={styles.addChannelBtn} title={t("chat.sidebar.createTextChannel")} onClick={() => openCreateChannelModal("text")}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>
                        </button>
                      </div>
                      {visibleChannelsIfHideMuted(textChannels).length > 0 ? visibleChannelsIfHideMuted(textChannels).map((channel) => (
                        <div
                          key={channel._id}
                          className={`${styles.conversationItem} ${selectedChannel === channel._id ? styles.active : ""}`}
                          onClick={() => trySelectChannel(channel._id)}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            setChannelContextMenu({ x: e.clientX, y: e.clientY, channel: { _id: channel._id, name: channel.name, isDefault: channel.isDefault }, categoryId: channel.categoryId ?? null });
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%" }}>
                            <span style={{ fontSize: "18px" }}>#{translateChannelName(channel.name, language)}</span>
                          </div>
                        </div>
                      )) : (
                        <div style={{ padding: "12px 16px", fontSize: "12px", color: "var(--color-text-muted)" }}>{t("chat.sidebar.noChatChannels")}</div>
                      )}
                    </div>
                    <div className={styles.section}>
                      <div className={styles.sectionHeader}>
                        <h3 className={styles.sectionTitle}>{t("chat.messagesPage.sectionVoice")}</h3>
                        <button type="button" className={styles.addChannelBtn} title={tMsg("createVoiceChannel")} onClick={() => openCreateChannelModal("voice")}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>
                        </button>
                      </div>
                      {visibleChannelsIfHideMuted(voiceChannels).length > 0 ? visibleChannelsIfHideMuted(voiceChannels).map((channel) => (
                        <div
                          key={channel._id}
                          className={`${styles.conversationItem} ${selectedChannel === channel._id || joinedVoiceChannelId === channel._id ? styles.active : ""}`}
                          onClick={() => trySelectChannel(channel._id)}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            setChannelContextMenu({ x: e.clientX, y: e.clientY, channel: { _id: channel._id, name: channel.name, isDefault: channel.isDefault }, categoryId: channel.categoryId ?? null });
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%" }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0, opacity: 0.7 }}><path d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>
                            <span style={{ fontSize: "14px" }}>{translateChannelName(channel.name, language)}</span>
                          </div>
                        </div>
                      )) : (
                        <div style={{ padding: "12px 16px", fontSize: "12px", color: "var(--color-text-muted)" }}>{t("chat.sidebar.noVoiceChannels")}</div>
                      )}
                    </div>
                  </>
                );
                })()}
                {isAdminView && adminReturnUrl && (
                  <button
                    type="button"
                    className={styles.adminReturnBtn}
                    onClick={async () => {
                      const t = localStorage.getItem("accessToken") || "";
                      if (adminViewServerId && t) {
                        await serversApi.adminLeaveServer(adminViewServerId, t);
                      }
                      localStorage.removeItem("accessToken");
                      if (adminReturnUrl) window.location.href = adminReturnUrl;
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M19 12H5" />
                      <path d="M12 19l-7-7 7-7" />
                    </svg>
                    {t("chat.sidebar.goBackAdmin")}
                  </button>
                )}
                </div>{/* end conversationsScrollArea */}

                {/* Voice Controls Footer - cùng vị trí như bên DM */}
                <div className={styles.voiceControls}>
                  <div className={styles.userInfoSection}>
                    <div
                      className={styles.userAvatar}
                      style={{
                        backgroundImage: isValidAvatarUrl(
                          selfMessagingIdentity.avatarUrl,
                        )
                          ? `url(${selfMessagingIdentity.avatarUrl})`
                          : undefined,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                      }}
                    >
                      {!isValidAvatarUrl(selfMessagingIdentity.avatarUrl) && (
                        <span>
                          {(currentServerNickname || selfMessagingIdentity.displayName)
                            ?.charAt(0)
                            ?.toUpperCase() ||
                            selfMessagingIdentity.chatUsername
                              ?.charAt(0)
                              ?.toUpperCase() ||
                            "U"}
                        </span>
                      )}
                      {chatUserSettings?.sharePresence !== false ? (
                        <div className={styles.onlineStatus}></div>
                      ) : null}
                    </div>
                    <div className={styles.userTextInfo}>
                      <div
                        className={styles.userDisplayName}
                        style={getDisplayNameTextStyle(
                          selfSidebarDisplayStyleSource ?? undefined,
                          messagesShellTheme,
                        )}
                      >
                        {currentServerNickname ||
                          selfMessagingIdentity.displayName ||
                          selfMessagingIdentity.chatUsername ||
                          t("chat.sidebar.userFallback")}
                      </div>
                      <div className={styles.userUsername}>
                        {selfMessagingIdentity.chatUsername || ""}
                      </div>
                    </div>
                  </div>
                  <div className={styles.voiceButtons}>
                    <button
                      type="button"
                      className={`${styles.voiceButton} ${voiceMicMuted ? styles.voiceButtonMuted : ""}`}
                      title={voiceMicMuted ? t("chat.messagesPage.micOn") : t("chat.messagesPage.micOff")}
                      onClick={() => {
                        const next = !voiceMicMuted;
                        setVoiceMicMuted(next);
                        if (voiceMuteKey) {
                          setVoiceMuteByChannel((prev) => ({
                            ...prev,
                            [voiceMuteKey]: {
                              micMuted: next,
                              soundMuted: prev[voiceMuteKey]?.soundMuted ?? false,
                            },
                          }));
                        }
                      }}
                      aria-pressed={voiceMicMuted}
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                        <line x1="12" y1="19" x2="12" y2="23"></line>
                        <line x1="8" y1="23" x2="16" y2="23"></line>
                      </svg>
                    </button>
                    <button
                      type="button"
                      className={`${styles.voiceButton} ${voiceSoundMuted ? styles.voiceButtonMuted : ""}`}
                      title={voiceSoundMuted ? t("chat.messagesPage.soundOn") : t("chat.messagesPage.soundOff")}
                      onClick={() => {
                        const next = !voiceSoundMuted;
                        setVoiceSoundMuted(next);
                        if (voiceMuteKey) {
                          setVoiceMuteByChannel((prev) => ({
                            ...prev,
                            [voiceMuteKey]: {
                              micMuted: prev[voiceMuteKey]?.micMuted ?? false,
                              soundMuted: next,
                            },
                          }));
                        }
                      }}
                      aria-pressed={voiceSoundMuted}
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                        <path d="M15.54 8.46a7 7 0 0 1 0 9.9"></path>
                        <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
                      </svg>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right - Chat Area & Active Now */}
        <div className={styles.rightContent}>
          {/* Chat Area */}
          <div className={styles.chatArea}>
            {currentServer &&
            !selectedDirectMessageFriend &&
            myServerAccessStatus?.accessMode === "apply" &&
            myServerAccessStatus?.status === "pending" ? (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
                <div
                  style={{
                    width: "min(520px, 92vw)",
                    borderRadius: 14,
                    background: "rgba(9, 12, 28, 0.97)",
                    border: "1px solid rgba(124, 58, 237, 0.22)",
                    boxShadow: "0 16px 48px rgba(0,0,0,.55), 0 0 24px rgba(124,58,237,0.1)",
                    padding: 22,
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: 28, marginBottom: 10 }}>⏳</div>
                  <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 8, color: "#dde2f0" }}>
                    {t("chat.applyPending.title").replace("{server}", currentServer.name || t("chat.popups.inbox.serverFallback"))}
                  </div>
                  <div style={{ fontSize: 13, color: "#7a8db8", marginBottom: 18 }}>
                    {t("chat.applyPending.desc")}
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await serversApi.withdrawMyJoinApplication(currentServer._id);
                        await loadServers();
                        setSelectedServer(null);
                        setSelectedChannel(null);
                      } catch (e) {
                        showNoticePopup(
                          e instanceof Error
                            ? e.message
                            : t("chat.applyPending.withdrawError"),
                        );
                      }
                    }}
                    style={{
                      width: "100%",
                      border: "none",
                      borderRadius: 8,
                      padding: "10px 14px",
                      background: "linear-gradient(135deg, #ef4444 0%, #c62828 100%)",
                      color: "#fff",
                      fontWeight: 800,
                      cursor: "pointer",
                      boxShadow: "0 2px 12px rgba(239,68,68,0.35)",
                    }}
                  >
                    {t("chat.applyPending.withdraw")}
                  </button>
                </div>
              </div>
            ) : showExploreView && !selectedDirectMessageFriend ? (
              <ExploreServersView
                onClose={() => setShowExploreView(false)}
                onJoin={async (serverId) => {
                  try {
                    const opened = await openApplyJoinModalIfNeeded(serverId);
                    if (opened) return;
                    const ageCheck = await assertAgeEligibleForServer(serverId);
                    if (!ageCheck.ok) {
                      showNoticePopup(t("chat.ageRestrict.joinBlockedBody"));
                      return;
                    }
                    await serversApi.joinServer(serverId);
                    await loadServers();
                    setShowExploreView(false);
                    setSelectedServer(serverId);
                    void serversApi
                      .getMyServerAccessStatus(serverId)
                      .then(setMyServerAccessStatus)
                      .catch(() => undefined);
                  } catch (e) {
                    showNoticePopup(
                      e instanceof Error
                        ? e.message
                        : t("chat.applyPending.joinError"),
                    );
                  }
                }}
              />
            ) : showBoostUpgradeView && !selectedDirectMessageFriend ? (
              <div style={{ flex: 1, display: "flex", minHeight: 0, minWidth: 0 }}>
                <div
                  style={{
                    flex: 1,
                    minHeight: 0,
                    overflow: "auto",
                    background:
                      "radial-gradient(900px 520px at 20% -10%, color-mix(in srgb, var(--color-primary) 20%, transparent), transparent 55%), radial-gradient(900px 520px at 80% 0%, color-mix(in srgb, var(--color-primary-strong, var(--color-primary)) 14%, transparent), transparent 60%), var(--color-bg)",
                    padding: 22,
                    color: "var(--color-text)",
                  }}
                >
                  <div
                    style={{
                      width: "min(1060px, 100%)",
                      margin: "0 auto",
                      borderRadius: 18,
                      border: "1px solid var(--color-border)",
                      background: isLightMessagesUi
                        ? "linear-gradient(180deg, color-mix(in srgb, var(--color-primary) 14%, var(--color-surface)), var(--color-surface))"
                        : "linear-gradient(180deg, color-mix(in srgb, var(--color-primary) 30%, transparent), transparent)",
                      padding: "22px 18px",
                      boxShadow: isLightMessagesUi
                        ? "0 20px 60px rgba(15, 22, 41, 0.08)"
                        : "0 20px 60px rgba(2, 6, 23, 0.18)",
                      display: "grid",
                      gap: 14,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                      }}
                    >
                      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontWeight: 800 }}>
                        <button
                          type="button"
                          onClick={() => undefined}
                          style={{
                            border: isLightMessagesUi
                              ? "1px solid var(--color-border)"
                              : "1px solid rgba(255,255,255,0.12)",
                            background: isLightMessagesUi
                              ? "var(--color-surface-muted)"
                              : "rgba(255,255,255,0.08)",
                            color: "var(--color-text)",
                            padding: "6px 10px",
                            borderRadius: 10,
                            cursor: "pointer",
                            fontWeight: 900,
                          }}
                        >
                          {t("chat.boostStore.tabs.store")}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowBoostUpgradeView(false);
                          }}
                          style={{
                            border: "none",
                            background: "transparent",
                            color: "var(--color-text-muted)",
                            padding: "6px 10px",
                            borderRadius: 10,
                            cursor: "pointer",
                            fontWeight: 800,
                          }}
                          title={t("chat.boostStore.tabs.close")}
                        >
                          {t("chat.boostStore.tabs.close")}
                        </button>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        {boostStatus?.active && boostStatus?.expiresAt ? (
                          <div
                            style={{
                              fontSize: 12,
                              color: "var(--color-text-muted)",
                              fontWeight: 800,
                              padding: "6px 10px",
                              borderRadius: 999,
                              border: isLightMessagesUi
                                ? "1px solid var(--color-border)"
                                : "1px solid rgba(255,255,255,0.10)",
                              background: isLightMessagesUi
                                ? "var(--color-surface-muted)"
                                : "rgba(255,255,255,0.05)",
                            }}
                            title={t("chat.boostStore.expiresLabel")}
                          >
                            {t("chat.boostStore.expiresLabel")}:{" "}
                            {(() => {
                              const d = new Date(boostStatus.expiresAt as string);
                              return Number.isFinite(d.getTime())
                                ? d.toLocaleDateString(localeTagForLanguage(language))
                                : String(boostStatus.expiresAt);
                            })()}
                          </div>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => {
                            setBoostMode("gift");
                            setBoostModalStep("plan");
                            setBoostTier("boost");
                            setBoostBillingCycle("monthly");
                            setBoostRecipientUserId(null);
                            setBoostModalOpen(true);
                          }}
                          style={{
                            borderRadius: 999,
                            padding: "8px 12px",
                            fontSize: 12,
                            fontWeight: 900,
                            border: isLightMessagesUi
                              ? "1px solid var(--color-border)"
                              : "1px solid rgba(255,255,255,0.16)",
                            background: isLightMessagesUi
                              ? "var(--color-surface-muted)"
                              : "rgba(255,255,255,0.08)",
                            color: "var(--color-text)",
                            cursor: "pointer",
                          }}
                        >
                          {t("chat.boostStore.buttons.gift")}
                        </button>
                      </div>
                    </div>

                    <div
                      style={{
                        fontSize: 44,
                        fontWeight: 950,
                        textTransform: "uppercase",
                        lineHeight: 1.05,
                        letterSpacing: "0.02em",
                        color: "var(--color-text)",
                      }}
                    >
                      {t("chat.boostStore.heroTitle")}
                    </div>

                    <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                      <button
                        type="button"
                        onClick={() => {
                          setBoostMode("subscribe");
                          setBoostModalStep("plan");
                          setBoostTier((boostStatus?.tier as any) === "basic" ? "basic" : "boost");
                          setBoostBillingCycle("monthly");
                          setBoostRecipientUserId(null);
                          setBoostModalOpen(true);
                        }}
                        style={{
                          border: "none",
                          borderRadius: 12,
                          padding: "10px 14px",
                          fontSize: 14,
                          fontWeight: 900,
                          cursor: "pointer",
                          color: "#fff",
                          background:
                            "linear-gradient(135deg, var(--color-primary), var(--color-primary-strong, var(--color-primary)))",
                        }}
                      >
                        {boostStatus?.active
                          ? t("chat.boostStore.buttons.renew")
                          : t("chat.boostStore.buttons.subscribe")}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setBoostMode("gift");
                          setBoostModalStep("plan");
                          setBoostTier("boost");
                          setBoostBillingCycle("monthly");
                          setBoostRecipientUserId(null);
                          setBoostModalOpen(true);
                        }}
                        style={{
                          borderRadius: 12,
                          padding: "10px 14px",
                          fontSize: 14,
                          fontWeight: 900,
                          cursor: "pointer",
                          color: "var(--color-text)",
                          background: "var(--color-surface-muted)",
                          border: "1px solid var(--color-border)",
                        }}
                      >
                        {t("chat.boostStore.buttons.gift")}
                      </button>
                    </div>
                  </div>
                </div>

                {boostModalOpen ? (
                  <>
                  <div
                    role="dialog"
                    aria-modal="true"
                    onMouseDown={(e) => {
                      if (e.target === e.currentTarget) setBoostModalOpen(false);
                    }}
                    style={{
                      position: "fixed",
                      inset: 0,
                      background: isLightMessagesUi
                        ? "var(--color-overlay)"
                        : "rgba(0,0,0,0.55)",
                      display: "grid",
                      placeItems: "center",
                      padding: 24,
                      zIndex: 80,
                    }}
                  >
                    <div
                      onMouseDown={(e) => e.stopPropagation()}
                      style={{
                        width: "min(780px, 96vw)",
                        borderRadius: 16,
                        border: "1px solid var(--color-border)",
                        background: "var(--color-surface)",
                        padding: 16,
                        boxShadow: isLightMessagesUi
                          ? "0 20px 60px rgba(15, 22, 41, 0.12)"
                          : "0 20px 60px rgba(2,6,23,0.35)",
                        color: "var(--color-text)",
                        display: "grid",
                        gap: 12,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                        <div style={{ fontWeight: 950 }}>
                          {boostModalStep === "plan"
                            ? boostMode === "gift"
                              ? t("chat.boostStore.modal.giftTitle")
                              : t("chat.boostStore.modal.planTitle")
                            : t("chat.boostStore.modal.billingTitle")}
                        </div>
                        <button
                          type="button"
                          onClick={() => setBoostModalOpen(false)}
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 10,
                            border: "1px solid var(--color-border)",
                            background: "var(--color-surface-muted)",
                            cursor: "pointer",
                            fontSize: 20,
                            lineHeight: 1,
                            color: "var(--color-text)",
                          }}
                          aria-label="Close"
                        >
                          ×
                        </button>
                      </div>

                      {boostModalStep === "plan" ? (
                        <>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, alignItems: "stretch" }}>
                            {/* ── BOOST card ─────────────────────────────── */}
                            <button
                              type="button"
                              onClick={() => setBoostTier("boost")}
                              style={{
                                textAlign: "left", cursor: "pointer", fontFamily: "inherit",
                                borderRadius: 18, padding: 0, overflow: "hidden",
                                display: "flex", flexDirection: "column",
                                border: boostTier === "boost"
                                  ? "1.5px solid rgba(88,101,242,0.7)"
                                  : "1.5px solid var(--color-border)",
                                background: "var(--color-surface)",
                                boxShadow: boostTier === "boost"
                                  ? "0 0 0 1px rgba(88,101,242,0.12) inset, 0 8px 40px rgba(88,101,242,0.22)"
                                  : "0 2px 12px rgba(0,0,0,0.08)",
                                transition: "border-color 0.2s, box-shadow 0.2s",
                              }}
                            >
                              {/* Header strip — semi-transparent so adapts to any theme bg */}
                              <div style={{
                                padding: "16px 18px 14px",
                                background: "linear-gradient(135deg, rgba(88,101,242,0.38), rgba(124,58,237,0.3))",
                                borderBottom: "1px solid rgba(88,101,242,0.2)",
                                position: "relative", overflow: "hidden",
                              }}>
                                <div style={{
                                  position: "absolute", inset: 0, pointerEvents: "none",
                                  background: "radial-gradient(ellipse 110% 70% at 50% 0%, rgba(165,180,252,0.1), transparent 70%)",
                                }} />
                                {/* Rocket icon */}
                                <div style={{
                                  width: 40, height: 40, borderRadius: 12, marginBottom: 10,
                                  background: "linear-gradient(135deg, #5865f2, #7c3aed)",
                                  boxShadow: "0 0 20px rgba(88,101,242,0.5)",
                                  display: "flex", alignItems: "center", justifyContent: "center",
                                  color: "#fff", position: "relative", zIndex: 1,
                                }}>
                                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M4.5 16.5c-1.5 1.5-2 4-2 4s2.5-.5 4-2l-.5-.5A1 1 0 0 0 4.5 16.5Z"/>
                                    <path d="M12 2c-3 0-6 3-6 6 0 1.8.8 3.4 2 4.5l3.5 3.5c1.1 1.2 2.7 2 4.5 2 3 0 6-3 6-6 0-4.4-3.6-10-10-10Z"/>
                                    <circle cx="16" cy="8" r="1.5" fill="currentColor" stroke="none"/>
                                  </svg>
                                </div>
                                {/* Badge / check */}
                                {boostTier === "boost" ? (
                                  <span style={{
                                    position: "absolute", top: 12, right: 12, zIndex: 2,
                                    width: 26, height: 26, borderRadius: "50%",
                                    background: "linear-gradient(135deg, #5865f2, #7c3aed)",
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    color: "#fff", fontSize: 13, fontWeight: 900,
                                    boxShadow: "0 2px 12px rgba(88,101,242,0.55)",
                                  }}>✓</span>
                                ) : (
                                  <span style={{
                                    position: "absolute", top: 12, right: 12, zIndex: 2,
                                    padding: "3px 10px", borderRadius: 999,
                                    fontSize: 11, fontWeight: 900, letterSpacing: "0.04em",
                                    background: "linear-gradient(135deg, #facc15, #f59e0b)",
                                    color: "#1a1200", boxShadow: "0 2px 10px rgba(250,204,21,0.35)",
                                  }}>Phổ biến</span>
                                )}
                                {/* Plan name — white text always readable on the gradient header */}
                                <div style={{
                                  fontSize: 24, fontWeight: 950, marginBottom: 3,
                                  letterSpacing: "-0.02em", paddingRight: 48,
                                  color: "#fff", position: "relative", zIndex: 1,
                                  textShadow: "0 1px 4px rgba(0,0,0,0.3)",
                                }}>
                                  {t("chat.boostStore.plans.boost.name")}
                                </div>
                                {/* Price */}
                                <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(220,215,255,0.95)", position: "relative", zIndex: 1 }}>
                                  {t("chat.boostStore.plans.boost.priceMonthly")}
                                </div>
                              </div>
                              {/* Feature rows — use theme text color */}
                              <div style={{ padding: "14px 18px 16px", display: "grid", gap: 9, flex: 1, alignContent: "start" }}>
                                {[
                                  t("chat.boostStore.plans.boost.feature1"),
                                  t("chat.boostStore.plans.boost.feature2"),
                                  t("chat.boostStore.plans.boost.feature3"),
                                  t("chat.boostStore.plans.boost.feature4"),
                                  t("chat.boostStore.plans.boost.feature5"),
                                ].map((feat, i) => (
                                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
                                    <span style={{
                                      width: 18, height: 18, borderRadius: "50%", flexShrink: 0, marginTop: 1,
                                      background: "rgba(88,101,242,0.14)",
                                      border: "1.5px solid rgba(88,101,242,0.5)",
                                      display: "flex", alignItems: "center", justifyContent: "center",
                                      color: "#5865f2", fontSize: 10, fontWeight: 900, lineHeight: "1",
                                    }}>✓</span>
                                    <span style={{ fontSize: 13, color: "var(--color-text)", lineHeight: 1.45 }}>{feat}</span>
                                  </div>
                                ))}
                              </div>
                            </button>

                            {/* ── BASIC card ─────────────────────────────── */}
                            <button
                              type="button"
                              onClick={() => setBoostTier("basic")}
                              style={{
                                textAlign: "left", cursor: "pointer", fontFamily: "inherit",
                                borderRadius: 18, padding: 0, overflow: "hidden",
                                display: "flex", flexDirection: "column",
                                border: boostTier === "basic"
                                  ? "1.5px solid rgba(124,58,237,0.65)"
                                  : "1.5px solid var(--color-border)",
                                background: "var(--color-surface)",
                                boxShadow: boostTier === "basic"
                                  ? "0 0 0 1px rgba(124,58,237,0.1) inset, 0 8px 36px rgba(124,58,237,0.18)"
                                  : "0 2px 12px rgba(0,0,0,0.08)",
                                transition: "border-color 0.2s, box-shadow 0.2s",
                              }}
                            >
                              {/* Header strip */}
                              <div style={{
                                padding: "16px 18px 14px",
                                background: "linear-gradient(135deg, rgba(124,58,237,0.28), rgba(88,101,242,0.2))",
                                borderBottom: "1px solid rgba(124,58,237,0.18)",
                                position: "relative", overflow: "hidden",
                              }}>
                                {/* Star icon */}
                                <div style={{
                                  width: 40, height: 40, borderRadius: 12, marginBottom: 10,
                                  background: "rgba(124,58,237,0.45)",
                                  border: "1px solid rgba(124,58,237,0.5)",
                                  display: "flex", alignItems: "center", justifyContent: "center",
                                  color: "#e2d9f3", position: "relative", zIndex: 1,
                                }}>
                                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" opacity="0.9"/>
                                  </svg>
                                </div>
                                {/* Check */}
                                {boostTier === "basic" && (
                                  <span style={{
                                    position: "absolute", top: 12, right: 12, zIndex: 2,
                                    width: 26, height: 26, borderRadius: "50%",
                                    background: "linear-gradient(135deg, #7c3aed, #5865f2)",
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    color: "#fff", fontSize: 13, fontWeight: 900,
                                    boxShadow: "0 2px 12px rgba(124,58,237,0.5)",
                                  }}>✓</span>
                                )}
                                {/* Plan name */}
                                <div style={{
                                  fontSize: 22, fontWeight: 950, marginBottom: 3,
                                  letterSpacing: "-0.02em", color: "#fff", paddingRight: 40,
                                  position: "relative", zIndex: 1,
                                  textShadow: "0 1px 4px rgba(0,0,0,0.3)",
                                }}>
                                  {t("chat.boostStore.plans.basic.name")}
                                </div>
                                {/* Price */}
                                <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(220,215,255,0.9)", position: "relative", zIndex: 1 }}>
                                  {t("chat.boostStore.plans.basic.priceMonthly")}
                                </div>
                              </div>
                              {/* Feature rows */}
                              <div style={{ padding: "14px 18px 16px", display: "grid", gap: 9, flex: 1, alignContent: "start" }}>
                                {[
                                  t("chat.boostStore.plans.basic.feature1"),
                                  t("chat.boostStore.plans.basic.feature2"),
                                  t("chat.boostStore.plans.basic.feature3"),
                                ].map((feat, i) => (
                                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
                                    <span style={{
                                      width: 18, height: 18, borderRadius: "50%", flexShrink: 0, marginTop: 1,
                                      background: "rgba(124,58,237,0.12)",
                                      border: "1.5px solid rgba(124,58,237,0.48)",
                                      display: "flex", alignItems: "center", justifyContent: "center",
                                      color: "#7c3aed", fontSize: 10, fontWeight: 900, lineHeight: "1",
                                    }}>✓</span>
                                    <span style={{ fontSize: 13, color: "var(--color-text)", lineHeight: 1.45 }}>{feat}</span>
                                  </div>
                                ))}
                              </div>
                            </button>
                          </div>

                          {boostMode === "gift" ? (
                            <div style={{ display: "grid", gap: 10 }}>
                              <input
                                value={boostUserQuery}
                                onChange={(e) => setBoostUserQuery(e.target.value)}
                                placeholder={t("chat.boostStore.giftSearchPlaceholder")}
                                style={{
                                  width: "100%",
                                  borderRadius: 12,
                                  border: "1px solid var(--color-border)",
                                  background: "var(--color-surface)",
                                  padding: "10px 12px",
                                  fontSize: 14,
                                  color: "var(--color-text)",
                                }}
                              />

                              <div
                                style={{
                                  maxHeight: 240,
                                  overflow: "auto",
                                  display: "grid",
                                  gap: 8,
                                }}
                              >
                                {(boostUsers || [])
                                  .filter((u) => {
                                    const q = boostUserQuery.trim().toLowerCase();
                                    if (!q) return true;
                                    const a = String(u?.username ?? "").toLowerCase();
                                    const b = String(u?.displayName ?? "").toLowerCase();
                                    return a.includes(q) || b.includes(q);
                                  })
                                  .map((u) => {
                                    const id = String(u?.userId ?? u?._id ?? "");
                                    const active = id && id === boostRecipientUserId;
                                    const display =
                                      u?.displayName ||
                                      u?.username ||
                                      t("chat.boostStore.userFallback");
                                    const sub = u?.username ? `@${u.username}` : id;
                                    return (
                                      <button
                                        key={id || sub}
                                        type="button"
                                        onClick={() => setBoostRecipientUserId(id || null)}
                                        style={{
                                          width: "100%",
                                          textAlign: "left",
                                          borderRadius: 12,
                                          padding: "10px 12px",
                                          cursor: "pointer",
                                          border: active
                                            ? "1px solid color-mix(in srgb, var(--color-primary) 60%, var(--color-border) 40%)"
                                            : "1px solid var(--color-border)",
                                          background: "var(--color-surface)",
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "space-between",
                                          gap: 10,
                                        }}
                                      >
                                        <span style={{ display: "grid", gap: 2, minWidth: 0 }}>
                                          <span style={{ fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                            {display}
                                          </span>
                                          <span style={{ fontSize: 12, color: "var(--color-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                            {sub}
                                          </span>
                                        </span>
                                        <span>{active ? "✓" : ""}</span>
                                      </button>
                                    );
                                  })}
                              </div>
                            </div>
                          ) : null}

                          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                            <button
                              type="button"
                              onClick={() => setBoostModalOpen(false)}
                              style={{
                                borderRadius: 12,
                                padding: "10px 14px",
                                fontSize: 14,
                                fontWeight: 900,
                                cursor: "pointer",
                                color: "var(--color-text)",
                                background: "var(--color-surface-muted)",
                                border: "1px solid var(--color-border)",
                              }}
                            >
                              {t("chat.boostStore.actions.cancel")}
                            </button>
                            <button
                              type="button"
                              disabled={boostMode === "gift" && !boostRecipientUserId}
                              onClick={goToBoostBillingStep}
                              style={{
                                border: "none",
                                borderRadius: 12,
                                padding: "10px 14px",
                                fontSize: 14,
                                fontWeight: 900,
                                cursor: "pointer",
                                color: "#fff",
                                background:
                                  "linear-gradient(135deg, var(--color-primary), var(--color-primary-strong, var(--color-primary)))",
                                opacity: boostMode === "gift" && !boostRecipientUserId ? 0.5 : 1,
                              }}
                            >
                              {t("chat.boostStore.actions.continue")}
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                            <button
                              type="button"
                              onClick={() => setBoostBillingCycle("monthly")}
                              style={{
                                textAlign: "left",
                                borderRadius: 16,
                                padding: 14,
                                cursor: "pointer",
                                border:
                                  boostBillingCycle === "monthly"
                                    ? "1px solid color-mix(in srgb, var(--color-primary) 60%, var(--color-border) 40%)"
                                    : "1px solid var(--color-border)",
                                background:
                                  "linear-gradient(135deg, rgba(124, 58, 237, 0.12), rgba(34, 211, 238, 0.08))",
                              }}
                            >
                              <div style={{ fontSize: 22, fontWeight: 950, marginBottom: 6 }}>
                                {t("chat.boostStore.billing.monthlyTitle")}
                              </div>
                              <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
                                {t("chat.boostStore.billing.monthlySubtitle")}
                              </div>
                            </button>
                            <button
                              type="button"
                              onClick={() => setBoostBillingCycle("yearly")}
                              style={{
                                textAlign: "left",
                                borderRadius: 16,
                                padding: 14,
                                cursor: "pointer",
                                border:
                                  boostBillingCycle === "yearly"
                                    ? "1px solid color-mix(in srgb, var(--color-primary) 60%, var(--color-border) 40%)"
                                    : "1px solid var(--color-border)",
                                background:
                                  "linear-gradient(135deg, rgba(124, 58, 237, 0.12), rgba(34, 211, 238, 0.08))",
                              }}
                            >
                              <div style={{ fontSize: 22, fontWeight: 950, marginBottom: 6 }}>
                                {t("chat.boostStore.billing.yearlyTitle")}
                              </div>
                              <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
                                {t("chat.boostStore.billing.yearlySubtitle")}
                              </div>
                            </button>
                          </div>

                          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                            <button
                              type="button"
                              onClick={() => setBoostModalStep("plan")}
                              style={{
                                borderRadius: 12,
                                padding: "10px 14px",
                                fontSize: 14,
                                fontWeight: 900,
                                cursor: "pointer",
                                color: "var(--color-text)",
                                background: "var(--color-surface-muted)",
                                border: "1px solid var(--color-border)",
                              }}
                            >
                              {t("chat.boostStore.actions.back")}
                            </button>
                            <button
                              type="button"
                              disabled={boostCheckoutBusy}
                              onClick={() => void submitMessagesBoostCheckout()}
                              style={{
                                border: "none",
                                borderRadius: 12,
                                padding: "10px 14px",
                                fontSize: 14,
                                fontWeight: 900,
                                cursor: boostCheckoutBusy ? "wait" : "pointer",
                                color: "#fff",
                                background:
                                  "linear-gradient(135deg, var(--color-primary), var(--color-primary-strong, var(--color-primary)))",
                                opacity: boostCheckoutBusy ? 0.65 : 1,
                              }}
                            >
                              {boostCheckoutBusy
                                ? t("chat.boostStore.checkout.redirecting")
                                : t("chat.boostStore.checkout.cta")}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {boostActivePeriodWarnOpen ? (
                    <div
                      role="dialog"
                      aria-modal="true"
                      onMouseDown={(e) => {
                        if (e.target === e.currentTarget)
                          setBoostActivePeriodWarnOpen(false);
                      }}
                      style={{
                        position: "fixed",
                        inset: 0,
                        background: "rgba(0,0,0,0.78)",
                        backdropFilter: "blur(14px) saturate(140%)",
                        WebkitBackdropFilter: "blur(14px) saturate(140%)",
                        display: "grid",
                        placeItems: "center",
                        padding: 24,
                        zIndex: 90,
                      }}
                    >
                      <div
                        onMouseDown={(e) => e.stopPropagation()}
                        style={{
                          width: "min(440px, 92vw)",
                          borderRadius: 18,
                          border: "1px solid rgba(88,101,242,0.28)",
                          background: "rgba(8,6,22,0.96)",
                          backdropFilter: "blur(24px)",
                          padding: "22px 20px",
                          boxShadow: "0 0 0 1px rgba(88,101,242,0.08) inset, 0 24px 70px rgba(0,0,0,0.7), 0 0 80px rgba(88,101,242,0.08)",
                          display: "grid",
                          gap: 14,
                          color: "#fff",
                        }}
                      >
                        <div style={{ fontWeight: 950, fontSize: 17, color: "#fff", letterSpacing: "-0.01em" }}>
                          {t("chat.boostStore.warnings.activeTitle")}
                        </div>
                        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: "rgba(255,255,255,0.6)" }}>
                          {t("chat.boostStore.warnings.activeBodyPrefix")}
                          {boostStatus?.expiresAt
                            ? ` đến ${new Date(boostStatus.expiresAt).toLocaleString(localeTagForLanguage(language), {
                                dateStyle: "medium",
                                timeStyle: "short",
                              })}`
                            : ""}
                          . {t("chat.boostStore.warnings.activeBodySuffix")}
                        </p>
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 6, borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                          <button
                            type="button"
                            onClick={() => setBoostActivePeriodWarnOpen(false)}
                            style={{
                              borderRadius: 12,
                              padding: "10px 18px",
                              fontSize: 14,
                              fontWeight: 700,
                              cursor: "pointer",
                              color: "rgba(255,255,255,0.7)",
                              background: "rgba(255,255,255,0.06)",
                              border: "1.5px solid rgba(255,255,255,0.1)",
                              fontFamily: "inherit",
                            }}
                          >
                            {t("chat.boostStore.actions.abort")}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setBoostActivePeriodWarnOpen(false);
                              setBoostModalStep("billing");
                            }}
                            style={{
                              border: "none",
                              borderRadius: 12,
                              padding: "10px 22px",
                              fontSize: 14,
                              fontWeight: 800,
                              cursor: "pointer",
                              color: "#fff",
                              background: "linear-gradient(135deg, #5865f2, #7c3aed)",
                              boxShadow: "0 4px 18px rgba(88,101,242,0.45)",
                              fontFamily: "inherit",
                            }}
                          >
                            {t("chat.boostStore.actions.continue")}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {boostTierSwitchWarnOpen ? (
                    <div
                      role="dialog"
                      aria-modal="true"
                      onMouseDown={(e) => {
                        if (e.target === e.currentTarget)
                          setBoostTierSwitchWarnOpen(false);
                      }}
                      style={{
                        position: "fixed",
                        inset: 0,
                        background: "rgba(0,0,0,0.78)",
                        backdropFilter: "blur(14px) saturate(140%)",
                        WebkitBackdropFilter: "blur(14px) saturate(140%)",
                        display: "grid",
                        placeItems: "center",
                        padding: 24,
                        zIndex: 91,
                      }}
                    >
                      <div
                        onMouseDown={(e) => e.stopPropagation()}
                        style={{
                          width: "min(460px, 92vw)",
                          borderRadius: 18,
                          border: "1px solid rgba(88,101,242,0.28)",
                          background: "rgba(8,6,22,0.96)",
                          backdropFilter: "blur(24px)",
                          padding: "22px 20px",
                          boxShadow: "0 0 0 1px rgba(88,101,242,0.08) inset, 0 24px 70px rgba(0,0,0,0.7), 0 0 80px rgba(88,101,242,0.08)",
                          display: "grid",
                          gap: 14,
                          color: "#fff",
                        }}
                      >
                        <div style={{ fontWeight: 950, fontSize: 17, color: "#fff", letterSpacing: "-0.01em" }}>
                          {t("chat.boostStore.warnings.switchTitle")}
                        </div>
                        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: "rgba(255,255,255,0.6)" }}>
                          {t("chat.boostStore.warnings.switchBodyPrefix")}{" "}
                          <strong style={{ color: "#c4b5fd" }}>
                            {boostStatus?.tier === "basic"
                              ? t("chat.boostStore.plans.basic.name")
                              : boostStatus?.tier === "boost"
                                ? t("chat.boostStore.plans.boost.name")
                                : t("chat.boostStore.warnings.switchCurrentFallback")}
                          </strong>{" "}
                          {t("chat.boostStore.warnings.switchBodyMiddle")}{" "}
                          <strong style={{ color: "#a5b4fc" }}>
                            {boostTier === "basic"
                              ? t("chat.boostStore.plans.basic.name")
                              : t("chat.boostStore.plans.boost.name")}
                          </strong>
                          . {t("chat.boostStore.warnings.switchBodySuffix")}{" "}
                          <strong style={{ color: "#fff" }}>{t("chat.boostStore.warnings.switchBodyStrong")}</strong>.
                        </p>
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 6, borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                          <button
                            type="button"
                            onClick={() => setBoostTierSwitchWarnOpen(false)}
                            style={{
                              borderRadius: 12,
                              padding: "10px 18px",
                              fontSize: 14,
                              fontWeight: 700,
                              cursor: "pointer",
                              color: "rgba(255,255,255,0.7)",
                              background: "rgba(255,255,255,0.06)",
                              border: "1.5px solid rgba(255,255,255,0.1)",
                              fontFamily: "inherit",
                            }}
                          >
                            {t("chat.boostStore.actions.abort")}
                          </button>
                          <button
                            type="button"
                            disabled={boostCheckoutBusy}
                            onClick={() =>
                              void submitMessagesBoostCheckout({
                                skipTierChangeConfirm: true,
                              })
                            }
                            style={{
                              border: "none",
                              borderRadius: 12,
                              padding: "10px 22px",
                              fontSize: 14,
                              fontWeight: 800,
                              cursor: boostCheckoutBusy ? "wait" : "pointer",
                              color: "#fff",
                              background: "linear-gradient(135deg, #5865f2, #7c3aed)",
                              boxShadow: "0 4px 18px rgba(88,101,242,0.45)",
                              opacity: boostCheckoutBusy ? 0.65 : 1,
                              fontFamily: "inherit",
                            }}
                          >
                            {boostCheckoutBusy
                              ? t("chat.boostStore.checkout.redirecting")
                              : t("chat.boostStore.actions.continue")}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}
                  </>
                ) : null}
              </div>
            ) : showJoinApplicationsView && currentServer && !selectedDirectMessageFriend && serverPermissionsReady ? (
              <div style={{ flex: 1, display: "flex", minHeight: 0, minWidth: 0 }}>
                <ServerJoinApplicationsPanel
                  serverId={currentServer._id}
                  serverName={currentServer.name || "Máy chủ"}
                  ownerId={String((currentServer as any).ownerId?._id ?? (currentServer as any).ownerId ?? "")}
                  onApplicationsChanged={() => setJoinApplicationsRefreshTick((t) => t + 1)}
                />
              </div>
            ) : (selectedChannel && currentServer) ||
            selectedDirectMessageFriend ? (
              <>
                {connectedVoiceChannel && (
                  <>
                    {viewingVoiceChannel && (
                  <div className={styles.chatHeader}>
                    <div className={styles.channelHeaderStart}>
                      <span className={styles.voiceChannelIcon}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" />
                          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                          <line x1="12" y1="19" x2="12" y2="23" stroke="currentColor" strokeWidth="2" />
                          <line x1="8" y1="23" x2="16" y2="23" stroke="currentColor" strokeWidth="2" />
                        </svg>
                      </span>
                      <h2 className={styles.chatHeaderTitle}>
                        {translateChannelName(connectedVoiceChannel.name, language)}
                      </h2>
                    </div>
                  </div>
                    )}
                  <div
                    className={
                      viewingVoiceChannel ? styles.voiceCallView : styles.voiceCallOffscreen
                    }
                  >
                    <div className={styles.voiceCallVideoArea}>
                      {voiceChannelCallError ? (
                        <div className={styles.voiceCallError}>
                          <p>{voiceChannelCallError}</p>
                          <button
                            type="button"
                            className={styles.voiceCallErrorBtn}
                            onClick={leaveVoiceChannel}
                          >
                            {t("chat.voice.leaveChannel")}
                          </button>
                        </div>
                      ) : voiceChannelCallToken && voiceChannelCallServerUrl ? (
                        <VoiceChannelCall
                          token={voiceChannelCallToken}
                          serverUrl={voiceChannelCallServerUrl}
                          micMuted={voiceMicMuted}
                          soundMuted={voiceSoundMuted}
                          participantName={
                            selfMessagingIdentity.displayName ||
                            selfMessagingIdentity.chatUsername ||
                            t("chat.sidebar.userFallback")
                          }
                          onDisconnect={leaveVoiceChannel}
                        />
                      ) : (
                        <div className={styles.voiceCallConnecting}>
                          <div className={styles.voiceCallSpinner} />
                          <p>{t("chat.voice.connecting")}</p>
                        </div>
                      )}
                    </div>
                  </div>
                  </>
                )}
                {(selectedDirectMessageFriend ||
                  (selectedChatTextChannel && !viewingVoiceChannel)) && (
              <>
                {joinedVoiceChannelId && connectedVoiceChannel && !viewingVoiceChannel && (
                  <div className={styles.voiceChatBanner}>
                    <span className={styles.voiceChatBannerLabel}>
                      {t("chat.voice.inVoiceChannelBanner")} {translateChannelName(connectedVoiceChannel.name, language)}
                    </span>
                    <button type="button" className={styles.voiceChatBannerLeave} onClick={leaveVoiceChannel}>
                      {t("chat.voice.leaveChannel")}
                    </button>
                  </div>
                )}
                {/* Chat Header (DM or text channel) */}
                <div className={styles.chatHeader}>
                  <div className={styles.channelHeaderStart}>
                    <h2 className={styles.chatHeaderTitle}>
                      {selectedDirectMessageFriend
                        ? selectedDirectMessageFriend.displayName ||
                          selectedDirectMessageFriend.username
                        : `#${translateChannelName(
                            allChannels.find((c) => c._id === selectedChannel)?.name ??
                              "channel",
                            language,
                          )}`}
                    </h2>
                  </div>
                  <div className={styles.chatHeaderActions}>
                    {/* Only show call buttons for DM conversations */}
                    {selectedDirectMessageFriend && (
                      <>
                        <button
                          type="button"
                          title={t("chat.dmConversation.moreActions")}
                          aria-label={t("chat.dmConversation.moreActions")}
                          onClick={(e) =>
                            openDmContextMenu(e, selectedDirectMessageFriend)
                          }
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                            <circle cx="5" cy="12" r="2" />
                            <circle cx="12" cy="12" r="2" />
                            <circle cx="19" cy="12" r="2" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          title={t("chat.composer.voiceCall")}
                          onClick={() => handleStartCall(false)}
                          disabled={isSamePeerCallBlocked}
                        >
                          <svg
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                          </svg>
                        </button>
                        <button
                          type="button"
                          title={t("chat.composer.videoCall")}
                          onClick={() => handleStartCall(true)}
                          disabled={isSamePeerCallBlocked}
                        >
                          <svg
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <polygon points="23 7 16 12 23 17 23 7"></polygon>
                            <rect
                              x="1"
                              y="5"
                              width="15"
                              height="14"
                              rx="2"
                              ry="2"
                            ></rect>
                          </svg>
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      title={t("chat.popups.messageSearch.title")}
                      aria-label={t("chat.popups.messageSearch.title")}
                      onClick={() => {
                        setMessageSearchDmConversationOnly(Boolean(selectedDirectMessageFriend));
                        setShowMessageSearch(true);
                      }}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      title={tMsg("conversationDetails")}
                      aria-label={tMsg("conversationDetails")}
                      onClick={() => setDetailsPanelOpen((v) => !v)}
                      style={detailsPanelOpen ? { background: "var(--color-surface-muted)", color: "var(--color-text)" } : undefined}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="8" r="4" />
                        <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                      </svg>
                    </button>
                  </div>
                </div>
                {!selectedDirectMessageFriend &&
                  selectedServer &&
                  myServerAccessStatus?.showAgeRestrictedChannelNotice &&
                  !myServerAccessStatus?.chatViewBlocked && (
                    <div
                      style={{
                        flexShrink: 0,
                        padding: "8px 16px",
                        fontSize: 13,
                        lineHeight: 1.4,
                        color: "#faa61a",
                        background: "rgba(250, 166, 26, 0.12)",
                        borderBottom: "1px solid rgba(250, 166, 26, 0.25)",
                      }}
                    >
                      {t("chat.ageRestrict.bannerNotice")}
                    </div>
                  )}
                {/* Sticky reaction bar (DM): hiện reaction của tin nhắn khi kéo lên gần header */}
                {/* Messages Container */}
                <div
                  key={
                    selectedServer && selectedChannel
                      ? `srv-${selectedServer}-ch-${selectedChannel}`
                      : "server-channel-none"
                  }
                  ref={messagesContainerRef}
                  className={styles.messagesContainer}
                  style={{ position: "relative" }}
                  onScroll={(e) => {
                    const container = e.currentTarget;
                    const near = isChatNearBottom(
                      container,
                      CHAT_SCROLL_BOTTOM_THRESHOLD_PX,
                    );
                    shouldAutoScrollRef.current = near;
                    if (near) setShowNewMessagesBelow(false);
                  }}
                >
                  {!selectedDirectMessageFriend &&
                    selectedServer &&
                    myServerAccessStatus?.chatBlockReason === "age_under_18" && (
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          zIndex: 40,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          background: "rgba(15, 16, 20, 0.94)",
                          padding: 24,
                        }}
                      >
                        <div
                          style={{
                            maxWidth: 440,
                            textAlign: "center",
                            background: "var(--color-panel-bg)",
                            border: "1px solid var(--color-panel-border)",
                            borderRadius: 12,
                            padding: "28px 24px",
                            boxShadow: "0 16px 48px rgba(0,0,0,.45)",
                          }}
                        >
                          <h3 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>
                            {t("chat.ageRestrict.title")}
                          </h3>
                          <p
                            style={{
                              marginTop: 12,
                              color: "var(--color-panel-text-muted)",
                              fontSize: 14,
                              lineHeight: 1.5,
                            }}
                          >
                            {t("chat.ageRestrict.under18Body")}
                          </p>
                          <button
                            type="button"
                            onClick={() => setSelectedChannel(null)}
                            style={{
                              marginTop: 20,
                              padding: "10px 20px",
                              borderRadius: 6,
                              border: "none",
                              fontWeight: 700,
                              cursor: "pointer",
                              background: "var(--color-panel-accent)",
                              color: "#fff",
                            }}
                          >
                            {t("chat.ageRestrict.goBack")}
                          </button>
                        </div>
                      </div>
                    )}
                  {!selectedDirectMessageFriend &&
                    selectedServer &&
                    myServerAccessStatus?.chatBlockReason === "age_ack" && (
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          zIndex: 40,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          background: "rgba(15, 16, 20, 0.94)",
                          padding: 24,
                        }}
                      >
                        <div
                          style={{
                            maxWidth: 440,
                            textAlign: "center",
                            background: "var(--color-panel-bg)",
                            border: "1px solid var(--color-panel-border)",
                            borderRadius: 12,
                            padding: "28px 24px",
                            boxShadow: "0 16px 48px rgba(0,0,0,.45)",
                          }}
                        >
                          <h3 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>
                            {t("chat.ageRestrict.title")}
                          </h3>
                          <p
                            style={{
                              marginTop: 12,
                              color: "var(--color-panel-text-muted)",
                              fontSize: 14,
                              lineHeight: 1.5,
                            }}
                          >
                            {t("chat.ageRestrict.ackBody")}
                          </p>
                          <div
                            style={{
                              marginTop: 22,
                              display: "flex",
                              gap: 12,
                              justifyContent: "center",
                              flexWrap: "wrap",
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => setSelectedChannel(null)}
                              disabled={ageAcknowledgeLoading}
                              style={{
                                padding: "10px 18px",
                                borderRadius: 6,
                                border: "1px solid var(--color-panel-border)",
                                fontWeight: 700,
                                cursor: ageAcknowledgeLoading ? "not-allowed" : "pointer",
                                background: "transparent",
                                color: "var(--color-text)",
                              }}
                            >
                              {t("chat.ageRestrict.goBack")}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleAgeAcknowledgeContinue()}
                              disabled={ageAcknowledgeLoading}
                              style={{
                                padding: "10px 18px",
                                borderRadius: 6,
                                border: "none",
                                fontWeight: 700,
                                cursor: ageAcknowledgeLoading ? "not-allowed" : "pointer",
                                background: "var(--color-panel-accent)",
                                color: "#fff",
                              }}
                            >
                              {ageAcknowledgeLoading ? t("chat.ageRestrict.processing") : t("chat.ageRestrict.continue")}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  {selectedDirectMessageFriend ? (
                    shouldBlockDmChatInput ? (
                      <div className={styles.dmBlockedPanel}>
                        <div className={styles.dmBlockedCard}>
                          <p className={styles.dmBlockedText}>
                            {dmBlockedByPeerActive
                              ? t("chat.dmConversation.blockedByPeer", {
                                  name:
                                    selectedDirectMessageFriend.displayName ||
                                    selectedDirectMessageFriend.username ||
                                    t("chat.sidebar.userFallback"),
                                })
                              : t("chat.dmConversation.blockedByYou", {
                                  name:
                                    selectedDirectMessageFriend.displayName ||
                                    selectedDirectMessageFriend.username ||
                                    t("chat.sidebar.userFallback"),
                                })}
                          </p>
                          {dmBlockedByMeActive && (
                            <button
                              type="button"
                              className={styles.dmBlockedUnblockBtn}
                              onClick={() =>
                                void handleDmUnblockPeer(
                                  selectedDirectMessageFriend._id,
                                )
                              }
                            >
                              {t("chat.dmConversation.unblock")}
                            </button>
                          )}
                        </div>
                      </div>
                    ) : loadingDirectMessages ? (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          height: "100%",
                          color: "var(--color-text-muted)",
                        }}
                      >
                        <p>{t("chat.loadingMessages")}</p>
                      </div>
                    ) : (
                        conversations.get(selectedDirectMessageFriend._id) || []
                      ).length === 0 ? (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          height: "100%",
                          color: "var(--color-text-muted)",
                        }}
                      >
                        <p>{t("chat.noMessages")}</p>
                      </div>
                    ) : (
                      (
                        conversations.get(selectedDirectMessageFriend._id) || []
                      ).map((message) => (
                        <div
                          key={message.id}
                          data-message-id={message.id}
                          data-has-reactions={message.reactions?.length ? "true" : undefined}
                          style={
                            highlightedJumpMessageId === message.id
                              ? {
                                  background: "color-mix(in srgb, var(--color-panel-accent) 22%, transparent)",
                                  borderRadius: 10,
                                  transition: "background 220ms ease",
                                }
                              : undefined
                          }
                        >
                          <MessageItem
                            message={message}
                            renderMessageContent={renderMessageContent}
                            onVisible={handleMessageVisible}
                            currentUserId={currentUserId}
                            onReaction={handleReaction}
                            onReply={handleReplyToMessage}
                            onPin={handlePinMessage}
                            onReport={(msgId) => setShowReportDialog(msgId)}
                            // DM bubbles use the split delete flow — each
                            // menu item fires the action immediately without
                            // an extra confirmation dialog.
                            onDeleteForMe={(msgId) =>
                              handleDeleteMessage(msgId, "for-me")
                            }
                            onDeleteForEveryone={(msgId) =>
                              handleDeleteMessage(msgId, "for-everyone")
                            }
                            scrollContainerRef={messagesContainerRef}
                            dmPartnerDisplayName={selectedDirectMessageFriend.displayName || selectedDirectMessageFriend.username}
                            messagesShellTheme={messagesShellTheme}
                          />
                        </div>
                      ))
                    )
                  ) : loading ? (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        height: "100%",
                        color: "var(--color-text-muted)",
                      }}
                    >
                      <p>{t("chat.loadingMessages")}</p>
                    </div>
                  ) : (
                    <>
                      {serverInteractionSettings?.welcomeMessageEnabled &&
                        selectedChannel === serverInteractionSettings?.systemChannelId &&
                        currentServer && (
                        <div style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "stretch",
                          alignSelf: "stretch",
                          width: "100%",
                          padding: "48px 16px 24px",
                          textAlign: "left",
                          borderBottom: "1px solid var(--color-border)",
                          marginBottom: 8,
                        }}>
                          <h1 style={{
                            fontSize: 28,
                            fontWeight: 700,
                            color: "var(--color-text)",
                            lineHeight: 1.3,
                            margin: 0,
                            textAlign: "left",
                          }}>
                            {t("chat.welcome.title")}
                            <br />
                            {t("chat.welcome.serverOf").replace("{name}", currentServer.name)}
                          </h1>
                          <p style={{
                            fontSize: 14,
                            color: "var(--color-text-muted)",
                            marginTop: 8,
                            maxWidth: 560,
                            textAlign: "left",
                          }}>
                            {t("chat.welcome.channelIntro").replace(
                              "{serverName}",
                              currentServer.name,
                            )}
                          </p>
                          {/* Welcome messages: nằm dưới phần chào mừng, không bị trôi theo chat */}
                          <div style={{
                            width: "100%",
                            maxWidth: "100%",
                            marginTop: 14,
                            display: "flex",
                            flexDirection: "column",
                            gap: 6,
                            textAlign: "left",
                            alignSelf: "flex-start",
                          }}>
                            {messages
                              .filter((m) => m.messageType === "welcome")
                              .slice()
                              .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
                              .map((m) => (
                                <div
                                  key={m.id}
                                  data-message-id={m.id}
                                  style={
                                    highlightedJumpMessageId === m.id
                                      ? {
                                          background: "color-mix(in srgb, var(--color-panel-accent) 22%, transparent)",
                                          borderRadius: 10,
                                          transition: "background 220ms ease",
                                        }
                                      : undefined
                                  }
                                >
                                  {renderMessageContent(m)}
                                </div>
                              ))}
                          </div>
                        </div>
                      )}
                      {messages.length === 0 &&
                        !(serverInteractionSettings?.welcomeMessageEnabled &&
                          selectedChannel === serverInteractionSettings?.systemChannelId) ? (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            height: "100%",
                            color: "var(--color-text-muted)",
                          }}
                        >
                          <p>{t("chat.noMessages")}</p>
                        </div>
                      ) : (
                    messages
                      .filter((m) => m.messageType !== "welcome")
                      .map((message) => {
                      if (message.messageType === "system") {
                        return (
                          <div
                            key={message.id}
                            data-message-id={message.id}
                            style={
                              highlightedJumpMessageId === message.id
                                ? {
                                    background: "color-mix(in srgb, var(--color-panel-accent) 22%, transparent)",
                                    borderRadius: 10,
                                    transition: "background 220ms ease",
                                  }
                                : undefined
                            }
                          >
                            {renderMessageContent(message)}
                          </div>
                        );
                      }
                      return (
                        <div
                          key={message.id}
                          data-message-id={message.id}
                          data-has-reactions={message.reactions?.length ? "true" : undefined}
                          style={
                            highlightedJumpMessageId === message.id
                              ? {
                                  background: "color-mix(in srgb, var(--color-panel-accent) 22%, transparent)",
                                  borderRadius: 10,
                                  transition: "background 220ms ease",
                                }
                              : undefined
                          }
                        >
                          <MessageItem
                            message={message}
                            renderMessageContent={renderMessageContent}
                            onVisible={handleMessageVisible}
                            currentUserId={currentUserId}
                            onReaction={handleReaction}
                            onReply={handleReplyToMessage}
                            onPin={handlePinMessage}
                            onReport={(msgId) => setShowReportDialog(msgId)}
                            onDeleteForMe={(msgId) =>
                              void handleDeleteMessage(msgId, "for-me")
                            }
                            onDeleteForEveryone={(msgId) =>
                              void handleDeleteMessage(msgId, "for-everyone")
                            }
                            scrollContainerRef={messagesContainerRef}
                            senderColor={memberRoleColors[message.senderId]}
                            senderNameStyle={resolveMessageSenderStyle(message)}
                            messagesShellTheme={messagesShellTheme}
                            onChannelUserProfileOpen={handleOpenChannelUserProfile}
                          />
                        </div>
                      );
                    })
                      )}
                    </>
                  )}

                  {pinInlineNoticeOpen && (
                    <div
                      style={{
                        marginTop: 8,
                        marginBottom: 8,
                        padding: "10px 12px",
                        borderRadius: 10,
                        background: "rgba(88, 101, 242, 0.14)",
                        border: "1px solid rgba(88, 101, 242, 0.35)",
                        color: "var(--color-text)",
                        fontSize: 14,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                      }}
                    >
                      <span>{pinInlineNoticeMessage}</span>
                      <button
                        type="button"
                        onClick={() => void openPinnedMessagesModal()}
                        style={{
                          border: 0,
                          background: "transparent",
                          color: "#a78bfa",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        Xem tất cả
                      </button>
                    </div>
                  )}

                  {/* ✅ Typing Indicator */}
                  {selectedDirectMessageFriend &&
                    userTyping &&
                    userTyping.fromUserId === selectedDirectMessageFriend._id &&
                    userTyping.isTyping && (
                      <div className={styles.typingIndicator}>
                        <div className={styles.typingAvatar}>
                          {isValidAvatarUrl(
                            selectedDirectMessageFriend.avatarUrl,
                          ) ? (
                            <img
                              src={selectedDirectMessageFriend.avatarUrl}
                              alt={selectedDirectMessageFriend.username}
                            />
                          ) : (
                            <div className={styles.avatarPlaceholder}>
                              {(
                                selectedDirectMessageFriend.username ||
                                selectedDirectMessageFriend.displayName ||
                                "?"
                              )
                                .charAt(0)
                                .toUpperCase()}
                            </div>
                          )}
                        </div>
                        <div className={styles.typingBubble}>
                          <span className={styles.typingText}>
                            {userTyping.username ||
                              selectedDirectMessageFriend.username ||
                              selectedDirectMessageFriend.displayName}{" "}
                            is typing...
                          </span>
                          <div className={styles.typingDots}>
                            <span></span>
                            <span></span>
                            <span></span>
                          </div>
                        </div>
                      </div>
                    )}

                  <div ref={messagesEndRef} />

                  {showNewMessagesBelow && (
                    <button
                      ref={newMessagesPillRef}
                      type="button"
                      className={styles.newMessagesPill}
                      data-ui-tone={messagesUiTone}
                      onClick={handleJumpToLatestMessages}
                    >
                      {t("chat.newMessagesBelow")}
                    </button>
                  )}
                </div>

                {/* Reply Preview */}
                {replyingTo && (
                  <ReplyMessagePreview
                    message={replyingTo}
                    headerText={
                      replyingTo.isFromCurrentUser
                        ? "Bạn đã trả lời chính mình"
                        : `Bạn đã trả lời ${
                            selectedDirectMessageFriend?.displayName ||
                            replyingTo.senderDisplayName ||
                            replyingTo.senderName ||
                            replyingTo.senderEmail ||
                            "người dùng"
                          }`
                    }
                    onClose={() => setReplyingTo(null)}
                  />
                )}

                {!selectedDirectMessageFriend &&
                  selectedServer &&
                  shouldBlockServerChatInput && (
                    <div
                      style={{
                        flexShrink: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 14,
                        padding: "12px 16px",
                        background: "rgba(6, 8, 18, 0.98)",
                        borderTop: "1px solid rgba(124, 58, 237, 0.18)",
                      }}
                    >
                      <p
                        style={{
                          margin: 0,
                          fontSize: 14,
                          lineHeight: 1.45,
                          color: "#dde2f0",
                          flex: 1,
                        }}
                      >
                        Bạn phải hoàn thành thêm một vài bước nữa trước khi có thể trò chuyện trong máy chủ này
                      </p>
                      <button
                        type="button"
                        onClick={() => void openVerificationRulesModal()}
                        style={{
                          flexShrink: 0,
                          border: "none",
                          borderRadius: 8,
                          padding: "8px 16px",
                          fontWeight: 700,
                          fontSize: 13,
                          cursor: "pointer",
                          background: "linear-gradient(135deg, #5865f2 0%, #7c3aed 100%)",
                          color: "#fff",
                          boxShadow: "0 2px 10px rgba(88,101,242,0.35)",
                        }}
                      >
                        Hoàn thành
                      </button>
                    </div>
                  )}

                {/* Input Area */}
                {isAdminView && selectedServer === adminViewServerId ? (
                  <div className={styles.inputArea} style={{ justifyContent: "center", opacity: 0.7 }}>
                    <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>{t("chat.adminView.readOnlyFooter")}</span>
                  </div>
                ) : (
                <div
                  className={styles.inputArea}
                  style={{
                    opacity:
                      shouldBlockServerChatInput || shouldBlockDmChatInput ? 0.6 : 1,
                    pointerEvents:
                      shouldBlockServerChatInput || shouldBlockDmChatInput
                        ? "none"
                        : undefined,
                    display: shouldBlockDmChatInput ? "none" : undefined,
                  }}
                >
                  {/* Plus Menu Button */}
                  <div style={{ position: "relative" }}>
                    <button
                      className={styles.plusButton}
                      title={t("chat.ageRestrict.moreOptions")}
                      onClick={() => setShowPlusMenu(!showPlusMenu)}
                    >
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M12 5v14M5 12h14"></path>
                      </svg>
                    </button>

                    {/* Plus Menu Popup */}
                    {showPlusMenu && (
                      <div className={styles.plusMenuPopup}>
                        <button
                          className={styles.plusMenuItem}
                          onClick={handleFileUpload}
                        >
                          <svg
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="17 8 12 3 7 8"></polyline>
                            <line x1="12" y1="3" x2="12" y2="15"></line>
                          </svg>
                          <span>{t("chat.composer.plusUploadFile")}</span>
                        </button>
                        <button
                          className={styles.plusMenuItem}
                          onClick={handleCreatePoll}
                        >
                          <svg
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                            <polyline points="14 2 14 8 20 8"></polyline>
                            <line x1="16" y1="13" x2="8" y2="13"></line>
                            <line x1="16" y1="17" x2="8" y2="17"></line>
                            <polyline points="10 9 9 9 8 9"></polyline>
                          </svg>
                          <span>{t("chat.composer.plusCreatePoll")}</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {selectedServer &&
                    !selectedDirectMessageFriend &&
                    canUseMentions &&
                    !shouldBlockServerChatInput && (
                    <button
                      className={styles.plusButton}
                      title={t("chat.mention.tooltip")}
                      type="button"
                      onClick={() => {
                        const start = messageText.length;
                        setMessageText(messageText + "@");
                        setMentionOpen(true);
                        setMentionStartPos(start);
                        setMentionKeyword("");
                        fetchMentionSuggestions("");
                        requestAnimationFrame(() => {
                          const el = messageInputRef.current;
                          if (el) {
                            el.focus();
                            el.setSelectionRange(start + 1, start + 1);
                          }
                        });
                      }}
                      style={{ fontSize: "16px", fontWeight: 700 }}
                    >
                      @
                    </button>
                  )}

                  {/* Voice Recorder */}
                  {isRecordingVoice && (
                    <VoiceRecorder
                      onRecordComplete={handleVoiceRecordComplete}
                      onCancel={handleVoiceCancelRecording}
                    />
                  )}

                  {/* Uploading Indicator */}
                  {isUploadingVoice && (
                    <div className={styles.uploadingVoice}>
                      <div className={styles.spinner}></div>
                      <span>{t("chat.messagesPage.uploadingVoice")}</span>
                    </div>
                  )}

                  {/* Normal Text Input */}
                  {!isRecordingVoice && !isUploadingVoice && (
                    <>
                      <div className={styles.inputWrapper} style={{ position: "relative" }}>
                        {mentionOpen &&
                          selectedServer &&
                          !selectedDirectMessageFriend &&
                          canUseMentions &&
                          !shouldBlockServerChatInput && (
                          <MentionDropdown
                            suggestions={mentionSuggestions}
                            activeIndex={mentionActiveIndex}
                            keyword={mentionKeyword}
                            onSelect={handleMentionSelect}
                            onActiveIndexChange={setMentionActiveIndex}
                          />
                        )}
                        <input
                          ref={messageInputRef}
                          type="text"
                          className={styles.messageInput}
                          placeholder={t("chat.composer.messagePlaceholder")}
                          disabled={shouldBlockServerChatInput}
                          value={messageText}
                          onChange={(e) => {
                            const newValue = e.target.value;
                            setMessageText(newValue);

                            if (selectedServer && !selectedDirectMessageFriend && canUseMentions) {
                              const cursorPos = e.target.selectionStart ?? newValue.length;
                              handleMentionDetect(newValue, cursorPos);
                            }

                            if (
                              selectedDirectMessageFriend &&
                              notifyTyping &&
                              newValue.length > 0
                            ) {
                              if (!isTypingRef.current) {
                                isTypingRef.current = true;
                                notifyTyping(
                                  selectedDirectMessageFriend._id,
                                  true,
                                );
                              }

                              if (typingTimeoutRef.current) {
                                clearTimeout(typingTimeoutRef.current);
                              }

                              typingTimeoutRef.current = setTimeout(() => {
                                if (isTypingRef.current) {
                                  isTypingRef.current = false;
                                  notifyTyping(
                                    selectedDirectMessageFriend._id,
                                    false,
                                  );
                                }
                              }, 2000);
                            } else if (
                              selectedDirectMessageFriend &&
                              notifyTyping &&
                              newValue.length === 0 &&
                              isTypingRef.current
                            ) {
                              isTypingRef.current = false;
                              notifyTyping(
                                selectedDirectMessageFriend._id,
                                false,
                              );
                              if (typingTimeoutRef.current) {
                                clearTimeout(typingTimeoutRef.current);
                              }
                            }
                          }}
                          onKeyDown={(e) => {
                            if (
                              mentionOpen &&
                              mentionSuggestions.length > 0 &&
                              canUseMentions &&
                              !shouldBlockServerChatInput
                            ) {
                              if (["ArrowDown", "ArrowUp", "Tab", "Escape"].includes(e.key) || (e.key === "Enter" && !e.shiftKey)) {
                                handleMentionKeyDown(e);
                                return;
                              }
                            }

                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();

                              if (
                                selectedDirectMessageFriend &&
                                notifyTyping &&
                                isTypingRef.current
                              ) {
                                isTypingRef.current = false;
                                notifyTyping(
                                  selectedDirectMessageFriend._id,
                                  false,
                                );
                                if (typingTimeoutRef.current) {
                                  clearTimeout(typingTimeoutRef.current);
                                }
                              }

                              if (!selectedDirectMessageFriend && shouldBlockServerChatInput) {
                                void openVerificationRulesModal();
                                return;
                              }

                              selectedDirectMessageFriend
                                ? handleSendDirectMessage()
                                : handleSendMessage();
                            }
                          }}
                          onPaste={(e) => {
                            const items = Array.from(
                              e.clipboardData?.items || [],
                            );
                            const mediaFiles = items
                              .filter(
                                (item) =>
                                  item.kind === "file" &&
                                  (item.type.startsWith("image/") ||
                                    item.type.startsWith("video/") ||
                                    item.type.startsWith("audio/")),
                              )
                              .map((item) => item.getAsFile())
                              .filter((file): file is File => Boolean(file));

                            if (mediaFiles.length > 0) {
                              e.preventDefault();
                              void handleMediaFilesSelected(mediaFiles);
                            }
                          }}
                        />
                      </div>

                      {/* Media Buttons */}
                      <div className={styles.mediaButtons}>
                        {/* Voice Recording Button */}
                        <button
                          type="button"
                          className={styles.mediaButton}
                          title={t("chat.composer.voiceMessage")}
                          aria-label={t("chat.composer.voiceMessage")}
                          onClick={() => setIsRecordingVoice(true)}
                          disabled={isRecordingVoice || isUploadingVoice}
                        >
                          <svg
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                            <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                            <line x1="12" y1="19" x2="12" y2="23"></line>
                            <line x1="8" y1="23" x2="16" y2="23"></line>
                          </svg>
                        </button>

                        {/* GIF Button */}
                        <button
                          type="button"
                          className={styles.mediaButton}
                          title={t("chat.composer.sendGif")}
                          aria-label={t("chat.composer.sendGif")}
                          onClick={() => {
                            setMediaPickerTab("gif");
                            setShowGiphyPicker(true);
                          }}
                        >
                          <svg
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <rect x="3" y="5" width="18" height="14" rx="3" ry="3" />
                            <line x1="8" y1="9" x2="8" y2="15" />
                            <line x1="8" y1="12" x2="10.5" y2="12" />
                            <line x1="12.5" y1="9" x2="16.5" y2="9" />
                            <line x1="12.5" y1="12" x2="16" y2="12" />
                            <line x1="12.5" y1="15" x2="16.5" y2="15" />
                          </svg>
                        </button>

                        {/* Sticker Button */}
                        <button
                          type="button"
                          className={styles.mediaButton}
                          title={t("chat.composer.sendSticker")}
                          aria-label={t("chat.composer.sendSticker")}
                          onClick={() => {
                            setMediaPickerTab("sticker");
                            setShowGiphyPicker(true);
                          }}
                        >
                          <svg
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            {/* Paper/Note background */}
                            <rect
                              x="3"
                              y="2"
                              width="18"
                              height="20"
                              rx="2"
                              ry="2"
                            ></rect>
                            <line x1="7" y1="6" x2="17" y2="6"></line>
                            {/* Smiley face */}
                            <circle
                              cx="9"
                              cy="11"
                              r="1"
                              fill="currentColor"
                            ></circle>
                            <circle
                              cx="15"
                              cy="11"
                              r="1"
                              fill="currentColor"
                            ></circle>
                            <path
                              d="M9 14.5c0.5 1 1.5 1.5 3 1.5s2.5-0.5 3-1.5"
                              strokeLinecap="round"
                            ></path>
                          </svg>
                        </button>

                        {/* Emoji Picker */}
                        <button
                          type="button"
                          className={styles.mediaButton}
                          title={t("chat.composer.openEmojiPicker")}
                          aria-label={t("chat.composer.openEmojiPicker")}
                          onClick={() => {
                            setMediaPickerTab("emoji");
                            setShowGiphyPicker(true);
                          }}
                        >
                          <svg
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <circle cx="12" cy="12" r="10"></circle>
                            <path d="M8 14s1.5 2 4 2 4-2 4-2"></path>
                            <line x1="9" y1="9" x2="9.01" y2="9"></line>
                            <line x1="15" y1="9" x2="15.01" y2="9"></line>
                          </svg>
                        </button>
                      </div>

                      <button
                        type="button"
                        className={styles.sendButton}
                        onClick={
                          selectedDirectMessageFriend
                            ? handleSendDirectMessage
                            : handleSendMessage
                        }
                        disabled={!messageText.trim() || (!selectedDirectMessageFriend && shouldBlockServerChatInput)}
                        title={t("chat.composer.sendMessage")}
                        aria-label={t("chat.composer.sendMessage")}
                      >
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M16.6915026,12.4744748 L3.50612381,13.2599618 C3.19218622,13.2599618 3.03521743,13.4170592 3.03521743,13.5741566 L1.15159189,20.0151496 C0.8376543,20.8006365 0.99,21.89 1.77946707,22.52 C2.41,22.99 3.50612381,23.1 4.13399899,22.8429026 L21.714504,14.0454487 C22.6563168,13.5741566 23.1272231,12.6315722 22.9702544,11.6889879 L4.13399899,1.16346272 C3.34915502,0.9 2.40734225,0.9 1.77946707,1.4071521 C0.994623095,2.0605983 0.837654326,3.0031827 1.15159189,3.7886696 L3.03521743,10.2296625 C3.03521743,10.3867599 3.19218622,10.5438573 3.50612381,10.5438573 L16.6915026,11.3293442 C16.6915026,11.3293442 17.1624089,11.3293442 17.1624089,10.8580521 L17.1624089,12.4744748 C17.1624089,12.4744748 17.1624089,12.9457669 16.6915026,12.4744748 Z"></path>
                        </svg>
                      </button>
                    </>
                  )}
                </div>
                )}
              </>
              )}
            </>
            ) : (
              <div className={styles.emptyState}>
                <div className={styles.emptyOrbitScene}>
                  <div className={styles.emptyOrbitRing1}>
                    <div className={styles.emptyOrbitDot1} />
                  </div>
                  <div className={styles.emptyOrbitRing2}>
                    <div className={styles.emptyOrbitDot2} />
                  </div>
                  <div className={styles.emptyIcon}>
                    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                      <circle cx="9" cy="10.5" r="1" fill="currentColor" stroke="none"/>
                      <circle cx="12" cy="10.5" r="1" fill="currentColor" stroke="none"/>
                      <circle cx="15" cy="10.5" r="1" fill="currentColor" stroke="none"/>
                    </svg>
                  </div>
                </div>
                <p className={styles.emptyText}>
                  {loading
                    ? t("chat.chatPage.loadingSelectServer")
                    : t("chat.chatPage.selectServerPrompt")}
                </p>
              </div>
            )}
          </div>

          {/* Profile sidebar - only when chatting in DM; user can close/reopen */}
          {selectedDirectMessageFriend && (
            dmProfileSidebarOpen ? (
              <div className={styles.activeNowSidebar}>
                <div className={styles.activeNowHeader}>
                  <h3 className={styles.activeNowTitle}>{t("chat.profile.title")}</h3>
                  <button
                    type="button"
                    className={styles.activeNowCloseBtn}
                    onClick={() => setDmProfileSidebarOpen(false)}
                    title={t("chat.profile.close")}
                    aria-label={t("chat.profile.close")}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
                <div className={styles.activeNowContainer}>
                  <div className={styles.dmProfileCard}>
                    <div
                      className={styles.dmProfileAvatar}
                      style={{
                        backgroundImage: isValidAvatarUrl(
                          dmSidebarIdentity?.avatarUrl || selectedDirectMessageFriend.avatarUrl,
                        )
                          ? `url(${dmSidebarIdentity?.avatarUrl || selectedDirectMessageFriend.avatarUrl})`
                          : undefined,
                        backgroundColor: !isValidAvatarUrl(
                          dmSidebarIdentity?.avatarUrl || selectedDirectMessageFriend.avatarUrl,
                        )
                          ? "var(--color-primary)" : undefined,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                      }}
                    >
                      {!isValidAvatarUrl(
                        dmSidebarIdentity?.avatarUrl || selectedDirectMessageFriend.avatarUrl,
                      ) && (
                        <span>
                          {(dmSidebarIdentity?.displayName ||
                            selectedDirectMessageFriend.displayName ||
                            selectedDirectMessageFriend.username)
                            ?.charAt(0)
                            ?.toUpperCase()}
                        </span>
                      )}
                    </div>

                    <p className={styles.dmProfileDisplayName}>
                      {dmSidebarIdentity?.displayName ||
                        selectedDirectMessageFriend.displayName ||
                        selectedDirectMessageFriend.username}
                    </p>
                    <p className={styles.dmProfileUsername}>
                      {dmSidebarIdentity?.username || selectedDirectMessageFriend.username}
                    </p>
                    {selectedDirectMessageFriend.email && (
                      <p className={styles.dmProfileEmail}>
                        {selectedDirectMessageFriend.email}
                      </p>
                    )}

                    {dmProfileDetail?.cordigramMemberSince ? (
                      <div className={styles.dmProfileMetaCard}>
                        <div className={styles.dmProfileMetaLabel}>
                          {t("chat.popups.userProfile.memberSinceLabel")}
                        </div>
                        <div className={styles.dmProfileMetaValue}>
                          {dmProfileDetail.cordigramMemberSince}
                        </div>
                      </div>
                    ) : null}

                    <div className={styles.dmProfileMetaCard}>
                      <div className={styles.dmProfileMetaLabel}>
                        {t("chat.popups.userProfile.mutualServersLabel")}
                      </div>
                      <div className={styles.dmProfileMetaValue}>
                        {dmProfileDetail?.mutualServerCount ?? 0}
                      </div>
                    </div>

                    {dmSidebarIdentity?.bio && (
                      <div className={styles.dmProfileBio}>
                        {dmSidebarIdentity.bio}
                      </div>
                    )}

                    <button
                      type="button"
                      className={styles.dmProfileViewFull}
                      onClick={() =>
                        setDmProfilePopupUserId(selectedDirectMessageFriend._id)
                      }
                    >
                      {t("chat.profile.viewFull")}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className={styles.dmProfileSidebarToggle}
                onClick={() => setDmProfileSidebarOpen(true)}
                title={t("chat.profile.title")}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                <span>{t("chat.profile.title")}</span>
              </button>
            )
          )}

          {/* Conversation Details Panel — right sidebar for DM and channel chat */}
          {(selectedDirectMessageFriend || (selectedChatTextChannel && !viewingVoiceChannel)) && (
            <ConversationDetailsPanel
              open={detailsPanelOpen}
              onClose={() => setDetailsPanelOpen(false)}
              type={selectedDirectMessageFriend ? "dm" : "channel"}
              name={
                selectedDirectMessageFriend
                  ? (selectedDirectMessageFriend.displayName || selectedDirectMessageFriend.username)
                  : `#${translateChannelName(allChannels.find((c) => c._id === selectedChannel)?.name ?? "channel", language)}`
              }
              avatarUrl={selectedDirectMessageFriend?.avatarUrl}
              messages={detailsPanelMessages}
              loadPinnedMessages={loadPinnedMessagesForPanel}
              onJumpToMessage={(id) => {
                setDetailsPanelOpen(false);
                setTimeout(() => scrollToMessageBubble(id), 80);
              }}
              onOpenMedia={(url) => openMediaViewer(url)}
            />
          )}
        </div>
      </div>

      {/* Popup quy định (tab Truy cập) — mở từ nút Hoàn thành khi chưa đủ xác minh */}
      {dmProfilePopupUserId && selectedDirectMessageFriend && (
        <UserProfilePopup
          userId={dmProfilePopupUserId}
          token={token}
          currentUserId={currentUserId}
          profileSource="messaging"
          onClose={() => setDmProfilePopupUserId(null)}
          onMessage={() => setDmProfilePopupUserId(null)}
        />
      )}

      {verificationRulesOpen &&
        selectedServer &&
        !selectedDirectMessageFriend &&
        (() => {
        const srv = currentServer;
        const hasRulesContent = (verificationAccessSettings?.rules?.length ?? 0) > 0;
        const rulesAccepted = Boolean(myServerAccessStatus?.acceptedRules);
        const needsRulesStep = verificationAccessSettings?.hasRules && hasRulesContent && !rulesAccepted;
        const needsAgree = needsRulesStep;

        const lvl = myServerAccessStatus?.verificationLevel ?? "none";
        const chatBlocked = myServerAccessStatus?.chatViewBlocked === true;
        const blockReason = myServerAccessStatus?.chatBlockReason;
        const needsVerificationStep = (() => {
          if (lvl === "none") return false;
          if (chatBlocked && blockReason === "verification") return true;
          // Fail-safe: if status is stale/missing reason, still show verification when checks are not satisfied.
          const c = myServerAccessStatus?.verificationChecks;
          const w = myServerAccessStatus?.verificationWait;
          const emailOk = Boolean(c?.emailVerified);
          const accountOk = lvl === "low" ? true : Boolean(c?.accountOver5Min);
          const memberOk = lvl === "high" ? Boolean(c?.memberOver10Min) : true;
          const waitAccountOk = (w?.waitAccountSec ?? 0) <= 0;
          const waitMemberOk = (w?.waitMemberSec ?? 0) <= 0;
          return !(emailOk && accountOk && memberOk && waitAccountOk && waitMemberOk);
        })();

        const chk = myServerAccessStatus?.verificationChecks ?? {
          emailVerified: false,
          accountOver5Min: false,
          memberOver10Min: false,
        };
        const wait = {
          waitAccountSec: localWaitAccountSec,
          waitMemberSec: localWaitMemberSec,
        };
        const fmt = (sec: number | null | undefined) =>
          sec == null || sec <= 0
            ? null
            : `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

        const submitDisabled =
          verificationRulesSubmitting ||
          Boolean(needsAgree && !verificationRulesAgreed) ||
          Boolean(!needsAgree && needsVerificationStep);

        return (
          <div
            role="dialog"
            aria-modal
            aria-label={t("chat.verify.dialogLabel")}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0, 0, 0, 0.7)",
              zIndex: 20001,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 24,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                display: "flex",
                width: "min(780px, 96vw)",
                maxHeight: "min(680px, 90vh)",
                background: "rgba(8, 10, 22, 0.97)",
                borderRadius: 16,
                boxShadow: "0 24px 64px rgba(0,0,0,.65), 0 0 40px rgba(124,58,237,0.1)",
                border: "1px solid rgba(124, 58, 237, 0.18)",
                overflow: "hidden",
              }}
            >
              {/* Left: Server profile card */}
              <div
                style={{
                  width: 220,
                  flexShrink: 0,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  padding: "32px 16px 24px",
                  background: "rgba(6, 8, 18, 0.98)",
                  borderRight: "1px solid rgba(124, 58, 237, 0.18)",
                  gap: 10,
                }}
              >
                <div
                  style={{
                    width: 80,
                    height: 80,
                    borderRadius: 16,
                    background: srv?.avatarUrl ? `url(${srv.avatarUrl}) center/cover no-repeat` : "#5865f2",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 32,
                    fontWeight: 800,
                    color: "#fff",
                    flexShrink: 0,
                  }}
                >
                  {!srv?.avatarUrl && (srv?.name?.charAt(0)?.toUpperCase() ?? "S")}
                </div>
                <p style={{ margin: 0, fontWeight: 800, fontSize: 16, color: "#dde2f0", textAlign: "center" }}>
                  {srv?.name ?? t("chat.chatPage.serverFallback")}
                </p>
                <div style={{ display: "flex", gap: 12, fontSize: 12, color: "#7a8db8", marginTop: 4 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#23a55a", display: "inline-block" }} />
                    {t("chat.chatPage.memberCount").replace("{count}", String(srv?.members?.filter(() => true).length ?? 0))}
                  </span>
                </div>
                <p style={{ margin: "4px 0 0", fontSize: 11, color: "#4a5878" }}>
                  {t("chat.chatPage.foundedMonth").replace("{date}", srv?.createdAt ? new Date(srv.createdAt).toLocaleDateString(localeTagForLanguage(language), { month: "numeric", year: "numeric" }) : "")}
                </p>
              </div>

              {/* Right: Content */}
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  padding: "24px 28px",
                  overflow: "auto",
                  minWidth: 0,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#dde2f0" }}>
                      {t("chat.verify.title")}
                    </h3>
                    <p style={{ margin: "6px 0 0", fontSize: 14, color: "#7a8db8", lineHeight: 1.45 }}>
                      {t("chat.verify.subtitle")}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={t("chat.profile.close")}
                    onClick={() => {
                      setVerificationRulesOpen(false);
                      setVerificationAccessSettings(null);
                    }}
                    style={{
                      border: "none",
                      background: "transparent",
                      color: "#7a8db8",
                      fontSize: 22,
                      lineHeight: 1,
                      cursor: "pointer",
                      padding: 4,
                      flexShrink: 0,
                    }}
                  >
                    ×
                  </button>
                </div>

                {/* Step 1: Rules (access tab) */}
                {hasRulesContent && (
                  <div style={{ marginTop: 20 }}>
                    <p style={{ margin: "0 0 10px", fontWeight: 800, fontSize: 12, textTransform: "uppercase", color: "#7a8db8", letterSpacing: "0.02em", display: "flex", alignItems: "center", gap: 8 }}>
                      {t("chat.verify.agreeRules")}
                      {rulesAccepted && <span style={{ color: "#23a55a", fontSize: 14 }}>✓</span>}
                    </p>
                    <div
                      style={{
                        padding: 16,
                        borderRadius: 8,
                        background: "rgba(6, 8, 18, 0.92)",
                        border: "1px solid rgba(124, 58, 237, 0.18)",
                        fontSize: 14,
                        lineHeight: 1.65,
                        color: "#dde2f0",
                      }}
                    >
                      <ol style={{ margin: 0, paddingLeft: 22 }}>
                        {verificationAccessSettings!.rules.map((r, i) => (
                          <li key={r.id} style={{ marginBottom: i < verificationAccessSettings!.rules.length - 1 ? 12 : 0, color: "#dde2f0" }}>
                            {r.content}
                          </li>
                        ))}
                      </ol>
                    </div>

                    {needsAgree && (
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          marginTop: 16,
                          fontSize: 14,
                          cursor: "pointer",
                          color: "#dde2f0",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={verificationRulesAgreed}
                          onChange={(e) => setVerificationRulesAgreed(e.target.checked)}
                          style={{ width: 18, height: 18, accentColor: "#5865f2", flexShrink: 0 }}
                        />
                        <span>{t("chat.verify.agreeCheckbox")}</span>
                      </label>
                    )}
                  </div>
                )}

                {/* Step 2: Verification (safety settings) - shown after rules accepted */}
                {needsVerificationStep && rulesAccepted && (
                  <div style={{ marginTop: 20 }}>
                    <p style={{ margin: "0 0 10px", fontWeight: 800, fontSize: 12, textTransform: "uppercase", color: "#7a8db8", letterSpacing: "0.02em" }}>
                      {t("chat.verify.verificationLevel").replace("{level}", lvl === "low" ? t("chat.verify.levelLow") : lvl === "medium" ? t("chat.verify.levelMedium") : lvl === "high" ? t("chat.verify.levelHigh") : "")}
                    </p>
                    <div
                      style={{
                        padding: 16,
                        borderRadius: 8,
                        background: "rgba(6, 8, 18, 0.92)",
                        border: "1px solid rgba(124, 58, 237, 0.18)",
                        fontSize: 14,
                        lineHeight: 1.7,
                        color: "#dde2f0",
                      }}
                    >
                      <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none" }}>
                        {(lvl === "low" || lvl === "medium" || lvl === "high") && (
                          <li style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 8, color: chk.emailVerified ? "#23a55a" : "#dde2f0" }}>
                            <span style={{ flexShrink: 0 }}>{chk.emailVerified ? "✓" : "○"}</span>
                            <div style={{ flex: 1 }}>
                              <span>{t("chat.verify.emailVerify")}</span>
                              {!chk.emailVerified && (
                                <div style={{ marginTop: 8 }}>
                                  {!emailOtpSent ? (
                                    <button
                                      onClick={async () => {
                                        if (!selectedServer) return;
                                        setEmailOtpSending(true);
                                        setEmailOtpError(null);
                                        try {
                                          const res = await serversApi.requestServerEmailOtp(selectedServer);
                                          if (res.ok) {
                                            setEmailOtpSent(true);
                                            setEmailOtpCooldown(60);
                                          } else if (res.retryAfterSec) {
                                            setEmailOtpCooldown(res.retryAfterSec);
                                            setEmailOtpError(t("chat.verify.waitRetry").replace("{sec}", String(res.retryAfterSec)));
                                          }
                                        } catch (e: any) {
                                          setEmailOtpError(e?.message || t("chat.verify.otpError"));
                                        } finally {
                                          setEmailOtpSending(false);
                                        }
                                      }}
                                      disabled={emailOtpSending || emailOtpCooldown > 0}
                                      style={{
                                        padding: "6px 16px",
                                        borderRadius: 4,
                                        border: "none",
                                        background: emailOtpSending || emailOtpCooldown > 0 ? "rgba(60, 65, 100, 0.45)" : "#5865f2",
                                        color: "#fff",
                                        fontWeight: 600,
                                        fontSize: 13,
                                        cursor: emailOtpSending || emailOtpCooldown > 0 ? "not-allowed" : "pointer",
                                      }}
                                    >
                                      {emailOtpSending ? t("chat.verify.sendOtpSending") : emailOtpCooldown > 0 ? t("chat.verify.sendOtpCooldown").replace("{sec}", String(emailOtpCooldown)) : t("chat.verify.sendOtpBtn")}
                                    </button>
                                  ) : (
                                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                                      <input
                                        type="text"
                                        maxLength={6}
                                        placeholder={t("chat.verify.otpPlaceholder")}
                                        value={emailOtpCode}
                                        onChange={(e) => { setEmailOtpCode(e.target.value.replace(/\D/g, "")); setEmailOtpError(null); }}
                                        style={{
                                          padding: "6px 10px",
                                          borderRadius: 4,
                                          border: "1px solid rgba(124, 58, 237, 0.28)",
                                          background: "rgba(7, 9, 22, 0.9)",
                                          color: "#dde2f0",
                                          fontSize: 14,
                                          width: 100,
                                          letterSpacing: 4,
                                          textAlign: "center",
                                        }}
                                      />
                                      <button
                                        onClick={async () => {
                                          if (!selectedServer || !emailOtpCode.trim()) return;
                                          setEmailOtpVerifying(true);
                                          setEmailOtpError(null);
                                          try {
                                            await serversApi.verifyServerEmailOtp(selectedServer, emailOtpCode.trim());
                                            const status = await serversApi.getMyServerAccessStatus(selectedServer);
                                            setMyServerAccessStatus(status);
                                            setEmailOtpCode("");
                                            setEmailOtpSent(false);
                                          } catch (e: any) {
                                            setEmailOtpError(e?.message || t("chat.verify.otpInvalid"));
                                          } finally {
                                            setEmailOtpVerifying(false);
                                          }
                                        }}
                                        disabled={emailOtpVerifying || emailOtpCode.length < 4}
                                        style={{
                                          padding: "6px 16px",
                                          borderRadius: 4,
                                          border: "none",
                                          background: emailOtpVerifying || emailOtpCode.length < 4 ? "rgba(60, 65, 100, 0.45)" : "#23a55a",
                                          color: "#fff",
                                          fontWeight: 600,
                                          fontSize: 13,
                                          cursor: emailOtpVerifying || emailOtpCode.length < 4 ? "not-allowed" : "pointer",
                                        }}
                                      >
                                        {emailOtpVerifying ? t("chat.verify.verifyOtpSending") : t("chat.verify.verifyOtpBtn")}
                                      </button>
                                      {emailOtpCooldown <= 0 && (
                                        <button
                                          onClick={async () => {
                                            if (!selectedServer) return;
                                            setEmailOtpSending(true);
                                            setEmailOtpError(null);
                                            try {
                                              const res = await serversApi.requestServerEmailOtp(selectedServer);
                                              if (res.ok) {
                                                setEmailOtpCooldown(60);
                                              } else if (res.retryAfterSec) {
                                                setEmailOtpCooldown(res.retryAfterSec);
                                              }
                                            } catch (e: any) {
                                              setEmailOtpError(e?.message || t("chat.verify.resendError"));
                                            } finally {
                                              setEmailOtpSending(false);
                                            }
                                          }}
                                          disabled={emailOtpSending}
                                          style={{
                                            padding: "6px 12px",
                                            borderRadius: 4,
                                            border: "none",
                                            background: "transparent",
                                            color: "#5865f2",
                                            fontWeight: 600,
                                            fontSize: 12,
                                            cursor: emailOtpSending ? "not-allowed" : "pointer",
                                          }}
                                        >
                                          {t("chat.verify.resendOtp")}
                                        </button>
                                      )}
                                      {emailOtpCooldown > 0 && (
                                        <span style={{ fontSize: 12, color: "#4a5878" }}>{t("chat.verify.resendAfter").replace("{sec}", String(emailOtpCooldown))}</span>
                                      )}
                                    </div>
                                  )}
                                  {emailOtpError && (
                                    <div style={{ color: "#f06060", fontSize: 12, marginTop: 4 }}>{emailOtpError}</div>
                                  )}
                                </div>
                              )}
                            </div>
                          </li>
                        )}
                        {(lvl === "medium" || lvl === "high") && (
                          <li style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 8, color: chk.accountOver5Min ? "#23a55a" : "#dde2f0" }}>
                            <span style={{ flexShrink: 0 }}>{chk.accountOver5Min ? "✓" : "○"}</span>
                            <span>
                              {t("chat.verify.account5min")}
                              {!chk.accountOver5Min && wait.waitAccountSec != null && wait.waitAccountSec > 0 && (
                                <span style={{ color: "#4a5878", marginLeft: 6 }}>
                                  {t("chat.verify.waitApprox").replace("{time}", fmt(wait.waitAccountSec) ?? "")}
                                </span>
                              )}
                            </span>
                          </li>
                        )}
                        {lvl === "high" && (
                          <li style={{ display: "flex", gap: 8, alignItems: "flex-start", color: chk.memberOver10Min ? "#23a55a" : "#dde2f0" }}>
                            <span style={{ flexShrink: 0 }}>{chk.memberOver10Min ? "✓" : "○"}</span>
                            <span>
                              {t("chat.verify.member10min")}
                              {!chk.memberOver10Min && wait.waitMemberSec != null && wait.waitMemberSec > 0 && (
                                <span style={{ color: "#4a5878", marginLeft: 6 }}>
                                  {t("chat.verify.waitApprox").replace("{time}", fmt(wait.waitMemberSec) ?? "")}
                                </span>
                              )}
                            </span>
                          </li>
                        )}
                      </ul>
                    </div>
                  </div>
                )}

                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "auto", paddingTop: 20, gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => void submitVerificationRulesModal()}
                    disabled={submitDisabled}
                    style={{
                      border: "none",
                      background: submitDisabled ? "#3ba55d80" : "#23a55a",
                      color: "white",
                      padding: "10px 20px",
                      borderRadius: 4,
                      cursor: submitDisabled ? "not-allowed" : "pointer",
                      fontWeight: 700,
                      fontSize: 14,
                    }}
                  >
                    {verificationRulesSubmitting ? t("chat.verify.submitting") : t("chat.verify.submitBtn")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Create Server Modal */}
      <CreateServerModal
        isOpen={showCreateServerModal}
        onClose={() => setShowCreateServerModal(false)}
        onServerCreated={handleServerCreated}
      />

      {showMessagesInbox && (
        <MessagesInbox
          onClose={() => {
            setShowMessagesInbox(false);
            fetchInboxForYou()
              .then((res) => {
                const hasUnread = (res.items ?? []).some((i) => i.seen !== true);
                setHasInboxNotification(hasUnread);
              })
              .catch(() => setHasInboxNotification(false));
          }}
          onMarkSeen={() => {
            fetchInboxForYou()
              .then((res) => {
                const hasUnread = (res.items ?? []).some((i) => i.seen !== true);
                setHasInboxNotification(hasUnread);
              })
              .catch(() => setHasInboxNotification(false));
          }}
          onNavigateToChannel={(serverId, channelId) => {
            setSelectedServer(serverId);
            trySelectChannel(channelId);
            setShowMessagesInbox(false);
          }}
          onNavigateToDM={(userId, displayName, username, avatarUrl) => {
            setShowMessagesInbox(false);
            const existing = friends.find((f) => f._id === userId);
            const friend: serversApi.Friend = existing ?? {
              _id: userId,
              displayName: displayName || username,
              username: username || "",
              avatarUrl: avatarUrl ?? "",
              email: "",
            };
            if (!existing) setFriends((prev) => (prev.some((f) => f._id === userId) ? prev : [...prev, friend]));
            setSelectedDirectMessageFriend(friend);
            setSelectedServer(null);
            setSelectedChannel(null);
            loadDirectMessages(userId);
          }}
          onAcceptInvite={async (serverId) => {
            await loadServers();
            setSelectedServer(serverId);
            setSelectedChannel(null);
            void serversApi
              .getMyServerAccessStatus(serverId)
              .then(setMyServerAccessStatus)
              .catch(() => undefined);
          }}
          onApplyToJoinBeforeAccept={async (serverId, _inviteId) => {
            const opened = await openApplyJoinModalIfNeeded(serverId);
            return opened;
          }}
        />
      )}

      <MessageSearchPanel
        isOpen={showMessageSearch}
        onClose={() => {
          setShowMessageSearch(false);
          setMessageSearchDmConversationOnly(false);
        }}
        mode={selectedServer ? "server" : "dm"}
        dmConversationOnlySearch={messageSearchDmConversationOnly}
        serverId={selectedServer || undefined}
        serverName={currentServer?.name}
        channelId={selectedServer ? undefined : selectedChannel || undefined}
        channels={allChannels}
        members={selectedServer ? membersForMessageSearch : []}
        dmPeers={friends}
        serversForQuickSwitch={(selectedServer ? servers.filter((s) => s._id === selectedServer) : servers).map(
          (s) => ({
            _id: s._id,
            name: s.name || "",
            textChannels:
              s.textChannels?.length
                ? s.textChannels
                : (s.channels || []).filter(
                    (c) => c.type === "text" && c.category !== "info",
                  ),
            voiceChannels: s.voiceChannels?.length
              ? s.voiceChannels
              : (s.channels || []).filter((c) => c.type === "voice"),
          }),
        )}
        dmPartnerId={selectedDirectMessageFriend?._id}
        dmPartnerName={selectedDirectMessageFriend?.displayName || selectedDirectMessageFriend?.username}
        currentUserId={currentUserId}
        onResultClick={({ messageId, channelId, dmUserId }) => {
          setShowMessageSearch(false);
          setMessageSearchDmConversationOnly(false);
          if (selectedServer) {
            if (channelId) {
              trySelectChannel(channelId);
            }
            setPendingMessageJump({
              messageId,
              mode: "server",
              channelId: channelId || selectedChannel || undefined,
            });
            return;
          }

          if (dmUserId && selectedDirectMessageFriend?._id !== dmUserId) {
            const friend = friends.find((f) => f._id === dmUserId);
            if (friend) {
              void handleSelectDirectMessageFriend(friend);
            }
          }
          setPendingMessageJump({
            messageId,
            mode: "dm",
            dmUserId: dmUserId || selectedDirectMessageFriend?._id || undefined,
          });
        }}
        onQuickSwitchDm={(userId) => {
          setShowMessageSearch(false);
          setMessageSearchDmConversationOnly(false);
          const friend = friends.find((f) => f._id === userId);
          if (friend) void handleSelectDirectMessageFriend(friend);
        }}
        onQuickSwitchChannel={(sid, cid) => {
          setShowMessageSearch(false);
          setMessageSearchDmConversationOnly(false);
          setSelectedDirectMessageFriend(null);
          pendingChannelSelectRef.current = { serverId: sid, channelId: cid };
          setSelectedServer(sid);
        }}
        onQuickSwitchServer={(sid) => {
          setShowMessageSearch(false);
          setMessageSearchDmConversationOnly(false);
          setSelectedDirectMessageFriend(null);
          setSelectedServer(sid);
        }}
      />

      <CreateChannelModal
        isOpen={showCreateChannelModal}
        onClose={() => setShowCreateChannelModal(false)}
        defaultType={createChannelDefaultType}
        onCreateChannel={handleCreateChannel}
      />

      <CreateCategoryModal
        isOpen={showCreateCategoryModal}
        onClose={() => setShowCreateCategoryModal(false)}
        onCreateCategory={handleCreateCategory}
      />

      <EventsPopup
        isOpen={showEventsPopup}
        onClose={() => setShowEventsPopup(false)}
        serverId={selectedServer}
        onOpenCreateWizard={openCreateEventWizard}
        canManageEvents={canManageEventsOnServer}
      />

      {inviteToServerTarget && (
        <InviteToServerPopup
          isOpen
          onClose={() => setInviteToServerTarget(null)}
          serverId={inviteToServerTarget.serverId}
          serverName={inviteToServerTarget.serverName}
          friends={inviteToServerCandidates}
          initialInvitedIds={inviteToServerInitialInvitedIds}
          canCreateInvite={
            inviteToServerTarget.serverId === selectedServer &&
            serverPermissionsReady
              ? canCreateInviteOnCurrentServer
              : inviteToServerTarget.canCreateInvite
          }
        />
      )}

      {adminServerContextMenu && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 9998 }}
            onClick={() => setAdminServerContextMenu(null)}
            onContextMenu={(e) => { e.preventDefault(); setAdminServerContextMenu(null); }}
          />
          <div
            style={{
              position: "fixed",
              left: adminServerContextMenu.x,
              top: adminServerContextMenu.y,
              zIndex: 9999,
              background: "var(--color-panel-bg)",
              borderRadius: 6,
              boxShadow: "0 4px 16px rgba(0,0,0,.4)",
              padding: "4px 0",
              minWidth: 180,
            }}
          >
            <button
              type="button"
              onClick={async () => {
                setAdminServerContextMenu(null);
                const t = localStorage.getItem("accessToken") || "";
                if (adminViewServerId && t) {
                  await serversApi.adminLeaveServer(adminViewServerId, t);
                }
                localStorage.removeItem("accessToken");
                if (adminReturnUrl) window.location.href = adminReturnUrl;
              }}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                width: "100%", padding: "8px 12px", border: "none",
                background: "transparent", color: "var(--color-text)",
                fontSize: 14, cursor: "pointer", textAlign: "left",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--color-primary)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              Rời khỏi
            </button>
          </div>
        </>
      )}

      {serverContextMenu && (
        <ServerLanguageOverrideProvider
          enabled={contextMenuLangOverride.enabled}
          language={contextMenuLangOverride.language}
        >
        <ServerContextMenu
          x={serverContextMenu.x}
          y={serverContextMenu.y}
          server={{
            _id: serverContextMenu.server._id,
            name: serverContextMenu.server.name,
            ownerId: String(
              (serverContextMenu.server as any).ownerId?._id ?? (serverContextMenu.server as any).ownerId ?? ""
            ),
          }}
          permissions={serverContextMenu.permissions ?? {
            isOwner: currentUserId !== "" &&
              String((serverContextMenu.server as any).ownerId?._id ?? (serverContextMenu.server as any).ownerId) === currentUserId,
            canManageServer: currentUserId !== "" &&
              String((serverContextMenu.server as any).ownerId?._id ?? (serverContextMenu.server as any).ownerId) === currentUserId,
            canManageChannels: currentUserId !== "" &&
              String((serverContextMenu.server as any).ownerId?._id ?? (serverContextMenu.server as any).ownerId) === currentUserId,
            canManageEvents: currentUserId !== "" &&
              String((serverContextMenu.server as any).ownerId?._id ?? (serverContextMenu.server as any).ownerId) === currentUserId,
            canCreateInvite: currentServerPermissions?.canCreateInvite ?? (currentUserId !== "" &&
              String((serverContextMenu.server as any).ownerId?._id ?? (serverContextMenu.server as any).ownerId) === currentUserId),
          }}
          onClose={() => setServerContextMenu(null)}
          onMarkAsRead={() => setServerContextMenu(null)}
          onInviteToServer={() => {
            setInviteToServerTarget({
              serverId: serverContextMenu.server._id,
              serverName: serverContextMenu.server.name || "Máy chủ",
              canCreateInvite: Boolean(
                serverContextMenu.permissions?.canCreateInvite ??
                  serverContextMenu.permissions?.isOwner,
              ),
            });
            setServerContextMenu(null);
          }}
          onMuteServer={(duration) => {
            if (!currentUserId) return;
            const { mutedUntil, mutedForever } = sidebarPrefs.muteKeyToUntil(duration);
            sidebarPrefs.setServerMute(currentUserId, serverContextMenu.server._id, mutedUntil, mutedForever);
            bumpSidebarPrefs();
            setServerContextMenu(null);
          }}
          onUnmuteServer={() => {
            if (!currentUserId) return;
            sidebarPrefs.clearServerMute(currentUserId, serverContextMenu.server._id);
            bumpSidebarPrefs();
            setServerContextMenu(null);
          }}
          onSetNotificationLevel={(level) => {
            if (!currentUserId) return;
            sidebarPrefs.setServerNotify(currentUserId, serverContextMenu.server._id, level);
            if (serverContextMenu.server._id === selectedServer) {
              setServerNotificationLevel(level);
            }
            bumpSidebarPrefs();
            setServerContextMenu(null);
          }}
          hideMutedChannels={
            !!currentUserId &&
            !!serverContextMenu &&
            sidebarPrefs.getServerPrefs(currentUserId, serverContextMenu.server._id).hideMutedChannels === true
          }
          onToggleHideMutedChannels={() => {
            if (!currentUserId || !serverContextMenu) return;
            const sid = serverContextMenu.server._id;
            const cur = sidebarPrefs.getServerPrefs(currentUserId, sid).hideMutedChannels === true;
            sidebarPrefs.setServerHideMutedChannels(currentUserId, sid, !cur);
            bumpSidebarPrefs();
          }}
          showAllChannels={showAllChannels}
          onToggleShowAllChannels={() => setShowAllChannels((v) => !v)}
          onServerSettings={() => {
            setServerSettingsTarget({
              serverId: serverContextMenu.server._id,
              serverName: serverContextMenu.server.name || "Máy chủ",
            });
            setServerSettingsPermissions(serverContextMenu.permissions ?? null);
            serversApi.getCommunitySettings(serverContextMenu.server._id)
              .then((c) => setCommunityEnabled(c.enabled))
              .catch(() => setCommunityEnabled(false));
            setShowServerSettingsPanel(true);
            setServerContextMenu(null);
          }}
          onCreateChannel={() => {
            setSelectedServer(serverContextMenu.server._id);
            setCreateChannelDefaultType("text");
            setCreateChannelSectionLabel("");
            setCreateChannelCategoryId(undefined);
            setShowCreateChannelModal(true);
            setServerContextMenu(null);
          }}
          onCreateCategory={() => {
            setSelectedServer(serverContextMenu.server._id);
            setShowCreateCategoryModal(true);
            setServerContextMenu(null);
          }}
          onCreateEvent={() => {
            setSelectedServer(serverContextMenu.server._id);
            setShowEventsPopup(true);
            if (serverContextMenu.server._id) loadActiveEvents(serverContextMenu.server._id);
            setServerContextMenu(null);
          }}
          onLeaveServer={async () => {
            const serverId = serverContextMenu.server._id;
            try {
              await serversApi.leaveServer(serverId);
              setServers((prev) => prev.filter((s) => s._id !== serverId));
              if (selectedServer === serverId) {
                setSelectedServer(null);
                setSelectedChannel(null);
              }
              setServerContextMenu(null);
            } catch (err) {
              console.error(err);
              showNoticePopup(
                (err as Error)?.message ?? "Không thể rời máy chủ",
              );
            }
          }}
          notificationLevel={
            currentUserId
              ? sidebarPrefs.getServerPrefs(currentUserId, serverContextMenu.server._id).serverNotify ?? "all"
              : "all"
          }
          suppressEveryoneHere={
            !!currentUserId &&
            !!sidebarPrefs.getServerPrefs(currentUserId, serverContextMenu.server._id).suppressEveryoneHere
          }
          suppressRoleMentions={
            !!currentUserId &&
            !!sidebarPrefs.getServerPrefs(currentUserId, serverContextMenu.server._id).suppressRoleMentions
          }
          onSetSuppressEveryoneHere={(v) => {
            if (!currentUserId) return;
            sidebarPrefs.setServerSuppressFlags(currentUserId, serverContextMenu.server._id, {
              suppressEveryoneHere: v,
            });
            bumpSidebarPrefs();
          }}
          onSetSuppressRoleMentions={(v) => {
            if (!currentUserId) return;
            sidebarPrefs.setServerSuppressFlags(currentUserId, serverContextMenu.server._id, {
              suppressRoleMentions: v,
            });
            bumpSidebarPrefs();
          }}
          serverMuted={
            !!(currentUserId
              ? sidebarPrefs.isServerMuted(
                  sidebarPrefs.getServerPrefs(currentUserId, serverContextMenu.server._id),
                )
              : false)
          }
        />
        </ServerLanguageOverrideProvider>
      )}

      {dmContextMenu && (
        <DmConversationContextMenu
          x={dmContextMenu.x}
          y={dmContextMenu.y}
          peerName={
            dmContextMenu.friend.displayName ||
            dmContextMenu.friend.username ||
            ""
          }
          preferences={
            dmConversationPrefs[dmContextMenu.friend._id] ??
            emptyDmConversationPreferences()
          }
          isFollowing={followingIds.has(dmContextMenu.friend._id)}
          isBlockedByMe={dmBlockedByMe.has(dmContextMenu.friend._id)}
          onClose={() => setDmContextMenu(null)}
          onMute={(patch) =>
            void handleDmMutePreference(dmContextMenu.friend._id, patch)
          }
          onCategory={(category) =>
            void handleDmCategoryPreference(dmContextMenu.friend._id, category)
          }
          onUnfollow={() =>
            void handleDmUnfollowPeer(dmContextMenu.friend._id)
          }
          onBlock={() => void handleDmBlockPeer(dmContextMenu.friend._id)}
          onUnblock={() => void handleDmUnblockPeer(dmContextMenu.friend._id)}
        />
      )}

      {channelContextMenu && selectedServer && currentUserId && (() => {
        const sp = sidebarPrefs.getServerPrefs(currentUserId, selectedServer);
        const chId = channelContextMenu.channel._id;
        const catId = channelContextMenu.categoryId;
        const catPref = catId ? sp.categories[catId] : undefined;
        const chPref = sp.channels[chId];
        const categoryNotify: CategoryNotifyMode = catPref?.notify ?? "inherit_server";
        const channelNotify: ChannelNotifyMode = chPref?.notify ?? "inherit_category";
        const channelMuted = sidebarPrefs.isChannelMuted(chPref);
        const origin = typeof window !== "undefined" ? window.location.origin : "";
        return (
          <ChannelContextMenu
            x={channelContextMenu.x}
            y={channelContextMenu.y}
            categoryId={catId}
            channel={channelContextMenu.channel}
            canManageChannelsStructure={canManageChannelsStructure}
            serverNotificationLevel={serverNotificationLevel}
            categoryNotifyMode={categoryNotify}
            channelNotifyMode={channelNotify}
            channelMuted={channelMuted}
            isMemberOfServer
            onClose={() => setChannelContextMenu(null)}
            onInviteToChannel={() => {
              trySelectChannel(channelContextMenu.channel._id);
            }}
            onCopyChannelLink={() => {
              const url = `${origin}/invite/server/${selectedServer}/${chId}`;
              void navigator.clipboard?.writeText(url).catch(async () => {
                await appPrompt("Sao chép liên kết:", url);
              });
            }}
            onMarkAsRead={() => serversApi.markChannelAsRead(chId)}
            onMuteChannel={(duration) => {
              const { mutedUntil, mutedForever } = sidebarPrefs.muteKeyToUntil(duration);
              sidebarPrefs.setChannelMute(currentUserId, selectedServer, chId, mutedUntil, mutedForever);
              bumpSidebarPrefs();
            }}
            onUnmuteChannel={() => {
              sidebarPrefs.clearChannelMute(currentUserId, selectedServer, chId);
              bumpSidebarPrefs();
            }}
            onSetChannelNotify={(mode) => {
              sidebarPrefs.setChannelNotify(currentUserId, selectedServer, chId, mode);
              bumpSidebarPrefs();
            }}
            onJoinServerThenOpenChannel={async () => {
              const opened = await openApplyJoinModalIfNeeded(selectedServer);
              if (opened) return;
              await serversApi.joinServer(selectedServer);
              await loadServers();
              if (selectedServer) {
                void serversApi
                  .getMyServerAccessStatus(selectedServer)
                  .then(setMyServerAccessStatus)
                  .catch(() => undefined);
              }
            }}
            onEditChannel={handleEditChannel}
            onDeleteChannel={handleDeleteChannel}
          />
        );
      })()}

      <ApplyToJoinQuestionsModal
        open={Boolean(applyJoinOpen && applyJoinForm && applyJoinServerId)}
        onClose={() => {
          if (applyJoinSubmitting) return;
          setApplyJoinOpen(false);
          setApplyJoinServerId(null);
          setApplyJoinForm(null);
          setError(null);
        }}
        server={{
          name: applyJoinServerMeta?.name ?? "Máy chủ",
          avatarUrl: applyJoinServerMeta?.avatarUrl,
          bannerUrl: applyJoinServerMeta?.bannerUrl,
          bannerImageUrl: applyJoinServerMeta?.bannerImageUrl,
          bannerColor: applyJoinServerMeta?.bannerColor,
          memberCount: applyJoinServerMeta?.memberCount,
          createdAt: applyJoinServerMeta?.createdAt,
        }}
        questions={applyJoinForm?.questions ?? []}
        submitting={applyJoinSubmitting}
        error={applyJoinOpen ? error : null}
        onSubmit={submitApplyJoin}
      />

      {categoryContextMenu && selectedServer && currentUserId && (() => {
        const sp = sidebarPrefs.getServerPrefs(currentUserId, selectedServer);
        const catId = categoryContextMenu.category._id;
        const catPref = sp.categories[catId];
        const categoryNotify: CategoryNotifyMode = catPref?.notify ?? "inherit_server";
        const categoryMuted = sidebarPrefs.isCategoryMuted(catPref);
        const collapseUiEnabled = Boolean(catPref?.collapseUiEnabled);
        const allCatIds = serverCategories.map((c) => c._id);
        return (
          <CategoryContextMenu
            x={categoryContextMenu.x}
            y={categoryContextMenu.y}
            category={categoryContextMenu.category}
            canManageChannelsStructure={canManageChannelsStructure}
            serverNotificationLevel={serverNotificationLevel}
            categoryNotifyMode={categoryNotify}
            collapseUiEnabled={collapseUiEnabled}
            categoryMuted={categoryMuted}
            onClose={() => setCategoryContextMenu(null)}
            onMarkAsRead={async () => {
              const list =
                catId === UNCATEGORIZED_CATEGORY_ID
                  ? getUncategorizedChannels()
                  : allChannels.filter((ch) => ch.categoryId === catId);
              for (const ch of list) {
                await serversApi.markChannelAsRead(ch._id).catch(() => {});
              }
            }}
            onToggleCollapseUi={(enabled) => {
              sidebarPrefs.setCategoryCollapseUi(currentUserId, selectedServer, catId, enabled);
              bumpSidebarPrefs();
            }}
            onCollapseAllCategories={() => {
              sidebarPrefs.collapseAllCategories(currentUserId, selectedServer, allCatIds);
              bumpSidebarPrefs();
            }}
            onMuteCategory={(duration) => {
              const { mutedUntil, mutedForever } = sidebarPrefs.muteKeyToUntil(duration);
              sidebarPrefs.setCategoryMute(currentUserId, selectedServer, catId, mutedUntil, mutedForever);
              bumpSidebarPrefs();
            }}
            onUnmuteCategory={() => {
              sidebarPrefs.clearCategoryMute(currentUserId, selectedServer, catId);
              bumpSidebarPrefs();
            }}
            onSetCategoryNotify={(mode) => {
              sidebarPrefs.setCategoryNotify(currentUserId, selectedServer, catId, mode);
              bumpSidebarPrefs();
            }}
            onEditCategory={() => {
              setRenamingCategoryId(categoryContextMenu.category._id);
              setRenamingCategoryName(categoryContextMenu.category.name);
            }}
            onDeleteCategory={async () => {
              if (catId === UNCATEGORIZED_CATEGORY_ID) {
                if (
                  await appConfirm(
                    'Bạn có chắc muốn xóa danh mục "Kênh khác"? Tất cả kênh bên trong (trừ kênh mặc định) sẽ bị xóa.',
                  )
                ) {
                  handleDeleteUncategorizedCategory();
                }
                return;
              }
              if (await appConfirm(`Bạn có chắc muốn xóa danh mục "${categoryContextMenu.category.name}"? Các kênh bên trong sẽ không bị xóa.`)) {
                handleDeleteCategory(catId);
              }
            }}
          />
        );
      })()}

      <ServerLanguageOverrideProvider
        enabled={settingsLangOverride.enabled}
        language={settingsLangOverride.language}
      >
      <ServerSettingsPanel
        isOpen={showServerSettingsPanel}
        onClose={() => {
          setShowServerSettingsPanel(false);
          setServerSettingsTarget(null);
          setServerSettingsPermissions(null);
        }}
        serverName={serverSettingsTarget?.serverName ?? ""}
        serverId={serverSettingsTarget?.serverId ?? ""}
        initialSection={serverSettingsTarget?.initialSection}
        isOwner={
          !!(
            serverSettingsTarget?.serverId &&
            currentUserId &&
            servers.find((s) => s._id === serverSettingsTarget.serverId)?.ownerId === currentUserId
          )
        }
        communityEnabled={communityEnabled}
        onCommunityActivated={() => {
          setCommunityEnabled(true);
          if (selectedServer) loadChannels(selectedServer);
        }}
        onDeleteServer={async (serverIdToDelete) => {
          await serversApi.deleteServer(serverIdToDelete);
          setShowServerSettingsPanel(false);
          setServerSettingsTarget(null);
          setSelectedServer(null);
          await loadServers();
        }}
        renderSection={(section) => {
          if (section === "profile" && serverSettingsTarget?.serverId) {
            const serverData =
              servers.find((s) => s._id === serverSettingsTarget.serverId) ?? null;
            return (
              <ServerProfileSection
                serverId={serverSettingsTarget.serverId}
                token={token}
                canManageSettings={
                  Boolean(serverSettingsPermissions?.isOwner) ||
                  Boolean(serverSettingsPermissions?.canManageServer)
                }
                initialServer={serverData}
                onUpdated={(updated) => {
                  setServers((prev) =>
                    prev.map((s) =>
                      s._id === updated._id
                        ? ({
                            ...s,
                            name: updated.name,
                            description: updated.description,
                            avatarUrl: updated.avatarUrl,
                            bannerUrl: (updated as any).bannerUrl,
                            profileTraits: (updated as any).profileTraits,
                          } as any)
                        : s,
                    ),
                  );
                  setServerSettingsTarget((prev) =>
                    prev && prev.serverId === updated._id
                      ? { ...prev, serverName: updated.name || prev.serverName }
                      : prev,
                  );
                }}
              />
            );
          }
          if (section === "members" && serverSettingsTarget?.serverId) {
            return (
              <ServerMembersSection
                serverId={serverSettingsTarget.serverId}
                isOwner={
                  !!(
                    currentUserId &&
                    servers.find((s) => s._id === serverSettingsTarget?.serverId)?.ownerId === currentUserId
                  )
                }
                canManageServer={Boolean(currentServerPermissions?.canManageServer || currentServerPermissions?.isOwner)}
                currentUserId={currentUserId ?? ""}
                token={token}
                onNavigateToDM={(userId, displayName, username, avatarUrl) => {
                  setShowServerSettingsPanel(false);
                  setServerSettingsTarget(null);
                  const existing = friends.find((f) => f._id === userId);
                  const friend: serversApi.Friend = existing ?? {
                    _id: userId,
                    displayName: displayName || username,
                    username: username || "",
                    avatarUrl: avatarUrl ?? "",
                    email: "",
                  };
                  if (!existing) setFriends((prev) => (prev.some((f) => f._id === userId) ? prev : [...prev, friend]));
                  setSelectedDirectMessageFriend(friend);
                  setSelectedServer(null);
                  setSelectedChannel(null);
                  loadDirectMessages(userId);
                }}
                onOwnershipTransferred={async () => {
                  setShowServerSettingsPanel(false);
                  setServerSettingsTarget(null);
                  await loadServers();
                }}
              />
            );
          }
          if (section === "roles" && serverSettingsTarget?.serverId) {
            return (
              <RolesSection
                serverId={serverSettingsTarget.serverId}
                isOwner={
                  Boolean(serverSettingsPermissions?.isOwner) ||
                  Boolean(serverSettingsPermissions?.canManageServer)
                }
              />
            );
          }
          if (section === "interactions" && serverSettingsTarget?.serverId) {
            return (
              <ServerInteractionsSection
                serverId={serverSettingsTarget.serverId}
                canManageSettings={
                  Boolean(serverSettingsPermissions?.isOwner) ||
                  Boolean(serverSettingsPermissions?.canManageServer)
                }
                textChannels={allChannels.filter((c) => c.type !== "voice")}
                onSettingsChange={(next) => {
                  if (serverSettingsTarget.serverId === selectedServer) {
                    setServerInteractionSettings(next);
                    const stickerEnabled = next.stickerReplyWelcomeEnabled !== false;
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.messageType === "welcome"
                          ? { ...m, stickerReplyWelcomeEnabled: stickerEnabled }
                          : m,
                      ),
                    );
                  }
                }}
              />
            );
          }
          if (section === "access" && serverSettingsTarget?.serverId) {
            return (
              <ServerAccessSection
                serverId={serverSettingsTarget.serverId}
                canManageSettings={
                  Boolean(serverSettingsPermissions?.isOwner) ||
                  Boolean(serverSettingsPermissions?.canManageServer)
                }
              />
            );
          }
          if (section === "bans" && serverSettingsTarget?.serverId) {
            return (
              <ServerBansSection
                serverId={serverSettingsTarget.serverId}
                canManageBans={
                  Boolean(serverSettingsPermissions?.isOwner) ||
                  Boolean(serverSettingsPermissions?.canBan)
                }
              />
            );
          }
          if (section === "automod" && serverSettingsTarget?.serverId) {
            return (
              <AutoModSection
                serverId={serverSettingsTarget.serverId}
                canManageSettings={
                  Boolean(serverSettingsPermissions?.isOwner) ||
                  Boolean(serverSettingsPermissions?.canManageServer)
                }
              />
            );
          }
          if (section === "safety" && serverSettingsTarget?.serverId) {
            const initialTab = mapSectionToSafetyTab(section);
            return (
              <ServerSafetySection
                serverId={serverSettingsTarget.serverId}
                canManageSettings={
                  Boolean(serverSettingsPermissions?.isOwner) ||
                  Boolean(serverSettingsPermissions?.canManageServer)
                }
                initialTab={initialTab}
              />
            );
          }
          if (section === "community" && serverSettingsTarget?.serverId) {
            return (
              <CommunitySection
                serverId={serverSettingsTarget.serverId}
                canManageSettings={
                  Boolean(serverSettingsPermissions?.isOwner) ||
                  Boolean(serverSettingsPermissions?.canManageServer)
                }
                onCommunityActivated={() => {
                  setCommunityEnabled(true);
                  if (selectedServer) loadChannels(selectedServer);
                }}
              />
            );
          }
          if (section === "community-overview" && serverSettingsTarget?.serverId) {
            const serverData =
              servers.find((s) => s._id === serverSettingsTarget.serverId) ?? null;
            return (
              <CommunityOverviewSection
                serverId={serverSettingsTarget.serverId}
                canManageSettings={
                  Boolean(serverSettingsPermissions?.isOwner) ||
                  Boolean(serverSettingsPermissions?.canManageServer)
                }
                initialServer={serverData as any}
                onUpdated={(patch) => {
                  setServers((prev) =>
                    prev.map((s) =>
                      s._id === serverSettingsTarget.serverId
                        ? ({ ...s, ...patch } as any)
                        : s,
                    ),
                  );
                }}
              />
            );
          }
          if (section === "emoji" && serverSettingsTarget?.serverId && token) {
            const canManageEmoji =
              Boolean(serverSettingsPermissions?.isOwner) ||
              Boolean(serverSettingsPermissions?.canManageServer) ||
              Boolean(serverSettingsPermissions?.canManageExpressions);
            return (
              <ServerEmojiSection
                serverId={serverSettingsTarget.serverId}
                token={token}
                canManage={canManageEmoji}
                onEmojisChanged={() => {
                  if (serverSettingsTarget.serverId === selectedServer) {
                    void refreshServerEmojiMap();
                  }
                }}
              />
            );
          }
          if (section === "sticker" && serverSettingsTarget?.serverId && token) {
            const canManageSticker =
              Boolean(serverSettingsPermissions?.isOwner) ||
              Boolean(serverSettingsPermissions?.canManageServer) ||
              Boolean(serverSettingsPermissions?.canManageExpressions);
            return (
              <ServerStickerSection
                serverId={serverSettingsTarget.serverId}
                token={token}
                canManage={canManageSticker}
                isServerOwner={Boolean(serverSettingsPermissions?.isOwner)}
                onOpenBoostSubscribe={() => {
                  setShowServerSettingsPanel(false);
                  setServerSettingsTarget(null);
                  setServerSettingsPermissions(null);
                  setShowExploreView(false);
                  setShowJoinApplicationsView(false);
                  setSelectedDirectMessageFriend(null);
                  setShowBoostUpgradeView(true);
                  setBoostModalOpen(false);
                  setBoostModalStep("plan");
                  setBoostMode("subscribe");
                }}
              />
            );
          }
          return undefined;
        }}
      />
      </ServerLanguageOverrideProvider>

      {selectedServer && canManageEventsOnServer && (
        <CreateEventWizard
          isOpen={showCreateEventWizard}
          onClose={() => setShowCreateEventWizard(false)}
          serverId={selectedServer}
          textChannels={textChannels}
          voiceChannels={voiceChannels}
          onCreateSuccess={handleEventCreated}
          onOpenImageEditor={handleOpenEventImageEditor}
        />
      )}

      <EventImageEditor
        isOpen={showEventImageEditor}
        onClose={handleEventImageEditorClose}
        currentImageUrl={eventImageEditorCurrentUrl}
        onConfirm={handleEventImageEditorConfirm}
      />

      <ShareEventPopup
        isOpen={showShareEventPopup}
        onClose={() => {
          setShowShareEventPopup(false);
          if (selectedServer) loadActiveEvents(selectedServer);
        }}
        shareLink={shareEventLink}
      />

      {createdEventDetail && (
        <EventCreatedDetailPopup
          isOpen
          onClose={() => {
            setCreatedEventDetail(null);
            if (selectedServer) loadActiveEvents(selectedServer);
          }}
          event={createdEventDetail}
          serverName={currentServer?.name ?? ""}
          serverId={selectedServer ?? undefined}
          shareLink={shareEventLink}
          onStart={async () => {
            if (!selectedServer) return;
            await serversApi.startServerEvent(selectedServer, createdEventDetail._id);
            setCreatedEventDetail(null);
            loadActiveEvents(selectedServer);
          }}
        />
      )}

      {/* Modal Chi Tiết Sự Kiện */}
      {selectedEventDetail && (() => {
        const isLive = selectedEventDetail.status === "live";
        const isScheduled = selectedEventDetail.status === "scheduled" || !selectedEventDetail.status;
        const isOwnerOrMod = currentServer?.members?.some(
          (m: { userId: string; role: string }) =>
            m.userId === currentUserId && (m.role === "owner" || m.role === "moderator")
        );
        const minsUntilStart = (new Date(selectedEventDetail.startAt).getTime() - Date.now()) / 60000;
        const countdownStr =
          minsUntilStart < 0
            ? "Đã bắt đầu"
            : minsUntilStart < 1
              ? "Bắt đầu trong vài giây"
              : minsUntilStart < 60
                ? `Bắt đầu sau ${Math.floor(minsUntilStart)} phút nữa`
                : `Bắt đầu sau ${Math.floor(minsUntilStart / 60)} giờ ${Math.floor(minsUntilStart % 60)} phút nữa`;
        const startDateStr = new Date(selectedEventDetail.startAt).toLocaleDateString("vi-VN", {
          weekday: "short",
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        });
        const endTimeStr = new Date(selectedEventDetail.endAt).toLocaleTimeString("vi-VN", {
          hour: "2-digit",
          minute: "2-digit",
        });
        return (
          <div
            className={styles.eventDetailOverlay}
            onClick={() => {
              setSelectedEventDetail(null);
              if (selectedServer) loadActiveEvents(selectedServer);
            }}
            role="dialog"
            aria-modal
          >
            <div
              className={styles.eventDetailModal}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className={styles.eventDetailClose}
                onClick={() => {
                  setSelectedEventDetail(null);
                  if (selectedServer) loadActiveEvents(selectedServer);
                }}
                aria-label={t("chat.profile.close")}
              >
                ×
              </button>
              <div className={styles.eventDetailHeader}>
                <span className={styles.eventDetailIcon}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                </span>
                <h2 className={styles.eventDetailHeaderTitle}>1 Sự kiện</h2>
                <button
                  type="button"
                  className={styles.eventDetailCreateBtn}
                  onClick={() => {
                    setSelectedEventDetail(null);
                    setShowEventsPopup(true);
                    if (selectedServer) loadActiveEvents(selectedServer);
                  }}
                >
                  Tạo Sự kiện
                </button>
              </div>
              {selectedEventDetail.coverImageUrl && (
                <img
                  src={selectedEventDetail.coverImageUrl}
                  alt=""
                  className={styles.eventDetailBanner}
                />
              )}
              {isScheduled && (
                <>
                  <div className={styles.eventDetailCountdown}>{countdownStr}</div>
                  <div className={styles.eventDetailStartDate}>{startDateStr}</div>
                </>
              )}
              {isLive && (
                <div className={styles.eventDetailMeta}>
                  <span className={styles.eventDetailLive}>
                    <span className={styles.activeEventDot} />
                    {t("chat.sidebar.eventDetailLive", { time: endTimeStr })}
                  </span>
                </div>
              )}
              <h3 className={styles.eventDetailTitle}>{selectedEventDetail.topic}</h3>
              <div className={styles.eventDetailRow}>
                <span className={styles.eventDetailIcon}>📍</span>
                <span>
                  {t("chat.sidebar.eventDetailHostedBy", { name: currentServer?.name ?? "" })}
                  {selectedEventDetail.channelId
                    ? ` > # ${selectedEventDetail.channelId.name}`
                    : ""}
                </span>
              </div>
              {selectedEventDetail.description && (
                <p className={styles.eventDetailDesc}>{selectedEventDetail.description}</p>
              )}
              <div className={styles.eventDetailActions}>
                <button
                  type="button"
                  className={styles.eventDetailCopyBtn}
                  onClick={async () => {
                    const link =
                      currentServer?._id && selectedEventDetail._id
                        ? serversApi.getEventShareLink(currentServer._id, selectedEventDetail._id)
                        : "";
                    try {
                      if (link) await navigator.clipboard.writeText(link);
                    } catch (e) {
                      console.error(e);
                    }
                  }}
                >
                  {t("chat.sidebar.eventDetailCopyLink")}
                </button>
                <button
                  type="button"
                  className={`${styles.eventDetailJoinBtn} ${eventDetailInterested ? styles.eventDetailInterestedActive : ""}`}
                  onClick={() => setEventDetailInterested((v) => !v)}
                >
                  {t("chat.sidebar.eventDetailInterested")}
                </button>
                {isScheduled && isOwnerOrMod && (
                  <button
                    type="button"
                    className={styles.eventDetailStartBtn}
                    onClick={async () => {
                      if (!selectedServer) return;
                      try {
                        const updated = await serversApi.startServerEvent(selectedServer, selectedEventDetail._id);
                        setSelectedEventDetail({ ...selectedEventDetail, status: updated.status });
                        loadActiveEvents(selectedServer);
                      } catch (e) {
                        console.error(e);
                      }
                    }}
                  >
                    {t("chat.sidebar.eventDetailStart")}
                  </button>
                )}
                {isLive && isOwnerOrMod && (
                  <button
                    type="button"
                    className={styles.eventDetailEndBtn}
                    onClick={async () => {
                      if (!selectedServer) return;
                      try {
                        await serversApi.endServerEvent(selectedServer, selectedEventDetail._id);
                        setSelectedEventDetail(null);
                        if (selectedServer) loadActiveEvents(selectedServer);
                      } catch (e) {
                        console.error(e);
                      }
                    }}
                  >
                    {t("chat.sidebar.eventDetailEnd")}
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Create Poll Modal */}
      {showCreatePollModal && (
        <div className={styles.modalOverlay} onClick={handleCancelPoll}>
          <div
            className={styles.createPollModal}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.pollModalHeader}>
              <h2>{t("chat.createPoll.title")}</h2>
              <button
                type="button"
                className={styles.closeButton}
                aria-label={t("chat.createPoll.closeAria")}
                onClick={handleCancelPoll}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>

            <div className={styles.pollModalBody}>
              {/* Question */}
              <div className={styles.pollField}>
                <label className={styles.pollLabel}>{t("chat.createPoll.questionLabel")}</label>
                <div className={styles.pollInputWrapper}>
                  <input
                    type="text"
                    className={styles.pollInput}
                    placeholder={t("chat.createPoll.questionPlaceholder")}
                    value={pollQuestion}
                    onChange={(e) => setPollQuestion(e.target.value)}
                    maxLength={300}
                  />
                  <span className={styles.charCounter}>
                    {pollQuestion.length} / 300
                  </span>
                </div>
              </div>

              {/* Options */}
              <div className={styles.pollField}>
                <label className={styles.pollLabel}>{t("chat.createPoll.optionsLabel")}</label>
                {pollOptions.map((option, index) => (
                  <div key={index} className={styles.pollOptionRow}>
                    <button type="button" className={styles.emojiButton}>
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <circle cx="12" cy="12" r="10"></circle>
                        <path d="M8 14s1.5 2 4 2 4-2 4-2"></path>
                        <line x1="9" y1="9" x2="9.01" y2="9"></line>
                        <line x1="15" y1="9" x2="15.01" y2="9"></line>
                      </svg>
                    </button>
                    <input
                      type="text"
                      className={styles.pollOptionInput}
                      placeholder={t("chat.createPoll.optionPlaceholder")}
                      value={option}
                      onChange={(e) =>
                        handlePollOptionChange(index, e.target.value)
                      }
                    />
                    {pollOptions.length > 2 && (
                      <button
                        type="button"
                        className={styles.deleteOptionButton}
                        onClick={() => handleRemovePollOption(index)}
                      >
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <polyline points="3 6 5 6 21 6"></polyline>
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  className={styles.addOptionButton}
                  onClick={handleAddPollOption}
                >
                  + {t("chat.createPoll.addOption")}
                </button>
              </div>

              {/* Duration */}
              <div className={styles.pollField}>
                <label className={styles.pollLabel}>{t("chat.createPoll.durationLabel")}</label>
                <select
                  className={styles.pollSelect}
                  value={pollDuration}
                  onChange={(e) => setPollDuration(Number(e.target.value))}
                >
                  <option value={1}>{t("chat.createPoll.duration1h")}</option>
                  <option value={4}>{t("chat.createPoll.duration4h")}</option>
                  <option value={8}>{t("chat.createPoll.duration8h")}</option>
                  <option value={24}>{t("chat.createPoll.duration24h")}</option>
                  <option value={72}>{t("chat.createPoll.duration3d")}</option>
                  <option value={168}>{t("chat.createPoll.duration7d")}</option>
                </select>
              </div>

              {/* Allow Multiple */}
              <div className={styles.pollCheckboxRow}>
                <input
                  type="checkbox"
                  id="allowMultiple"
                  checked={pollAllowMultiple}
                  onChange={(e) => setPollAllowMultiple(e.target.checked)}
                />
                <label htmlFor="allowMultiple">{t("chat.createPoll.allowMultiple")}</label>
              </div>
            </div>

            <div className={styles.pollModalFooter}>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={handleCancelPoll}
              >
                {t("chat.createPoll.cancel")}
              </button>
              <button
                type="button"
                className={styles.submitButton}
                onClick={handleSubmitPoll}
              >
                {t("chat.createPoll.submit")}
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div
          style={{
            position: "fixed",
            bottom: "20px",
            left: "20px",
            background: "rgba(239, 68, 68, 0.92)",
            color: "#fff",
            padding: "12px 16px",
            borderRadius: "10px",
            zIndex: 1001,
            backdropFilter: "blur(8px)",
            border: "1px solid rgba(239, 68, 68, 0.4)",
            boxShadow: "0 4px 16px rgba(239,68,68,0.3)",
          }}
        >
          {error}
        </div>
      )}

      {/* Incoming Call Popup */}
      {incomingCall && (
        <IncomingCallPopup
          callerName={
            incomingCall.callerInfo.displayName ||
            incomingCall.callerInfo.username
          }
          callerAvatar={
            isValidAvatarUrl(incomingCall.callerInfo.avatar)
              ? incomingCall.callerInfo.avatar
              : undefined
          }
          callType={incomingCall.type}
          onAccept={handleAcceptCall}
          onReject={handleRejectCall}
          status={incomingCall.status}
        />
      )}

      {Object.entries(outgoingCallsByPeer)
        .filter(([peerId]) => !activeCallTabPeers.includes(peerId))
        .map(([peerId, outgoingCall]) => (
        <OutgoingCallPopup
          key={peerId}
          receiverName={
            outgoingCall.toUser.displayName || outgoingCall.toUser.username
          }
          receiverAvatar={
            isValidAvatarUrl(outgoingCall.toUser.avatarUrl)
              ? outgoingCall.toUser.avatarUrl
              : undefined
          }
          callType={outgoingCall.type}
          onCancel={() => handleCancelCall(peerId)}
          status={outgoingCall.status}
        />
      ))}

      {channelProfileContext && token ? (
        <ChannelUserProfileRoot
          open
          context={channelProfileContext}
          token={token}
          inviteableServers={channelProfileInviteServers}
          canManageNicknames={Boolean(currentServerPermissions?.canManageNicknames || currentServerPermissions?.isOwner)}
          onChangeNickname={async (userId, currentNick) => {
            const newNick = await appPrompt(
              currentNick ? `Đổi biệt danh (hiện tại: ${currentNick})` : "Nhập biệt danh mới",
              currentNick ?? "",
            );
            if (newNick === null || newNick === undefined) return;
            try {
              const sid = channelProfileContext?.serverId;
              if (!sid) return;
              await serversApi.updateMemberNickname(sid, userId, newNick);
              setToastMessage("Đã đổi biệt danh thành công.");
            } catch (err) {
              setToastMessage(err instanceof Error ? err.message : "Không đổi được biệt danh");
            }
          }}
          onClose={() => setChannelProfileContext(null)}
          onOpenDirectMessage={handleOpenDmFromChannelProfile}
          onToast={(m) => setToastMessage(m)}
        />
      ) : null}

      {showMessagesUserSettings && token && !isAdminView ? (
        <MessagesUserSettingsModal
          open
          onClose={() => setShowMessagesUserSettings(false)}
          token={token}
          currentUserId={currentUserId}
          servers={servers.map((s) => ({ _id: s._id, name: s.name }))}
          onToast={(m) => {
            setToastMessage(m);
            setTimeout(() => setToastMessage(null), 3000);
          }}
        />
      ) : null}

      {/* Giphy Picker Modal */}
      {showGiphyPicker && (
        <GiphyPicker
          onSelect={handleGiphyPickerSelect}
          onClose={() => setShowGiphyPicker(false)}
          initialTab={mediaPickerTab}
          contextServerId={selectedServer ?? null}
          ownedServers={ownedServersForPicker}
          onManageServerStickers={(sid) =>
            void openServerSettingsFromMediaPicker(sid, "sticker")
          }
          onManageServerEmojis={(sid) =>
            void openServerSettingsFromMediaPicker(sid, "emoji")
          }
          enableServerMedia={
            !!(selectedChannel || selectedDirectMessageFriend)
          }
          adminMediaPicker={Boolean(
            isAdminView &&
              adminViewServerId &&
              selectedServer &&
              String(selectedServer) === String(adminViewServerId),
          )}
          hasCrossServerMediaAccess={boostStatus?.active === true}
          onEmojiCatalogLoaded={handleEmojiCatalogLoaded}
        />
      )}

      {/* Report Message Dialog */}
      {showReportDialog && (
        <ReportMessageDialog
          onSubmit={(reason, description) =>
            handleReportMessage(showReportDialog, reason, description)
          }
          onClose={() => setShowReportDialog(null)}
        />
      )}

      {noticePopupMessage && (
        <div
          onClick={() => setNoticePopupMessage(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            zIndex: 3200,
            display: "grid",
            placeItems: "center",
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(440px, 92vw)",
              background: "rgba(8, 10, 22, 0.97)",
              border: "1px solid rgba(124, 58, 237, 0.22)",
              borderRadius: 16,
              padding: "16px 14px",
              color: "#dde2f0",
              boxShadow: "0 16px 48px rgba(0,0,0,0.5), 0 0 28px rgba(124,58,237,0.1)",
              backdropFilter: "blur(16px)",
            }}
          >
            <div style={{ fontSize: 15, lineHeight: 1.5 }}>{noticePopupMessage}</div>
            <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setNoticePopupMessage(null)}
                style={{
                  border: "none",
                  borderRadius: 8,
                  background: "linear-gradient(135deg, #5865f2 0%, #7c3aed 100%)",
                  color: "#fff",
                  fontWeight: 700,
                  padding: "8px 14px",
                  cursor: "pointer",
                  boxShadow: "0 2px 10px rgba(88,101,242,0.35)",
                }}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {pinnedModalOpen && (
        <div
          onClick={() => setPinnedModalOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(3, 4, 12, 0.72)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
            zIndex: 3100,
            display: "grid",
            placeItems: "center",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={styles.pinnedModal}
            style={{ width: "min(620px, 92vw)", maxHeight: "80vh", overflow: "auto" }}
          >
            <div className={styles.pinnedModalHeader}>
              <p className={styles.pinnedModalTitle}>{pinnedModalTitle}</p>
              <button
                type="button"
                onClick={() => setPinnedModalOpen(false)}
                className={styles.pinnedModalClose}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
            {pinnedModalLoading ? (
              <div className={styles.loadingWrap}>
                <div className={styles.cosmicSpinnerLg} />
              </div>
            ) : pinnedModalItems.length === 0 ? (
              <div style={{ color: "rgba(120,140,185,0.7)", padding: "16px 0", textAlign: "center", fontSize: 14 }}>Chưa có tin nhắn được ghim.</div>
            ) : (
              pinnedModalItems.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handlePinnedItemJump(item.id)}
                  className={styles.pinnedItem}
                >
                  <div className={styles.pinnedItemSender}>
                    {item.senderDisplayName || item.senderName || "Người dùng"}
                  </div>
                  <div style={{ whiteSpace: "pre-wrap", color: "#dde2f0", fontSize: 14 }}>
                    {renderMessageContent(item)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <MessagesDesktopNotificationHost />

      {/* Toast Notification */}
      {toastMessage && (
        <div className={styles.galaxyToast}>
          <span>{toastMessage}</span>
          {toastActionLabel && toastActionHandler && (
            <button
              type="button"
              onClick={toastActionHandler}
              className={styles.galaxyToastAction}
            >
              {toastActionLabel}
            </button>
          )}
        </div>
      )}
      {mediaViewerState && (
        <ChatMediaViewer
          items={mediaViewerState.items}
          initialIndex={mediaViewerState.index}
          onClose={() => setMediaViewerState(null)}
        />
      )}
    </div>
    </ServerLanguageOverrideProvider>
  );
}

function ExploreServersView({
  onClose,
  onJoin,
}: {
  onClose: () => void;
  onJoin: (serverId: string) => void | Promise<void>;
}) {
  const { t: tUser, language: userLanguage } = useLanguage();
  const t = tUser;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [servers, setServers] = useState<ExploreServer[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const load = () =>
      serversApi
        .listExploreServers()
        .then((data) => {
          if (cancelled) return;
          setServers(Array.isArray(data) ? data : []);
        })
        .catch((e) => {
          if (cancelled) return;
          setError(e instanceof Error ? e.message : t("chat.explore.loadError"));
          setServers([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });

    load();

    const onServerDeleted = (e: Event) => {
      const id = (e as CustomEvent<{ serverId?: string }>).detail?.serverId;
      if (!id) return;
      setServers((prev) => prev.filter((s) => s.id !== id));
    };
    window.addEventListener("cordigram-server-deleted", onServerDeleted as EventListener);

    return () => {
      cancelled = true;
      window.removeEventListener("cordigram-server-deleted", onServerDeleted as EventListener);
    };
  }, [t]);

  return (
    <div className={styles.explorePage}>
      <div className={styles.exploreHero}>
        <div className={styles.exploreHeroTop}>
          <button type="button" className={styles.exploreBackBtn} onClick={onClose}>
            {t("chat.explore.backToChat")}
          </button>
        </div>
        <h2 className={styles.exploreHeroTitle}>{t("chat.explore.title")}</h2>
        <p className={styles.exploreHeroSub}>{t("chat.explore.subtitle")}</p>
      </div>

      {loading ? (
        <div style={{ padding: 28, color: "var(--color-text-muted)" }}>{t("chat.explore.loading")}</div>
      ) : error ? (
        <div style={{ padding: 28, color: "var(--color-danger)" }}>{error}</div>
      ) : servers.length === 0 ? (
        <div style={{ padding: 28, color: "var(--color-text-muted)" }}>{t("chat.explore.empty")}</div>
      ) : (
        <div className={styles.exploreGrid}>
          {servers.map((s) => {
            const b = normalizeServerBanner(s);
            const cardLang = resolveServerDisplayLanguage(
              {
                primaryLanguage: s.primaryLanguage,
                communitySettings: {
                  primaryLanguageConfigured: s.primaryLanguageConfigured,
                },
              },
              userLanguage,
            );
            const tCard = makeTranslator(cardLang);
            const localeTag = localeTagForLanguage(cardLang);
            return (
            <div key={s.id} className={styles.exploreCard}>
              <div
                className={styles.exploreCardBanner}
                style={{ background: b.bannerColor }}
              >
                {b.bannerImageUrl ? (
                  <div
                    className={styles.exploreCardBannerImage}
                    style={{ backgroundImage: `url(${b.bannerImageUrl})` }}
                  />
                ) : null}
              </div>
              <div className={styles.exploreCardBody}>
                <div className={styles.exploreCardHeader}>
                  <div
                    className={styles.exploreCardAvatar}
                    style={{
                      backgroundImage: s.avatarUrl ? `url(${s.avatarUrl})` : undefined,
                    }}
                    aria-hidden
                  />
                  <div style={{ minWidth: 0 }}>
                    <div className={styles.exploreCardName}>{s.name}</div>
                    <div className={styles.exploreCardMeta}>
                      {tCard("chat.explore.members", { count: String(Number(s.memberCount || 0).toLocaleString(localeTag)) })}
                      {s.accessMode === "apply" ? " • " + tCard("chat.explore.badgeApply") : s.accessMode === "invite_only" ? " • " + tCard("chat.explore.badgeInviteOnly") : ""}
                    </div>
                  </div>
                </div>

                <div className={styles.exploreCardDesc}>{s.description || " "}</div>

                <button
                  type="button"
                  className={styles.exploreJoinBtn}
                  onClick={() => onJoin(s.id)}
                  disabled={s.accessMode === "invite_only"}
                  title={s.accessMode === "invite_only" ? tCard("chat.explore.inviteOnlyTitle") : tCard("chat.explore.join")}
                  style={s.accessMode === "invite_only" ? { opacity: 0.6, cursor: "not-allowed" } : undefined}
                >
                  {s.accessMode === "invite_only" ? tCard("chat.explore.inviteOnly") : tCard("chat.explore.join")}
                </button>
              </div>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CommunityOverviewSection({
  serverId,
  canManageSettings,
  initialServer,
  onUpdated,
}: {
  serverId: string;
  canManageSettings: boolean;
  initialServer: (serversApi.Server & { primaryLanguage?: "vi" | "en" | "ja" | "zh" }) | null;
  onUpdated?: (patch: Partial<serversApi.Server>) => void;
}) {
  const { t, language } = useLanguage();
  const [channels, setChannels] = useState<serversApi.Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [rulesChannelId, setRulesChannelId] = useState<string | null>(null);
  const [primaryLanguage, setPrimaryLanguage] = useState<"vi" | "en" | "ja" | "zh">(
    (isLanguageCode((initialServer as any)?.primaryLanguage)
      ? (initialServer as any).primaryLanguage
      : "vi") as "vi" | "en" | "ja" | "zh",
  );
  const [description, setDescription] = useState<string>(
    (initialServer as any)?.description || "",
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([serversApi.getChannels(serverId), serversApi.getCommunitySettings(serverId)])
      .then(([chs, community]) => {
        if (cancelled) return;
        setChannels(chs);
        setRulesChannelId(community.rulesChannelId ?? null);
        if (isLanguageCode(community.primaryLanguage)) {
          setPrimaryLanguage(community.primaryLanguage);
        }
        if (typeof community.description === "string") {
          setDescription(community.description);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Không tải được");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [serverId]);

  const textChannels = channels.filter((c) => c.type !== "voice");

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: "var(--color-text)" }}>
          {t("chat.communityOverview.title")}
        </h2>
        <p style={{ margin: "6px 0 0", color: "var(--color-text-muted)", fontSize: 13, lineHeight: 1.5 }}>
          {t("chat.communityOverview.subtitle")}
        </p>
      </div>

      {loading ? (
        <div style={{ color: "var(--color-text-muted)" }}>{t("chat.communityOverview.loading")}</div>
      ) : (
        <>
          {error && (
            <div style={{ marginBottom: 10, color: "var(--color-danger)" }}>{error}</div>
          )}

          <div style={{ display: "grid", gap: 18, maxWidth: 760 }}>
            <div>
              <div style={{ fontWeight: 800, color: "var(--color-text)", marginBottom: 6 }}>
                {t("chat.communityOverview.rulesChannelLabel")}
              </div>
              <div style={{ color: "var(--color-text-muted)", fontSize: 13, marginBottom: 10, lineHeight: 1.5 }}>
                {t("chat.communityOverview.rulesChannelHint")}
              </div>
              <select
                value={rulesChannelId ?? ""}
                onChange={(e) => setRulesChannelId(e.target.value || null)}
                disabled={!canManageSettings}
                style={{
                  width: "100%",
                  border: "1px solid var(--color-border)",
                  borderRadius: 10,
                  padding: "10px 12px",
                  background: "var(--color-surface)",
                  color: "var(--color-text)",
                }}
              >
                <option value="">{t("chat.communityOverview.noChannel")}</option>
                {textChannels.map((ch) => (
                  <option key={ch._id} value={ch._id}>
                    #{translateChannelName(ch.name, language)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div style={{ fontWeight: 800, color: "var(--color-text)", marginBottom: 6 }}>
                {t("chat.communityOverview.langLabel")}
              </div>
              <div style={{ color: "var(--color-text-muted)", fontSize: 13, marginBottom: 10, lineHeight: 1.5 }}>
                {t("chat.communityOverview.langHint")}
              </div>
              <select
                value={primaryLanguage}
                onChange={(e) => setPrimaryLanguage(e.target.value as any)}
                disabled={!canManageSettings}
                style={{
                  width: "100%",
                  border: "1px solid var(--color-border)",
                  borderRadius: 10,
                  padding: "10px 12px",
                  background: "var(--color-surface)",
                  color: "var(--color-text)",
                }}
              >
                <option value="vi">{t("chat.communityOverview.langVi")}</option>
                <option value="en">{t("chat.communityOverview.langEn")}</option>
                <option value="ja">{t("chat.communityOverview.langJa")}</option>
                <option value="zh">{t("chat.communityOverview.langZh")}</option>
              </select>
            </div>

            <div>
              <div style={{ fontWeight: 800, color: "var(--color-text)", marginBottom: 6 }}>
                {t("chat.communityOverview.descLabel")}
              </div>
              <div style={{ color: "var(--color-text-muted)", fontSize: 13, marginBottom: 10, lineHeight: 1.5 }}>
                {t("chat.communityOverview.descHint")}
              </div>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={!canManageSettings}
                rows={4}
                placeholder={t("chat.communityOverview.descPlaceholder")}
                style={{
                  width: "100%",
                  border: "1px solid var(--color-border)",
                  borderRadius: 10,
                  padding: "10px 12px",
                  background: "var(--color-surface)",
                  color: "var(--color-text)",
                  resize: "vertical",
                }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                type="button"
                disabled={!canManageSettings || saving}
                onClick={async () => {
                  setSaving(true);
                  setError(null);
                  try {
                    const res = await serversApi.updateCommunityOverview(serverId, {
                      rulesChannelId,
                      primaryLanguage,
                      description,
                    });
                    onUpdated?.({
                      description: res.description ?? undefined,
                      primaryLanguage: res.primaryLanguage,
                      communitySettings: {
                        ...((initialServer as any)?.communitySettings || {}),
                        primaryLanguageConfigured: true,
                      },
                    } as any);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : t("chat.communityOverview.errorSave"));
                  } finally {
                    setSaving(false);
                  }
                }}
                style={{
                  border: "none",
                  borderRadius: 10,
                  padding: "10px 12px",
                  background: "var(--color-primary)",
                  color: "#fff",
                  fontWeight: 900,
                  cursor: !canManageSettings || saving ? "not-allowed" : "pointer",
                  opacity: !canManageSettings || saving ? 0.6 : 1,
                }}
              >
                {saving ? t("chat.communityOverview.saving") : t("chat.communityOverview.save")}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
