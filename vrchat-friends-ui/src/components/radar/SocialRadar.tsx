import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Crosshair, ListFilter, Loader2, Minus, Plus, Search, UserRound, Users, X } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import type { Friend } from "@/data/mockData";
import type { ActivityEvent } from "@/lib/activity";
import type { FriendLocation } from "@/lib/friend-location";
import { getFriendLocation } from "@/lib/friend-location";
import { getMyProfile } from "@/data/profile";
import { statusMeta } from "@/lib/vrc-status";
import { cn } from "@/lib/utils";
import "./social-radar.css";

// three.js is heavy: load the 3D scene only when the radar opens in 3D.
const Radar3D = lazy(() => import("./Radar3D"));

/* ---------- types ---------- */

export interface RadarPlace {
  location: FriendLocation;
  friends: Friend[];
  /** Everyone in the instance (friends or not), when known. */
  people?: number;
  capacity?: number;
  picture?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  friends: Friend[];
  places: RadarPlace[];
  favorites: string[];
  events: ActivityEvent[];
  demo: boolean;
  onFriend: (id: string) => void;
  onPlace: (key: string) => void;
}

export interface Point { x: number; y: number }

/* ---------- layout ---------- */

/** Orbit radii, closest friends first. */
export const RINGS = [125, 215, 305];
const FRIEND_R = 14;
const VIEW = 380;

const hash = (text: string) => [...text].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 7);
const PLANET_HUES = [14, 160, 210, 268, 330, 40];
const planetHue = (key: string) => PLANET_HUES[hash(key) % PLANET_HUES.length];

/**
 * How close a friend is, from what this dashboard knows: favorites, and how often
 * they showed up in the activity timeline (14 days kept locally).
 */
function closeness(friend: Friend, favorites: string[], counts: Map<string, number>) {
  return (favorites.includes(friend.id) ? 6 : 0) + Math.log2(1 + (counts.get(friend.id) ?? 0));
}

/** Case- and accent-insensitive form of a name, for search. */
const normalize = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const polar = (radius: number, angle: number): Point => ({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });

/** Push nodes on the same ring apart so avatars never overlap. */
function spread(items: { id: string; angle: number }[], radius: number) {
  if (items.length < 2) return items;
  const minGap = Math.min((FRIEND_R * 2 + 8) / radius, (Math.PI * 2) / items.length);
  const sorted = [...items].sort((a, b) => a.angle - b.angle);
  for (let pass = 0; pass < 40; pass++) {
    let moved = false;
    for (let i = 0; i < sorted.length; i++) {
      const a = sorted[i], b = sorted[(i + 1) % sorted.length];
      let gap = b.angle - a.angle;
      if (i === sorted.length - 1) gap += Math.PI * 2;
      if (gap < minGap) {
        const push = (minGap - gap) / 2;
        a.angle -= push; b.angle += push; moved = true;
      }
    }
    if (!moved) break;
  }
  return sorted;
}

