// Read-only accessibility diagnostic of the isolated native test webview.
/* global window */
import { chromium } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
const output = process.env.SCRIBE_EVIDENCE_DIR;
const stage = process.env.SCRIBE_A11Y_STAGE;
if (
  !output?.includes(".artifacts") ||
  !["sessions", "details", "settings", "error", "collapsed"].includes(stage)
)
  throw new Error("Isolated output and explicit accessibility stage required");
const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
try {
  const page = browser
    .contexts()
    .flatMap((context) => context.pages())
    .find((page) => page.url() === "http://tauri.localhost/");
  if (!page) throw new Error("Native production test webview unavailable");
  // DevTools evaluates the local diagnostic without changing the production CSP.
  await page.evaluate(
    await readFile(
      createRequire(import.meta.url).resolve("axe-core/axe.min.js"),
      "utf8",
    ),
  );
  const result = await page.evaluate(async () => {
    const report = await window.axe.run({
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
    });
    return {
      width: innerWidth,
      height: innerHeight,
      theme: document.documentElement.dataset.theme,
      language: document.documentElement.lang,
      violations: report.violations.map(({ id, impact, nodes }) => ({
        id,
        impact,
        targets: nodes.flatMap((node) => node.target),
      })),
    };
  });
  await mkdir(output, { recursive: true });
  await writeFile(
    path.join(output, `native-a11y-${stage}.json`),
    JSON.stringify({ stage, ...result }, null, 2) + "\n",
  );
  console.log(JSON.stringify({ stage, violations: result.violations }));
  if (result.violations.length) process.exitCode = 1;
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  // Closing the browser would terminate the embedded WebView2, too.
  setImmediate(() => process.exit(process.exitCode ?? 0));
}
