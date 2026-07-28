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
import { createServer } from "node:http";
import { readFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const UI_DIR = resolve(__dirname, "..");
const FLOWDECK_DIR = resolve(process.env.FLOWDECK_DIR || resolve(UI_DIR, "..", "FlowDeck"));
const KEEP = process.env.KEEP_SERVERS === "true";

// ── Helper: spawn a process and capture its output ──────────────────────
function spawnProcess(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
      ...opts,
    });
    const stdout = [];
    const stderr = [];

    proc.stdout.on("data", (chunk) => stdout.push(chunk));
    proc.stderr.on("data", (chunk) => stderr.push(chunk));

    proc.on("close", (code) => {
      resolve({
        code,
        stdout: Buffer.concat(stdout).toString(),
        stderr: Buffer.concat(stderr).toString(),
      });
    });
    proc.on("error", reject);

    // Store reference for cleanup
    proc._label = `${cmd} ${args.join(" ")}`;
    PROCESSES.push(proc);
  });
}

const PROCESSES = [];

// ── Signal handling ──────────────────────────────────────────────────────
function cleanup(signal) {
  console.log(`\n[integration] ${signal} received — cleaning up...`);
  for (const proc of PROCESSES) {
    try { proc.kill("SIGTERM"); } catch {}
  }
  // Force exit after 3s
  setTimeout(() => process.exit(1), 3000);
}
process.on("SIGINT", () => cleanup("SIGINT"));
process.on("SIGTERM", () => cleanup("SIGTERM"));

// ── Main ────────────────────────────────────────────────────────────────
async function main() {
  let flowdeckPort;
  let vitePort;

  // 1. Spawn FlowDeck standalone server
  console.log("[integration] Starting FlowDeck standalone server...");
  const flowdeckCwd = FLOWDECK_DIR;

  const flowdeckProc = spawn(
    "bun",
    ["run", "standalone:start"],
    {
      cwd: flowdeckCwd,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  PROCESSES.push(flowdeckProc);

  // Read the first line of stdout for metadata
  const metadataLine = await new Promise((resolvePromise, reject) => {
    let buffer = "";
    const onData = (chunk) => {
      buffer += chunk.toString();
      const nlIndex = buffer.indexOf("\n");
      if (nlIndex !== -1) {
        const line = buffer.slice(0, nlIndex);
        resolvePromise(line);
        // Remove this listener after first line
        flowdeckProc.stdout.removeListener("data", onData);
      }
    };
    const onError = (err) => reject(err);
    flowdeckProc.stdout.on("data", onData);
    flowdeckProc.stderr.on("data", (chunk) => {
      // Meta is on stdout, but log any stderr during startup
    });
    flowdeckProc.on("error", reject);
    // Timeout
    setTimeout(() => reject(new Error("FlowDeck server did not start within 15s")), 15000);
  });

  let flowdeckMeta;
  try {
    flowdeckMeta = JSON.parse(metadataLine);
  } catch {
    throw new Error(`Failed to parse FlowDeck metadata: ${metadataLine}`);
  }

  const baseUrl = flowdeckMeta.baseUrl;
  const serverKey = flowdeckMeta.serverKey;
  const projectKey = flowdeckMeta.projectKey;
  const projectId = flowdeckMeta.projectId;
  console.log(`[integration] FlowDeck server: ${baseUrl}`);
  console.log(`[integration]   serverKey: ${serverKey}`);
  console.log(`[integration]   projectKey: ${projectKey}`);
  console.log(`[integration]   projectId: ${projectId}`);

  // 2. Wait for health endpoint
  console.log("[integration] Waiting for FlowDeck health endpoint...");
  await waitForHealth(baseUrl, 30_000);

  // 3. Start Vite dev server with FlowDeck API URL
  console.log("[integration] Starting Vite dev server...");
  const viteProc = spawn(
    "npx",
    ["vite", "--port", "0"],
    {
      cwd: UI_DIR,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        VITE_HARNESS_API_URL: baseUrl,
        VITE_HARNESS_SERVER_KEY: serverKey,
        VITE_HARNESS_PROJECT_KEY: projectKey,
      },
    },
  );
  PROCESSES.push(viteProc);

  // Parse Vite port from output
  vitePort = await new Promise((resolvePromise, reject) => {
    let buffer = "";
    const timeout = setTimeout(() => reject(new Error("Vite did not start within 20s")), 20000);
    const onData = (chunk) => {
      buffer += chunk.toString();
      // Vite prints something like: "Local:   http://localhost:5173/"
      const match = buffer.match(/Local:\s+http:\/\/localhost:(\d+)/);
      if (match) {
        clearTimeout(timeout);
        resolvePromise(parseInt(match[1], 10));
        viteProc.stdout.removeListener("data", onData);
        viteProc.stderr.removeListener("data", onData);
      }
    };
    viteProc.stdout.on("data", onData);
    viteProc.stderr.on("data", onData);
    viteProc.on("error", reject);
  });
  console.log(`[integration] Vite dev server at http://localhost:${vitePort}`);

  // 4. Run Playwright tests
  console.log("[integration] Running Playwright tests...");
  // We override the Playwright config webServer to use our Vite instance
  const playResult = await spawnProcess("npx", ["playwright", "test", "--config", "playwright.config.ts"], {
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
  if (!KEEP) {
    console.log("[integration] Cleaning up...");
    cleanup("cleanup");
  }

  process.exit(playResult.code ?? 1);
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
