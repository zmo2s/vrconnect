import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import NotificationCenter from "@/components/notifications/NotificationCenter";
import { useNotifications } from "@/hooks/use-notifications";
import { incomingToApp } from "@/data/notifications";

afterEach(() => { cleanup(); localStorage.clear(); });
function Harness({ demo = true }: { demo?: boolean }) {
  const inbox = useNotifications(demo);
  return <><button onClick={() => inbox.notify({ title: "Group saved", message: "Weekend crew is ready.", kind: "success" })}>Add activity</button><NotificationCenter items={inbox.items} readIds={inbox.readIds} dismissedIds={inbox.dismissedIds} onRead={inbox.markRead} onDismiss={inbox.dismiss} onRefresh={() => {}} loading={false} error={false} demo={demo} /></>;
}
describe("notification center", () => {
  it("updates the badge, marks read, and persists across reloads", async () => {
    const view = render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Add activity" }));
    fireEvent.click(screen.getByRole("button", { name: "Notifications, 1 unread" }));
    expect(screen.getByText("Weekend crew is ready.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Mark all read/ }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByRole("button", { name: "Notifications, 0 unread" })).toBeInTheDocument();
    view.unmount(); render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Notifications, 0 unread" }));
    expect(screen.getByText("Weekend crew is ready.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Unread" }));
    expect(screen.getByText("All caught up")).toBeInTheDocument();
  });
  it("dismisses an item without restoring it on remount", () => {
    const view = render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Add activity" }));
    fireEvent.click(screen.getByRole("button", { name: "Notifications, 1 unread" }));
    fireEvent.click(screen.getByRole("button", { name: "Dismiss Group saved" }));
    expect(screen.queryByText("Weekend crew is ready.")).not.toBeInTheDocument();
    view.unmount(); render(<Harness />);
    expect(screen.getByRole("button", { name: "Notifications, 0 unread" })).toBeInTheDocument();
  });
  it("keeps preview notifications separate from live activity", async () => {
    const view = render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Add activity" }));
    view.rerender(<Harness demo={false} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Notifications, 0 unread" })).toBeInTheDocument());
    view.rerender(<Harness demo />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Notifications, 1 unread" })).toBeInTheDocument());
  });
  it("maps incoming boops and preserves the remote seen state", () => {
    const result = incomingToApp({ id: "n1", type: "Boop", message: "Hello!", senderId: "usr_one", seen: true, createdAt: "2026-10-29T12:00:00Z" }, new Map([["usr_one", "Luna"]]));
    expect(result).toMatchObject({ id: "vrchat:n1", title: "Luna booped you", seen: true, source: "vrchat" });
  });
});


it("preserves full group announcements and translates group links", () => {
  const result = incomingToApp({ id: "group_notice", type: "group.announcement", title: "Tonight at 8", message: "Full announcement\nSecond paragraph", senderName: "Organizer", createdAt: "2026-10-30T00:00:00Z", seen: false, link: "group:grp_123", imageUrl: "https://example.com/banner.png", details: { groupName: "Weekend crew" } }, new Map());
  expect(result).toMatchObject({ title: "Tonight at 8", message: "Full announcement\nSecond paragraph", category: "group", typeLabel: "Group announcement", groupName: "Weekend crew", sender: "Organizer", href: "https://vrchat.com/home/group/grp_123", imageUrl: "https://example.com/banner.png" });
});
it("reads invitation details encoded as JSON", () => {
  const result = incomingToApp({ id: "invite", type: "invite", message: "Join us!", seen: false, createdAt: "2026-10-30T00:00:00Z", details: JSON.stringify({ worldName: "Garden", worldId: "wrld_test:123", inviteMessage: "We are by the lake." }) }, new Map());
  expect(result.category).toBe("invitation");
  expect(result.worldName).toBe("Garden");
  expect(result.message).toContain("We are by the lake.");
  expect(result.href).toBe("https://vrchat.com/home/world/wrld_test");
});
it("rejects script and external action links", () => {
  for (const link of ["javascript:alert(1)", "https://evil.example/home/group/grp_test", "https://vrchat.com.evil.example/home/group/grp_test"]) {
    expect(incomingToApp({ id: "x", type: "group.invite", title: "Invite", message: "hello", createdAt: "", seen: false, link }, new Map()).href).toBeUndefined();
  }
});
it("shows group invitations in the Groups filter", () => {
  const item = incomingToApp({ id: "g", type: "group.invite", title: "Join the crew", message: "An invitation", seen: false, createdAt: "2026-10-30T00:00:00Z", link: "group:grp_test" }, new Map());
  render(<NotificationCenter items={[item]} readIds={[]} dismissedIds={[]} onRead={() => {}} onDismiss={() => {}} onRefresh={() => {}} loading={false} error={false} demo={false} />);
  fireEvent.click(screen.getByRole("button", { name: "Notifications, 1 unread" }));
  fireEvent.click(screen.getByRole("button", { name: "Groups" }));
  expect(screen.getByText("Join the crew")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Open group in VRChat/ })).toHaveAttribute("href", "https://vrchat.com/home/group/grp_test");
  fireEvent.click(screen.getByRole("button", { name: "Boops" }));
  expect(screen.queryByText("Join the crew")).not.toBeInTheDocument();
});
it("searches the full notification message and clears the search", () => {
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Add activity" }));
  fireEvent.click(screen.getByRole("button", { name: "Notifications, 1 unread" }));
  const search = screen.getByRole("textbox", { name: "Search notifications" });
  fireEvent.change(search, { target: { value: "weekend" } });
  expect(screen.getByText("Weekend crew is ready.")).toBeInTheDocument();
  fireEvent.change(search, { target: { value: "missing person" } });
  expect(screen.queryByText("Weekend crew is ready.")).not.toBeInTheDocument();
  expect(screen.getByText("No matching notifications")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Clear notification search" }));
  expect(screen.getByText("Weekend crew is ready.")).toBeInTheDocument();
});
