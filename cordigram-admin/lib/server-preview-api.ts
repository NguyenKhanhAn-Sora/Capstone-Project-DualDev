import { getApiBaseUrl } from "@/lib/api";

function authHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export type AdminServerViewResponse = {
  server: {
    _id: string;
    name?: string;
    avatarUrl?: string | null;
  };
  channels: Array<{
    _id: string;
    name: string;
    type: "text" | "voice";
    category?: string | null;
    categoryId?: string | null;
    position?: number;
  }>;
  categories: Array<{
    _id: string;
    name: string;
    position?: number;
  }>;
};

export type AdminEmojiPickerResponse = {
  contextServerId: string | null;
  groups: Array<{
    serverId: string;
    emojis: Array<{ name: string; imageUrl: string }>;
  }>;
};

export type AdminChannelMessagesResponse = {
  messages: unknown[];
  chatViewBlocked?: boolean;
  chatBlockReason?: string | null;
};

export async function fetchAdminServerView(
  serverId: string,
  token: string,
): Promise<AdminServerViewResponse> {
  const res = await fetch(
    `${getApiBaseUrl()}/admin/community-discovery/${encodeURIComponent(serverId)}/view`,
    { headers: authHeaders(token) },
  );
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(t || `HTTP ${res.status}`);
  }
  return res.json() as Promise<AdminServerViewResponse>;
}

export async function fetchAdminEmojiPicker(
  serverId: string,
  token: string,
): Promise<AdminEmojiPickerResponse> {
  const res = await fetch(
    `${getApiBaseUrl()}/admin/community-discovery/${encodeURIComponent(serverId)}/emoji-picker`,
    { headers: authHeaders(token) },
  );
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(t || `HTTP ${res.status}`);
  }
  return res.json() as Promise<AdminEmojiPickerResponse>;
}

export async function fetchAdminChannelMessages(
  serverId: string,
  channelId: string,
  token: string,
  limit = 80,
  skip = 0,
): Promise<AdminChannelMessagesResponse> {
  const url = new URL(
    `${getApiBaseUrl()}/admin/community-discovery/${encodeURIComponent(serverId)}/channels/${encodeURIComponent(channelId)}/messages`,
  );
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("skip", String(skip));
  const res = await fetch(url.toString(), { headers: authHeaders(token) });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(t || `HTTP ${res.status}`);
  }
  return res.json() as Promise<AdminChannelMessagesResponse>;
}

export function buildEmojiRenderMap(
  serverId: string,
  data: AdminEmojiPickerResponse,
): Record<string, string> {
  const m: Record<string, string> = {};
  for (const g of data.groups || []) {
    if (String(g.serverId) !== String(serverId)) continue;
    for (const e of g.emojis || []) {
      const k = (e.name || "").trim().toLowerCase();
      if (k) m[k] = e.imageUrl;
    }
  }
  return m;
}
