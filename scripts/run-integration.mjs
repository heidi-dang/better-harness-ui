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

// ── Tracked processes for cleanup ───────────────────────────────────────
const PROCESSES = [];
let flowdeckTempDir = null; // set after FlowDeck start, verified on cleanup

function waitForExit(proc, timeoutMs) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve({ code: null, timedOut: true });
    }, timeoutMs);
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

/**
 * Send SIGTERM to all tracked child processes and await their exit.
 * Returns a summary of which processes exited cleanly.
 */
async function shutdown() {
  console.log("[integration] Shutting down child processes...");
  const signals = PROCESSES.map(async (proc, i) => {
    const label = `process[${i}]`;

    // If the process has already exited (e.g. Playwright finished), skip
    if (proc.exitCode !== null) {
      return { label, exited: true, alreadyExited: true, code: proc.exitCode };
    }

    killProcessTree(proc);
    const result = await waitForExit(proc, 5_000);
    if (result.timedOut) {
      killProcessTree(proc); // Force kill
      return { label, exited: false, timedOut: true };
    }
    return { label, exited: true, code: result.code };
  });
  const results = await Promise.all(signals);

  let allExited = true;
  for (const r of results) {
    if (!r.exited || r.timedOut) {
      console.log(`[integration]   ${r.label} did not exit cleanly`);
      allExited = false;
    }
  }
  if (allExited) {
    console.log("[integration]   All child processes exited cleanly");
  }

  // Verify temp directories were removed
  if (flowdeckTempDir) {
    const stillExists = existsSync(flowdeckTempDir);
    if (stillExists) {
      console.log(`[integration]   WARNING: temp dir ${flowdeckTempDir} still exists`);
      try { rmSync(flowdeckTempDir, { recursive: true, force: true }); } catch {}
    } else {
      console.log(`[integration]   Temp dir ${flowdeckTempDir} was removed`);
    }
  }

  return allExited;
}

function killProcessTree(proc) {
  // If the process already exited, skip
  if (proc.exitCode !== null) return;
  if (process.platform === "win32") {
    // On Windows, kill the entire process tree via TaskKill.
    // This handles shell:true cases where the actual child survives.
    try { execSync(`taskkill /F /T /PID ${proc.pid}`, { stdio: "ignore" }); } catch {}
  } else {
    try { proc.kill("SIGKILL"); } catch {}
  }
}

function cleanupSync() {
  console.log(`\n[integration] Force cleanup...`);
  for (const proc of PROCESSES) {
    killProcessTree(proc);
  }
}

process.on("SIGINT", async () => {
  await shutdown().catch(() => {});
  process.exit(1);
});
process.on("SIGTERM", async () => {
  await shutdown().catch(() => {});
  process.exit(1);
});

// ── Main ────────────────────────────────────────────────────────────────
async function main() {
  let exitCode = 1;

  try {
    // 1. Spawn FlowDeck standalone server
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

    // Pass FlowDeck connection info to the Playwright process via env vars
    const playEnv = {
      ...process.env,
      FLOWDECK_BASE_URL: baseUrl,
      SERVER_KEY: serverKey,
      PROJECT_KEY: projectKey,
      PLAYWRIGHT_BASE_URL: `http://localhost:${vitePort}`,
    };

    const playResult = await spawnProcess(
      "npx playwright test --config playwright.integration.config.ts",
      [],
      { cwd: UI_DIR, env: playEnv },
    );

    console.log(playResult.stdout);
    if (playResult.stderr) {
      console.error(playResult.stderr);
    }

    exitCode = playResult.code ?? 1;
  } catch (err) {
    console.error("[integration] Fatal:", err);
    exitCode = 1;
  } finally {
    // 5. Deterministic cleanup — await child exits, verify temp dirs
    if (!KEEP) {
      const allExited = await shutdown();
      if (!allExited) {
        console.log("[integration] WARNING: not all children exited — forcing exit");
        cleanupSync();
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

main();
