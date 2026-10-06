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
