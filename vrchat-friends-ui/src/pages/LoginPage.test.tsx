import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import LoginPage from "./LoginPage";

function renderLogin() {
  render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={["/login"]}><Routes><Route path="/login" element={<LoginPage />} /><Route path="/Index" element={<p>Connected dashboard</p>} /></Routes></MemoryRouter></QueryClientProvider>);
}
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); });

it("sends the login session with the email code even when cookies are blocked", async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ success: false, requiresTwoFactorAuth: ["emailOtp"] }), { status: 400, headers: { "X-VRChat-Session": "test-session" } }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: { id: "usr_test" } })));
  vi.stubGlobal("fetch", fetchMock);
  renderLogin();
  fireEvent.change(screen.getByLabelText("Username"), { target: { value: "testuser" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "testpassword" } });
  fireEvent.click(screen.getByRole("button", { name: "Connect VRChat" }));
  fireEvent.change(await screen.findByLabelText("Email verification code"), { target: { value: "123456" } });
  fireEvent.click(screen.getByRole("button", { name: "Verify & connect" }));
  await screen.findByText("Connected dashboard");
  expect(fetchMock.mock.calls[1][0]).toBe("http://localhost:5000/vrchat/2fa/email");
  expect(fetchMock.mock.calls[1][1].headers.get("X-VRChat-Session")).toBe("test-session");
  expect(fetchMock.mock.calls[1][1].credentials).toBe("include");
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ code: "123456" });
});

it("continues a saved session without entering credentials", async () => {
  localStorage.setItem("vrchat-api-session", "remembered-session");
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, data: { id: "usr_test" } })));
  vi.stubGlobal("fetch", fetchMock);
  renderLogin();
  fireEvent.click(screen.getByRole("button", { name: "Continue saved login" }));
  await screen.findByText("Connected dashboard");
  expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:5000/vrchat/resume");
  expect(fetchMock.mock.calls[0][1].headers.get("X-VRChat-Session")).toBe("remembered-session");
});
