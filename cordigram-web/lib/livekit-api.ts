const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:9999";

export interface LiveKitTokenResponse {
  token: string;
  url: string;
}

export interface RoomNameResponse {
  roomName: string;
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
