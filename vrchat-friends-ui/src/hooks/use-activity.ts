import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Friend } from "@/data/mockData";
import { applyWorldNames, diffActivity, parseActivity, pruneActivity, sampleActivity, type ActivityEvent } from "@/lib/activity";

const keyFor = () => `vrconnect-activity:${localStorage.getItem("userId") || "local"}`;

/**
 * Records friend activity (online/offline, world changes, status) by comparing each refresh
 * with the previous one, and keeps it in this browser for 14 days.
 * In preview mode it returns a fictional sample instead.
 */
export function useActivity(friends: Friend[] | undefined, version: number, demo: boolean, sample: Friend[], worldNames: Map<string, string>) {
  const [events, setEvents] = useState<ActivityEvent[]>(() => (demo ? [] : pruneActivity(parseActivity(localStorage.getItem(keyFor())))));
  const previous = useRef<Friend[] | null>(null);
  // Leaving preview mode: load the history stored for this account.
  useEffect(() => { if (!demo) setEvents(pruneActivity(parseActivity(localStorage.getItem(keyFor())))); }, [demo]);
  const latest = useRef(friends);
  latest.current = friends;

  // Runs once per successful refresh (version = query.dataUpdatedAt), not on every render.
  useEffect(() => {
    const current = latest.current;
    if (demo || !version || !current) { previous.current = null; return; }
    const fresh = previous.current ? diffActivity(previous.current, current) : [];
    previous.current = current;
    if (!fresh.length) return;
    setEvents(current => {
      const next = pruneActivity([...fresh, ...current]);
      try { localStorage.setItem(keyFor(), JSON.stringify(next)); } catch { /* keep in memory if storage is full */ }
      return next;
    });
  }, [version, demo]);

  // Replace "World 1a2b3c4d" placeholders with real names as world details arrive.
  const namesKey = [...worldNames].map(([id, name]) => id + name).join("|");
  useEffect(() => {
    if (demo || !worldNames.size) return;
    setEvents(current => {
      const next = applyWorldNames(current, worldNames);
      if (next !== current) { try { localStorage.setItem(keyFor(), JSON.stringify(next)); } catch { /* ignore */ } }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [namesKey, demo]);

  const clear = useCallback(() => {
    setEvents([]);
    try { localStorage.removeItem(keyFor()); } catch { /* ignore */ }
  }, []);

  const demoEvents = useMemo(() => (demo ? sampleActivity(sample) : []), [demo, sample]);
  return { events: demo ? demoEvents : events, clear };
}
