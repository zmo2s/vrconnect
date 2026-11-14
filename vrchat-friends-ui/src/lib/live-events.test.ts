import { describe, expect, it } from "vitest";
import type { Friend } from "@/data/mockData";
import { applyFriendEvent, parseSseChunk } from "./live-events";

const base: Friend = { id: "usr_a", name: "Léa", avatar: "a.png", online: false, onWeb: false, location: "offline", lastMessage: "", lastMessageTime: "", unread: 0, status: "active" };

describe("applyFriendEvent", () => {
  it("marks a friend online in their world", () => {
    const { friends, refetch } = applyFriendEvent([base], "friend-online", { userId: "usr_a", location: "wrld_x:1~friends", user: { status: "join me" } });
    expect(refetch).toBe(false);
    expect(friends[0]).toMatchObject({ online: true, onWeb: false, location: "wrld_x:1~friends", status: "joinme" });
  });

  it("moves a friend to the website and offline", () => {
    const web = applyFriendEvent([{ ...base, online: true }], "friend-active", { userId: "usr_a" }).friends[0];
    expect(web).toMatchObject({ online: false, onWeb: true });
    const off = applyFriendEvent([web], "friend-offline", { userId: "usr_a" }).friends[0];
    expect(off).toMatchObject({ online: false, onWeb: false, location: "offline" });
    expect(off.lastLogin).toBeTruthy();
  });

  it("updates location and profile fields without touching other friends", () => {
    const other = { ...base, id: "usr_b" };
    const list = [base, other];
    const { friends } = applyFriendEvent(list, "friend-location", { userId: "usr_a", location: "wrld_y:2" });
    expect(friends[0].location).toBe("wrld_y:2");
    expect(friends[1]).toBe(other);
    const updated = applyFriendEvent(friends, "friend-update", { userId: "usr_a", user: { displayName: "Léa ✨", statusDescription: "chill" } }).friends[0];
    expect(updated).toMatchObject({ name: "Léa ✨", lastMessage: "chill" });
  });

  it("asks for a reload for unknown friends and removes deleted ones", () => {
    expect(applyFriendEvent([base], "friend-online", { userId: "usr_new" }).refetch).toBe(true);
    expect(applyFriendEvent([base], "friend-add", { userId: "usr_new" }).refetch).toBe(true);
    expect(applyFriendEvent([base], "friend-delete", { userId: "usr_a" }).friends).toEqual([]);
  });
});

describe("parseSseChunk", () => {
  it("parses complete events, skips heartbeats and keeps partial data", () => {
    const { events, rest } = parseSseChunk(": ping\n\nevent: status\ndata: {\"connected\":true}\n\nevent: friend-on");
    expect(events).toEqual([{ event: "status", data: "{\"connected\":true}" }]);
    expect(rest).toBe("event: friend-on");
  });
});