function useLayout(friends: Friend[], places: RadarPlace[], favorites: string[], events: ActivityEvent[]) {
  return useMemo(() => {
    const counts = new Map<string, number>();
    events.forEach(event => counts.set(event.friendId, (counts.get(event.friendId) ?? 0) + 1));

    const connected = friends.filter(friend => friend.online || friend.onWeb);
    const ranked = [...connected].sort((a, b) => closeness(b, favorites, counts) - closeness(a, favorites, counts) || a.name.localeCompare(b.name));
    // Inner ring: the closest few. Middle: the next ones. Outer: everyone else.
    const innerSize = Math.max(1, Math.min(6, Math.round(ranked.length * 0.2)));
    const middleSize = Math.min(16, Math.round(ranked.length * 0.35));
    const ringOf = new Map(ranked.map((friend, index) => [friend.id, index < innerSize ? 0 : index < innerSize + middleSize ? 1 : 2]));

    const shown = places.filter(place => place.friends.some(friend => ringOf.has(friend.id)));
    const planets = shown.map((place, index) => {
      const angle = -Math.PI / 2 + (index / Math.max(1, shown.length)) * Math.PI * 2 + (shown.length > 1 ? 0 : 0.6);
      const radius = shown.length > 8 && index % 2 ? 175 : 262;
      const people = Math.max(place.people ?? 0, place.friends.length);
      return { ...place, angle, people, r: Math.min(42, 15 + Math.sqrt(people) * 4.2), pos: polar(radius, angle), hue: planetHue(place.location.key) };
    });
    const planetOf = new Map<string, (typeof planets)[number]>();
    planets.forEach(planet => planet.friends.forEach(friend => planetOf.set(friend.id, planet)));

    // Friends in a shared world gather around their planet; the others fill the gaps.
    const byRing: { id: string; angle: number }[][] = [[], [], []];
    const clusterIndex = new Map<string, number>();
    let loose = 0;
    ranked.forEach(friend => {
      const ring = ringOf.get(friend.id)!;
      const radius = RINGS[ring];
      const planet = planetOf.get(friend.id);
      let angle: number;
      if (planet) {
        // Flank the planet on both sides instead of sitting on top of it.
        const k = clusterIndex.get(planet.location.key) ?? 0;
        clusterIndex.set(planet.location.key, k + 1);
        // Friends further out than the planet leave room for its label.
        const base = (planet.r + FRIEND_R + 10 + (radius > Math.hypot(planet.pos.x, planet.pos.y) ? 40 : 0)) / radius, gap = (FRIEND_R * 2 + 10) / radius;
        angle = planet.angle + (k % 2 ? 1 : -1) * (base + Math.floor(k / 2) * gap);
      } else if (planets.length) {
        // Friends not in a shared world go in the gaps between planets.
        const gaps = planets.length, i = loose++;
        const slot = Math.floor(i / gaps);
        angle = planets[i % gaps].angle + Math.PI / gaps + (slot % 2 ? 1 : -1) * Math.ceil(slot / 2) * ((FRIEND_R * 2 + 10) / radius);
      } else {
        angle = -Math.PI / 2 + loose++ * 2.39996; // golden angle keeps friends evenly scattered
      }
      byRing[ring].push({ id: friend.id, angle });
    });
    const positions = new Map<string, Point>();
    byRing.forEach((items, ring) => spread(items, RINGS[ring]).forEach(item => positions.set(item.id, polar(RINGS[ring], item.angle))));

    return { connected: ranked, ringOf, planets, planetOf, positions };
  }, [friends, places, favorites, events]);
}

export type RadarLayout = ReturnType<typeof useLayout>;

const MODE_KEY = "vrconnect-radar-mode";
const SHOW_KEY = "vrconnect-radar-show";
/** What the radar draws: everything, only friends' avatars, or only worlds. */
export type RadarShow = "all" | "friends" | "worlds";
function readShow(): RadarShow {
  try { const saved = localStorage.getItem(SHOW_KEY); if (saved === "friends" || saved === "worlds") return saved; } catch { /* preference only */ }
  return "all";
}
function webglAvailable() {
  try { const canvas = document.createElement("canvas"); return !!(canvas.getContext("webgl2") || canvas.getContext("webgl")); }
  catch { return false; }
}
function readMode(): "3d" | "2d" {
  let saved: string | null = null;
  try { saved = localStorage.getItem(MODE_KEY); } catch { /* preference only */ }
  return saved === "2d" || !webglAvailable() ? "2d" : "3d";
}

