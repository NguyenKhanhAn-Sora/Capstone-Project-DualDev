const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:9999";

export type LivestreamLatencyMode = "adaptive" | "balanced" | "low";

export type LivestreamItem = {
  id: string;
  title: string;
  description: string;
  pinnedComment: string;
  location: string;
  mentionUsernames: string[];
  visibility: "public" | "followers" | "private";
  latencyMode: LivestreamLatencyMode;
  hostName: string;
  hostUserId: string;
  roomName: string;
  provider: "livekit" | "ivs";
  ivsPlaybackUrl?: string;
  status: "live" | "ended";
  startedAt: string;
  endedAt: string | null;
  maxViewers: number;
  viewerCount: number;
};

export type IvsIngestResponse = {
  provider: "ivs";
  ingestEndpoint: string;
  streamKey: string;
  playbackUrl: string;
};

export type LivestreamListResponse = {
  maxConcurrentLivestreams: number;
  maxViewersPerRoom: number;
  activeCount: number;
  items: LivestreamItem[];
};

export type JoinLivestreamResponse = {
  token: string;
  url: string;
  stream: LivestreamItem;
  role: "host" | "viewer";
};

function getToken() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("accessToken") || localStorage.getItem("token") || "";
}

async function handleResponse<T>(response: Response, fallback: string): Promise<T> {
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const message =
      typeof (data as { message?: string }).message === "string"
        ? (data as { message: string }).message
        : Array.isArray((data as { message?: string[] }).message)
          ? (data as { message: string[] }).message.join(", ")
          : fallback;
    throw new Error(message);
  }
  return response.json();
}

export async function listLiveLivestreams(): Promise<LivestreamListResponse> {
  const token = getToken();
  const response = await fetch(`${API_BASE}/livestreams/live`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    credentials: "include",
  });
  return handleResponse<LivestreamListResponse>(response, "Failed to load livestream list.");
}

export async function createLivestream(payload: {
  title: string;
  description?: string;
  pinnedComment?: string;
  visibility?: "public" | "followers" | "private";
  latencyMode?: LivestreamLatencyMode;
  location?: string;
  mentions?: string[];
}): Promise<{ stream: LivestreamItem }> {
  const token = getToken();
  const response = await fetch(`${API_BASE}/livestreams`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  return handleResponse<{ stream: LivestreamItem }>(response, "Failed to create livestream.");
}

export async function joinLivestreamToken(streamId: string, payload?: {
  asHost?: boolean;
  participantName?: string;
}): Promise<JoinLivestreamResponse> {
  const token = getToken();
  const response = await fetch(`${API_BASE}/livestreams/${streamId}/join-token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    credentials: "include",
    body: JSON.stringify(payload ?? {}),
  });
  return handleResponse<JoinLivestreamResponse>(response, "Failed to join livestream.");
}

export async function getLivestreamById(streamId: string): Promise<{ stream: LivestreamItem }> {
  const token = getToken();
  const response = await fetch(`${API_BASE}/livestreams/${streamId}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    credentials: "include",
  });
  return handleResponse<{ stream: LivestreamItem }>(response, "Failed to load livestream.");
}

export async function updateLivestream(streamId: string, payload: {
  title?: string;
  description?: string;
  pinnedComment?: string;
  location?: string;
  latencyMode?: LivestreamLatencyMode;
}): Promise<{ stream: LivestreamItem }> {
  const token = getToken();
  const response = await fetch(`${API_BASE}/livestreams/${streamId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  return handleResponse<{ stream: LivestreamItem }>(response, "Failed to update livestream.");
}

export async function endLivestream(streamId: string): Promise<{ ok: boolean }> {
  const token = getToken();
  const response = await fetch(`${API_BASE}/livestreams/${streamId}/end`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    credentials: "include",
  });
  return handleResponse<{ ok: boolean }>(response, "Failed to end livestream.");
}

export async function getIvsIngest(streamId: string): Promise<IvsIngestResponse> {
  const token = getToken();
  const response = await fetch(`${API_BASE}/livestreams/${streamId}/ivs-ingest`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    credentials: "include",
  });
  return handleResponse<IvsIngestResponse>(response, "Failed to load AWS IVS ingest info.");
}
