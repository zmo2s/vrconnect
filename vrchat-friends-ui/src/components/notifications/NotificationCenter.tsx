import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Bell, CheckCheck, Check, CircleAlert, Inbox, RefreshCw, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { AppNotification } from "@/data/notifications";
import { cn } from "@/lib/utils";
interface Props { open?: boolean; onOpenChange?: (open: boolean) => void; warnings?: string[]; items: AppNotification[]; readIds: string[]; dismissedIds: string[]; onRead: (ids: string[]) => void; onDismiss: (ids: string[]) => void; onRefresh: () => void; loading: boolean; error: boolean; demo: boolean; }
export default function NotificationCenter({ open, onOpenChange, warnings = [], items, readIds, dismissedIds, onRead, onDismiss, onRefresh, loading, error, demo }: Props) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const all = [...new Map(items.filter(item => !dismissedIds.includes(item.id)).map(item => [item.id, item])).values()].sort((a,b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
  const unread = all.filter(item => !item.seen && !readIds.includes(item.id));
  // Ring the bell when the unread count goes up (not on first render).
  const [ringing, setRinging] = useState(false);
  const previousUnread = useRef<number | null>(null);
  useEffect(() => {
    const count = unread.length;
    if (previousUnread.current !== null && count > previousUnread.current) {
      setRinging(false);
      requestAnimationFrame(() => setRinging(true));
    }
    previousUnread.current = count;
  }, [unread.length]);
  useEffect(() => { if (!ringing) return; const id = window.setTimeout(() => setRinging(false), 1200); return () => window.clearTimeout(id); }, [ringing]);
  const filtered = filter === "unread" ? unread : filter === "all" ? all : all.filter(item => filter === "app" ? item.source === "app" : filter === "groups" ? item.category === "group" || item.typeLabel === "Group invitation" : item.category === filter);
  const visible = filtered.filter(item => [item.title, item.message, item.sender, item.groupName, item.worldName].some(value => value?.toLowerCase().includes(search.trim().toLowerCase())));
  return <Sheet open={open} onOpenChange={onOpenChange}><SheetTrigger asChild><Button variant="ghost" size="icon" className={cn("notification-bell", ringing && "is-ringing", unread.length > 1 && "has-many")} aria-label={`Notifications, ${unread.length} unread`}><span className="bell-icon"><Bell size={19} /></span>{unread.length > 0 && <span key={unread.length} className="notification-count">{unread.length > 99 ? "99+" : unread.length}</span>}</Button></SheetTrigger><SheetContent className="notification-drawer" aria-label="Notification center">
    <div className="notification-heading"><div><SheetTitle>Notifications</SheetTitle><SheetDescription>{unread.length ? `${unread.length} unread` : "You’re all caught up"}</SheetDescription></div><Button size="icon" variant="ghost" aria-label="Refresh notifications" onClick={onRefresh} disabled={demo || loading}><RefreshCw size={16} className={cn(loading && "animate-spin")} /></Button></div>
    <div className="inbox-search"><Search size={18} /><Input autoFocus aria-label="Search notifications" placeholder="Search messages, people, or groups" value={search} onChange={event => setSearch(event.target.value)} />{search && <button aria-label="Clear notification search" onClick={() => setSearch("")}><X size={16} /></button>}</div>
    <div className="notification-controls"><div role="group" aria-label="Notification filters"><button aria-pressed={filter === "all"} onClick={() => setFilter("all")}>All</button><button aria-pressed={filter === "unread"} onClick={() => setFilter("unread")}>Unread</button>{[{ id: "invitation", label: "Invitations" }, { id: "groups", label: "Groups" }, { id: "boop", label: "Boops" }, { id: "app", label: "App" }].map(tab => <button key={tab.id} aria-pressed={filter === tab.id} onClick={() => setFilter(tab.id)}>{tab.label}</button>)}</div><button disabled={!unread.length} onClick={() => onRead(unread.map(item => item.id))}><CheckCheck size={14} /> Mark all read</button></div>
    <div className="inbox-scroll">{demo && <div className="notification-fetch-error">Preview mode shows app activity only. Connect VRChat to load your invitations, group announcements, and boops. <a href="/login" className="notification-open">Connect VRChat</a></div>}
    {error && !demo && <p role="alert" className="notification-fetch-error">Couldn’t load VRChat notifications. Sign in or retry. App activity remains available.</p>}
    {!demo && warnings.map(warning => <p key={warning} role="status" className="notification-fetch-error">{warning}</p>)}<div className="notification-list">{visible.map(item => { const isUnread = !item.seen && !readIds.includes(item.id); return <article key={item.id} className={cn("notification-item", isUnread && "unread")}><span className={`notification-icon notification-${item.kind}`}>{item.kind === "success" ? <Check size={17} /> : item.kind === "warning" ? <CircleAlert size={17} /> : <Bell size={17} />}</span><div className="notification-copy"><h3>{item.title}</h3>{item.typeLabel && <span className="notification-type">{item.typeLabel}</span>}{item.imageUrl && <NotificationImage src={item.imageUrl} title={item.title} />}<p>{item.message}</p>{(item.sender || item.groupName || item.worldName) && <dl className="notification-details">{item.sender && <><dt>From</dt><dd>{item.sender}</dd></>}{item.groupName && <><dt>Group</dt><dd>{item.groupName}</dd></>}{item.worldName && <><dt>World</dt><dd>{item.worldName}</dd></>}</dl>}{item.href && <a className="notification-open" href={item.href} target="_blank" rel="noreferrer">{item.linkLabel || "Open in VRChat"} ↗</a>}<span>{item.source === "vrchat" ? "VRChat" : "App"} · {Number.isFinite(Date.parse(item.createdAt)) ? new Date(item.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "Time unavailable"}</span>{isUnread && <button onClick={() => onRead([item.id])}>Mark read</button>}</div><button className="notification-dismiss" aria-label={`Dismiss ${item.title}`} onClick={() => onDismiss([item.id])}><X size={14} /></button></article>; })}{!visible.length && <div className="notifications-empty"><Inbox size={29} /><h3>{loading ? "Checking notifications…" : search ? "No matching notifications" : filter === "unread" ? "All caught up" : "Nothing here yet"}</h3><p>{search ? "Try another person, group, or keyword." : demo ? "Save a group to see your first app notification." : "Invitations, group announcements, boops, and other available VRChat notifications appear here."}</p></div>}</div>
    </div><div className="notification-footer"><span>{demo ? "Preview activity" : "Checks every 30 seconds while open"}<small>Read and dismiss actions apply only in this app.</small></span><button disabled={!all.length} onClick={() => onDismiss(all.map(item => item.id))}>Clear all</button></div>
  </SheetContent></Sheet>;
}

function NotificationImage({ src, title }: { src: string; title: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? null : <img className="notification-image" src={src} alt={title} loading="lazy" onError={() => setFailed(true)} />;
}

