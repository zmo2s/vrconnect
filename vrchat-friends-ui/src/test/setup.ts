import "@testing-library/jest-dom/vitest";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// jsdom lacks these browser APIs used by the quick-jump palette (cmdk).
if (!("ResizeObserver" in globalThis)) {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
}
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
// Radix menus position themselves with DOMRect.fromRect, which jsdom does not provide.
class TestDOMRect { x = 0; y = 0; width = 0; height = 0; top = 0; left = 0; right = 0; bottom = 0; static fromRect(r: Partial<DOMRect> = {}) { return Object.assign(new TestDOMRect(), r); } toJSON() { return {}; } }
if (typeof (globalThis as { DOMRect?: { fromRect?: unknown } }).DOMRect?.fromRect !== "function") {
  Object.defineProperty(globalThis, "DOMRect", { value: TestDOMRect, writable: true, configurable: true });
}
