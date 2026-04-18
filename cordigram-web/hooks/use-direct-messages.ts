import { useEffect, useRef, useCallback, useState } from "react";
import io, { Socket } from "socket.io-client";

interface UseDirectMessagesOptions {
  userId: string;
  token: string;
}

export interface DirectMessage {
  _id: string;
  senderId: {
    _id: string;
    email: string;
    username: string;
    avatar?: string;
  };
  receiverId: {
    _id: string;
    email: string;
    username: string;
    avatar?: string;
  };
  content: string;
  type?: "text" | "gif" | "sticker" | "voice";
  giphyId?: string | null;
  voiceUrl?: string | null;
  voiceDuration?: number | null;
  attachments: string[];
  reactions: Array<{
    userId: string;
    emoji: string;
  }>;
  isEdited: boolean;
  isRead: boolean;
  createdAt: string;
}

export interface DirectMessageEvent {
  message: DirectMessage;
  fromUser?: {
    userId: string;
    username: string;
  };
}

/** Normalized socket discrimination so ICE / reject don’t share the same shape. */
export type CallEventSignal =
  | "incoming"
  | "answer"
  | "rejected"
  | "ice";

export interface CallEvent {
  from: string;
  callSignal?: CallEventSignal;
  type?: "audio" | "video";
  sdpOffer?: any;
  candidate?: any;
  callerInfo?: {
    userId: string;
    username: string;
    displayName: string;
    avatar?: string;
  };
}

export interface UserProfileStyleUpdatedEvent {
  userId: string;
  avatarUrl?: string | null;
  coverUrl?: string | null;
  displayNameFontId?: string;
  displayNameEffectId?: string;
  displayNamePrimaryHex?: string;
  displayNameAccentHex?: string;
  updatedAt?: string;
}

export interface BoostEntitlementUpdatedEvent {
  userId: string;
  tier?: "basic" | "boost" | null;
  active?: boolean;
  expiresAt?: string | null;
  limits?: any;
}

export type PresenceStatus = "online" | "idle" | "offline";

