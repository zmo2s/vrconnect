import { vrchatFetch } from "@/lib/vrchat-api";

const API = "http://localhost:5000";
const auth = (): HeadersInit => { const token = localStorage.getItem("token"); return token ? { Authorization: `Bearer ${token}` } : {}; };

export interface VrchatFavoriteGroup {
  /** VRChat's internal name: "group_0", "group_1"… */
  name: string;
  /** The name you see in VRChat ("Group 1" or your custom name). */
  displayName: string;
  /** User IDs of the friends in this group. */
  members: string[];
}

export async function getVrchatFavoriteGroups(): Promise<VrchatFavoriteGroup[]> {
  const response = await vrchatFetch(`${API}/vrchat/favorites/friend-groups`, { headers: auth() });
  const body = await response.json().catch(() => null);
  if (response.status === 404 && !body) throw new Error("Import endpoint unavailable. Restart your updated API.");
  if (!response.ok || !body?.success || !Array.isArray(body.data)) throw new Error(body?.error || "Your VRChat favorite groups are unavailable");
  return body.data
    .filter((g: VrchatFavoriteGroup) => typeof g?.name === "string" && Array.isArray(g?.members))
    .map((g: VrchatFavoriteGroup) => ({
      name: g.name,
      displayName: (typeof g.displayName === "string" && g.displayName.trim()) || g.name,
      members: g.members.filter(id => typeof id === "string" && id),
    }));
}
