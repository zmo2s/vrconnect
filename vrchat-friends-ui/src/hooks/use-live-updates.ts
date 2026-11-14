import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { API_URL, vrchatFetch } from "@/lib/vrchat-api";
import type { Friend } from "@/data/mockData";
import { applyFriendEvent, parseSseChunk, type FriendEventPayload } from "@/lib/live-events";

/**
 * "live": VRChat's pipeline is connected, changes arrive within a second.
 * "connecting" / "fallback": not live, the dashboard keeps polling the REST API as before.
 */
export type LiveState = "off" | "connecting" | "live" | "fallback";

/**
 * Listens to the API's /vrchat/events stream and patches the TanStack Query cache in place.
 * Uses fetch (not EventSource) so the session travels in the X-VRChat-Session header, never in the URL.
 */
export function useLiveUpdates(enabled: boolean): LiveState {
  const queryClient = useQueryClient();
  const [state, setState] = useState<LiveState>("off");

  useEffect(() => {
    if (!enabled) { setState("off"); return; }
    let stopped = false;
    let wasLive = false;
    let lostLive = false;
    let retry = 0;
    let controller: AbortController | null = null;
    let reconnectTimer: number | undefined;
    let flushTimer: number | undefined;
    let refetchTimer: number | undefined;
    let notificationTimer: number | undefined;
    const pending: [string, FriendEventPayload][] = [];

    const refetchFriendsSoon = () => {
      window.clearTimeout(refetchTimer);
      refetchTimer = window.setTimeout(() => void queryClient.invalidateQueries({ queryKey: ["location-friends"] }), 3000);
    };

    // Batch bursts of events (e.g. a whole group changing world) into one render.
    const flush = () => {
      flushTimer = undefined;
      const batch = pending.splice(0);
      let refetch = false;
      queryClient.setQueryData<Friend[]>(["location-friends"], old => {
        if (!old) return old;
        let list = old;
        for (const [type, payload] of batch) {
          const result = applyFriendEvent(list, type, payload);
          list = result.friends;
          refetch ||= result.refetch;
        }
        return list;
      });
      if (refetch) refetchFriendsSoon();
    };

    const handle = (event: string, data: string) => {
      let payload: unknown;
      try { payload = JSON.parse(data); } catch { return; }
      if (event === "status") {
        const connected = (payload as { connected?: boolean }).connected === true;
        if (connected) {
          retry = 0;
          // Back after an outage: reload once to catch what happened while we were not listening.
          if (lostLive) {
            void queryClient.invalidateQueries({ queryKey: ["location-friends"] });
            void queryClient.invalidateQueries({ queryKey: ["incoming-notifications"] });
          }
          wasLive = true;
          lostLive = false;
        } else if (wasLive) {
          lostLive = true;
        }
        setState(connected ? "live" : "fallback");
      } else if (event === "notification") {
        window.clearTimeout(notificationTimer);
        notificationTimer = window.setTimeout(() => void queryClient.invalidateQueries({ queryKey: ["incoming-notifications"] }), 500);
      } else if (event.startsWith("friend-")) {
        pending.push([event, payload as FriendEventPayload]);
        flushTimer ??= window.setTimeout(flush, 250);
      }
    };

    const connect = async () => {
      if (stopped) return;
      controller = new AbortController();
      try {
        const response = await vrchatFetch(`${API_URL}/vrchat/events`, { signal: controller.signal, headers: { Accept: "text/event-stream" } });
        if (!response.ok || !response.body) throw new Error(`Live events unavailable (HTTP ${response.status})`);
        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          const parsed = parseSseChunk(buffer + value);
          buffer = parsed.rest;
          parsed.events.forEach(item => handle(item.event, item.data));
        }
      } catch {
        /* network error, API restarted, signed out… handled below */
      }
      if (stopped) return;
      if (wasLive) lostLive = true;
      setState("fallback");
      const delay = Math.min(60_000, 2000 * 2 ** retry++);
      reconnectTimer = window.setTimeout(() => void connect(), delay);
    };

    setState("connecting");
    void connect();
    return () => {
      stopped = true;
      controller?.abort();
      [reconnectTimer, flushTimer, refetchTimer, notificationTimer].forEach(timer => window.clearTimeout(timer));
    };
  }, [enabled, queryClient]);

  return state;
}
