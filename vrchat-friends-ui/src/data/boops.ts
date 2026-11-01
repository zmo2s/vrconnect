import { vrchatFetch } from "@/lib/vrchat-api";
export interface BoopResult { userId: string; status: "sent" | "failed" | "unknown"; message: string; stop: boolean; }
export async function sendBoop(userId: string): Promise<BoopResult> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 20000);
  try {
    const token = localStorage.getItem("token");
    const response = await vrchatFetch(`http://localhost:5000/vrchat/friends/${encodeURIComponent(userId)}/boop`, {
      method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: controller.signal,
    });
    const body = await response.json().catch(() => null);
    if (response.ok && body?.success === true) return { userId, status: "sent", message: "Boop sent", stop: false };
    const uncertain = body?.uncertain === true || response.status >= 500 || (response.ok && !body);
    return { userId, status: uncertain ? "unknown" : "failed", message: body?.error || (response.status === 404 ? "Boop endpoint unavailable. Restart your updated API." : "The boop could not be confirmed."), stop: uncertain || [401, 429].includes(response.status) || !body };
  } catch {
    return { userId, status: "unknown", message: "Connection lost. Delivery is unknown; check VRChat before sending again.", stop: true };
  } finally { window.clearTimeout(timeout); }
}

/** Sequential, never automatically retries, and respects cancellation between sends. */
export async function sendBoopBatch(ids: string[], onResult: (result: BoopResult) => void, shouldStop: () => boolean, sender = sendBoop) {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length > 50) throw new Error("Choose up to 50 friends per batch.");
  const results: BoopResult[] = [];
  for (const id of uniqueIds) {
    if (shouldStop()) break;
    const result = await sender(id);
    results.push(result); onResult(result);
    if (result.stop) break;
  }
  return results;
}

