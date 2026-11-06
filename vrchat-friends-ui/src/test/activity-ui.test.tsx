import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it } from "vitest";
import Index from "@/pages/Index";

beforeEach(() => localStorage.clear());
afterEach(cleanup);
function dashboard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter><Index /></MemoryRouter></QueryClientProvider>);
}

it("opens the activity timeline grouped by day, filters it and jumps to a friend", () => {
  dashboard();
  fireEvent.click(screen.getByRole("button", { name: "Activity" }));
  const panel = within(screen.getByRole("dialog", { name: "Activity" }));
  expect(panel.getByRole("region", { name: "Today" })).toBeInTheDocument();
  expect(panel.getByRole("region", { name: "Yesterday" })).toBeInTheDocument();
  expect(panel.getAllByText(/joined Sunset Rooftop/, { selector: "p" })).toHaveLength(2);
  fireEvent.click(panel.getByRole("button", { name: "Online / offline" }));
  expect(panel.queryByText(/joined Sunset Rooftop/)).not.toBeInTheDocument();
  fireEvent.change(panel.getByRole("textbox", { name: "Search activity" }), { target: { value: "yuki" } });
  fireEvent.click(panel.getAllByRole("button", { name: "Yuki" })[0]);
  expect(screen.getByRole("heading", { name: "Yuki" })).toBeInTheDocument();
});

it("shows a friend's recent activity in their profile", () => {
  dashboard();
  fireEvent.click(screen.getByRole("button", { name: "Luna" }));
  const profile = within(screen.getByRole("dialog"));
  expect(profile.getByText("Recent activity")).toBeInTheDocument();
  expect(profile.getByText(/joined Sunset Rooftop/)).toBeInTheDocument();
});
