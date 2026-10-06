// Read-only WebView inspection; sends public hook inputs only to an isolated test app.
// No UI command, permission decision or simulated human click is issued here.
import { chromium } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
const configPath = process.env.SCRIBE_CONNECTION_FILE;
const output = process.env.SCRIBE_EVIDENCE_DIR;
if (!configPath?.includes(".artifacts") || !output?.includes(".artifacts"))
  throw new Error("Isolated fixture paths required");
const connection = JSON.parse(await readFile(configPath, "utf8"));
const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
try {
  const page = browser
    .contexts()
    .flatMap((context) => context.pages())
    .find((page) => /tauri\.localhost|localhost:1420/.test(page.url()));
  if (!page) throw new Error("Native Scribe webview unavailable");
  const samples = [];
  for (let index = 0; index < 32; index++) {
    const marker = `public-native-${index}.ts`;
    const observed = page.evaluate(
      (marker) =>
        new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            observer.disconnect();
            reject(new Error("Native render timeout"));
          }, 1500);
          const observer = new MutationObserver(() => {
            if (document.body.innerText.includes(marker)) {
              clearTimeout(timeout);
              observer.disconnect();
              resolve(true);
            }
          });
          observer.observe(document.body, {
            subtree: true,
            childList: true,
            characterData: true,
          });
        }),
      marker,
    );
    const start = performance.now();
    const response = await fetch(
      `http://127.0.0.1:${connection.port}/v1/hooks/PreToolUse`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${connection.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          hook_event_name: "PreToolUse",
          session_id: "public-native-phase3",
          cwd: "D:/public/scribe-verification",
          tool_name: "Edit",
          tool_input: { file_path: `D:/public/${marker}` },
        }),
      },
    );
    if (response.status !== 204)
      throw new Error(`Hook rejected: ${response.status}`);
    await observed;
    samples.push(performance.now() - start);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const dimensions = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    dpr: devicePixelRatio,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
    theme: document.documentElement.dataset.theme,
    localFonts:
      document.fonts.check("16px Hanken") &&
      document.fonts.check("16px Newsreader"),
  }));
  const sorted = samples.toSorted((a, b) => a - b);
  const p95 = sorted[Math.ceil(samples.length * 0.95) - 1];
  await mkdir(output, { recursive: true });
  await page.screenshot({ path: path.join(output, "native-sessions.png") });
  await writeFile(
    path.join(output, "native-observation.json"),
    JSON.stringify(
      {
        mode: page.url().includes("1420") ? "development" : "production",
        dimensions,
        samples,
        p95,
        localOnly: true,
        simulatedDecision: false,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(JSON.stringify({ samples: samples.length, p95, dimensions }));
  if (p95 >= 200 || dimensions.width !== 372 || dimensions.scrollWidth > 372)
    throw new Error("Native layout/latency criterion failed");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  // WebView2 is owned by the native app: Browser.close destroys its renderer.
  // Ending this diagnostic client disconnects CDP without issuing Browser.close.
  setImmediate(() => process.exit(process.exitCode ?? 0));
}
