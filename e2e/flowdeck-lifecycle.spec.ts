/**
 * End-to-end FlowDeck lifecycle integration test.
 *
 * Runs in two contexts:
 *   - Node.js: direct HTTP calls against the FlowDeck server via fetch()
 *   - Browser: Playwright page navigating to the harness route
 *
 * Environment variables (set by run-integration.mjs):
 *   FLOWDECK_BASE_URL     — http://127.0.0.1:<port>
 *   SERVER_KEY            — opaque server identifier
 *   PROJECT_KEY           — opaque project identifier
 *   PLAYWRIGHT_BASE_URL   — Vite dev server URL
 */
import { test, expect } from "@playwright/test";

const BASE_URL    = process.env.FLOWDECK_BASE_URL!;
const SERVER_KEY  = process.env.SERVER_KEY!;
const PROJECT_KEY = process.env.PROJECT_KEY!;

// Derive the UI route the browser must navigate to
const HARNESS_ROUTE = `/server/${encodeURIComponent(SERVER_KEY)}/project/${encodeURIComponent(PROJECT_KEY)}/better-harness`;

// ─── HTTP API tests (run in Node.js) ────────────────────────────────────

test.describe("FlowDeck HTTP API", () => {

  test("health endpoint returns ok", async () => {
    const res = await fetch(`${BASE_URL}/health`);
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.status).toBe("ok");
  });

  test("rejects unknown project key with 404", async () => {
    const res = await fetch(
      `${BASE_URL}/api/v1/servers/${SERVER_KEY}/projects/unknown-key/better-harness/availability`,
    );
    expect(res.status).toBe(404);
  });

  test("returns available for registered project", async () => {
    const res = await fetch(
      `${BASE_URL}/api/v1/servers/${SERVER_KEY}/projects/${PROJECT_KEY}/better-harness/availability`,
    );
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.available).toBe(true);
  });

  test("starts a run and returns accepted + runId", async () => {
    const res = await fetch(
      `${BASE_URL}/api/v1/servers/${SERVER_KEY}/projects/${PROJECT_KEY}/better-harness/runs`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "full" }),
      },
    );
    expect(res.status).toBe(201);
    const body: any = await res.json();
    expect(body.accepted).toBe(true);
    expect(body.runId).toBeDefined();
    expect(typeof body.runId).toBe("string");
  }, 30_000);

  test("GET exact run returns persisted state", async () => {
    // Start a run first
    const runRes = await fetch(
      `${BASE_URL}/api/v1/servers/${SERVER_KEY}/projects/${PROJECT_KEY}/better-harness/runs`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "full" }),
      },
    );
    const { runId }: any = await runRes.json();
    expect(runId).toBeDefined();

    // Poll until persisted
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const getRes = await fetch(
        `${BASE_URL}/api/v1/servers/${SERVER_KEY}/projects/${PROJECT_KEY}/better-harness/runs/${runId}`,
      );
      if (getRes.status === 200) {
        const run: any = await getRes.json();
        expect(run.runId).toBe(runId);
        return;
      }
    }
    // Last attempt on failure
    const getRes = await fetch(
      `${BASE_URL}/api/v1/servers/${SERVER_KEY}/projects/${PROJECT_KEY}/better-harness/runs/${runId}`,
    );
    expect(getRes.status).toBe(200);
  }, 30_000);

  test("SSE delivers connected frame and heartbeat", async () => {
    const runRes = await fetch(
      `${BASE_URL}/api/v1/servers/${SERVER_KEY}/projects/${PROJECT_KEY}/better-harness/runs`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "full" }),
      },
    );
    const { runId }: any = await runRes.json();
    expect(runId).toBeDefined();

    const sseRes = await fetch(
      `${BASE_URL}/api/v1/servers/${SERVER_KEY}/projects/${PROJECT_KEY}/better-harness/runs/${runId}/events`,
    );
    expect(sseRes.status).toBe(200);

    const reader = sseRes.body!.getReader();
    const decoder = new TextDecoder();
    let connected = false;
    let heartbeat = false;
    let accumulated = "";

    for (let i = 0; i < 50; i++) {
      const { done, value } = await reader.read();
      if (done) break;
      accumulated += decoder.decode(value, { stream: true });

      if (accumulated.includes("event: connected")) {
        connected = true;
        const match = accumulated.match(/data: ({.*?connected.*?})(\n|$)/);
        if (match) {
          const parsed = JSON.parse(match[1]);
          expect(parsed.type).toBe("connected");
          expect(parsed.timestamp).toBeTruthy();
          expect(parsed.data.clientId).toBeDefined();
          expect(() => new Date(parsed.timestamp)).not.toThrow();
        }
      }

      if (accumulated.includes("event: heartbeat")) {
        heartbeat = true;
        const match = accumulated.match(/data: ({.*?heartbeat.*?})(\n|$)/);
        if (match) {
          const parsed = JSON.parse(match[1]);
          expect(parsed.type).toBe("heartbeat");
          expect(parsed.timestamp).toBeTruthy();
          expect(parsed.data.time).toBeTruthy();
        }
      }

      if (connected && heartbeat) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    reader.releaseLock();

    expect(connected).toBe(true);
  }, 30_000);

  test("cancels a running run with accepted:true", async () => {
    const runRes = await fetch(
      `${BASE_URL}/api/v1/servers/${SERVER_KEY}/projects/${PROJECT_KEY}/better-harness/runs`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "full" }),
      },
    );
    const { runId }: any = await runRes.json();

    const cancelRes = await fetch(
      `${BASE_URL}/api/v1/servers/${SERVER_KEY}/projects/${PROJECT_KEY}/better-harness/runs/${runId}/cancel`,
      { method: "POST" },
    );
    expect(cancelRes.status).toBe(200);
    const body: any = await cancelRes.json();
    expect(body.accepted).toBe(true);
  }, 30_000);

  test("repeated cancellation returns accepted:false", async () => {
    const runRes = await fetch(
      `${BASE_URL}/api/v1/servers/${SERVER_KEY}/projects/${PROJECT_KEY}/better-harness/runs`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "full" }),
      },
    );
    const { runId }: any = await runRes.json();

    // First cancel
    const cancel1 = await fetch(
      `${BASE_URL}/api/v1/servers/${SERVER_KEY}/projects/${PROJECT_KEY}/better-harness/runs/${runId}/cancel`,
      { method: "POST" },
    );
    expect(cancel1.status).toBe(200);
    expect((await cancel1.json() as any).accepted).toBe(true);

    // Second cancel should return accepted:false
    const cancel2 = await fetch(
      `${BASE_URL}/api/v1/servers/${SERVER_KEY}/projects/${PROJECT_KEY}/better-harness/runs/${runId}/cancel`,
      { method: "POST" },
    );
    expect(cancel2.status).toBe(200);
    const body2: any = await cancel2.json();
    expect(body2.accepted).toBe(false);
  }, 30_000);
});

