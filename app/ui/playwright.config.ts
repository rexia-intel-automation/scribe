import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";
export default defineConfig({
  testDir: "./test/e2e",
  outputDir: "../../.artifacts/phase-3-browser/results",
  reporter: [
    ["list"],
    ["json", { outputFile: "../.artifacts/phase-3-browser/results.json" }],
  ],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:1420",
    viewport: { width: 372, height: 800 },
    locale: "pt-BR",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev",
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    url: "http://127.0.0.1:1420",
    reuseExistingServer: !process.env.CI,
  },
});
