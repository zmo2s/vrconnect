/**
 * Personalisation: accent colour and wallpaper.
 * Both live in this browser's storage and are applied by tagging <html>, so they work before React renders.
 */
import { useCallback, useEffect, useState } from "react";

/* ---------------- Accent colour ---------------- */

const ACCENT_KEY = "vrconnect-accent";

/** Ready-made accents. "" = the dashboard's default blue. */
export const accentPresets: { name: string; hex: string }[] = [
  { name: "Default", hex: "" },
  { name: "Sky", hex: "#42CAFF" },
  { name: "Violet", hex: "#8B5CF6" },
  { name: "Pink", hex: "#EC4899" },
  { name: "Red", hex: "#EF4444" },
  { name: "Orange", hex: "#F97316" },
  { name: "Green", hex: "#22C55E" },
  { name: "Teal", hex: "#14B8A6" },
];

function hexToHsl(hex: string): [number, number, number] | null {
  const m = /^#?([\da-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, Math.round(l * 100)];
  const d = max - min;
  const s = l > .5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [Math.round(h * 60), Math.round(s * 100), Math.round(l * 100)];
}

/** Applies an accent everywhere the theme uses --primary / --ring / --accent. Lightness is adjusted per theme so text stays readable. */
export function applyAccent(hex: string) {
  document.getElementById("vrc-accent-style")?.remove();
  const hsl = hexToHsl(hex);
  if (!hsl) return;
  const [h, sRaw] = hsl;
  const s = Math.max(sRaw, 35);
  const style = document.createElement("style");
  style.id = "vrc-accent-style";
  style.textContent = `
:root {
  --primary: ${h} ${s}% 44%; --primary-foreground: 0 0% 100%; --ring: ${h} ${s}% 50%;
  --accent: ${h} ${Math.min(s, 90)}% 94%; --accent-foreground: ${h} ${s}% 34%;
}
.dark {
  --primary: ${h} ${s}% 64%; --primary-foreground: ${h} 30% 8%; --ring: ${h} ${s}% 64%;
  --accent: ${h} ${Math.min(s, 55)}% 17%; --accent-foreground: ${h} ${s}% 78%;
}`;
  document.head.appendChild(style);
}

export function readAccent(): string {
  try { const value = localStorage.getItem(ACCENT_KEY) || ""; return hexToHsl(value) ? value : ""; } catch { return ""; }
}

export function useAccent() {
  const [accent, setAccentState] = useState(readAccent);
  const setAccent = useCallback((hex: string) => {
    const value = hexToHsl(hex) ? hex : "";
    setAccentState(value);
    applyAccent(value);
    try { if (value) localStorage.setItem(ACCENT_KEY, value); else localStorage.removeItem(ACCENT_KEY); } catch { /* keep for this session */ }
  }, []);
  return [accent, setAccent] as const;
}

/* ---------------- Wallpaper ---------------- */

const WALLPAPER_KEY = "vrconnect-wallpaper";
/** Stands in for a video file chosen from the computer; the file itself lives in IndexedDB (too big for localStorage). */
export const LOCAL_VIDEO = "local:video";
/** Largest local video kept in the browser. */
const MAX_VIDEO_MB = 300;

export type WallpaperKind = "image" | "video";

export interface Wallpaper {
  /** data: URL of an uploaded image, an https:// link, or LOCAL_VIDEO. "" = no wallpaper. */
  src: string;
  /** A picture, or a muted looping video. */
  kind: WallpaperKind;
  /** Darkening over the image, 0–80 %, so the glass stays readable. */
  dim: number;
  /** Blur in px, 0–20. */
  blur: number;
}
export const noWallpaper: Wallpaper = { src: "", kind: "image", dim: 35, blur: 0 };

function validSrc(src: unknown): src is string {
  return typeof src === "string" && (src === LOCAL_VIDEO || /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(src) || /^https:\/\/\S+$/i.test(src));
}

/** True for links that point at a video file (.mp4, .webm, …). */
export function isVideoLink(link: string): boolean {
  try { return /\.(mp4|m4v|webm|ogv|mov)$/i.test(new URL(link).pathname); } catch { return false; }
}

export function isVideoFile(file: File): boolean {
  return /^video\//i.test(file.type) || /\.(mp4|m4v|webm|ogv|mov)$/i.test(file.name);
}

