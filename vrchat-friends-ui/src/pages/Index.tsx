import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueries } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowDownAZ, ArrowUpRight, Bell, ChevronDown, Check, ChevronRight, CircleHelp, Compass, ExternalLink, Globe2, LayoutGrid, List, Loader2, LockKeyhole, MapPin, RefreshCw, Search, Sparkles, Star, Users, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Friend, getFriends } from "@/data/mockData";
import { getWorldDetails, worldPictureUrl } from "@/data/worlds";
import FriendGroups from "@/components/friends/FriendGroups";
import WorldPicture from "@/components/worlds/WorldPicture";
import { sampleFriends } from "@/data/sampleFriends";
import { getFriendLocation, LocationKind } from "@/lib/friend-location";
import NotificationCenter from "@/components/notifications/NotificationCenter";
import { useNotifications } from "@/hooks/use-notifications";
import { getNotifications, incomingToApp } from "@/data/notifications";
import { cn } from "@/lib/utils";

function Portrait({ friend, large = false }: { friend: Friend; large?: boolean }) {
  const color = [...friend.name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 6;
  return <span className={cn("portrait", large && "portrait-large")}><Avatar className={`portrait-avatar tone-${color}`}><AvatarImage src={friend.avatar} alt="" /><AvatarFallback className="bg-transparent">{friend.name.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar><span className={cn("presence-dot", friend.online && "is-online")} /></span>;
}
function LocationIcon({ kind }: { kind: LocationKind }) {
  return kind === "private" ? <LockKeyhole size={16} /> : kind === "traveling" ? <RefreshCw size={16} /> : <MapPin size={16} />;
}
function Landscape({ index }: { index: number }) {
  return <div className={`landscape landscape-${index % 3}`} aria-hidden="true"><div className="landscape-sun" /><div className="landscape-hill hill-back" /><div className="landscape-hill hill-front" /><div className="landscape-water" /><div className="landscape-building building-one" /><div className="landscape-building building-two" /><div className="landscape-building building-three" /><div className="landscape-grain" /></div>;
}
export default function Index() {
  const [demo, setDemo] = useState(() => !localStorage.getItem("token") && localStorage.getItem("vrchat-session") !== "connected");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("online");
  const [view, setView] = useState("list");
  const [sort, setSort] = useState(false);
  const [placeFilter, setPlaceFilter] = useState("any");
  const [instanceFilter, setInstanceFilter] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [locationsOpen, setLocationsOpen] = useState(true);
  const [showAllWorlds, setShowAllWorlds] = useState(false);
  const [favorites, setFavorites] = useState<string[]>(() => {
    try { const value = JSON.parse(localStorage.getItem("vrc-favorites") || "[]"); return Array.isArray(value) ? value.filter(id => typeof id === "string") : []; }
    catch { return []; }
  });
  const query = useQuery({ queryKey: ["location-friends"], enabled: !demo, refetchInterval: 60000, retry: 1,
    queryFn: async () => { const lists = await Promise.all([getFriends(true), getFriends(false)]); return [...new Map(lists.flat().map(friend => [friend.id, friend])).values()]; },
  });
  const inbox = useNotifications(demo);
  const notificationQuery = useQuery({ queryKey: ["incoming-notifications"], queryFn: getNotifications, enabled: !demo, refetchInterval: 30000, retry: false });
  const connectionState = useRef<string | null>(null);
  useEffect(() => {
    if (demo) { connectionState.current = null; return; }
    const next = query.isError ? "error" : query.isSuccess ? "connected" : null;
    if (!next || next === connectionState.current) return;
    if (next === "error") inbox.notify({ title: "Connection interrupted", message: "Your friends could not be refreshed. Check your API connection or sign in again.", kind: "warning" });
    else if (connectionState.current === "error") inbox.notify({ title: "Back online", message: "Your friends are updating again.", kind: "success" });
    connectionState.current = next;
  }, [demo, query.isError, query.isSuccess, inbox.notify]);
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
  const selectedLocation = selected ? getFriendLocation(selected) : null;
  const online = data.filter(friend => friend.online).length;
  const groups = useMemo(() => {
    const locations = new Map<string, { location: ReturnType<typeof getFriendLocation>; friends: Friend[] }>();
    data.forEach(friend => { const location = getFriendLocation(friend); if (location.kind !== "world") return; const group = locations.get(location.key); if (group) group.friends.push(friend); else locations.set(location.key, { location, friends: [friend] }); });
    return [...locations.values()].sort((a, b) => b.friends.length - a.friends.length);
  }, [data]);
  const visible = data.filter(friend => {
    const location = getFriendLocation(friend);
    return (tab !== "online" || friend.online) && (tab !== "favorites" || favorites.includes(friend.id)) && (placeFilter === "any" || location.kind === placeFilter) && (!instanceFilter || location.key === instanceFilter) && `${friend.name} ${location.title} ${location.detail} ${location.worldId || ""}`.toLowerCase().includes(search.trim().toLowerCase());
  }).sort((a, b) => sort ? a.name.localeCompare(b.name) : Number(b.online) - Number(a.online));
  function favorite(id: string) {
    setFavorites(previous => { const next = previous.includes(id) ? previous.filter(value => value !== id) : [...previous, id]; try { localStorage.setItem("vrc-favorites", JSON.stringify(next)); } catch { /* Retain favorites for this session if browser storage is full. */ } return next; });
  }
  function resetFilters(nextTab = "online") { setTab(nextTab); setInstanceFilter(null); setPlaceFilter("any"); setSearch(""); }
  function showInstance(key: string) { const next = instanceFilter === key ? null : key; resetFilters("all"); setInstanceFilter(next); document.getElementById("friends-list")?.scrollIntoView({ behavior: "smooth", block: "start" }); }
  const filterName = groups.find(group => group.location.key === instanceFilter)?.location.title;
  const updated = query.dataUpdatedAt ? new Date(query.dataUpdatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
  return <div className="app-shell">
    <aside className="app-sidebar">
      <Link to="/" className="app-brand" aria-label="vrconnect home"><span className="brand-symbol"><Compass /></span><span>vrconnect<span className="brand-caption">A little closer.</span></span></Link>
      <div className="sidebar-section-label">Your space</div>
      <nav aria-label="Main navigation">
        <button aria-label="Friends" className={cn("sidebar-link", tab !== "favorites" && "selected")} onClick={() => resetFilters()}><Users size={19} /><span>Friends</span><span className="sidebar-count">{data.length}</span></button>
        <button aria-label="Favorites" className={cn("sidebar-link", tab === "favorites" && "selected")} onClick={() => resetFilters("favorites")}><Star size={19} /><span>Favorites</span><span className="sidebar-count">{data.filter(friend => favorites.includes(friend.id)).length}</span></button>
        <button aria-label="Groups and boops" className="sidebar-link" onClick={() => setGroupsOpen(true)}><Users size={19} /><span>Groups &amp; boops</span></button>
        <button aria-label="Friend locations" className="sidebar-link" onClick={() => { setLocationsOpen(true); document.getElementById("worlds")?.scrollIntoView({ behavior: "smooth" }); }}><Globe2 size={19} /><span>Friend locations</span></button>
        <button aria-label="Inbox" className="sidebar-link" onClick={() => setInboxOpen(true)}><Bell size={19} /><span>Inbox</span></button>
      </nav>
      <div className="sidebar-tip"><span className="tip-icon"><MapPin size={19} /></span><h3>Find your next hello.</h3><p>See where your friends are spending time, all in one place.</p></div>
      <div className="sidebar-bottom"><button aria-label="How it works" className="sidebar-link" onClick={() => setHelp(true)}><CircleHelp size={19} /><span>How it works</span></button><Link to="/login" className="account-link"><span className="account-icon"><Compass size={20} /></span><span>{demo ? "Your VRChat account" : "Account settings"}<small>{demo ? "Connect to find your friends" : "Manage your connection"}</small></span><ChevronRight size={15} /></Link></div>
    </aside>
    <div className="app-body">
      <header className="app-topbar"><div className="breadcrumb">Your space <ChevronRight size={13} /><span>Friends</span></div><div className="topbar-actions"><NotificationCenter open={inboxOpen} onOpenChange={setInboxOpen} warnings={notificationQuery.data?.warnings || []} items={[...inbox.items, ...(demo ? [] : notificationQuery.data?.items || []).map(item => incomingToApp(item, new Map(data.map(friend => [friend.id, friend.name]))))]} readIds={inbox.readIds} dismissedIds={inbox.dismissedIds} onRead={inbox.markRead} onDismiss={inbox.dismiss} onRefresh={() => void notificationQuery.refetch()} loading={!demo && notificationQuery.isFetching} error={!demo && notificationQuery.isError} demo={demo} /><span className={cn("connection-state", query.isError && !demo && "connection-error")}><span />{demo ? "Preview mode" : query.isError ? "Connection interrupted" : query.isFetching ? "Updating…" : "Connected"}</span><Button asChild size="sm" variant={demo ? "default" : "outline"}><Link to="/login">{demo ? "Connect VRChat" : "Account"}<ArrowUpRight size={14} /></Link></Button></div></header>
      <main className="app-main">
        <section className="heading-row"><div><span className="eyebrow-label">PEOPLE MAKE THE PLACE</span><h1>Find your friends.</h1><p>See where everyone is. Pick your next place to be.</p></div><Button variant="outline" className="refresh-button" aria-label={demo ? "Load my friends" : "Refresh friends"} onClick={() => { if (demo) setDemo(false); else { void query.refetch(); worldQueries.filter(result => result.isError).forEach(result => { void result.refetch(); }); } }} disabled={!demo && query.isFetching}>{!demo && query.isFetching ? <Loader2 className="animate-spin" /> : <RefreshCw />}<span>{demo ? "Load my friends" : "Refresh"}</span></Button></section>
        <section className="overview-strip" aria-label="Friend statistics"><div><span className="summary-dot" /><strong>{online}</strong><span>online now</span></div><div><Globe2 /><strong>{groups.length}</strong><span>shared {groups.length === 1 ? "location" : "locations"}</span></div><div><LockKeyhole /><strong>{data.filter(friend => getFriendLocation(friend).kind === "private").length}</strong><span>in private</span></div><span className="overview-note">{demo ? "Sample friends · preview only" : updated ? `Updated ${updated} · every minute` : "Waiting for your friends"}</span></section>
        {query.isError && !demo && <div className="connection-alert" role="alert"><div><strong>We couldn’t update your friends.</strong><p>{query.data ? "Showing the last successful update. Locations may have changed." : (query.error instanceof Error ? query.error.message : "Please check your connection.")}</p></div><Button variant="outline" onClick={() => void query.refetch()} disabled={query.isFetching}>Try again</Button><Button asChild variant="link"><Link to="/login">Sign in</Link></Button><Button variant="link" onClick={() => setDemo(true)}>Preview</Button></div>}
        <section id="worlds" className="worlds-section"><div className="section-heading"><div><h2>Where everyone is <span>{groups.length}</span></h2><p>Friends in the same instance, together.</p></div><Button variant="ghost" className="locations-toggle" aria-expanded={locationsOpen} aria-controls="location-cards" onClick={() => setLocationsOpen(!locationsOpen)}>{locationsOpen ? "Hide locations" : "Show locations"}<ChevronDown size={16} className={cn(locationsOpen && "rotate-180")} /></Button></div>
          {locationsOpen && <div id="location-cards">{groups.length > 0 ? <div className="world-grid">{(showAllWorlds ? groups : groups.slice(0, 3)).map(({ location, friends }, index) => <button key={location.key} className={cn("world-card", instanceFilter === location.key && "world-selected")} aria-pressed={instanceFilter === location.key} aria-label={`Show ${friends.length} ${friends.length === 1 ? "friend" : "friends"} at ${location.title}, instance ${location.instanceNumber || "unknown"}`} onClick={() => showInstance(location.key)}><>{demo ? <Landscape index={index} /> : <WorldPicture src={worldPictureUrl(worlds.get(location.worldId!)?.data)} name={location.title} loading={worlds.get(location.worldId!)?.isFetching} />}</><span className="world-access"><span />{location.access || "World"}</span><span className="world-card-body"><span className="world-title">{location.title}<ArrowUpRight size={16} /></span><span className="world-detail">{[location.instanceNumber ? `Instance #${location.instanceNumber}` : "Instance unavailable", location.region].filter(Boolean).join(" · ")}</span><span className="world-people"><span className="avatar-stack">{friends.slice(0, 3).map(friend => <Portrait friend={friend} key={friend.id} />)}</span><span>{friends.length} {friends.length === 1 ? "friend" : "friends"} here</span><ChevronRight size={16} /></span></span></button>)}</div> : <div className="worlds-empty"><Globe2 size={28} /><p>{!demo && query.isFetching ? "Finding shared locations…" : query.isError && !demo ? "Connect to load world pictures." : "No shared worlds right now."}</p><span>Private and unavailable locations still appear in your friends list.</span></div>}{groups.length > 3 && <Button className="more-locations" variant="ghost" onClick={() => setShowAllWorlds(!showAllWorlds)}>{showAllWorlds ? "Show fewer locations" : `See all ${groups.length} locations`}<ChevronDown size={16} className={cn(showAllWorlds && "rotate-180")} /></Button>}</div>}
        </section>
        <section id="friends-list" className="friends-section"><div className="section-heading"><div><h2>Your friends <span>{data.length}</span></h2><p>The people you came here for.</p></div><Button variant="outline" onClick={() => setGroupsOpen(true)}><Users /> Groups &amp; boops</Button></div>
          <div className="friends-toolbar"><Tabs value={tab} onValueChange={setTab}><TabsList aria-label="Friend filters"><TabsTrigger value="online">Online <span className="tab-number">{online}</span></TabsTrigger><TabsTrigger value="all">All friends</TabsTrigger><TabsTrigger value="favorites">Favorites</TabsTrigger></TabsList></Tabs><div className="toolbar-actions"><div className="friend-search"><Search size={16} /><Input aria-label="Search friends" placeholder="Search friends or worlds" value={search} onChange={event => setSearch(event.target.value)} />{search && <button onClick={() => setSearch("")} aria-label="Clear search"><X size={14} /></button>}</div><Select value={placeFilter} onValueChange={value => { setPlaceFilter(value); setInstanceFilter(null); if ((value === "offline" || value === "unknown") && tab === "online") setTab("all"); }}><SelectTrigger aria-label="Filter by location" className="location-select"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="any">All locations</SelectItem><SelectItem value="world">In a world</SelectItem><SelectItem value="private">Private</SelectItem><SelectItem value="traveling">Changing worlds</SelectItem><SelectItem value="unknown">Unavailable</SelectItem><SelectItem value="offline">Offline</SelectItem></SelectContent></Select><Button aria-label="Sort friends alphabetically" aria-pressed={sort} variant={sort ? "secondary" : "ghost"} size="icon" onClick={() => setSort(!sort)}><ArrowDownAZ /></Button><div className="view-toggle" role="group" aria-label="Display layout"><Button aria-label="List view" aria-pressed={view === "list"} variant={view === "list" ? "secondary" : "ghost"} size="icon" onClick={() => setView("list")}><List /></Button><Button aria-label="Grid view" aria-pressed={view === "grid"} variant={view === "grid" ? "secondary" : "ghost"} size="icon" onClick={() => setView("grid")}><LayoutGrid /></Button></div></div></div>
          {instanceFilter && <div className="active-filter"><MapPin size={14} /><span>{filterName || "Selected location"}</span><button aria-label="Clear location filter" onClick={() => setInstanceFilter(null)}><X size={14} /></button></div>}
          {!demo && query.isFetching && !query.data ? <div className="empty-state" role="status"><Loader2 className="animate-spin" /><h3>Finding your people…</h3></div> : <div className={cn("friend-collection", view === "grid" && "card-layout")}>
            {view === "list" && visible.length > 0 && <div className="list-heading" aria-hidden="true"><span>FRIEND</span><span>CURRENT LOCATION</span><span>INSTANCE</span><span /></div>}
            {visible.map(friend => { const location = getFriendLocation(friend); return <article className="friend-row" key={friend.id}><div className="friend-identity"><button className="avatar-button" aria-label={`View ${friend.name}`} onClick={() => setSelectedId(friend.id)}><Portrait friend={friend} /></button><div><button className="friend-name" onClick={() => setSelectedId(friend.id)}>{friend.name}</button><span className={cn("friend-presence", friend.online && "online-text")}>{friend.online ? "Online" : location.kind === "unknown" ? "Presence unknown" : "Offline"}</span></div></div><button className="friend-location" onClick={() => setSelectedId(friend.id)}><span className={cn("location-symbol", `location-${location.kind}`)}><LocationIcon kind={location.kind} /></span><span><strong>{location.title}</strong><small>{location.kind === "world" ? location.region || "Region not shared" : location.detail}</small></span></button><div className="friend-instance">{location.instanceNumber ? <><Badge variant="secondary">{location.access}</Badge><small>#{location.instanceNumber}</small></> : <span className="instance-placeholder">—</span>}</div><div className="friend-actions"><Button variant="ghost" size="icon" className={cn("favorite-button", favorites.includes(friend.id) && "is-favorite")} aria-label={`${favorites.includes(friend.id) ? "Unfavorite" : "Favorite"} ${friend.name}`} aria-pressed={favorites.includes(friend.id)} onClick={() => favorite(friend.id)}><Star fill={favorites.includes(friend.id) ? "currentColor" : "none"} /></Button><Button variant="ghost" size="icon" aria-label={`Details for ${friend.name}`} onClick={() => setSelectedId(friend.id)}><ChevronRight /></Button></div></article>; })}
          </div>}
          {!visible.length && (demo || !query.isFetching) && <div className="empty-state"><Users /><h3>No friends here yet</h3><p>{search || instanceFilter || placeFilter !== "any" ? "Try a different name, world, or location filter." : tab === "favorites" ? "Tap the star on a friend to keep them close." : "No friends match this view right now."}</p><Button variant="outline" onClick={() => resetFilters("all")}>Show all friends</Button></div>}
          <div className="list-footer"><span>{visible.length} of {data.length} friends{!demo && " loaded"}</span><span><LockKeyhole size={12} /> Only locations shared with you</span></div>
        </section>
        <footer className="app-footer"><span>Good company. Wherever you are.</span><span>Unofficial VRChat companion</span></footer>
      </main>
    </div>
    <FriendGroups onNotify={inbox.notify} friends={data} demo={demo} open={groupsOpen} onOpenChange={setGroupsOpen} />
    <Dialog open={!!selected} onOpenChange={open => !open && setSelectedId(null)}><DialogContent className="friend-dialog"><DialogHeader><DialogTitle>Friend profile</DialogTitle><DialogDescription>{demo ? "Sample profile in preview mode." : `Last updated ${updated || "just now"}. Location access is managed by VRChat.`}</DialogDescription></DialogHeader>{selected && selectedLocation && <div className="profile-content"><Portrait friend={selected} large /><h2>{selected.name}</h2><span className={cn("friend-presence", selected.online && "online-text")}>{selected.online ? "Online" : "Offline"}</span><p className="profile-status">{selected.lastMessage}</p><div className="profile-location">{!demo && selectedLocation.worldId && <WorldPicture src={worldPictureUrl(worlds.get(selectedLocation.worldId)?.data)} name={selectedLocation.title} loading={worlds.get(selectedLocation.worldId)?.isFetching} />}<span className="profile-label">CURRENT LOCATION</span><div><LocationIcon kind={selectedLocation.kind} /><h3>{selectedLocation.title}</h3></div><p>{selectedLocation.detail}</p>{selectedLocation.worldId && <code>{selectedLocation.worldId}</code>}{!demo && selectedLocation.worldUrl && <div className="profile-links"><Button asChild variant="outline"><a href={selectedLocation.worldUrl} target="_blank" rel="noreferrer">View world <ExternalLink /></a></Button>{selectedLocation.instanceUrl && <Button asChild><a href={selectedLocation.instanceUrl} target="_blank" rel="noreferrer">Open instance <ArrowUpRight /></a></Button>}</div>}{!demo && selectedLocation.instanceUrl && <small>VRChat checks whether you can join this instance.</small>}{demo && selectedLocation.kind === "world" && <small>Illustrative location. Connect your account for real world links.</small>}</div><Button variant="outline" onClick={() => favorite(selected.id)}>{favorites.includes(selected.id) ? <Check /> : <Star />}{favorites.includes(selected.id) ? "Saved to favorites" : "Add to favorites"}</Button>{!demo && <Button asChild variant="link"><a href={`https://vrchat.com/home/user/${encodeURIComponent(selected.id)}`} target="_blank" rel="noreferrer">View VRChat profile <ArrowUpRight /></a></Button>}</div>}</DialogContent></Dialog>
    <Dialog open={help} onOpenChange={setHelp}><DialogContent><DialogHeader><DialogTitle>Your friends. Their places.</DialogTitle><DialogDescription>Connect your VRChat account to load your friends. Locations refresh every minute. Friends are grouped only when their exact shared world and instance match. Private locations are never guessed. World names and thumbnails load through your companion API. If a world is inaccessible, its identifier and VRChat link remain available. Preview mode uses fictional people and worlds. Favorites stay in this browser.</DialogDescription></DialogHeader></DialogContent></Dialog>
  </div>;
}








