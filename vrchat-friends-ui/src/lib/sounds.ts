/**
 * Small notification sounds synthesised with the Web Audio API (no audio files to ship).
 * Soft sine "glass" tones, in the spirit of Apple's system sounds.
 */
export type SoundKind = "info" | "success" | "warning" | "invite" | "online";

const SETTINGS_KEY = "vrconnect-settings";
let context: AudioContext | null = null;
let lastPlayed = 0;

/** Each sound is a short sequence of notes: [frequency Hz, start s, duration s]. */
const patterns: Record<SoundKind, [number, number, number][]> = {
  info: [[880, 0, 0.18]],                                   // single soft ping
  online: [[660, 0, 0.14], [990, 0.09, 0.22]],             // rising two-note "hello"
  success: [[784, 0, 0.12], [1046.5, 0.08, 0.12], [1318.5, 0.16, 0.26]], // bright arpeggio
  invite: [[1046.5, 0, 0.16], [1318.5, 0.12, 0.16], [1568, 0.24, 0.32]], // three-note chime
  warning: [[523.25, 0, 0.16], [392, 0.14, 0.3]],          // falling two-note
};

function readSoundSettings(): { enabled: boolean; volume: number } {
  try {
    const value = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    return {
      enabled: typeof value.sounds === "boolean" ? value.sounds : true,
      volume: typeof value.soundVolume === "number" ? Math.min(100, Math.max(0, value.soundVolume)) : 60,
    };
  } catch { return { enabled: true, volume: 60 }; }
}

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!context) { try { context = new Ctor(); } catch { return null; } }
  if (context.state === "suspended") void context.resume().catch(() => {});
  return context;
}

/**
 * Plays a notification sound. Respects the user's on/off setting and volume unless `force`
 * (used by the "Test" button with an explicit volume). Bursts are throttled to one per 400 ms.
 */
export function playSound(kind: SoundKind, options: { force?: boolean; volume?: number } = {}) {
  const settings = readSoundSettings();
  if (!options.force && !settings.enabled) return;
  const volume = (options.volume ?? settings.volume) / 100;
  if (volume <= 0) return;
  const now = Date.now();
  if (!options.force && now - lastPlayed < 400) return;
  lastPlayed = now;
  const ctx = audio();
  if (!ctx) return;
  try {
    const master = ctx.createGain();
    master.gain.value = 0.35 * volume * volume; // perceptual curve: quieter steps at the low end
    master.connect(ctx.destination);
    const start = ctx.currentTime + 0.01;
    for (const [frequency, offset, duration] of patterns[kind]) {
      for (const [ratio, level] of [[1, 1], [2, 0.18]] as const) { // fundamental + soft overtone
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = frequency * ratio;
        const t = start + offset;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(level, t + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
        osc.connect(gain).connect(master);
        osc.start(t);
        osc.stop(t + duration + 0.05);
      }
    }
  } catch { /* audio is a nicety; never break the app */ }
}

/** Picks the sound that matches a notification. */
export function soundFor(kind: "info" | "success" | "warning", title = ""): SoundKind {
  if (kind === "warning") return "warning";
  if (kind === "success") return "success";
  if (/invit/i.test(title)) return "invite";
  if (/online|moved/i.test(title)) return "online";
  return "info";
}
