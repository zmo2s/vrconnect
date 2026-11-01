export interface GroupMember { id: string; name: string; }
export interface FriendGroup { id: string; name: string; members: GroupMember[]; }
export function groupStorageKey(demo: boolean) { return demo ? "vrconnect-groups-preview" : "vrconnect-groups"; }
export function readGroups(key: string): FriendGroup[] {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(key) || "[]");
    if (!Array.isArray(data)) return [];
    return data.filter((group): group is FriendGroup => typeof group?.id === "string" && typeof group?.name === "string" && Array.isArray(group?.members))
      .map(group => ({ id: group.id, name: group.name.slice(0, 60), members: [...new Map(group.members.filter(member => typeof member?.id === "string" && typeof member?.name === "string").map(member => [member.id, { id: member.id, name: member.name }])).values()] }));
  } catch { return []; }
}
export function saveGroups(key: string, groups: FriendGroup[]) { localStorage.setItem(key, JSON.stringify(groups)); }
