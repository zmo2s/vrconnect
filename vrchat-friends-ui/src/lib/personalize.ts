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

export interface Wallpaper {
  /** data: URL of an uploaded image, or an https:// link. "" = no wallpaper. */
  src: string;
  /** Darkening over the image, 0–80 %, so the glass stays readable. */
  dim: number;
  /** Blur in px, 0–20. */
  blur: number;
}
export const noWallpaper: Wallpaper = { src: "", dim: 35, blur: 0 };

function validSrc(src: unknown): src is string {
  return typeof src === "string" && (/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(src) || /^https:\/\/\S+$/i.test(src));
}

export function readWallpaper(): Wallpaper {
  try {
    const v = JSON.parse(localStorage.getItem(WALLPAPER_KEY) || "{}");
    return {
      src: validSrc(v.src) ? v.src : "",
      dim: typeof v.dim === "number" ? Math.min(80, Math.max(0, v.dim)) : noWallpaper.dim,
      blur: typeof v.blur === "number" ? Math.min(20, Math.max(0, v.blur)) : noWallpaper.blur,
    };
  } catch { return noWallpaper; }
}

export function applyWallpaper(wallpaper: Wallpaper) {
  const root = document.documentElement;
  let layer = document.getElementById("vrc-wallpaper");
  if (!wallpaper.src) { layer?.remove(); root.classList.remove("has-wallpaper"); return; }
  if (!layer) {
    layer = document.createElement("div");
    layer.id = "vrc-wallpaper";
    layer.setAttribute("aria-hidden", "true");
    document.body.prepend(layer);
  }
  layer.style.setProperty("--wallpaper-image", `url("${wallpaper.src.replace(/"/g, "%22")}")`);
  layer.style.setProperty("--wallpaper-dim", String(wallpaper.dim / 100));
  layer.style.setProperty("--wallpaper-blur", `${wallpaper.blur}px`);
  root.classList.add("has-wallpaper");
}

/** Shrinks a picked image so it fits comfortably in browser storage (max 2560 px wide, JPEG). */
export function imageFileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpe?g|webp|gif)$/i.test(file.type)) { reject(new Error("Choose a PNG, JPG, WebP or GIF image.")); return; }
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
    const next = { ...readWallpaper(), ...patch };
    if (next.src && !validSrc(next.src)) return "Use an image file, or a link starting with https://";
    try {
      if (next.src) localStorage.setItem(WALLPAPER_KEY, JSON.stringify(next)); else localStorage.removeItem(WALLPAPER_KEY);
    } catch {
      return "This image is too large to save. Try a smaller one.";
    }
    setState(next);
    return null;
  }, []);
  return [wallpaper, setWallpaper] as const;
}

/** Applies the saved accent and wallpaper before the first render (no flash). */
export function applySavedPersonalization() {
  applyAccent(readAccent());
  const apply = () => applyWallpaper(readWallpaper());
  if (document.body) apply(); else document.addEventListener("DOMContentLoaded", apply, { once: true });
}