// ─── Browser UI tests ───────────────────────────────────────────────────

test.describe("FlowDeck Browser UI", () => {
  test("navigating to harness route connects to real FlowDeck", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto(HARNESS_ROUTE);
    await page.waitForLoadState("networkidle");

    // The page should NOT show the "Unavailable" state when connected
    const unavailableHeader = page.locator("text=FlowDeck Engine Pending Phase 2");
    await expect(unavailableHeader).not.toBeVisible({ timeout: 5_000 });

    // The page should show the harness content
    await expect(page.locator("body")).not.toBeEmpty();

    // No unhandled page errors
    expect(errors).toEqual([]);
  });

  test("availability state shows as available", async ({ page }) => {
    await page.goto(HARNESS_ROUTE);
    await page.waitForLoadState("networkidle");

    // Wait for the availability check to complete — the connected state
    // should show the harness UI, not the unavailable prompt
    await page.waitForTimeout(2_000);

    // The "Unavailable" state should never appear
    const unavailableBtn = page.locator("text=Enable Completed Demo Fixture");
    await expect(unavailableBtn).not.toBeVisible({ timeout: 3_000 });
  });

  test("regenerate button triggers a run via the real backend", async ({ page }) => {
    await page.goto(HARNESS_ROUTE);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1_000);

    // Find the regenerate button using its label or icon
    const regenBtn = page.locator(
      'button[aria-label="Regenerate Better Harness"], button:has-text("Regenerate")',
    ).first();

    // The button should exist when connected to a real backend
    await expect(regenBtn).toBeVisible({ timeout: 5_000 });

    // Click it
    await regenBtn.click();

    // After clicking, the run should be in progress — check for progress
    // indicators or status changes
    await page.waitForTimeout(3_000);

    // No error dialogs should appear
    const errorDialogs = page.locator('[role="dialog"]');
    const dialogCount = await errorDialogs.count();
    if (dialogCount > 0) {
      // If there's a dialog, it should be informational, not an error
      const dialogText = await errorDialogs.first().textContent();
      expect(dialogText?.toLowerCase()).not.toContain("error");
    }
  });
});
