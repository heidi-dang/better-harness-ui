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
import { spawn, execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, rmSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const UI_DIR = resolve(__dirname, "..");
const FLOWDECK_DIR = resolve(process.env.FLOWDECK_DIR || resolve(UI_DIR, "..", "FlowDeck"));
const KEEP = process.env.KEEP_SERVERS === "true";
const SHELL = process.platform === "win32";

// ── Tracked processes and temp dirs for cleanup ─────────────────────────
const PROCESSES = [];
let tempDirs = { projectDir: null, stateDir: null, eventLogDir: null };

// ── Graceful-then-forced process termination ────────────────────────────
/**
 * Force-kill a process and its entire tree.  On Unix we send SIGTERM then
 * SIGKILL; on Windows taskkill /F /T is the only reliable mechanism.
 * The FlowDeck server's shutdown handler (which cleans up temp dirs) is
 * unlikely to run during a force kill, so the caller must also verify and
 * remove temp directories directly.
 */
function killProcessTree(proc) {
  if (proc.exitCode !== null) return;
  if (process.platform === "win32") {
    try { execSync(`taskkill /F /T /PID ${proc.pid}`, { stdio: "ignore" }); } catch {}
  } else {
    try { proc.kill("SIGTERM"); } catch {}
    // Give the process a brief window to handle SIGTERM before SIGKILL
    const deadline = Date.now() + 3_000;
    while (Date.now() < deadline && proc.exitCode === null) {
      // busy-wait — simplest cross-platform approach
    }
    if (proc.exitCode === null) {
      try { proc.kill("SIGKILL"); } catch {}
    }
  }
}

function waitForExit(proc, timeoutMs) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ code: null, timedOut: true }), timeoutMs);
    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, timedOut: false });
    });
    proc.on("error", () => {
      clearTimeout(timer);
      resolve({ code: null, timedOut: false });
    });
  });
}

async function shutdown() {
  console.log("[integration] Shutting down child processes...");

  // Force-kill every child immediately.  On Windows, taskkill /F /T does not
  // let the bun process run its signal-handler cleanup, so we also remove the
  // state directory ourselves.
  for (const proc of PROCESSES) killProcessTree(proc);

  // Brief pause for kills to take effect
  await new Promise((r) => setTimeout(r, 1_500));

  // Verify and remove the server's temporary directories
  let clean = true;
  for (const [name, dirPath] of Object.entries(tempDirs)) {
    if (!dirPath) continue;
    if (existsSync(dirPath)) {
      console.log(`[integration]   Cleaning up ${name} ${dirPath}`);
      try { rmSync(dirPath, { recursive: true, force: true }); } catch {}
      if (existsSync(dirPath)) {
        console.log(`[integration]   ERROR: ${name} ${dirPath} could not be removed`);
        clean = false;
      } else {
        console.log(`[integration]   ${name} removed`);
      }
    } else {
      console.log(`[integration]   ${name} already removed`);
    }
  }

  return clean;
}

function cleanupSync() {
  console.log("\n[integration] Emergency force cleanup...");
  for (const proc of PROCESSES) killProcessTree(proc);
}

process.on("SIGINT", async () => { await shutdown().catch(() => {}); process.exit(1); });
process.on("SIGTERM", async () => { await shutdown().catch(() => {}); process.exit(1); });

// ── Main ────────────────────────────────────────────────────────────────
async function main() {
  let exitCode = 1;

  try {
    // 1. Spawn FlowDeck standalone server
    console.log("[integration] Starting FlowDeck standalone server...");

    // On Windows we spawn via cmd /c for the bun.cmd shim.
    const flowdeckProc = spawn(
      SHELL ? "cmd" : "bun",
      SHELL ? ["/c", "bun", "run", "standalone:start"] : ["run", "standalone:start"],
      { cwd: FLOWDECK_DIR, stdio: ["ignore", "pipe", "pipe"] },
    );
    PROCESSES.push(flowdeckProc);

    const metadataLine = await readFirstLine(flowdeckProc.stdout, 15_000);
    let flowdeckMeta;
    try {
      flowdeckMeta = JSON.parse(metadataLine);
    } catch {
      throw new Error(`Failed to parse FlowDeck metadata: ${metadataLine}`);
    }

    const baseUrl    = flowdeckMeta.baseUrl;
    const serverKey  = flowdeckMeta.serverKey;
    const projectKey = flowdeckMeta.projectKey;
    tempDirs = {
      projectDir: flowdeckMeta.projectDir || null,
      stateDir:   flowdeckMeta.stateDir || null,
      eventLogDir: flowdeckMeta.eventLogDir || null,
    };
    console.log(`[integration] FlowDeck server: ${baseUrl}`);
    console.log(`[integration]   key: ${serverKey} / ${projectKey}`);
    for (const [name, dir] of Object.entries(tempDirs)) {
      if (dir) console.log(`[integration]   ${name}: ${dir}`);
    }

    // 2. Wait for health endpoint
    console.log("[integration] Waiting for health...");
    await waitForHealth(baseUrl, 30_000);

    // 3. Start Vite with FlowDeck API URL
    console.log("[integration] Starting Vite...");
    const viteProc = spawn(
      SHELL ? "cmd" : "npx",
      SHELL ? ["/c", "npx.cmd", "vite", "--port", "0"] : ["vite", "--port", "0"],
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

    const vitePort = await parseVitePort(viteProc, 30_000);
    console.log(`[integration] Vite at http://localhost:${vitePort}`);

    // 4. Run Playwright tests
    console.log("[integration] Running Playwright tests...");
    const playEnv = {
      ...process.env,
      FLOWDECK_BASE_URL: baseUrl,
      SERVER_KEY: serverKey,
      PROJECT_KEY: projectKey,
      PLAYWRIGHT_BASE_URL: `http://localhost:${vitePort}`,
    };

    const playResult = await spawnProcess(
      SHELL ? "cmd" : "npx",
      SHELL
        ? ["/c", "npx.cmd", "playwright", "test", "--config", "playwright.integration.config.ts"]
        : ["playwright", "test", "--config", "playwright.integration.config.ts"],
      { cwd: UI_DIR, env: playEnv },
    );

    console.log(playResult.stdout);
    if (playResult.stderr) console.error(playResult.stderr);
    exitCode = playResult.code ?? 1;
  } catch (err) {
    console.error("[integration] Fatal:", err);
    exitCode = 1;
  } finally {
    if (!KEEP) {
      const clean = await shutdown();
      if (!clean) {
        console.log("[integration] WARNING: cleanup incomplete — state dir may still exist");
        exitCode = 1;
      }
    }
    process.exit(exitCode);
  }
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
    const proc = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], ...opts });
    const stdout = [];
    const stderr = [];
    proc.stdout.on("data", (c) => stdout.push(c));
    proc.stderr.on("data", (c) => stderr.push(c));
    proc.on("close", (code) => {
      resolve({ code, stdout: Buffer.concat(stdout).toString(), stderr: Buffer.concat(stderr).toString() });
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

main();
