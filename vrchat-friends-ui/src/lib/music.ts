/**
 * Background music: an MP3 (or other audio file) from the computer, or an https link, looping behind the dashboard.
 * Settings live in localStorage; a file from the computer is copied into IndexedDB (too big for localStorage).
 */
import { useCallback, useEffect, useState } from "react";
import { idb } from "./personalize";

const MUSIC_KEY = "vrconnect-music";
const IDB_KEY = "music";
/** Stands in for a file chosen from the computer. */
export const LOCAL_AUDIO = "local:audio";
const MAX_AUDIO_MB = 100;

export interface Music {
  /** LOCAL_AUDIO, an https:// link, or "" for no music. */
  src: string;
  /** File name or link, shown in Settings. */
  name: string;
  /** 0–100 %. */
  volume: number;
  /** Paused by the user or playing. */
  playing: boolean;
}
export const noMusic: Music = { src: "", name: "", volume: 40, playing: false };

const validSrc = (src: unknown): src is string => typeof src === "string" && (src === LOCAL_AUDIO || /^https:\/\/\S+$/i.test(src));

export function isAudioFile(file: File): boolean {
  return /^audio\//i.test(file.type) || /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac)$/i.test(file.name);
}

export function readMusic(): Music {
  try {
    const v = JSON.parse(localStorage.getItem(MUSIC_KEY) || "{}");
    const src = validSrc(v.src) ? v.src : "";
    return {
      src,
      name: typeof v.name === "string" ? v.name.slice(0, 200) : "",
      volume: typeof v.volume === "number" ? Math.min(100, Math.max(0, v.volume)) : noMusic.volume,
      playing: src ? v.playing !== false : false,
    };
  } catch { return noMusic; }
}

function save(music: Music) {
  try { if (music.src) localStorage.setItem(MUSIC_KEY, JSON.stringify(music)); else localStorage.removeItem(MUSIC_KEY); } catch { /* this session only */ }
}

/* ---------------- Player ---------------- */

let audio: HTMLAudioElement | null = null;
let localUrl: Promise<string> | null = null;
let token = 0;
let waitingForGesture = false;

function player(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio();
    audio.loop = true;
    audio.preload = "auto";
    audio.onerror = () => console.warn("[music] can't be played", audio?.error);
  }
  return audio;
}

function forgetLocalUrl() {
  const old = localUrl;
  localUrl = null;
  void old?.then(url => { if (url) URL.revokeObjectURL(url); }).catch(() => {});
}

function resolveUrl(src: string): Promise<string> {
  if (src !== LOCAL_AUDIO) return Promise.resolve(src);
  localUrl ??= idb<Blob | undefined>("readonly", store => store.get(IDB_KEY))
    .then(blob => (blob ? URL.createObjectURL(blob) : ""))
    .catch(() => "");
  return localUrl;
}

/** Browsers only allow sound after the user has clicked or pressed a key: start then. */
function playWhenAllowed(el: HTMLAudioElement) {
  void el.play().catch(() => {
    if (waitingForGesture) return;
    waitingForGesture = true;
    const start = () => {
      waitingForGesture = false;
      window.removeEventListener("pointerdown", start, true);
      window.removeEventListener("keydown", start, true);
      if (readMusic().playing) void el.play().catch(() => {});
    };
    window.addEventListener("pointerdown", start, true);
    window.addEventListener("keydown", start, true);
  });
}

export function applyMusic(music: Music) {
  const el = player();
  const mine = ++token;
  el.volume = music.volume / 100;
  if (!music.src) { el.pause(); el.removeAttribute("src"); el.load(); return; }
  void resolveUrl(music.src).then(url => {
    if (mine !== token) return;
    if (!url) { el.pause(); return; }
    if (el.getAttribute("src") !== url) el.src = url;
    if (music.playing) playWhenAllowed(el); else el.pause();
  });
}

/** Checks that this browser can decode the file; returns an error message, or null. */
function probeAudio(file: Blob): Promise<string | null> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const test = new Audio();
    let done = false;
    const finish = (error: string | null) => {
      if (done) return;
      done = true; clearTimeout(timer);
      test.removeAttribute("src"); test.load(); URL.revokeObjectURL(url);
      resolve(error);
    };
    const timer = setTimeout(() => finish("This file took too long to open. Try another one."), 15000);
    test.preload = "metadata";
    test.onloadedmetadata = () => finish(null);
    test.onerror = () => finish("This audio file can't be played here. Try an MP3.");
    test.src = url;
  });
}

/* ---------------- React ---------------- */

export function useMusic() {
  const [music, setState] = useState(readMusic);
  useEffect(() => { applyMusic(music); }, [music]);

  const setMusic = useCallback((patch: Partial<Music>): string | null => {
    const previous = readMusic();
    const next = { ...previous, ...patch };
    if (next.src && !validSrc(next.src)) return "Use an audio file, or a link starting with https://";
    if (!next.src) next.playing = false;
    if (previous.src === LOCAL_AUDIO && next.src !== LOCAL_AUDIO) {
      forgetLocalUrl();
      void idb("readwrite", store => store.delete(IDB_KEY)).catch(() => {});
    }
    save(next);
    setState(next);
    return null;
  }, []);

  /** Copies an audio file from the computer into this browser and plays it. Returns an error or notice. */
  const setLocalMusic = useCallback(async (file: File, onStep: (step: string) => void = () => {}): Promise<string | null> => {
    if (!isAudioFile(file)) return "Choose an MP3 (or M4A, OGG, WAV) file.";
    if (file.size > MAX_AUDIO_MB * 1024 * 1024) return `This file is too large (${Math.round(file.size / 1024 / 1024)} MB, max ${MAX_AUDIO_MB} MB).`;
    onStep("Checking the music…");
    const unplayable = await probeAudio(file);
    if (unplayable) return unplayable;
    onStep("Saving the music…");
    let notice: string | null = null;
    forgetLocalUrl();
    try {
      const blob = new Blob([await file.arrayBuffer()], { type: file.type || "audio/mpeg" });
      await idb("readwrite", store => store.put(blob, IDB_KEY));
    } catch (error) {
      console.warn("[music] couldn't store the file, playing it for this session only", error);
      localUrl = Promise.resolve(URL.createObjectURL(file));
      notice = "The music plays now, but the app couldn't save it for next time.";
    }
    const next: Music = { ...readMusic(), src: LOCAL_AUDIO, name: file.name, playing: true };
    save(next);
    setState(next);
    return notice;
  }, []);

  return [music, setMusic, setLocalMusic] as const;
}
