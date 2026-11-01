import type { Friend } from "@/data/mockData";

export type LocationKind = "world" | "private" | "traveling" | "offline" | "unknown";
export interface FriendLocation {
  kind: LocationKind;
  title: string;
  detail: string;
  key: string;
  worldId?: string;
  instanceId?: string;
  instanceNumber?: string;
  access?: string;
  region?: string;
  worldUrl?: string;
  instanceUrl?: string;
}

/** Only expose the exact location supplied by VRChat; never infer a hidden destination. */
export function getFriendLocation(friend: Pick<Friend, "location" | "worldName">): FriendLocation {
  const raw = friend.location?.trim() || "";
  if (raw === "offline") return { kind: "offline", title: "Offline", detail: "Not currently in VRChat", key: "offline" };
  if (raw === "private") return { kind: "private", title: "Private location", detail: "This friend hasn’t shared their location", key: "private" };
  if (raw === "traveling" || raw === "traveling:traveling") return { kind: "traveling", title: "Changing worlds", detail: "On the way to their next destination", key: "traveling" };
  const [worldId, ...parts] = raw.split(":");
  // VRChat world identifiers use UUIDs. Unknown values must not become launch links.
  if (!/^wrld_[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(worldId)) {
    return { kind: "unknown", title: "Location unavailable", detail: "No world location was shared", key: "unknown" };
  }
  const instanceId = parts.join(":");
  const instanceNumber = instanceId.split("~")[0];
  let access = "Public";
  if (instanceId.includes("~group(")) {
    access = instanceId.includes("~groupAccessType(public)") ? "Group public" : instanceId.includes("~groupAccessType(plus)") ? "Group+" : "Group";
  } else if (instanceId.includes("~private(")) access = instanceId.includes("~canRequestInvite") ? "Invite+" : "Invite only";
  else if (instanceId.includes("~hidden(")) access = "Friends+";
  else if (instanceId.includes("~friends(")) access = "Friends";
  const regionCode = instanceId.match(/~region\(([^)]+)\)/)?.[1];
  const region = ({ us: "US West", use: "US East", eu: "Europe", jp: "Japan" } as Record<string, string>)[regionCode || ""];
  const validInstance = !!instanceNumber && /^[a-z\d_~().+\-]+$/i.test(instanceId);
  return {
    kind: "world", key: raw, worldId, instanceId: validInstance ? instanceId : undefined,
    instanceNumber: validInstance ? instanceNumber : undefined,
    access: validInstance ? access : undefined, region,
    title: friend.worldName || `World ${worldId.slice(5, 13)}`,
    detail: validInstance ? [access, `#${instanceNumber}`, region].filter(Boolean).join(" · ") : "World shared · instance unavailable",
    worldUrl: `https://vrchat.com/home/world/${encodeURIComponent(worldId)}`,
    instanceUrl: validInstance ? `https://vrchat.com/home/launch?${new URLSearchParams({ worldId, instanceId })}` : undefined,
  };
}
