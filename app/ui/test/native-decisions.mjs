// End-to-end checks against native Scribe; all tool actions use public test files.
import { chromium } from "@playwright/test";
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";
import { resolve, join } from "node:path";
import assert from "node:assert/strict";

const root = resolve("../.artifacts/phase-4-native");
const workspace = join(root, "workspace");
const installed = process.env.SCRIBE_VERIFY_INSTALLED === "1";
const configPath = installed
  ? join(process.env.APPDATA, "com.rexia.scribe/connection.json")
  : join(root, "config/connection.json");
const executable = installed
  ? join(process.env.LOCALAPPDATA, "Scribe/scribe-hook.exe")
  : resolve("hook-client/target/release/scribe-hook.exe");
const app = installed
  ? join(process.env.LOCALAPPDATA, "Scribe/scribe.exe")
  : resolve("src-tauri/target/release/scribe.exe");
const connection = JSON.parse(await readFile(configPath, "utf8"));
function proof(...fields) {
  const hmac = createHmac("sha256", connection.hook_key).update(
    "scribe-hook-v1",
  );
  for (const field of fields) {
    const bytes = Buffer.from(field);
    const length = Buffer.alloc(8);
    length.writeBigUInt64BE(BigInt(bytes.length));
    hmac.update(length).update(bytes);
  }
  return hmac.digest("base64url");
}
function verify(expected, actual) {
  if (!actual) return false;
  const a = Buffer.from(expected, "base64url");
  const b = Buffer.from(actual, "base64url");
  return a.length === b.length && timingSafeEqual(a, b);
}
const browser = await chromium.connectOverCDP("http://127.0.0.1:9224", {
  noDefaults: true,
});
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => p.url() === "http://tauri.localhost/");
assert(page, "Native Scribe must be open in the isolated profile");
const runs = [];

