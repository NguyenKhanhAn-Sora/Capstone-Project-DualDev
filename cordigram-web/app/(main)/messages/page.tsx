"use client";

import React, { useState, useEffect, useLayoutEffect, useRef, memo, useCallback } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import styles from "./messages.module.css";
import { useRequireAuth } from "@/hooks/use-require-auth";
import {
  useDirectMessages,
  type DirectMessage,
} from "@/hooks/use-direct-messages";
import { useChannelMessages } from "@/hooks/use-channel-messages";
import * as serversApi from "@/lib/servers-api";
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
  reportDirectMessage,
  deleteDirectMessage,
  markDmConversationRead,
} from "@/lib/api";
import { getLiveKitToken, getDMRoomName, getVoiceChannelParticipants } from "@/lib/livekit-api";
import IncomingCallPopup from "@/components/IncomingCallPopup";
import OutgoingCallPopup from "@/components/OutgoingCallPopup";
import GiphyPicker from "@/components/GiphyPicker";
import VoiceRecorder from "@/components/VoiceRecorder";
import VoiceMessage from "@/components/VoiceMessage";
import { getGifById, type GiphyGif } from "@/lib/giphy-api";
import QuickReactionBar from "@/components/QuickReactionBar";
import EmojiReactionPicker from "@/components/EmojiReactionPicker";
import MessageReactions from "@/components/MessageReactions";
import MessageActionsMenu from "@/components/MessageActionsMenu";
import ReportMessageDialog from "@/components/ReportMessageDialog";
import ReplyMessagePreview from "@/components/ReplyMessagePreview";
import DeleteMessageDialog from "@/components/DeleteMessageDialog";
import CreateServerModal from "@/components/CreateServerModal/CreateServerModal";
import CreateChannelModal, {
  type ChannelTypeForCreate,
} from "@/components/CreateChannelModal/CreateChannelModal";
import EventsPopup from "@/components/ServerEvents/EventsPopup";
import CreateEventWizard from "@/components/ServerEvents/CreateEventWizard";
import EventImageEditor from "@/components/ServerEvents/EventImageEditor";
import ShareEventPopup from "@/components/ServerEvents/ShareEventPopup";
import EventCreatedDetailPopup from "@/components/ServerEvents/EventCreatedDetailPopup";
import InviteToVoiceChannelPopup from "@/components/InviteToVoiceChannelPopup/InviteToVoiceChannelPopup";
import InviteToServerPopup from "@/components/InviteToServerPopup/InviteToServerPopup";
import MessagesInbox from "@/components/MessagesInbox/MessagesInbox";
import ServerContextMenu from "@/components/ServerContextMenu/ServerContextMenu";
import ServerSettingsPanel from "@/components/ServerSettingsPanel/ServerSettingsPanel";
import ServerMembersSection from "@/components/ServerMembersSection/ServerMembersSection";
import RolesSection from "@/components/RolesSection/RolesSection";
import { fetchInboxForYou } from "@/lib/inbox-api";

// Dynamic import CallRoom / VoiceChannelCall to avoid SSR issues with LiveKit
const CallRoom = dynamic(() => import("@/components/CallRoom"), { ssr: false });
const VoiceChannelCall = dynamic(() => import("@/components/VoiceChannelCall"), { ssr: false });

