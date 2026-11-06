import { useCallback, useEffect, useState } from "react";

export interface Settings {
  /** Toast + inbox entry when a favorite comes online or changes world. */
  favoriteAlerts: boolean;
  /** Also show a Windows/OS notification when the tab is in the background. */
  desktopAlerts: boolean;
  /** Tighter rows to fit more friends on screen. */
  compact: boolean;
  /** Friends refresh interval, in seconds. */
  refreshSeconds: number;
  /** Play a sound for notifications. */
  sounds: boolean;
  /** Notification sound volume, 0–100. */
  soundVolume: number;
  /** Moving effects: hover lift, press, entrance and sliding panels. */
  motion: boolean;
  /** Slowly drifting colour light behind the glass. Independent from `motion`. */
  ambient: boolean;
}

export const defaultSettings: Settings = { favoriteAlerts: true, desktopAlerts: false, compact: false, refreshSeconds: 60, sounds: true, soundVolume: 60, motion: true, ambient: true };
const KEY = "vrconnect-settings";
export const refreshChoices = [30, 60, 120, 300];

function read(): Settings {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || "{}");
    return {
      favoriteAlerts: typeof value.favoriteAlerts === "boolean" ? value.favoriteAlerts : defaultSettings.favoriteAlerts,
      desktopAlerts: typeof value.desktopAlerts === "boolean" ? value.desktopAlerts : defaultSettings.desktopAlerts,
      compact: typeof value.compact === "boolean" ? value.compact : defaultSettings.compact,
      refreshSeconds: refreshChoices.includes(value.refreshSeconds) ? value.refreshSeconds : defaultSettings.refreshSeconds,
      sounds: typeof value.sounds === "boolean" ? value.sounds : defaultSettings.sounds,
      soundVolume: typeof value.soundVolume === "number" ? Math.min(100, Math.max(0, Math.round(value.soundVolume))) : defaultSettings.soundVolume,
      motion: typeof value.motion === "boolean" ? value.motion : defaultSettings.motion,
      ambient: typeof value.ambient === "boolean" ? value.ambient : defaultSettings.ambient,
    };
  } catch { return defaultSettings; }
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(read);
  useEffect(() => { applyMotion(settings.motion); }, [settings.motion]);
  useEffect(() => { applyAmbient(settings.ambient); }, [settings.ambient]);
  const update = useCallback((patch: Partial<Settings>) => {
    setSettings(previous => {
      const next = { ...previous, ...patch };
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* keep in memory */ }
      return next;
    });
  }, []);
  return [settings, update] as const;
}

/** Shows an OS notification when allowed and the dashboard is not in front. */
export function desktopNotify(title: string, body: string) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted" || !document.hidden) return;
  try { new Notification(title, { body, tag: `vrconnect-${title}`, icon: "/favicon.ico" }); } catch { /* some browsers only allow service-worker notifications */ }
}

/** Turns all moving effects off by tagging <html>; see `.no-motion` in index.css. */
export function applyMotion(enabled: boolean) {
  document.documentElement.classList.toggle("no-motion", !enabled);
}

/** Shows or hides the animated background by tagging <html>; see `.ambient-live` in index.css. */
export function applyAmbient(enabled: boolean) {
  document.documentElement.classList.toggle("ambient-live", enabled);
}

/** Applies the saved animation preferences before the first render (no flash of motion). */
export function applySavedMotion() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "{}");
    applyMotion(saved.motion !== false);
    applyAmbient(saved.ambient !== false);
  } catch { applyMotion(true); applyAmbient(true); }
}