function childProcess(exe, args, input = "") {
  const child = spawn(exe, args, {
    cwd: workspace,
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      SCRIBE_CONNECTION_FILE: configPath,
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
    },
  });
  let stdout = "",
    stderr = "";
  child.stdin.on("error", () => {});
  child.stdin.end(input);
  child.stdout.on("data", (chunk) => (stdout += chunk));
  child.stderr.on("data", (chunk) => (stderr += chunk));
  const timer = setTimeout(() => child.kill(), 180000);
  const finished = new Promise((ok, fail) => {
    child.once("error", fail);
    child.once("close", (code) => {
      clearTimeout(timer);
      ok({ code, stdout, stderr });
    });
  });
  return { child, finished };
}
async function focus() {
  spawn(app, ["--open"], { windowsHide: true, stdio: "ignore" }).unref();
  await page.bringToFront();
  await page.waitForTimeout(300);
}
async function hook(event, session, input = {}) {
  const nonce = randomUUID().replaceAll("-", "");
  const challenge = await fetch(
    `http://127.0.0.1:${connection.port}/v1/hooks/challenge/${nonce}`,
  );
  assert.equal(challenge.status, 204);
  assert(
    verify(proof("challenge", nonce), challenge.headers.get("x-scribe-proof")),
    "Hook challenge proof must match",
  );
  const body = JSON.stringify({
    hook_event_name: event,
    session_id: session,
    cwd: workspace,
    ...input,
  });
  const response = await fetch(
    `http://127.0.0.1:${connection.port}/v1/hooks/${event}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-scribe-nonce": nonce,
        "x-scribe-proof": proof("request", nonce, event, body),
      },
      body,
    },
  );
  const responseBody = await response.text();
  assert(
    verify(
      proof("response", nonce, event, String(response.status), responseBody),
      response.headers.get("x-scribe-proof"),
    ),
    "Hook response proof must match",
  );
  assert.equal(response.status, 204);
}
async function choose(card, name) {
  await card.waitFor({ state: "visible", timeout: 60000 });
  await focus();
  const start = performance.now();
  await card.getByRole("button", { name, exact: true }).click();
  return start;
}
async function synthetic() {
  for (const [label, action] of [
    ["native-allow", "allow"],
    ["native-deny", "deny"],
    ["native-risk", "allow"],
  ]) {
    const session = randomUUID();
    await hook("SessionStart", session);
    const marker = `${label === "native-risk" ? "sudo " : ""}echo ${label}`;
    const request = childProcess(
      executable,
      ["--hook", "PermissionRequest"],
      JSON.stringify({
        hook_event_name: "PermissionRequest",
        session_id: session,
        cwd: workspace,
        tool_name: "Bash",
        tool_use_id: randomUUID(),
        tool_input: { command: marker },
      }),
    );
    const card = page.getByRole("article").filter({ hasText: marker });
    if (label === "native-risk") {
      await choose(card, "Permitir uma vez");
      assert.equal(
        request.child.exitCode,
        null,
        "First risk click must not authorize",
      );
    }
    const start = await choose(
      card,
      label === "native-risk"
        ? "Confirmar permissão"
        : action === "allow"
          ? "Permitir uma vez"
          : "Negar",
    );
    const result = await request.finished;
    assert.equal(result.code, 0);
    assert.equal(result.stderr, "");
    assert.equal(
      JSON.parse(result.stdout).hookSpecificOutput.decision.behavior,
      action,
    );
    const elapsedMs = performance.now() - start;
    assert(elapsedMs < 500, `Decision latency ${elapsedMs} ms`);
    runs.push({ label, passed: true, clickToHookMs: elapsedMs });
    await hook("SessionEnd", session);
    console.log(JSON.stringify(runs.at(-1)));
  }
}
async function realClaude(label, action) {
  const file = `${label}.txt`;
  const manifest = JSON.parse(
    await readFile("../plugins/scribe/hooks/hooks.json", "utf8"),
  );
  for (const entries of Object.values(manifest.hooks))
    for (const entry of entries)
      for (const hook of entry.hooks) hook.command = executable;
  const settings = join(root, "settings.json");
  await writeFile(
    settings,
    JSON.stringify({ hooks: manifest.hooks, permissions: { ask: ["Write"] } }),
  );
  const run = childProcess("C:/Users/engmo/.local/bin/claude.exe", [
    "--setting-sources",
    "",
    "--settings",
    settings,
    "--strict-mcp-config",
    "--no-session-persistence",
    "--max-budget-usd",
    "1",
    "--permission-mode",
    "default",
    "--tools",
    "Write",
    "--output-format",
    "json",
    "--system-prompt",
    `Perform this public local test only. Call Write exactly once to create ${file} in the current workspace with content PUBLIC SCRIBE RESPONSE TEST. If denied, do not retry or use other tools. Reply PUBLIC_WRITE_OK if written, otherwise PUBLIC_WRITE_DENIED.`,
    "-p",
    `Create ${file} using Write exactly once.`,
  ]);
  try {
    const card = page.getByRole("article").filter({ hasText: file });
    if (action === "expire") {
      await card.waitFor({ state: "visible", timeout: 60000 });
      console.log(JSON.stringify({ label, waitingForExpiration: true }));
    } else {
      await choose(card, action === "allow" ? "Permitir uma vez" : "Negar");
    }
    const result = await run.finished;
    assert.equal(result.code, 0);
    assert.equal(result.stderr, "");
    const raw = JSON.parse(result.stdout),
      parsed = Array.isArray(raw) ? raw.at(-1) : raw;
    assert.equal(parsed.is_error, false);
    let exists = false;
    try {
      await access(join(workspace, file));
      exists = true;
    } catch {
      /* A denied or expired Write must leave the test file absent. */
    }
    assert.equal(exists, action === "allow");
    assert(
      String(parsed.result).includes(
        action === "allow" ? "PUBLIC_WRITE_OK" : "PUBLIC_WRITE_DENIED",
      ),
    );
    runs.push({
      label,
      passed: true,
      realClaude: true,
      fileExists: exists,
      responseMatched: true,
    });
    console.log(JSON.stringify(runs.at(-1)));
  } finally {
    if (run.child.exitCode === null) run.child.kill();
  }
}
async function realQuestion(delay = 0) {
  const session = randomUUID();
  const settings = join(root, "settings.json");
  const mcp = join(root, "mcp.json");
  await writeFile(
    mcp,
    JSON.stringify({
      mcpServers: {
        scribe: {
          type: "http",
          url: `http://127.0.0.1:${connection.port}/mcp`,
          timeout: 610000,
          headers: { Authorization: `Bearer ${connection.token}` },
        },
      },
    }),
  );
  const run = childProcess("C:/Users/engmo/.local/bin/claude.exe", [
    "--setting-sources",
    "",
    "--settings",
    settings,
    "--session-id",
    session,
    "--strict-mcp-config",
    "--mcp-config",
    mcp,
    "--no-session-persistence",
    "--max-budget-usd",
    "1",
    "--allowedTools",
    "mcp__scribe__scribe_ask",
    "--output-format",
    "json",
    "--system-prompt",
    `Perform this public local test only. Call mcp__scribe__scribe_ask exactly once with session_id ${session}, question PUBLIC_QUESTION, options [PUBLIC_A, PUBLIC_B]. Await its result. Reply only with the chosen answer.`,
    "-p",
    "Ask PUBLIC_QUESTION and return the chosen option.",
  ]);
  try {
    const card = page
      .getByRole("article")
      .filter({ hasText: "PUBLIC_QUESTION" });
    await card.waitFor({ state: "visible", timeout: 60000 });
    if (delay) {
      console.log(
        JSON.stringify({
          label: "real-claude-question",
          waitingForLateAnswer: true,
          delayMs: delay,
        }),
      );
      await new Promise((ok) => setTimeout(ok, delay));
    }
    await choose(card, "PUBLIC_B");
    const result = await run.finished;
    assert.equal(result.code, 0);
    assert.equal(result.stderr, "");
    const raw = JSON.parse(result.stdout),
      parsed = Array.isArray(raw) ? raw.at(-1) : raw;
    assert.equal(parsed.is_error, false);
    assert(String(parsed.result).includes("PUBLIC_B"));
    runs.push({
      label: delay ? "real-claude-late-question" : "real-claude-question",
      passed: true,
      realClaude: true,
      responseMatched: true,
      delayMs: delay,
    });
    console.log(JSON.stringify(runs.at(-1)));
  } finally {
    if (run.child.exitCode === null) run.child.kill();
  }
}
let passed = false;
try {
  await mkdir(workspace, { recursive: true });
  await focus();
  await synthetic();
  await realClaude(`real-allow-${Date.now()}`, "allow");
  await realClaude(`real-deny-${Date.now()}`, "deny");
  await realQuestion();
  if (process.env.SCRIBE_LONG_TESTS === "1") {
    await realClaude(`real-expire-${Date.now()}`, "expire");
    await realQuestion(125000);
  }
  passed = true;
  await page.screenshot({ path: join(root, "native-decisions.png") });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await writeFile(
    join(root, installed ? "installed-result.json" : "result.json"),
    JSON.stringify(
      {
        passed,
        runs,
        automatedUiClicks: true,
        isolatedProfile: !installed,
        installedExecutables: installed,
        filesystemScope: "invoking-process-view",
        externalInstallationVerified: false,
      },
      null,
      2,
    ),
  );
  await browser.close();
}
