import "@testing-library/jest-dom/vitest";
import { vi, afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
afterEach(cleanup);
vi.stubGlobal(
  "matchMedia",
  vi.fn(() => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })),
);
vi.stubGlobal(
  "IntersectionObserver",
  class {
    observe() {}
    disconnect() {}
    unobserve() {}
  },
);
vi.stubGlobal(
  "requestAnimationFrame",
  vi.fn(() => 1),
);
vi.stubGlobal("cancelAnimationFrame", vi.fn());
vi.stubGlobal(
  "Path2D",
  class {
    moveTo() {}
    lineTo() {}
    closePath() {}
  },
);
const gradient = { addColorStop: vi.fn() };
const context = Object.fromEntries(
  [
    "setTransform",
    "clearRect",
    "translate",
    "scale",
    "beginPath",
    "moveTo",
    "lineTo",
    "closePath",
    "clip",
    "fill",
    "save",
    "rotate",
    "ellipse",
    "restore",
    "stroke",
    "arc",
    "bezierCurveTo",
    "quadraticCurveTo",
  ].map((key) => [key, vi.fn()]),
);
Object.assign(context, { createRadialGradient: () => gradient });
HTMLCanvasElement.prototype.getContext = vi.fn(
  () => context,
) as unknown as typeof HTMLCanvasElement.prototype.getContext;
HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
HTMLDialogElement.prototype.close = function () {
  this.open = false;
};
