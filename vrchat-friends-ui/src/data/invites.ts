import { vrchatFetch } from "@/lib/vrchat-api";

export type InviteKind = "invite" | "request";
export const MAX_INVITE_MESSAGE = 64;

export interface InviteResult { ok: boolean; uncertain: boolean; message: string; }
export interface SavedMessage { slot: number; message: string; cooldownMinutes: number; }

const API = "http://localhost:5000";
const auth = (): HeadersInit => { const token = localStorage.getItem("token"); return token ? { Authorization: `Bearer ${token}` } : {}; };

/** Sends an invite to your current instance, or asks the friend to invite you. Never retried automatically. */
export async function sendInvite(userId: string, kind: InviteKind, message?: string, slot?: number): Promise<InviteResult> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 20000);
  try {
    const action = kind === "request" ? "request-invite" : "invite";
    const response = await vrchatFetch(`${API}/vrchat/friends/${encodeURIComponent(userId)}/${action}`, {
      method: "POST", signal: controller.signal,
      headers: { ...auth(), "Content-Type": "application/json" },
      body: JSON.stringify({ message: message?.trim() || null, slot: slot ?? null }),
    });
    const body = await response.json().catch(() => null);
    if (response.ok && body?.success === true) return { ok: true, uncertain: false, message: kind === "invite" ? "Invite sent" : "Invite request sent" };
    if (response.status === 404 && !body) return { ok: false, uncertain: false, message: "Invite endpoint unavailable. Restart your updated API." };
    return { ok: false, uncertain: body?.uncertain === true, message: body?.error || "The invite could not be sent." };
  } catch {
    return { ok: false, uncertain: true, message: "Connection lost. Delivery is unknown; check VRChat before sending again." };
  } finally { window.clearTimeout(timeout); }
}

/** Your saved VRChat invite / request messages (12 slots each). */
export async function getSavedMessages(kind: InviteKind): Promise<SavedMessage[]> {
  const response = await vrchatFetch(`${API}/vrchat/invite-messages?type=${kind}`, { headers: auth() });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.success || !Array.isArray(body.data)) throw new Error(body?.error || "Saved messages unavailable");
  return body.data
    .filter((m: SavedMessage) => typeof m?.slot === "number" && typeof m?.message === "string")
    .map((m: SavedMessage) => ({ slot: m.slot, message: m.message, cooldownMinutes: Number(m.cooldownMinutes) || 0 }));
}
