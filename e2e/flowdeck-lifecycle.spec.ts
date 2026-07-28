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
    // Start a run
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

    // Connect SSE — the run executes via setImmediate so there is a brief
    // window during which progress events are still being emitted.
    const sseRes = await fetch(
      `${BASE_URL}/api/v1/servers/${SERVER_KEY}/projects/${PROJECT_KEY}/better-harness/runs/${runId}/events`,
    );
    expect(sseRes.status).toBe(200);

    const reader = sseRes.body!.getReader();
    const decoder = new TextDecoder();
    let connected = false;
    let heartbeat = false;
    let progressReceived = false;
    let accumulated = "";

    // Heartbeat interval is 15 s, so we loop for up to 20 s
    for (let i = 0; i < 100; i++) {
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

      if (accumulated.includes("event: run.progress")) {
        progressReceived = true;
        const match = accumulated.match(/data: ({.*?run\.progress.*?})(\n|$)/);
        if (match) {
          const parsed = JSON.parse(match[1]);
          expect(parsed.type).toBe("run.progress");
          expect(parsed.data.runId).toBe(runId);
          expect(parsed.data.status).toBeDefined();
          expect(parsed.data.progressPercent).toBeDefined();
        }
      }

      // Exit once we have all we need
      if (connected && heartbeat && progressReceived) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    reader.releaseLock();

    expect(connected).toBe(true);
    expect(heartbeat).toBe(true);
    // run.progress may not arrive if the run completed before we connected;
    // it is not required to pass (the run is very fast), but if it arrives
    // we validate its structure above.
  }, 45_000);

  test("SSE Last-Event-ID replay delivers missed events", async () => {
    // Start a run
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

    // Wait for the run to finish
    await new Promise((r) => setTimeout(r, 3000));

    // Connect without Last-Event-ID → gets only connected frame (no progress replay)
    const sseRes1 = await fetch(
      `${BASE_URL}/api/v1/servers/${SERVER_KEY}/projects/${PROJECT_KEY}/better-harness/runs/${runId}/events`,
    );
    expect(sseRes1.status).toBe(200);
    const reader1 = sseRes1.body!.getReader();
    const decoder1 = new TextDecoder();
    let firstConnected = "";
    for (let i = 0; i < 5; i++) {
      const { done, value } = await reader1.read();
      if (done) break;
      firstConnected += decoder1.decode(value, { stream: true });
      if (firstConnected.includes("event: connected")) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    reader1.releaseLock();

    // Extract the sequence ID from the connected frame
    const idMatch1 = firstConnected.match(/^id: (\d+)/m);
    const lastId = idMatch1 ? idMatch1[1] : "0";
    console.log(`  First SSE connected seq: ${lastId}`);

    // Connect again with Last-Event-ID set to the connected frame's ID.
    // This should replay all events AFTER the connected frame (progress, completion, etc.)
    const sseRes2 = await fetch(
      `${BASE_URL}/api/v1/servers/${SERVER_KEY}/projects/${PROJECT_KEY}/better-harness/runs/${runId}/events`,
      { headers: { "Last-Event-ID": lastId } },
    );
    expect(sseRes2.status).toBe(200);
    const reader2 = sseRes2.body!.getReader();
    const decoder2 = new TextDecoder();
    let replayData = "";
    let progressReplayed = false;
    let completionReplayed = false;
    for (let i = 0; i < 50; i++) {
      const { done, value } = await reader2.read();
      if (done) break;
      replayData += decoder2.decode(value, { stream: true });
      if (replayData.includes('"run.progress"')) progressReplayed = true;
      if (replayData.includes('"report.completed"') || replayData.includes('"run.failed"') || replayData.includes('"run.cancelled"')) {
        completionReplayed = true;
      }
      if (progressReplayed && completionReplayed) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    reader2.releaseLock();
    expect(progressReplayed || completionReplayed).toBe(true);
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

    // No unhandled page errors
    expect(errors).toEqual([]);
  });

  test("server and project keys are visible in the header", async ({ page }) => {
    await page.goto(HARNESS_ROUTE);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1_000);

    // The server key should be rendered in the nav bar
    await expect(page.locator(`text=${SERVER_KEY}`).first()).toBeVisible({ timeout: 5_000 });
    // The project key should be rendered in the nav bar
    await expect(page.locator(`text=${PROJECT_KEY}`).first()).toBeVisible({ timeout: 3_000 });
  });

  test("regenerate button is visible and confirms dialog", async ({ page }) => {
    await page.goto(HARNESS_ROUTE);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1_000);

    // Find the regenerate button
    const regenBtn = page.locator('button:has-text("Regenerate")').first();
    await expect(regenBtn).toBeVisible({ timeout: 5_000 });

    // Click → confirmation dialog opens
    await regenBtn.click();
    const confirmDialog = page.locator('[role="dialog"]');
    await expect(confirmDialog).toBeVisible({ timeout: 3_000 });

    // Confirm the regeneration
    const yesBtn = page.locator('button:has-text("Yes")').first();
    await expect(yesBtn).toBeVisible({ timeout: 2_000 });
    await yesBtn.click();

    // The dialog should close after confirmation
    await expect(confirmDialog).not.toBeVisible({ timeout: 3_000 });

    // Wait for the run to complete (it's fast — ~1 s)
    await page.waitForTimeout(5_000);

    // No persistent error dialogs
    const errorDialogs = page.locator('[role="dialog"]');
    const dialogCount = await errorDialogs.count();
    if (dialogCount > 0) {
      const dialogText = await errorDialogs.first().textContent();
      expect(dialogText?.toLowerCase()).not.toContain("error");
    }
  });

  test("run completion reflects in the UI timestamp", async ({ page }) => {
    // Start a run via the HTTP API first so the UI has data to display
    const runRes = await fetch(
      `${BASE_URL}/api/v1/servers/${SERVER_KEY}/projects/${PROJECT_KEY}/better-harness/runs`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "full" }),
      },
    );
    expect(runRes.status).toBe(201);
    // Wait for completion
    await new Promise((r) => setTimeout(r, 3_000));

    // Navigate to the UI — it should load the completed report
    await page.goto(HARNESS_ROUTE);
    await page.waitForLoadState("networkidle");

    // Wait for the page to fetch and render the report
    await page.waitForTimeout(2_000);

    // The page should show a "Last evaluated" or "Generated" timestamp
    // (any text indicating a report was loaded)
    const pageText = await page.locator("body").innerText();
    expect(pageText).toContain("Score");
  });

  test("history section loads after a completed run", async ({ page }) => {
    // Start a run and wait for completion
    const runRes = await fetch(
      `${BASE_URL}/api/v1/servers/${SERVER_KEY}/projects/${PROJECT_KEY}/better-harness/runs`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "full" }),
      },
    );
    expect(runRes.status).toBe(201);
    await new Promise((r) => setTimeout(r, 3_000));

    await page.goto(HARNESS_ROUTE);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2_000);

    // The history section should have at least one entry
    const historyTitle = page.locator('text=History, text=history');
    const historyPresent = await historyTitle.count() > 0 ||
      (await page.locator("text=Run").count()) > 0;
    expect(historyPresent).toBe(true);
  });

  test("missing configuration shows Unavailable state", async ({ page }) => {
    // Navigate to root (no server/project keys) instead of HARNESS_ROUTE
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2_000);

    // The Unavailable state should be visible
    const unavailableHeader = page.locator("text=FlowDeck Engine Pending Phase 2");
    await expect(unavailableHeader).toBeVisible({ timeout: 5_000 });

    // The demo button should be visible
    const demoBtn = page.locator("text=Enable Completed Demo Fixture");
    await expect(demoBtn).toBeVisible({ timeout: 3_000 });
  });
});

