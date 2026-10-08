import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import path from "node:path";
const require = createRequire(import.meta.url);
const evidence = path.resolve("../.artifacts/phase-3-browser");

test("a long permission exposes its final operation without expanding the target", async ({
  page,
}) => {
  const target = `echo ${"public_argument_".repeat(100)}; rm -rf public-project`;
  await page.setViewportSize({ width: 372, height: 700 });
  await page.route("**/src/bridge.ts", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `
      export const desktop = false;
      export const defaults = {language:'pt-BR',theme:'light',shortcut:'Control+Shift+Space',notifications:true,retentionDays:14,completedMinutes:10,permissionSeconds:120,port:7717,collapsed:false,side:'right',y:null,monitor:null};
      export const initial = {at:Date.now(),revision:1,sessions:[],preferences:defaults,error:null,decisions:[{id:'long',sessionId:'public',project:'public-project',kind:'permission',tool:'Bash',target:${JSON.stringify(target)},question:null,options:[],risk:true,canAllow:true,armed:false,status:'pending',createdAt:Date.now(),expiresAt:Date.now()+120000,resolvedAt:null}]};
      export async function observe(receive) { receive(initial); return () => {}; }
      export async function resolveDecision() { throw new Error('This check never authorizes a tool'); }
      export async function savePreferences() { return initial; }
      export async function clearHistory() { return initial; }
      export async function toggle() { return initial; }
      export async function move() { return initial; }
      export async function drag() {}
      export async function openHelp() {}
    `,
    }),
  );
  await page.goto("/");
  const operation = page.locator(".decision-target");
  await expect(operation).toHaveText(target);
  await expect(operation).toHaveAttribute("aria-expanded", "false");
  const layout = await operation.evaluate((element) => ({
    width: element.clientWidth,
    scrollWidth: element.scrollWidth,
    height: element.clientHeight,
    scrollHeight: element.scrollHeight,
    fontSize: parseFloat(getComputedStyle(element).fontSize),
  }));
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.width + 1);
  expect(layout.scrollHeight).toBeLessThanOrEqual(layout.height + 1);
  expect(layout.height).toBeGreaterThan(layout.fontSize * 3);
  await operation.scrollIntoViewIfNeeded();
  await expect(operation).toHaveCSS("white-space", "pre-wrap");
});

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

test("history confirmation keeps visible keyboard focus without deleting data", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Configurações", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await page
    .getByRole("button", { name: "Apagar histórico", exact: true })
    .focus();
  for (let cycle = 0; cycle < 3; cycle++) {
    await page.keyboard.press("Enter");
    const cancel = page.getByRole("button", { name: "Cancelar", exact: true });
    await expect(cancel).toBeFocused();
    await expect(cancel).toHaveCSS("outline-style", "solid");
    await page.keyboard.press("Enter");
    const clear = page.getByRole("button", {
      name: "Apagar histórico",
      exact: true,
    });
    await expect(clear).toBeFocused();
    await expect(clear).toHaveCSS("outline-style", "solid");
  }
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Configurações", exact: true }),
  ).toBeFocused();
});

for (const operation of ["clear", "save"] as const) {
  test(`${operation} failure restores lost keyboard focus and preserves subsequent navigation`, async ({
    page,
  }) => {
    await page.route("**/src/bridge.ts", (route) =>
      route.fulfill({
        contentType: "text/javascript",
        body: `
        export const desktop = false;
        export const defaults = {language:'pt-BR',theme:'dark',shortcut:'Control+Shift+Space',notifications:true,retentionDays:14,completedMinutes:10,port:7717,collapsed:false,side:'right',y:null,monitor:null};
        export const initial = {at:0,revision:1,sessions:[],preferences:defaults,error:null};
        export async function observe() { return () => {}; }
        function failLater() { return new Promise((_, reject) => window.addEventListener('scribe-test-fail', () => reject('${operation === "clear" ? "storageUnavailable" : "configUnavailable"}'), {once:true})); }
        export const clearHistory = failLater;
        export const savePreferences = failLater;
        export async function toggle() { return initial; }
        export async function move() { return initial; }
        export async function drag() {}
        export async function openHelp() {}
      `,
      }),
    );
    await page.goto("/");
    await page
      .getByRole("button", { name: "Configurações", exact: true })
      .focus();
    await page.keyboard.press("Enter");
    if (operation === "clear") {
      await page
        .getByRole("button", { name: "Apagar histórico", exact: true })
        .focus();
      await page.keyboard.press("Enter");
    }
    const submit = page.getByRole("button", {
      name:
        operation === "clear" ? "Apagar histórico agora" : "Salvar alterações",
      exact: true,
    });
    for (const navigate of [false, true]) {
      await submit.focus();
      await page.keyboard.press("Enter");
      await expect(submit).toBeDisabled();
      const language = page.getByRole("combobox", {
        name: "Idioma",
        exact: true,
      });
      if (navigate) await language.focus();
      await page.evaluate(() =>
        window.dispatchEvent(new Event("scribe-test-fail")),
      );
      await expect(submit).toBeEnabled();
      const focused = navigate ? language : submit;
      await expect(focused).toBeFocused();
      await expect(focused).toHaveCSS("outline-style", "solid");
      await expect(page.getByRole("alert")).toBeVisible();
    }
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "Configurações", exact: true }),
    ).toBeFocused();
  });
}

