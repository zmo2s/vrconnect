import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Index from "@/pages/Index";

beforeEach(() => { localStorage.clear(); Element.prototype.scrollIntoView = () => {}; });
afterEach(cleanup);
function dashboard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter><Index /></MemoryRouter></QueryClientProvider>);
}

describe("dashboard ergonomics", () => {
  it("focuses search with / and clears it with Escape", () => {
    dashboard();
    const search = screen.getByRole("textbox", { name: "Search friends" });
    fireEvent.keyDown(window, { key: "/" });
    expect(search).toHaveFocus();
    fireEvent.change(search, { target: { value: "luna" } });
    expect(screen.queryByRole("button", { name: "NeonFox" })).not.toBeInTheDocument();
    fireEvent.keyDown(search, { key: "Escape" });
    expect(search).toHaveValue("");
    expect(screen.getByRole("button", { name: "NeonFox" })).toBeInTheDocument();
  });

  it("filters to private friends from the stat tile and clears it", () => {
    dashboard();
    fireEvent.click(screen.getByRole("button", { name: /1 in private/ }));
    expect(screen.getByRole("button", { name: "Mochi" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Luna" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear place filter" }));
    expect(screen.getByRole("button", { name: "Luna" })).toBeInTheDocument();
  });

  it("remembers the chosen tab and layout across reloads", () => {
    dashboard();
    fireEvent.click(screen.getByRole("button", { name: "Grid view" }));
    fireEvent.click(screen.getByRole("button", { name: "Hide locations" }));
    cleanup();
    dashboard();
    expect(screen.getByRole("button", { name: "Grid view" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Show locations" })).toBeInTheDocument();
  });

  it("does not offer join links for fictional preview worlds", () => {
    dashboard();
    expect(screen.queryByRole("link", { name: /Join Luna/ })).not.toBeInTheDocument();
  });
});

describe("power-user tools", () => {
  it("opens the quick-jump palette with Ctrl+K and jumps to a friend profile", async () => {
    dashboard();
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const input = await screen.findByPlaceholderText(/Jump to a friend/);
    fireEvent.change(input, { target: { value: "kitsune" } });
    fireEvent.click(await screen.findByRole("option", { name: /Kitsune/ }));
    expect(await screen.findByRole("heading", { name: "Kitsune" })).toBeInTheDocument();
  });

  it("groups friends by place when sorting by place", async () => {
    dashboard();
    fireEvent.mouseDown(screen.getByRole("tab", { name: /All/ }));
    fireEvent.click(screen.getByRole("combobox", { name: "Sort friends" }));
    fireEvent.click(await screen.findByRole("option", { name: "By place" }));
    expect(screen.getByText("Sunset Rooftop · #84210 · 2")).toBeInTheDocument();
    expect(screen.getByText("Offline · 1")).toBeInTheDocument();
  });

  it("offers a right-click menu on friends", async () => {
    dashboard();
    fireEvent.contextMenu(screen.getByRole("button", { name: "Luna" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Add to favorites" }));
    expect(JSON.parse(localStorage.getItem("vrc-favorites")!)).toEqual(["sample-0"]);
  });
});

it("offers a skip link that moves focus to the friends search", () => {
  dashboard();
  const link = screen.getByRole("link", { name: "Skip to friends list" });
  fireEvent.click(link);
  expect(screen.getByRole("textbox", { name: "Search friends" })).toHaveFocus();
});

it("offers matches from other tabs when the current tab has none", () => {
  dashboard();
  fireEvent.change(screen.getByRole("textbox", { name: "Search friends" }), { target: { value: "yuki" } });
  fireEvent.click(screen.getByRole("button", { name: "Show 1 match in all friends" }));
  expect(screen.getByRole("button", { name: "Yuki" })).toBeInTheDocument();
});
