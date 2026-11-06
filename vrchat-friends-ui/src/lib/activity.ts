import type { Friend } from "@/data/mockData";
import { getFriendLocation } from "@/lib/friend-location";
import { statusMeta, type VrcStatus } from "@/lib/vrc-status";

export type ActivityKind = "online" | "offline" | "moved" | "private" | "status";

export interface ActivityEvent {
  id: string;
  friendId: string;
  friendName: string;
  kind: ActivityKind;
  /** ISO timestamp of when the change was observed. */
  at: string;
  /** Human-readable place ("Midnight Rooftop", "Private location"…). */
  place?: string;
  /** Exact world+instance key, used to filter the list to that instance. */
  placeKey?: string;
  /** World ID, used to fill in the world name once it has loaded. */
  worldId?: string;
  /** Extra detail: access type, previous place, new status… */
  detail?: string;
}

const MAX_EVENTS = 2000;
const RETENTION_DAYS = 14;

function place(friend: Friend) {
  const location = getFriendLocation(friend);
  return { location, label: location.kind === "world" ? location.title : location.title };
}

/**
 * Turns two consecutive snapshots of the friends list into timeline events.
 * VRChat keeps no history, so the timeline is built from what this dashboard observes.
 * Friends absent from the previous snapshot are ignored (the first load records nothing).
 */
export function diffActivity(previous: Friend[], next: Friend[], at = new Date()): ActivityEvent[] {
  if (!previous.length) return [];
  const before = new Map(previous.map(friend => [friend.id, friend]));
  const when = at.toISOString();
  const events: ActivityEvent[] = [];
  const push = (friend: Friend, kind: ActivityKind, extra: Partial<ActivityEvent> = {}) =>
    events.push({ id: `${friend.id}:${kind}:${when}:${events.length}`, friendId: friend.id, friendName: friend.name, kind, at: when, ...extra });

  for (const friend of next) {
    const old = before.get(friend.id);
    if (!old) continue;
    const now = place(friend);
    const then = place(old);
    if (!old.online && friend.online) {
      push(friend, "online", now.location.kind === "world"
        ? { place: now.label, placeKey: now.location.key, worldId: now.location.worldId, detail: now.location.access }
        : { place: now.label });
      continue;
    }
    if (old.online && !friend.online) { push(friend, "offline", then.location.kind === "world" ? { place: then.label, worldId: then.location.worldId } : {}); continue; }
    if (!friend.online) continue;
    if (now.location.key !== then.location.key) {
      if (now.location.kind === "world") {
        push(friend, "moved", { place: now.label, placeKey: now.location.key, worldId: now.location.worldId, detail: now.location.access });
      } else if (now.location.kind === "private" && then.location.kind !== "private") {
        push(friend, "private", { place: now.label });
      }
      // "traveling" is a transient state between two worlds: not recorded.
    }
    if (old.status && friend.status && old.status !== friend.status && friend.status !== "offline") {
      push(friend, "status", { detail: statusMeta[friend.status as VrcStatus].label });
    }
  }
  return events;
}

/**
 * World names load after the friends list, so an event can be recorded with a placeholder
 * ("World 00000000"). Fills in real names once known; returns the same array if nothing changed.
 */
export function applyWorldNames(events: ActivityEvent[], names: Map<string, string>): ActivityEvent[] {
  let changed = false;
  const next = events.map(event => {
    const name = event.worldId ? names.get(event.worldId) : undefined;
    if (!name || event.place === name) return event;
    changed = true;
    return { ...event, place: name };
  });
  return changed ? next : events;
}

/** Keeps the log bounded: newest first, at most 2000 events and 14 days. */
export function pruneActivity(events: ActivityEvent[], now = Date.now()): ActivityEvent[] {
  const cutoff = now - RETENTION_DAYS * 864e5;
  return events
    .filter(event => Date.parse(event.at) >= cutoff)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, MAX_EVENTS);
}

const KINDS: ActivityKind[] = ["online", "offline", "moved", "private", "status"];
export function parseActivity(raw: string | null): ActivityEvent[] {
  try {
    const value: unknown = JSON.parse(raw || "[]");
    if (!Array.isArray(value)) return [];
    return value.filter((event): event is ActivityEvent =>
      !!event && typeof event.id === "string" && typeof event.friendId === "string" && typeof event.friendName === "string"
      && KINDS.includes(event.kind) && typeof event.at === "string" && Number.isFinite(Date.parse(event.at)));
  } catch { return []; }
}

/**
 * Approximate time online today, from observed online/offline events.
 * Returns minutes, or null when nothing was observed for this friend today.
 */
export function minutesOnlineToday(events: ActivityEvent[], friendId: string, onlineNow: boolean, now = new Date()): number | null {
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const mine = events.filter(event => event.friendId === friendId && (event.kind === "online" || event.kind === "offline") && Date.parse(event.at) >= start.getTime())
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  if (!mine.length) return null;
  let total = 0;
  let since: number | null = mine[0].kind === "offline" ? start.getTime() : null;
  for (const event of mine) {
    const t = Date.parse(event.at);
    if (event.kind === "online" && since === null) since = t;
    if (event.kind === "offline" && since !== null) { total += t - since; since = null; }
  }
  if (since !== null && onlineNow) total += now.getTime() - since;
  return Math.round(total / 60000);
}

/** Fictional history for preview mode, so the timeline can be explored without an account. */
export function sampleActivity(friends: Friend[], now = Date.now()): ActivityEvent[] {
  const byName = new Map(friends.map(friend => [friend.name, friend]));
  const worldByTitle = new Map(friends.flatMap(friend => { const l = getFriendLocation(friend); return l.kind === "world" && l.worldId ? [[l.title, l.worldId] as [string, string]] : []; }));
  const rows: [string, ActivityKind, number, string?, string?][] = [
    ["Luna", "moved", 4, "Sunset Rooftop", "Public"],
    ["NeonFox", "moved", 9, "Sunset Rooftop", "Public"],
    ["Mochi", "private", 16, "Private location"],
    ["Astro", "status", 22, undefined, "Join me"],
    ["Kitsune", "moved", 35, "The Floating Garden", "Friends+"],
    ["Cloudy", "online", 41, "The Floating Garden", "Friends+"],
    ["Yuki", "offline", 180, "Moonlight Café"],
    ["Pixel", "online", 230],
    ["Astro", "moved", 250, "Moonlight Café", "Friends"],
    ["Luna", "online", 26 * 60, "Moonlight Café", "Friends"],
    ["Yuki", "online", 27 * 60, "Moonlight Café", "Friends"],
    ["Kitsune", "offline", 29 * 60],
  ];
  return rows.flatMap(([name, kind, minutesAgo, placeName, detail], index) => {
    const friend = byName.get(name);
    if (!friend) return [];
    const location = getFriendLocation(friend);
    return [{
      id: `sample:${index}`, friendId: friend.id, friendName: friend.name, kind, at: new Date(now - minutesAgo * 60000).toISOString(),
      place: kind === "online" && !placeName && location.kind === "world" ? location.title : placeName,
      placeKey: placeName && placeName === location.title && location.kind === "world" ? location.key : undefined, detail,
      worldId: placeName ? worldByTitle.get(placeName) : undefined,
    }];
  });
}
