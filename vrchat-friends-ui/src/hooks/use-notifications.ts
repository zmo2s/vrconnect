import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { playSound, soundFor } from "@/lib/sounds";
import { AppNotification, NotificationEvent } from "@/data/notifications";
interface InboxState { key: string; items: AppNotification[]; readIds: string[]; dismissedIds: string[]; }
function load(key: string): InboxState {
  const fallback = { key, items: [], readIds: [], dismissedIds: [] };
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    if (!value) return fallback;
    return { key, items: Array.isArray(value.items) ? value.items.filter((item: AppNotification) => typeof item?.id === "string" && typeof item?.title === "string" && typeof item?.message === "string" && typeof item?.createdAt === "string" && ["info", "success", "warning"].includes(item?.kind)).slice(0, 50) : [], readIds: Array.isArray(value.readIds) ? value.readIds.filter((id: unknown) => typeof id === "string").slice(-1000) : [], dismissedIds: Array.isArray(value.dismissedIds) ? value.dismissedIds.filter((id: unknown) => typeof id === "string").slice(-1000) : [] };
  } catch { return fallback; }
}
export function useNotifications(demo: boolean) {
  const key = `vrconnect-notifications:${demo ? "preview" : localStorage.getItem("userId") || "local"}`;
  const [state, setState] = useState(() => load(key));
  useEffect(() => { setState(load(key)); }, [key]);
  useEffect(() => { if (state.key !== key) return; try { localStorage.setItem(key, JSON.stringify(state)); } catch { /* Keep notifications available in memory if storage is full. */ } }, [state, key]);
  const notify = useCallback((event: NotificationEvent) => {
    const item: AppNotification = { ...event, id: crypto.randomUUID(), createdAt: new Date().toISOString(), source: "app" };
    setState(previous => { const current = previous.key === key ? previous : load(key); return { ...current, items: [item, ...current.items].slice(0, 50) }; });
    toast(event.title, { description: event.message });
    playSound(soundFor(event.kind, event.title));
  }, [key]);
  const markRead = useCallback((ids: string[]) => setState(previous => ({ ...previous, readIds: [...new Set([...previous.readIds, ...ids])].slice(-1000) })), []);
  const dismiss = useCallback((ids: string[]) => setState(previous => ({ ...previous, items: previous.items.filter(item => !ids.includes(item.id)), dismissedIds: [...new Set([...previous.dismissedIds, ...ids])].slice(-1000) })), []);
  return { items: state.key === key ? state.items : [], readIds: state.key === key ? state.readIds : [], dismissedIds: state.key === key ? state.dismissedIds : [], notify, markRead, dismiss };
}