/** Checks that this browser can actually decode the video; returns an error message, or null when it plays. */
export function probeVideo(file: Blob): Promise<string | null> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    let done = false;
    const finish = (error: string | null) => {
      if (done) return;
      done = true; clearTimeout(timer);
      video.removeAttribute("src"); video.load(); URL.revokeObjectURL(url);
      resolve(error);
    };
    const unsupported = "This video can't be played here. Its format is probably HEVC/H.265 or another codec the app can't read. Re-export it as MP4 (H.264) or WebM and try again.";
    const timer = setTimeout(() => finish("This video took too long to open. Try a shorter or smaller file."), 20000);
    video.muted = true; video.preload = "auto";
    video.onloadeddata = () => finish(video.videoWidth > 0 ? null : unsupported);
    video.onerror = () => finish(unsupported);
    video.src = url;
  });
}

export function readWallpaper(): Wallpaper {
  try {
    const v = JSON.parse(localStorage.getItem(WALLPAPER_KEY) || "{}");
    const src = validSrc(v.src) ? v.src : "";
    return {
      src,
      kind: src === LOCAL_VIDEO || v.kind === "video" ? "video" : "image",
      dim: typeof v.dim === "number" ? Math.min(80, Math.max(0, v.dim)) : noWallpaper.dim,
      blur: typeof v.blur === "number" ? Math.min(20, Math.max(0, v.blur)) : noWallpaper.blur,
    };
  } catch { return noWallpaper; }
}

/* A video chosen from the computer is kept in IndexedDB as a Blob. */

/** Rejects instead of waiting forever: some embedded browsers never answer IndexedDB requests. */
export function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what} timed out`)), ms);
    promise.then(v => { clearTimeout(timer); resolve(v); }, e => { clearTimeout(timer); reject(e); });
  });
}

function openDb(): Promise<IDBDatabase> {
  return withTimeout(new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("IndexedDB is not available")); return; }
    const request = indexedDB.open("vrconnect-wallpaper", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("files");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("IndexedDB is blocked"));
  }), 8000, "Opening the video storage");
}

/** Runs one request on the app's IndexedDB file store (wallpaper video, music). */
export async function idb<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDb();
  try {
    return await withTimeout(new Promise<T>((resolve, reject) => {
      const tx = db.transaction("files", mode);
      const request = run(tx.objectStore("files"));
      tx.oncomplete = () => resolve(request.result as T);
      tx.onerror = tx.onabort = () => reject(tx.error || request.error);
    }), 30000, "Saving the video");
  } finally { db.close(); }
}

let localVideoUrl: Promise<string> | null = null;
function forgetLocalVideoUrl() {
  const old = localVideoUrl;
  localVideoUrl = null;
  void old?.then(url => { if (url) URL.revokeObjectURL(url); }).catch(() => {});
}

/** The playable URL for a wallpaper's src ("" if the local video is missing). */
export function resolveWallpaperUrl(src: string): Promise<string> {
  if (src !== LOCAL_VIDEO) return Promise.resolve(src);
  localVideoUrl ??= idb<Blob | undefined>("readonly", store => store.get("wallpaper-video"))
    .then(blob => (blob ? URL.createObjectURL(blob) : ""))
    .catch(() => "");
  return localVideoUrl;
}

const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
let applyToken = 0;

export function applyWallpaper(wallpaper: Wallpaper) {
  const root = document.documentElement;
  const token = ++applyToken;
  let layer = document.getElementById("vrc-wallpaper");
  if (!wallpaper.src) { layer?.remove(); root.classList.remove("has-wallpaper"); return; }
  if (!layer) {
    layer = document.createElement("div");
    layer.id = "vrc-wallpaper";
    layer.setAttribute("aria-hidden", "true");
    document.body.prepend(layer);
  }
  layer.style.setProperty("--wallpaper-dim", String(wallpaper.dim / 100));
  layer.style.setProperty("--wallpaper-blur", `${wallpaper.blur}px`);
  root.classList.add("has-wallpaper");

  let video = layer.querySelector("video");
  if (wallpaper.kind !== "video") {
    video?.remove();
    layer.style.setProperty("--wallpaper-image", `url("${wallpaper.src.replace(/"/g, "%22")}")`);
    return;
  }
  layer.style.setProperty("--wallpaper-image", "none");
  if (!video) {
    video = document.createElement("video");
    video.muted = true; video.defaultMuted = true; video.loop = true; video.playsInline = true; video.preload = "auto";
    video.setAttribute("muted", ""); video.setAttribute("playsinline", "");
    video.onerror = () => console.warn("[wallpaper] the video can't be played", video.error);
    layer.prepend(video);
  }
  const el = video, host = layer;
  void resolveWallpaperUrl(wallpaper.src).then(url => {
    if (token !== applyToken) return;
    if (!url) { host.remove(); root.classList.remove("has-wallpaper"); return; }
    if (el.getAttribute("src") !== url) el.src = url;
    if (reducedMotion() || document.hidden) el.pause(); else void el.play().catch(() => {});
  });
}

