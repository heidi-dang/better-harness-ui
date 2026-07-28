#!/usr/bin/env node
/**
 * Cross-repo integration test runner.
 *
 * Spawns the FlowDeck standalone server (assumed at FLOWDECK_DIR or next to UI),
 * reads metadata from its first stdout line, then starts Vite with
 * VITE_HARNESS_API_URL set, runs Playwright tests, and cleans up.
 *
 * Usage:
 *   node scripts/run-integration.mjs
 *
 * Env:
 *   FLOWDECK_DIR  – path to FlowDeck repo (default: ../FlowDeck)
 *   KEEP_SERVERS  – set to "true" to leave servers running (debug)
 */
import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const UI_DIR = resolve(__dirname, "..");
const FLOWDECK_DIR = resolve(process.env.FLOWDECK_DIR || resolve(UI_DIR, "..", "FlowDeck"));
const KEEP = process.env.KEEP_SERVERS === "true";
const SHELL = process.platform === "win32"; // Windows needs shell for .cmd wrappers

// ── Tracked processes for cleanup ───────────────────────────────────────
const PROCESSES = [];

function cleanup(signal) {
  console.log(`\n[integration] ${signal} — cleaning up...`);
  for (const proc of PROCESSES) {
    try { proc.kill("SIGTERM"); } catch {}
  }
  setTimeout(() => process.exit(1), 3000);
}
process.on("SIGINT", () => cleanup("SIGINT"));
process.on("SIGTERM", () => cleanup("SIGTERM"));

// ── Main ────────────────────────────────────────────────────────────────
async function main() {
  // 1. Spawn FlowDeck standalone server (prints JSON metadata on first line)
  console.log("[integration] Starting FlowDeck standalone server...");
  const flowdeckProc = spawn(
    "bun run standalone:start",
    [],
    { cwd: FLOWDECK_DIR, stdio: ["ignore", "pipe", "pipe"], shell: SHELL },
  );
  PROCESSES.push(flowdeckProc);

  const metadataLine = await readFirstLine(flowdeckProc.stdout, 15_000);
  let flowdeckMeta;
  try {
    flowdeckMeta = JSON.parse(metadataLine);
  } catch {
    throw new Error(`Failed to parse FlowDeck metadata: ${metadataLine}`);
  }

  const baseUrl = flowdeckMeta.baseUrl;
  const serverKey = flowdeckMeta.serverKey;
  const projectKey = flowdeckMeta.projectKey;
  console.log(`[integration] FlowDeck server: ${baseUrl}`);
  console.log(`[integration]   key: ${serverKey} / ${projectKey}`);

  // 2. Wait for health endpoint
  console.log("[integration] Waiting for health...");
  await waitForHealth(baseUrl, 30_000);

  // 3. Start Vite with FlowDeck API URL
  console.log("[integration] Starting Vite...");
  const viteProc = spawn(
    "npx vite --port 0",
    [],
    {
      cwd: UI_DIR,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        VITE_HARNESS_API_URL: baseUrl,
        VITE_HARNESS_SERVER_KEY: serverKey,
        VITE_HARNESS_PROJECT_KEY: projectKey,
      },
      shell: SHELL,
    },
  );
  PROCESSES.push(viteProc);

  const vitePort = await parseVitePort(viteProc, 30_000);
  console.log(`[integration] Vite at http://localhost:${vitePort}`);

  // 4. Run Playwright tests
  console.log("[integration] Running Playwright tests...");
  const playArgs = [
    "npx playwright test --config playwright.integration.config.ts",
  ];
  // spawnProcess uses shell too
  const playResult = await spawnProcess(playArgs[0], [], {
    cwd: UI_DIR,
    env: {
      ...process.env,
      VITE_HARNESS_API_URL: baseUrl,
      VITE_HARNESS_SERVER_KEY: serverKey,
      VITE_HARNESS_PROJECT_KEY: projectKey,
      PLAYWRIGHT_BASE_URL: `http://localhost:${vitePort}`,
    },
  });

  console.log(playResult.stdout);
  if (playResult.stderr) {
    console.error(playResult.stderr);
  }

  // 5. Cleanup
  if (!KEEP) cleanup("cleanup");
  process.exit(playResult.code ?? 1);
}

// ── Helpers ─────────────────────────────────────────────────────────────

function readFirstLine(stream, timeoutMs) {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const timeout = setTimeout(() => reject(new Error("Timed out reading first line")), timeoutMs);
    const onData = (chunk) => {
      buffer += chunk.toString();
      const nl = buffer.indexOf("\n");
      if (nl !== -1) {
        clearTimeout(timeout);
        stream.removeListener("data", onData);
        resolve(buffer.slice(0, nl).trim());
      }
    };
    stream.on("data", onData);
    stream.on("error", (err) => { clearTimeout(timeout); reject(err); });
  });
}

function stripAnsi(str) {
  // Remove ANSI escape sequences: ESC [ <params> m
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

function parseVitePort(viteProc, timeoutMs) {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const timeout = setTimeout(() => {
      reject(new Error(`Vite did not start within ${timeoutMs}ms. Output so far:\n${buffer}`));
    }, timeoutMs);
    const onData = (chunk) => {
      buffer += chunk.toString();
      const clean = stripAnsi(buffer);
      // Vite prints "Local:   http://localhost:PORT/"
      const m = clean.match(/Local:\s+http:\/\/localhost:(\d+)/);
      if (m) {
        clearTimeout(timeout);
        viteProc.stdout.removeListener("data", onData);
        viteProc.stderr.removeListener("data", onData);
        resolve(parseInt(m[1], 10));
      }
    };
    viteProc.stdout.on("data", onData);
    viteProc.stderr.on("data", onData);
    viteProc.on("error", (err) => { clearTimeout(timeout); reject(err); });
  });
}

function spawnProcess(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: SHELL,
      ...opts,
    });
    const stdout = [];
    const stderr = [];
    proc.stdout.on("data", (c) => stdout.push(c));
    proc.stderr.on("data", (c) => stderr.push(c));
    proc.on("close", (code) => {
      resolve({
        code,
        stdout: Buffer.concat(stdout).toString(),
        stderr: Buffer.concat(stderr).toString(),
      });
    });
    proc.on("error", reject);
    PROCESSES.push(proc);
  });
}

function waitForHealth(baseUrl, timeoutMs) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = async () => {
      try {
        const res = await fetch(`${baseUrl}/health`);
        if (res.ok) return resolve();
      } catch {}
      if (Date.now() - start > timeoutMs) {
        return reject(new Error(`Health check timed out after ${timeoutMs}ms`));
      }
      setTimeout(check, 500);
    };
    check();
  });
}

main().catch((err) => {
  console.error("[integration] Fatal:", err);
  cleanup("error");
  process.exit(1);
});
