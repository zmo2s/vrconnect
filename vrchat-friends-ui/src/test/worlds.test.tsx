import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { getWorldDetails, worldPictureUrl } from "@/data/worlds";
import WorldPicture from "@/components/worlds/WorldPicture";
import Index from "@/pages/Index";
const worldId = "wrld_00000000-0000-0000-0000-000000000001";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

describe("world pictures", () => {
  it("uses the thumbnail and falls back to the main image", () => {
    expect(worldPictureUrl({ id: worldId, name: "Garden", thumbnailImageUrl: "https://example.com/thumb.png", imageUrl: "https://example.com/full.png" })).toBe("https://example.com/thumb.png");
    expect(worldPictureUrl({ id: worldId, name: "Garden", thumbnailImageUrl: "invalid", imageUrl: "https://example.com/full.png" })).toBe("https://example.com/full.png");
  });
  it("rejects hidden locations before making a request", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    await expect(getWorldDetails("private")).rejects.toThrow("Invalid world ID");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("shows an unavailable state for a broken image and recovers when its URL changes", () => {
    const { rerender } = render(<WorldPicture src="https://example.com/broken.png" name="Garden" />);
    fireEvent.error(screen.getByRole("img", { name: "Garden world preview" }));
    expect(screen.getByRole("img", { name: "World picture unavailable" })).toBeInTheDocument();
    rerender(<WorldPicture src="https://example.com/new.png" name="Garden" />);
    expect(screen.getByRole("img", { name: "Garden world preview" })).toHaveAttribute("src", "https://example.com/new.png");
  });
  it("loads a real world picture once for friends sharing the same world", async () => {
    localStorage.setItem("token", "test-token");
    const fetchMock = vi.fn(async (url: string) => {
      const data = url.includes("/worlds/") ? { id: worldId, name: "Real world name", thumbnailImageUrl: "https://example.com/world.png" }
        : url.includes("offline=true") ? [] : [
          { id: "usr_one", displayName: "One", location: `${worldId}:123` },
          { id: "usr_two", displayName: "Two", location: `${worldId}:456` },
          { id: "usr_private", displayName: "Hidden", location: "private" },
        ];
      return new Response(JSON.stringify({ success: true, data }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter><Index /></MemoryRouter></QueryClientProvider>);
    const images = await screen.findAllByRole("img", { name: "Real world name world preview" });
    expect(images).toHaveLength(2);
    images.forEach(image => expect(image).toHaveAttribute("src", "https://example.com/world.png"));
    expect(fetchMock.mock.calls.filter(([url]) => url.includes("/worlds/"))).toHaveLength(1);
    cleanup(); client.clear();
  });
});

it("loads live notifications after a session-based sign in without a JWT", async () => {
  localStorage.setItem("vrchat-session", "connected");
  const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify({ success: true, data: url.includes("/notifications") ? { items: [], warnings: [] } : [] })));
  vi.stubGlobal("fetch", fetchMock);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter><Index /></MemoryRouter></QueryClientProvider>);
  await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.includes("/notifications"))).toBe(true));
  cleanup(); client.clear();
});

