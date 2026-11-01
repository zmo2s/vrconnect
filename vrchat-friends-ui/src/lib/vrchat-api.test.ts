import { afterEach, expect, it, vi } from "vitest";
import { vrchatFetch } from "./vrchat-api";

afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

it("carries a login challenge session to email verification and friends without cookies", async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ requiresTwoFactorAuth: ["emailOtp"] }), {
      status: 400, headers: { "X-VRChat-Session": "opaque-session" },
    }))
    .mockResolvedValue(new Response("{}"));
  vi.stubGlobal("fetch", fetchMock);
  await vrchatFetch("/vrchat/login", { method: "POST" });
  await vrchatFetch("/vrchat/2fa/email", { method: "POST", headers: { "Content-Type": "application/json" } });
  await vrchatFetch("/vrchat/friends");
  for (const index of [1, 2]) {
    expect(fetchMock.mock.calls[index][1].headers.get("X-VRChat-Session")).toBe("opaque-session");
  }
  expect(fetchMock.mock.calls[1][1].headers.get("Content-Type")).toBe("application/json");
});

it("replaces an expired session when the API establishes a new one", async () => {
  localStorage.setItem("vrchat-api-session", "expired-session");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", {
    headers: { "X-VRChat-Session": "new-session" },
  })));
  await vrchatFetch("/vrchat/login", { method: "POST" });
  expect(localStorage.getItem("vrchat-api-session")).toBe("new-session");
});