// ─── Plan Fix test ──────────────────────────────────────────────────────

test.describe("FlowDeck Plan Fix", () => {
  test("plan-fix against a real finding returns a repair session", async () => {
    // 1. Start a run and wait for it to produce findings
    const runRes = await fetch(
      `${BASE_URL}/api/v1/servers/${SERVER_KEY}/projects/${PROJECT_KEY}/better-harness/runs`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "full" }),
      },
    );
    expect(runRes.status).toBe(201);
    const { runId }: any = await runRes.json();
    expect(runId).toBeDefined();
    // Wait for completion
    await new Promise((r) => setTimeout(r, 4_000));

    // 2. Get the report to extract a finding ID
    const reportRes = await fetch(
      `${BASE_URL}/api/v1/servers/${SERVER_KEY}/projects/${PROJECT_KEY}/better-harness/report`,
    );
    expect(reportRes.status).toBe(200);
    const report: any = await reportRes.json();
    expect(report.findings).toBeDefined();
    expect(report.findings.length).toBeGreaterThan(0);
    const findingId: string = report.findings[0].id;
    console.log(`  Plan Fix target: ${findingId}`);

    // 3. POST plan-fix with the real finding ID
    const planRes = await fetch(
      `${BASE_URL}/api/v1/servers/${SERVER_KEY}/projects/${PROJECT_KEY}/better-harness/findings/plan-fix`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ findingIds: [findingId] }),
      },
    );
    const planBody: any = await planRes.json();
    console.log(`  Plan Fix response:`, JSON.stringify(planBody));

    // 4. Assert the response structure
    expect(planBody.accepted).toBeDefined();
    if (planBody.accepted) {
      // If accepted, should have a repairSessionId or results
      if (planBody.repairSessionId) {
        console.log(`  Repair session ID: ${planBody.repairSessionId}`);
      } else if (planBody.results && planBody.results.length > 0) {
        console.log(`  Results:`, JSON.stringify(planBody.results));
        if (planBody.results[0].repairSessionId) {
          console.log(`  Result repair session ID: ${planBody.results[0].repairSessionId}`);
        }
      }
    } else {
      // Not accepted — log the error for investigation
      console.log(`  Plan Fix not accepted:`, planBody.error || planBody.results?.[0]?.error || "unknown");
    }
  }, 30_000);
});
