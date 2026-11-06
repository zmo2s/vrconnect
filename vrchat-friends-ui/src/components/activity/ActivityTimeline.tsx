import { useMemo, useState } from "react";

/** Returns the picture URL of an event's world, or a preview tone (0–2) in preview mode. */
export type EventPicture = (event: ActivityEvent) => { src?: string; tone?: number } | undefined;
import { format, formatDistanceToNowStrict, isToday, isYesterday } from "date-fns";
import { Activity, CircleDot, Globe2, LockKeyhole, LogOut, Search, Star, Trash2, X } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ActivityEvent, ActivityKind } from "@/lib/activity";
import { cn } from "@/lib/utils";
import { statusMeta } from "@/lib/vrc-status";

const kindMeta: Record<ActivityKind, { verb: string; icon: typeof Globe2 }> = {
  online: { verb: "came online", icon: CircleDot },
  offline: { verb: "went offline", icon: LogOut },
  moved: { verb: "joined", icon: Globe2 },
  private: { verb: "went private", icon: LockKeyhole },
  status: { verb: "is now", icon: Activity },
};

export function describe(event: ActivityEvent) {
  const { verb } = kindMeta[event.kind];
  if (event.kind === "moved") return `${verb} ${event.place ?? "a world"}`;
  if (event.kind === "status") return `${verb} ${event.detail ?? "online"}`;
  if (event.kind === "online" && event.place && !["Location unavailable", "Changing worlds", "Private location"].includes(event.place)) return `${verb} in ${event.place}`;
  if (event.kind === "offline" && event.place) return `${verb} (was in ${event.place})`;
  return verb;
}

function dayLabel(date: Date) {
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  return format(date, "EEEE d MMMM");
}

function Thumb({ src, tone, fallback }: { src?: string; tone?: number; fallback: React.ReactNode }) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) return <img className="timeline-thumb" src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />;
  if (tone !== undefined) return <span className={`timeline-thumb timeline-tone-${tone}`} />;
  return <>{fallback}</>;
}

/** "Join me" → timeline-status-joinme, so the dot uses the VRChat status colour. */
function statusClass(label?: string) {
  const key = (Object.keys(statusMeta) as (keyof typeof statusMeta)[]).find(k => statusMeta[k].label === label);
  return key ? `timeline-status-${key}` : undefined;
}

export function TimelineItem({ event, onFriend, onPlace, showName = true, picture }: { event: ActivityEvent; onFriend?: (id: string) => void; onPlace?: (key: string) => void; showName?: boolean; picture?: EventPicture }) {
  const Icon = kindMeta[event.kind].icon;
  const date = new Date(event.at);
  return (
    <li className={cn("timeline-item", `timeline-${event.kind}`, event.kind === "status" && statusClass(event.detail))}>
      {(() => {
        const pic = event.worldId ? picture?.(event) : undefined;
        const icon = <span className="timeline-dot" aria-hidden="true"><Icon size={14} /></span>;
        return pic ? <span className="timeline-thumb-wrap" aria-hidden="true"><Thumb src={pic.src} tone={pic.tone} fallback={icon} /><span className="timeline-badge"><Icon size={10} /></span></span> : icon;
      })()}
      <div className="timeline-body">
        <p>
          {showName && (onFriend
            ? <button className="timeline-name" onClick={() => onFriend(event.friendId)}>{event.friendName}</button>
            : <strong>{event.friendName}</strong>)}
          {showName && " "}{describe(event)}
        </p>
        <span className="timeline-meta">
          <time dateTime={event.at} title={date.toLocaleString()}>{format(date, "HH:mm")} · {formatDistanceToNowStrict(date, { addSuffix: true })}</time>
          {event.kind === "moved" && event.detail && <span> · {event.detail}</span>}
          {event.placeKey && onPlace && <button className="timeline-link" onClick={() => onPlace(event.placeKey!)}>Who’s there?</button>}
        </span>
      </div>
    </li>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  events: ActivityEvent[];
  favorites: string[];
  demo: boolean;
  onFriend: (id: string) => void;
  onPlace: (key: string) => void;
  onClear: () => void;
  picture?: EventPicture;
}

type Filter = "all" | "favorites" | "joins" | "presence";

export default function ActivityTimeline({ open, onOpenChange, events, favorites, demo, onFriend, onPlace, onClear, picture }: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const needle = search.trim().toLowerCase();

  const days = useMemo(() => {
    const visible = events.filter(event =>
      (filter === "all"
        || (filter === "favorites" && favorites.includes(event.friendId))
        || (filter === "joins" && (event.kind === "moved" || event.kind === "private"))
        || (filter === "presence" && (event.kind === "online" || event.kind === "offline")))
      && `${event.friendName} ${event.place ?? ""} ${event.detail ?? ""}`.toLowerCase().includes(needle));
    const groups = new Map<string, { label: string; items: ActivityEvent[] }>();
    for (const event of visible) {
      const date = new Date(event.at);
      const key = format(date, "yyyy-MM-dd");
      const group = groups.get(key) ?? { label: dayLabel(date), items: [] };
      group.items.push(event);
      groups.set(key, group);
    }
    return [...groups.values()];
  }, [events, filter, favorites, needle]);

  const count = days.reduce((n, day) => n + day.items.length, 0);
  const go = (fn: () => void) => { onOpenChange(false); fn(); };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="notification-drawer activity-drawer" aria-label="Friend activity">
        <div className="notification-heading">
          <div>
            <SheetTitle>Activity</SheetTitle>
            <SheetDescription>{demo ? "Sample timeline · preview only" : "Recorded by this dashboard while it’s open · last 14 days"}</SheetDescription>
          </div>
        </div>
        <div className="inbox-search">
          <Search size={18} />
          <Input aria-label="Search activity" placeholder="Search friends or worlds" value={search} onChange={event => setSearch(event.target.value)} />
          {search && <button aria-label="Clear activity search" onClick={() => setSearch("")}><X size={16} /></button>}
        </div>
        <div className="notification-controls">
          <div role="group" aria-label="Activity filters">
            {([["all", "All"], ["favorites", "Favorites"], ["joins", "Worlds"], ["presence", "Online / offline"]] as [Filter, string][]).map(([id, label]) => (
              <button key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}>{id === "favorites" && <Star size={13} className="mr-1 inline" />}{label}</button>
            ))}
          </div>
        </div>
        <div className="inbox-scroll">
          {days.map(day => (
            <section key={day.label} className="timeline-day" aria-label={day.label}>
              <h3>{day.label}</h3>
              <ol className="timeline">
                {day.items.map(event => <TimelineItem key={event.id} event={event} picture={picture} onFriend={id => go(() => onFriend(id))} onPlace={key => go(() => onPlace(key))} />)}
              </ol>
            </section>
          ))}
          {!count && (
            <div className="notifications-empty">
              <Activity size={29} />
              <h3>{events.length ? "Nothing matches" : "No activity yet"}</h3>
              <p>{events.length
                ? "Try another filter or name."
                : "Keep the dashboard open: each refresh records who comes online, goes offline or changes world. VRChat doesn’t keep this history itself."}</p>
            </div>
          )}
        </div>
        <div className="notification-footer">
          <span>{count} {count === 1 ? "event" : "events"}<small>Stored only in this browser.</small></span>
          {!demo && <button disabled={!events.length} onClick={onClear}><Trash2 size={14} className="mr-1 inline" />Clear history</button>}
        </div>
      </SheetContent>
    </Sheet>
  );
}
