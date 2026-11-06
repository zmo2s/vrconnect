import type { Friend } from "@/data/mockData";
import { getFriendLocation } from "@/lib/friend-location";

export interface PresenceEvent { friendId: string; title: string; message: string; }

/**
 * Compares two snapshots of the friends list and reports what changed for the watched
 * friends (favorites): coming online, or moving to a different shared world/instance.
 * Friends missing from the previous snapshot are ignored, so the first load is silent.
 */
export function diffPresence(previous: Friend[], next: Friend[], watched: string[]): PresenceEvent[] {
  if (!previous.length || !watched.length) return [];
  const before = new Map(previous.map(friend => [friend.id, friend]));
  const events: PresenceEvent[] = [];
  for (const friend of next) {
    if (!watched.includes(friend.id)) continue;
    const old = before.get(friend.id);
    if (!old) continue;
    const now = getFriendLocation(friend);
    const then = getFriendLocation(old);
    if (!old.online && friend.online) {
      events.push({ friendId: friend.id, title: `${friend.name} is online`, message: now.kind === "world" ? `Now in ${now.title}.` : now.detail });
    } else if (old.online && friend.online && now.kind === "world" && now.key !== then.key) {
      events.push({ friendId: friend.id, title: `${friend.name} moved`, message: `Now in ${now.title}${now.access ? ` (${now.access})` : ""}.` });
    }
  }
  return events;
}
