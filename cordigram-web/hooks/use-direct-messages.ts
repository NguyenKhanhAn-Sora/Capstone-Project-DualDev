import { useEffect, useRef, useCallback, useState } from "react";
import io, { Socket } from "socket.io-client";
import { apiBaseUrl } from "@/lib/api";
import {
  CallIncomingDismissEvent,
  DmCallSessionSyncItem,
  detectDmClientPlatform,
  dispatchDmCallAnswer,
  dispatchDmCallIncoming,
  registerDmSocketForHeartbeat,
} from "@/lib/dm-call-session-sync";

interface UseDirectMessagesOptions {
  userId: string;
  token: string;
  /** When false, no socket is opened (use on non-messages routes to avoid duplicate connections with /messages). */
  enabled?: boolean;
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
  type?: "text" | "gif" | "sticker" | "voice" | "call";
  callType?: "audio" | "video" | null;
  callStatus?: "missed" | "completed" | "declined" | "cancelled" | null;
  callDuration?: number | null;
  callInitiatorId?: string | { _id: string } | null;
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
  callId?: string;
  sdpOffer?: any;
  candidate?: any;
  callerInfo?: {
    userId: string;
    username: string;
    displayName: string;
    avatar?: string;
  };
}

export interface CallBusyEvent {
  code: "already_in_call" | "peer_busy" | "user_busy" | "blocked";
  receiverId?: string;
  peerId?: string;
}

export type { CallIncomingDismissEvent, DmCallSessionSyncItem };

export interface UserProfileStyleUpdatedEvent {
  userId: string;
  profileContext?: "messaging" | "social";
  avatarUrl?: string | null;
  coverUrl?: string | null;
  displayNameFontId?: string;
  displayNameEffectId?: string;
  displayNamePrimaryHex?: string;
  displayNameAccentHex?: string;
  updatedAt?: string;
}

export interface DmUnreadCountEvent {
  totalUnread?: number;
  fromUserId?: string | null;
  conversationUnread?: number | null;
  _seq?: number;
}

export interface DmBlockUpdatedEvent {
  blockerId?: string;
  peerId?: string;
  blocked: boolean;
  direction?: "outgoing";
  _seq?: number;
}

export interface BoostEntitlementUpdatedEvent {
  userId: string;
  scope?: "messages" | "social";
  tier?: "basic" | "boost" | null;
  active?: boolean;
  expiresAt?: string | null;
  limits?: any;
}

export type PresenceStatus = "online" | "idle" | "offline";

export type UserPresence = {
  status: PresenceStatus;
  lastActiveAt?: string | null;
};

function mergePresenceEntry(
  prev: UserPresence | PresenceStatus | undefined,
  next: { status: PresenceStatus; lastActiveAt?: string | null },
): UserPresence {
  const status = next.status;
  const lastActiveAt =
    next.lastActiveAt !== undefined && next.lastActiveAt !== null
      ? next.lastActiveAt
      : typeof prev === "object" && prev?.lastActiveAt
        ? prev.lastActiveAt
        : null;
  return { status, lastActiveAt };
}

