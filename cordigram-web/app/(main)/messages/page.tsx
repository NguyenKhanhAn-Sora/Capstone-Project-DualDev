"use client";

import React, { useState, useEffect, useRef, memo, useCallback } from "react";
import dynamic from "next/dynamic";
import styles from "./messages.module.css";
import { useRequireAuth } from "@/hooks/use-require-auth";
import {
  useDirectMessages,
  type DirectMessage,
} from "@/hooks/use-direct-messages";
import * as serversApi from "@/lib/servers-api";
import {
  sendDirectMessage,
  getDirectMessages,
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
} from "@/lib/api";
import { getLiveKitToken, getDMRoomName } from "@/lib/livekit-api";
import IncomingCallPopup from "@/components/IncomingCallPopup";
import OutgoingCallPopup from "@/components/OutgoingCallPopup";
import GiphyPicker from "@/components/GiphyPicker";
import VoiceRecorder from "@/components/VoiceRecorder";
import VoiceMessage from "@/components/VoiceMessage";
import { getGifById, type GiphyGif } from "@/lib/giphy-api";

// Dynamic import CallRoom to avoid SSR issues with LiveKit
const CallRoom = dynamic(() => import("@/components/CallRoom"), { ssr: false });

interface BackendServer extends serversApi.Server {
  textChannels?: serversApi.Channel[];
  voiceChannels?: serversApi.Channel[];
}

interface UIMessage {
  id: string;
  text: string;
  senderId: string;
  senderEmail: string;
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
          Không thể tải {messageType}
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
        onError(error?.message || "Failed to vote");
      }
    }, [pollData, selectedOptions, token, pollId, loadPoll, onError]);

    if (!pollData) {
      return <div className={styles.pollMessage}>Loading poll...</div>;
    }

    return (
      <div className={styles.pollMessage}>
        <div className={styles.pollQuestion}>{pollData.question}</div>
        <div className={styles.pollSubtitle}>
          {pollData.allowMultipleAnswers
            ? "Chọn một hoặc nhiều câu trả lời"
            : "Chọn một câu trả lời"}
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
            {pollData.uniqueVoters} phiếu • {pollData.hoursLeft}giờ còn lại
          </span>
          <div className={styles.pollActions}>
            {!showResults && (
              <button
                className={styles.pollActionButton}
                onClick={() => setShowResults(true)}
              >
                Hiện kết quả
              </button>
            )}
            {!hasVoted && !showResults && (
              <button
                className={`${styles.pollActionButton} ${styles.pollVoteButton}`}
                onClick={handleVote}
                disabled={selectedOptions.length === 0}
              >
                Bỏ phiếu
              </button>
            )}
            {hasVoted && (
              <span className={styles.pollVoted}>✓ Đã bỏ phiếu</span>
            )}
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

  // Don't re-render if only timestamp changed
  return true;
}

// ✅ Memoized MessageItem component with Intersection Observer for read receipts
const MessageItem = memo(
  ({
    message,
    renderMessageContent,
    onVisible,
  }: {
    message: UIMessage;
    renderMessageContent: (message: UIMessage) => React.ReactNode;
    onVisible?: (messageId: string, isVisible: boolean) => void;
  }) => {
    const messageRef = useRef<HTMLDivElement>(null);

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
      >
        {/* Avatar */}
        <div className={styles.messageAvatar}>
          {isValidAvatarUrl(message.senderAvatar) ? (
            <img
              src={message.senderAvatar}
              alt={message.senderName || "User"}
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
              {message.senderName || message.senderEmail || "Unknown"}
            </span>
            <span className={styles.messageTime}>
              {formatMessageTime(message.timestamp)}
            </span>
          </div>

          {/* Message bubble */}
          <div
            className={`${styles.messageBubble} ${
              message.isFromCurrentUser ? styles.sent : styles.received
            }`}
          >
            {renderMessageContent(message)}
          </div>

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
                  <span className={styles.readText}>Đã xem</span>
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
                  <span className={styles.unreadText}>Đã gửi</span>
                </div>
              )}
            </div>
          )}
        </div>
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

