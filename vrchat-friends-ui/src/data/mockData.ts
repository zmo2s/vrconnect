import { vrchatFetch } from "@/lib/vrchat-api";
import { normalizeStatus, type VrcStatus } from "@/lib/vrc-status";
export interface Friend {
  id: string;
  name: string;
  avatar: string;
  /** In game. */
  online: boolean;
  /** Connected on the VRChat website (vrchat.com), not in game. */
  onWeb?: boolean;
  location?: string;
  worldName?: string;
  lastMessage: string;
  lastMessageTime: string;
  unread: number;
  /** VRChat social status (Join me / Active / Ask me / Busy). */
  status?: VrcStatus;
  /** ISO date of the last VRChat login, used for "last seen". */
  lastLogin?: string;
  bio?: string;
}

export interface Message {
  id: string;
  senderId: string;
  text?: string;
  image?: string;
  timestamp: string;
  isOwn: boolean;
}

interface ApiResponse<T> {
  success: boolean;
  error: string | null;
  data: T | null;
}

interface VrchatFriendDto {
  id: string;
  displayName: string;
  status: number | string;
  /** "online" (in game) | "active" (website) | "offline" */
  state?: string;
  platform?: string;
  statusDescription: string;
  bio: string;
  location: string;
  worldName?: string;
  currentAvatarImageUrl: string;
  currentAvatarThumbnailImageUrl: string;
  lastLogin: string;
}

export const currentUser = {
  id: "me",
  name: "You",
  avatar: "Y",
};

const API_URL = "http://localhost:5000";

function formatLastLogin(lastLogin: string): string {
  if (!lastLogin) return "";

  const date = new Date(lastLogin);

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function mapVrchatFriendToFriend(friend: VrchatFriendDto): Friend {
  const inGame = Boolean(friend.location) && friend.location !== "offline";
  return {
    id: friend.id,
    name: friend.displayName,
    avatar: friend.currentAvatarThumbnailImageUrl || friend.currentAvatarImageUrl,
    online: inGame,
    onWeb: !inGame && friend.state === "active",
    location: friend.location || "",
    worldName: friend.worldName,
    lastMessage: friend.statusDescription || friend.bio || "No status",
    lastMessageTime: formatLastLogin(friend.lastLogin),
    unread: 0,
    status: normalizeStatus(friend.status),
    lastLogin: friend.lastLogin || undefined,
    bio: friend.bio || undefined,
  };
}




export async function apiGet<T>(url: string): Promise<T> {
  const token = localStorage.getItem("token");
  const response = await vrchatFetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}` // 🔥 THIS IS THE FIX
    }
  });

  if (!response.ok) {
    const failure = await response.json().catch(() => null);
    throw new Error(failure?.error || "API request failed");
  }

  return response.json();
}
export async function getFriends(online: boolean = true): Promise<Friend[]> {
  // VRChat returns at most 100 friends per call, so keep paging until a short page.
  const all: VrchatFriendDto[] = [];
  for (let offset = 0; offset < 5000; offset += 100) {
    const response = await apiGet<ApiResponse<VrchatFriendDto[]>>(
      `${API_URL}/vrchat/getfriendlist/offset=${offset}/n=100/online=${online}?offline=${!online}&offset=${offset}&n=100`
    );
    if (!response.success || !Array.isArray(response.data)) {
      throw new Error(response.error || "Failed to load friends");
    }
    all.push(...response.data);
    if (response.data.length < 100) break;
  }
  return all.map(mapVrchatFriendToFriend);
}
/*
export async function getFriends(online: boolean = true): Promise<Friend[]> {
  const data = await apiGet<VrchatFriendDto[]>(
    `${API_URL}/vrchat/getfriendlist/offset=0/n=100/online=${online}?offline=${!online}`
  );

  return data.map(mapVrchatFriendToFriend);
}*/








export async function getMessages(
  otherUserId: string,
  currentUserId: string
): Promise<Message[]> {
  // Use the signed-in user's token; never commit a token to the source.
  const token = localStorage.getItem("token");

  const response = await vrchatFetch(`${API_URL}/api/conversations/messages/${encodeURIComponent(otherUserId)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to get messages");
  }

  const data = await response.json();

  return data.map((m: any) => ({
    id: m.id,
    senderId: m.senderId,
    text: m.content,
    timestamp: new Date(m.sentAtUtc).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
    isOwn: m.senderId === currentUserId,
  }));
}

export async function sendMessage(
  receiverId: string,
  content: string
): Promise<void> {
  const token = localStorage.getItem("token");

  const response = await vrchatFetch(`${API_URL}/api/chat/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      receiverId,
      content,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to send message");
  }
}


