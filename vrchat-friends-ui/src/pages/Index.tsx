import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueries } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  MailPlus, UserPlus, Activity as ActivityIcon, AlertTriangle, ArrowUpDown, ArrowUpRight, Bell, Check, ChevronDown, ChevronRight, CircleHelp, Compass, Copy, ExternalLink, Globe2,
  Hand, LayoutGrid, List, ListFilter, Loader2, LockKeyhole, LogIn, MapPin, RefreshCw, Search, Settings as SettingsIcon, Sparkles, Star, StickyNote, UserCheck, Users, X,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNowStrict } from "date-fns";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuLabel, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import CommandPalette, { type PaletteAction } from "@/components/CommandPalette";
import { diffPresence } from "@/lib/presence-changes";
import { playSound } from "@/lib/sounds";
import ActivityTimeline, { TimelineItem, type EventPicture } from "@/components/activity/ActivityTimeline";
import { useActivity } from "@/hooks/use-activity";
import { minutesOnlineToday } from "@/lib/activity";
import ReachOut from "@/components/friends/ReachOut";
import type { InviteKind } from "@/data/invites";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Friend, getFriends } from "@/data/mockData";
import { getWorldDetails, worldPictureUrl, getInstanceDetails } from "@/data/worlds";
import FriendGroups from "@/components/friends/FriendGroups";
import WorldPicture from "@/components/worlds/WorldPicture";
import ThemeToggle from "@/components/ThemeToggle";
import { sampleFriends } from "@/data/sampleFriends";
import { getFriendLocation, LocationKind } from "@/lib/friend-location";
import NotificationCenter from "@/components/notifications/NotificationCenter";
import { useNotifications } from "@/hooks/use-notifications";
import { desktopNotify, useSettings } from "@/hooks/use-settings";
import { useNotes } from "@/hooks/use-notes";
import SettingsDialog from "@/components/SettingsDialog";
import ProfileButton from "@/components/profile/ProfileButton";
import { statusMeta, statusRank } from "@/lib/vrc-status";
import { Textarea } from "@/components/ui/textarea";
import { getNotifications, incomingToApp } from "@/data/notifications";
import { cn } from "@/lib/utils";

/* ---------- small presentational helpers ---------- */

function Portrait({ friend, large = false }: { friend: Friend; large?: boolean }) {
  const color = [...friend.name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 6;
  return (
    <span className={cn("portrait", large && "portrait-large")}>
      <Avatar className={`portrait-avatar tone-${color}`}>
        <AvatarImage src={friend.avatar} alt="" />
        <AvatarFallback className="bg-transparent">{friend.name.slice(0, 2).toUpperCase()}</AvatarFallback>
      </Avatar>
      <span className={cn("presence-dot", friend.online && "is-online", friend.online && friend.status && `status-${friend.status}`, !friend.online && friend.onWeb && "is-web")} title={friend.online ? statusMeta[friend.status ?? "active"].hint : friend.onWeb ? "On the VRChat website" : "Offline"} />
    </span>
  );
}

function LocationIcon({ kind }: { kind: LocationKind }) {
  return kind === "private" ? <LockKeyhole size={15} /> : kind === "traveling" ? <RefreshCw size={15} /> : kind === "web" ? <Globe2 size={15} /> : <MapPin size={15} />;
}

function Landscape({ index }: { index: number }) {
  return (
    <div className={`landscape landscape-${index % 3}`} aria-hidden="true">
      <div className="landscape-sun" /><div className="landscape-hill hill-back" /><div className="landscape-hill hill-front" />
      <div className="landscape-water" /><div className="landscape-building building-one" /><div className="landscape-building building-two" />
      <div className="landscape-building building-three" /><div className="landscape-grain" />
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="friend-collection" role="status" aria-label="Finding your people…">
      {Array.from({ length: 6 }, (_, i) => (
        <div className="skeleton-row" key={i}>
          <span className="sk" style={{ width: 38, height: 38, borderRadius: "50%" }} />
          <span style={{ flex: 1, display: "grid", gap: 6 }}><span className="sk" style={{ width: "28%", height: 11 }} /><span className="sk" style={{ width: "18%", height: 9 }} /></span>
          <span className="sk" style={{ width: "22%", height: 11 }} />
        </div>
      ))}
    </div>
  );
}

/* ---------- remembered view preferences ---------- */

const PREFS_KEY = "vrconnect-dashboard-prefs";
type SortMode = "presence" | "name" | "place";
interface Prefs { tab: string; view: string; sort: SortMode; locationsOpen: boolean; }
const defaultPrefs: Prefs = { tab: "online", view: "list", sort: "presence", locationsOpen: true };
function readPrefs(): Prefs {
  try {
    const value = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
    return {
      tab: ["online", "all", "favorites"].includes(value.tab) ? value.tab : defaultPrefs.tab,
      view: ["list", "grid"].includes(value.view) ? value.view : defaultPrefs.view,
      sort: ["presence", "name", "place"].includes(value.sort) ? value.sort : value.sort === true ? "name" : defaultPrefs.sort,
      locationsOpen: typeof value.locationsOpen === "boolean" ? value.locationsOpen : defaultPrefs.locationsOpen,
    };
  } catch { return defaultPrefs; }
}

/** "Join me", "Ask me", "Offline · last seen 3 hours ago"… */
function presenceLabel(friend: Friend) {
  if (friend.online) return statusMeta[friend.status ?? "active"].label;
  if (friend.onWeb) return "On website";
  if (getFriendLocation(friend).kind === "unknown" && !friend.lastLogin) return "Presence unknown";
  const seen = friend.lastLogin ? Date.parse(friend.lastLogin) : NaN;
  return Number.isFinite(seen) ? `Offline · last seen ${formatDistanceToNowStrict(seen)} ago` : "Offline";
}

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
}

/* ---------- page ---------- */

