// Keep the opaque API session in this browser; VRChat credentials stay on the server.
const sessionKey = "vrchat-api-session";

// Use environment variable VITE_API_URL, fallback to localhost for development
export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

export async function vrchatFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers);
  const session = localStorage.getItem(sessionKey);
  if (session) headers.set("X-VRChat-Session", session);
  const response = await fetch(url, { ...options, headers, credentials: "include" });
  // Login challenges return HTTP 400, but still establish a session.
  const nextSession = response.headers.get("X-VRChat-Session");
  if (nextSession) localStorage.setItem(sessionKey, nextSession);
  return response;
}

export function hasRememberedLogin() {
  return Boolean(localStorage.getItem(sessionKey));
}

export async function forgetLogin() {
  const response = await vrchatFetch(`${API_URL}/vrchat/logout`, { method: "POST" });
  if (!response.ok) throw new Error("Could not sign out. Please try again.");
  localStorage.removeItem(sessionKey);
  localStorage.removeItem("userId");
}
