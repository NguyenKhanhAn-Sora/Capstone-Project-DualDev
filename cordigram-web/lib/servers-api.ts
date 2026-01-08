const API_BASE_URL = 'http://localhost:9999';

function getToken(): string {
  return localStorage.getItem('accessToken') || localStorage.getItem('token') || '';
}

function getHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${getToken()}`,
  };
}

export interface Server {
  _id: string;
  name: string;
  description?: string;
  avatarUrl?: string;
  ownerId: string;
  members: Array<{
    userId: string;
    role: 'owner' | 'moderator' | 'member';
    joinedAt: string;
  }>;
  channels: Channel[];
  memberCount: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Channel {
  _id: string;
  name: string;
  type: 'text' | 'voice';
  description?: string;
  serverId: string;
  createdBy: string;
  isDefault: boolean;
  messageCount: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  _id: string;
  channelId: string;
  senderId: {
    _id: string;
    email: string;
  };
  content: string;
  attachments: string[];
  reactions: Array<{
    userId: string;
    emoji: string;
  }>;
  isEdited: boolean;
  editedAt?: string;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Friend {
  _id: string;
  displayName: string;
  username: string;
  avatarUrl: string;
  email: string;
}

// Servers
export async function createServer(
  name: string,
  description?: string,
  avatarUrl?: string,
): Promise<Server> {
  const response = await fetch(`${API_BASE_URL}/servers`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ name, description, avatarUrl }),
  });

  if (!response.ok) {
    throw new Error('Failed to create server');
  }

  return response.json();
}

export async function getMyServers(): Promise<Server[]> {
  const response = await fetch(`${API_BASE_URL}/servers`, {
    headers: getHeaders(),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error('API Error:', response.status, errorData);
    throw new Error(errorData.message || 'Failed to fetch servers');
  }

  return response.json();
}

export async function getServer(serverId: string): Promise<Server> {
  const response = await fetch(`${API_BASE_URL}/servers/${serverId}`, {
    headers: getHeaders(),
  });

  if (!response.ok) {
    throw new Error('Failed to fetch server');
  }

  return response.json();
}

export async function updateServer(
  serverId: string,
  name?: string,
  description?: string,
  avatarUrl?: string,
): Promise<Server> {
  const response = await fetch(`${API_BASE_URL}/servers/${serverId}`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify({ name, description, avatarUrl }),
  });

  if (!response.ok) {
    throw new Error('Failed to update server');
  }

  return response.json();
}

export async function deleteServer(serverId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/servers/${serverId}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });

  if (!response.ok) {
    throw new Error('Failed to delete server');
  }
}

// Channels
export async function createChannel(
  serverId: string,
  name: string,
  type: 'text' | 'voice',
  description?: string,
): Promise<Channel> {
  const response = await fetch(`${API_BASE_URL}/servers/${serverId}/channels`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ name, type, description }),
  });

  if (!response.ok) {
    throw new Error('Failed to create channel');
  }

  return response.json();
}

export async function getChannels(
  serverId: string,
  type?: 'text' | 'voice',
): Promise<Channel[]> {
  const url = new URL(`${API_BASE_URL}/servers/${serverId}/channels`);
  if (type) {
    url.searchParams.append('type', type);
  }

  const response = await fetch(url.toString(), {
    headers: getHeaders(),
  });

  if (!response.ok) {
    throw new Error('Failed to fetch channels');
  }

  return response.json();
}

export async function getChannel(
  serverId: string,
  channelId: string,
): Promise<Channel> {
  const response = await fetch(
    `${API_BASE_URL}/servers/${serverId}/channels/${channelId}`,
    {
      headers: getHeaders(),
    },
  );

  if (!response.ok) {
    throw new Error('Failed to fetch channel');
  }

  return response.json();
}

export async function updateChannel(
  serverId: string,
  channelId: string,
  name?: string,
  description?: string,
): Promise<Channel> {
  const response = await fetch(
    `${API_BASE_URL}/servers/${serverId}/channels/${channelId}`,
    {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify({ name, description }),
    },
  );

  if (!response.ok) {
    throw new Error('Failed to update channel');
  }

  return response.json();
}

export async function deleteChannel(
  serverId: string,
  channelId: string,
): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/servers/${serverId}/channels/${channelId}`,
    {
      method: 'DELETE',
      headers: getHeaders(),
    },
  );

  if (!response.ok) {
    throw new Error('Failed to delete channel');
  }
}

// Messages
export async function createMessage(
  channelId: string,
  content: string,
  attachments?: string[],
): Promise<Message> {
  const response = await fetch(`${API_BASE_URL}/channels/${channelId}/messages`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ content, attachments }),
  });

  if (!response.ok) {
    throw new Error('Failed to create message');
  }

  return response.json();
}

export async function getMessages(
  channelId: string,
  limit: number = 50,
  skip: number = 0,
): Promise<Message[]> {
  const url = new URL(`${API_BASE_URL}/channels/${channelId}/messages`);
  url.searchParams.append('limit', limit.toString());
  url.searchParams.append('skip', skip.toString());

  const response = await fetch(url.toString(), {
    headers: getHeaders(),
  });

  if (!response.ok) {
    throw new Error('Failed to fetch messages');
  }

  return response.json();
}

export async function updateMessage(
  channelId: string,
  messageId: string,
  content: string,
): Promise<Message> {
  const response = await fetch(
    `${API_BASE_URL}/channels/${channelId}/messages/${messageId}`,
    {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify({ content }),
    },
  );

  if (!response.ok) {
    throw new Error('Failed to update message');
  }

  return response.json();
}

export async function deleteMessage(
  channelId: string,
  messageId: string,
): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/channels/${channelId}/messages/${messageId}`,
    {
      method: 'DELETE',
      headers: getHeaders(),
    },
  );

  if (!response.ok) {
    throw new Error('Failed to delete message');
  }
}

export async function addMessageReaction(
  channelId: string,
  messageId: string,
  emoji: string,
): Promise<Message> {
  const response = await fetch(
    `${API_BASE_URL}/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`,
    {
      method: 'POST',
      headers: getHeaders(),
    },
  );

  if (!response.ok) {
    throw new Error('Failed to add reaction');
  }

  return response.json();
}

// Friends/Followers
export async function getMyFollowers(): Promise<Friend[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/profiles/followers`, {
      headers: getHeaders(),
    });

    if (!response.ok) {
      return [];
    }

    return response.json();
  } catch (err) {
    console.error('Failed to fetch followers', err);
    return [];
  }
}
