import { vrchatFetch } from "@/lib/vrchat-api";
import { normalizeStatus, type VrcStatus } from "@/lib/vrc-status";

const API = "http://localhost:5000";
const auth = (): HeadersInit => { const token = localStorage.getItem("token"); return token ? { Authorization: `Bearer ${token}` } : {}; };

/** VRChat limits the status message to 32 characters. */
export const MAX_STATUS_MESSAGE = 32;

export interface MyProfile {
  id: string;
  displayName: string;
  status: VrcStatus;
  statusDescription: string;
  statusHistory: string[];
  picture?: string;
}

export async function getMyProfile(): Promise<MyProfile> {
  const response = await vrchatFetch(`${API}/vrchat/me`, { headers: auth() });
  const body = await response.json().catch(() => null);
  const d = body?.data;
  if (!response.ok || !body?.success || !d) throw new Error(body?.error || "Your profile is unavailable");
  // ASP.NET may serialise properties as camelCase or PascalCase
  const pick = <T,>(camel: string, pascal: string): T | undefined => d[camel] ?? d[pascal];
  const picture = pick<string>("profilePicUrl", "ProfilePicUrl") || pick<string>("currentAvatarThumbnailImageUrl", "CurrentAvatarThumbnailImageUrl");
  return {
    id: pick<string>("id", "Id") || "",
    displayName: pick<string>("displayName", "DisplayName") || "You",
    status: normalizeStatus(pick("status", "Status")) ?? "active",
    statusDescription: pick<string>("statusDescription", "StatusDescription") || "",
    statusHistory: (pick<string[]>("statusHistory", "StatusHistory") || []).filter(s => typeof s === "string" && s.trim()),
    picture: picture && /^https:\/\//.test(picture) ? picture : undefined,
  };
}

export async function updateMyStatus(status: VrcStatus, statusDescription: string): Promise<void> {
  const response = await vrchatFetch(`${API}/vrchat/me/status`, {
    method: "POST",
    headers: { ...auth(), "Content-Type": "application/json" },
    body: JSON.stringify({ status, statusDescription: statusDescription.trim().slice(0, MAX_STATUS_MESSAGE) }),
  });
  const body = await response.json().catch(() => null);
  if (response.status === 404 && !body) throw new Error("Status endpoint unavailable. Restart your updated API.");
  if (!response.ok || !body?.success) throw new Error(body?.error || "VRChat didn't accept the change");
}
