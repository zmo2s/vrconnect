import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import FriendGroups from "@/components/friends/FriendGroups";
import { Friend } from "@/data/mockData";
import { BoopResult, sendBoop, sendBoopBatch } from "@/data/boops";
import { readGroups } from "@/lib/friend-groups";

const friends: Friend[] = ["Luna", "NeonFox"].map((name, i) => ({ id: `usr_${i}`, name, online: true, avatar: "", lastMessage: "", lastMessageTime: "", unread: 0 }));
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); });

describe("friend groups", () => {
  it("creates a group, reloads its members, and removes a member", () => {
    const first = render(<FriendGroups friends={friends} demo open onOpenChange={() => {}} />);
    fireEvent.change(screen.getByLabelText("Group name"), { target: { value: "Weekend crew" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Luna" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select NeonFox" }));
    fireEvent.click(screen.getByRole("button", { name: "Save group" }));
    expect(readGroups("vrconnect-groups-preview")[0].members).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Send boops" })).toBeDisabled();
    first.unmount();
    render(<FriendGroups friends={friends} demo open onOpenChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Weekend crew/ }));
    expect(screen.getByRole("checkbox", { name: "Select Luna" })).toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select NeonFox" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(readGroups("vrconnect-groups-preview")[0].members.map(member => member.name)).toEqual(["Luna"]);
  });
  it("only sends on the send button, and does not resend successful recipients", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ success: true })));
    vi.stubGlobal("fetch", fetchMock);
    render(<FriendGroups friends={friends} demo={false} open onOpenChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Select visible" }));
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Send boops" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("2 boops sent"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "Send boops" })).toBeDisabled();
  });
  it("preserves unloaded saved members without sending to them", () => {
    localStorage.setItem("vrconnect-groups", JSON.stringify([{ id: "g", name: "Crew", members: [{ id: "usr_missing", name: "Old friend" }] }]));
    render(<FriendGroups friends={friends} demo={false} open onOpenChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Crew/ }));
    expect(screen.getByText("Not loaded · excluded from boops")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send boops" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(readGroups("vrconnect-groups")[0].members[0].id).toBe("usr_missing");
  });
});

describe("boop delivery", () => {
  it("deduplicates recipients and stops at a rate limit", async () => {
    const sender = vi.fn(async (userId: string): Promise<BoopResult> => ({ userId, status: userId === "b" ? "failed" : "sent", message: "test", stop: userId === "b" }));
    const results = await sendBoopBatch(["a", "a", "b", "c"], () => {}, () => false, sender);
    expect(results.map(result => result.userId)).toEqual(["a", "b"]);
    expect(sender).toHaveBeenCalledTimes(2);
  });
  it("cancels between sends", async () => {
    let stopped = false;
    const sender = vi.fn(async (userId: string): Promise<BoopResult> => ({ userId, status: "sent", message: "sent", stop: false }));
    await sendBoopBatch(["a", "b"], () => { stopped = true; }, () => stopped, sender);
    expect(sender).toHaveBeenCalledTimes(1);
  });
  it("does not retry ambiguous network failures", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network")); vi.stubGlobal("fetch", fetchMock);
    expect(await sendBoop("usr_one")).toMatchObject({ status: "unknown", stop: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("respects the server rate-limit response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: false, error: "Slow down" }), { status: 429 })));
    expect(await sendBoop("usr_one")).toMatchObject({ status: "failed", message: "Slow down", stop: true });
  });
});