export const useDirectMessages = ({
  userId,
  token,
  enabled = true,
}: UseDirectMessagesOptions) => {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [newMessage, setNewMessage] = useState<DirectMessageEvent | null>(null);
  const [dmUnreadCountEvent, setDmUnreadCountEvent] =
    useState<DmUnreadCountEvent | null>(null);
  const [dmBlockUpdatedEvent, setDmBlockUpdatedEvent] =
    useState<DmBlockUpdatedEvent | null>(null);
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
  const [presenceByUserId, setPresenceByUserId] = useState<
    Record<string, UserPresence | PresenceStatus>
  >({});
  const [callEvent, setCallEvent] = useState<CallEvent | null>(null);
  const [callBusy, setCallBusy] = useState<CallBusyEvent | null>(null);
  const [callEnded, setCallEnded] = useState<{
    from: string;
    reason?: string;
    callId?: string;
  } | null>(null);
  const [callIncomingDismiss, setCallIncomingDismiss] =
    useState<CallIncomingDismissEvent | null>(null);
  const [callSessionsSync, setCallSessionsSync] = useState<{
    sessions: DmCallSessionSyncItem[];
  } | null>(null);
  const [callMediaTransferred, setCallMediaTransferred] = useState<{
    peerId: string;
    callId?: string;
    roomId?: string;
    type?: "audio" | "video";
  } | null>(null);
  const [messageDeleted, setMessageDeleted] = useState<{
    messageId: string;
    deleteType?: "for-everyone" | "for-me";
    deletedAt?: string;
    senderId?: string;
    receiverId?: string;
  } | null>(null);
  const [userProfileStyleUpdated, setUserProfileStyleUpdated] =
    useState<UserProfileStyleUpdatedEvent | null>(null);
  const [boostEntitlementUpdated, setBoostEntitlementUpdated] =
    useState<BoostEntitlementUpdatedEvent | null>(null);

  useEffect(() => {
    if (!enabled) {
      if (socketRef.current) {
        try {
          socketRef.current.disconnect();
        } catch {
          // ignore
        }
        socketRef.current = null;
      }
      setIsConnected(false);
      setCallEvent(null);
      setCallEnded(null);
      setCallIncomingDismiss(null);
      setCallSessionsSync(null);
      setCallMediaTransferred(null);
      setUserTyping(null);
      setMessagesRead(null);
      setReactionUpdate(null);
      setOnlineUsers(new Set());
      setPresenceByUserId({});
      return;
    }

    if (!userId || !token) {
      // Clear any residual call / presence state so a user logging out
      // (or the session going anonymous) cannot inherit ringing popups,
      // "call-answered" auto-join events, or stale online lists from the
      // previous identity. Without this the very first call after
      // re-login would re-fire old socket events from React state.
      setCallEvent(null);
      setCallEnded(null);
      setCallIncomingDismiss(null);
      setCallSessionsSync(null);
      setCallMediaTransferred(null);
      setUserTyping(null);
      setMessagesRead(null);
      setReactionUpdate(null);
      setOnlineUsers(new Set());
      setPresenceByUserId({});
      return;
    }

    const socket = io(`${apiBaseUrl}/direct-messages`, {
      auth: { token },
      transports: ["websocket", "polling"],
      upgrade: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8000,
      reconnectionAttempts: 20,
      timeout: 20000,
    });

    socket.on("connect", () => {
      setIsConnected(true);
      registerDmSocketForHeartbeat(socket);
    });

    socket.on("disconnect", () => {
      setIsConnected(false);
    });

    socket.on("connect_error", (err) => {
      console.warn("[DM socket] connect_error:", err?.message ?? err);
      setIsConnected(false);
    });

    socket.on(
      "new-message",
      (data: {
        message: DirectMessage;
        fromUser?: { userId: string; username: string };
      }) => {
        setNewMessage(data);
        setTimeout(() => setNewMessage(null), 400);
      },
    );

    socket.on(
      "dm-unread-count",
      (data: {
        totalUnread?: number;
        fromUserId?: string | null;
        conversationUnread?: number | null;
      }) => {
        if (!data || typeof data !== "object") return;
        setDmUnreadCountEvent({
          totalUnread:
            typeof data.totalUnread === "number" ? data.totalUnread : undefined,
          fromUserId: data.fromUserId ?? null,
          conversationUnread:
            typeof data.conversationUnread === "number"
              ? data.conversationUnread
              : null,
          _seq: Date.now(),
        });
      },
    );

    socket.on(
      "dm-block-updated",
      (data: {
        blockerId?: string;
        peerId?: string;
        blocked?: boolean;
        direction?: "outgoing";
      }) => {
        if (!data || typeof data !== "object") return;
        setDmBlockUpdatedEvent({
          blockerId: data.blockerId ? String(data.blockerId) : undefined,
          peerId: data.peerId ? String(data.peerId) : undefined,
          blocked: data.blocked === true,
          direction: data.direction,
          _seq: Date.now(),
        });
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
      setPresenceByUserId((prev) => ({
        ...prev,
        [data.userId]: mergePresenceEntry(prev[data.userId], {
          status: "online",
        }),
      }));
    });

    socket.on("user-offline", (data: { userId: string; status: string }) => {
      setOnlineUsers((prev) => {
        const newSet = new Set(prev);
        newSet.delete(data.userId);
        return newSet;
      });
      setPresenceByUserId((prev) => ({
        ...prev,
        [data.userId]: mergePresenceEntry(prev[data.userId], {
          status: "offline",
        }),
      }));
    });

    socket.on(
      "presence-snapshot",
      (data: {
        items: Array<{
          userId: string;
          status: PresenceStatus;
          lastActiveAt?: string | null;
        }>;
      }) => {
        const items = Array.isArray(data?.items) ? data.items : [];
        setPresenceByUserId((prev) => {
          const next = { ...prev };
          for (const it of items) {
            next[it.userId] = mergePresenceEntry(prev[it.userId], {
              status: it.status,
              lastActiveAt: it.lastActiveAt ?? null,
            });
          }
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
      (data: {
        userId: string;
        status: PresenceStatus;
        lastActiveAt?: string | null;
      }) => {
        if (!data?.userId || !data?.status) return;
        setPresenceByUserId((prev) => ({
          ...prev,
          [data.userId]: mergePresenceEntry(prev[data.userId], {
            status: data.status,
            lastActiveAt: data.lastActiveAt ?? null,
          }),
        }));
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

    // Call-related events.
    //
    // IMPORTANT: every one-shot call signal ("incoming" / "answer" /
    // "rejected") auto-clears after a short delay. Without this, the
    // `callEvent` state would stay pinned to the last signal forever and
    // any downstream `useEffect` that lists `callEvent` in its deps would
    // re-fire the handler every time a sibling dep (e.g. `outgoingCall`)
    // changed. That is exactly what caused:
    //   - Bug 3: user A starts a new call → the effect re-runs with a
    //     stale "incoming" callEvent from user C and the wrong incoming
    //     popup flashes on screen.
    //   - Bug 4: after logout / relogin, the user presses "video call"
    //     and the stale "answer" callEvent resurrects openCallTab(),
    //     skipping the accept/reject step.
    // We only clear if the in-flight event is still the same reference,
    // so a newer socket event replacing it won't get wiped prematurely.
    const scheduleClearCallEvent = (evt: CallEvent, delayMs = 1200) => {
      setTimeout(() => {
        setCallEvent((prev) => (prev === evt ? null : prev));
      }, delayMs);
    };

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
        if (!data.callerInfo) {
          console.error("❌ [SOCKET] callerInfo is UNDEFINED or NULL!");
        }
        const evt: CallEvent = { ...data, callSignal: "incoming" };
        setCallEvent(evt);
        scheduleClearCallEvent(evt, 8000);
        if (data.callerInfo) {
          dispatchDmCallIncoming({
            from: String(data.from),
            type: data.type,
            callerInfo: data.callerInfo,
            callId: (data as { callId?: string }).callId,
          });
        }
      },
    );

    socket.on(
      "call-answer",
      (data: {
        from: string;
        sdpOffer: any;
        callId?: string;
        type?: "audio" | "video";
      }) => {
        const evt: CallEvent = { ...data, callSignal: "answer" };
        setCallEvent(evt);
        scheduleClearCallEvent(evt, 8000);
        dispatchDmCallAnswer({
          from: String(data.from),
          sdpOffer: data.sdpOffer,
          callId: data.callId,
          type: data.type,
        });
      },
    );

    socket.on("call-rejected", (data: { from: string }) => {
      const evt: CallEvent = { from: data.from, callSignal: "rejected" };
      setCallEvent(evt);
      scheduleClearCallEvent(evt);
    });

    socket.on("call-busy", (data: CallBusyEvent) => {
      if (!data?.code) return;
      setCallBusy(data);
      setTimeout(() => setCallBusy(null), 2000);
    });

    socket.on("ice-candidate", (data: { from: string; candidate: any }) => {
      const evt: CallEvent = {
        from: data.from,
        candidate: data.candidate,
        callSignal: "ice",
      };
      setCallEvent(evt);
      // ICE candidates are high-frequency; clear even faster so they
      // can't linger and piggyback into the "answer"/"incoming"
      // branches of the downstream useEffect.
      scheduleClearCallEvent(evt, 500);
    });

    socket.on(
      "call-ended",
      (data: { from: string; reason?: string; callId?: string }) => {
        setCallEnded(data);
        setTimeout(() => setCallEnded(null), 1000);
      },
    );

    socket.on(
      "call-incoming-dismiss",
      (data: CallIncomingDismissEvent) => {
        if (!data?.peerId) return;
        const evt = { ...data };
        setCallIncomingDismiss(evt);
        setTimeout(() => {
          setCallIncomingDismiss((prev) => (prev === evt ? null : prev));
        }, 1200);
      },
    );

    socket.on(
      "call-sessions-sync",
      (data: { sessions?: DmCallSessionSyncItem[] }) => {
        const sessions = Array.isArray(data?.sessions) ? data.sessions : [];
        setCallSessionsSync({ sessions });
        setTimeout(() => setCallSessionsSync(null), 800);
      },
    );

    socket.on(
      "call-media-transferred",
      (data: {
        peerId?: string;
        callId?: string;
        roomId?: string;
        type?: "audio" | "video";
      }) => {
        if (!data?.peerId) return;
        const evt = {
          peerId: String(data.peerId),
          callId: data.callId,
          roomId: data.roomId,
          type: data.type,
        };
        setCallMediaTransferred(evt);
        setTimeout(() => setCallMediaTransferred(null), 1200);
      },
    );

    socket.on(
      "message-deleted",
      (data: {
        messageId: string;
        deleteType?: "for-everyone" | "for-me";
        deletedAt?: string;
        senderId?: string;
        receiverId?: string;
      }) => {
        if (!data?.messageId) return;
        // Always provide a fresh object reference so downstream effects
        // re-fire even when the same id is deleted twice in a row (e.g.
        // REST + socket emit for the same message).
        setMessageDeleted({
          ...data,
          messageId: String(data.messageId),
          deleteType:
            data.deleteType === "for-everyone" || data.deleteType === "for-me"
              ? data.deleteType
              : (data as { type?: string }).type === "message_unsent"
                ? "for-everyone"
                : data.deleteType,
        });
        setTimeout(() => setMessageDeleted(null), 1500);
      },
    );

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

    socket.on("user-settings-updated", (data: Record<string, unknown>) => {
      if (!data || typeof data !== "object") return;
      try {
        window.dispatchEvent(
          new CustomEvent("cordigram-user-settings-updated", { detail: data }),
        );
        window.dispatchEvent(new Event("cordigram-chat-settings"));
      } catch {
        // ignore
      }
    });

    socket.on("error", (error: { message: string }) => {
      console.error("Socket error:", error);
    });

    socketRef.current = socket;
    registerDmSocketForHeartbeat(socket);

    return () => {
      registerDmSocketForHeartbeat(null);
      socket.disconnect();
    };
  }, [userId, token, enabled]);

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
    (receiverId: string, type: "audio" | "video"): boolean => {
      if (!socketRef.current?.connected) {
        return false;
      }
      socketRef.current.emit("call-initiate", {
        receiverId,
        type,
        clientPlatform: detectDmClientPlatform(),
      });
      return true;
    },
    [],
  );

  const answerCall = useCallback((callerId: string, sdpOffer: any): boolean => {
    if (!socketRef.current?.connected) {
      return false;
    }
    socketRef.current.emit("call-answer", {
      callerId,
      sdpOffer,
    });
    return true;
  }, []);

  const rejectCall = useCallback((callerId: string): boolean => {
    if (!socketRef.current?.connected) {
      return false;
    }
    socketRef.current.emit("call-reject", {
      callerId,
    });
    return true;
  }, []);

  const sendIceCandidate = useCallback((peerId: string, candidate: any): boolean => {
    if (!socketRef.current?.connected) {
      return false;
    }
    socketRef.current.emit("ice-candidate", {
      peerId,
      candidate,
    });
    return true;
  }, []);

  const endCall = useCallback(
    (
      peerId: string,
      options?: {
        status?: "missed" | "completed" | "declined" | "cancelled";
        durationSec?: number;
      },
    ): boolean => {
      if (!socketRef.current?.connected) {
        return false;
      }
      const payload: {
        peerId: string;
        status?: "missed" | "completed" | "declined" | "cancelled";
        durationSec?: number;
      } = { peerId };
      if (options?.status) payload.status = options.status;
      if (options?.durationSec != null) payload.durationSec = options.durationSec;
      socketRef.current.emit("call-end", payload);
      return true;
    },
    [],
  );

  const claimCallMedia = useCallback(
    (
      peerId: string,
    ): Promise<{
      ok: boolean;
      callId?: string;
      roomId?: string;
      type?: "audio" | "video";
    }> => {
      return new Promise((resolve) => {
        if (!socketRef.current?.connected) {
          resolve({ ok: false });
          return;
        }
        socketRef.current.emit(
          "call-media-claim",
          { peerId },
          (res: {
            ok?: boolean;
            callId?: string;
            roomId?: string;
            type?: "audio" | "video";
          }) => {
            resolve({
              ok: Boolean(res?.ok),
              callId: res?.callId,
              roomId: res?.roomId,
              type: res?.type,
            });
          },
        );
      });
    },
    [],
  );

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
    dmUnreadCountEvent,
    dmBlockUpdatedEvent,
    messageSent,
    userTyping,
    messagesRead,
    reactionUpdate,
    onlineUsers,
    presenceByUserId,
    subscribePresence,
    callEvent,
    callBusy,
    callEnded,
    callIncomingDismiss,
    callSessionsSync,
    callMediaTransferred,
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
    claimCallMedia,
    emitDeleteMessage,
  };
};