test("a closed modal finishing its save preserves the new settings draft", async ({
  page,
}) => {
  await page.route("**/src/bridge.ts", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `
      export const desktop = false;
      export const defaults = {language:'pt-BR',theme:'light',shortcut:'Control+Shift+Space',notifications:true,retentionDays:14,completedMinutes:10,port:7717,collapsed:false,side:'right',y:null,monitor:null};
      export const initial = {at:0,revision:1,sessions:[],preferences:defaults,error:null};
      export async function observe() { return () => {}; }
      export function savePreferences() { return new Promise(resolve => window.addEventListener('scribe-test-save-ok', () => resolve({...initial, revision:2, preferences:{...defaults,theme:'dark'}}), {once:true})); }
      export async function clearHistory() { return initial; }
      export async function toggle() { return initial; }
      export async function move() { return initial; }
      export async function drag() {}
      export async function openHelp() {}
    `,
    }),
  );
  await page.goto("/");
  const settings = page.getByRole("button", {
    name: "Configurações",
    exact: true,
  });
  await settings.click();
  await page
    .getByRole("button", { name: "Salvar alterações", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Salvar alterações", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await settings.click();
  const retention = page.getByRole("spinbutton", {
    name: "Manter histórico (dias)",
    exact: true,
  });
  await retention.fill("27");
  await page.evaluate(() =>
    window.dispatchEvent(new Event("scribe-test-save-ok")),
  );
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(retention).toHaveValue("27");
  await expect(retention).toBeFocused();
});

test("stationary forms without eyes remain settled after the longest blink interval", async ({
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
  await page.waitForTimeout(6500);
  const snapshot = () =>
    page.evaluate(() => {
      const counts = (
        window as unknown as { scribeDraws: Map<HTMLCanvasElement, number> }
      ).scribeDraws;
      return [
        ...document.querySelectorAll<HTMLCanvasElement>(".forms-grid canvas"),
      ]
        .filter((canvas) => {
          const form = canvas
            .closest(".form-row")
            ?.querySelector("h2")?.textContent;
          return (
            form !== "Órbita" &&
            (parseInt(canvas.style.width) === 24 ||
              ["Interrogação", "Selo", "Ponto final"].includes(form ?? ""))
          );
        })
        .map((canvas) => ({
          size: parseInt(canvas.style.width),
          form: canvas.closest(".form-row")?.querySelector("h2")?.textContent,
          draws: counts.get(canvas) ?? 0,
        }));
    });
  const before = await snapshot();
  await page.waitForTimeout(1100);
  const after = await snapshot();
  expect(before).toHaveLength(15);
  expect(after).toEqual(before);
  await mkdir(evidence, { recursive: true });
  await import("node:fs/promises").then((fs) =>
    fs.writeFile(
      path.join(evidence, "browser-settled-forms.json"),
      JSON.stringify(
        {
          intervalMs: 1100,
          afterLongestBlink: true,
          samples: after.map((item, index) => ({
            form: item.form,
            size: item.size,
            redraws: item.draws - before[index].draws,
          })),
        },
        null,
        2,
      ) + "\n",
    ),
  );
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
