import { apiGet } from "@/data/mockData";
export interface IncomingNotification {
  id: string; type: string; message: string; senderId?: string; senderName?: string; createdAt: string; seen: boolean;
  feed?: string; title?: string; imageUrl?: string; link?: string; linkText?: string;
  category?: string; details?: unknown; data?: unknown; expiresAt?: string;
}
export interface AppNotification {
  id: string; title: string; message: string; createdAt: string; kind: "info" | "success" | "warning"; source: "app" | "vrchat"; seen?: boolean;
  category?: "invitation" | "group" | "boop" | "friend" | "other"; typeLabel?: string; sender?: string;
  groupName?: string; worldName?: string; imageUrl?: string; href?: string; linkLabel?: string; expiresAt?: string;
}
export type NotificationEvent = Pick<AppNotification, "title" | "message" | "kind">;
export interface NotificationFeed { items: IncomingNotification[]; warnings: string[]; }
export async function getNotifications(): Promise<NotificationFeed> {
  const response = await apiGet<{ success: boolean; error?: string; data?: NotificationFeed | IncomingNotification[] }>("http://localhost:5000/vrchat/notifications");
  if (!response.success || !response.data) throw new Error(response.error || "Notifications unavailable");
  const raw = Array.isArray(response.data) ? response.data : response.data.items;
  if (!Array.isArray(raw)) throw new Error("Invalid notification feed");
  return { items: raw.filter(item => typeof item?.id === "string" && typeof item?.type === "string"), warnings: Array.isArray(response.data) ? ["Your API is using the older feed. Restart the updated API to include group invitations and announcements."] : (response.data.warnings || []).filter(value => typeof value === "string") };
}
function record(value: unknown): Record<string, unknown> {
  try { const result = typeof value === "string" ? JSON.parse(value) : value; return result && typeof result === "object" && !Array.isArray(result) ? result : {}; } catch { return {}; }
}
function text(value: unknown): string | undefined { return typeof value === "string" && value.trim() ? value : undefined; }
export function notificationLink(link?: string): string | undefined {
  if (!link) return;
  const match = /^(group|world|user):(grp_[\w-]+|wrld_[\w-]+|usr_[\w-]+)$/.exec(link);
  if (match && ((match[1] === "group" && match[2].startsWith("grp_")) || (match[1] === "world" && match[2].startsWith("wrld_")) || (match[1] === "user" && match[2].startsWith("usr_")))) return `https://vrchat.com/home/${match[1]}/${encodeURIComponent(match[2])}`;
  try { const url = new URL(link); if (url.protocol === "https:" && url.hostname === "vrchat.com" && !url.username && !url.password && url.port === "" && url.pathname.startsWith("/home/")) return url.href; } catch { /* Unknown notification links remain plain text. */ }
}
function imageUrl(value: unknown): string | undefined { try { const url = new URL(text(value) || ""); return url.protocol === "https:" ? url.href : undefined; } catch { return; } }
export function incomingToApp(item: IncomingNotification, names: Map<string, string>): AppNotification {
  const details = { ...record(item.data), ...record(item.details) };
  const sender = names.get(item.senderId || "") || text(item.senderName) || text(details.senderDisplayName) || "Someone on VRChat";
  const type = item.type.toLowerCase().replace(/[^a-z]/g, "");
  const isGroup = type.includes("group") || (item.category || "").toLowerCase().includes("group");
  const isInvite = type.includes("invite") || type.includes("invitation") || type.includes("requestinvite");
  const category = isInvite ? "invitation" : isGroup ? "group" : type.includes("boop") ? "boop" : type.includes("friend") ? "friend" : "other";
  const typeLabel = isGroup && isInvite ? "Group invitation" : isGroup && (type.includes("announcement") || type.includes("post")) ? "Group announcement" : isGroup ? "Group activity" : type === "invite" ? "World invitation" : type === "requestinvite" ? "Invite request" : category === "boop" ? "Boop" : category === "friend" ? "Friend request" : "VRChat update";
  const groupName = text(details.groupName) || text(details.groupDisplayName);
  const worldName = text(details.worldName);
  const fallbackTitle = category === "boop" ? `${sender} booped you` : isGroup ? (groupName ? `${typeLabel} · ${groupName}` : typeLabel) : type === "invite" ? `${sender} invited you` : type === "requestinvite" ? `${sender} requested an invite` : typeLabel;
  const messages = [...new Set([text(item.message), text(details.inviteMessage), text(details.requestMessage), text(details.description), text(details.body)].filter((value): value is string => !!value))];
  let href = notificationLink(item.link);
  if (!href && typeof details.groupId === "string") href = notificationLink(`group:${details.groupId}`);
  if (!href && typeof details.worldId === "string") href = notificationLink(`world:${details.worldId.split(":")[0]}`);
  return { id: `vrchat:${item.id}`, title: text(item.title) || fallbackTitle, message: messages.join("\n\n") || "Open VRChat to view or respond to this notification.", createdAt: item.createdAt, kind: "info", source: "vrchat", seen: item.seen,
    category, typeLabel, sender: sender === "Someone on VRChat" ? undefined : sender, groupName, worldName, href,
    linkLabel: isGroup ? "Open group in VRChat" : worldName || type === "invite" ? "Open world in VRChat" : "Open in VRChat",
    imageUrl: imageUrl(item.imageUrl) || imageUrl(details.imageUrl), expiresAt: item.expiresAt,
  };
}
