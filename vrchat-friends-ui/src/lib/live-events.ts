import type { Friend } from "@/data/mockData";
import { normalizeStatus } from "@/lib/vrc-status";

/** Payload of a friend-* event relayed by the API from VRChat's pipeline (already trimmed server-side). */
export interface FriendEventPayload {
  userId?: string;
  location?: string;
  travelingToLocation?: string;
  platform?: string;
  user?: {
    displayName?: string;
    status?: string;
    statusDescription?: string;
    bio?: string;
    currentAvatarImageUrl?: string;
    currentAvatarThumbnailImageUrl?: string;
    last_login?: string;
  };
}

/**
 * Applies one live event to the cached friend list.
 * `refetch` is true when the event can't be applied locally (a new friend, a friend we don't know yet),
 * so the caller should reload the list from the REST API.
 */
export function applyFriendEvent(friends: Friend[], type: string, payload: FriendEventPayload): { friends: Friend[]; refetch: boolean } {
  const id = payload.userId;
  if (!id) return { friends, refetch: false };
  if (type === "friend-delete") return { friends: friends.filter(friend => friend.id !== id), refetch: false };

  const index = friends.findIndex(friend => friend.id === id);
  if (index < 0) return { friends, refetch: type !== "friend-offline" };

  const friend: Friend = { ...friends[index] };
  const user = payload.user;
  if (user) {
    if (user.displayName) friend.name = user.displayName;
    const avatar = user.currentAvatarThumbnailImageUrl || user.currentAvatarImageUrl;
    if (avatar) friend.avatar = avatar;
    const status = normalizeStatus(user.status);
    if (status && status !== "offline") friend.status = status;
    if (user.statusDescription !== undefined || user.bio !== undefined) {
      if (user.bio !== undefined) friend.bio = user.bio || undefined;
      friend.lastMessage = user.statusDescription || user.bio || friend.bio || "No status";
    }
    if (user.last_login) friend.lastLogin = user.last_login;
  }

  switch (type) {
    case "friend-online":
      friend.online = true;
      friend.onWeb = false;
      if (payload.location) friend.location = payload.location;
      break;
    case "friend-active":
      friend.online = false;
      friend.onWeb = true;
      friend.location = "offline";
      break;
    case "friend-offline":
      friend.online = false;
      friend.onWeb = false;
      friend.location = "offline";
      friend.lastLogin = new Date().toISOString();
      break;
    case "friend-location":
      if (payload.location) {
        friend.location = payload.location;
        friend.online = payload.location !== "offline";
        if (friend.online) friend.onWeb = false;
      }
      break;
    case "friend-add":
    case "friend-update":
    default:
      break;
  }

  const next = friends.slice();
  next[index] = friend;
  return { friends: next, refetch: false };
}

/** Splits a Server-Sent Events text buffer into complete events; returns what is left over. */
export function parseSseChunk(buffer: string): { events: { event: string; data: string }[]; rest: string } {
  const events: { event: string; data: string }[] = [];
  const text = buffer.replace(/\r\n/g, "\n");
  let start = 0;
  let end: number;
  while ((end = text.indexOf("\n\n", start)) >= 0) {
    const block = text.slice(start, end);
    start = end + 2;
    let event = "message";
    const data: string[] = [];
    for (const line of block.split("\n")) {
      if (!line || line.startsWith(":")) continue; // comment / heartbeat
      const colon = line.indexOf(":");
      const field = colon < 0 ? line : line.slice(0, colon);
      const value = colon < 0 ? "" : line.slice(colon + 1).replace(/^ /, "");
      if (field === "event") event = value;
      else if (field === "data") data.push(value);
    }
    if (data.length) events.push({ event, data: data.join("\n") });
  }
  return { events, rest: text.slice(start) };
}
