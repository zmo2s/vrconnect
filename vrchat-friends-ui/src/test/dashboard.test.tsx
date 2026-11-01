import { fireEvent, render, screen, cleanup, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Index from "@/pages/Index";

beforeEach(() => localStorage.clear());
afterEach(cleanup);
function dashboard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Index /></MemoryRouter></QueryClientProvider>);
}
describe("friends dashboard", () => {
  it("labels sample data and searches friends and worlds", () => {
    dashboard();
    expect(screen.getByText("Sample friends · preview only")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Search friends" }), { target: { value: "luna" } });
    expect(screen.getByRole("button", { name: "Luna" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "NeonFox" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Search friends" }), { target: { value: "Sunset Rooftop" } });
    expect(screen.getByRole("button", { name: "NeonFox" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Kitsune" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Search friends" }), { target: { value: "no matching friend" } });
    expect(screen.getByText("No friends here yet")).toBeInTheDocument();
  });
  it("persists favorite changes and opens a friend profile", () => {
    dashboard();
    fireEvent.click(screen.getByRole("button", { name: "Favorite Luna" }));
    expect(JSON.parse(localStorage.getItem("vrc-favorites")!)).toEqual(["sample-0"]);
    fireEvent.click(screen.getByRole("button", { name: "Luna" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Saved to favorites" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Saved to favorites" }));
    expect(JSON.parse(localStorage.getItem("vrc-favorites")!)).toEqual([]);
  });
  it("keeps private locations private and disables fictional world links", () => {
    dashboard();
    fireEvent.click(screen.getByRole("button", { name: "Mochi" }));
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByRole("heading", { name: "Private location" })).toBeInTheDocument();
    expect(dialog.queryByRole("link", { name: /Open instance/ })).not.toBeInTheDocument();
    expect(dialog.queryByRole("link", { name: /View world/ })).not.toBeInTheDocument();
  });
  it("filters to friends in the selected instance and clears the filter", () => {
    Element.prototype.scrollIntoView = () => {};
    dashboard();
    fireEvent.click(screen.getByRole("button", { name: /Show 2 friends at Sunset Rooftop/ }));
    expect(screen.getByRole("button", { name: "Luna" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Kitsune" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear location filter" }));
    expect(screen.getByRole("button", { name: "Kitsune" })).toBeInTheDocument();
  });
});
it("collapses locations and opens the inbox from navigation", () => {
  dashboard();
  fireEvent.click(screen.getByRole("button", { name: "Hide locations" }));
  expect(screen.queryByRole("button", { name: /Show 2 friends at Sunset Rooftop/ })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Luna" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Show locations" }));
  expect(screen.getByRole("button", { name: /Show 2 friends at Sunset Rooftop/ })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Inbox" }));
  expect(screen.getByRole("dialog", { name: "Notifications" })).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Search notifications" })).toBeInTheDocument();
});