export default function MessagesPage() {
  const canRender = useRequireAuth();
  const [servers, setServers] = useState<BackendServer[]>([]);
  const [selectedServer, setSelectedServer] = useState<string | null>(null);
  const [textChannels, setTextChannels] = useState<serversApi.Channel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [messageText, setMessageText] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateServerModal, setShowCreateServerModal] = useState(false);
  const [serverName, setServerName] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [friends, setFriends] = useState<serversApi.Friend[]>([]);
  const [selectedDirectMessageFriend, setSelectedDirectMessageFriend] =
    useState<serversApi.Friend | null>(null);
  const [conversations, setConversations] = useState<Map<string, UIMessage[]>>(
    new Map(),
  );
  const [loadingDirectMessages, setLoadingDirectMessages] = useState(false);
  const [token, setToken] = useState<string>("");
  const [currentUserProfile, setCurrentUserProfile] = useState<any>(null);

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

  // Poll states
  const [showCreatePollModal, setShowCreatePollModal] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [pollDuration, setPollDuration] = useState(24);
  const [pollAllowMultiple, setPollAllowMultiple] = useState(false);

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
    markAsRead,
    callEvent,
    callEnded, // ✅ Added to handle when caller cancels
    initiateCall,
    answerCall,
    rejectCall,
    endCall,
  } = useDirectMessages({
    userId: currentUserId,
    token,
  });

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
        setError("Failed to start call");
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

      // Get room name
      const { roomName } = await getDMRoomName(incomingCall.from, token);
      console.log("📞 [ACCEPT] Room name:", roomName);

      // Notify caller that call was answered (this will open tab on caller's side)
      answerCall(incomingCall.from, { roomName });
      console.log("✅ [ACCEPT] Call answer notification sent to caller");

      // Open call in new tab for receiver (this user)
      const participantName =
        currentUserProfile.username || currentUserProfile.displayName || "User";
      const isAudioOnly = incomingCall.type === "audio";
      const callUrl = `/call?roomName=${encodeURIComponent(roomName)}&participantName=${encodeURIComponent(participantName)}&audioOnly=${isAudioOnly}`;

      window.open(callUrl, "_blank", "noopener,noreferrer");
      console.log("✅ [ACCEPT] Call window opened for receiver (not host)");

      // Close popup
      setIncomingCall(null);
    } catch (error) {
      console.error("❌ [ACCEPT] Failed to accept call:", error);
      setError("Failed to accept call");
    }
  }, [incomingCall, token, currentUserProfile, answerCall]);

  // ✅ Reject incoming call
  const handleRejectCall = useCallback(() => {
    if (!incomingCall) return;

    console.log(
      "📞 [REJECT] Rejecting call from:",
      incomingCall.callerInfo.displayName,
    );
    rejectCall(incomingCall.from);
    setIncomingCall(null);
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
        currentUserProfile.username || currentUserProfile.displayName || "User";
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
  }, [callEvent, outgoingCall, openCallTab]);

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
        setError("Invalid token");
      }
    } else {
      setError("Please login first");
      setLoading(false);
    }
  }, []);

  const loadCurrentUserProfile = async (token: string) => {
    try {
      const profile = await fetchCurrentProfile({ token });
      console.log("✅ Loaded current user profile:", profile);
      setCurrentUserProfile(profile);
    } catch (err) {
      console.error("❌ Failed to load current user profile", err);
    }
  };

  // Debug: Log current user profile when it changes
  useEffect(() => {
    if (currentUserProfile) {
      console.log("🔄 Current User Profile Updated:", currentUserProfile);
    }
  }, [currentUserProfile]);

  // Load channels when server changes
  useEffect(() => {
    if (selectedServer) {
      loadChannels(selectedServer);
      setSelectedDirectMessageFriend(null); // Clear selected DM friend when selecting server
    }
  }, [selectedServer]);

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
        senderName: msg.senderId.username || msg.senderId.email,
        senderAvatar: msg.senderId.avatar,
        timestamp: new Date(msg.createdAt),
        isFromCurrentUser: true, // Always true for sent messages
        type: "direct",
        isRead: msg.isRead || false,
        messageType: msg.type || "text",
        giphyId: msg.giphyId || undefined,
        voiceUrl: msg.voiceUrl || undefined,
        voiceDuration: msg.voiceDuration || undefined,
      };

      // ✅ Replace optimistic message with real message from server
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
        senderName: msg.senderId.username || msg.senderId.email,
        senderAvatar: msg.senderId.avatar,
        timestamp: new Date(msg.createdAt),
        isFromCurrentUser: false, // Always false for incoming messages
        type: "direct",
        isRead: msg.isRead || false,
        messageType: msg.type || "text",
        giphyId: msg.giphyId || undefined,
        voiceUrl: msg.voiceUrl || undefined,
        voiceDuration: msg.voiceDuration || undefined,
      };

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
  }, [newMessage, selectedDirectMessageFriend, currentUserId]);

  // Load messages when channel changes
  useEffect(() => {
    if (selectedChannel) {
      loadMessages(selectedChannel);
    }
  }, [selectedChannel]);

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
      setError("Failed to load servers");
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

  const loadFollowing = async () => {
    try {
      const followingList = await serversApi.getFollowing();
      setFriends(followingList);
    } catch (err) {
      console.error("Failed to load following", err);
      setFriends([]);
    }
  };

  const loadAvailableUsers = async () => {
    try {
      const usersList = await getAvailableUsers({ token });
      setFriends(usersList);
    } catch (err) {
      console.error("Failed to load available users", err);
      // Fallback to loading following if available users endpoint is not ready
      loadFollowing();
    }
  };

  const loadChannels = async (serverId: string) => {
    try {
      const channels = await serversApi.getChannels(serverId, "text");
      setTextChannels(channels);

      // Auto-select first text channel
      if (channels.length > 0) {
        setSelectedChannel(channels[0]._id);
      }
    } catch (err) {
      console.error("Failed to load channels", err);
      setError("Failed to load channels");
    }
  };

  const loadMessages = async (channelId: string) => {
    try {
      const backendMessages = await serversApi.getMessages(channelId, 50, 0);

      const uiMessages: UIMessage[] = backendMessages.map((msg) => ({
        id: msg._id,
        text: msg.content,
        senderId:
          typeof msg.senderId === "string" ? msg.senderId : msg.senderId._id,
        senderEmail: typeof msg.senderId === "string" ? "" : msg.senderId.email,
        senderName:
          typeof msg.senderId === "string"
            ? ""
            : (msg.senderId as any).username || msg.senderId.email,
        senderAvatar:
          typeof msg.senderId === "string"
            ? undefined
            : (msg.senderId as any).avatar,
        timestamp: new Date(msg.createdAt),
        isFromCurrentUser:
          (typeof msg.senderId === "string"
            ? msg.senderId
            : msg.senderId._id) === currentUserId,
        type: "server", // Phân biệt là message từ server/channel
      }));

      setMessages(uiMessages);
      setError(null);
    } catch (err) {
      console.error("Failed to load messages", err);
      setError("Failed to load messages");
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
        senderName: msg.senderId.username || msg.senderId.email,
        senderAvatar: msg.senderId.avatar,
        timestamp: new Date(msg.createdAt),
        isFromCurrentUser: msg.senderId._id === currentUserId,
        type: "direct", // Phân biệt là message từ direct message
        isRead: msg.isRead || false, // Load initial read status
        messageType: msg.type || "text", // Type of message content
        giphyId: msg.giphyId || undefined, // Giphy ID if it's a GIF/sticker
        voiceUrl: msg.voiceUrl || undefined, // Voice message URL
        voiceDuration: msg.voiceDuration || undefined, // Voice message duration
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
      setError("Failed to load direct messages");
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
    shouldAutoScrollRef.current = true; // ✅ Enable auto-scroll when switching conversations

    // Pre-scroll to bottom BEFORE loading (prevents visual jump)
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = 0; // Reset first
    }

    await loadDirectMessages(friend._id);
  };

  const handleSendMessage = async () => {
    if (!messageText.trim() || !selectedChannel) return;

    // Save content before clearing input
    const content = messageText.trim();

    try {
      // Clear input immediately for better UX
      setMessageText("");

      // ✅ Enable auto-scroll for new message
      shouldAutoScrollRef.current = true;

      const newMessage = await serversApi.createMessage(
        selectedChannel,
        content,
      );

      const uiMessage: UIMessage = {
        id: newMessage._id,
        text: newMessage.content,
        senderId:
          typeof newMessage.senderId === "string"
            ? newMessage.senderId
            : newMessage.senderId._id,
        senderEmail:
          typeof newMessage.senderId === "string"
            ? ""
            : newMessage.senderId.email,
        senderName:
          typeof newMessage.senderId === "string"
            ? currentUserProfile?.username || ""
            : (newMessage.senderId as any).username ||
              newMessage.senderId.email,
        senderAvatar:
          typeof newMessage.senderId === "string"
            ? currentUserProfile?.avatar
            : (newMessage.senderId as any).avatar,
        timestamp: new Date(newMessage.createdAt),
        isFromCurrentUser: true,
        type: "server",
      };

      setMessages((prev) => [...prev, uiMessage]);
    } catch (err) {
      console.error("Failed to send message", err);
      setError("Failed to send message");
      // Restore message text on error
      setMessageText(content);
    }
  };

  const handleSendDirectMessage = async () => {
    if (!messageText.trim() || !selectedDirectMessageFriend) return;

    const messageContent = messageText.trim();
    const friendId = selectedDirectMessageFriend._id;

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
      const optimisticMessage: UIMessage = {
        id: `temp-${Date.now()}-${Math.random()}`, // Unique temporary ID
        text: messageContent,
        senderId: currentUserId,
        senderEmail: "",
        senderName: currentUserProfile?.username || "",
        senderAvatar: currentUserProfile?.avatar,
        timestamp: new Date(),
        isFromCurrentUser: true,
        type: "direct",
        isRead: false, // Not read yet
        messageType: "text",
      };

      // ✅ Enable auto-scroll for new message
      shouldAutoScrollRef.current = true;

      // ✅ OPTIMISTIC UPDATE: Only update conversations Map (single source of truth for DMs)
      // DON'T update messages array to avoid duplicate key errors
      setConversations((prev) => {
        const newMap = new Map(prev);
        const currentMessages = newMap.get(friendId) || [];
        newMap.set(friendId, [...currentMessages, optimisticMessage]);
        return newMap;
      });

      // Send via WebSocket (response will replace optimistic message)
      emitSendMessage(friendId, messageContent, []);
    } catch (err) {
      console.error("Failed to send direct message", err);
      setError("Failed to send direct message");
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
      });
    } catch (err) {
      console.error(`Failed to send ${type}:`, err);
      setError(`Failed to send ${type}`);
    }
  };

  // Handle voice recording complete
  const handleVoiceRecordComplete = async (
    audioBlob: Blob,
    duration: number,
  ) => {
    if (!selectedDirectMessageFriend) return;

    const friendId = selectedDirectMessageFriend._id;

    try {
      console.log("🎤 [VOICE-UPLOAD] Starting upload, duration:", duration);
      setIsRecordingVoice(false);
      setIsUploadingVoice(true);

      // Upload audio file to Cloudinary
      // Convert blob to File
      const audioFile = new File([audioBlob], "voice-message.webm", {
        type: "audio/webm",
      });
      console.log(
        "🎤 [VOICE-UPLOAD] Audio file created:",
        audioFile.size,
        "bytes",
      );

      const uploadResponse = await uploadMedia({ token, file: audioFile });
      console.log("🎤 [VOICE-UPLOAD] Upload response:", uploadResponse);

      if (!uploadResponse || !uploadResponse.url) {
        throw new Error("Failed to upload voice message");
      }

      console.log(
        "✅ [VOICE-UPLOAD] Upload successful, URL:",
        uploadResponse.url,
      );

      // Create optimistic message
      const optimisticMessage: UIMessage = {
        id: `temp-${Date.now()}-${Math.random()}`,
        text: "Voice message",
        senderId: currentUserId,
        senderEmail: "",
        senderName: currentUserProfile?.username || "",
        senderAvatar: currentUserProfile?.avatar,
        timestamp: new Date(),
        isFromCurrentUser: true,
        type: "direct",
        isRead: false,
        messageType: "voice",
        voiceUrl: uploadResponse.url,
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

      await sendDirectMessage(friendId, {
        token,
        content: "Voice message",
        type: "voice",
        voiceUrl: uploadResponse.url,
        voiceDuration: duration,
      });

      console.log("✅ [VOICE-SEND] Sent to backend successfully");
      setIsUploadingVoice(false);
    } catch (err) {
      console.error("Failed to send voice message:", err);
      setError("Failed to send voice message");
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
      setError("Failed to create server");
    }
  };

  // ✅ Memoized render function to prevent unnecessary re-renders
  const renderMessageContent = useCallback(
    (message: UIMessage) => {
      const { text, messageType, giphyId, voiceUrl, voiceDuration } = message;

      // Check if message is Voice Message
      if (messageType === "voice" && voiceUrl && voiceDuration) {
        console.log(" [VOICE] Rendering voice message:", {
          voiceUrl,
          voiceDuration,
          messageType,
        });
        return (
          <VoiceMessage
            voiceUrl={voiceUrl}
            duration={voiceDuration}
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
              alt="Shared image"
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
              Failed to load image
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
              Failed to load video
            </span>
          </div>
        );
      }

      if (gifMatch) {
        const gifUrl = gifMatch[1];
        return (
          <div className={styles.mediaMessage}>
            <img src={gifUrl} alt="GIF" className={styles.messageGif} />
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
              setError("Video must be 3 minutes or less");
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
            text: isImage
              ? `📤 Đang tải ảnh lên...`
              : `📤 Đang tải video lên...`,
            senderId: currentUserId,
            senderEmail: "",
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
        setError(error?.message || "Failed to upload files");
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
        reject(new Error("Failed to load video"));
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
        setError("Cần ít nhất 2 câu trả lời");
        return;
      }

      // ✅ FIX: Close modal immediately for better UX
      setShowCreatePollModal(false);

      // ✅ FIX: Show loading message
      const loadingMessage: UIMessage = {
        id: `temp-poll-${Date.now()}`,
        text: `📊 Đang tạo khảo sát...`,
        senderId: currentUserId,
        senderEmail: "",
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
      setError(error?.message || "Failed to create poll");
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
      {/* Call Room Overlay - DEPRECATED: Calls now open in new tab */}
      {/* {isInCall && callToken && callServerUrl && (
        <CallRoom
          token={callToken}
          serverUrl={callServerUrl}
          onDisconnect={handleEndCall}
          participantName={currentUserProfile?.username || currentUserProfile?.displayName || 'User'}
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
          title="Create Server"
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
          {servers.map((server) => (
            <button
              key={server._id}
              className={styles.navBtn}
              onClick={() => setSelectedServer(server._id)}
              title={server.name}
              style={{
                opacity: selectedServer === server._id ? 1 : 0.6,
                background:
                  selectedServer === server._id
                    ? "var(--color-primary)"
                    : "transparent",
              }}
            >
              {server.name.charAt(0).toUpperCase()}
            </button>
          ))}
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
          <div className={styles.conversationsContainer}>
            {!selectedServer ? (
              // Main Messages Page - No Server Selected
              <>
                {/* Search Bar */}
                <div className={styles.searchInputWrapper}>
                  <input
                    type="text"
                    className={styles.searchInput}
                    placeholder="Find or start a conversation"
                  />
                </div>

                {/* Menu Items */}
                <div className={styles.menuItems}>
                  <button className={styles.menuItem}>
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
                  <button className={styles.menuItem}>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M12 5v14M5 12h14"></path>
                    </svg>
                    <span>Add Friend</span>
                  </button>
                  <button className={styles.menuItem}>
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
                  <button className={styles.menuItem}>
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
                  <h3 className={styles.directMessagesTitle}>
                    DIRECT MESSAGES
                  </h3>

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

                {/* Voice Controls Footer */}
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
                          "User"}
                      </div>
                      <div className={styles.userUsername}>
                        {currentUserProfile?.username || ""}
                      </div>
                    </div>
                  </div>

                  {/* Voice Controls */}
                  <div className={styles.voiceButtons}>
                    <button
                      className={styles.voiceButton}
                      title="Toggle Microphone"
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
                      className={styles.voiceButton}
                      title="Toggle Speaker"
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
              // Server Selected - Show Text Channels
              <div className={styles.section}>
                <h3 className={styles.sectionTitle}>Text Channels</h3>
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
                    No text channels
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right - Chat Area & Active Now */}
        <div className={styles.rightContent}>
          {/* Chat Area */}
          <div className={styles.chatArea}>
            {(selectedChannel && currentServer) ||
            selectedDirectMessageFriend ? (
              <>
                {/* Chat Header */}
                <div className={styles.chatHeader}>
                  <div className={styles.chatHeaderLeft}>
                    <h2 className={styles.chatHeaderTitle}>
                      {selectedDirectMessageFriend
                        ? selectedDirectMessageFriend.displayName ||
                          selectedDirectMessageFriend.username
                        : "#" +
                          (textChannels.find((c) => c._id === selectedChannel)
                            ?.name || "channel")}
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
                    <button className={styles.chatIconBtn} title="More options">
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
                        <p>Loading messages...</p>
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
                        <p>No messages yet. Start the conversation!</p>
                      </div>
                    ) : (
                      (
                        conversations.get(selectedDirectMessageFriend._id) || []
                      ).map((message) => (
                        <MessageItem
                          key={message.id}
                          message={message}
                          renderMessageContent={renderMessageContent}
                          onVisible={handleMessageVisible}
                        />
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
                      <p>Loading messages...</p>
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
                      <p>No messages yet. Start the conversation!</p>
                    </div>
                  ) : (
                    messages.map((message) => (
                      <MessageItem
                        key={message.id}
                        message={message}
                        renderMessageContent={renderMessageContent}
                        onVisible={handleMessageVisible}
                      />
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
                            đang gõ...
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

                {/* Input Area */}
                <div className={styles.inputArea}>
                  {/* Plus Menu Button */}
                  <div style={{ position: "relative" }}>
                    <button
                      className={styles.plusButton}
                      title="More options"
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
                          <span>Tải Lên Tệp</span>
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
                            console.log("Dùng các Ứng dụng");
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
                          <span>Dùng các Ứng dụng</span>
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
                      <span>Đang tải lên...</span>
                    </div>
                  )}

                  {/* Normal Text Input */}
                  {!isRecordingVoice && !isUploadingVoice && (
                    <>
                      <div className={styles.inputWrapper}>
                        <input
                          type="text"
                          className={styles.messageInput}
                          placeholder="Message..."
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
                          title="Send sticker"
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
                            title="Send emoji"
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
                        title="Send message"
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
            ) : (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>💬</div>
                <p className={styles.emptyText}>
                  {loading
                    ? "Loading..."
                    : "Select a server and channel to start messaging"}
                </p>
              </div>
            )}
          </div>

          {/* Active Now Sidebar - Show profile when direct message friend selected */}
          <div className={styles.activeNowSidebar}>
            {selectedDirectMessageFriend ? (
              <>
                <div className={styles.activeNowHeader}>
                  <h3 className={styles.activeNowTitle}>Profile</h3>
                </div>
                <div className={styles.activeNowContainer}>
                  <div
                    style={{
                      padding: "16px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "12px",
                    }}
                  >
                    {/* Avatar */}
                    <div
                      style={{
                        width: "80px",
                        height: "80px",
                        borderRadius: "50%",
                        backgroundImage: isValidAvatarUrl(
                          selectedDirectMessageFriend.avatarUrl,
                        )
                          ? `url(${selectedDirectMessageFriend.avatarUrl})`
                          : `linear-gradient(135deg, #667eea 0%, #764ba2 100%)`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                        margin: "0 auto",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "white",
                        fontSize: "32px",
                        fontWeight: "600",
                      }}
                    >
                      {!isValidAvatarUrl(
                        selectedDirectMessageFriend.avatarUrl,
                      ) && (
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

                    {/* Name & Email */}
                    <div style={{ textAlign: "center" }}>
                      <p
                        style={{
                          margin: "0 0 4px 0",
                          fontWeight: "600",
                          fontSize: "16px",
                        }}
                      >
                        {selectedDirectMessageFriend.displayName ||
                          selectedDirectMessageFriend.username}
                      </p>
                      <p
                        style={{
                          margin: "0",
                          fontSize: "12px",
                          color: "var(--color-text-muted)",
                        }}
                      >
                        @{selectedDirectMessageFriend.username}
                      </p>
                      <p
                        style={{
                          margin: "4px 0 0 0",
                          fontSize: "12px",
                          color: "var(--color-text-muted)",
                        }}
                      >
                        {selectedDirectMessageFriend.email}
                      </p>
                    </div>

                    {/* Bio */}
                    {selectedDirectMessageFriend.bio && (
                      <div
                        style={{
                          padding: "8px 12px",
                          background: "var(--color-bg)",
                          borderRadius: "6px",
                          fontSize: "12px",
                          color: "var(--color-text-muted)",
                          lineHeight: "1.4",
                        }}
                      >
                        {selectedDirectMessageFriend.bio}
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className={styles.activeNowHeader}>
                  <h3 className={styles.activeNowTitle}>Active Now</h3>
                </div>
                <div className={styles.activeNowContainer}>
                  <div style={{ padding: "20px", textAlign: "center" }}>
                    <p
                      style={{
                        color: "var(--color-text-muted)",
                        margin: 0,
                        fontSize: "14px",
                      }}
                    >
                      It's quiet for now...
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Create Server Modal */}
      {showCreateServerModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "8px",
              padding: "24px",
              minWidth: "400px",
            }}
          >
            <h2 style={{ marginTop: 0 }}>Create New Server</h2>
            <input
              type="text"
              placeholder="Server name"
              value={serverName}
              onChange={(e) => setServerName(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid var(--color-border)",
                borderRadius: "4px",
                marginBottom: "16px",
                boxSizing: "border-box",
                background: "var(--color-bg)",
                color: "var(--color-text)",
              }}
              onKeyPress={(e) => {
                if (e.key === "Enter") {
                  handleCreateServer();
                }
              }}
            />
            <div
              style={{
                display: "flex",
                gap: "8px",
                justifyContent: "flex-end",
              }}
            >
              <button
                onClick={() => {
                  setShowCreateServerModal(false);
                  setServerName("");
                }}
                style={{
                  padding: "8px 16px",
                  background: "transparent",
                  border: "1px solid var(--color-border)",
                  borderRadius: "4px",
                  cursor: "pointer",
                  color: "var(--color-text)",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateServer}
                disabled={!serverName.trim()}
                style={{
                  padding: "8px 16px",
                  background: serverName.trim()
                    ? "var(--color-primary)"
                    : "var(--color-border)",
                  border: "none",
                  borderRadius: "4px",
                  cursor: serverName.trim() ? "pointer" : "not-allowed",
                  color: "white",
                }}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Poll Modal */}
      {showCreatePollModal && (
        <div className={styles.modalOverlay} onClick={handleCancelPoll}>
          <div
            className={styles.createPollModal}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.pollModalHeader}>
              <h2>Tạo một khảo sát</h2>
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
                    placeholder="Câu hỏi bạn muốn đặt ra là gì?"
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
                <label className={styles.pollLabel}>Câu trả lời</label>
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
                      placeholder="Nhập câu trả lời của bạn"
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
                  + Thêm một câu trả lời khác
                </button>
              </div>

              {/* Duration */}
              <div className={styles.pollField}>
                <label className={styles.pollLabel}>Khoảng thời gian</label>
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
                <label htmlFor="allowMultiple">
                  Cho phép nhiều câu trả lời
                </label>
              </div>
            </div>

            <div className={styles.pollModalFooter}>
              <button
                className={styles.cancelButton}
                onClick={handleCancelPoll}
              >
                Bãi đăng
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
    </div>
  );
}
