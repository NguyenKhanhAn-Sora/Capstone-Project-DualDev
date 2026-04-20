const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "https://api.cordigram.com";

export interface LiveKitTokenResponse {
  token: string;
  url: string;
}

export interface RoomNameResponse {
  roomName: string;
}

export interface VoiceChannelParticipant {
  identity: string;
  name: string;
}

export interface VoiceChannelParticipantsResponse {
  participants: VoiceChannelParticipant[];
}

function getAuthHeaders(): Record<string, string> {
  const token =
    typeof window !== "undefined"
      ? localStorage.getItem("accessToken") || localStorage.getItem("token") || ""
      : "";
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

/**
 * Get LiveKit access token for joining a room
 */
export async function getLiveKitToken(
  roomName: string,
  participantName: string,
  token: string,
): Promise<LiveKitTokenResponse> {
  const response = await fetch(`${API_BASE}/livekit/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    credentials: "include",
    body: JSON.stringify({
      roomName,
      participantName,
    }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const message =
      typeof (data as { message?: string }).message === "string"
        ? (data as { message: string }).message
        : Array.isArray((data as { message?: string[] }).message)
          ? (data as { message: string[] }).message.join(", ")
          : "Failed to get LiveKit token";
    throw new Error(message);
  }

  return response.json();
}

/**
 * Get room name for DM call with a friend
 */
export async function getDMRoomName(
  friendId: string,
  token: string,
): Promise<RoomNameResponse> {
  const response = await fetch(`${API_BASE}/livekit/room-name`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    credentials: "include",
    body: JSON.stringify({
      friendId,
    }),
  });

  if (!response.ok) {
    throw new Error("Không lấy được tên phòng");
  }

  return response.json();
}

/**
 * Lấy danh sách người đang trong kênh thoại (để hiển thị bên sidebar).
 */
export async function getVoiceChannelParticipants(
  serverId: string,
  channelId: string,
): Promise<VoiceChannelParticipantsResponse> {
  const url = new URL(`${API_BASE}/livekit/voice-channel-participants`);
  url.searchParams.set("serverId", serverId);
  url.searchParams.set("channelId", channelId);
  const response = await fetch(url.toString(), {
    headers: getAuthHeaders(),
    credentials: "include",
  });
  if (!response.ok) return { participants: [] };
  return response.json();
}