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

export interface CallEvent {
  from: string;
  type?: "audio" | "video";
  sdpOffer?: any;
  callerInfo?: {
    userId: string;
    username: string;
    displayName: string;
    avatar?: string;
  };
}

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
  const [callEvent, setCallEvent] = useState<CallEvent | null>(null);
  const [callEnded, setCallEnded] = useState<{ from: string } | null>(null);
  const [messageDeleted, setMessageDeleted] = useState<{ messageId: string } | null>(null);

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
      console.log("Connected to WebSocket - Direct Messages");
      setIsConnected(true);
    });

    socket.on("disconnect", () => {
      console.log("Disconnected from WebSocket");
      setIsConnected(false);
    });

    socket.on(
      "new-message",
      (data: {
        message: DirectMessage;
        fromUser?: { userId: string; username: string };
      }) => {
        console.log("New message received from socket:", data);
        setNewMessage(data);
      },
    );

    socket.on("message-sent", (data: { message: DirectMessage }) => {
      console.log("Message sent confirmation:", data);
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
    });

    socket.on("user-offline", (data: { userId: string; status: string }) => {
      setOnlineUsers((prev) => {
        const newSet = new Set(prev);
        newSet.delete(data.userId);
        return newSet;
      });
    });

    socket.on(
      "messages-read",
      (data: { byUserId: string; messageIds: string[] }) => {
        console.log("📖 Messages-read event received:", data);
        // ✅ Create new object to trigger React re-render
        setMessagesRead({ ...data, timestamp: Date.now() } as any);
      },
    );

    socket.on("reaction-added", (data: any) => {
      console.log("Reaction added:", data);
      if (data?.messageId && Array.isArray(data?.reactions)) {
        setReactionUpdate({ messageId: data.messageId, reactions: data.reactions });
        setTimeout(() => setReactionUpdate(null), 500);
      }
    });

    socket.on("reaction-updated", (data: any) => {
      console.log("Reaction updated:", data);
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
        console.log("📞 [SOCKET] ========== INCOMING CALL EVENT ==========");
        console.log(
          "📞 [SOCKET] Raw data received:",
          JSON.stringify(data, null, 2),
        );
        console.log("📞 [SOCKET] data.from:", data.from);
        console.log("📞 [SOCKET] data.type:", data.type);
        console.log("📞 [SOCKET] data.callerInfo:", data.callerInfo);
        if (data.callerInfo) {
          console.log("📞 [SOCKET] callerInfo.userId:", data.callerInfo.userId);
          console.log(
            "📞 [SOCKET] callerInfo.username:",
            data.callerInfo.username,
          );
          console.log(
            "📞 [SOCKET] callerInfo.displayName:",
            data.callerInfo.displayName,
          );
          console.log("📞 [SOCKET] callerInfo.avatar:", data.callerInfo.avatar);
        } else {
          console.error("❌ [SOCKET] callerInfo is UNDEFINED or NULL!");
        }
        console.log("📞 [SOCKET] ========================================");
        setCallEvent(data);
      },
    );

    socket.on("call-answer", (data: { from: string; sdpOffer: any }) => {
      console.log("📞 [SOCKET] Call answered event received:", data);
      setCallEvent(data);
    });

    socket.on("call-rejected", (data: { from: string }) => {
      console.log("📞 [SOCKET] Call rejected event received:", data);
      setCallEvent({ from: data.from } as any); // Trigger rejection handling
    });

    socket.on("ice-candidate", (data: { from: string; candidate: any }) => {
      console.log("ICE candidate:", data);
      setCallEvent(data);
    });

    socket.on("call-ended", (data: { from: string }) => {
      console.log("Call ended:", data);
      setCallEnded(data);
      setTimeout(() => setCallEnded(null), 1000);
    });

    socket.on("message-deleted", (data: { messageId: string }) => {
      setMessageDeleted(data);
      setTimeout(() => setMessageDeleted(null), 1000);
    });

    socket.on("error", (error: { message: string }) => {
      console.error("Socket error:", error);
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
    };
  }, [userId, token]);

  const sendMessage = useCallback(
    (receiverId: string, content: string, attachments?: string[]) => {
      if (socketRef.current && socketRef.current.connected) {
        console.log("Sending message to:", receiverId, "Content:", content);
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
    callEvent,
    callEnded,
    messageDeleted,
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
