import type { Form } from "../types";
type Point = [number, number];
const count = 80;
function shape(form: Form, angle: number): Point {
  const x = Math.cos(angle),
    y = Math.sin(angle);
  switch (form) {
    case "respingo": {
      const r =
        0.83 +
        0.18 * Math.sin(3 * angle + 0.9) +
        0.12 * Math.cos(5 * angle - 0.4) +
        0.08 * Math.sin(7 * angle);
      return [x * r, y * r];
    }
    case "mancha": {
      const r =
        0.85 +
        0.14 * Math.sin(3 * angle + 1) +
        0.12 * Math.cos(6 * angle - 0.6);
      return [x * r * 1.05, y * r * 0.72 + 0.13];
    }
    case "pena":
      return [
        x * 0.35 * 0.707 - y * 1.12 * 0.707,
        x * 0.35 * 0.707 + y * 1.12 * 0.707,
      ];
    case "ampulheta":
      return [x * (0.4 + 0.54 * Math.abs(y)), y];
    case "divisao":
      return [x * (0.65 + 0.55 * Math.abs(x)), y * (0.3 + 0.48 * Math.abs(x))];
    case "selo": {
      const r = 0.92 + 0.07 * Math.cos(10 * angle);
      return [x * r, y * r];
    }
    case "orbita":
      return [x * 0.72, y * 0.72];
    case "interrogacao":
      return [x * 0.85, y * 0.9];
    case "ponto":
      return [x * 0.4, y * 0.4];
    default:
      return [x, y];
  }
}
const renderers = new Set<Renderer>();
let frame = 0;
let resolution = matchMedia(
  `(resolution: ${window.devicePixelRatio || 1}dppx)`,
);
function refreshPixelRatio() {
  resolution.removeEventListener("change", refreshPixelRatio);
  resolution = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
  resolution.addEventListener("change", refreshPixelRatio);
  for (const renderer of renderers) renderer.refreshScale();
}
resolution.addEventListener("change", refreshPixelRatio);
window.addEventListener("resize", refreshPixelRatio);
new MutationObserver(() => {
  for (const renderer of renderers) renderer.refreshColors();
}).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ["data-theme"],
});
function schedule() {
  if (!frame && [...renderers].some((r) => r.active()))
    frame = requestAnimationFrame(drawAll);
}
function drawAll(now: number) {
  frame = 0;
  for (const renderer of renderers) renderer.draw(now);
  schedule();
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    cancelAnimationFrame(frame);
    frame = 0;
  } else {
    for (const renderer of renderers) renderer.refreshScale();
    schedule();
  }
});
/** Local Canvas2D forms with DPR scaling, 450 ms morphs and reduced-motion cuts. */
export class Renderer {
  private context: CanvasRenderingContext2D;
  private form: Form;
  private from: Point[];
  private target: Point[];
  private body: Path2D | null = null;
  private changed = Number.NEGATIVE_INFINITY;
  private visible = true;
  private last = 0;
  private ink = "#141413";
  private clay = "#d97757";
  private edge = "#b86549";
  private reduced = false;
  private system = matchMedia("(prefers-reduced-motion: reduce)");
  private observer: IntersectionObserver;
  private nextBlink = performance.now() + 2500 + Math.random() * 3500;
  private blink = 0;
  private forceReduced = false;
  constructor(
    private canvas: HTMLCanvasElement,
    private size: number,
    form: Form,
  ) {
    this.context = canvas.getContext("2d")!;
    this.form = form;
    this.from = this.points(form);
    this.target = this.from;
    this.colors();
    this.observer = new IntersectionObserver((entries) => {
      this.visible = entries[0].isIntersecting;
      if (this.visible) {
        this.draw(performance.now(), true);
        schedule();
      }
    });
    this.observer.observe(canvas);
    this.system.addEventListener("change", this.motion);
    this.motion();
    renderers.add(this);
    schedule();
  }
  private points(form: Form) {
    return Array.from({ length: count }, (_, i) =>
      shape(form, (i / count) * Math.PI * 2),
    );
  }
  private colors() {
    const style = getComputedStyle(this.canvas);
    this.ink = style.getPropertyValue("--tinta").trim() || "#141413";
    this.clay = style.getPropertyValue("--gota").trim() || "#d97757";
    this.edge =
      "#" +
      [1, 3, 5]
        .map((i) =>
          Math.round(parseInt(this.clay.slice(i, i + 2), 16) * 0.85)
            .toString(16)
            .padStart(2, "0"),
        )
        .join("");
  }
  private motion = () => {
    this.reduced = this.system.matches || this.forceReduced;
    if (this.reduced) {
      this.from = this.target;
      this.changed = Number.NEGATIVE_INFINITY;
    }
    this.draw(performance.now(), true);
    schedule();
  };
  refreshColors() {
    this.colors();
    this.draw(performance.now(), true);
  }
  refreshScale() {
    const pixels = Math.round(
      this.size * Math.max(1, window.devicePixelRatio || 1),
    );
    if (this.visible && !document.hidden && this.canvas.width !== pixels)
      this.draw(performance.now(), true);
  }
  update(form: Form, size: number, reduced: boolean) {
    const now = performance.now();
    if (this.form !== form) {
      this.from = this.geometry(now);
      this.changed = now;
      this.form = form;
      this.target = this.points(form);
      this.body = null;
    }
    if (this.size !== size) this.body = null;
    this.size = size;
    this.forceReduced = reduced;
    this.colors();
    this.motion();
  }
  active() {
    return this.visible && !document.hidden && !this.reduced;
  }
  private geometry(now: number) {
    const blend = this.reduced ? 1 : Math.min(1, (now - this.changed) / 450);
    if (blend >= 1) return this.target;
    const eased = blend * blend * (3 - 2 * blend);
    return this.target.map(
      (point, i) =>
        [
          this.from[i][0] + (point[0] - this.from[i][0]) * eased,
          this.from[i][1] + (point[1] - this.from[i][1]) * eased,
        ] as Point,
    );
  }
  draw(now: number, force = false) {
    if (
      !force &&
      (!this.active() ||
        now - this.last < 1000 / (this.size >= 96 ? 60 : 30) - 0.5)
    )
      return;
    this.last = now;
    // Stationary forms only repaint for morphs or blinking; orbit keeps moving.
    if (
      !force &&
      this.form !== "orbita" &&
      now - this.changed >= 450 &&
      now < this.nextBlink &&
      !(this.blink > 0 && now - this.blink < 150)
    )
      return;
    const ctx = this.context;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const pixels = Math.round(this.size * dpr);
    if (this.canvas.width !== pixels) {
      this.canvas.width = pixels;
      this.canvas.height = pixels;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.size, this.size);
    ctx.translate(this.size / 2, this.size / 2);
    const radius = this.size * 0.32;
    const time = this.reduced ? 0 : now / 1000;
    const breath =
      this.reduced || this.form !== "orbita"
        ? 1
        : 1 + Math.sin(time * 1.4) * 0.018;
    ctx.scale(breath, breath);
    const gradient = ctx.createRadialGradient(
      -radius * 0.3,
      -radius * 0.4,
      radius * 0.1,
      0,
      0,
      radius * 1.2,
    );
    gradient.addColorStop(0, this.clay);
    gradient.addColorStop(1, this.edge);
    ctx.fillStyle = gradient;
    const settled = this.reduced ? 1 : Math.min(1, (now - this.changed) / 450);
    let body = this.body;
    if (!body) {
      body = new Path2D();
      this.geometry(now).forEach(([x, y], i) => {
        if (i === 0) body!.moveTo(x * radius, y * radius);
        else body!.lineTo(x * radius, y * radius);
      });
      body.closePath();
      if (settled >= 1) this.body = body;
    }
    ctx.fill(body);
    if (radius > 9 && this.form !== "ponto") {
      ctx.save();
      ctx.clip(body);
      ctx.fillStyle = "rgba(255,255,255,.15)";
      ctx.rotate(-0.5);
      ctx.beginPath();
      ctx.ellipse(
        -radius * 0.28,
        -radius * 0.5,
        radius * 0.28,
        radius * 0.12,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = settled;
    ctx.strokeStyle = this.ink;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(1.4, radius * 0.13);
    if (this.form === "orbita") {
      ctx.strokeStyle = this.edge;
      ctx.beginPath();
      ctx.ellipse(0, 0, radius * 1.3, radius * 0.55, -0.55, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = this.clay;
      ctx.beginPath();
      ctx.arc(
        Math.cos(time) * radius * 1.05,
        Math.sin(time) * radius * 0.7,
        radius * 0.16,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    if (this.form === "interrogacao") {
      ctx.beginPath();
      ctx.moveTo(-radius * 0.3, -radius * 0.3);
      ctx.bezierCurveTo(
        -radius * 0.3,
        -radius * 0.8,
        radius * 0.6,
        -radius * 0.75,
        radius * 0.35,
        -radius * 0.15,
      );
      ctx.quadraticCurveTo(radius * 0.25, radius * 0.05, 0, radius * 0.14);
      ctx.lineTo(0, radius * 0.28);
      ctx.stroke();
      ctx.fillStyle = this.ink;
      ctx.beginPath();
      ctx.arc(0, radius * 0.6, radius * 0.09, 0, Math.PI * 2);
      ctx.fill();
    }
    if (this.form === "selo") {
      ctx.beginPath();
      ctx.moveTo(-radius * 0.35, 0);
      ctx.lineTo(-radius * 0.05, radius * 0.3);
      ctx.lineTo(radius * 0.4, -radius * 0.28);
      ctx.stroke();
    }
    if (radius > 9 && !["interrogacao", "selo", "ponto"].includes(this.form)) {
      if (!this.reduced && now >= this.nextBlink) {
        this.blink = now;
        this.nextBlink = now + 2500 + Math.random() * 3500;
      }
      const closed = !this.reduced && now - this.blink < 120;
      ctx.fillStyle = this.ink;
      for (const x of [-0.3, 0.3]) {
        ctx.beginPath();
        ctx.ellipse(
          radius * x,
          radius * 0.02,
          radius * 0.075,
          radius * (closed ? 0.02 : 0.11),
          0,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
  dispose() {
    this.observer.disconnect();
    this.system.removeEventListener("change", this.motion);
    renderers.delete(this);
    if (!renderers.size) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
  }
}
