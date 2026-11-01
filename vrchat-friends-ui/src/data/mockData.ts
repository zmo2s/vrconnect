import { vrchatFetch } from "@/lib/vrchat-api";
export interface Friend {
  id: string;
  name: string;
  avatar: string;
  online: boolean;
  location?: string;
  worldName?: string;
  lastMessage: string;
  lastMessageTime: string;
  unread: number;
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
  status: number;
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
  return {
    id: friend.id,
    name: friend.displayName,
    avatar: friend.currentAvatarThumbnailImageUrl || friend.currentAvatarImageUrl,
    online: Boolean(friend.location) && friend.location !== "offline",
    location: friend.location || "",
    worldName: friend.worldName,
    lastMessage: friend.statusDescription || friend.bio || "No status",
    lastMessageTime: formatLastLogin(friend.lastLogin),
    unread: 0,
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
  const response = await apiGet<ApiResponse<VrchatFriendDto[]>>(
    `${API_URL}/vrchat/getfriendlist/offset=0/n=100/online=${online}?offline=${!online}`
  );

  if (!response.success || !Array.isArray(response.data)) {
    throw new Error(response.error || "Failed to load friends");
  }

  return response.data.map(mapVrchatFriendToFriend);
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
  const token =   "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwNDI2NjU1YS0wM2MwLTQzYjctYmE4Ny03MDczMWQ3ZGZlNzAiLCJ1bmlxdWVfbmFtZSI6ImFudG9uaW4iLCJodHRwOi8vc2NoZW1hcy54bWxzb2FwLm9yZy93cy8yMDA1LzA1L2lkZW50aXR5L2NsYWltcy9uYW1laWRlbnRpZmllciI6IjA0MjY2NTVhLTAzYzAtNDNiNy1iYTg3LTcwNzMxZDdkZmU3MCIsImh0dHA6Ly9zY2hlbWFzLnhtbHNvYXAub3JnL3dzLzIwMDUvMDUvaWRlbnRpdHkvY2xhaW1zL25hbWUiOiJhbnRvbmluIiwiZXhwIjoxNzc3MjQyMDQ0LCJpc3MiOiJEYXNoYm9hcmRWUkNoYXQuQXBpIiwiYXVkIjoiRGFzaGJvYXJkVlJDaGF0LkNsaWVudCJ9.ZJOwKoP-0yItHxD_BsyVnKV5nyDG3NAgUOK-fAyL7Rg";
;

  const response = await vrchatFetch(`${API_URL}/api/conversations/messages/${"5a419ef0-c3b9-4406-ad9e-abbd02fe5036"}`, {
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


