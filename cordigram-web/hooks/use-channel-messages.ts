import { useEffect, useRef, useCallback, useState } from "react";
import io, { Socket } from "socket.io-client";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE?.replace(/\/$/, "") ?? "http://localhost:9999";

export interface ChannelMessagePayload {
  _id: string;
  channelId: string;
  senderId: {
    _id: string;
    email?: string;
    displayName?: string;
    username?: string;
    avatarUrl?: string;
  };
  content: string;
  attachments?: string[];
  reactions?: Array<{ userId: string; emoji: string }>;
  replyTo?: string | { _id: string; content: string; senderId?: any };
  createdAt: string;
  updatedAt?: string;
}

export interface ChannelNewMessageEvent {
  message: ChannelMessagePayload;
}

export interface ChannelReactionUpdateEvent {
  messageId: string;
  reactions: any[];
}

interface UseChannelMessagesOptions {
  token: string | null;
}

export function useChannelMessages({ token }: UseChannelMessagesOptions) {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [newMessageChannel, setNewMessageChannel] = useState<ChannelNewMessageEvent | null>(null);
  const [reactionUpdateChannel, setReactionUpdateChannel] = useState<ChannelReactionUpdateEvent | null>(null);

  useEffect(() => {
    if (!token) return;

    const socket = io(`${API_BASE}/channel-messages`, {
      auth: { token },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    });

    socketRef.current = socket;

    socket.on("connect", () => setIsConnected(true));
    socket.on("disconnect", () => setIsConnected(false));

    socket.on("new-message", (data: ChannelNewMessageEvent) => {
      if (data?.message) setNewMessageChannel(data);
    });

    socket.on("reaction-updated", (data: ChannelReactionUpdateEvent) => {
      if (data?.messageId && Array.isArray(data?.reactions)) {
        setReactionUpdateChannel({ messageId: data.messageId, reactions: data.reactions });
        setTimeout(() => setReactionUpdateChannel(null), 500);
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token]);

  const joinChannel = useCallback((channelId: string) => {
    if (socketRef.current?.connected && channelId) {
      socketRef.current.emit("join-channel", { channelId });
    }
  }, []);

  const leaveChannel = useCallback((channelId: string) => {
    if (socketRef.current?.connected && channelId) {
      socketRef.current.emit("leave-channel", { channelId });
    }
  }, []);

  const clearNewMessageChannel = useCallback(() => setNewMessageChannel(null), []);

  return {
    isConnected,
    newMessageChannel,
    reactionUpdateChannel,
    joinChannel,
    leaveChannel,
    clearNewMessageChannel,
  };
}
