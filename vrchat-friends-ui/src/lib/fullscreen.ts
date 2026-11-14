/**
 * Full screen for the whole dashboard (F11, or the switch in Settings).
 * In the desktop window (WebView2) the launcher turns this into a borderless window that covers the taskbar.
 */
import { useEffect, useState } from "react";

export const fullscreenSupported = () => typeof document !== "undefined" && !!document.documentElement.requestFullscreen;

export const isFullscreen = () => typeof document !== "undefined" && !!document.fullscreenElement;

/** Must be called from a click or key press: browsers refuse full screen otherwise. */
export async function setFullscreen(on: boolean) {
  try {
    if (on && !document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: "hide" });
    else if (!on && document.fullscreenElement) await document.exitFullscreen();
  } catch (error) {
    console.warn("[fullscreen] refused", error);
  }
}

export const toggleFullscreen = () => setFullscreen(!isFullscreen());

export function useFullscreen() {
  const [on, setOn] = useState(isFullscreen);
  useEffect(() => {
    const update = () => setOn(isFullscreen());
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);
  return on;
}
