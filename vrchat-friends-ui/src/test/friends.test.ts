import { afterEach, describe, expect, it, vi } from "vitest";
import { getFriends } from "@/data/mockData";

afterEach(() => vi.unstubAllGlobals());

describe("getFriends", () => {
  it("maps friends without an imageUrl field", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      data: [{ id: "usr_test", displayName: "Friend", location: "private",
        currentAvatarThumbnailImageUrl: "https://example.com/avatar.png" }],
    }))));
    expect(await getFriends()).toEqual([expect.objectContaining({
      id: "usr_test", name: "Friend", online: true,
      avatar: "https://example.com/avatar.png",
    })]);
  });

  it.each([200, 400])("preserves the API error for HTTP %s", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: false, data: null, error: "Friends unavailable",
    }), { status })));
    await expect(getFriends()).rejects.toThrow("Friends unavailable");
  });

  it("accepts an empty friends list", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true, data: [],
    }))));
    expect(await getFriends()).toEqual([]);
  });
});

it("keeps shared location data for the interface", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, data: [{ id: "usr_test", displayName: "Friend", location: "private" }] }))));
  expect(await getFriends()).toEqual([expect.objectContaining({ location: "private" })]);
});
it("requests offline friends through the API offline parameter", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, data: [] })));
  vi.stubGlobal("fetch", fetchMock);
  await getFriends(false);
  expect(fetchMock.mock.calls[0][0]).toContain("offline=true");
});