interface BackendServer extends serversApi.Server {
  textChannels?: serversApi.Channel[];
  voiceChannels?: serversApi.Channel[];
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
  messageType?: "text" | "gif" | "sticker" | "voice"; // Loại nội dung message
  giphyId?: string; // ID của GIF/Sticker từ Giphy
  voiceUrl?: string; // URL của voice message
  voiceDuration?: number; // Duration của voice message (seconds)
  reactions?: MessageReaction[]; // Reactions của message
  isPinned?: boolean; // Whether the message is pinned
  replyTo?: string; // ID of the message being replied to
  replyToMessage?: {
    id: string;
    senderId?: string;
    senderDisplayName?: string;
    senderName?: string;
    messageType?: "text" | "gif" | "sticker" | "voice";
    text: string;
  } | null;
}

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
        <div style={{ padding: "12px", color: "#b5bac1", fontSize: "14px" }}>
          Đang tải {messageType}...
        </div>
      );
    }

    if (!gifData) {
      return (
        <span style={{ color: "#ff6b6b", fontSize: "12px" }}>
          Unable to load {messageType}
        </span>
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
      return <div className={styles.pollMessage}>Đang tải khảo sát...</div>;
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

// Custom comparison function for memo - only re-render if message content or read status changed
function areMessagesEqual(
  prevProps: {
    message: UIMessage;
    renderMessageContent: (message: UIMessage) => React.ReactNode;
    onVisible?: (messageId: string, isVisible: boolean) => void;
  },
  nextProps: {
    message: UIMessage;
    renderMessageContent: (message: UIMessage) => React.ReactNode;
    onVisible?: (messageId: string, isVisible: boolean) => void;
  },
) {
  // Re-render if message ID changed (different message)
  if (prevProps.message.id !== nextProps.message.id) return false;

  // Re-render if read status changed (THIS IS KEY!)
  if (prevProps.message.isRead !== nextProps.message.isRead) {
    console.log(
      "🔄 Message read status changed, re-rendering:",
      nextProps.message.id,
      "isRead:",
      nextProps.message.isRead,
    );
    return false;
  }

  // Re-render if text content changed
  if (prevProps.message.text !== nextProps.message.text) return false;

  // Re-render if messageType or giphyId changed
  if (prevProps.message.messageType !== nextProps.message.messageType)
    return false;
  if (prevProps.message.giphyId !== nextProps.message.giphyId) return false;
  if (prevProps.message.voiceUrl !== nextProps.message.voiceUrl) return false;
  if (prevProps.message.voiceDuration !== nextProps.message.voiceDuration)
    return false;

  // ✅ Re-render if reactions changed (otherwise UI requires reload)
  if (prevProps.message.reactions !== nextProps.message.reactions) return false;
  if (prevProps.message.replyTo !== nextProps.message.replyTo) return false;
  if (prevProps.message.replyToMessage !== nextProps.message.replyToMessage)
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
    scrollContainerRef,
    dmPartnerDisplayName,
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
    scrollContainerRef?: React.RefObject<HTMLElement | null>;
    dmPartnerDisplayName?: string;
  }) => {
    const messageRef = useRef<HTMLDivElement>(null);
    const [isHovered, setIsHovered] = useState(false);
    const [showQuickReactions, setShowQuickReactions] = useState(false);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [showActionsMenu, setShowActionsMenu] = useState(false);
    const [fixedReactionPosition, setFixedReactionPosition] = useState<{
      top: number;
      left: number;
    } | null>(null);

    const updateFixedPosition = useCallback(() => {
      const el = messageRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const fromCurrentUser = message.isFromCurrentUser;
      const PADDING = 8;
      const QUICK_BAR_W = 380; // estimate to keep inside viewport
      const baseLeft = fromCurrentUser ? rect.right - QUICK_BAR_W - 10 : rect.left + 50;
      const clampedLeft = Math.min(
        Math.max(baseLeft, PADDING),
        Math.max(PADDING, window.innerWidth - PADDING - QUICK_BAR_W),
      );

      setFixedReactionPosition({
        top: rect.top - 50,
        left: clampedLeft,
      });
    }, [message.isFromCurrentUser]);

    useLayoutEffect(() => {
      if (!scrollContainerRef?.current || (!isHovered && !showEmojiPicker && !showActionsMenu)) {
        setFixedReactionPosition(null);
        return;
      }
      updateFixedPosition();
      const container = scrollContainerRef.current;
      const onScroll = () => updateFixedPosition();
      container.addEventListener("scroll", onScroll, { passive: true });
      return () => container.removeEventListener("scroll", onScroll);
    }, [scrollContainerRef, isHovered, showEmojiPicker, showActionsMenu, updateFixedPosition]);

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
              console.log("📍 Message entered viewport (50%+):", message.id);
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

    return (
      <div
        ref={messageRef}
        className={`${styles.messageGroup} ${
          message.isFromCurrentUser ? styles.sent : styles.received
        }`}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => {
          setIsHovered(false);
          setShowQuickReactions(false);
        }}
        style={{ position: "relative" }}
      >
        {/* Avatar */}
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

        <div className={styles.messageContent}>
          {/* Name and timestamp */}
          <div className={styles.messageHeader}>
            <span className={styles.messageSenderName}>
              {message.senderDisplayName ||
                message.senderName ||
                message.senderEmail ||
                "Unknown"}
            </span>
            <span className={styles.messageTime}>
              {formatMessageTime(message.timestamp)}
            </span>
          </div>

          {/* Message bubble */}
          {message.replyToMessage && (
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
                    ? "GIF"
                    : message.replyToMessage.messageType === "sticker"
                      ? "Sticker"
                      : message.replyToMessage.messageType === "voice"
                        ? "Tin nhắn thoại"
                        : message.replyToMessage.text}
                </div>
              </div>
            </div>
          )}
          <div
            className={`${styles.messageBubble} ${
              message.isFromCurrentUser ? styles.sent : styles.received
            }`}
          >
            {renderMessageContent(message)}
          </div>

          {/* Message Reactions (ẩn khi đang hiện ở thanh sticky phía trên) */}
          {message.reactions && message.reactions.length > 0 && (
            <MessageReactions
              reactions={message.reactions}
              currentUserId={currentUserId || ""}
              onReactionClick={(emoji) => onReaction?.(message.id, emoji)}
              onAddClick={() => setShowEmojiPicker(true)}
            />
          )}

          {/* ✅ Read receipt indicator - only show for sent messages */}
          {message.isFromCurrentUser && message.type === "direct" && (
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
                  <span className={styles.readText}>Seen</span>
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
                  <span className={styles.unreadText}>Sent</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Quick Reaction Bar on Hover — portal với position:fixed + z-index cao để đè lên chatHeader khi cần */}
        {isHovered && (scrollContainerRef && fixedReactionPosition ? (
          createPortal(
            <div
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
              right: message.isFromCurrentUser ? 10 : undefined,
              left: message.isFromCurrentUser ? undefined : 50,
            }}
          />
        ))}

        {/* Emoji Reaction Picker — portal để đè lên chatHeader */}
        {showEmojiPicker && (scrollContainerRef && fixedReactionPosition ? (
          createPortal(
            <div
              style={{
                position: "fixed",
                zIndex: 10006,
                top: fixedReactionPosition.top + 50,
                // Emoji picker width is fixed (340px), clamp by shifting left if needed
                left: Math.min(
                  fixedReactionPosition.left,
                  Math.max(8, window.innerWidth - 8 - 340),
                ),
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
              right: message.isFromCurrentUser ? 10 : undefined,
              left: message.isFromCurrentUser ? undefined : 50,
            }}
          />
        ))}

        {/* Message Actions Menu */}
        {showActionsMenu && (
          <MessageActionsMenu
            onRemove={
              message.isFromCurrentUser
                ? () => {
                    onDelete?.(message.id);
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
              right: message.isFromCurrentUser ? 10 : undefined,
              left: message.isFromCurrentUser ? undefined : 50,
            }}
            isOwnMessage={message.isFromCurrentUser}
            isPinned={message.isPinned || false}
          />
        )}
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

export default function MessagesPage() {
  const canRender = useRequireAuth();
  const searchParams = useSearchParams();
  const [servers, setServers] = useState<BackendServer[]>([]);
  const [selectedServer, setSelectedServer] = useState<string | null>(null);
  const [textChannels, setTextChannels] = useState<serversApi.Channel[]>([]);
  const [voiceChannels, setVoiceChannels] = useState<serversApi.Channel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
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
  const [serverContextMenu, setServerContextMenu] = useState<{
    x: number;
    y: number;
    server: BackendServer;
    permissions?: serversApi.CurrentUserServerPermissions;
  } | null>(null);
  const [showServerSettingsPanel, setShowServerSettingsPanel] = useState(false);
  const [serverSettingsTarget, setServerSettingsTarget] = useState<{
    serverId: string;
    serverName: string;
  } | null>(null);
  const [hideMutedChannels, setHideMutedChannels] = useState(false);
  const [showAllChannels, setShowAllChannels] = useState(false);
  const [serverNotificationLevel, setServerNotificationLevel] = useState<"all" | "mentions" | "none">("all");
  const [showEventsPopup, setShowEventsPopup] = useState(false);
  const [showCreateEventWizard, setShowCreateEventWizard] = useState(false);
  const [showEventImageEditor, setShowEventImageEditor] = useState(false);
  const [eventImageEditorCurrentUrl, setEventImageEditorCurrentUrl] = useState<string | null>(null);
  const eventImageEditorResolveRef = useRef<((url: string | null) => void) | null>(null);
  const [shareEventLink, setShareEventLink] = useState<string>("");
  const [showShareEventPopup, setShowShareEventPopup] = useState(false);
  const [showMessagesInbox, setShowMessagesInbox] = useState(false);
  /** Có lời mời hoặc nội dung mới trong Hộp thư (Dành cho Bạn) → hiển thị chấm đỏ trên nút hộp thư. */
  const [hasInboxNotification, setHasInboxNotification] = useState(false);
  const [createdEventDetail, setCreatedEventDetail] = useState<serversApi.ServerEvent | null>(null);
  const [activeServerEvents, setActiveServerEvents] = useState<serversApi.ServerEvent[]>([]);
  /** Tổng số sự kiện (active + upcoming) để hiển thị badge bên cạnh "Sự Kiện", không giảm khi user đóng banner Đang Diễn Ra */
  const [serverEventsTotalCount, setServerEventsTotalCount] = useState(0);
  const [selectedEventDetail, setSelectedEventDetail] = useState<serversApi.ServerEvent | null>(null);
  const [eventDetailInterested, setEventDetailInterested] = useState(false);

  useEffect(() => {
    if (selectedEventDetail) setEventDetailInterested(false);
  }, [selectedEventDetail?._id]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const processedCallsRef = useRef<Set<string>>(new Set());
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [friends, setFriends] = useState<serversApi.Friend[]>([]);
  const [selectedDirectMessageFriend, setSelectedDirectMessageFriend] =
    useState<serversApi.Friend | null>(null);
  const [dmProfileSidebarOpen, setDmProfileSidebarOpen] = useState(true);
  const [voiceInviteDismissed, setVoiceInviteDismissed] = useState<Set<string>>(new Set());
  const [inviteToVoiceTarget, setInviteToVoiceTarget] = useState<{
    serverId: string;
    serverName: string;
    channelId: string;
    channelName: string;
  } | null>(null);
  const [inviteToServerTarget, setInviteToServerTarget] = useState<{
    serverId: string;
    serverName: string;
  } | null>(null);
  const [inviteToServerCandidates, setInviteToServerCandidates] = useState<serversApi.Friend[]>([]);
  const [voiceChannelCallToken, setVoiceChannelCallToken] = useState<string | null>(null);
  const [voiceChannelCallServerUrl, setVoiceChannelCallServerUrl] = useState<string>("");
  const [voiceChannelCallError, setVoiceChannelCallError] = useState<string | null>(null);
  const [voiceChannelParticipants, setVoiceChannelParticipants] = useState<
    Record<string, { identity: string; name: string }[]>
  >({});
  const [conversations, setConversations] = useState<Map<string, UIMessage[]>>(
    new Map(),
  );
  /** Unread count per DM conversation (userId -> count). Updated from getConversationList; cleared when user opens chat. */
  const [dmUnreadCounts, setDmUnreadCounts] = useState<Record<string, number>>({});
  const [loadingDirectMessages, setLoadingDirectMessages] = useState(false);
  const [token, setToken] = useState<string>("");
  const [currentUserProfile, setCurrentUserProfile] = useState<any>(null);
  const [passkeyRequired, setPasskeyRequired] = useState(false);
  const [passkeyChecking, setPasskeyChecking] = useState(false);
  const [deviceId, setDeviceId] = useState("");
  const [passkeyInput, setPasskeyInput] = useState("");
  const [passkeyError, setPasskeyError] = useState<string | null>(null);
  const [passkeySubmitting, setPasskeySubmitting] = useState(false);

  // Media picker states
  const [showGiphyPicker, setShowGiphyPicker] = useState(false);
  const [giphyPickerMode, setGiphyPickerMode] = useState<"gif" | "sticker">(
    "gif",
  );
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [gifSearchQuery, setGifSearchQuery] = useState("");
  const [gifs, setGifs] = useState<any[]>([]);

  // Voice recording states
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [isUploadingVoice, setIsUploadingVoice] = useState(false);

  /** Tắt/bật mic và loa trong thanh voice controls (dùng cả khi xem DM và khi ở server). */
  const [voiceMicMuted, setVoiceMicMuted] = useState(false);
  const [voiceSoundMuted, setVoiceSoundMuted] = useState(false);

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
  const [showDeleteDialog, setShowDeleteDialog] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Call states
  const [isInCall, setIsInCall] = useState(false);
  const [callToken, setCallToken] = useState<string>("");
  const [callServerUrl, setCallServerUrl] = useState<string>("");
  const [isAudioOnly, setIsAudioOnly] = useState(false);
  const [incomingCall, setIncomingCall] = useState<{
    from: string;
    type: "audio" | "video";
    callerInfo: {
      userId: string;
      username: string;
      displayName: string;
      avatar?: string;
    };
    status?: "incoming" | "cancelled"; // ✅ Added status for when caller cancels
  } | null>(null);
  const [outgoingCall, setOutgoingCall] = useState<{
    to: string;
    toUser: {
      displayName: string;
      username: string;
      avatarUrl?: string;
    };
    type: "audio" | "video";
    status: "calling" | "rejected" | "no-answer";
    roomName?: string;
  } | null>(null);

  // Typing indicator
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isTypingRef = useRef(false); // ✅ Track typing state
  const shouldAutoScrollRef = useRef(true); // Track if we should auto-scroll

  // Use direct messages hook
  const {
    isConnected,
    newMessage,
    messageSent,
    sendMessage: emitSendMessage,
    onlineUsers,
    userTyping,
    notifyTyping,
    messagesRead,
    reactionUpdate,
    markAsRead,
    callEvent,
    callEnded, // ✅ Added to handle when caller cancels
    messageDeleted,
    initiateCall,
    answerCall,
    rejectCall,
    endCall,
    emitDeleteMessage,
  } = useDirectMessages({
    userId: currentUserId,
    token,
  });

  const prevChannelRef = useRef<string | null>(null);
  const {
    isConnected: isChannelSocketConnected,
    newMessageChannel,
    reactionUpdateChannel,
    joinChannel,
    leaveChannel,
    clearNewMessageChannel,
  } = useChannelMessages({ token });

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

  // ✅ New message in channel from WebSocket (thành viên khác gửi → hiện ngay không cần reload)
  useEffect(() => {
    if (!newMessageChannel?.message || !selectedChannel) return;
    const msg = newMessageChannel.message as any;
    const channelId = typeof msg.channelId === "string" ? msg.channelId : msg.channelId?._id ?? msg.channelId;
    if (channelId !== selectedChannel) return;
    const senderId = typeof msg.senderId === "string" ? msg.senderId : msg.senderId?._id;
    if (senderId === currentUserId) return;
    const uiMessage: UIMessage = {
      id: msg._id,
      text: msg.content,
      senderId: senderId ?? "",
      senderEmail: typeof msg.senderId === "object" ? msg.senderId?.email ?? "" : "",
      senderName: typeof msg.senderId === "object" ? (msg.senderId?.username || msg.senderId?.email) ?? "" : "",
      senderDisplayName: typeof msg.senderId === "object" ? msg.senderId?.displayName : undefined,
      senderAvatar: typeof msg.senderId === "object" ? (msg.senderId?.avatarUrl ?? msg.senderId?.avatar) : undefined,
      timestamp: new Date(msg.createdAt),
      isFromCurrentUser: false,
      type: "server",
      reactions: normalizeReactions(msg.reactions),
      replyTo: msg.replyTo && typeof msg.replyTo === "object" ? msg.replyTo._id : typeof msg.replyTo === "string" ? msg.replyTo : undefined,
      replyToMessage: mapReplyToMessage(msg.replyTo && typeof msg.replyTo === "object" ? msg.replyTo : null),
    };
    setMessages((prev) => [...prev, uiMessage]);
    shouldAutoScrollRef.current = true;
    clearNewMessageChannel();
  }, [newMessageChannel, selectedChannel, currentUserId, clearNewMessageChannel]);

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
  const handleStartCall = useCallback(
    async (isVideo: boolean) => {
      if (!selectedDirectMessageFriend || !token || !currentUserProfile) {
        console.error("Cannot start call: missing friend, token, or profile");
        return;
      }

      try {
        console.log(
          "📞 [CALL] Starting",
          isVideo ? "video" : "audio",
          "call with",
          selectedDirectMessageFriend.displayName,
        );

        // Get room name first
        const { roomName } = await getDMRoomName(
          selectedDirectMessageFriend._id,
          token,
        );
        console.log("📞 [CALL] Room name:", roomName);

        // Show outgoing call popup
        setOutgoingCall({
          to: selectedDirectMessageFriend._id,
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
        });

        // Notify receiver via socket
        initiateCall(
          selectedDirectMessageFriend._id,
          isVideo ? "video" : "audio",
        );
        console.log("✅ [CALL] Call notification sent, waiting for answer...");
      } catch (error) {
        console.error("❌ [CALL] Failed to start call:", error);
        setError("Không thể bắt đầu cuộc gọi");
      }
    },
    [selectedDirectMessageFriend, token, currentUserProfile, initiateCall],
  );

  const handleEndCall = useCallback(() => {
    console.log("📞 [CALL] Ending call");
    setIsInCall(false);
    setCallToken("");
    setCallServerUrl("");
    setIsAudioOnly(false);
  }, []);

  // ✅ Accept incoming call - notify caller and open tabs for both
  const handleAcceptCall = useCallback(async () => {
    if (!incomingCall || !token || !currentUserProfile) {
      console.error("Cannot accept call: missing data");
      return;
    }

    try {
      console.log(
        "📞 [ACCEPT] Accepting call from:",
        incomingCall.callerInfo.displayName,
      );

      // Mark this call as processed
      processedCallsRef.current.add(incomingCall.from);
      console.log("✅ [ACCEPT] Marked call as processed");

      // Get room name
      const { roomName } = await getDMRoomName(incomingCall.from, token);
      console.log("📞 [ACCEPT] Room name:", roomName);

      // Notify caller that call was answered (this will open tab on caller's side)
      answerCall(incomingCall.from, { roomName });
      console.log("✅ [ACCEPT] Call answer notification sent to caller");

      // Open call in new tab for receiver (this user)
      const participantName =
        currentUserProfile.username || currentUserProfile.displayName || "Người dùng";
      const isAudioOnly = incomingCall.type === "audio";
      const callUrl = `/call?roomName=${encodeURIComponent(roomName)}&participantName=${encodeURIComponent(participantName)}&audioOnly=${isAudioOnly}`;

      window.open(callUrl, "_blank", "noopener,noreferrer");
      console.log("✅ [ACCEPT] Call window opened for receiver (not host)");

      // Close popup
      setIncomingCall(null);

      // Clear processed call after 10 seconds to allow new calls from same user
      setTimeout(() => {
        processedCallsRef.current.delete(incomingCall.from);
        console.log("🔄 [CLEANUP] Cleared processed call from", incomingCall.from);
      }, 10000);
    } catch (error) {
      console.error("❌ [ACCEPT] Failed to accept call:", error);
      setError("Không thể chấp nhận cuộc gọi");
      // Remove from processed on error
      processedCallsRef.current.delete(incomingCall.from);
    }
  }, [incomingCall, token, currentUserProfile, answerCall]);

  // ✅ Reject incoming call
  const handleRejectCall = useCallback(() => {
    if (!incomingCall) return;

    console.log(
      "📞 [REJECT] Rejecting call from:",
      incomingCall.callerInfo.displayName,
    );

    // Mark this call as processed
    processedCallsRef.current.add(incomingCall.from);
    console.log("✅ [REJECT] Marked call as processed");

    rejectCall(incomingCall.from);
    setIncomingCall(null);

    // Clear processed call after 5 seconds
    setTimeout(() => {
      processedCallsRef.current.delete(incomingCall.from);
      console.log("🔄 [CLEANUP] Cleared processed call from", incomingCall.from);
    }, 5000);
  }, [incomingCall, rejectCall]);

  // ✅ Cancel outgoing call
  const handleCancelCall = useCallback(() => {
    if (!outgoingCall) return;

    console.log(
      "📞 [CANCEL] Canceling outgoing call to:",
      outgoingCall.toUser.displayName,
    );

    // Notify receiver that call was cancelled
    endCall(outgoingCall.to);

    // Close popup
    setOutgoingCall(null);
  }, [outgoingCall, endCall]);

  // ✅ Open call tab when receiver accepts (for caller)
  const openCallTab = useCallback(async () => {
    if (!outgoingCall || !currentUserProfile) return;

    try {
      const participantName =
        currentUserProfile.username || currentUserProfile.displayName || "Người dùng";
      const isAudioOnly = outgoingCall.type === "audio";
      const callUrl = `/call?roomName=${encodeURIComponent(outgoingCall.roomName!)}&participantName=${encodeURIComponent(participantName)}&audioOnly=${isAudioOnly}`;

      window.open(callUrl, "_blank", "noopener,noreferrer");
      console.log("✅ [CALLER] Call window opened after acceptance (as host)");

      // Close outgoing popup
      setOutgoingCall(null);
    } catch (error) {
      console.error("❌ [CALLER] Failed to open call window:", error);
    }
  }, [outgoingCall, currentUserProfile]);

  // ✅ Handle incoming call & call events
  useEffect(() => {
    if (!callEvent) return;

    // Incoming call notification
    if (callEvent.from && callEvent.callerInfo) {
      // Create unique call ID
      const callId = `${callEvent.from}-${callEvent.type}-${Date.now()}`;

      // Check if this call was already processed (accepted/rejected)
      if (processedCallsRef.current.has(callEvent.from)) {
        console.log(
          "📞 [SKIP] Call from",
          callEvent.callerInfo.displayName,
          "already processed",
        );
        return;
      }

      // Check if we already have an incoming call from this user
      if (incomingCall && incomingCall.from === callEvent.from) {
        console.log(
          "📞 [SKIP] Already have incoming call from",
          callEvent.callerInfo.displayName,
        );
        return;
      }

      console.log(
        "📞 [INCOMING] Received call from:",
        callEvent.callerInfo.displayName,
      );
      console.log("📞 [INCOMING-DEBUG] CallerInfo data:", callEvent.callerInfo);
      setIncomingCall({
        from: callEvent.from,
        type: callEvent.type || "audio",
        callerInfo: callEvent.callerInfo,
        status: "incoming",
      });
      return;
    }

    // Call answered - open tab for caller
    if (callEvent.sdpOffer && outgoingCall) {
      console.log("📞 [ANSWER] Call was answered, opening call window...");
      openCallTab();
      return;
    }
  }, [callEvent, outgoingCall, openCallTab, incomingCall]);

  // ✅ Handle call-ended event (when caller cancels while receiver has incoming popup)
  useEffect(() => {
    if (!callEnded) return;

    console.log(
      "📞 [CALL-ENDED] Received call-ended event from:",
      callEnded.from,
    );

    // If receiver has incoming call popup open, update it to show "cancelled"
    // ✅ Use callback to avoid dependency on incomingCall state
    setIncomingCall((prev) => {
      if (prev && prev.from === callEnded.from) {
        console.log(
          "📞 [CALL-ENDED] Updating incoming call to cancelled status",
        );
        return { ...prev, status: "cancelled" };
      }
      return prev;
    });

    // Auto-close after 3 seconds if call was cancelled
    const timer = setTimeout(() => {
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
    }, 3000);

    return () => clearTimeout(timer);
  }, [callEnded]); // ✅ Only depend on callEnded, not incomingCall

  // ✅ Listen for call-rejected event
  useEffect(() => {
    if (!callEvent) return;

    // Check if this is a call-rejected event
    if (
      callEvent.type === undefined &&
      callEvent.sdpOffer === undefined &&
      callEvent.callerInfo === undefined
    ) {
      console.log("📞 [REJECTED] Call was rejected");

      // ✅ Use callback to avoid dependency on outgoingCall state
      setOutgoingCall((prev) => {
        if (prev && prev.status !== "rejected") {
          return { ...prev, status: "rejected" };
        }
        return prev;
      });

      // Auto-close popup after 3 seconds
      const timer = setTimeout(() => {
        setOutgoingCall((prev) => {
          if (prev && prev.status === "rejected") {
            return null;
          }
          return prev;
        });
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [callEvent]); // ✅ Only depend on callEvent, not outgoingCall

  // ✅ Handle messages read event - update UI when messages are read
  useEffect(() => {
    if (
      messagesRead &&
      messagesRead.messageIds &&
      messagesRead.messageIds.length > 0
    ) {
      console.log(
        "📖 [FRONTEND] Messages marked as read by:",
        messagesRead.byUserId,
      );
      console.log(
        "📖 [FRONTEND] Message IDs to update:",
        messagesRead.messageIds,
      );

      // ✅ ONLY update conversations Map (used for DM rendering)
      // This prevents duplicate key errors by maintaining a single source of truth
      setConversations((prev) => {
        const newMap = new Map(prev);
        let updateCount = 0;

        newMap.forEach((msgs, friendId) => {
          const updated = msgs.map((msg) => {
            if (messagesRead.messageIds.includes(msg.id)) {
              console.log(
                "✅ [FRONTEND] Updating message to isRead=true:",
                msg.id,
              );
              updateCount++;
              return { ...msg, isRead: true };
            }
            return msg;
          });
          newMap.set(friendId, updated);
        });

        console.log(
          `📊 [FRONTEND] Updated ${updateCount} messages across ${newMap.size} conversations`,
        );
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
          console.log("👁️ Message visible, starting 2s timer:", messageId);

          const timer = setTimeout(() => {
            console.log(
              "✅ Timer complete! Marking message as read:",
              messageId,
            );
            console.log(
              "📤 Sending mark-as-read event to:",
              selectedDirectMessageFriend._id,
            );

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
          console.log("👁️ Message hidden, canceling timer:", messageId);
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

  // Load servers on mount
  useEffect(() => {
    const authToken =
      localStorage.getItem("accessToken") || localStorage.getItem("token");
    if (authToken) {
      setToken(authToken);
      try {
        const payload = JSON.parse(atob(authToken.split(".")[1]));
        const userId = payload.userId || payload.sub;
        setCurrentUserId(userId);
        console.log("Current User ID:", userId);
        setError(null); // Clear error when token found
        loadServers();
        loadAvailableUsers();
        loadCurrentUserProfile(authToken);
      } catch (e) {
        console.error("Failed to parse token", e);
        setError("Mã token không hợp lệ");
      }
    } else {
      setError("Vui lòng đăng nhập trước");
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

  const loadCurrentUserProfile = async (token: string) => {
    try {
      const profile = await fetchCurrentProfile({ token });
      console.log("✅ Loaded current user profile:", profile);
      setCurrentUserProfile(profile);
    } catch (err) {
      console.error("❌ Failed to load current user profile", err);
    }
  };

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
    } catch (err) {
      console.error("Failed to load available users", err);
      // Fallback to loading following if available users endpoint is not ready
      loadFollowing();
    }
  }, [token]);

  // Debug: Log current user profile when it changes
  useEffect(() => {
    if (currentUserProfile) {
      console.log("🔄 Current User Profile Updated:", currentUserProfile);
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
      loadChannels(selectedServer);
      loadActiveEvents(selectedServer);
      setSelectedDirectMessageFriend(null); // Clear selected DM friend when selecting server
    } else {
      setTextChannels([]);
      setVoiceChannels([]);
      setSelectedChannel(null);
      setActiveServerEvents([]);
      setServerEventsTotalCount(0);
    }
  }, [selectedServer, loadActiveEvents]);

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

  // Khi mở popup mời vào server: load follow + followers (merge, bỏ trùng), loại ai đã tham gia server
  useEffect(() => {
    if (!inviteToServerTarget) {
      setInviteToServerCandidates([]);
      return;
    }
    const { serverId: sid } = inviteToServerTarget;
    let cancelled = false;
    Promise.all([
      serversApi.getFollowing(),
      serversApi.getMyFollowers(),
      serversApi.getServer(sid),
    ])
      .then(([following, followers, server]) => {
        if (cancelled) return;
        const memberIds = new Set(
          (server.members || []).map((m) => (typeof m.userId === "string" ? m.userId : (m.userId as any)?.toString?.() ?? ""))
        );
        const byId = new Map<string, serversApi.Friend>();
        [...following, ...followers].forEach((f) => byId.set(f._id, f));
        const candidates = Array.from(byId.values()).filter((f) => !memberIds.has(f._id));
        setInviteToServerCandidates(candidates);
      })
      .catch(() => {
        if (!cancelled) setInviteToServerCandidates([]);
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
    getConversationList({ token })
      .then((list) => {
        if (cancelled) return;
        const counts: Record<string, number> = {};
        list.forEach((c) => {
          if (c.userId) counts[c.userId] = c.unreadCount ?? 0;
        });
        // If user is currently viewing a DM conversation, keep its unread at 0
        // to avoid race where the list fetch completes before mark-as-read does.
        const activeDmId = selectedDirectMessageFriend?._id;
        if (activeDmId) counts[activeDmId] = 0;
        setDmUnreadCounts(counts);
      })
      .catch(() => {
        if (!cancelled) setDmUnreadCounts({});
      });
    return () => { cancelled = true; };
  }, [token, selectedServer, selectedDirectMessageFriend?._id]);

  // Mở server từ link /messages?server=xxx (sau khi join từ event link)
  useEffect(() => {
    const serverIdFromUrl = searchParams.get("server");
    if (serverIdFromUrl && servers.length > 0) {
      const exists = servers.some((s) => s._id === serverIdFromUrl);
      if (exists) setSelectedServer(serverIdFromUrl);
    }
  }, [searchParams, servers]);

  // ✅ Handle message-sent event (sender confirmation)
  useEffect(() => {
    if (messageSent) {
      console.log("📤 [SENT] Message sent confirmation received:", messageSent);
      const msg = messageSent as any;
      const friendId = msg.receiverId._id; // For sent messages, friend is always the receiver
      console.log("📤 [SENT] Friend ID:", friendId);
      console.log("📤 [SENT] Current user ID:", currentUserId);

      const uiMessage: UIMessage = {
        id: msg._id,
        text: msg.content,
        senderId: msg.senderId._id,
        senderEmail: msg.senderId.email,
        senderDisplayName: msg.senderId.displayName || undefined,
        senderName: msg.senderId.username || msg.senderId.email,
        senderAvatar: msg.senderId.avatar,
        timestamp: new Date(msg.createdAt),
        isFromCurrentUser: true, // Always true for sent messages
        type: "direct",
        isRead: msg.isRead || false,
        messageType: msg.type || "text",
        giphyId: msg.giphyId || undefined,
        voiceUrl: msg.voiceUrl ?? undefined,
        voiceDuration: msg.voiceDuration ?? undefined,
        reactions: normalizeReactions(msg.reactions),
        replyTo: msg.replyTo?._id || undefined,
        replyToMessage: mapReplyToMessage(msg.replyTo),
      };

      //  Replace optimistic message with real message from server
      setConversations((prev) => {
        const newMap = new Map(prev);
        const currentMessages = newMap.get(friendId) || [];
        console.log(
          "📤 [SENT] Current messages count for friend:",
          currentMessages.length,
        );

        // Find and replace temporary message
        const existingIndex = currentMessages.findIndex(
          (m) => m.id.startsWith("temp-") && m.text === msg.content,
        );

        if (existingIndex !== -1) {
          console.log(
            "✅ [SENT] Replacing optimistic message at index:",
            existingIndex,
          );
          const updated = [...currentMessages];
          updated[existingIndex] = uiMessage;
          newMap.set(friendId, updated);
          console.log("✅ [SENT] Updated messages count:", updated.length);
        } else {
          // Fallback: add if not found (shouldn't happen)
          console.warn("⚠️ [SENT] Optimistic message not found, adding anyway");
          const updated = [...currentMessages, uiMessage];
          newMap.set(friendId, updated);
          console.log("⚠️ [SENT] Added message, new count:", updated.length);
        }

        return newMap;
      });
    }
  }, [messageSent, currentUserId]);

  // ✅ Handle new-message event (incoming messages from others)
  useEffect(() => {
    if (newMessage) {
      console.log("📨 [RECEIVE] New incoming message received:", newMessage);
      const msg = newMessage.message as any;
      const friendId = msg.senderId._id; // For incoming messages, friend is always the sender
      console.log("📨 [RECEIVE] Friend ID (sender):", friendId);
      console.log("📨 [RECEIVE] Current user ID:", currentUserId);
      console.log(
        "📨 [RECEIVE] Message from current user?",
        msg.senderId._id === currentUserId,
      );
      console.log(
        "📨 [RECEIVE] Currently viewing friend?",
        selectedDirectMessageFriend?._id,
      );
      console.log(
        "📨 [RECEIVE] Is viewing this conversation?",
        selectedDirectMessageFriend?._id === friendId,
      );

      const uiMessage: UIMessage = {
        id: msg._id,
        text: msg.content,
        senderId: msg.senderId._id,
        senderEmail: msg.senderId.email,
        senderDisplayName: msg.senderId.displayName || undefined,
        senderName: msg.senderId.username || msg.senderId.email,
        senderAvatar: msg.senderId.avatar,
        timestamp: new Date(msg.createdAt),
        isFromCurrentUser: false, // Always false for incoming messages
        type: "direct",
        isRead: msg.isRead || false,
        messageType: msg.type || "text",
        giphyId: msg.giphyId || undefined,
        voiceUrl: msg.voiceUrl ?? undefined,
        voiceDuration: msg.voiceDuration ?? undefined,
        reactions: normalizeReactions(msg.reactions),
        replyTo: msg.replyTo?._id || undefined,
        replyToMessage: mapReplyToMessage(msg.replyTo),
      };

      console.log("📨 [RECEIVE-DEBUG] Created UIMessage:", {
        id: uiMessage.id,
        messageType: uiMessage.messageType,
        voiceUrl: uiMessage.voiceUrl,
        voiceDuration: uiMessage.voiceDuration,
        rawMsgType: msg.type,
        rawVoiceUrl: msg.voiceUrl,
        rawVoiceDuration: msg.voiceDuration,
      });

      // ✅ Check if sender is in friends list
      const isSenderInFriendsList = friends.some((f) => f._id === friendId);
      if (!isSenderInFriendsList) {
        console.log(
          "🔄 [RECEIVE] Sender not in friends list, reloading friends...",
        );
        // Reload friends list to include the new conversation partner
        loadAvailableUsers();
      }

      // ✅ Add incoming message to conversations Map
      setConversations((prev) => {
        const newMap = new Map(prev);
        const currentMessages = newMap.get(friendId) || [];
        console.log(
          "📨 [RECEIVE] Current messages count for friend:",
          currentMessages.length,
        );
        console.log(
          "📨 [RECEIVE] All conversations:",
          Array.from(newMap.keys()),
        );
        console.log(
          "📨 [RECEIVE] Has conversation for this friend?",
          prev.has(friendId),
        );

        // ⚠️ CRITICAL FIX: If we don't have conversation loaded yet,
        // DON'T create empty conversation! Just add this single message.
        // When user opens the chat, loadDirectMessages will load the full history.
        if (!prev.has(friendId)) {
          console.log("⚠️ [RECEIVE] Conversation not loaded yet!");
          console.log(
            "⚠️ [RECEIVE] Adding single message, full history will load when chat opens",
          );
        }

        // Check for duplicates
        const isDuplicate = currentMessages.some((m) => m.id === msg._id);
        if (!isDuplicate) {
          console.log("✅ [RECEIVE] Adding new incoming message");
          const updated = [...currentMessages, uiMessage];
          newMap.set(friendId, updated);
          console.log("✅ [RECEIVE] Updated messages count:", updated.length);
        } else {
          console.log("⚠️ [RECEIVE] Duplicate message detected, skipping");
          newMap.set(friendId, currentMessages);
        }

        return newMap;
      });

      // Increment unread indicator when receiving message in a conversation we're not viewing
      if (selectedDirectMessageFriend?._id !== friendId) {
        setDmUnreadCounts((prev) => ({
          ...prev,
          [friendId]: (prev[friendId] ?? 0) + 1,
        }));
      }

      // Auto-scroll to bottom if viewing this conversation (instant for incoming messages)
      if (
        selectedDirectMessageFriend &&
        friendId === selectedDirectMessageFriend._id
      ) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (messagesContainerRef.current) {
              messagesContainerRef.current.scrollTop =
                messagesContainerRef.current.scrollHeight;
            }
          });
        });
      }
    }
  }, [
    newMessage,
    selectedDirectMessageFriend,
    currentUserId,
    friends,
    loadAvailableUsers,
  ]);

  // ✅ Handle message-deleted event
  useEffect(() => {
    if (messageDeleted) {
      console.log("🗑️ [DELETE] Message deleted event received:", messageDeleted);
      
      // Remove message from all conversations
      setConversations((prev) => {
        const newMap = new Map(prev);
        
        // Iterate through all conversations
        for (const [friendId, messages] of newMap.entries()) {
          const updatedMessages = messages.filter(
            (msg) => msg.id !== messageDeleted.messageId
          );
          
          if (updatedMessages.length !== messages.length) {
            newMap.set(friendId, updatedMessages);
            console.log(
              `🗑️ [DELETE] Removed message from conversation with ${friendId}`
            );
          }
        }
        
        return newMap;
      });
    }
  }, [messageDeleted]);

  // Load messages only when a TEXT channel is selected (voice channels are for call, not chat)
  const selectedVoiceChannel = selectedChannel
    ? voiceChannels.find((c) => c._id === selectedChannel)
    : null;
  const selectedTextChannel = selectedChannel
    ? textChannels.find((c) => c._id === selectedChannel)
    : null;

  useEffect(() => {
    if (selectedChannel && selectedTextChannel) {
      setReplyingTo(null);
      const prev = prevChannelRef.current;
      if (prev && prev !== selectedChannel) leaveChannel(prev);
      prevChannelRef.current = selectedChannel;
      joinChannel(selectedChannel);
      loadMessages(selectedChannel);
      // Đánh dấu kênh đã đọc để thông báo chưa đọc trong Hộp thư biến mất
      serversApi.markChannelAsRead(selectedChannel).catch(() => {});
    }
  }, [selectedChannel, selectedTextChannel?._id, joinChannel, leaveChannel]);

  useEffect(() => {
    if (!selectedChannel && prevChannelRef.current) {
      leaveChannel(prevChannelRef.current);
      prevChannelRef.current = null;
    }
  }, [selectedChannel, leaveChannel]);

  useEffect(() => {
    if (isChannelSocketConnected && selectedChannel) joinChannel(selectedChannel);
  }, [isChannelSocketConnected, selectedChannel, joinChannel]);

  // Voice channel: auto-join LiveKit room when user is in a voice channel (no separate call button)
  useEffect(() => {
    if (!selectedVoiceChannel || !selectedServer || !token || !currentUserProfile) {
      setVoiceChannelCallToken(null);
      setVoiceChannelCallServerUrl("");
      setVoiceChannelCallError(null);
      return;
    }
    const roomName = `voice-${selectedServer}-${selectedVoiceChannel._id}`;
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
  }, [selectedVoiceChannel?._id, selectedServer, token, currentUserProfile?.username]);

  // Auto scroll to latest message - optimized to prevent jitter
  useEffect(() => {
    // Only auto-scroll if we should (not when user is scrolling up to read old messages)
    if (shouldAutoScrollRef.current && messages.length > 0) {
      // Double RAF to ensure DOM fully rendered
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (messagesContainerRef.current) {
            messagesContainerRef.current.scrollTop =
              messagesContainerRef.current.scrollHeight;
          }
        });
      });
    }
  }, [messages]);

  // Auto scroll for DM conversations when they change - INSTANT scroll
  useEffect(() => {
    if (selectedDirectMessageFriend) {
      const currentMessages = conversations.get(
        selectedDirectMessageFriend._id,
      );
      if (currentMessages && currentMessages.length > 0) {
        // Scroll IMMEDIATELY after render, no animation
        const scrollToBottom = () => {
          if (messagesContainerRef.current) {
            messagesContainerRef.current.scrollTop =
              messagesContainerRef.current.scrollHeight;
          }
        };

        // Execute immediately
        scrollToBottom();

        // And again after paint to ensure it sticks
        requestAnimationFrame(() => {
          scrollToBottom();
          requestAnimationFrame(scrollToBottom);
        });
      }
    }
  }, [conversations, selectedDirectMessageFriend]);


  const loadServers = async () => {
    try {
      setLoading(true);
      const serversList = await serversApi.getMyServers();
      // Organize channels by type for each server
      const serversWithChannels: BackendServer[] = await Promise.all(
        serversList.map(async (server) => {
          const channels = server.channels as serversApi.Channel[];
          const textChannels = channels.filter((c) => c.type === "text");
          const voiceChannels = channels.filter((c) => c.type === "voice");
          return {
            ...server,
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

  const loadChannels = async (serverId: string) => {
    try {
      const channels = await serversApi.getChannels(serverId);
      const text = (channels || []).filter((c) => c.type === "text");
      const voice = (channels || []).filter((c) => c.type === "voice");
      setTextChannels(text);
      setVoiceChannels(voice);
      if (text.length > 0) {
        setSelectedChannel(text[0]._id);
      } else {
        setSelectedChannel(null);
      }
    } catch (err) {
      console.error("Failed to load channels", err);
      setError("Không tải được danh sách kênh");
    }
  };

  const loadMessages = async (channelId: string) => {
    try {
      const backendMessages = await serversApi.getMessages(channelId, 50, 0);

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
            : (msg.senderId as any).displayName || undefined,
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
      }));

      setMessages(uiMessages);
      setError(null);
    } catch (err) {
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
    console.log(
      "📥 [LOAD] Loading messages for friend:",
      friendId,
      "forceReload:",
      forceReload,
    );
    console.log(
      "📥 [LOAD] Current conversations:",
      Array.from(conversations.keys()),
    );
    console.log(
      "📥 [LOAD] Already has conversation?",
      conversations.has(friendId),
    );
    console.log(
      "📥 [LOAD] Fully loaded?",
      fullyLoadedConversationsRef.current.has(friendId),
    );
    console.log(
      "📥 [LOAD] Currently loading?",
      loadingConversationsRef.current.has(friendId),
    );

    // Check if we already have FULLY loaded messages for this conversation
    if (fullyLoadedConversationsRef.current.has(friendId) && !forceReload) {
      const existingMessages = conversations.get(friendId) || [];
      console.log(
        "📥 [LOAD] Conversation fully loaded from API, message count:",
        existingMessages.length,
      );
      return; // Already fully loaded from API
    }

    // If conversation exists but wasn't fully loaded (e.g., from WebSocket only)
    if (
      conversations.has(friendId) &&
      !fullyLoadedConversationsRef.current.has(friendId)
    ) {
      const existingMessages = conversations.get(friendId) || [];
      console.log("⚠️ [LOAD] Conversation exists but not fully loaded!");
      console.log("⚠️ [LOAD] Current message count:", existingMessages.length);
      console.log(
        "⚠️ [LOAD] This might be from WebSocket only, loading full history from API...",
      );
    }

    // Check if already loading this conversation
    if (loadingConversationsRef.current.has(friendId)) {
      console.log(
        "📥 [LOAD] Already loading this conversation, skipping duplicate request",
      );
      return;
    }

    try {
      loadingConversationsRef.current.add(friendId);
      setLoadingDirectMessages(true);
      console.log("📥 [LOAD] Fetching full message history from API...");
      const backendMessages = await getDirectMessages(friendId, {
        token,
        limit: 50,
      });
      console.log(
        "📥 [LOAD] Received messages from API:",
        backendMessages.length,
      );

      const uiMessages: UIMessage[] = backendMessages.map((msg: any) => ({
        id: msg._id,
        text: msg.content,
        senderId: msg.senderId._id,
        senderEmail: msg.senderId.email,
        senderDisplayName: msg.senderId.displayName || undefined,
        senderName: msg.senderId.username || msg.senderId.email,
        senderAvatar: msg.senderId.avatar,
        timestamp: new Date(msg.createdAt),
        isFromCurrentUser: msg.senderId._id === currentUserId,
        type: "direct", // Phân biệt là message từ direct message
        isRead: msg.isRead || false, // Load initial read status
        messageType: msg.type || "text", // Type of message content
        giphyId: msg.giphyId || undefined, // Giphy ID if it's a GIF/sticker
        voiceUrl: msg.voiceUrl ?? undefined, // Voice message URL
        voiceDuration: msg.voiceDuration ?? undefined, // Voice message duration
        reactions: normalizeReactions(msg.reactions),
        replyTo: msg.replyTo?._id || undefined,
        replyToMessage: mapReplyToMessage(msg.replyTo),
      }));

      console.log(
        "📥 [LOAD] Setting conversation with",
        uiMessages.length,
        "messages from API",
      );
      setConversations((prev) => {
        const newMap = new Map(prev);
        const existingMessages = newMap.get(friendId) || [];

        // ✅ CRITICAL FIX: Always replace with API data (full history)
        // But merge any very recent messages that might have arrived via WebSocket
        console.log(
          "📥 [LOAD] Merging API messages with existing WebSocket messages",
        );
        console.log("📥 [LOAD] API messages:", uiMessages.length);
        console.log("📥 [LOAD] Existing messages:", existingMessages.length);

        // Create a map of API messages by ID for quick lookup
        const apiMessageIds = new Set(uiMessages.map((m) => m.id));

        // Find WebSocket messages that aren't in API response (very recent)
        const recentWebSocketMessages = existingMessages.filter(
          (m) => !apiMessageIds.has(m.id),
        );
        console.log(
          "📥 [LOAD] Recent WebSocket-only messages:",
          recentWebSocketMessages.length,
        );

        // Merge: API messages + recent WebSocket messages
        const mergedMessages = [...uiMessages, ...recentWebSocketMessages];
        console.log(
          "📥 [LOAD] Final merged message count:",
          mergedMessages.length,
        );

        newMap.set(friendId, mergedMessages);
        return newMap;
      });

      // Mark as fully loaded
      fullyLoadedConversationsRef.current.add(friendId);
      console.log("✅ [LOAD] Marked conversation as fully loaded from API");

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
    setSelectedDirectMessageFriend(friend);
    setMessageText("");
    setSelectedServer(null);
    setSelectedChannel(null);
    setDmUnreadCounts((prev) => ({ ...prev, [friend._id]: 0 })); // Clear unread indicator when opening chat
    // Ensure backend read-state is updated immediately when opening the conversation
    try {
      // Fire socket for realtime (fast)
      markAllAsRead?.(friend._id);
      // Also call REST to avoid race with getConversationList refresh
      if (token) await markDmConversationRead({ token, userId: friend._id });
    } catch (_err) {}
    shouldAutoScrollRef.current = true; // ✅ Enable auto-scroll when switching conversations
    // Pre-scroll to bottom BEFORE loading (prevents visual jump)
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = 0; // Reset first
    }
    await loadDirectMessages(friend._id);
  };

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

  // Handler for pinning messages
  const handlePinMessage = async (messageId: string) => {
    try {
      await pinDirectMessage(messageId, { token });

      // Update local state
      if (selectedDirectMessageFriend) {
        const friendId = selectedDirectMessageFriend._id;
        const currentMessages = conversations.get(friendId) || [];
        const updatedMessages = currentMessages.map((msg) =>
          msg.id === messageId ? { ...msg, isPinned: !msg.isPinned } : msg
        );
        setConversations(new Map(conversations.set(friendId, updatedMessages)));
      }

      // Socket will be notified via backend gateway
    } catch (error) {
      console.error("Failed to pin message:", error);
    }
  };

  // Handler for reporting messages
  const handleReportMessage = async (
    messageId: string,
    reason: string,
    description?: string
  ) => {
    try {
      await reportDirectMessage(messageId, reason, description, { token });
      alert("Tin nhắn đã được báo cáo. Cảm ơn bạn!");
      setShowReportDialog(null);

      // Socket will be notified via backend gateway
    } catch (error: any) {
      console.error("Failed to report message:", error);
      alert(error?.message || "Không thể báo cáo tin nhắn");
    }
  };

  // Handler for deleting messages
  const handleDeleteMessage = async (
    messageId: string,
    deleteType: "for-everyone" | "for-me"
  ) => {
    try {
      const result = await deleteDirectMessage(messageId, deleteType, { token });

      // Update local state
      if (selectedDirectMessageFriend) {
        const friendId = selectedDirectMessageFriend._id;
        const currentMessages = conversations.get(friendId) || [];
        const updatedMessages = currentMessages.filter(
          (msg) => msg.id !== messageId
        );
        setConversations(new Map(conversations.set(friendId, updatedMessages)));

        // Emit socket event to notify receiver (for real-time update)
        if (emitDeleteMessage) {
          emitDeleteMessage(messageId, deleteType, friendId);
        }
      }

      // Show success toast
      if (deleteType === "for-everyone") {
        setToastMessage("Đã thu hồi tin nhắn với mọi người");
      } else {
        setToastMessage("Bạn đã xóa một tin nhắn");
      }

      // Hide toast after 3 seconds
      setTimeout(() => setToastMessage(null), 3000);

      // Close dialog
      setShowDeleteDialog(null);
    } catch (error) {
      console.error("Failed to delete message:", error);
      alert("Không thể gỡ tin nhắn");
    }
  };

  // Handler for replying to a message
  const handleReplyToMessage = (message: UIMessage) => {
    setReplyingTo(message);
  };

  const handleSendMessage = async () => {
    if (!messageText.trim() || !selectedChannel) return;

    const content = messageText.trim();

    try {
      setMessageText("");
      shouldAutoScrollRef.current = true;

      const newMessage = await serversApi.createMessage(
        selectedChannel,
        content,
        undefined,
        replyingTo?.id,
      );

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
            ? currentUserProfile?.username || ""
            : (newMessage.senderId as any)?.username || (newMessage.senderId as any)?.email || currentUserProfile?.username || "",
        senderDisplayName:
          typeof newMessage.senderId === "string"
            ? currentUserProfile?.displayName || undefined
            : (newMessage.senderId as any)?.displayName ?? currentUserProfile?.displayName ?? undefined,
        senderAvatar:
          typeof newMessage.senderId === "string"
            ? currentUserProfile?.avatar
            : (newMessage.senderId as any)?.avatarUrl ?? (newMessage.senderId as any)?.avatar ?? currentUserProfile?.avatar,
        timestamp: new Date(newMessage.createdAt),
        isFromCurrentUser: true,
        type: "server",
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
      };

      setMessages((prev) => [...prev, uiMessage]);
      setReplyingTo(null);
    } catch (err) {
      console.error("Failed to send message", err);
      setError("Không gửi được tin nhắn");
      setMessageText(content);
    }
  };

  const handleSendDirectMessage = async () => {
    if (!messageText.trim() || !selectedDirectMessageFriend) return;

    const messageContent = messageText.trim();
    const friendId = selectedDirectMessageFriend._id;
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
        senderDisplayName: currentUserProfile?.displayName || undefined,
        senderName: currentUserProfile?.username || "",
        senderAvatar: currentUserProfile?.avatar,
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
          senderAvatar: typeof created.senderId === "object" ? created.senderId?.avatar : currentUserProfile?.avatar,
          timestamp: new Date(created.createdAt),
          isFromCurrentUser: true,
          type: "direct",
          isRead: created.isRead ?? false,
          messageType: created.type || "text",
          giphyId: created.giphyId ?? undefined,
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

  // Handle sending GIF or Sticker
  const handleSendGiphy = async (gif: GiphyGif, type: "gif" | "sticker") => {
    if (!selectedDirectMessageFriend) return;

    const friendId = selectedDirectMessageFriend._id;

    try {
      // Close picker
      setShowGiphyPicker(false);

      // ✅ Create optimistic message
      const optimisticMessage: UIMessage = {
        id: `temp-${Date.now()}-${Math.random()}`,
        text: gif.title || `Sent a ${type}`,
        senderId: currentUserId,
        senderEmail: "",
        senderDisplayName: currentUserProfile?.displayName || undefined,
        senderName: currentUserProfile?.username || "",
        senderAvatar: currentUserProfile?.avatar,
        timestamp: new Date(),
        isFromCurrentUser: true,
        type: "direct",
        isRead: false,
        messageType: type,
        giphyId: gif.id,
      };

      // ✅ Enable auto-scroll
      shouldAutoScrollRef.current = true;

      // ✅ OPTIMISTIC UPDATE
      setConversations((prev) => {
        const newMap = new Map(prev);
        const currentMessages = newMap.get(friendId) || [];
        newMap.set(friendId, [...currentMessages, optimisticMessage]);
        return newMap;
      });

      // Send to API directly
      await sendDirectMessage(friendId, {
        token,
        content: gif.title || `Sent a ${type}`,
        type,
        giphyId: gif.id,
        replyTo: replyingTo?.id,
      });

      // Clear reply preview
      setReplyingTo(null);
    } catch (err) {
      console.error(`Failed to send ${type}:`, err);
      setError(`Không gửi được ${type}`);
    }
  };

  // Handle voice recording complete
  const handleVoiceRecordComplete = async (
    audioBlob: Blob,
    duration: number,
    metadata?: { mimeType: string; fileExtension: string },
  ) => {
    if (!selectedDirectMessageFriend) return;

    const friendId = selectedDirectMessageFriend._id;

    try {
      console.log("🎤 [VOICE-UPLOAD] Starting upload, duration:", duration);
      console.log("🎤 [VOICE-UPLOAD] Metadata:", metadata);
      setIsRecordingVoice(false);
      setIsUploadingVoice(true);

      // Upload audio file to Cloudinary with correct extension and type
      const fileName = metadata?.fileExtension 
        ? `voice-message.${metadata.fileExtension}`
        : "voice-message.m4a";
      const mimeType = metadata?.mimeType || "audio/mp4";
      
      const audioFile = new File([audioBlob], fileName, {
        type: mimeType,
      });
      console.log("🎤 [VOICE-UPLOAD] Audio file created:", {
        name: audioFile.name,
        type: audioFile.type,
        size: audioFile.size,
      });

      console.log("🎤 [VOICE-UPLOAD] Uploading to Cloudinary...");
      const uploadResponse = await uploadMedia({ token, file: audioFile });
      console.log("🎤 [VOICE-UPLOAD] Upload response:", uploadResponse);

      if (!uploadResponse || (!uploadResponse.secureUrl && !uploadResponse.url)) {
        throw new Error("Failed to upload voice message");
      }

      // Prefer secureUrl (https) over url (http) to avoid mixed content issues
      const voiceUrl = uploadResponse.secureUrl || uploadResponse.url;
      console.log("✅ [VOICE-UPLOAD] Upload successful, URL:", voiceUrl);

      // Create optimistic message with transformed URL
      const optimisticMessage: UIMessage = {
        id: `temp-${Date.now()}-${Math.random()}`,
        text: "Tin nhắn thoại",
        senderId: currentUserId,
        senderEmail: "",
        senderDisplayName: currentUserProfile?.displayName || undefined,
        senderName: currentUserProfile?.username || "",
        senderAvatar: currentUserProfile?.avatar,
        timestamp: new Date(),
        isFromCurrentUser: true,
        type: "direct",
        isRead: false,
        messageType: "voice",
        voiceUrl: voiceUrl,
        voiceDuration: duration,
      };

      console.log("🎤 [VOICE-OPTIMISTIC] Created optimistic message:", {
        messageType: optimisticMessage.messageType,
        voiceUrl: optimisticMessage.voiceUrl,
        voiceDuration: optimisticMessage.voiceDuration,
      });

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
      console.log("🎤 [VOICE-SEND] Sending to backend:", {
        type: "voice",
        voiceUrl: uploadResponse.url,
        voiceDuration: duration,
      });

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

      console.log("✅ [VOICE-SEND] Response from backend:", response);
      console.log("🎤 [VOICE-SEND-DEBUG] Response fields:", {
        _id: response._id,
        type: response.type,
        voiceUrl: response.voiceUrl,
        voiceDuration: response.voiceDuration,
        content: response.content,
      });

      // Replace optimistic message with real message from server
      setConversations((prev) => {
        const newMap = new Map(prev);
        const currentMessages = newMap.get(friendId) || [];

        // Find optimistic message
        const optimisticIndex = currentMessages.findIndex(
          (m) => m.id === optimisticMessage.id,
        );

        if (optimisticIndex !== -1) {
          console.log(
            "✅ [VOICE-SEND] Replacing optimistic message with server response",
          );

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

          console.log("🎤 [VOICE-SEND-DEBUG] Created realMessage:", {
            id: realMessage.id,
            messageType: realMessage.messageType,
            voiceUrl: realMessage.voiceUrl,
            voiceDuration: realMessage.voiceDuration,
          });

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

      console.log("✅ [VOICE-SEND] Sent to backend successfully");
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
      const newServer = await serversApi.createServer(serverName);

      const serverWithChannels: BackendServer = {
        ...newServer,
        textChannels: (newServer.channels as serversApi.Channel[]).filter(
          (c) => c.type === "text",
        ),
        voiceChannels: (newServer.channels as serversApi.Channel[]).filter(
          (c) => c.type === "voice",
        ),
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

      const serverWithChannels: BackendServer = {
        ...newServer,
        textChannels: (newServer.channels as serversApi.Channel[]).filter(
          (c) => c.type === "text",
        ),
        voiceChannels: (newServer.channels as serversApi.Channel[]).filter(
          (c) => c.type === "voice",
        ),
      };

      setServers([...servers, serverWithChannels]);
      setSelectedServer(serverWithChannels._id);

      // Select the first text channel if available
      if (serverWithChannels.textChannels && serverWithChannels.textChannels.length > 0) {
        setSelectedChannel(serverWithChannels.textChannels[0]._id);
      }
    } catch (err) {
      console.error("Failed to fetch created server", err);
      setError("Không tải được thông tin máy chủ");
    }
  };

  const openCreateChannelModal = (type: ChannelTypeForCreate, sectionLabel: string) => {
    setCreateChannelDefaultType(type);
    setCreateChannelSectionLabel(sectionLabel);
    setShowCreateChannelModal(true);
  };

  const handleCreateChannel = async (
    name: string,
    type: "text" | "voice",
    isPrivate: boolean,
  ) => {
    if (!selectedServer) return;
    await serversApi.createChannel(selectedServer, name, type, undefined, isPrivate);
    await loadChannels(selectedServer);
  };

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

  // ✅ Memoized render function to prevent unnecessary re-renders
  const renderMessageContent = useCallback(
    (message: UIMessage) => {
      const { text, messageType, giphyId, voiceUrl, voiceDuration } = message;

      // Debug log for all messages
      if (messageType === "voice" || voiceUrl) {
        console.log("🎤 [RENDER-DEBUG] Voice message check:", {
          messageType,
          voiceUrl,
          voiceDuration,
          hasVoiceUrl: !!voiceUrl,
          hasVoiceDuration: !!voiceDuration,
          voiceDurationType: typeof voiceDuration,
          voiceDurationValue: voiceDuration,
        });
      }

      // Check if message is Voice Message (allow missing voiceDuration for older messages)
      if (messageType === "voice" && voiceUrl) {
        return (
          <VoiceMessage
            voiceUrl={voiceUrl}
            duration={voiceDuration ?? 0}
            isFromCurrentUser={message.isFromCurrentUser}
          />
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

      // Check if message contains poll
      const pollMatch = text.match(/📊 \[Poll\]: ([a-f0-9]+)/);
      if (pollMatch) {
        const pollId = pollMatch[1];
        return <PollMessage pollId={pollId} token={token} onError={setError} />;
      }

      // Check if message contains media
      const imageMatch = text.match(/📷 \[Image\]: (https?:\/\/[^\s]+)/);
      const videoMatch = text.match(/🎬 \[Video\]: (https?:\/\/[^\s]+)/);
      const gifMatch = text.match(/(https?:\/\/[^\s]+\.gif)/i);

      if (imageMatch) {
        const imageUrl = imageMatch[1];
        return (
          <div className={styles.mediaMessage}>
            <img
              src={imageUrl}
              alt="Ảnh được chia sẻ"
              className={styles.messageImage}
              onError={(e) => {
                e.currentTarget.style.display = "none";
                e.currentTarget.nextElementSibling?.classList.remove(
                  styles.hidden,
                );
              }}
            />
            <span
              className={styles.hidden}
              style={{ fontSize: "12px", color: "var(--color-text-muted)" }}
            >
              Không tải được ảnh
            </span>
          </div>
        );
      }

      if (videoMatch) {
        const videoUrl = videoMatch[1];
        return (
          <div className={styles.mediaMessage}>
            <video
              src={videoUrl}
              controls
              className={styles.messageVideo}
              onError={(e) => {
                e.currentTarget.style.display = "none";
                e.currentTarget.nextElementSibling?.classList.remove(
                  styles.hidden,
                );
              }}
            >
              Your browser does not support video playback.
            </video>
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
        const gifUrl = gifMatch[1];
        return (
          <div className={styles.mediaMessage}>
            <img src={gifUrl} alt="Ảnh GIF" className={styles.messageGif} />
          </div>
        );
      }

      // Regular text message
      return <span>{text}</span>;
    },
    [token],
  );

  // Handle emoji selection
  const handleEmojiClick = (emojiData: any) => {
    setMessageText((prev) => prev + emojiData.emoji);
    setShowEmojiPicker(false);
  };

  // Search GIFs from Tenor API (free, no key needed)
  const searchGifs = async (query: string) => {
    if (!query.trim()) {
      setGifs([]);
      return;
    }

    try {
      const response = await fetch(
        `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(query)}&key=AIzaSyAyimkuYQYF_FXVALexPuGQctUWRURdCYQ&limit=20`,
      );
      const data = await response.json();
      setGifs(data.results || []);
    } catch (error) {
      console.error("Failed to search GIFs:", error);
      setGifs([]);
    }
  };

  // Handle GIF selection
  const handleGifClick = (gif: any) => {
    const gifUrl = gif.media_formats.gif.url;
    setMessageText((prev) => prev + ` ${gifUrl} `);
    setShowGifPicker(false);
    setGifSearchQuery("");
    setGifs([]);
  };

  // Handle file upload
  const handleFileUpload = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = "image/*,video/*";
    input.onchange = async (e: any) => {
      const files: File[] = Array.from(e.target.files || []);
      if (files.length === 0) return;

      setShowPlusMenu(false);

      try {
        // Validate video duration (max 3 minutes = 180 seconds)
        for (const file of files) {
          if (file.type.startsWith("video/")) {
            const duration = await getVideoDuration(file);
            if (duration > 180) {
              setError("Video phải dài 3 phút trở xuống");
              return;
            }
          }
        }

        // ✅ FIX: Create optimistic loading messages for each file
        const loadingMessages: UIMessage[] = [];
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const isImage = file.type.startsWith("image/");
          const isVideo = file.type.startsWith("video/");
          const tempId = `temp-upload-${Date.now()}-${i}`;

          const loadingMessage: UIMessage = {
            id: tempId,
            text: isImage ? `📤 Uploading image...` : `📤 Uploading video...`,
            senderId: currentUserId,
            senderEmail: "",
            senderDisplayName: currentUserProfile?.displayName || undefined,
            senderName: currentUserProfile?.username || "",
            senderAvatar: currentUserProfile?.avatar,
            timestamp: new Date(),
            isFromCurrentUser: true,
            type: selectedDirectMessageFriend ? "direct" : "server",
          };

          loadingMessages.push(loadingMessage);

          // Add to UI immediately
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
            setMessages((prev) => [...prev, loadingMessage]);
          }
        }

        // Auto-scroll (instant for media uploads)
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (messagesContainerRef.current) {
              messagesContainerRef.current.scrollTop =
                messagesContainerRef.current.scrollHeight;
            }
          });
        });

        // ✅ FIX: Upload files in background
        let uploadResults;
        if (files.length === 1) {
          const result = await uploadMedia({ token, file: files[0] });
          uploadResults = [result];
        } else {
          uploadResults = await uploadMediaBatch({ token, files });
        }

        // ✅ FIX: Send each media and update UI
        for (let i = 0; i < uploadResults.length; i++) {
          const media = uploadResults[i];
          const loadingMsgId = loadingMessages[i].id;
          const isImage = media.resourceType === "image";
          const isVideo = media.resourceType === "video";

          let mediaMessage: string;
          if (isImage) {
            mediaMessage = `📷 [Image]: ${media.url}`;
          } else if (isVideo) {
            mediaMessage = `🎬 [Video]: ${media.url}`;
          } else {
            mediaMessage = media.url;
          }

          // Create final message
          const finalMessage: UIMessage = {
            id: `temp-${Date.now()}-${i}`,
            text: mediaMessage,
            senderId: currentUserId,
            senderEmail: "",
            senderDisplayName: currentUserProfile?.displayName || undefined,
            senderName: currentUserProfile?.username || "",
            senderAvatar: currentUserProfile?.avatar,
            timestamp: new Date(),
            isFromCurrentUser: true,
            type: selectedDirectMessageFriend ? "direct" : "server",
          };

          // Replace loading message with actual content
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

            // Send via WebSocket
            emitSendMessage(selectedDirectMessageFriend._id, mediaMessage, [
              media.url,
            ]);
          } else if (selectedChannel) {
            setMessages((prev) =>
              prev.map((m) => (m.id === loadingMsgId ? finalMessage : m)),
            );

            // Send via API for channel message
            await serversApi.createMessage(selectedChannel, mediaMessage);
          }
        }

        console.log("✅ Files uploaded successfully:", uploadResults);
      } catch (error: any) {
        console.error("❌ Failed to upload files:", error);
        setError(error?.message || "Không tải lên được tệp");
      }
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
        senderDisplayName: currentUserProfile?.displayName || undefined,
        senderName: currentUserProfile?.username || "",
        senderAvatar: currentUserProfile?.avatar,
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
        setMessages((prev) => [...prev, loadingMessage]);
      }

      // Auto-scroll (instant for polls)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (messagesContainerRef.current) {
            messagesContainerRef.current.scrollTop =
              messagesContainerRef.current.scrollHeight;
          }
        });
      });

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
        senderDisplayName: currentUserProfile?.displayName || undefined,
        senderName: currentUserProfile?.username || "",
        senderAvatar: currentUserProfile?.avatar,
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
      console.log("✅ Poll created:", poll);
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

  if (!canRender) {
    return null;
  }

  const currentServer = servers.find((s) => s._id === selectedServer);

  return (
    <div className={styles.container}>
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
              placeholder="••••••"
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
      {/* Call Room Overlay - DEPRECATED: Calls now open in new tab */}
      {/* {isInCall && callToken && callServerUrl && (
        <CallRoom
          token={callToken}
          serverUrl={callServerUrl}
          onDisconnect={handleEndCall}
          participantName={currentUserProfile?.username || currentUserProfile?.displayName || 'Người dùng'}
          isAudioOnly={isAudioOnly}
        />
      )} */}

      {/* Left Sidebar - Logo & Create Group */}
      <div className={styles.leftSidebar}>
        <img
          src="/logo.png"
          alt="Cordigram"
          className={styles.logoImage}
          onClick={() => {
            setSelectedServer(null);
            setSelectedChannel(null);
          }}
          style={{ cursor: "pointer" }}
        />

        <button
          className={styles.createBtn}
          title="Tạo máy chủ"
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
            return (
              <button
                key={server._id}
                className={styles.navBtn}
                onClick={() => setSelectedServer(server._id)}
                onContextMenu={async (e) => {
                  e.preventDefault();
                  // Fetch permissions cho server này
                  let permissions: serversApi.CurrentUserServerPermissions | undefined;
                  try {
                    permissions = await serversApi.getCurrentUserPermissions(server._id);
                  } catch {
                    // Fallback: tính toán từ isOwner
                    const isOwner = currentUserId !== "" && 
                      String((server as any).ownerId?._id ?? (server as any).ownerId) === currentUserId;
                    permissions = {
                      isOwner,
                      canKick: isOwner,
                      canBan: isOwner,
                      canTimeout: isOwner,
                      canManageServer: isOwner,
                      canManageChannels: isOwner,
                      canManageEvents: isOwner,
                      canCreateInvite: true,
                    };
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
          <button className={styles.settingsBtn} title="Settings">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M12 1v6m0 6v6M4.22 4.22l4.24 4.24m3.08 3.08l4.24 4.24M1 12h6m6 0h6m-16.78 7.78l4.24-4.24m3.08-3.08l4.24-4.24"></path>
            </svg>
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
              {selectedServer
                ? (currentServer?.name ?? "Máy chủ")
                : "Tin nhắn trực tiếp"}
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
                  title="Hộp thư đến"
                  aria-label="Hộp thư đến"
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
                {/* Search Bar */}
                <div className={styles.searchInputWrapper}>
                  <input
                    type="text"
                    className={styles.searchInput}
                    placeholder="Tìm hoặc bắt đầu cuộc trò chuyện"
                  />
                </div>

                {/* DM Sidebar: danh sách menu (Friends, Mission, ...) */}
                <div className={styles.dmSidebarMenuList}>
                  <button type="button" className={styles.dmSidebarMenuEntry}>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                      <circle cx="9" cy="7" r="4"></circle>
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                      <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                    </svg>
                    <span>Friends</span>
                  </button>
                  <button type="button" className={styles.dmSidebarMenuEntry}>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M9 11H7.82a2 2 0 0 0-1.82 1.18l-2 5A2 2 0 0 0 3 19h4m0 0a6 6 0 0 0 12 0m4-7h-1.17a2 2 0 0 1-1.82-1.18l-2-5A2 2 0 0 0 13 5h-4"></path>
                    </svg>
                    <span>Mission</span>
                  </button>
                  <button type="button" className={styles.dmSidebarMenuEntry}>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <circle cx="9" cy="21" r="1"></circle>
                      <circle cx="20" cy="21" r="1"></circle>
                      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                    </svg>
                    <span>Store</span>
                  </button>
                </div>

                {/* Direct Messages Section */}
                <div className={styles.directMessagesSection}>
                  <div className={styles.directMessagesTitleRow}>
                    <h3 className={styles.directMessagesTitle}>
                      DIRECT MESSAGES
                    </h3>
                  </div>

                  {/* Friends List */}
                  <div className={styles.friendsList}>
                    {friends && friends.length > 0 ? (
                      friends.map((friend) => {
                        const initial =
                          friend.displayName?.charAt(0)?.toUpperCase() ||
                          friend.username?.charAt(0)?.toUpperCase() ||
                          "U";
                        const hue = Math.floor(Math.random() * 360);
                        return (
                          <div
                            key={friend._id}
                            className={`${styles.friendItem} ${selectedDirectMessageFriend?._id === friend._id ? styles.active : ""}`}
                            onClick={() =>
                              handleSelectDirectMessageFriend(friend)
                            }
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
                              <p className={styles.friendName}>
                                {friend.displayName || friend.username}
                              </p>
                              <p className={styles.friendStatus}>
                                {friend.email}
                              </p>
                            </div>
                            {(dmUnreadCounts[friend._id] ?? 0) > 0 && (
                              <span className={styles.friendUnreadWrap}>
                                <span className={styles.dmUnreadDot} aria-hidden />
                                <span className={styles.dmUnreadBadge}>
                                  {dmUnreadCounts[friend._id]! > 99 ? "99+" : dmUnreadCounts[friend._id]}
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
                          currentUserProfile?.avatarUrl,
                        )
                          ? `url(${currentUserProfile.avatarUrl})`
                          : undefined,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                      }}
                    >
                      {!isValidAvatarUrl(currentUserProfile?.avatarUrl) && (
                        <span>
                          {currentUserProfile?.displayName
                            ?.charAt(0)
                            ?.toUpperCase() ||
                            currentUserProfile?.username
                              ?.charAt(0)
                              ?.toUpperCase() ||
                            "U"}
                        </span>
                      )}
                      <div className={styles.onlineStatus}></div>
                    </div>
                    <div className={styles.userTextInfo}>
                      <div className={styles.userDisplayName}>
                        {currentUserProfile?.displayName ||
                          currentUserProfile?.username ||
                          "Người dùng"}
                      </div>
                      <div className={styles.userUsername}>
                        {currentUserProfile?.username || ""}
                      </div>
                    </div>
                  </div>

                  {/* Voice Controls */}
                  <div className={styles.voiceButtons}>
                    <button
                      type="button"
                      className={`${styles.voiceButton} ${voiceMicMuted ? styles.voiceButtonMuted : ""}`}
                      title={voiceMicMuted ? "Bật mic" : "Tắt mic"}
                      onClick={() => setVoiceMicMuted((m) => !m)}
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
                      title={voiceSoundMuted ? "Bật âm thanh" : "Tắt âm thanh"}
                      onClick={() => setVoiceSoundMuted((m) => !m)}
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
              // Server Selected - Header (tên máy chủ + mời) + Sự kiện + Nâng cấp + Kênh Chat & Kênh đàm thoại
              <>
                <div className={styles.conversationsScrollArea}>
                {/* Server header: tên máy chủ + mời tham gia */}
                <div className={styles.serverHeader}>
                  <button
                    type="button"
                    className={styles.serverNameBtn}
                    title={currentServer?.name}
                  >
                    <span className={styles.serverNameText}>
                      {currentServer?.name || "Máy chủ"}
                    </span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className={styles.inviteServerBtn}
                    title="Mời tham gia máy chủ"
                    onClick={() => {
                      if (currentServer)
                        setInviteToServerTarget({
                          serverId: currentServer._id,
                          serverName: currentServer.name || "Máy chủ",
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
                </div>
                {/* Sự kiện đang diễn ra - hiển thị bên trên Sự kiện khi đến đúng thời gian */}
                {activeServerEvents.length > 0 && (
                  <div className={styles.activeEventsBlock}>
                    {activeServerEvents.map((ev) => (
                      <div key={ev._id} className={styles.activeEventCard}>
                        <div className={styles.activeEventHeader}>
                          <span className={styles.activeEventLive}>
                            <span className={styles.activeEventDot} />
                            Đang Diễn Ra
                          </span>
                          <button
                            type="button"
                            className={styles.activeEventDismiss} 
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveServerEvents((prev) => prev.filter((x) => x._id !== ev._id));
                            }}
                            aria-label="Đóng"
                          >
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
                          Chi Tiết Sự Kiện
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
                  <span>Sự Kiện</span>
                  {serverEventsTotalCount > 0 && (
                    <span className={styles.eventCountBadge}>{serverEventsTotalCount} Sự kiện</span>
                  )}
                </button>
                {/* Nâng Cấp Máy Chủ */}
                <button type="button" className={styles.serverMenuItem}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2L2 7l10 5 10-5-10-5z" />
                    <path d="M2 17l10 5 10-5" />
                  </svg>
                  <span>Nâng Cấp Máy Chủ</span>
                </button>
                <div className={styles.section}>
                  <div className={styles.sectionHeader}>
                    <h3 className={styles.sectionTitle}>Kênh Chat</h3>
                    <button
                      type="button"
                      className={styles.addChannelBtn}
                      title="Tạo kênh chat"
                      onClick={() => openCreateChannelModal("text", "Kênh Chat")}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                    </button>
                  </div>
                  {textChannels.length > 0 ? (
                    textChannels.map((channel) => (
                      <div
                        key={channel._id}
                        className={`${styles.conversationItem} ${
                          selectedChannel === channel._id ? styles.active : ""
                        }`}
                        onClick={() => setSelectedChannel(channel._id)}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            width: "100%",
                          }}
                        >
                          <span style={{ fontSize: "18px" }}>
                            #{channel.name}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div
                      style={{
                        padding: "12px 16px",
                        fontSize: "12px",
                        color: "var(--color-text-muted)",
                      }}
                    >
                      Chưa có kênh chat
                    </div>
                  )}
                </div>
                <div className={styles.section}>
                  <div className={styles.sectionHeader}>
                    <h3 className={styles.sectionTitle}>Kênh đàm thoại</h3>
                    <button
                      type="button"
                      className={styles.addChannelBtn}
                      title="Tạo kênh đàm thoại"
                      onClick={() => openCreateChannelModal("voice", "Kênh đàm thoại")}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                    </button>
                  </div>
                  {voiceChannels.length > 0 ? (
                    voiceChannels.map((channel) => {
                      const isSelected = selectedChannel === channel._id;
                      const canInviteToVoice = currentServer && (currentServer.ownerId === currentUserId || currentServer.isPublic);
                      const showInviteBar = isSelected && canInviteToVoice && !voiceInviteDismissed.has(channel._id);
                      const participantsInChannel = voiceChannelParticipants[channel._id] ?? [];
                      return (
                        <div key={channel._id} className={styles.voiceChannelWrap}>
                          <div
                            className={`${styles.conversationItem} ${isSelected ? styles.active : ""}`}
                            onClick={() => setSelectedChannel(channel._id)}
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
                              <span>{channel.name}</span>
                            </div>
                            {isSelected && (
                              <div className={styles.voiceChannelActions}>
                                <button type="button" className={styles.voiceChannelActionIcon} title="Chat">
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                                  </svg>
                                </button>
                                <button type="button" className={styles.voiceChannelActionIcon} title="Mời">
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                                    <circle cx="9" cy="7" r="4" />
                                    <line x1="19" y1="8" x2="19" y2="14" />
                                    <line x1="22" y1="11" x2="16" y2="11" />
                                  </svg>
                                </button>
                                <button type="button" className={styles.voiceChannelActionIcon} title="Cài đặt">
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <circle cx="12" cy="12" r="3" />
                                    <path d="M12 1v6m0 6v6M4.22 4.22l4.24 4.24m3.08 3.08l4.24 4.24M1 12h6m6 0h6m-16.78 7.78l4.24-4.24m3.08-3.08l4.24-4.24" />
                                  </svg>
                                </button>
                              </div>
                            )}
                          </div>
                          {showInviteBar && (
                            <div className={styles.voiceInviteBar}>
                              <button
                                type="button"
                                className={styles.voiceInviteBarClickable}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (currentServer && canInviteToVoice)
                                    setInviteToVoiceTarget({
                                      serverId: currentServer._id,
                                      serverName: currentServer.name || "Máy chủ",
                                      channelId: channel._id,
                                      channelName: channel.name,
                                    });
                                }}
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                                  <circle cx="9" cy="7" r="4" />
                                  <line x1="19" y1="8" x2="19" y2="14" />
                                  <line x1="22" y1="11" x2="16" y2="11" />
                                </svg>
                                <span>Mời vào Kênh thoại</span>
                              </button>
                              <button
                                type="button"
                                className={styles.voiceInviteDismiss}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setVoiceInviteDismissed((prev) => new Set(prev).add(channel._id));
                                }}
                                aria-label="Đóng"
                              >
                                ×
                              </button>
                            </div>
                          )}
                          {participantsInChannel.length > 0 && (
                            <div className={styles.voiceChannelParticipants} aria-label="Người đang trong kênh thoại">
                              <div className={styles.voiceChannelParticipantsLabel}>Đang trong kênh</div>
                              {participantsInChannel.map((p) => (
                                <div key={p.identity} className={styles.voiceChannelParticipant}>
                                  <div
                                    className={styles.voiceChannelParticipantAvatar}
                                    style={{
                                      backgroundColor: "var(--color-primary)",
                                      backgroundSize: "cover",
                                      backgroundPosition: "center",
                                    }}
                                  >
                                    <span>{(p.name || "?").charAt(0).toUpperCase()}</span>
                                  </div>
                                  <span className={styles.voiceChannelParticipantName}>{p.name}</span>
                                  <div className={styles.voiceChannelParticipantIcons}>
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-label="Micro tắt (mute)" role="img">
                                      <title>Micro tắt (mute)</title>
                                      <path d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" />
                                      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                                      <line x1="12" y1="19" x2="12" y2="23" />
                                      <line x1="8" y1="23" x2="16" y2="23" />
                                      <line x1="2" y1="2" x2="22" y2="22" />
                                    </svg>
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-label="Tai nghe tắt (deafen)" role="img">
                                      <title>Tai nghe tắt (deafen)</title>
                                      <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
                                      <path d="M21 19a2 2 0 0 1-2 2h-1v-4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v4H5a2 2 0 0 1-2-2v-5" />
                                      <line x1="2" y1="2" x2="22" y2="22" />
                                    </svg>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div
                      style={{
                        padding: "12px 16px",
                        fontSize: "12px",
                        color: "var(--color-text-muted)",
                      }}
                    >
                      Chưa có kênh đàm thoại
                    </div>
                  )}
                </div>
                </div>

                {/* Voice Controls Footer - cùng vị trí như bên DM */}
                <div className={styles.voiceControls}>
                  <div className={styles.userInfoSection}>
                    <div
                      className={styles.userAvatar}
                      style={{
                        backgroundImage: isValidAvatarUrl(
                          currentUserProfile?.avatarUrl,
                        )
                          ? `url(${currentUserProfile.avatarUrl})`
                          : undefined,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                      }}
                    >
                      {!isValidAvatarUrl(currentUserProfile?.avatarUrl) && (
                        <span>
                          {currentUserProfile?.displayName
                            ?.charAt(0)
                            ?.toUpperCase() ||
                            currentUserProfile?.username
                              ?.charAt(0)
                              ?.toUpperCase() ||
                            "U"}
                        </span>
                      )}
                      <div className={styles.onlineStatus}></div>
                    </div>
                    <div className={styles.userTextInfo}>
                      <div className={styles.userDisplayName}>
                        {currentUserProfile?.displayName ||
                          currentUserProfile?.username ||
                          "Người dùng"}
                      </div>
                      <div className={styles.userUsername}>
                        {currentUserProfile?.username || ""}
                      </div>
                    </div>
                  </div>
                  <div className={styles.voiceButtons}>
                    <button
                      type="button"
                      className={`${styles.voiceButton} ${voiceMicMuted ? styles.voiceButtonMuted : ""}`}
                      title={voiceMicMuted ? "Bật mic" : "Tắt mic"}
                      onClick={() => setVoiceMicMuted((m) => !m)}
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
                      title={voiceSoundMuted ? "Bật âm thanh" : "Tắt âm thanh"}
                      onClick={() => setVoiceSoundMuted((m) => !m)}
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
            {(selectedChannel && currentServer) ||
            selectedDirectMessageFriend ? (
              selectedVoiceChannel ? (
                <>
                  {/* Voice channel = Call UI (no chat) */}
                  <div className={styles.chatHeader}>
                    <div className={styles.chatHeaderLeft}>
                      <span className={styles.voiceChannelIcon}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" />
                          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                          <line x1="12" y1="19" x2="12" y2="23" stroke="currentColor" strokeWidth="2" />
                          <line x1="8" y1="23" x2="16" y2="23" stroke="currentColor" strokeWidth="2" />
                        </svg>
                      </span>
                      <h2 className={styles.chatHeaderTitle}>
                        {selectedVoiceChannel.name}
                      </h2>
                    </div>
                    <div className={styles.chatHeaderActions}>
                      <button className={styles.chatIconBtn} title="Chat">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        </svg>
                      </button>
                      <button className={styles.chatIconBtn} title="Tùy chọn khác">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                          <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <div className={styles.voiceCallView}>
                    <div className={styles.voiceCallVideoArea}>
                      {voiceChannelCallError ? (
                        <div className={styles.voiceCallError}>
                          <p>{voiceChannelCallError}</p>
                          <button
                            type="button"
                            className={styles.voiceCallErrorBtn}
                            onClick={() => setSelectedChannel(null)}
                          >
                            Rời kênh
                          </button>
                        </div>
                      ) : voiceChannelCallToken && voiceChannelCallServerUrl ? (
                        <VoiceChannelCall
                          token={voiceChannelCallToken}
                          serverUrl={voiceChannelCallServerUrl}
                          participantName={
                            currentUserProfile?.displayName ||
                            currentUserProfile?.username ||
                            "Người dùng"
                          }
                          onDisconnect={() => {
                            setVoiceChannelCallToken(null);
                            setVoiceChannelCallServerUrl("");
                            setSelectedChannel(null);
                            if (selectedServer) loadActiveEvents(selectedServer);
                          }}
                        />
                      ) : (
                        <div className={styles.voiceCallConnecting}>
                          <div className={styles.voiceCallSpinner} />
                          <p>Đang kết nối...</p>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              ) : (
              <>
                {/* Chat Header (DM or text channel) */}
                <div className={styles.chatHeader}>
                  <div className={styles.chatHeaderLeft}>
                    <h2 className={styles.chatHeaderTitle}>
                      {selectedDirectMessageFriend
                        ? selectedDirectMessageFriend.displayName ||
                          selectedDirectMessageFriend.username
                        : "#" +
                          (textChannels.find((c) => c._id === selectedChannel)
                            ?.name ||
                            voiceChannels.find((c) => c._id === selectedChannel)
                              ?.name ||
                            "channel")}
                    </h2>
                  </div>
                  <div className={styles.chatHeaderActions}>
                    {/* Only show call buttons for DM conversations */}
                    {selectedDirectMessageFriend && (
                      <>
                        <button
                          className={styles.chatIconBtn}
                          title="Voice Call"
                          onClick={() => handleStartCall(false)}
                          disabled={isInCall}
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
                          className={styles.chatIconBtn}
                          title="Video Call"
                          onClick={() => handleStartCall(true)}
                          disabled={isInCall}
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
                    <button className={styles.chatIconBtn} title="Tùy chọn khác">
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <circle cx="12" cy="5" r="2"></circle>
                        <circle cx="12" cy="12" r="2"></circle>
                        <circle cx="12" cy="19" r="2"></circle>
                      </svg>
                    </button>
                  </div>
                </div>
                {/* Sticky reaction bar (DM): hiện reaction của tin nhắn khi kéo lên gần header */}
                {/* Messages Container */}
                <div
                  ref={messagesContainerRef}
                  className={styles.messagesContainer}
                  onScroll={(e) => {
                    const container = e.currentTarget;
                    const isNearBottom =
                      container.scrollHeight -
                        container.scrollTop -
                        container.clientHeight <
                      100;
                    shouldAutoScrollRef.current = isNearBottom;
                  }}
                >
                  {selectedDirectMessageFriend ? (
                    loadingDirectMessages ? (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          height: "100%",
                          color: "var(--color-text-muted)",
                        }}
                      >
                        <p>Đang tải tin nhắn...</p>
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
                        <p>Chưa có tin nhắn. Hãy bắt đầu trò chuyện!</p>
                      </div>
                    ) : (
                      (
                        conversations.get(selectedDirectMessageFriend._id) || []
                      ).map((message) => (
                        <div
                          key={message.id}
                          data-message-id={message.id}
                          data-has-reactions={message.reactions?.length ? "true" : undefined}
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
                            onDelete={(msgId) => setShowDeleteDialog(msgId)}
                            scrollContainerRef={messagesContainerRef}
                            dmPartnerDisplayName={selectedDirectMessageFriend.displayName || selectedDirectMessageFriend.username}
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
                      <p>Đang tải tin nhắn...</p>
                    </div>
                  ) : messages.length === 0 ? (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        height: "100%",
                        color: "var(--color-text-muted)",
                      }}
                    >
                      <p>Chưa có tin nhắn. Hãy bắt đầu trò chuyện!</p>
                    </div>
                  ) : (
                    messages.map((message) => (
                      <div
                        key={message.id}
                        data-message-id={message.id}
                        data-has-reactions={message.reactions?.length ? "true" : undefined}
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
                          onDelete={(msgId) => setShowDeleteDialog(msgId)}
                          scrollContainerRef={messagesContainerRef}
                        />
                      </div>
                    ))
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

                {/* Input Area */}
                <div className={styles.inputArea}>
                  {/* Plus Menu Button */}
                  <div style={{ position: "relative" }}>
                    <button
                      className={styles.plusButton}
                      title="Tùy chọn khác"
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
                          <span>Upload file</span>
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
                          <span>Tạo khảo sát</span>
                        </button>
                        <button
                          className={styles.plusMenuItem}
                          onClick={() => {
                            console.log("Use apps");
                            setShowPlusMenu(false);
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
                            <rect x="3" y="3" width="7" height="7"></rect>
                            <rect x="14" y="3" width="7" height="7"></rect>
                            <rect x="14" y="14" width="7" height="7"></rect>
                            <rect x="3" y="14" width="7" height="7"></rect>
                          </svg>
                          <span>Use apps</span>
                        </button>
                      </div>
                    )}
                  </div>

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
                      <span>Uploading...</span>
                    </div>
                  )}

                  {/* Normal Text Input */}
                  {!isRecordingVoice && !isUploadingVoice && (
                    <>
                      <div className={styles.inputWrapper}>
                        <input
                          type="text"
                          className={styles.messageInput}
                          placeholder="Nhập tin nhắn..."
                          value={messageText}
                          onChange={(e) => {
                            const newValue = e.target.value;
                            setMessageText(newValue);

                            // ✅ Optimized Typing indicator logic - only for direct messages
                            if (
                              selectedDirectMessageFriend &&
                              notifyTyping &&
                              newValue.length > 0
                            ) {
                              // Only notify once when starting to type
                              if (!isTypingRef.current) {
                                isTypingRef.current = true;
                                notifyTyping(
                                  selectedDirectMessageFriend._id,
                                  true,
                                );
                              }

                              // Clear previous timeout
                              if (typingTimeoutRef.current) {
                                clearTimeout(typingTimeoutRef.current);
                              }

                              // Set timeout to stop typing after 2 seconds of inactivity
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
                              // Stop typing immediately when input is cleared
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
                          onKeyPress={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();

                              // ✅ Stop typing when sending message
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

                              selectedDirectMessageFriend
                                ? handleSendDirectMessage()
                                : handleSendMessage();
                            }
                          }}
                        />
                      </div>

                      {/* Media Buttons */}
                      <div className={styles.mediaButtons}>
                        {/* Voice Recording Button */}
                        <button
                          className={styles.mediaButton}
                          title="Gửi tin nhắn thoại"
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
                          className={styles.mediaButton}
                          title="Send GIF"
                          onClick={() => {
                            setGiphyPickerMode("gif");
                            setShowGiphyPicker(true);
                            setShowEmojiPicker(false);
                          }}
                        >
                          <span
                            style={{ fontSize: "14px", fontWeight: "bold" }}
                          >
                            GIF
                          </span>
                        </button>

                        {/* Sticker Button */}
                        <button
                          className={styles.mediaButton}
                          title="Gửi nhãn dán"
                          onClick={() => {
                            setGiphyPickerMode("sticker");
                            setShowGiphyPicker(true);
                            setShowEmojiPicker(false);
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
                        <div style={{ position: "relative" }}>
                          <button
                            className={styles.mediaButton}
                            title="Gửi biểu tượng cảm xúc"
                            onClick={() => {
                              setShowEmojiPicker(!showEmojiPicker);
                              setShowGifPicker(false);
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

                          {showEmojiPicker && (
                            <div className={styles.emojiPickerWrapper}>
                              <div className={styles.emojiPickerContent}>
                                {/* Simple emoji grid - will be replaced with emoji-picker-react once installed */}
                                <div className={styles.emojiGrid}>
                                  {[
                                    "😀",
                                    "😃",
                                    "😄",
                                    "😁",
                                    "😆",
                                    "😅",
                                    "🤣",
                                    "😂",
                                    "🙂",
                                    "🙃",
                                    "😉",
                                    "😊",
                                    "😇",
                                    "🥰",
                                    "😍",
                                    "🤩",
                                    "😘",
                                    "😗",
                                    "😚",
                                    "😙",
                                    "🥲",
                                    "😋",
                                    "😛",
                                    "😜",
                                    "🤪",
                                    "😝",
                                    "🤑",
                                    "🤗",
                                    "🤭",
                                    "🤫",
                                    "🤔",
                                    "🤐",
                                    "🤨",
                                    "😐",
                                    "😑",
                                    "😶",
                                    "😏",
                                    "😒",
                                    "🙄",
                                    "😬",
                                    "🤥",
                                    "😌",
                                    "😔",
                                    "😪",
                                    "🤤",
                                    "😴",
                                    "😷",
                                    "🤒",
                                    "🤕",
                                    "🤢",
                                    "🤮",
                                    "🤧",
                                    "🥵",
                                    "🥶",
                                    "🥴",
                                    "😵",
                                    "🤯",
                                    "🤠",
                                    "🥳",
                                    "🥸",
                                    "😎",
                                    "🤓",
                                    "🧐",
                                    "😕",
                                    "😟",
                                    "🙁",
                                    "☹️",
                                    "😮",
                                    "😯",
                                    "😲",
                                    "😳",
                                    "🥺",
                                    "😦",
                                    "😧",
                                    "😨",
                                    "😰",
                                    "😥",
                                    "😢",
                                    "😭",
                                    "😱",
                                    "😖",
                                    "😣",
                                    "😞",
                                    "😓",
                                    "😩",
                                    "😫",
                                    "🥱",
                                    "😤",
                                    "😡",
                                    "😠",
                                    "🤬",
                                    "👍",
                                    "👎",
                                    "👏",
                                    "🙏",
                                    "❤️",
                                    "💔",
                                    "💕",
                                    "💖",
                                    "💗",
                                    "💓",
                                    "💞",
                                    "💘",
                                    "💝",
                                    "🔥",
                                    "✨",
                                    "🎉",
                                    "🎊",
                                    "🎈",
                                  ].map((emoji) => (
                                    <button
                                      key={emoji}
                                      className={styles.emojiButton}
                                      onClick={() => {
                                        setMessageText((prev) => prev + emoji);
                                        setShowEmojiPicker(false);
                                      }}
                                    >
                                      {emoji}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      <button
                        className={styles.sendButton}
                        onClick={
                          selectedDirectMessageFriend
                            ? handleSendDirectMessage
                            : handleSendMessage
                        }
                        disabled={!messageText.trim()}
                        title="Gửi tin nhắn"
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
              </>
              )
            ) : (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>💬</div>
                <p className={styles.emptyText}>
                  {loading
                    ? "Đang tải..."
                    : "Chọn máy chủ và kênh để bắt đầu nhắn tin"}
                </p>
              </div>
            )}
          </div>

          {/* Profile sidebar - only when chatting in DM; user can close/reopen */}
          {selectedDirectMessageFriend && (
            dmProfileSidebarOpen ? (
              <div className={styles.activeNowSidebar}>
                <div className={styles.activeNowHeader}>
                  <h3 className={styles.activeNowTitle}>Hồ sơ</h3>
                  <button
                    type="button"
                    className={styles.activeNowCloseBtn}
                    onClick={() => setDmProfileSidebarOpen(false)}
                    title="Đóng"
                    aria-label="Đóng"
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
                          selectedDirectMessageFriend.avatarUrl,
                        )
                          ? `url(${selectedDirectMessageFriend.avatarUrl})`
                          : undefined,
                        backgroundColor: !isValidAvatarUrl(selectedDirectMessageFriend.avatarUrl)
                          ? "var(--color-primary)" : undefined,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                      }}
                    >
                      {!isValidAvatarUrl(selectedDirectMessageFriend.avatarUrl) && (
                        <span>
                          {(
                            selectedDirectMessageFriend.displayName ||
                            selectedDirectMessageFriend.username
                          )
                            ?.charAt(0)
                            ?.toUpperCase()}
                        </span>
                      )}
                    </div>

                    <p className={styles.dmProfileDisplayName}>
                      {selectedDirectMessageFriend.displayName ||
                        selectedDirectMessageFriend.username}
                    </p>
                    <p className={styles.dmProfileUsername}>
                      {selectedDirectMessageFriend.username}
                    </p>
                    {selectedDirectMessageFriend.email && (
                      <p className={styles.dmProfileEmail}>
                        {selectedDirectMessageFriend.email}
                      </p>
                    )}

                    {selectedDirectMessageFriend.bio && (
                      <div className={styles.dmProfileBio}>
                        {selectedDirectMessageFriend.bio}
                      </div>
                    )}

                    <Link
                      href={`/profile/${selectedDirectMessageFriend._id}`}
                      className={styles.dmProfileViewFull}
                    >
                      Xem hồ sơ đầy đủ
                    </Link>
                  </div>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className={styles.dmProfileSidebarToggle}
                onClick={() => setDmProfileSidebarOpen(true)}
                title="Mở hồ sơ"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                <span>Hồ sơ</span>
              </button>
            )
          )}
        </div>
      </div>

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
            setSelectedChannel(channelId);
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
          }}
        />
      )}

      <CreateChannelModal
        isOpen={showCreateChannelModal}
        onClose={() => setShowCreateChannelModal(false)}
        defaultType={createChannelDefaultType}
        sectionLabel={createChannelSectionLabel}
        onCreateChannel={handleCreateChannel}
      />

      <EventsPopup
        isOpen={showEventsPopup}
        onClose={() => setShowEventsPopup(false)}
        serverId={selectedServer}
        onOpenCreateWizard={openCreateEventWizard}
      />

      {inviteToVoiceTarget && (
        <InviteToVoiceChannelPopup
          isOpen
          onClose={() => setInviteToVoiceTarget(null)}
          serverId={inviteToVoiceTarget.serverId}
          serverName={inviteToVoiceTarget.serverName}
          channelId={inviteToVoiceTarget.channelId}
          channelName={inviteToVoiceTarget.channelName}
          friends={friends}
        />
      )}

      {inviteToServerTarget && (
        <InviteToServerPopup
          isOpen
          onClose={() => setInviteToServerTarget(null)}
          serverId={inviteToServerTarget.serverId}
          serverName={inviteToServerTarget.serverName}
          friends={inviteToServerCandidates}
        />
      )}

      {serverContextMenu && (
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
            canKick: false,
            canBan: false,
            canTimeout: false,
            canManageServer: currentUserId !== "" &&
              String((serverContextMenu.server as any).ownerId?._id ?? (serverContextMenu.server as any).ownerId) === currentUserId,
            canManageChannels: currentUserId !== "" &&
              String((serverContextMenu.server as any).ownerId?._id ?? (serverContextMenu.server as any).ownerId) === currentUserId,
            canManageEvents: currentUserId !== "" &&
              String((serverContextMenu.server as any).ownerId?._id ?? (serverContextMenu.server as any).ownerId) === currentUserId,
            canCreateInvite: true,
          }}
          onClose={() => setServerContextMenu(null)}
          onMarkAsRead={() => setServerContextMenu(null)}
          onInviteToServer={() => {
            setInviteToServerTarget({
              serverId: serverContextMenu.server._id,
              serverName: serverContextMenu.server.name || "Máy chủ",
            });
            setServerContextMenu(null);
          }}
          onMuteServer={() => setServerContextMenu(null)}
          onNotificationSettings={() => setServerContextMenu(null)}
          hideMutedChannels={hideMutedChannels}
          onToggleHideMutedChannels={() => {
            setHideMutedChannels((v) => !v);
          }}
          showAllChannels={showAllChannels}
          onToggleShowAllChannels={() => setShowAllChannels((v) => !v)}
          onServerSettings={() => {
            setServerSettingsTarget({
              serverId: serverContextMenu.server._id,
              serverName: serverContextMenu.server.name || "Máy chủ",
            });
            setShowServerSettingsPanel(true);
            setServerContextMenu(null);
          }}
          onSecuritySettings={() => setServerContextMenu(null)}
          onEditServerProfile={() => setServerContextMenu(null)}
          onCreateChannel={() => {
            setSelectedServer(serverContextMenu.server._id);
            setCreateChannelDefaultType("text");
            setCreateChannelSectionLabel("Kênh Chat");
            setShowCreateChannelModal(true);
            setServerContextMenu(null);
          }}
          onCreateCategory={() => setServerContextMenu(null)}
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
              alert((err as Error)?.message ?? "Không thể rời máy chủ");
            }
          }}
          notificationLevel={serverNotificationLevel}
        />
      )}

      <ServerSettingsPanel
        isOpen={showServerSettingsPanel}
        onClose={() => {
          setShowServerSettingsPanel(false);
          setServerSettingsTarget(null);
        }}
        serverName={serverSettingsTarget?.serverName ?? ""}
        serverId={serverSettingsTarget?.serverId ?? ""}
        isOwner={
          !!(
            serverSettingsTarget?.serverId &&
            currentUserId &&
            servers.find((s) => s._id === serverSettingsTarget.serverId)?.ownerId === currentUserId
          )
        }
        onDeleteServer={async (serverIdToDelete) => {
          await serversApi.deleteServer(serverIdToDelete);
          setShowServerSettingsPanel(false);
          setServerSettingsTarget(null);
          setSelectedServer(null);
          await loadServers();
        }}
        renderSection={(section) => {
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
                  !!(
                    currentUserId &&
                    servers.find((s) => s._id === serverSettingsTarget?.serverId)?.ownerId === currentUserId
                  )
                }
              />
            );
          }
          return undefined;
        }}
      />

      {selectedServer && (
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
                aria-label="Đóng"
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
                    Đang Diễn Ra – Kết thúc {endTimeStr}
                  </span>
                </div>
              )}
              <h3 className={styles.eventDetailTitle}>{selectedEventDetail.topic}</h3>
              <div className={styles.eventDetailRow}>
                <span className={styles.eventDetailIcon}>📍</span>
                <span>
                  Máy chủ của {currentServer?.name}
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
                  Sao Chép Link
                </button>
                <button
                  type="button"
                  className={`${styles.eventDetailJoinBtn} ${eventDetailInterested ? styles.eventDetailInterestedActive : ""}`}
                  onClick={() => setEventDetailInterested((v) => !v)}
                >
                  Quan tâm
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
                    Bắt đầu
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
                    Kết Thúc Sự Kiện
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
              <h2>Tạo khảo sát</h2>
              <button className={styles.closeButton} onClick={handleCancelPoll}>
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
                <label className={styles.pollLabel}>Câu hỏi</label>
                <div className={styles.pollInputWrapper}>
                  <input
                    type="text"
                    className={styles.pollInput}
                    placeholder="Bạn muốn hỏi gì?"
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
                <label className={styles.pollLabel}>Các phương án trả lời</label>
                {pollOptions.map((option, index) => (
                  <div key={index} className={styles.pollOptionRow}>
                    <button className={styles.emojiButton}>
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
                      placeholder="Nhập câu trả lời"
                      value={option}
                      onChange={(e) =>
                        handlePollOptionChange(index, e.target.value)
                      }
                    />
                    {pollOptions.length > 2 && (
                      <button
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
                  className={styles.addOptionButton}
                  onClick={handleAddPollOption}
                >
                  + Thêm phương án
                </button>
              </div>

              {/* Duration */}
              <div className={styles.pollField}>
                <label className={styles.pollLabel}>Thời gian</label>
                <select
                  className={styles.pollSelect}
                  value={pollDuration}
                  onChange={(e) => setPollDuration(Number(e.target.value))}
                >
                  <option value={1}>1 giờ</option>
                  <option value={4}>4 giờ</option>
                  <option value={8}>8 giờ</option>
                  <option value={24}>24 giờ</option>
                  <option value={72}>3 ngày</option>
                  <option value={168}>7 ngày</option>
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
                <label htmlFor="allowMultiple">Cho phép chọn nhiều phương án</label>
              </div>
            </div>

            <div className={styles.pollModalFooter}>
              <button
                className={styles.cancelButton}
                onClick={handleCancelPoll}
              >
                Hủy
              </button>
              <button
                className={styles.submitButton}
                onClick={handleSubmitPoll}
              >
                Đăng
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
            background: "#ff6b6b",
            color: "white",
            padding: "12px 16px",
            borderRadius: "4px",
            zIndex: 1001,
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

      {/* Outgoing Call Popup */}
      {outgoingCall && (
        <OutgoingCallPopup
          receiverName={
            outgoingCall.toUser.displayName || outgoingCall.toUser.username
          }
          receiverAvatar={
            isValidAvatarUrl(outgoingCall.toUser.avatarUrl)
              ? outgoingCall.toUser.avatarUrl
              : undefined
          }
          callType={outgoingCall.type}
          onCancel={handleCancelCall}
          status={outgoingCall.status}
        />
      )}

      {/* Giphy Picker Modal */}
      {showGiphyPicker && (
        <GiphyPicker
          onSelect={handleSendGiphy}
          onClose={() => setShowGiphyPicker(false)}
          initialTab={giphyPickerMode}
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

      {/* Delete Message Dialog */}
      {showDeleteDialog && (
        <DeleteMessageDialog
          onConfirm={(deleteType) =>
            handleDeleteMessage(showDeleteDialog, deleteType)
          }
          onClose={() => setShowDeleteDialog(null)}
        />
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div
          style={{
            position: "fixed",
            bottom: "24px",
            left: "50%",
            transform: "translateX(-50%)",
            background: "#2b2d31",
            color: "#dbdee1",
            padding: "12px 24px",
            borderRadius: "8px",
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
            zIndex: 3000,
            animation: "slideUpFade 0.3s ease",
            fontSize: "14px",
            fontWeight: 500,
          }}
        >
          {toastMessage}
        </div>
      )}
    </div>
  );
}