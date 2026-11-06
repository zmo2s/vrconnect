import { apiGet } from "@/data/mockData";
export interface WorldDetails {
  id: string;
  name: string;
  thumbnailImageUrl?: string;
  imageUrl?: string;
}
export async function getWorldDetails(worldId: string): Promise<WorldDetails> {
  if (!/^wrld_[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(worldId)) throw new Error("Invalid world ID");
  const response = await apiGet<{ success: boolean; error?: string; data?: WorldDetails }>(`http://localhost:5000/vrchat/worlds/${encodeURIComponent(worldId)}`);
  if (!response.success || !response.data || response.data.id !== worldId) throw new Error(response.error || "World details unavailable");
  return response.data;
}
export function worldPictureUrl(world?: WorldDetails): string | undefined {
  for (const candidate of [world?.thumbnailImageUrl, world?.imageUrl]) {
    if (!candidate) continue;
    try { if (new URL(candidate).protocol === "https:") return candidate; } catch { /* Ignore malformed image URLs. */ }
  }
}

export interface InstanceDetails {
  worldId: string;
  instanceId: string;
  /** Everyone in the instance, friends or not. */
  userCount: number;
  capacity?: number;
  full?: boolean;
}
export async function getInstanceDetails(worldId: string, instanceId: string): Promise<InstanceDetails> {
  if (!/^wrld_[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(worldId) || !instanceId) throw new Error("Invalid instance");
  const params = new URLSearchParams({ worldId, instanceId });
  const response = await apiGet<{ success: boolean; error?: string; data?: InstanceDetails }>(`http://localhost:5000/vrchat/instance?${params}`);
  if (!response.success || !response.data || typeof response.data.userCount !== "number") throw new Error(response.error || "Instance details unavailable");
  return response.data;
}
