import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import path from "node:path";
const require = createRequire(import.meta.url);
const evidence = path.resolve("../.artifacts/phase-3-browser");

test("moving canvases respect frame limits and reduced motion stops all draws", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1080, height: 1550 });
  await page.addInitScript(() => {
    const counts = new Map<HTMLCanvasElement, number>();
    const original = CanvasRenderingContext2D.prototype.clearRect;
    CanvasRenderingContext2D.prototype.clearRect = function (...args) {
      counts.set(this.canvas, (counts.get(this.canvas) ?? 0) + 1);
      return original.apply(this, args);
    };
    Object.assign(window, { scribeDraws: counts });
  });
  await page.goto("/test/formas-24px.html");
  await page.getByRole("button", { name: "Órbita", exact: true }).click();
  // Let the mandatory 450 ms morph finish before measuring steady animation.
  await page.waitForTimeout(500);
  const before = await page.evaluate(() => {
    const counts = (
      window as unknown as { scribeDraws: Map<HTMLCanvasElement, number> }
    ).scribeDraws;
    return [...counts].map(([canvas, count]) => ({
      size: parseInt(canvas.style.width),
      count,
    }));
  });
  await page.waitForTimeout(1000);
  const after = await page.evaluate(() => {
    const counts = (
      window as unknown as { scribeDraws: Map<HTMLCanvasElement, number> }
    ).scribeDraws;
    return [...counts].map(([canvas, count]) => ({
      size: parseInt(canvas.style.width),
      count,
    }));
  });
  const rates = after.map((item, index) => ({
    size: item.size,
    draws: item.count - before[index].count,
  }));
  expect(
    rates
      .filter((item) => item.size === 96)
      .some((item) => item.draws >= 50 && item.draws <= 65),
  ).toBe(true);
  expect(
    rates.filter((item) => item.size < 96).every((item) => item.draws <= 35),
  ).toBe(true);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForTimeout(100);
  const stopped = await page.evaluate(() => [
    ...(
      window as unknown as { scribeDraws: Map<HTMLCanvasElement, number> }
    ).scribeDraws.values(),
  ]);
  await page.waitForTimeout(500);
  const still = await page.evaluate(() => [
    ...(
      window as unknown as { scribeDraws: Map<HTMLCanvasElement, number> }
    ).scribeDraws.values(),
  ]);
  expect(still).toEqual(stopped);
  await mkdir(evidence, { recursive: true });
  await import("node:fs/promises").then((fs) =>
    fs.writeFile(
      path.join(evidence, "browser-frame-rates.json"),
      JSON.stringify({ rates, reducedMotionStopped: true }, null, 2),
    ),
  );
});

