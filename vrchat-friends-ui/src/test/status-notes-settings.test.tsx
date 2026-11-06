import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Index from "@/pages/Index";
import { normalizeStatus } from "@/lib/vrc-status";

beforeEach(() => localStorage.clear());
afterEach(cleanup);
function dashboard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter><Index /></MemoryRouter></QueryClientProvider>);
}

describe("VRChat status", () => {
  it("understands strings, enum names and enum numbers", () => {
    expect(normalizeStatus("join me")).toBe("joinme");
    expect(normalizeStatus("JoinMe")).toBe("joinme");
    expect(normalizeStatus("ask me")).toBe("askme");
    // VRChat.API UserStatus: Active = 1, AskMe = 2, Busy = 3, JoinMe = 4, Offline = 5
    expect(normalizeStatus(4)).toBe("joinme");
    expect(normalizeStatus(3)).toBe("busy");
    expect(normalizeStatus(2)).toBe("askme");
    expect(normalizeStatus(1)).toBe("active");
    expect(normalizeStatus("nonsense")).toBeUndefined();
    expect(normalizeStatus(null)).toBeUndefined();
  });
  it("shows statuses and last seen in the list", () => {
    dashboard();
    expect(screen.getAllByText("Join me").length).toBeGreaterThan(0);
    expect(screen.getByText("Do not disturb")).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole("tab", { name: /All/ }));
    expect(screen.getByText(/Offline · last seen 3 hours ago/)).toBeInTheDocument();
  });
});

describe("private notes", () => {
  it("saves a note, marks the friend and makes it searchable", () => {
    dashboard();
    fireEvent.click(screen.getByRole("button", { name: "Kitsune" }));
    fireEvent.change(within(screen.getByRole("dialog")).getByLabelText("PRIVATE NOTE"), { target: { value: "Met at the jazz club" } });
    expect(JSON.parse(localStorage.getItem("vrconnect-notes")!)).toEqual({ "sample-2": "Met at the jazz club" });
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.getByLabelText("Has a private note")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Search friends" }), { target: { value: "jazz" } });
    expect(screen.getByRole("button", { name: "Kitsune" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Luna" })).not.toBeInTheDocument();
  });
});

describe("settings", () => {
  it("switches to the compact list and remembers it", () => {
    dashboard();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(screen.getByRole("switch", { name: "Compact list" }));
    expect(JSON.parse(localStorage.getItem("vrconnect-settings")!).compact).toBe(true);
    expect(document.querySelector(".friend-collection.is-compact")).not.toBeNull();
  });
});
