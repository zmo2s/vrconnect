import { useCallback, useState } from "react";

const KEY = "vrconnect-notes";

function read(): Record<string, string> {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim() !== ""));
  } catch { return {}; }
}

/** Private, per-friend notes kept only in this browser (e.g. "met at the jazz club, likes horror worlds"). */
export function useNotes() {
  const [notes, setNotes] = useState(read);
  const setNote = useCallback((id: string, text: string) => {
    setNotes(previous => {
      const next = { ...previous };
      const trimmed = text.slice(0, 500);
      if (trimmed.trim()) next[id] = trimmed; else delete next[id];
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* keep in memory */ }
      return next;
    });
  }, []);
  return [notes, setNote] as const;
}
