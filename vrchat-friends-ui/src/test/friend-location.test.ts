import { describe, expect, it } from "vitest";
import { getFriendLocation } from "@/lib/friend-location";
const world = "wrld_00000000-0000-0000-0000-000000000001";
describe("VRChat locations", () => {
  it.each([['private', 'private'], ['offline', 'offline'], ['traveling', 'traveling'], ['traveling:traveling', 'traveling'], ['', 'unknown'], ['not-a-world', 'unknown']])("handles %s without inventing a destination", (location, kind) => {
    const result = getFriendLocation({ location, worldName: "An old world" });
    expect(result.kind).toBe(kind);
    expect(result.worldUrl).toBeUndefined();
    expect(result.instanceUrl).toBeUndefined();
    expect(result.title).not.toBe("An old world");
  });
  it("preserves the entire shared instance in an encoded VRChat link", () => {
    const instance = "12345~hidden(usr_test)~region(eu)~nonce(secret-value)";
    const result = getFriendLocation({ location: `${world}:${instance}`, worldName: "Garden" });
    expect(result).toMatchObject({ title: "Garden", access: "Friends+", region: "Europe", instanceNumber: "12345" });
    const url = new URL(result.instanceUrl!);
    expect(url.origin).toBe("https://vrchat.com");
    expect(url.searchParams.get("instanceId")).toBe(instance);
    expect(url.searchParams.get("worldId")).toBe(world);
  });
  it("keeps separate instances in separate groups", () => {
    expect(getFriendLocation({ location: `${world}:123` }).key).not.toEqual(getFriendLocation({ location: `${world}:456` }).key);
  });
  it("does not invent instance access or a join link for a world alone", () => {
    expect(getFriendLocation({ location: world })).toMatchObject({ kind: "world", access: undefined, instanceUrl: undefined });
  });
  it("recognizes group and invite instance restrictions", () => {
    expect(getFriendLocation({ location: `${world}:123~group(grp_test)~groupAccessType(members)` }).access).toBe("Group");
    expect(getFriendLocation({ location: `${world}:123~private(usr_test)~canRequestInvite` }).access).toBe("Invite+");
  });
});
