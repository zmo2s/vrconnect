import { describe, expect, it } from "vitest";
import { diffPresence } from "@/lib/presence-changes";
import type { Friend } from "@/data/mockData";

const world = (n: number) => `wrld_00000000-0000-0000-0000-00000000000${n}:1234~region(eu)`;
const friend = (id: string, location: string, worldName?: string): Friend => ({
  id, name: id.toUpperCase(), location, worldName, online: location !== "offline", avatar: "", lastMessage: "", lastMessageTime: "", unread: 0,
});

describe("favorite presence alerts", () => {
  it("stays silent on the first snapshot", () => {
    expect(diffPresence([], [friend("a", world(1))], ["a"])).toEqual([]);
  });
  it("reports a favorite coming online with their world", () => {
    const events = diffPresence([friend("a", "offline")], [friend("a", world(1), "Rooftop")], ["a"]);
    expect(events).toEqual([{ friendId: "a", title: "A is online", message: "Now in Rooftop." }]);
  });
  it("reports a favorite moving to another instance", () => {
    const events = diffPresence([friend("a", world(1), "Rooftop")], [friend("a", world(2), "Garden")], ["a"]);
    expect(events[0].title).toBe("A moved");
    expect(events[0].message).toContain("Garden");
  });
  it("ignores friends that are not favorites and unchanged favorites", () => {
    expect(diffPresence([friend("a", "offline"), friend("b", world(1))], [friend("a", world(1)), friend("b", world(1))], ["b"])).toEqual([]);
  });
  it("does not announce moves into private locations", () => {
    expect(diffPresence([friend("a", world(1))], [friend("a", "private")], ["a"])).toEqual([]);
  });
});