test("empty preview, keyboard dialog, language and theme survive real browser layout", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByText(
      "Nenhuma sessão por aqui. Abra o Claude Code e eu acompanho.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Permitir|Negar/ }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Configurações", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("combobox", { name: "Idioma", exact: true })
    .selectOption("en");
  await page
    .getByRole("combobox", { name: "Tema", exact: true })
    .selectOption("light");
  await page
    .getByRole("button", { name: "Salvar alterações", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Settings", exact: true }),
  ).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

for (const theme of ["light", "dark"] as const) {
  test(`state glyph contrast ${theme}: question and seal at 24/40/56/96 px`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/test/formas-24px.html");
    await page
      .getByRole("combobox", { name: "Tema", exact: true })
      .selectOption(theme);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    const results = await page.evaluate(async (modulePath) => {
      const { Renderer } = await import(modulePath);
      const luminance = (rgb: number[]) => {
        const linear = rgb.map((value) => {
          const normalized = value / 255;
          return normalized <= 0.04045
            ? normalized / 12.92
            : ((normalized + 0.055) / 1.055) ** 2.4;
        });
        return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
      };
      const contrast = (a: number[], b: number[]) => {
        const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
        return (values[0] + 0.05) / (values[1] + 0.05);
      };
      const readColor = (value: string) =>
        [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16));
      const style = getComputedStyle(document.documentElement);
      const ink = readColor(style.getPropertyValue("--gota-ink").trim());
      const clay = readColor(style.getPropertyValue("--gota").trim());
      const edge = clay.map((value) => Math.round(value * 0.85));
      const nominalMinimum = Math.min(contrast(ink, clay), contrast(ink, edge));
      const samples = [];
      for (const form of ["interrogacao", "selo"]) {
        for (const size of [24, 40, 56, 96]) {
          const canvas = document.createElement("canvas");
          document.body.append(canvas);
          const renderer = new Renderer(canvas, size, form);
          const context = canvas.getContext("2d")!;
          const pixels = context.getImageData(
            0,
            0,
            canvas.width,
            canvas.height,
          ).data;
          let darkest = clay;
          for (let i = 0; i < pixels.length; i += 4) {
            const rgb = Array.from(pixels.slice(i, i + 3));
            if (pixels[i + 3] === 255 && luminance(rgb) < luminance(darkest))
              darkest = rgb;
          }
          const x = Math.floor(canvas.width * (0.5 + 0.65 * 0.32));
          const y = Math.floor(canvas.height * 0.5);
          const body = Array.from(
            context.getImageData(x, y, 1, 1).data.slice(0, 3),
          );
          samples.push({
            form,
            size,
            darkest,
            body,
            corePixelContrast: contrast(darkest, body),
          });
          renderer.dispose();
          canvas.remove();
        }
      }
      return {
        theme: document.documentElement.dataset.theme,
        ink,
        clay,
        edge,
        nominalMinimum,
        samples,
      };
    }, "/src/gota/render.ts");
    expect(results.theme).toBe(theme);
    expect(results.nominalMinimum).toBeGreaterThanOrEqual(3);
    expect(results.samples).toHaveLength(8);
    for (const sample of results.samples)
      expect(sample.corePixelContrast).toBeGreaterThanOrEqual(3);
    await mkdir(evidence, { recursive: true });
    await import("node:fs/promises").then((fs) =>
      fs.writeFile(
        path.join(evidence, `glyph-contrast-${theme}.json`),
        JSON.stringify(results, null, 2) + "\n",
      ),
    );
  });

  test(`catalogue ${theme}: ten forms, 24/40/96 px, local fonts and WCAG AA`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1080, height: 1550 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const remote: string[] = [];
    page.on("request", (request) => {
      if (!new URL(request.url()).hostname.match(/^(127\.0\.0\.1|localhost)$/))
        remote.push(request.url());
    });
    await page.goto("/test/formas-24px.html");
    await page
      .getByRole("combobox", { name: "Tema", exact: true })
      .selectOption(theme);
    await expect(page.locator(".form-row")).toHaveCount(10);
    await expect(page.locator(".forms-grid canvas")).toHaveCount(30);
    await page.evaluate(() => document.fonts.ready);
    for (const size of [24, 40, 96]) {
      const dimensions = await page
        .locator(`.forms-grid canvas[style*="width: ${size}px"]`)
        .evaluateAll((elements) =>
          elements.map((el) => ({
            width: el.getBoundingClientRect().width,
            height: el.getBoundingClientRect().height,
            pixels: (el as HTMLCanvasElement).width,
          })),
        );
      expect(dimensions).toHaveLength(10);
      for (const item of dimensions)
        expect(item).toEqual({ width: size, height: size, pixels: size });
    }
    await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
    const violations = await page.evaluate(
      async () =>
        (
          await (
            window as unknown as {
              axe: { run: (o: unknown) => Promise<{ violations: unknown[] }> };
            }
          ).axe.run({
            runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
          })
        ).violations,
    );
    expect(violations).toEqual([]);
    expect(remote).toEqual([]);
    await mkdir(evidence, { recursive: true });
    await page.screenshot({
      path: path.join(evidence, `forms-${theme}-24-40-96.png`),
      fullPage: true,
    });
  });
}