export default function Index() {
  const [demo, setDemo] = useState(() => !localStorage.getItem("token") && localStorage.getItem("vrchat-session") !== "connected");
  const initial = useMemo(readPrefs, []);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState(initial.tab);
  const [view, setView] = useState(initial.view);
  const [sort, setSort] = useState<SortMode>(initial.sort);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [, setTick] = useState(0);
  const [settings, updateSettings] = useSettings();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notes, setNote] = useNotes();
  const [locationsOpen, setLocationsOpen] = useState(initial.locationsOpen);
  const [placeFilter, setPlaceFilter] = useState("any");
  const [instanceFilter, setInstanceFilter] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [reachKind, setReachKind] = useState<InviteKind>("invite");
  const [showAllWorlds, setShowAllWorlds] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const [favorites, setFavorites] = useState<string[]>(() => {
    try { const value = JSON.parse(localStorage.getItem("vrc-favorites") || "[]"); return Array.isArray(value) ? value.filter(id => typeof id === "string") : []; }
    catch { return []; }
  });

  useEffect(() => {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify({ tab, view, sort, locationsOpen })); } catch { /* preferences are a convenience */ }
  }, [tab, view, sort, locationsOpen]);

  // "/" jumps to the list search; Ctrl/Cmd+K opens the quick-jump palette.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.key === "k" || event.key === "K") && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        setPaletteOpen(open => !open);
      } else if (event.key === "/" && !isTyping(event.target)) {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* data */
  const query = useQuery({
    queryKey: ["location-friends"], enabled: !demo, refetchInterval: settings.refreshSeconds * 1000, retry: 1,
    queryFn: async () => { const lists = await Promise.all([getFriends(true), getFriends(false)]); return [...new Map(lists.flat().map(friend => [friend.id, friend])).values()]; },
  });
  const inbox = useNotifications(demo);
  const notificationQuery = useQuery({ queryKey: ["incoming-notifications"], queryFn: getNotifications, enabled: !demo, refetchInterval: 30000, retry: false });
  // Chime for VRChat notifications that arrive while the dashboard is open (not for the ones already there on load).
  const knownNotificationIds = useRef<Set<string> | null>(null);
  useEffect(() => {
    const items = notificationQuery.data?.items;
    if (demo || !items) return;
    if (!knownNotificationIds.current) { knownNotificationIds.current = new Set(items.map(item => item.id)); return; }
    const fresh = items.filter(item => !item.seen && !knownNotificationIds.current!.has(item.id));
    items.forEach(item => knownNotificationIds.current!.add(item.id));
    if (fresh.length) playSound(fresh.some(item => /invite|request/i.test(item.type)) ? "invite" : fresh.some(item => /boop/i.test(item.type)) ? "online" : "info");
  }, [notificationQuery.data, demo]);
  const connectionState = useRef<string | null>(null);
  useEffect(() => {
    if (demo) { connectionState.current = null; return; }
    const next = query.isError ? "error" : query.isSuccess ? "connected" : null;
    if (!next || next === connectionState.current) return;
    if (next === "error") inbox.notify({ title: "Connection interrupted", message: "Your friends could not be refreshed. Check your API connection or sign in again.", kind: "warning" });
    else if (connectionState.current === "error") inbox.notify({ title: "Back online", message: "Your friends are updating again.", kind: "success" });
    connectionState.current = next;
  }, [demo, query.isError, query.isSuccess, inbox.notify]);

  // Keep "updated x ago" fresh.
  useEffect(() => { const id = window.setInterval(() => setTick(t => t + 1), 30000); return () => window.clearInterval(id); }, []);

  // Alert when a favorite comes online or changes world (live data only).
  const previousSnapshot = useRef<Friend[] | null>(null);
  const favoritesRef = useRef(favorites);
  favoritesRef.current = favorites;
  const alertsRef = useRef(settings);
  alertsRef.current = settings;
  useEffect(() => {
    if (demo || !query.data) { previousSnapshot.current = null; return; }
    const events = previousSnapshot.current ? diffPresence(previousSnapshot.current, query.data, favoritesRef.current) : [];
    previousSnapshot.current = query.data;
    if (!alertsRef.current.favoriteAlerts) return;
    events.slice(0, 5).forEach(event => {
      inbox.notify({ title: event.title, message: event.message, kind: "info" });
      if (alertsRef.current.desktopAlerts) desktopNotify(event.title, event.message);
    });
  }, [demo, query.data, inbox.notify]);

  const rawFriends = demo ? sampleFriends : query.data || [];
  const worldIds = [...new Set(rawFriends.map(friend => getFriendLocation(friend).worldId).filter((id): id is string => !!id))];
  const worldQueries = useQueries({ queries: worldIds.map(worldId => ({
    queryKey: ["world-details", worldId], queryFn: () => getWorldDetails(worldId), enabled: !demo,
    staleTime: 10 * 60 * 1000, gcTime: 30 * 60 * 1000, retry: false,
  })) });
  const worlds = new Map(worldIds.map((id, index) => [id, worldQueries[index]]));
  const data = rawFriends.map(friend => {
    const id = getFriendLocation(friend).worldId;
    const name = id ? worlds.get(id)?.data?.name : undefined;
    return name ? { ...friend, worldName: name } : friend;
  });

  const selected = data.find(friend => friend.id === selectedId);
  const worldNames = new Map(worldIds.flatMap(id => { const name = worlds.get(id)?.data?.name; return name ? [[id, name] as [string, string]] : []; }));
  const activity = useActivity(data, query.dataUpdatedAt, demo, sampleFriends, worldNames);
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayCount = activity.events.filter(event => Date.parse(event.at) >= todayStart.getTime()).length;
  const selectedEvents = selected ? activity.events.filter(event => event.friendId === selected.id) : [];
  // World pictures for the timeline, including worlds nobody is in any more (capped to keep requests reasonable).
  const pastWorldIds = demo ? [] : [...new Set(activity.events.map(event => event.worldId).filter((id): id is string => !!id && !worlds.has(id)))].slice(0, 30);
  const pastWorldQueries = useQueries({ queries: pastWorldIds.map(worldId => ({
    queryKey: ["world-details", worldId], queryFn: () => getWorldDetails(worldId), staleTime: 30 * 60 * 1000, gcTime: 60 * 60 * 1000, retry: false,
  })) });
  const pastWorlds = new Map(pastWorldIds.map((id, index) => [id, pastWorldQueries[index]?.data]));
  const demoTones = new Map(sampleFriends.flatMap(friend => { const l = getFriendLocation(friend); return l.worldId ? [l.worldId] : []; }).filter((id, i, all) => all.indexOf(id) === i).map((id, i) => [id, i % 3]));
  const eventPicture: EventPicture = event => {
    if (!event.worldId) return undefined;
    if (demo) { const tone = demoTones.get(event.worldId); return tone === undefined ? undefined : { tone }; }
    const src = worldPictureUrl(worlds.get(event.worldId)?.data ?? pastWorlds.get(event.worldId));
    return src ? { src } : undefined;
  };
  const selectedMinutes = selected ? minutesOnlineToday(activity.events, selected.id, selected.online) : null;
  const selectedLocation = selected ? getFriendLocation(selected) : null;
  const isConnected = (friend: Friend) => friend.online || !!friend.onWeb;
  const online = data.filter(isConnected).length;
  const webCount = data.filter(friend => !friend.online && friend.onWeb).length;
  const privateCount = data.filter(friend => getFriendLocation(friend).kind === "private").length;
  const favoriteCount = data.filter(friend => favorites.includes(friend.id)).length;
  const groups = useMemo(() => {
    const locations = new Map<string, { location: ReturnType<typeof getFriendLocation>; friends: Friend[] }>();
    data.forEach(friend => {
      const location = getFriendLocation(friend);
      if (location.kind !== "world") return;
      const group = locations.get(location.key);
      if (group) group.friends.push(friend); else locations.set(location.key, { location, friends: [friend] });
    });
    return [...locations.values()].sort((a, b) => b.friends.length - a.friends.length);
  }, [data]);
  // Live head-count per instance (everyone there, not only friends). Refreshed every minute.
  const instanceQueries = useQueries({ queries: groups.map(({ location }) => ({
    queryKey: ["instance-details", location.worldId, location.instanceId],
    queryFn: () => getInstanceDetails(location.worldId!, location.instanceId!),
    enabled: !demo && !!location.worldId && !!location.instanceId,
    staleTime: 60 * 1000, refetchInterval: 60 * 1000, retry: false,
  })) });
  const instanceCounts = new Map(groups.map(({ location }, index) => [location.key, instanceQueries[index]?.data]));

  const needle = search.trim().toLowerCase();
  const visible = data.filter(friend => {
    const location = getFriendLocation(friend);
    return (tab !== "online" || isConnected(friend))
      && (tab !== "favorites" || favorites.includes(friend.id))
      && (placeFilter === "any" || location.kind === placeFilter)
      && (!instanceFilter || location.key === instanceFilter)
      && `${friend.name} ${location.title} ${location.detail} ${location.worldId || ""} ${notes[friend.id] || ""}`.toLowerCase().includes(needle);
  }).sort((a, b) => sort === "name" ? a.name.localeCompare(b.name)
    : Number(b.online) - Number(a.online) || Number(!!b.onWeb) - Number(!!a.onWeb) || Number(favorites.includes(b.id)) - Number(favorites.includes(a.id))
      || statusRank[a.status ?? "active"] - statusRank[b.status ?? "active"] || a.name.localeCompare(b.name));
  // When a search finds nothing in this tab, count matches across all friends to offer them.
  const elsewhere = needle && tab !== "all" && visible.length === 0
    ? data.filter(friend => { const location = getFriendLocation(friend); return `${friend.name} ${location.title} ${location.detail} ${location.worldId || ""} ${notes[friend.id] || ""}`.toLowerCase().includes(needle); }).length
    : 0;
  // Live mode before the first successful load: show "–" rather than misleading zeros.
  const noData = !demo && !query.data;
  const joinMeCount = data.filter(friend => friend.online && friend.status === "joinme").length;

  // Sections shown in the list: by presence (online / offline) or by place.
  const sections = useMemo(() => {
    if (sort === "place") {
      const order: Record<LocationKind, number> = { world: 0, traveling: 1, private: 2, web: 3, unknown: 4, offline: 5 };
      const byPlace = new Map<string, { label: string; kind: LocationKind; friends: Friend[] }>();
      visible.forEach(friend => {
        const location = getFriendLocation(friend);
        const label = location.kind === "world" ? `${location.title}${location.instanceNumber ? ` · #${location.instanceNumber}` : ""}` : location.title;
        const entry = byPlace.get(location.key);
        if (entry) entry.friends.push(friend); else byPlace.set(location.key, { label, kind: location.kind, friends: [friend] });
      });
      return [...byPlace.values()].sort((a, b) => order[a.kind] - order[b.kind] || b.friends.length - a.friends.length).map(group => ({ label: `${group.label} · ${group.friends.length}`, friends: group.friends }));
    }
    const on = visible.filter(friend => friend.online);
    const web = visible.filter(friend => !friend.online && friend.onWeb);
    const off = visible.filter(friend => !friend.online && !friend.onWeb);
    const parts = [
      { label: `In game · ${on.length}`, friends: on },
      { label: `On the website · ${web.length}`, friends: web },
      { label: `Offline · ${off.length}`, friends: off },
    ].filter(part => part.friends.length);
    if (sort === "presence" && view === "list" && parts.length > 1) return parts;
    return [{ label: "", friends: visible }];
  }, [visible, sort, view]);

  const allNotifications = [...inbox.items, ...(demo ? [] : notificationQuery.data?.items || []).map(item => incomingToApp(item, new Map(data.map(friend => [friend.id, friend.name]))))];
  const unreadCount = new Set(allNotifications.filter(item => !item.seen && !inbox.readIds.includes(item.id) && !inbox.dismissedIds.includes(item.id)).map(item => item.id)).size;

  /* actions */
  function favorite(id: string) {
    setFavorites(previous => {
      const next = previous.includes(id) ? previous.filter(value => value !== id) : [...previous, id];
      try { localStorage.setItem("vrc-favorites", JSON.stringify(next)); } catch { /* Retain favorites for this session if browser storage is full. */ }
      return next;
    });
  }
  const resetFilters = useCallback((nextTab = "online") => { setTab(nextTab); setInstanceFilter(null); setPlaceFilter("any"); setSearch(""); }, []);
  function scrollTo(id: string) { document.getElementById(id)?.scrollIntoView?.({ behavior: "smooth", block: "start" }); }
  function showInstance(key: string) { const next = instanceFilter === key ? null : key; resetFilters("all"); setInstanceFilter(next); scrollTo("friends-list"); }
  function togglePlace(kind: string) {
    const next = placeFilter === kind ? "any" : kind;
    setPlaceFilter(next); setInstanceFilter(null);
    if (next !== "any" && tab === "favorites") setTab("all");
    scrollTo("friends-list");
  }
  function copy(text: string, what: string) {
    navigator.clipboard?.writeText(text).then(() => toast(`${what} copied`), () => toast("Couldn’t copy to the clipboard"));
  }
  function runAction(action: PaletteAction) {
    if (action === "online") { resetFilters("online"); scrollTo("friends-list"); }
    else if (action === "favorites") { resetFilters("favorites"); scrollTo("friends-list"); }
    else if (action === "private") { resetFilters("all"); setPlaceFilter("private"); scrollTo("friends-list"); }
    else if (action === "groups") setGroupsOpen(true);
    else if (action === "inbox") setInboxOpen(true);
    else if (action === "refresh") refresh();
    else if (action === "settings") setSettingsOpen(true);
    else if (action === "activity") setActivityOpen(true);
  }
  // Refresh button feedback: brief "Updated" / "Failed" after a refresh the user asked for.
  const manualRefresh = useRef(false);
  const [refreshFlash, setRefreshFlash] = useState<null | "done" | "error">(null);
  useEffect(() => {
    if (query.isFetching || !manualRefresh.current) return;
    manualRefresh.current = false;
    setRefreshFlash(query.isError ? "error" : "done");
    const id = window.setTimeout(() => setRefreshFlash(null), 1800);
    return () => window.clearTimeout(id);
  }, [query.isFetching, query.isError]);
  function refresh() { void query.refetch(); worldQueries.filter(result => result.isError).forEach(result => { void result.refetch(); }); }

  const filterName = groups.find(group => group.location.key === instanceFilter)?.location.title;
  const updated = query.dataUpdatedAt ? new Date(query.dataUpdatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
  const updatedAgo = query.dataUpdatedAt ? (Date.now() - query.dataUpdatedAt < 45000 ? "just now" : `${formatDistanceToNowStrict(query.dataUpdatedAt)} ago`) : "";
  const hasFilters = !!(search || instanceFilter || placeFilter !== "any");
  const connection = demo ? { cls: "connection-preview", text: "Preview mode" }
    : query.isError ? { cls: "connection-error", text: "Connection interrupted" }
    : query.isFetching ? { cls: "connection-busy", text: "Updating…" }
    : { cls: "", text: "Connected" };

  const renderRow = (friend: Friend) => {
    const location = getFriendLocation(friend);
    const isFav = favorites.includes(friend.id);
    const presence = presenceLabel(friend);
    const note = notes[friend.id];
    const canJoin = !demo && !!location.instanceUrl;
    return (
      <ContextMenu key={friend.id}>
      <ContextMenuTrigger asChild>
      <article className={cn("friend-row", !friend.online && "is-offline")}
        onClick={event => { if (!(event.target as HTMLElement).closest("button, a, input, textarea")) setSelectedId(friend.id); }}>
        <div className="friend-identity">
          <button className="avatar-button" aria-label={`View ${friend.name}`} onClick={() => setSelectedId(friend.id)}><Portrait friend={friend} /></button>
          <div>
            <span className="friend-name-line">
              <button className="friend-name" onClick={() => setSelectedId(friend.id)}>{friend.name}</button>
              {note && <span className="friend-note-icon" title={`Your note: ${note}`} aria-label="Has a private note"><StickyNote size={13} /></span>}
            </span>
            <span className="friend-presence" title={friend.lastMessage}>
              <span className={cn(friend.online && "online-text", friend.online && friend.status && `status-text-${friend.status}`)}>{presence}</span>
              {friend.lastMessage && friend.lastMessage !== "No status" && <span className="friend-status-text"> · {friend.lastMessage}</span>}
            </span>
          </div>
        </div>
        <button className="friend-location" onClick={() => setSelectedId(friend.id)} aria-label={`${location.title}, ${location.kind === "world" ? location.region || "region not shared" : location.detail}`}>
          <span className={cn("location-symbol", `location-${location.kind}`)}><LocationIcon kind={location.kind} /></span>
          <span><strong>{location.title}</strong><small>{location.kind === "world" ? location.region || "Region not shared" : location.detail}</small></span>
        </button>
        <div className="friend-instance">
          {location.instanceNumber ? <><Badge variant="secondary">{location.access}</Badge><small>#{location.instanceNumber}</small></> : <span className="instance-placeholder">—</span>}
        </div>
        <div className="friend-actions">
          {canJoin && (
            <Button asChild variant="ghost" size="sm" className="join-button" title="Open this instance in VRChat">
              <a href={location.instanceUrl} target="_blank" rel="noreferrer" aria-label={`Join ${friend.name} in ${location.title}`}>Join <ArrowUpRight /></a>
            </Button>
          )}
          <Button variant="ghost" size="icon" className={cn("favorite-button", isFav && "is-favorite")} aria-label={`${isFav ? "Unfavorite" : "Favorite"} ${friend.name}`} aria-pressed={isFav} title={isFav ? "Remove from favorites" : "Add to favorites"} onClick={() => favorite(friend.id)}>
            <Star fill={isFav ? "currentColor" : "none"} />
          </Button>
          <Button variant="ghost" size="icon" className="details-button" aria-label={`Details for ${friend.name}`} title="Details (right-click for more)" onClick={() => setSelectedId(friend.id)}><ChevronRight /></Button>
        </div>
      </article>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-60">
        <ContextMenuLabel className="truncate">{friend.name}</ContextMenuLabel>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => setSelectedId(friend.id)}><ChevronRight className="mr-2 h-4 w-4" />View profile</ContextMenuItem>
        {canJoin && <ContextMenuItem onSelect={() => window.open(location.instanceUrl, "_blank", "noopener,noreferrer")}><ArrowUpRight className="mr-2 h-4 w-4" />Join in VRChat</ContextMenuItem>}
        <ContextMenuItem onSelect={() => { setReachKind("invite"); setSelectedId(friend.id); }}><UserPlus className="mr-2 h-4 w-4" />Invite…</ContextMenuItem>
        <ContextMenuItem onSelect={() => { setReachKind("request"); setSelectedId(friend.id); }}><MailPlus className="mr-2 h-4 w-4" />Request invite…</ContextMenuItem>
        <ContextMenuItem onSelect={() => favorite(friend.id)}><Star className="mr-2 h-4 w-4" />{isFav ? "Remove from favorites" : "Add to favorites"}</ContextMenuItem>
        {location.kind === "world" && <ContextMenuItem onSelect={() => showInstance(location.key)}><Users className="mr-2 h-4 w-4" />Who else is here?</ContextMenuItem>}
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => copy(friend.name, "Name")}><Copy className="mr-2 h-4 w-4" />Copy name</ContextMenuItem>
        {!demo && location.worldUrl && <ContextMenuItem onSelect={() => copy(location.worldUrl!, "World link")}><Copy className="mr-2 h-4 w-4" />Copy world link</ContextMenuItem>}
        {canJoin && <ContextMenuItem onSelect={() => copy(location.instanceUrl!, "Join link")}><Copy className="mr-2 h-4 w-4" />Copy join link</ContextMenuItem>}
      </ContextMenuContent>
      </ContextMenu>
    );
  };

  return <div className="app-shell">
    <a href="#friends-list" className="skip-link" onClick={event => { event.preventDefault(); scrollTo("friends-list"); searchRef.current?.focus({ preventScroll: true }); }}>Skip to friends list</a>
    {/* ---------------- Sidebar ---------------- */}
    <aside className="app-sidebar">
      <Link to="/" className="app-brand" aria-label="vrconnect home">
        <span className="brand-symbol"><Compass /></span>
        <span>vrconnect<span className="brand-caption">A little closer.</span></span>
      </Link>
      <div className="sidebar-section-label">Your space</div>
      <nav aria-label="Main navigation">
        <button aria-label="Friends" className={cn("sidebar-link", tab !== "favorites" && "selected")} onClick={() => resetFilters(tab === "favorites" ? "online" : tab)}>
          <Users /><span className="label-full">Friends</span><span className="label-short">Friends</span><span className="sidebar-count">{data.length}</span>
        </button>
        <button aria-label="Favorites" className={cn("sidebar-link", tab === "favorites" && "selected")} onClick={() => { resetFilters("favorites"); scrollTo("friends-list"); }}>
          <Star /><span className="label-full">Favorites</span><span className="label-short">Favorites</span><span className="sidebar-count">{favoriteCount}</span>
        </button>
        <button aria-label="Friend locations" className="sidebar-link" onClick={() => { setLocationsOpen(true); scrollTo("worlds"); }}>
          <Globe2 /><span className="label-full">Locations</span><span className="label-short">Places</span><span className="sidebar-count">{groups.length}</span>
        </button>
        <button aria-label="Groups and boops" className="sidebar-link" onClick={() => setGroupsOpen(true)}>
          <Hand /><span className="label-full">Groups &amp; boops</span><span className="label-short">Groups</span>
        </button>
        <button aria-label="Activity" className="sidebar-link" onClick={() => setActivityOpen(true)}>
          <ActivityIcon /><span className="label-full">Activity</span><span className="label-short">Activity</span>{todayCount > 0 && <span className="sidebar-count">{todayCount}</span>}
        </button>
        <button aria-label="Inbox" className="sidebar-link" onClick={() => setInboxOpen(true)}>
          <Bell /><span className="label-full">Inbox</span><span className="label-short">Inbox</span>{unreadCount > 0 && <span className="sidebar-badge" aria-hidden="true">{unreadCount > 99 ? "99+" : unreadCount}</span>}
        </button>
      </nav>
      <div className="sidebar-bottom">
        <div className="shortcut-hint"><span><kbd>Ctrl K</kbd> quick jump</span><span><kbd>/</kbd> search</span></div>
        <button aria-label="Settings" className="sidebar-link" onClick={() => setSettingsOpen(true)}><SettingsIcon /><span className="label-full">Settings</span></button>
        <button aria-label="How it works" className="sidebar-link" onClick={() => setHelp(true)}><CircleHelp /><span className="label-full">How it works</span></button>
        {demo ? (
          <Link to="/login" className="account-link">
            <span className="account-icon"><LogIn size={16} /></span>
            <span>Connect VRChat<small>See your real friends</small></span>
            <ChevronRight size={15} />
          </Link>
        ) : <ProfileButton />}
      </div>
    </aside>

    <div className="app-body">
      {/* ---------------- Top bar ---------------- */}
      <header className="app-topbar">
        <div className="breadcrumb">Your space <ChevronRight size={13} /><span>Friends</span></div>
        <div className="topbar-actions">
          <button className="quick-jump" onClick={() => setPaletteOpen(true)} aria-label="Quick jump"><Search size={15} /><span>Jump to…</span><kbd>Ctrl K</kbd></button>
          <span key={connection.text} className={cn("connection-state", connection.cls)} role="status" title={updated ? `Last update ${updated}` : undefined}><span className="connection-dot"><i aria-hidden="true" /></span><b style={{ fontWeight: 500 }}>{connection.text}</b></span>
          <ThemeToggle className="desktop-only" />
          <Button variant="ghost" size="icon" className="icon-button mobile-only" aria-label="Open settings" onClick={() => setSettingsOpen(true)}><SettingsIcon size={19} /></Button>
          <NotificationCenter open={inboxOpen} onOpenChange={setInboxOpen} warnings={notificationQuery.data?.warnings || []} items={allNotifications} readIds={inbox.readIds} dismissedIds={inbox.dismissedIds} onRead={inbox.markRead} onDismiss={inbox.dismiss} onRefresh={() => void notificationQuery.refetch()} loading={!demo && notificationQuery.isFetching} error={!demo && notificationQuery.isError} demo={demo} />
          <Button asChild size="sm" variant={demo ? "default" : "outline"}><Link to="/login">{demo ? "Connect VRChat" : "Account"}<ArrowUpRight size={14} /></Link></Button>
        </div>
      </header>

      <main className="app-main">
        {/* ---------------- Header + stats ---------------- */}
        <section className="heading-row">
          <div>
            <h1>Find your friends</h1>
            <p>See where everyone is and pick your next place to be.</p>
          </div>
          {!demo && (
            <div className="heading-actions">
              <Button variant="outline" className={cn("refresh-button", query.isFetching ? "is-busy" : refreshFlash && `is-${refreshFlash}`)}
                aria-label="Refresh friends" onClick={() => { manualRefresh.current = true; setRefreshFlash(null); refresh(); }} disabled={query.isFetching}>
                <span className="refresh-icon" key={query.isFetching ? "busy" : refreshFlash ?? "idle"}>
                  {!query.isFetching && refreshFlash === "done" ? <Check /> : !query.isFetching && refreshFlash === "error" ? <AlertTriangle /> : <RefreshCw />}
                </span>
                <span className="refresh-label" aria-live="polite">{query.isFetching ? "Refreshing…" : refreshFlash === "done" ? "Updated" : refreshFlash === "error" ? "Failed" : "Refresh"}</span>
              </Button>
            </div>
          )}
        </section>

        {demo && (
          <div className="preview-banner" role="note">
            <span className="preview-icon"><Sparkles size={18} /></span>
            <div><strong>Sample friends · preview only</strong><p>These people and worlds are fictional. Connect your VRChat account to see your real friends and where they are.</p></div>
            <Button asChild size="sm"><Link to="/login">Connect VRChat <ArrowUpRight /></Link></Button>
          </div>
        )}

        <section className="overview-strip" aria-label="Friend statistics">
          <button className="stat-tile" aria-pressed={tab === "online" && placeFilter === "any" && !instanceFilter} onClick={() => { resetFilters("online"); scrollTo("friends-list"); }}>
            <span className="stat-icon stat-online"><Users /></span><span><strong className={cn(noData && "stat-pending")}>{noData ? "–" : online}</strong><small>online now{joinMeCount > 0 && ` · ${joinMeCount} join me`}{webCount > 0 && ` · ${webCount} on web`}</small></span>
          </button>
          <button className="stat-tile" onClick={() => { setLocationsOpen(true); scrollTo("worlds"); }}>
            <span className="stat-icon stat-world"><Globe2 /></span><span><strong className={cn(noData && "stat-pending")}>{noData ? "–" : groups.length}</strong><small>shared {groups.length === 1 ? "location" : "locations"}</small></span>
          </button>
          <button className="stat-tile" aria-pressed={placeFilter === "private"} onClick={() => togglePlace("private")}>
            <span className="stat-icon stat-private"><LockKeyhole /></span><span><strong className={cn(noData && "stat-pending")}>{noData ? "–" : privateCount}</strong><small>in private</small></span>
          </button>
          <button className="stat-tile" aria-pressed={tab === "favorites"} onClick={() => { resetFilters(tab === "favorites" ? "online" : "favorites"); scrollTo("friends-list"); }}>
            <span className="stat-icon stat-fav"><Star /></span><span><strong className={cn(noData && "stat-pending")}>{noData ? "–" : favoriteCount}</strong><small>favorites</small></span>
          </button>
        </section>
        {!demo && <p className="overview-note">
          {updated ? `Updated ${updatedAgo} (${updated}) · refreshes every ${settings.refreshSeconds < 60 ? `${settings.refreshSeconds}s` : settings.refreshSeconds === 60 ? "minute" : `${settings.refreshSeconds / 60} min`}` : "Waiting for your friends"}
        </p>}

        {query.isError && !demo && (
          <div className="connection-alert" role="alert">
            <AlertTriangle size={18} />
            <div>
              <strong>We couldn’t update your friends.</strong>
              <p>{query.data ? "Showing the last successful update. Locations may have changed." : (query.error instanceof Error ? query.error.message : "Please check your connection.")}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void query.refetch()} disabled={query.isFetching}>Try again</Button>
            <Button asChild variant="link" size="sm"><Link to="/login">Sign in</Link></Button>
            <Button variant="link" size="sm" onClick={() => setDemo(true)}>Preview</Button>
          </div>
        )}

        {/* ---------------- Shared locations ---------------- */}
        <section id="worlds" className="worlds-section">
          <div className="section-heading">
            <div><h2>Where everyone is <span>{groups.length}</span></h2><p>Click a place to filter your friends list to it.</p></div>
            <Button variant="ghost" className="locations-toggle" aria-expanded={locationsOpen} aria-controls="location-cards" onClick={() => setLocationsOpen(!locationsOpen)}>
              {locationsOpen ? "Hide locations" : "Show locations"}<ChevronDown size={16} className={cn(locationsOpen && "rotate-180")} />
            </Button>
          </div>
          {locationsOpen && <div id="location-cards">
            {groups.length > 0 ? <div className={cn("world-grid", !showAllWorlds && "is-collapsed")}>
              {(showAllWorlds ? groups : groups.slice(0, 4)).map(({ location, friends }, index) => (
                <button key={location.key} className={cn("world-card", instanceFilter === location.key && "world-selected")} aria-pressed={instanceFilter === location.key} aria-label={`Show ${friends.length} ${friends.length === 1 ? "friend" : "friends"} at ${location.title}, instance ${location.instanceNumber || "unknown"}${instanceCounts.get(location.key) ? `, ${instanceCounts.get(location.key)!.userCount} people in total` : ""}`} onClick={() => showInstance(location.key)}>
                  {demo ? <Landscape index={index} /> : <WorldPicture src={worldPictureUrl(worlds.get(location.worldId!)?.data)} name={location.title} loading={worlds.get(location.worldId!)?.isFetching} />}
                  <span className="world-access"><span />{location.access || "World"}</span>
                  {(() => {
                    const inst = instanceCounts.get(location.key);
                    // Never show fewer people than the friends we can see there
                    const people = inst ? Math.max(inst.userCount, friends.length) : friends.length;
                    const label = inst
                      ? `${people} ${people === 1 ? "person" : "people"} in this instance${inst.capacity ? ` (max ${inst.capacity})` : ""} · ${friends.length} ${friends.length === 1 ? "friend" : "friends"}`
                      : `${friends.length} ${friends.length === 1 ? "friend" : "friends"} here`;
                    // Top: everyone in the instance / max capacity. Below: how many of them are your friends.
                    return <>
                      <span className="world-count" title={label}><Users size={12} />{inst ? people : "?"}{inst?.capacity ? <small className="world-count-cap">/{inst.capacity}</small> : null}</span>
                      <span className="world-count world-friends" title={`${friends.length} ${friends.length === 1 ? "friend" : "friends"} here`}><UserCheck size={12} />{friends.length}</span>
                    </>;
                  })()}
                  <span className="world-card-body">
                    <span className="world-title"><span>{location.title}</span>{instanceFilter === location.key ? <Check size={15} className="world-check" /> : <ListFilter size={15} />}</span>
                    <span className="world-detail">{[location.instanceNumber ? `Instance #${location.instanceNumber}` : "Instance unavailable", location.region].filter(Boolean).join(" · ")}</span>
                    <span className="world-people">
                      <span className="avatar-stack">{friends.slice(0, 4).map(friend => <Portrait friend={friend} key={friend.id} />)}</span>
                      <span>{friends.slice(0, 2).map(f => f.name).join(", ")}{friends.length > 2 ? ` +${friends.length - 2}` : ""}</span>
                    </span>
                  </span>
                </button>
              ))}
            </div> : <div className="worlds-empty">
              <Globe2 size={26} />
              <p>{!demo && query.isFetching ? "Finding shared locations…" : query.isError && !demo ? "Connect to load world pictures." : "No shared worlds right now."}</p>
              <span>Private and unavailable locations still appear in your friends list.</span>
            </div>}
            {groups.length > 4 && <Button className="more-locations" variant="ghost" onClick={() => setShowAllWorlds(!showAllWorlds)}>
              {showAllWorlds ? "Show fewer locations" : `See all ${groups.length} locations`}<ChevronDown size={16} className={cn(showAllWorlds && "rotate-180")} />
            </Button>}
          </div>}
        </section>

        {/* ---------------- Friends ---------------- */}
        <section id="friends-list" className="friends-section">
          <div className="section-heading">
            <div><h2>Your friends <span>{data.length}</span></h2><p>Online friends first. Click anyone for details.</p></div>
            <Button variant="outline" size="sm" onClick={() => setGroupsOpen(true)}><Hand /> Groups &amp; boops</Button>
          </div>
          <Tabs value={tab} onValueChange={setTab}>
          <div className="friends-toolbar">
              <TabsList aria-label="Friend filters">
                <TabsTrigger value="online">Online <span className="tab-number">{online}</span></TabsTrigger>
                <TabsTrigger value="all">All <span className="tab-number">{data.length}</span></TabsTrigger>
                <TabsTrigger value="favorites">Favorites <span className="tab-number">{favoriteCount}</span></TabsTrigger>
              </TabsList>
            <div className="toolbar-actions">
              <div className="friend-search">
                <Search size={15} />
                <Input ref={searchRef} aria-label="Search friends" placeholder="Search friends, worlds, notes…" value={search} onChange={event => setSearch(event.target.value)} onKeyDown={event => { if (event.key === "Escape") { setSearch(""); event.currentTarget.blur(); } }} />
                {search ? <button onClick={() => setSearch("")} aria-label="Clear search"><X size={14} /></button> : <kbd aria-hidden="true">/</kbd>}
              </div>
              <Select value={placeFilter} onValueChange={value => { setPlaceFilter(value); setInstanceFilter(null); if ((value === "offline" || value === "unknown") && tab === "online") setTab("all"); }}>
                <SelectTrigger aria-label="Filter by location" className="location-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">All locations</SelectItem><SelectItem value="world">In a world</SelectItem><SelectItem value="private">Private</SelectItem>
                  <SelectItem value="traveling">Changing worlds</SelectItem><SelectItem value="web">On the website</SelectItem><SelectItem value="unknown">Unavailable</SelectItem><SelectItem value="offline">Offline</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sort} onValueChange={value => setSort(value as SortMode)}>
                <SelectTrigger aria-label="Sort friends" className="sort-select"><ArrowUpDown size={14} /><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="presence">Online first</SelectItem><SelectItem value="place">By place</SelectItem><SelectItem value="name">Name A–Z</SelectItem>
                </SelectContent>
              </Select>
              <div className="view-toggle" role="group" aria-label="Display layout">
                <Button aria-label="List view" title="List view" aria-pressed={view === "list"} variant="ghost" size="icon" onClick={() => setView("list")}><List /></Button>
                <Button aria-label="Grid view" title="Grid view" aria-pressed={view === "grid"} variant="ghost" size="icon" onClick={() => setView("grid")}><LayoutGrid /></Button>
              </div>
            </div>
          </div>

          {["online", "all", "favorites"].map(value => <TabsContent key={value} value={value} className="friends-panel" tabIndex={-1}>{value === tab && <>
          {(instanceFilter || placeFilter !== "any") && <div className="flex flex-wrap gap-2">
            {instanceFilter && <div className="active-filter"><MapPin size={14} /><span>{filterName || "Selected location"}</span><button aria-label="Clear location filter" onClick={() => setInstanceFilter(null)}><X size={14} /></button></div>}
            {placeFilter !== "any" && <div className="active-filter"><LockKeyhole size={14} /><span>{({ world: "In a world", private: "Private", traveling: "Changing worlds", web: "On the website", unknown: "Unavailable", offline: "Offline" } as Record<string, string>)[placeFilter]}</span><button aria-label="Clear place filter" onClick={() => setPlaceFilter("any")}><X size={14} /></button></div>}
          </div>}

          {!demo && query.isFetching && !query.data ? <SkeletonRows /> : visible.length > 0 && (
            <div className={cn("friend-collection", view === "grid" && "card-layout", settings.compact && "is-compact")}>
              {view === "list" && <div className="list-heading" aria-hidden="true"><span>Friend</span><span>Current location</span><span>Instance</span><span>Actions</span></div>}
              {sections.map(section => <Fragment key={section.label || "all"}>
                {section.label && <div className={cn("list-group-label", sort === "place" && "is-place")}>{section.label}</div>}
                {section.friends.map(renderRow)}
              </Fragment>)}
            </div>
          )}
          {!visible.length && (demo || !query.isFetching) && <div className="empty-state">
            <Users size={26} />
            <h3>No friends here yet</h3>
            <p>{elsewhere > 0 ? `“${search.trim()}” isn’t in ${tab === "online" ? "your online friends" : "your favorites"}, but matches ${elsewhere} other ${elsewhere === 1 ? "friend" : "friends"}.` : hasFilters ? "Try a different name, world, or location filter." : tab === "favorites" ? "Tap the star on a friend to keep them close." : tab === "online" ? "Nobody is online right now." : "No friends match this view right now."}</p>
            {elsewhere > 0
              ? <Button size="sm" onClick={() => { setTab("all"); setPlaceFilter("any"); setInstanceFilter(null); }}>Show {elsewhere} {elsewhere === 1 ? "match" : "matches"} in all friends</Button>
              : <Button variant="outline" size="sm" onClick={() => resetFilters("all")}>{hasFilters ? "Clear filters" : "Show all friends"}</Button>}
          </div>}
          <div className="list-footer"><span role="status" aria-live="polite" aria-atomic="true">{visible.length} of {data.length} friends{!demo && " loaded"}{needle ? ` matching “${search.trim()}”` : ""}</span><span><LockKeyhole size={12} /> Only locations shared with you</span></div>
          </>}</TabsContent>)}
          </Tabs>
        </section>

        <footer className="app-footer"><span>Good company. Wherever you are.</span><span>Unofficial VRChat companion</span></footer>
      </main>
    </div>

    <ActivityTimeline open={activityOpen} onOpenChange={setActivityOpen} events={activity.events} favorites={favorites} demo={demo} picture={eventPicture}
      onFriend={setSelectedId} onPlace={showInstance} onClear={activity.clear} />

    <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} settings={settings} onChange={updateSettings} onHelp={() => { setSettingsOpen(false); setHelp(true); }} />

    <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} friends={data} places={groups} favorites={favorites} canRefresh={!demo}
      onFriend={setSelectedId} onPlace={showInstance} onAction={runAction} />

    <FriendGroups onNotify={inbox.notify} friends={data} demo={demo} open={groupsOpen} onOpenChange={setGroupsOpen} />

    {/* ---------------- Friend profile ---------------- */}
    <Dialog open={!!selected} onOpenChange={open => { if (!open) { setSelectedId(null); setReachKind("invite"); } }}>
      <DialogContent className="friend-dialog" onOpenAutoFocus={event => { event.preventDefault(); (event.currentTarget as HTMLElement).focus(); }}>
        <DialogHeader>
          <DialogTitle>Friend profile</DialogTitle>
          <DialogDescription>{demo ? "Sample profile in preview mode." : `Last updated ${updated || "just now"}. Location access is managed by VRChat.`}</DialogDescription>
        </DialogHeader>
        {selected && selectedLocation && <div className="profile-content">
          <Portrait friend={selected} large />
          <h2>{selected.name}</h2>
          <span className={cn("friend-presence", selected.online && "online-text", selected.online && selected.status && `status-text-${selected.status}`)}>{presenceLabel(selected)}</span>
          {selected.lastMessage && selected.lastMessage !== "No status" && <p className="profile-status">“{selected.lastMessage}”</p>}
          {selected.bio && selected.bio !== selected.lastMessage && <p className="profile-bio">{selected.bio}</p>}
          <div className="profile-location">
            {!demo && selectedLocation.worldId && <WorldPicture src={worldPictureUrl(worlds.get(selectedLocation.worldId)?.data)} name={selectedLocation.title} loading={worlds.get(selectedLocation.worldId)?.isFetching} />}
            <span className="profile-label">CURRENT LOCATION</span>
            <div><LocationIcon kind={selectedLocation.kind} /><h3>{selectedLocation.title}</h3></div>
            <p>{selectedLocation.detail}</p>
            {selectedLocation.worldId && <code>{selectedLocation.worldId}</code>}
            {!demo && selectedLocation.worldUrl && <div className="profile-links">
              {selectedLocation.instanceUrl && <Button asChild><a href={selectedLocation.instanceUrl} target="_blank" rel="noreferrer">Open instance <ArrowUpRight /></a></Button>}
              <Button asChild variant="outline"><a href={selectedLocation.worldUrl} target="_blank" rel="noreferrer">View world <ExternalLink /></a></Button>
            </div>}
            {!demo && selectedLocation.instanceUrl && <small>VRChat checks whether you can join this instance.</small>}
            {demo && selectedLocation.kind === "world" && <small>Illustrative location. Connect your account for real world links.</small>}
          </div>
          <ReachOut key={`${selected.id}-${reachKind}`} friendId={selected.id} friendName={selected.name} online={selected.online} demo={demo} onNotify={inbox.notify} initialKind={reachKind} />
          <div className="profile-activity">
            <div className="profile-activity-head">
              <span className="profile-label">Recent activity</span>
              {selectedMinutes !== null && <span className="profile-online-today">~{selectedMinutes >= 60 ? `${Math.floor(selectedMinutes / 60)} h ${selectedMinutes % 60} min` : `${selectedMinutes} min`} online today</span>}
            </div>
            {selectedEvents.length ? <ol className="timeline timeline-compact">{selectedEvents.slice(0, 4).map(event => <TimelineItem key={event.id} event={event} showName={false} picture={eventPicture} />)}</ol>
              : <p className="profile-activity-empty">Nothing recorded yet. Changes appear here while the dashboard is open.</p>}
            {selectedEvents.length > 4 && <Button variant="ghost" size="sm" className="justify-self-start text-primary" onClick={() => { setSelectedId(null); setActivityOpen(true); }}>See full timeline</Button>}
          </div>
          <div className="profile-note">
            <Label htmlFor="friend-note" className="profile-label">PRIVATE NOTE</Label>
            <Textarea id="friend-note" key={selected.id} defaultValue={notes[selected.id] || ""} maxLength={500} rows={2}
              placeholder="Only you can see this — e.g. where you met, what worlds they like…" onChange={event => setNote(selected.id, event.target.value)} />
          </div>
          <Button variant="outline" onClick={() => favorite(selected.id)}>{favorites.includes(selected.id) ? <Check /> : <Star />}{favorites.includes(selected.id) ? "Saved to favorites" : "Add to favorites"}</Button>
          {!demo && <Button asChild variant="link"><a href={`https://vrchat.com/home/user/${encodeURIComponent(selected.id)}`} target="_blank" rel="noreferrer">View VRChat profile <ArrowUpRight /></a></Button>}
        </div>}
      </DialogContent>
    </Dialog>

    {/* ---------------- Help ---------------- */}
    <Dialog open={help} onOpenChange={setHelp}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Your friends. Their places.</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>Connect your VRChat account to load your friends. Locations refresh every minute.</p>
              <p>Friends are grouped only when their exact world and instance match. Private locations are never guessed.</p>
              <p>World names and thumbnails load through your companion API. Favorites, groups and display preferences stay in this browser.</p>
              <p><strong className="text-foreground">Shortcuts:</strong> <kbd className="rounded border px-1.5">Ctrl K</kbd> quick jump to any friend, world or action. <kbd className="rounded border px-1.5">/</kbd> searches the list, <kbd className="rounded border px-1.5">Esc</kbd> clears it.</p>
              <p><strong className="text-foreground">Tips:</strong> right-click a friend to join, favorite or copy links. Click a stat card or a place to filter the list. Favorites coming online or changing world show up as alerts.</p>
            </div>
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  </div>;
}
