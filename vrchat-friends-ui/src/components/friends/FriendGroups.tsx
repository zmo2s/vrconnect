import { useEffect, useRef, useState } from "react";
import { Check, Download, Hand, Loader2, Plus, Search, Star, Trash2, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Friend } from "@/data/mockData";
import { BoopResult, sendBoopBatch } from "@/data/boops";
import { FriendGroup, groupStorageKey, readGroups, saveGroups } from "@/lib/friend-groups";
import { NotificationEvent } from "@/data/notifications";
import { getVrchatFavoriteGroups } from "@/data/favorites";
import { cn } from "@/lib/utils";
import { statusMeta, type VrcStatus } from "@/lib/vrc-status";

interface Props { onNotify?: (event: NotificationEvent) => void; friends: Friend[]; demo: boolean; open: boolean; onOpenChange: (open: boolean) => void; }
export default function FriendGroups({ friends, demo, open, onOpenChange, onNotify }: Props) {
  const storageKey = groupStorageKey(demo);
  const [groups, setGroups] = useState<FriendGroup[]>(() => readGroups(storageKey));
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"all" | "selected" | "online">("all");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [stopRequested, setStopRequested] = useState(false);
  const [results, setResults] = useState<Record<string, BoopResult>>({});
  const cancel = useRef(false);
  const inFlight = useRef(false);
  useEffect(() => { setGroups(readGroups(storageKey)); setActiveGroup(null); setName(""); setSelected([]); setResults({}); }, [storageKey]);
  useEffect(() => () => { cancel.current = true; }, []);
  const savedGroup = groups.find(group => group.id === activeGroup);
  const members = [...friends.map(friend => ({ id: friend.id, name: friend.name, avatar: friend.avatar, online: friend.online, onWeb: !!friend.onWeb, status: friend.status, loaded: true })), ...(savedGroup?.members || []).filter(member => !friends.some(friend => friend.id === member.id)).map(member => ({ ...member, avatar: "", online: false, onWeb: false, status: undefined as VrcStatus | undefined, loaded: false }))];
  /** Same colours and labels as the rest of the app: VRChat's Join me / Online / Ask me / Do not disturb, plus website presence. */
  const presence = (member: typeof members[number]) => !member.loaded ? { label: "Not loaded", className: "" }
    : member.online ? { label: statusMeta[member.status ?? "active"].label, className: `status-${member.status ?? "active"}` }
    : member.onWeb ? { label: "On website", className: "status-web" }
    : { label: "Offline", className: "" };
  const query = search.trim().toLowerCase();
  // Online friends first, then alphabetical. Selection does not reorder rows, so nothing jumps under the cursor.
  const visible = members
    .filter(member => member.name.toLowerCase().includes(query))
    .filter(member => view === "all" || (view === "selected" ? selected.includes(member.id) : member.online))
    .sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  const chosen = members.filter(member => selected.includes(member.id));
  const toggle = (id: string, on: boolean) => setSelected(previous => on ? [...new Set([...previous, id])] : previous.filter(current => current !== id));
  const recipients = friends.filter(friend => selected.includes(friend.id));
  const pending = recipients.filter(friend => !["sent", "unknown"].includes(results[friend.id]?.status));
  const missingCount = selected.filter(id => !friends.some(friend => friend.id === id)).length;
  function selectGroup(group?: FriendGroup) {
    if (busy) return;
    setActiveGroup(group?.id || null); setName(group?.name || ""); setSelected(group?.members.map(member => member.id) || []);
    setSearch(""); setView("all"); setNotice(""); setError("");
  }
  function persist(next: FriendGroup[], message: string) {
    try { saveGroups(storageKey, next); setGroups(next); setNotice(message); setError(""); onNotify?.({ title: "Group updated", message, kind: "success" }); return true; }
    catch { setError("Your browser could not save this group. Free some browser storage and try again."); return false; }
  }
  /** Copies your VRChat favorite-friend groups in. Re-importing refreshes them; your own groups are untouched. */
  async function importFromVrchat() {
    if (demo || busy || importing) return;
    setImporting(true); setNotice(""); setError("");
    try {
      const remote = await getVrchatFavoriteGroups();
      if (!remote.length) { setNotice("No favorite-friend groups found on your VRChat account."); return; }
      const names = new Map(friends.map(friend => [friend.id, friend.name]));
      const previousNames = new Map(groups.flatMap(group => group.members.map(member => [member.id, member.name] as [string, string])));
      const own = groups.filter(group => !group.id.startsWith("vrchat-"));
      const imported: FriendGroup[] = remote.map(group => {
        const clash = own.some(g => g.name.toLowerCase() === group.displayName.toLowerCase());
        return {
          id: `vrchat-${group.name}`,
          name: (clash ? `${group.displayName} (VRChat)` : group.displayName).slice(0, 60),
          members: group.members.map(id => ({ id, name: names.get(id) || previousNames.get(id) || id })),
        };
      });
      const total = imported.reduce((sum, group) => sum + group.members.length, 0);
      if (persist([...imported, ...own], `Imported ${imported.length} VRChat group${imported.length === 1 ? "" : "s"} with ${total} friends.`) && imported[0]) selectGroup(imported[0]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Import failed. Check your VRChat connection and try again.");
    } finally { setImporting(false); }
  }
  function save() {
    const trimmed = name.trim();
    if (!trimmed) { setError("Give your group a name."); return; }
    if (groups.some(group => group.id !== activeGroup && group.name.toLowerCase() === trimmed.toLowerCase())) { setError("A group with this name already exists."); return; }
    const group: FriendGroup = { id: activeGroup || crypto.randomUUID(), name: trimmed, members: members.filter(member => selected.includes(member.id)).map(({ id, name }) => ({ id, name })) };
    const next = activeGroup ? groups.map(current => current.id === activeGroup ? group : current) : [...groups, group];
    if (persist(next, `Saved ${group.name} with ${group.members.length} friends.`)) setActiveGroup(group.id);
  }
  async function send() {
    if (demo || inFlight.current || !pending.length || pending.length > 50) return;
    const ids = pending.map(friend => friend.id);
    inFlight.current = true; cancel.current = false; setBusy(true); setStopRequested(false); setNotice(""); setError("");
    try {
      const delivered = await sendBoopBatch(ids, result => setResults(previous => ({ ...previous, [result.userId]: result })), () => cancel.current);
      const sent = delivered.filter(result => result.status === "sent").length;
      const remaining = ids.length - delivered.length;
      setNotice(`${sent} boop${sent === 1 ? "" : "s"} sent. ${delivered.length - sent} not confirmed.${remaining ? ` ${remaining} not sent.` : ""}`);
      onNotify?.({ title: sent === ids.length ? "Boops sent" : "Boop batch finished", message: `${sent} sent, ${delivered.length - sent} not confirmed, ${remaining} not sent.`, kind: sent === ids.length ? "success" : "warning" });
      const halt = delivered.find(result => result.stop);
      if (halt) setError(halt.message);
    } catch { onNotify?.({ title: "Boop sending stopped", message: "Check the per-friend results before trying again.", kind: "warning" }); setError("Sending stopped. Check the per-friend results before trying again."); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <Dialog open={open} onOpenChange={next => { if (!inFlight.current) onOpenChange(next); }}><DialogContent className="groups-dialog" onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onPointerDownOutside={event => { if (busy) event.preventDefault(); }}><DialogHeader><DialogTitle>Friends, together.</DialogTitle><DialogDescription>Create personal groups and send boops to your selected friends. Groups are saved in this browser{demo ? " for preview only" : ""}.</DialogDescription></DialogHeader>
    <div className="groups-workspace"><aside className="saved-groups"><span className="group-section-label">YOUR GROUPS</span>{groups.length > 0 && <Button variant="outline" onClick={() => selectGroup()} disabled={busy}><Plus /> New group</Button>}{!demo && <Button variant="ghost" className="import-vrchat-groups" onClick={() => void importFromVrchat()} disabled={busy || importing} title="Copy your favorite-friend groups from VRChat. Importing again refreshes them.">{importing ? <Loader2 className="animate-spin" /> : <Download />}{groups.some(group => group.id.startsWith("vrchat-")) ? "Refresh from VRChat" : "Import from VRChat"}</Button>}{groups.length === 0 && <p>Your first group starts with a few friends.</p>}{groups.map(group => <button key={group.id} disabled={busy} className={cn("saved-group", activeGroup === group.id && "active")} onClick={() => selectGroup(group)}>{group.id.startsWith("vrchat-") ? <Star size={16} className="vrchat-group-icon" /> : <Users size={16} />}<span>{group.name}<small>{group.members.length} friends{group.id.startsWith("vrchat-") && " · from VRChat"}</small></span></button>)}</aside>
    <section className="group-editor"><div className="group-name-field"><div><Label htmlFor="friend-group-name">Group name</Label><Input id="friend-group-name" placeholder="Weekend crew" value={name} maxLength={60} disabled={busy} onChange={event => setName(event.target.value)} /></div><Button variant="outline" onClick={save} disabled={busy}><Check />{activeGroup ? "Save changes" : "Save group"}</Button></div>
      <div className="group-search"><Search size={16} /><Input aria-label="Search group members" placeholder="Find friends to add…" value={search} disabled={busy} onChange={event => setSearch(event.target.value)} /></div>
      <div className="selection-controls">
        <div className="group-view" role="tablist" aria-label="Show">{([["all", `All ${members.length}`], ["online", `Online ${members.filter(member => member.online).length}`], ["selected", `Selected ${selected.length}`]] as const).map(([key, text]) => <button key={key} role="tab" aria-selected={view === key} className={cn(view === key && "active")} onClick={() => setView(key)}>{text}</button>)}</div>
        <button disabled={busy || !visible.length} onClick={() => setSelected(previous => [...new Set([...previous, ...visible.map(member => member.id)])])}>Select all shown</button><button disabled={busy || !selected.length} onClick={() => setSelected([])}>Clear</button>
      </div>
      <div className="group-members">{visible.map(member => <div className={cn("group-member", selected.includes(member.id) && "is-selected")} key={member.id}><Checkbox id={`group-member-${member.id}`} aria-label={`Select ${member.name}`} checked={selected.includes(member.id)} disabled={busy} onCheckedChange={checked => toggle(member.id, checked === true)} /><Label htmlFor={`group-member-${member.id}`}>{member.avatar ? <img className="group-member-avatar" src={member.avatar} alt="" loading="lazy" /> : <span className="group-member-avatar" aria-hidden="true">{member.name.slice(0, 1).toUpperCase()}</span>}<span className="group-member-name">{member.name}</span><small className={cn("group-member-status", presence(member).className)}>{presence(member).label}</small></Label>{results[member.id] &&<span className={`boop-result result-${results[member.id].status}`} title={results[member.id].message}>{results[member.id].status === "sent" ? "Sent ✓" : results[member.id].status === "unknown" ? "Delivery unknown" : "Not sent"}<small>{results[member.id].status !== "sent" && results[member.id].message}</small></span>}</div>)}{!visible.length && <p className="group-empty">{view === "selected" && !query ? "Nobody selected yet. Tick friends in All or Online." : friends.length ? "No friends match your search." :"Connect VRChat to load your friends, or explore Preview."}</p>}</div>
      {/* Under the list, so adding the first friend never pushes the rows down under the cursor */}
      {chosen.length > 0 && <div className="group-chosen" aria-label="Selected friends">{chosen.map(member => <button key={member.id} className="group-chip" disabled={busy} title={`Remove ${member.name}`} onClick={() => toggle(member.id, false)}>{member.name}<X size={12} /></button>)}</div>}
      {activeGroup && <Button variant="ghost" className="delete-group" disabled={busy} onClick={() => { if (persist(groups.filter(group => group.id !== activeGroup), "Group removed. Your VRChat friends are unchanged.")) { setActiveGroup(null); setName(""); setSelected([]); } }}><Trash2 /> Delete group</Button>}
    </section></div>
    {notice && <p className="group-notice" role="status">{notice}</p>}{error && <p className="group-error" role="alert">{error}</p>}
    <div className="boop-send-panel"><div><strong><Hand size={17} />{busy ? "Sending boops…" : `Boop ${pending.length} selected friend${pending.length === 1 ? "" : "s"}`}</strong><p>{demo ? "Preview only. Connect VRChat to send real boops." : "Sends one standard boop per friend. No automatic retries."}</p>{missingCount > 0 && <p>{missingCount} saved members are not loaded and will be skipped.</p>}{pending.length > 50 && <p>Choose up to 50 friends per batch.</p>}</div>{busy ? <Button variant="outline" disabled={stopRequested} onClick={() => { cancel.current = true; setStopRequested(true); }}><Loader2 className="animate-spin" />{stopRequested ? "Stopping…" : "Stop after current"}</Button> : <Button disabled={demo || !pending.length || pending.length > 50} onClick={() => void send()}><Hand /> Send boops</Button>}</div>
  </DialogContent></Dialog>;
}

