import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Renderer } from "./render";
const owned: Renderer[] = [];
beforeEach(() => vi.spyOn(performance, "now").mockReturnValue(1000));
afterEach(() => {
  for (const renderer of owned.splice(0)) renderer.dispose();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
function avatar(size: number) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d")!;
  const renderer = new Renderer(canvas, size, "gota");
  owned.push(renderer);
  vi.mocked(context.clearRect).mockClear();
  return { canvas, context, renderer };
}
describe("canvas scheduling and accessibility", () => {
  it.each([24, 56, 96])(
    "paints the final morph geometry at %i px after a delayed frame",
    (size) => {
      const moveTo = vi.spyOn(Path2D.prototype, "moveTo");
      const { renderer, context } = avatar(size);
      renderer.update("ponto", size, false);
      vi.mocked(context.clearRect).mockClear();
      renderer.draw(1400);
      expect(moveTo.mock.lastCall?.[0]).not.toBe(size * 0.32 * 0.4);
      renderer.draw(1500);
      expect(moveTo).toHaveBeenLastCalledWith(size * 0.32 * 0.4, 0);
      expect(context.clearRect).toHaveBeenCalledTimes(2);
      expect(renderer.frameDelay(1500)).toBe(Infinity);
      renderer.draw(1700);
      expect(context.clearRect).toHaveBeenCalledTimes(2);
    },
  );
  it("does not schedule frames for settled eyeless forms, but resumes a morph", () => {
    let now = 1000;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const pending = new Map<number, FrameRequestCallback>();
    let id = 0;
    vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation(
      (callback) => {
        pending.set(++id, callback);
        return id;
      },
    );
    vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation((key) => {
      pending.delete(key);
    });
    const { renderer } = avatar(24);
    expect(pending.size).toBe(0);
    renderer.update("selo", 24, false);
    expect(pending.size).toBe(1);
    now = 1500;
    const callbacks = [...pending.values()];
    pending.clear();
    callbacks.forEach((callback) => callback(now));
    expect(pending.size).toBe(0);
    renderer.update("orbita", 24, false);
    expect(pending.size).toBe(1);
    renderer.dispose();
    expect(pending.size).toBe(0);
  });
  it("sleeps until a blink, then reopens the eyes and sleeps again", () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    let now = 1000;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const pending = new Map<number, FrameRequestCallback>();
    let id = 0;
    vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation(
      (callback) => {
        pending.set(++id, callback);
        return id;
      },
    );
    vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation((key) => {
      pending.delete(key);
    });
    const { renderer, context } = avatar(96);
    expect(pending.size).toBe(0);
    now = 3500;
    vi.advanceTimersByTime(2500);
    expect(pending.size).toBe(1);
    const tick = (time: number) => {
      now = time;
      const callbacks = [...pending.values()];
      pending.clear();
      callbacks.forEach((callback) => callback(now));
    };
    tick(3500);
    tick(3630);
    tick(3700);
    expect(context.clearRect).toHaveBeenCalledTimes(2);
    expect(pending.size).toBe(0);
    expect(vi.getTimerCount()).toBe(1);
    renderer.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("cancels sleeping blink work while hidden or reduced, and on disposal", () => {
    vi.useFakeTimers();
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    const { renderer } = avatar(96);
    expect(vi.getTimerCount()).toBe(1);
    hidden.mockReturnValue(true);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(vi.getTimerCount()).toBe(0);
    hidden.mockReturnValue(false);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(vi.getTimerCount()).toBe(1);
    renderer.update("gota", 96, true);
    expect(vi.getTimerCount()).toBe(0);
    renderer.update("gota", 96, false);
    expect(vi.getTimerCount()).toBe(1);
    renderer.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("limits small avatars to 30 draws and large avatars to 60 per second", () => {
    for (const [size, draws] of [
      [40, 30],
      [96, 60],
    ]) {
      const { renderer, context } = avatar(size);
      renderer.update("orbita", size, false);
      vi.mocked(context.clearRect).mockClear();
      for (let i = 1; i <= 120; i++) renderer.draw(1000 + (i * 1000) / 120);
      expect(vi.mocked(context.clearRect).mock.calls.length).toBe(draws);
      renderer.dispose();
    }
  });
  it("draws at device pixel ratio without changing its logical dimensions", () => {
    vi.spyOn(window, "devicePixelRatio", "get").mockReturnValue(2);
    const { canvas, context, renderer } = avatar(24);
    renderer.draw(1100, true);
    expect(canvas.width).toBe(48);
    expect(canvas.height).toBe(48);
    expect(context.setTransform).toHaveBeenLastCalledWith(2, 0, 0, 2, 0, 0);
    expect(context.clearRect).toHaveBeenLastCalledWith(0, 0, 24, 24);
  });
  it("renders a reduced-motion change once and then stops animation", () => {
    const { renderer, context } = avatar(96);
    renderer.update("interrogacao", 96, true);
    expect(renderer.active()).toBe(false);
    vi.mocked(context.clearRect).mockClear();
    for (let i = 1; i <= 120; i++) renderer.draw(1000 + i * 10);
    expect(context.clearRect).not.toHaveBeenCalled();
    renderer.update("selo", 96, true);
    expect(context.clearRect).toHaveBeenCalledTimes(1);
  });
  it("repaints a DPR change once while reduced motion remains stopped", () => {
    const ratio = vi
      .spyOn(window, "devicePixelRatio", "get")
      .mockReturnValue(1);
    const { canvas, renderer, context } = avatar(24);
    renderer.update("gota", 24, true);
    vi.mocked(context.clearRect).mockClear();
    ratio.mockReturnValue(2);
    window.dispatchEvent(new Event("resize"));
    expect(canvas.width).toBe(48);
    expect(canvas.height).toBe(48);
    expect(renderer.active()).toBe(false);
    expect(context.clearRect).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event("resize"));
    renderer.draw(2000);
    expect(context.clearRect).toHaveBeenCalledTimes(1);
  });
  it("does not animate hidden documents", () => {
    const { renderer, context } = avatar(40);
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    renderer.draw(2000);
    expect(renderer.active()).toBe(false);
    expect(context.clearRect).not.toHaveBeenCalled();
  });
  it("does not continually repaint a settled stationary form", () => {
    const { renderer, context } = avatar(96);
    for (let i = 1; i <= 120; i++) renderer.draw(1000 + (i * 1000) / 120);
    expect(context.clearRect).not.toHaveBeenCalled();
  });
  it.each([
    ["gota", 24],
    ["interrogacao", 56],
    ["selo", 56],
    ["ponto", 56],
  ] as const)(
    "keeps eyeless %s at %i px settled after the blink interval",
    (form, size) => {
      const { renderer, context } = avatar(size);
      renderer.update(form, size, false);
      renderer.draw(1500);
      vi.mocked(context.clearRect).mockClear();
      for (let i = 1; i <= 120; i++) renderer.draw(10000 + (i * 1000) / 120);
      expect(context.clearRect).not.toHaveBeenCalled();
    },
  );
  it("still repaints a blink and its reopening on forms with eyes", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { renderer, context } = avatar(96);
    renderer.draw(3500);
    renderer.draw(3640);
    renderer.draw(3700);
    expect(context.clearRect).toHaveBeenCalledTimes(2);
  });
  it.each([40, 96])(
    "reopens eyes at %i px when a late frame skips the blink transition",
    (size) => {
      vi.spyOn(Math, "random").mockReturnValue(0);
      const { renderer, context } = avatar(size);
      renderer.draw(3500);
      renderer.draw(3610);
      expect(vi.mocked(context.ellipse).mock.lastCall?.[3]).toBe(
        size * 0.32 * 0.02,
      );
      renderer.draw(3680);
      expect(vi.mocked(context.ellipse).mock.lastCall?.[3]).toBe(
        size * 0.32 * 0.11,
      );
      expect(context.clearRect).toHaveBeenCalledTimes(3);
      expect(renderer.frameDelay(3680)).toBeGreaterThan(0);
      renderer.draw(3800);
      expect(context.clearRect).toHaveBeenCalledTimes(3);
    },
  );
  it("omits eyes and highlight below the specified radius", () => {
    const { renderer, context } = avatar(24);
    vi.mocked(context.ellipse).mockClear();
    renderer.draw(2000, true);
    expect(context.ellipse).not.toHaveBeenCalled();
    renderer.update("gota", 40, true);
    expect(context.ellipse).toHaveBeenCalledTimes(3);
  });
  it("keeps informative glyphs in dark ink against clay in the dark theme", () => {
    const { canvas, renderer, context } = avatar(96);
    canvas.style.setProperty("--tinta", "#f0eee6");
    canvas.style.setProperty("--gota", "#e08562");
    renderer.update("interrogacao", 96, true);
    expect(context.strokeStyle).toBe("#141413");
    renderer.update("selo", 96, true);
    expect(context.strokeStyle).toBe("#141413");
  });
});
