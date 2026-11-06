import { describe, expect, it } from "vitest";
import { diffActivity, minutesOnlineToday, parseActivity, pruneActivity, type ActivityEvent } from "@/lib/activity";
import type { Friend } from "@/data/mockData";

const world = (n: number, access = "") => `wrld_00000000-0000-0000-0000-00000000000${n}:${100 + n}${access}~region(eu)`;
const f = (id: string, location: string, extra: Partial<Friend> = {}): Friend => ({
  id, name: id.toUpperCase(), location, online: location !== "offline", avatar: "", lastMessage: "", lastMessageTime: "", unread: 0, ...extra,
});

describe("activity timeline", () => {
  it("records nothing on the first snapshot", () => {
    expect(diffActivity([], [f("a", world(1))])).toEqual([]);
  });

  it("records coming online, moving, going private, status and going offline", () => {
    const at = new Date("2026-11-05T10:00:00Z");
    const events = diffActivity(
      [f("a", "offline"), f("b", world(1)), f("c", world(1)), f("d", world(2), { status: "active" }), f("e", world(3))],
      [f("a", world(1), { worldName: "Rooftop" }), f("b", world(2), { worldName: "Garden" }), f("c", "private"), f("d", world(2), { status: "busy" }), f("e", "offline")],
      at,
    );
    expect(events.map(e => [e.friendId, e.kind])).toEqual([["a", "online"], ["b", "moved"], ["c", "private"], ["d", "status"], ["e", "offline"]]);
    expect(events[0].place).toBe("Rooftop");
    expect(events[1].placeKey).toBe(world(2));
    expect(events[3].detail).toBe("Do not disturb");
    expect(events.every(e => e.at === at.toISOString())).toBe(true);
  });

  it("ignores transient 'changing worlds' and unchanged friends", () => {
    expect(diffActivity([f("a", world(1)), f("b", world(1))], [f("a", "traveling"), f("b", world(1))])).toEqual([]);
  });

  it("keeps 14 days, newest first, and drops malformed stored data", () => {
    const now = Date.parse("2026-11-05T12:00:00Z");
    const ev = (id: string, daysAgo: number): ActivityEvent => ({ id, friendId: "a", friendName: "A", kind: "online", at: new Date(now - daysAgo * 864e5).toISOString() });
    expect(pruneActivity([ev("old", 20), ev("mid", 3), ev("new", 0)], now).map(e => e.id)).toEqual(["new", "mid"]);
    expect(parseActivity('[{"id":1},{"id":"x","friendId":"a","friendName":"A","kind":"online","at":"2026-11-05T10:00:00Z"}]')).toHaveLength(1);
    expect(parseActivity("not json")).toEqual([]);
  });

  it("estimates time online today from observed sessions", () => {
    const now = new Date(2026, 10, 5, 12, 0);
    const at = (h: number, m = 0) => new Date(2026, 10, 5, h, m).toISOString();
    const events: ActivityEvent[] = [
      { id: "1", friendId: "a", friendName: "A", kind: "online", at: at(9) },
      { id: "2", friendId: "a", friendName: "A", kind: "offline", at: at(10, 30) },
      { id: "3", friendId: "a", friendName: "A", kind: "online", at: at(11, 30) },
    ];
    expect(minutesOnlineToday(events, "a", true, now)).toBe(120);
    expect(minutesOnlineToday(events, "b", true, now)).toBeNull();
  });
});

it("fills in world names that loaded after the event was recorded", async () => {
  const { applyWorldNames } = await import("@/lib/activity");
  const events: ActivityEvent[] = [{ id: "1", friendId: "a", friendName: "A", kind: "moved", at: "2026-11-05T10:00:00Z", place: "World 00000000", worldId: "wrld_x" }];
  const named = applyWorldNames(events, new Map([["wrld_x", "Movie & Chill"]]));
  expect(named[0].place).toBe("Movie & Chill");
  expect(applyWorldNames(named, new Map([["wrld_x", "Movie & Chill"]]))).toBe(named);
});