export const useDirectMessages = ({
  userId,
  token,
}: UseDirectMessagesOptions) => {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [newMessage, setNewMessage] = useState<DirectMessageEvent | null>(null);
  const [messageSent, setMessageSent] = useState<DirectMessage | false>(false);
  const [userTyping, setUserTyping] = useState<{
    fromUserId: string;
    username: string;
    isTyping: boolean;
  } | null>(null);
  const [messagesRead, setMessagesRead] = useState<{
    byUserId: string;
    messageIds: string[];
  } | null>(null);
  const [reactionUpdate, setReactionUpdate] = useState<{
    messageId: string;
    reactions: any[];
  } | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [presenceByUserId, setPresenceByUserId] = useState<Record<string, PresenceStatus>>({});
  const [callEvent, setCallEvent] = useState<CallEvent | null>(null);
  const [callEnded, setCallEnded] = useState<{ from: string } | null>(null);
  const [messageDeleted, setMessageDeleted] = useState<{ messageId: string } | null>(null);
  const [userProfileStyleUpdated, setUserProfileStyleUpdated] =
    useState<UserProfileStyleUpdatedEvent | null>(null);
  const [boostEntitlementUpdated, setBoostEntitlementUpdated] =
    useState<BoostEntitlementUpdatedEvent | null>(null);

  useEffect(() => {
    if (!userId || !token) return;

    const socket = io(
      `${process.env.NEXT_PUBLIC_API_BASE || "http://localhost:9999"}/direct-messages`,
      {
        auth: {
          token,
        },
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 5,
      },
    );

    socket.on("connect", () => {
      setIsConnected(true);
    });

    socket.on("disconnect", () => {
      setIsConnected(false);
    });

    socket.on(
      "new-message",
      (data: {
        message: DirectMessage;
        fromUser?: { userId: string; username: string };
      }) => {
        setNewMessage(data);
      },
    );

    socket.on("message-sent", (data: { message: DirectMessage }) => {
      setMessageSent(data.message);
      setTimeout(() => setMessageSent(false), 1000);
    });

    socket.on(
      "user-typing",
      (data: { fromUserId: string; username: string; isTyping: boolean }) => {
        setUserTyping(data);
      },
    );

    socket.on("user-online", (data: { userId: string; status: string }) => {
      setOnlineUsers((prev) => new Set(prev).add(data.userId));
      setPresenceByUserId((prev) => ({ ...prev, [data.userId]: "online" }));
    });

    socket.on("user-offline", (data: { userId: string; status: string }) => {
      setOnlineUsers((prev) => {
        const newSet = new Set(prev);
        newSet.delete(data.userId);
        return newSet;
      });
      setPresenceByUserId((prev) => ({ ...prev, [data.userId]: "offline" }));
    });

    socket.on(
      "presence-snapshot",
      (data: { items: Array<{ userId: string; status: PresenceStatus }> }) => {
        const items = Array.isArray(data?.items) ? data.items : [];
        setPresenceByUserId((prev) => {
          const next = { ...prev };
          for (const it of items) next[it.userId] = it.status;
          return next;
        });
        setOnlineUsers((prev) => {
          const next = new Set(prev);
          for (const it of items) {
            if (it.status === "offline") next.delete(it.userId);
            else next.add(it.userId);
          }
          return next;
        });
      },
    );

    socket.on(
      "presence-updated",
      (data: { userId: string; status: PresenceStatus }) => {
        if (!data?.userId || !data?.status) return;
        setPresenceByUserId((prev) => ({ ...prev, [data.userId]: data.status }));
        setOnlineUsers((prev) => {
          const next = new Set(prev);
          if (data.status === "offline") next.delete(data.userId);
          else next.add(data.userId);
          return next;
        });
      },
    );

    socket.on(
      "messages-read",
      (data: { byUserId: string; messageIds: string[] }) => {
        // ✅ Create new object to trigger React re-render
        setMessagesRead({ ...data, timestamp: Date.now() } as any);
      },
    );

    socket.on("reaction-added", (data: any) => {
      if (data?.messageId && Array.isArray(data?.reactions)) {
        setReactionUpdate({ messageId: data.messageId, reactions: data.reactions });
        setTimeout(() => setReactionUpdate(null), 500);
      }
    });

    socket.on("reaction-updated", (data: any) => {
      if (data?.messageId && Array.isArray(data?.reactions)) {
        setReactionUpdate({ messageId: data.messageId, reactions: data.reactions });
        setTimeout(() => setReactionUpdate(null), 500);
      }
    });

    // Call-related events
    socket.on(
      "call-incoming",
      (data: {
        from: string;
        type: "audio" | "video";
        callerInfo?: {
          userId: string;
          username: string;
          displayName: string;
          avatar?: string;
        };
      }) => {
        if (data.callerInfo) {
        } else {
          console.error("❌ [SOCKET] callerInfo is UNDEFINED or NULL!");
        }
        console.log("📞 [SOCKET] ========================================");
        setCallEvent({ ...data, callSignal: "incoming" });
      },
    );

    socket.on("call-answer", (data: { from: string; sdpOffer: any }) => {
      console.log("📞 [SOCKET] Call answered event received:", data);
      setCallEvent({ ...data, callSignal: "answer" });
    });

    socket.on("call-rejected", (data: { from: string }) => {
      console.log("📞 [SOCKET] Call rejected event received:", data);
      setCallEvent({ from: data.from, callSignal: "rejected" });
    });

    socket.on("ice-candidate", (data: { from: string; candidate: any }) => {
      console.log("ICE candidate:", data);
      setCallEvent({
        from: data.from,
        candidate: data.candidate,
        callSignal: "ice",
      });
    });

    socket.on("call-ended", (data: { from: string }) => {
      setCallEnded(data);
      setTimeout(() => setCallEnded(null), 1000);
    });

    socket.on("message-deleted", (data: { messageId: string }) => {
      setMessageDeleted(data);
      setTimeout(() => setMessageDeleted(null), 1000);
    });

    socket.on("user-profile-style-updated", (data: UserProfileStyleUpdatedEvent) => {
      if (!data?.userId) return;
      setUserProfileStyleUpdated(data);
      try {
        window.dispatchEvent(
          new CustomEvent("cordigram-user-profile-style-updated", { detail: data }),
        );
      } catch {
        // ignore
      }
      setTimeout(() => setUserProfileStyleUpdated(null), 500);
    });

    socket.on("boost-entitlement-updated", (data: BoostEntitlementUpdatedEvent) => {
      if (!data?.userId) return;
      setBoostEntitlementUpdated(data);
      try {
        window.dispatchEvent(
          new CustomEvent("cordigram-boost-entitlement-updated", { detail: data }),
        );
      } catch {
        // ignore
      }
      setTimeout(() => setBoostEntitlementUpdated(null), 500);
    });

    socket.on("error", (error: { message: string }) => {
      console.error("Socket error:", error);
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
    };
  }, [userId, token]);

  // Presence: activity + ping (helps idle/online accuracy)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isConnected || !socketRef.current) return;
    const socket = socketRef.current;
    const ping = () => socket.emit("presence-ping");
    const activity = () => socket.emit("presence-activity");
    ping();
    activity();
    const id = window.setInterval(ping, 25_000);
    window.addEventListener("focus", activity);
    window.addEventListener("mousemove", activity, { passive: true });
    window.addEventListener("keydown", activity);
    window.addEventListener("click", activity);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", activity);
      window.removeEventListener("mousemove", activity as any);
      window.removeEventListener("keydown", activity);
      window.removeEventListener("click", activity);
    };
  }, [isConnected]);

  const subscribePresence = useCallback((ids: string[]) => {
    const socket = socketRef.current;
    if (!socket || !socket.connected) return;
    const userIds = Array.isArray(ids) ? ids.map(String).filter(Boolean) : [];
    if (userIds.length === 0) return;
    socket.emit("presence-subscribe", { userIds });
  }, []);

  const sendMessage = useCallback(
    (receiverId: string, content: string, attachments?: string[]) => {
      if (socketRef.current && socketRef.current.connected) {
        socketRef.current.emit("send-message", {
          receiverId,
          content,
          attachments,
        });
      } else {
        console.warn("Socket not connected, cannot send message");
      }
    },
    [],
  );

  const notifyTyping = useCallback((receiverId: string, isTyping: boolean) => {
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit("typing", {
        receiverId,
        isTyping,
      });
    }
  }, []);

  const markAsRead = useCallback((messageIds: string[], senderId: string) => {
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit("mark-as-read", {
        messageIds,
        senderId,
      });
    }
  }, []);

  const markAllAsRead = useCallback((senderId: string) => {
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit("mark-all-as-read", {
        senderId,
      });
    }
  }, []);

  const initiateCall = useCallback(
    (receiverId: string, type: "audio" | "video") => {
      if (socketRef.current && socketRef.current.connected) {
        socketRef.current.emit("call-initiate", {
          receiverId,
          type,
        });
      }
    },
    [],
  );

  const answerCall = useCallback((callerId: string, sdpOffer: any) => {
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit("call-answer", {
        callerId,
        sdpOffer,
      });
    }
  }, []);

  const rejectCall = useCallback((callerId: string) => {
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit("call-reject", {
        callerId,
      });
    }
  }, []);

  const sendIceCandidate = useCallback((peerId: string, candidate: any) => {
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit("ice-candidate", {
        peerId,
        candidate,
      });
    }
  }, []);

  const endCall = useCallback((peerId: string) => {
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit("call-end", {
        peerId,
      });
    }
  }, []);

  const emitDeleteMessage = useCallback(
    (messageId: string, deleteType?: string, receiverId?: string) => {
      if (socketRef.current && socketRef.current.connected) {
        socketRef.current.emit("delete-message", { messageId, deleteType, receiverId });
      }
    },
    [],
  );

  return {
    isConnected,
    newMessage,
    messageSent,
    userTyping,
    messagesRead,
    reactionUpdate,
    onlineUsers,
    presenceByUserId,
    subscribePresence,
    callEvent,
    callEnded,
    messageDeleted,
    userProfileStyleUpdated,
    boostEntitlementUpdated,
    sendMessage,
    notifyTyping,
    markAsRead,
    markAllAsRead,
    initiateCall,
    answerCall,
    rejectCall,
    sendIceCandidate,
    endCall,
    emitDeleteMessage,
  };
};
