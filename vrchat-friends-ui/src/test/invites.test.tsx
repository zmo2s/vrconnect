import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import ReachOut from "@/components/friends/ReachOut";
import { sendInvite } from "@/data/invites";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
function renderReachOut(props: Partial<Parameters<typeof ReachOut>[0]> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><ReachOut friendId="usr_1" friendName="Luna" online demo={false} {...props} /></QueryClientProvider>);
}

it("sends a request invite with a custom message", async () => {
  const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => url.includes("invite-messages")
    ? json({ success: true, data: [{ slot: 0, message: "Can I join?", cooldownMinutes: 0 }] })
    : json({ success: true }));
  vi.stubGlobal("fetch", fetchMock);
  const notify = vi.fn();
  renderReachOut({ onNotify: notify });
  fireEvent.click(screen.getByRole("button", { name: /Request invite/ }));
  fireEvent.change(screen.getByRole("textbox", { name: "Request message" }), { target: { value: "  Room for one more?  " } });
  fireEvent.click(screen.getByRole("button", { name: /Send request/ }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Invite request sent"));
  const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/request-invite"))!;
  expect(call[0]).toBe("http://localhost:5000/vrchat/friends/usr_1/request-invite");
  expect(JSON.parse((call[1] as RequestInit).body as string)).toEqual({ message: "Room for one more?", slot: null });
  expect(notify).toHaveBeenCalledWith(expect.objectContaining({ kind: "success" }));
});

it("offers saved messages as one-tap choices", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => json({ success: true, data: [{ slot: 3, message: "Come hang out!", cooldownMinutes: 0 }] })));
  renderReachOut();
  fireEvent.click(await screen.findByRole("button", { name: "Come hang out!" }));
  expect(screen.getByRole("textbox", { name: "Invite message" })).toHaveValue("Come hang out!");
});

it("explains why an invite failed (not in a world)", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => json({ success: false, error: "Join a world in VRChat first: an invite brings your friend to the instance you're in." }, 409)));
  const result = await sendInvite("usr_1", "invite");
  expect(result).toEqual({ ok: false, uncertain: false, message: "Join a world in VRChat first: an invite brings your friend to the instance you're in." });
});

it("is disabled in preview mode", () => {
  renderReachOut({ demo: true });
  expect(screen.getByRole("button", { name: /Send invite/ })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Boop Luna" })).toBeDisabled();
});

it("uses the dedicated invite endpoint for invites", async () => {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json({ success: true }));
  vi.stubGlobal("fetch", fetchMock);
  const result = await sendInvite("usr_1", "invite", "Come hang out!");
  expect(result.ok).toBe(true);
  expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:5000/vrchat/friends/usr_1/invite");
  expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).toEqual({ message: "Come hang out!", slot: null });
});
