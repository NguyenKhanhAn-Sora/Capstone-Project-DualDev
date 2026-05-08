import { useEffect, useRef, useCallback, useState } from "react";
import io, { Socket } from "socket.io-client";
import { apiBaseUrl as API_BASE } from "@/lib/api";

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

export interface ChannelNotificationEvent {
  type?: string;
  serverId?: string;
  channelId?: string;
  messageId?: string;
  senderName?: string;
  excerpt?: string;
  isMention?: boolean;
  createdAt?: string;
}

export interface ServerDeletedEvent {
  serverId: string;
  serverName?: string;
}

export interface ServerMemberProfileUpdatedEvent {
  serverId: string;
  userId: string;
  avatarUrl?: string | null;
  coverUrl?: string | null;
  updatedAt?: string;
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

export interface JoinApplicationUpdatedEvent {
  serverId: string;
  userId: string;
  status: "accepted" | "rejected" | "withdrawn";
}

export interface ServerUpdatedEvent {
  serverId: string;
  actorUserId?: string | null;
  server?: {
    id: string;
    name: string;
    description?: string | null;
    avatarUrl?: string | null;
    bannerUrl?: string | null;
    bannerImageUrl?: string | null;
    bannerColor?: string | null;
    memberCount?: number;
  };
  updatedAt?: string;
}

export interface ServerMembershipUpdatedEvent {
  serverId: string;
  userId: string;
  action: "joined" | "left";
  actorUserId?: string | null;
  server?: ServerUpdatedEvent["server"];
  updatedAt?: string;
}

export interface ChannelMessageDeletedEvent {
  channelId: string;
  messageId: string;
  deleteType: "for-everyone" | "for-me";
  deletedAt?: string;
}

interface UseChannelMessagesOptions {
  token: string | null;
}

export function useChannelMessages({ token }: UseChannelMessagesOptions) {
  const socketRef = useRef<Socket | null>(null);
  /** Re-subscribe to the current channel room after each socket reconnect (rooms are not persisted). */
  const lastJoinedChannelIdRef = useRef<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [newMessageChannel, setNewMessageChannel] = useState<ChannelNewMessageEvent | null>(null);
  const [reactionUpdateChannel, setReactionUpdateChannel] = useState<ChannelReactionUpdateEvent | null>(null);
  const [channelNotification, setChannelNotification] = useState<ChannelNotificationEvent | null>(null);
  const [serverDeleted, setServerDeleted] = useState<ServerDeletedEvent | null>(null);
  const [serverMemberProfileUpdated, setServerMemberProfileUpdated] =
    useState<ServerMemberProfileUpdatedEvent | null>(null);
  const [userProfileStyleUpdated, setUserProfileStyleUpdated] =
    useState<UserProfileStyleUpdatedEvent | null>(null);
  const [boostEntitlementUpdated, setBoostEntitlementUpdated] =
    useState<BoostEntitlementUpdatedEvent | null>(null);
  const [serverUpdated, setServerUpdated] = useState<ServerUpdatedEvent | null>(null);
  const [serverMembershipUpdated, setServerMembershipUpdated] =
    useState<ServerMembershipUpdatedEvent | null>(null);
  const [channelMessageDeleted, setChannelMessageDeleted] =
    useState<ChannelMessageDeletedEvent | null>(null);

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

    socket.on("connect", () => {
      setIsConnected(true);
      const ch = lastJoinedChannelIdRef.current;
      if (ch && socketRef.current?.connected) {
        socketRef.current.emit("join-channel", { channelId: ch });
      }
    });
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

    socket.on("channel-notification", (data: ChannelNotificationEvent) => {
      if (data) setChannelNotification(data);
    });

    socket.on("server-deleted", (data: ServerDeletedEvent) => {
      if (data?.serverId) setServerDeleted({ serverId: data.serverId, serverName: data.serverName });
    });

    socket.on("server-member-profile-updated", (data: ServerMemberProfileUpdatedEvent) => {
      if (!data?.serverId || !data?.userId) return;
      setServerMemberProfileUpdated(data);
      try {
        window.dispatchEvent(
          new CustomEvent("cordigram-server-member-profile-updated", { detail: data }),
        );
      } catch {
        // ignore
      }
      setTimeout(() => setServerMemberProfileUpdated(null), 500);
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

    socket.on("join-application-updated", (data: JoinApplicationUpdatedEvent) => {
      if (!data?.serverId || !data?.userId) return;
      try {
        window.dispatchEvent(
          new CustomEvent("cordigram-join-application-updated", { detail: data }),
        );
      } catch {
        // ignore
      }
    });

    socket.on("server-updated", (data: ServerUpdatedEvent) => {
      if (!data?.serverId) return;
      setServerUpdated(data);
      try {
        window.dispatchEvent(
          new CustomEvent("cordigram-server-updated", { detail: data }),
        );
      } catch {
        // ignore
      }
      setTimeout(() => setServerUpdated(null), 500);
    });

    socket.on("server-membership-updated", (data: ServerMembershipUpdatedEvent) => {
      if (!data?.serverId || !data?.userId) return;
      setServerMembershipUpdated(data);
      try {
        window.dispatchEvent(
          new CustomEvent("cordigram-server-membership-updated", { detail: data }),
        );
      } catch {
        // ignore
      }
      setTimeout(() => setServerMembershipUpdated(null), 500);
    });

    socket.on("message-deleted", (data: ChannelMessageDeletedEvent) => {
      if (!data?.messageId || !data?.channelId || !data?.deleteType) return;
      setChannelMessageDeleted({
        channelId: data.channelId,
        messageId: data.messageId,
        deleteType: data.deleteType,
        deletedAt: data.deletedAt,
      });
      window.setTimeout(() => setChannelMessageDeleted(null), 500);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token]);

  const joinChannel = useCallback((channelId: string) => {
    lastJoinedChannelIdRef.current = channelId || null;
    if (socketRef.current?.connected && channelId) {
      socketRef.current.emit("join-channel", { channelId });
    }
  }, []);

  const leaveChannel = useCallback((channelId: string) => {
    if (lastJoinedChannelIdRef.current === channelId) {
      lastJoinedChannelIdRef.current = null;
    }
    if (socketRef.current?.connected && channelId) {
      socketRef.current.emit("leave-channel", { channelId });
    }
  }, []);

  const clearNewMessageChannel = useCallback(() => setNewMessageChannel(null), []);
  const clearChannelNotification = useCallback(() => setChannelNotification(null), []);
  const clearServerDeleted = useCallback(() => setServerDeleted(null), []);

  return {
    isConnected,
    newMessageChannel,
    reactionUpdateChannel,
    channelNotification,
    serverDeleted,
    serverMemberProfileUpdated,
    userProfileStyleUpdated,
    boostEntitlementUpdated,
    serverUpdated,
    serverMembershipUpdated,
    joinChannel,
    leaveChannel,
    clearNewMessageChannel,
    clearChannelNotification,
    clearServerDeleted,
    channelMessageDeleted,
  };
}