// Don't spend CPU/GPU on a video nobody can see.
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    const video = document.querySelector<HTMLVideoElement>("#vrc-wallpaper video");
    if (!video) return;
    if (document.hidden || reducedMotion()) video.pause(); else void video.play().catch(() => {});
  });
}

/** Shrinks a picked image so it fits comfortably in browser storage (max 2560 px wide, JPEG). */
export function imageFileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpe?g|webp|gif)$/i.test(file.type)) { reject(new Error("Choose a PNG, JPG, WebP or GIF image, or an MP4/WebM video.")); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 2560 / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      let data = canvas.toDataURL("image/jpeg", .85);
      if (data.length > 3_000_000) data = canvas.toDataURL("image/jpeg", .65);
      resolve(data);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("This image couldn't be opened.")); };
    img.src = url;
  });
}

export function useWallpaper() {
  const [wallpaper, setState] = useState(readWallpaper);
  useEffect(() => { applyWallpaper(wallpaper); }, [wallpaper]);

  /** Returns an error message if the browser couldn't store it. */
  const setWallpaper = useCallback((patch: Partial<Wallpaper>): string | null => {
    const previous = readWallpaper();
    const next = { ...previous, ...patch };
    if (patch.src !== undefined && patch.kind === undefined) next.kind = patch.src === LOCAL_VIDEO || isVideoLink(patch.src) ? "video" : "image";
    if (next.src && !validSrc(next.src)) return "Use an image or video file, or a link starting with https://";
    try {
      if (next.src) localStorage.setItem(WALLPAPER_KEY, JSON.stringify(next)); else localStorage.removeItem(WALLPAPER_KEY);
    } catch {
      return "This image is too large to save. Try a smaller one.";
    }
    // A local video that's no longer used is removed from the browser.
    if (previous.src === LOCAL_VIDEO && next.src !== LOCAL_VIDEO) {
      forgetLocalVideoUrl();
      void idb("readwrite", store => store.delete("wallpaper-video")).catch(() => {});
    }
    setState(next);
    return null;
  }, []);

  /** Keeps a video file from the computer in this browser and plays it as the wallpaper. */
  /** Returns an error, or a notice when the video plays but couldn't be kept for next time. */
  const setLocalVideo = useCallback(async (file: File, onStep: (step: string) => void = () => {}): Promise<string | null> => {
    console.info("[wallpaper] picked", file.name, file.type || "(no type)", file.size, "bytes");
    if (!isVideoFile(file)) return "Choose an MP4 or WebM video.";
    if (file.size > MAX_VIDEO_MB * 1024 * 1024) return `This video is too large (${Math.round(file.size / 1024 / 1024)} MB, max ${MAX_VIDEO_MB} MB).`;

    onStep("Checking the video…");
    const unplayable = await probeVideo(file);
    console.info("[wallpaper] playback check:", unplayable || "ok");
    if (unplayable) return unplayable;

    onStep("Saving the video…");
    let notice: string | null = null;
    forgetLocalVideoUrl();
    try {
      // Copy the bytes: a File can point at a disk/OneDrive file that later moves or goes online-only.
      const blob = new Blob([await file.arrayBuffer()], { type: file.type || "video/mp4" });
      await idb("readwrite", store => store.put(blob, "wallpaper-video"));
      console.info("[wallpaper] stored in IndexedDB");
    } catch (error) {
      console.warn("[wallpaper] couldn't store the video, playing it for this session only", error);
      localVideoUrl = Promise.resolve(URL.createObjectURL(file));
      notice = "The video plays now, but the app couldn't save it for next time" + (error instanceof Error ? ` (${error.message}).` : ".");
    }
    const next: Wallpaper = { ...readWallpaper(), src: LOCAL_VIDEO, kind: "video" };
    try { localStorage.setItem(WALLPAPER_KEY, JSON.stringify(next)); } catch { /* still plays for this session */ }
    setState(next);
    return notice;
  }, []);

  return [wallpaper, setWallpaper, setLocalVideo] as const;
}

/** Applies the saved accent and wallpaper before the first render (no flash), and starts the saved music. */
export function applySavedPersonalization() {
  applyAccent(readAccent());
  void import("./music").then(m => m.applyMusic(m.readMusic()));
  const apply = () => applyWallpaper(readWallpaper());
  if (document.body) apply(); else document.addEventListener("DOMContentLoaded", apply, { once: true });
}
