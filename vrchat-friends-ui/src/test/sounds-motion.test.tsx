import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Index from "@/pages/Index";
import { playSound, soundFor } from "@/lib/sounds";

class FakeContext {
  static created = 0;
  state = "running"; currentTime = 0; destination = {};
  oscillators = 0;
  constructor() { FakeContext.created++; }
  resume() { return Promise.resolve(); }
  createGain() { return { gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect(n: unknown) { return n; } }; }
  createOscillator() { FakeContext.lastInstance = this; this.oscillators++; return { type: "", frequency: { value: 0 }, connect(n: unknown) { return n; }, start() {}, stop() {} }; }
  static lastInstance: FakeContext | null = null;
}

beforeEach(() => { localStorage.clear(); document.documentElement.classList.remove("no-motion"); vi.stubGlobal("AudioContext", FakeContext); FakeContext.lastInstance = null; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const dashboard = () => render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><Index /></MemoryRouter></QueryClientProvider>);

describe("notification sounds", () => {
  it("picks a sound per notification type", () => {
    expect(soundFor("warning")).toBe("warning");
    expect(soundFor("success")).toBe("success");
    expect(soundFor("info", "Astra invited you")).toBe("invite");
    expect(soundFor("info", "Luna is online")).toBe("online");
  });
  it("stays silent when sounds are off or the volume is 0", () => {
    localStorage.setItem("vrconnect-settings", JSON.stringify({ sounds: false }));
    playSound("info");
    localStorage.setItem("vrconnect-settings", JSON.stringify({ sounds: true, soundVolume: 0 }));
    playSound("success");
    expect(FakeContext.lastInstance).toBeNull();
  });
  it("plays when enabled, and the Test button plays at the chosen volume", () => {
    dashboard();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(screen.getByRole("button", { name: /Test/ }));
    expect(FakeContext.lastInstance?.oscillators).toBeGreaterThan(0);
  });
});

describe("animations setting", () => {
  it("turns moving effects off and remembers it", () => {
    dashboard();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(screen.getByRole("switch", { name: "Animations" }));
    expect(document.documentElement).toHaveClass("no-motion");
    expect(JSON.parse(localStorage.getItem("vrconnect-settings")!).motion).toBe(false);
    fireEvent.click(screen.getByRole("switch", { name: "Animations" }));
    expect(document.documentElement).not.toHaveClass("no-motion");
  });
});

describe("animated background setting", () => {
  it("is independent from the Animations switch and remembered", () => {
    document.documentElement.classList.remove("ambient-live");
    dashboard();
    expect(document.documentElement).toHaveClass("ambient-live");
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(screen.getByRole("switch", { name: "Animations" }));
    expect(document.documentElement).toHaveClass("no-motion");
    expect(document.documentElement).toHaveClass("ambient-live");
    fireEvent.click(screen.getByRole("switch", { name: "Animated background" }));
    expect(document.documentElement).not.toHaveClass("ambient-live");
    expect(JSON.parse(localStorage.getItem("vrconnect-settings")!)).toMatchObject({ motion: false, ambient: false });
  });
});