/** Glides displayed positions toward their targets, so a friend changing world travels across the radar. */
function useGlide(targets: Map<string, Point>, enabled: boolean) {
  const [shown, setShown] = useState(targets);
  const current = useRef(targets);
  useEffect(() => {
    const reduced = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!enabled || reduced) { current.current = targets; setShown(targets); return; }
    let frame = 0;
    const step = () => {
      let settled = true;
      const next = new Map<string, Point>();
      targets.forEach((target, id) => {
        const from = current.current.get(id) ?? { x: target.x * 0.2, y: target.y * 0.2 };
        const x = from.x + (target.x - from.x) * 0.08, y = from.y + (target.y - from.y) * 0.08;
        if (Math.abs(target.x - x) + Math.abs(target.y - y) > 0.4) settled = false;
        next.set(id, { x, y });
      });
      current.current = next;
      setShown(next);
      if (!settled) frame = requestAnimationFrame(step);
      else { current.current = targets; setShown(targets); }
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [targets, enabled]);
  return shown;
}

/* ---------- component ---------- */

export default function SocialRadar({ open, onOpenChange, friends, places, favorites, events, demo, onFriend, onPlace }: Props) {
  const layout = useLayout(friends, places, favorites, events);
  const positions = useGlide(layout.positions, open);
  const me = useQuery({ queryKey: ["my-profile"], queryFn: getMyProfile, enabled: open && !demo, retry: false, staleTime: 60_000 });
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [view, setView] = useState({ k: 1, x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);
  const [mode, setMode] = useState<"3d" | "2d">(readMode);
  const [canUse3d] = useState(webglAvailable);
  const [resetSignal, setResetSignal] = useState(0);
  const reducedMotion = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [show, setShow] = useState<RadarShow>(readShow);
  const showFriends = show !== "worlds", showWorlds = show !== "friends";
  function switchShow(next: RadarShow) {
    setShow(next);
    if (next === "friends") setSelectedKey(null);
    if (next === "worlds") setHoverId(null);
    try { localStorage.setItem(SHOW_KEY, next); } catch { /* preference only */ }
  }
  function switchMode(next: "3d" | "2d") {
    setMode(next);
    try { localStorage.setItem(MODE_KEY, next); } catch { /* preference only */ }
  }

  // Friend search: matching friends light up, picking one flies the view to them.
  const [query, setQuery] = useState("");
  const [focusId, setFocusId] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const needle = normalize(query.trim());
  const matches = useMemo(() => {
    if (!needle) return [];
    const online = layout.connected.filter(friend => normalize(friend.name).includes(needle));
    const offline = friends.filter(friend => !layout.ringOf.has(friend.id) && normalize(friend.name).includes(needle));
    const rank = (friend: Friend) => (normalize(friend.name).startsWith(needle) ? 0 : 1);
    return [...online.sort((a, b) => rank(a) - rank(b)), ...offline.sort((a, b) => rank(a) - rank(b))].slice(0, 8);
  }, [needle, layout, friends]);
  const onlineMatches = matches.filter(friend => layout.ringOf.has(friend.id));

  const selected = layout.planets.find(planet => planet.location.key === selectedKey) ?? null;
  const hovered = hoverId ? layout.connected.find(friend => friend.id === hoverId) : undefined;
  const focused = focusId ? layout.connected.find(friend => friend.id === focusId) : undefined;
  const highlight = new Set<string>(
    selected ? selected.friends.map(friend => friend.id)
      : hovered && layout.planetOf.get(hovered.id) ? layout.planetOf.get(hovered.id)!.friends.map(f => f.id)
      : focused ? [focused.id]
      : onlineMatches.map(friend => friend.id));
  const tooltipFriend = hovered ?? focused;

  function locate(friend: Friend) {
    if (!layout.ringOf.has(friend.id)) return;
    setFocusId(friend.id);
    setSelectedKey(null);
    if (show === "worlds") switchShow("all");
    const p = layout.positions.get(friend.id);
    if (p && mode === "2d") setView(v => { const k = Math.max(v.k, 1.6); return { k, x: -p.x * k, y: -p.y * k }; });
  }
  function clearSearch() { setQuery(""); setFocusId(null); setActiveIndex(0); }
  function onSearchKey(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape" && (query || focusId)) { event.stopPropagation(); event.preventDefault(); clearSearch(); return; }
    if (!matches.length) return;
    if (event.key === "ArrowDown") { event.preventDefault(); setActiveIndex(i => (i + 1) % matches.length); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex(i => (i - 1 + matches.length) % matches.length); }
    else if (event.key === "Enter") {
      event.preventDefault();
      const friend = matches[Math.min(activeIndex, matches.length - 1)];
      // Enter on the friend already in focus opens their profile.
      if (friend.id === focusId) onFriend(friend.id); else locate(friend);
    }
  }
  const showAllNames = layout.connected.length <= 24;

  // Wheel zoom (needs a non-passive listener to stop the page scrolling).
  useEffect(() => {
    const svg = svgRef.current;
    if (!open || !svg) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      setView(v => ({ ...v, k: Math.min(3, Math.max(0.5, v.k * (event.deltaY < 0 ? 1.12 : 1 / 1.12))) }));
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [open, mode]);

  useEffect(() => { if (!open) { setSelectedKey(null); setHoverId(null); setQuery(""); setFocusId(null); } }, [open]);
  useEffect(() => { if (focusId && !focused) setFocusId(null); }, [focusId, focused]);
  useEffect(() => { setActiveIndex(0); }, [needle]);
  useEffect(() => { if (selectedKey && !selected) setSelectedKey(null); }, [selectedKey, selected]);

  const zoom = (factor: number) => setView(v => ({ ...v, k: Math.min(3, Math.max(0.5, v.k * factor)) }));
  const recenter = () => setView({ k: 1, x: 0, y: 0 });

  function onPointerDown(event: React.PointerEvent<SVGSVGElement>) {
    drag.current = { x: event.clientX, y: event.clientY, vx: view.x, vy: view.y, moved: false };
  }
  function onPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    const d = drag.current;
    if (!d || !svgRef.current) return;
    const scale = (VIEW * 2) / svgRef.current.getBoundingClientRect().width;
    const dx = (event.clientX - d.x) * scale, dy = (event.clientY - d.y) * scale;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
    if (!d.moved) { d.moved = true; svgRef.current.setPointerCapture(event.pointerId); }
    setView(v => ({ ...v, x: d.vx + dx, y: d.vy + dy }));
  }
  function onPointerUp() { setTimeout(() => { drag.current = null; }, 0); }
  const wasDrag = () => !!drag.current?.moved;

  const myName = demo ? "You" : me.data?.displayName ?? "You";
  const myStatus = demo ? "joinme" : me.data?.status ?? "active";
  const inWorlds = layout.planets.reduce((sum, planet) => sum + planet.friends.filter(f => layout.ringOf.has(f.id)).length, 0);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="radar-overlay" />
        <DialogPrimitive.Content className="radar-sheet" aria-describedby={undefined}>
          <div className="radar-stars" aria-hidden="true" />
          <header className="radar-header">
            <div>
              <DialogPrimitive.Title className="radar-title">Social radar <span className="radar-beta">Beta</span></DialogPrimitive.Title>
              <p className="radar-subtitle">You're at the centre. The closer the orbit, the more time you spend together.</p>
            </div>
            <div className="radar-mode" role="group" aria-label="Show">
              <button aria-pressed={show === "all"} onClick={() => switchShow("all")}>All</button>
              <button aria-pressed={show === "friends"} onClick={() => switchShow("friends")}>Friends</button>
              <button aria-pressed={show === "worlds"} onClick={() => switchShow("worlds")}>Worlds</button>
            </div>
            {canUse3d && <div className="radar-mode" role="group" aria-label="View">
              <button aria-pressed={mode === "3d"} onClick={() => switchMode("3d")}>3D</button>
              <button aria-pressed={mode === "2d"} onClick={() => switchMode("2d")}>2D</button>
            </div>}
            <span className="radar-live"><span className="radar-live-dot" />{layout.connected.length} online · {layout.planets.length} {layout.planets.length === 1 ? "world" : "worlds"}</span>
            <DialogPrimitive.Close className="radar-close" aria-label="Close radar"><X size={18} /></DialogPrimitive.Close>
          </header>

          <div className="radar-body">
            <div className="radar-stage">
              {mode === "3d" ? (
                <Suspense fallback={<div className="radar-loading"><Loader2 className="animate-spin" size={22} />Building your universe…</div>}>
                  <Radar3D layout={layout} positions={positions} favorites={favorites} selectedKey={selectedKey} focusId={focused?.id ?? null}
                    onSelect={key => { setSelectedKey(key); if (key === null) setFocusId(null); }}
                    hoverId={hoverId} onHover={setHoverId} highlight={highlight} onFriend={onFriend} show={show} resetSignal={resetSignal} reducedMotion={reducedMotion}
                    me={{ name: myName, status: myStatus, picture: demo ? undefined : me.data?.picture }} />
                </Suspense>
              ) : <svg ref={svgRef} className="radar-svg" viewBox={`${-VIEW} ${-VIEW} ${VIEW * 2} ${VIEW * 2}`} role="img" aria-label={`Radar of ${layout.connected.length} online friends across ${layout.planets.length} worlds`}
                onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp}
                onClick={() => { if (!wasDrag()) { setSelectedKey(null); setFocusId(null); } }}>
                <defs>
                  <radialGradient id="radar-core" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="hsl(250 90% 70% / .55)" />
                    <stop offset="100%" stopColor="hsl(250 90% 60% / 0)" />
                  </radialGradient>
                  <radialGradient id="radar-sweep-fill" cx="0%" cy="0%" r="100%">
                    <stop offset="0%" stopColor="hsl(190 100% 70% / .22)" />
                    <stop offset="100%" stopColor="hsl(190 100% 70% / 0)" />
                  </radialGradient>
                  {layout.planets.map(planet => <clipPath key={planet.location.key} id={`planet-${hash(planet.location.key)}`}><circle r={planet.r} /></clipPath>)}
                  {layout.connected.map(friend => <clipPath key={friend.id} id={`friend-${hash(friend.id)}`}><circle r={FRIEND_R - 2} /></clipPath>)}
                </defs>

                <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`} className="radar-world">
                  {/* orbits */}
                  <circle r={RINGS[2] + 50} className="radar-orbit radar-orbit-faint" />
                  {RINGS.map((radius, ring) => <circle key={radius} r={radius} className={cn("radar-orbit", `radar-orbit-${ring}`)} />)}
                  <g className="radar-sweep"><path d={`M0 0 L${RINGS[2] + 50} 0 A${RINGS[2] + 50} ${RINGS[2] + 50} 0 0 1 ${Math.cos(0.7) * (RINGS[2] + 50)} ${Math.sin(0.7) * (RINGS[2] + 50)} Z`} fill="url(#radar-sweep-fill)" /></g>

                  {/* links from friends to the world they're in */}
                  {show === "all" && layout.connected.map(friend => {
                    const planet = layout.planetOf.get(friend.id);
                    const p = positions.get(friend.id);
                    if (!planet || !p) return null;
                    const lit = highlight.has(friend.id);
                    return <line key={`l-${friend.id}`} x1={p.x} y1={p.y} x2={planet.pos.x} y2={planet.pos.y}
                      className={cn("radar-link", lit && "is-lit", highlight.size > 0 && !lit && "is-dim")} style={{ stroke: `hsl(${planet.hue} 90% 68%)` }} />;
                  })}

                  {/* worlds */}
                  {showWorlds && layout.planets.map(planet => {
                    const isSel = planet.location.key === selectedKey;
                    return (
                      <g key={planet.location.key} className={cn("radar-planet", isSel && "is-selected", highlight.size > 0 && !planet.friends.some(f => highlight.has(f.id)) && "is-dim")}
                        transform={`translate(${planet.pos.x} ${planet.pos.y})`} role="button" tabIndex={0}
                        aria-label={`${planet.location.title}: ${planet.friends.length} ${planet.friends.length === 1 ? "friend" : "friends"}, ${planet.people} people`}
                        onClick={event => { event.stopPropagation(); if (!wasDrag()) setSelectedKey(isSel ? null : planet.location.key); }}
                        onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedKey(isSel ? null : planet.location.key); } }}>
                        <circle r={planet.r + 16} className="radar-planet-halo" style={{ fill: `hsl(${planet.hue} 90% 60% / .16)` }} />
                        {isSel && <circle r={planet.r + 9} className="radar-planet-select" style={{ stroke: `hsl(${planet.hue} 95% 72%)` }} />}
                        <g className="radar-planet-body">
                          <circle r={planet.r} style={{ fill: `hsl(${planet.hue} 70% 42%)` }} />
                          {planet.picture && <image href={planet.picture} x={-planet.r * 1.6} y={-planet.r} width={planet.r * 3.2} height={planet.r * 2} preserveAspectRatio="xMidYMid slice" clipPath={`url(#planet-${hash(planet.location.key)})`} />}
                          <circle r={planet.r} className="radar-planet-shade" />
                        </g>
                        <ellipse rx={planet.r * 1.45} ry={planet.r * 0.32} className="radar-planet-ring" style={{ stroke: `hsl(${planet.hue} 90% 78% / .7)` }} />
                        <text x={Math.cos(planet.angle) * (planet.r + 22)} y={Math.sin(planet.angle) * (planet.r + 26) + 4}
                          className="radar-planet-label" style={{ textAnchor: Math.cos(planet.angle) > 0.45 ? "start" : Math.cos(planet.angle) < -0.45 ? "end" : "middle" }}>{planet.location.title.length > 22 ? `${planet.location.title.slice(0, 21)}…` : planet.location.title}</text>
                        <g transform={`translate(${planet.r * 0.78} ${-planet.r * 0.78})`} className="radar-planet-count">
                          <rect x={-13} y={-10} width={26} height={20} rx={10} />
                          <text y={4}>{planet.people}</text>
                        </g>
                      </g>
                    );
                  })}

                  {/* you */}
                  <circle r={70} fill="url(#radar-core)" className="radar-core-glow" />
                  <g className="radar-me">
                    <circle r={34} className={cn("radar-me-ring", `status-stroke-${myStatus}`)} />
                    <circle r={28} className="radar-me-body" />
                    {me.data?.picture ? <>
                      <clipPath id="radar-me-clip"><circle r={27} /></clipPath>
                      <image href={me.data.picture} x={-27} y={-27} width={54} height={54} preserveAspectRatio="xMidYMid slice" clipPath="url(#radar-me-clip)" />
                    </> : <text y={6} className="radar-me-text">You</text>}
                    <text y={56} className="radar-friend-label is-me">{myName}</text>
                  </g>

                  {/* friends */}
                  {showFriends && layout.connected.map(friend => {
                    const p = positions.get(friend.id);
                    if (!p) return null;
                    const status = friend.online ? friend.status ?? "active" : "web";
                    const lit = highlight.has(friend.id) || hoverId === friend.id;
                    const ring = layout.ringOf.get(friend.id)!;
                    const location = getFriendLocation(friend);
                    return (
                      <g key={friend.id} className={cn("radar-friend", lit && "is-lit", highlight.size > 0 && !lit && "is-dim")} transform={`translate(${p.x} ${p.y})`}
                        role="button" tabIndex={0} aria-label={`${friend.name}, ${friend.online ? statusMeta[friend.status ?? "active"].label : "on the website"}, ${location.title}`}
                        onPointerEnter={() => setHoverId(friend.id)} onPointerLeave={() => setHoverId(id => id === friend.id ? null : id)}
                        onFocus={() => setHoverId(friend.id)} onBlur={() => setHoverId(id => id === friend.id ? null : id)}
                        onClick={event => { event.stopPropagation(); if (!wasDrag()) onFriend(friend.id); }}
                        onKeyDown={event => { if (event.key === "Enter") onFriend(friend.id); }}>
                        <circle r={FRIEND_R + 6} className="radar-friend-hit" />
                        <circle r={FRIEND_R} className={cn("radar-friend-ring", `status-stroke-${status}`)} />
                        <circle r={FRIEND_R - 2} className="radar-friend-body" />
                        {friend.avatar
                          ? <image href={friend.avatar} x={-(FRIEND_R - 2)} y={-(FRIEND_R - 2)} width={(FRIEND_R - 2) * 2} height={(FRIEND_R - 2) * 2} preserveAspectRatio="xMidYMid slice" clipPath={`url(#friend-${hash(friend.id)})`} />
                          : <text y={4} className="radar-friend-initials">{friend.name.slice(0, 2).toUpperCase()}</text>}
                        {favorites.includes(friend.id) && <circle cx={FRIEND_R - 2} cy={-(FRIEND_R - 2)} r={4} className="radar-friend-fav" />}
                        {(showAllNames || lit || ring === 0) && <text y={FRIEND_R + 15} className="radar-friend-label">{friend.name.length > 14 ? `${friend.name.slice(0, 13)}…` : friend.name}</text>}
                      </g>
                    );
                  })}
                </g>
              </svg>}

              <div className="radar-search" role="search">
                <label className="radar-search-field">
                  <Search size={15} aria-hidden="true" />
                  <input ref={searchRef} type="search" value={query} placeholder="Find a friend…" aria-label="Find a friend on the radar"
                    role="combobox" aria-expanded={matches.length > 0 && !focused} aria-controls="radar-search-results" autoComplete="off" spellCheck={false}
                    aria-activedescendant={matches.length && !focused ? `radar-result-${matches[Math.min(activeIndex, matches.length - 1)].id}` : undefined}
                    onChange={event => { setQuery(event.target.value); setFocusId(null); }} onKeyDown={onSearchKey} />
                  {(query || focusId) && <button type="button" className="radar-search-clear" aria-label="Clear search" onClick={() => { clearSearch(); searchRef.current?.focus(); }}><X size={14} /></button>}
                </label>
                {needle && !focused && (
                  <ul id="radar-search-results" className="radar-search-results" role="listbox" aria-label="Matching friends">
                    {matches.length === 0 && <li className="radar-search-empty">No friend called “{query.trim()}”</li>}
                    {matches.map((friend, index) => {
                      const online = layout.ringOf.has(friend.id);
                      return (
                        <li key={friend.id} id={`radar-result-${friend.id}`} role="option" aria-selected={index === activeIndex} aria-disabled={!online}
                          className={cn("radar-search-result", index === activeIndex && "is-active", !online && "is-offline")}
                          onPointerEnter={() => setActiveIndex(index)}>
                          <button type="button" className="radar-search-locate" onClick={() => locate(friend)} disabled={!online} tabIndex={-1}>
                            <i className={online ? `status-bg-${friend.online ? friend.status ?? "active" : "web"}` : "radar-search-off"} />
                            {friend.avatar ? <img src={friend.avatar} alt="" /> : <span className="radar-search-initials">{friend.name.slice(0, 2).toUpperCase()}</span>}
                            <span className="radar-search-name"><strong>{friend.name}</strong><small>{online ? getFriendLocation(friend).title : "Offline · not on the radar"}</small></span>
                          </button>
                          <button type="button" className="radar-search-profile" aria-label={`Open ${friend.name}'s profile`} title="Open profile" tabIndex={-1} onClick={() => onFriend(friend.id)}><UserRound size={14} /></button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {tooltipFriend && (
                <div className="radar-tooltip" role="status">
                  <strong>{tooltipFriend.name}</strong>
                  <span className={cn(tooltipFriend.online && `status-text-${tooltipFriend.status ?? "active"}`)}>{tooltipFriend.online ? statusMeta[tooltipFriend.status ?? "active"].label : "On the website"}</span>
                  <small>{getFriendLocation(tooltipFriend).title}</small>
                  {tooltipFriend.lastMessage && tooltipFriend.lastMessage !== "No status" && <em>“{tooltipFriend.lastMessage}”</em>}
                  {!hovered && focused && <button type="button" className="radar-tooltip-action" onClick={() => onFriend(focused.id)}>Open profile <ArrowUpRight size={13} /></button>}
                </div>
              )}

              <div className="radar-controls" role="group" aria-label="View controls">
                {mode === "2d" && <>
                  <button onClick={() => zoom(1.2)} aria-label="Zoom in"><Plus size={16} /></button>
                  <button onClick={() => zoom(1 / 1.2)} aria-label="Zoom out"><Minus size={16} /></button>
                </>}
                <button onClick={() => { if (mode === "2d") recenter(); else { setSelectedKey(null); setResetSignal(n => n + 1); } }} aria-label="Recentre"><Crosshair size={16} /></button>
              </div>

              <ul className="radar-legend" aria-label="Status colours">
                <li><i className="status-bg-joinme" />Join me</li>
                <li><i className="status-bg-active" />Online</li>
                <li><i className="status-bg-askme" />Ask me</li>
                <li><i className="status-bg-busy" />Busy</li>
                <li><i className="status-bg-web" />Website</li>
              </ul>

              {show === "worlds" && layout.connected.length > 0 && layout.planets.length === 0 && <div className="radar-empty"><Users size={26} /><p>No shared worlds right now.</p><span>Worlds appear here when friends are in an instance you can see.</span></div>}
              {layout.connected.length === 0 && <div className="radar-empty"><Users size={26} /><p>Nobody is online right now.</p><span>Your friends will light up here as soon as they connect.</span></div>}
            </div>

            <aside className="radar-panel" aria-live="polite">
              {selected ? <>
                <div className="radar-panel-picture" style={{ background: `linear-gradient(140deg, hsl(${selected.hue} 70% 35%), hsl(${(selected.hue + 40) % 360} 70% 18%))` }}>
                  {selected.picture && <img src={selected.picture} alt="" />}
                  <span className="radar-panel-access">{selected.location.access ?? "World"}</span>
                </div>
                <h3>{selected.location.title}</h3>
                <p className="radar-panel-meta">{[selected.location.instanceNumber && `Instance #${selected.location.instanceNumber}`, selected.location.region].filter(Boolean).join(" · ") || "Instance details unavailable"}</p>
                <div className="radar-panel-fill">
                  <div><span>{selected.people}{selected.capacity ? ` / ${selected.capacity}` : ""} people</span><span>{selected.friends.length} {selected.friends.length === 1 ? "friend" : "friends"}</span></div>
                  <span className="radar-bar"><i style={{ width: `${Math.min(100, (selected.people / (selected.capacity || Math.max(selected.people, 1))) * 100)}%`, background: `hsl(${selected.hue} 90% 65%)` }} /></span>
                </div>
                <span className="radar-panel-label">Friends here</span>
                <ul className="radar-panel-friends">
                  {selected.friends.map(friend => (
                    <li key={friend.id}><button onClick={() => onFriend(friend.id)} onPointerEnter={() => setHoverId(friend.id)} onPointerLeave={() => setHoverId(null)}>
                      <i className={`status-bg-${friend.online ? friend.status ?? "active" : "web"}`} />{friend.name}
                    </button></li>
                  ))}
                </ul>
                <div className="radar-panel-actions">
                  {!demo && selected.location.instanceUrl
                    ? <a className="radar-cta" href={selected.location.instanceUrl} target="_blank" rel="noreferrer">Join <ArrowUpRight size={16} /></a>
                    : <span className="radar-cta is-disabled" title={demo ? "Connect VRChat to join" : "This instance can't be opened from here"}>Join <ArrowUpRight size={16} /></span>}
                  <button className="radar-secondary" onClick={() => { onPlace(selected.location.key); onOpenChange(false); }}><ListFilter size={15} />Show in friends list</button>
                </div>
              </> : <>
                <span className="radar-panel-label">Right now</span>
                <div className="radar-stats">
                  <div><strong>{layout.connected.length}</strong><small>friends online</small></div>
                  <div><strong>{layout.planets.length}</strong><small>shared worlds</small></div>
                  <div><strong>{inWorlds}</strong><small>together in a world</small></div>
                  <div><strong>{layout.connected.length - inWorlds}</strong><small>private or elsewhere</small></div>
                </div>
                {layout.planets[0] && <>
                  <span className="radar-panel-label">Busiest place</span>
                  <button className="radar-hot" onClick={() => setSelectedKey(layout.planets[0].location.key)}>
                    <span className="radar-hot-dot" style={{ background: `hsl(${layout.planets[0].hue} 85% 60%)` }} />
                    <span><strong>{layout.planets[0].location.title}</strong><small>{layout.planets[0].friends.length} friends · {layout.planets[0].people} people</small></span>
                  </button>
                </>}
                <span className="radar-panel-label">How to use it</span>
                <ul className="radar-tips">
                  <li>Type a name in the search box to find a friend on the radar.</li>
                  <li>Use All · Friends · Worlds to show only avatars or only worlds.</li>
                  <li>Click a planet to see who's there and join.</li>
                  <li>Click a friend to open their profile.</li>
                  <li>{mode === "3d" ? "Drag to orbit, scroll to zoom." : "Scroll to zoom, drag to move around."}</li>
                  <li>Inner orbit: your favourites and the friends you see most.</li>
                </ul>
              </>}
            </aside>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
