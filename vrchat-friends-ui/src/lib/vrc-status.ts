/** VRChat social status ("Join Me", "Active", "Ask Me", "Busy"). */
export type VrcStatus = "joinme" | "active" | "askme" | "busy" | "offline";

export const statusMeta: Record<VrcStatus, { label: string; hint: string }> = {
  joinme: { label: "Join me", hint: "Happy for anyone to join" },
  active: { label: "Online", hint: "Online" },
  askme: { label: "Ask me", hint: "Ask before joining" },
  busy: { label: "Do not disturb", hint: "Busy — invites are blocked" },
  offline: { label: "Offline", hint: "Offline" },
};

/**
 * Accepts the status however the API serialises it: VRChat strings ("join me"),
 * C# enum names ("JoinMe") or the VRChat.API UserStatus enum numbers.
 * VRChat.API numbers them alphabetically: Active = 1, AskMe = 2, Busy = 3, JoinMe = 4, Offline = 5.
 */
export function normalizeStatus(value: unknown): VrcStatus | undefined {
  if (typeof value === "number") return (["active", "askme", "busy", "joinme", "offline"] as const)[value - 1];
  if (typeof value !== "string") return undefined;
  const key = value.toLowerCase().replace(/[\s_-]/g, "");
  return (["joinme", "active", "askme", "busy", "offline"] as const).find(status => status === key);
}

/** Order used when sorting online friends: most reachable first. */
export const statusRank: Record<VrcStatus, number> = { joinme: 0, active: 1, askme: 2, busy: 3, offline: 4 };
