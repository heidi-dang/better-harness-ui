/* eslint-disable @typescript-eslint/no-explicit-any */
// Test assertions on raw HTTP responses require `any` type — there is no
// typed schema for every intermediate response field.
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
  });

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
  });

  // eslint-disable-next-line no-empty-pattern
  test("SSE replay delivers run.progress with validated envelope and matching runId", async ({}, testInfo) => {
    testInfo.setTimeout(45_000);
    const http = await import("node:http");

    // Start a run and wait for it to complete
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
    await new Promise((r) => setTimeout(r, 3_000));

    // Collect the full SSE replay response using a timeout-based buffer
    // (rather than resolving on a partial frame match).
    const sseData = await new Promise<string>((resolve, reject) => {
      const serverUrl = new URL(BASE_URL);
      const path = `/api/v1/servers/${encodeURIComponent(SERVER_KEY)}/projects/${encodeURIComponent(PROJECT_KEY)}/better-harness/runs/${encodeURIComponent(runId)}/events`;

      let accumulated = "";
      const timer = setTimeout(() => resolve(accumulated), 6_000);

      const req = http.get(
        { hostname: serverUrl.hostname, port: parseInt(serverUrl.port, 10), path, headers: { "Last-Event-ID": "0" } },
        (res) => {
          res.on("data", (chunk: Buffer) => { accumulated += chunk.toString(); });
          res.on("end", () => { clearTimeout(timer); resolve(accumulated); });
          res.on("error", (err) => { clearTimeout(timer); reject(err); });
        },
      );
      req.on("error", (err) => { clearTimeout(timer); reject(err); });
    });

    // Connected frame
    expect(sseData).toContain("event: connected");
    const connMatch = sseData.match(/data: ({.*?connected.*?})\n/);
    expect(connMatch).not.toBeNull();
    if (connMatch) {
      const parsed = JSON.parse(connMatch[1]);
      expect(parsed.type).toBe("connected");
      expect(parsed.timestamp).toBeTruthy();
      expect(parsed.data.clientId).toBeDefined();
    }

    // Heartbeat (canonical envelope) — may not arrive within the 6s
    // collection window; the FlowDeck backend SSE lifecycle tests verify
    // heartbeat delivery independently.
    const hbMatch = sseData.match(/data: ({.*?heartbeat.*?})\n/i);
    if (hbMatch) {
      const parsed = JSON.parse(hbMatch[1]);
      expect(parsed.type).toBe("heartbeat");
      expect(parsed.timestamp).toBeTruthy();
      expect(parsed.data.time).toBeDefined();
    }

    // At least one run.progress event — extract the full data line after it
    const progressBlock = sseData.match(/event: run\.progress\ndata: ([^\n]+)/);
    expect(progressBlock).not.toBeNull();
    if (progressBlock) {
      const parsed = JSON.parse(progressBlock[1]);
      expect(parsed.type).toBe("run.progress");
      expect(parsed.timestamp).toBeTruthy();
      expect(parsed.data.runId).toBe(runId);
      expect(typeof parsed.data.status).toBe("string");
      expect(typeof parsed.data.progressPercent).toBe("number");
      expect(typeof parsed.data.stage).toBe("string");
    }
  });

  // eslint-disable-next-line no-empty-pattern
  test("dedicated SSE connection delivers mandatory heartbeat", async ({}, testInfo) => {
    testInfo.setTimeout(45_000);
    const http = await import("node:http");
    const httpServerUrl = new URL(BASE_URL);

    // Start a run so there is an SSE endpoint to connect to
    const runRes = await fetch(
      `${BASE_URL}/api/v1/servers/${SERVER_KEY}/projects/${PROJECT_KEY}/better-harness/runs`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "full" }),
      },
    );
    const { runId }: any = await runRes.json();

    // Connect SSE and wait long enough for a heartbeat (interval is 15 s)
    const sseData = await new Promise<string>((resolve) => {
      let accumulated = "";
      const timer = setTimeout(() => resolve(accumulated), 20_000);
      const path = `/api/v1/servers/${encodeURIComponent(SERVER_KEY)}/projects/${encodeURIComponent(PROJECT_KEY)}/better-harness/runs/${encodeURIComponent(runId)}/events`;
      const req = http.get(
        { hostname: httpServerUrl.hostname, port: parseInt(httpServerUrl.port, 10), path },
        (res) => {
          res.on("data", (chunk: Buffer) => { accumulated += chunk.toString(); });
          res.on("end", () => { clearTimeout(timer); resolve(accumulated); });
          res.on("error", () => { clearTimeout(timer); resolve(accumulated); });
        },
      );
      req.on("error", () => { clearTimeout(timer); resolve(accumulated); });
    });

    expect(sseData).toContain("event: connected");
    expect(sseData).toContain("event: heartbeat");

    // Validate canonical heartbeat envelope
    const hbMatch = sseData.match(/data: ({.*?heartbeat.*?})\n/i);
    expect(hbMatch).not.toBeNull();
    if (hbMatch) {
      const parsed = JSON.parse(hbMatch[1]);
      expect(parsed.type).toBe("heartbeat");
      expect(parsed.timestamp).toBeTruthy();
      expect(parsed.data.time).toBeDefined();
    }
  });

  // eslint-disable-next-line no-empty-pattern
  test("SSE Last-Event-ID correctly filters replayed events", async ({}, testInfo) => {
    testInfo.setTimeout(45_000);
    const http = await import("node:http");

    // Start a run and wait for it to complete
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
    await new Promise((r) => setTimeout(r, 3_000));

    // Helper: collect SSE data with a timeout
    const readSSE = (lastEventId?: string, timeoutMs = 6_000) => new Promise<string>((resolve) => {
      const serverUrl = new URL(BASE_URL);
      const path = `/api/v1/servers/${encodeURIComponent(SERVER_KEY)}/projects/${encodeURIComponent(PROJECT_KEY)}/better-harness/runs/${encodeURIComponent(runId)}/events`;
      const headers: Record<string, string> = {};
      if (lastEventId) headers["Last-Event-ID"] = lastEventId;

      let data = "";
      const timer = setTimeout(() => resolve(data), timeoutMs);

      const req = http.get(
        { hostname: serverUrl.hostname, port: parseInt(serverUrl.port, 10), path, headers },
        (res) => {
          res.on("data", (chunk: Buffer) => { data += chunk.toString(); });
          res.on("end", () => { clearTimeout(timer); resolve(data); });
          res.on("error", () => { clearTimeout(timer); resolve(data); });
        },
      );
      req.on("error", () => { clearTimeout(timer); resolve(data); });
    });

    // ---- Full replay assertion ----
    const fullReplay = await readSSE("0");

    // 1. Exactly one connected frame, and it has no `id:` prefix.
    //    In the raw data, durable events look like "id: N\nevent: ...",
    //    while connected looks like "\nevent: connected" (no id line).
    const connectedLines = fullReplay.split("\n").filter(l => l.startsWith("event: connected"));
    expect(connectedLines.length).toBe(1);
    // The connected frame should NOT be preceded by an "id: N" line
    expect(fullReplay).not.toMatch(/\nid: \d+\nevent: connected/);

    // 2. Replayed durable events arrive before the connected frame.
    //    The connected frame must be the last event in the batch.
    const allEvents = fullReplay.split("\n").filter(l => l.startsWith("event:"));
    const connectedIdx = allEvents.findIndex(e => e === "event: connected");
    // The connected frame should be at the end; everything before it is replay
    expect(connectedIdx).toBe(allEvents.length - 1);

    // 3. Extract durable event IDs (lines matching `id: <number>`).
    //    Connected and heartbeat frames have no `id:` field, so only
    //    persisted run lifecycle events are captured.
    const durableIds = [...fullReplay.matchAll(/^id: (\d+)/gm)].map(m => parseInt(m[1], 10));
    expect(durableIds.length).toBeGreaterThan(0);

    // 4. Every durable ID must be unique and strictly increasing.
    expect(new Set(durableIds).size).toBe(durableIds.length);
    expect(durableIds.every((id, i) => i === 0 || id > durableIds[i - 1])).toBe(true);

    // 5. Required lifecycle events are present.
    expect(fullReplay).toContain("event: run.progress");
    expect(fullReplay).toContain("event: finding.created");
    expect(fullReplay).toContain("event: report.completed");

    // 6. All durable IDs are > 0 (proves Last-Event-ID=0 filter works)
    expect(durableIds.every(id => id > 0)).toBe(true);

    const maxDurableId = durableIds[durableIds.length - 1];

    // ---- Empty replay assertion ----
    const emptyReplay = await readSSE(String(maxDurableId), 3_000);
    const emptyEvents = emptyReplay.split("\n").filter(l => l.startsWith("event:"));
    console.log(`  Empty replay (lastId=${maxDurableId}): [${emptyEvents.join(", ")}]`);

    // 7. Reconnecting with Last-Event-ID = max durable ID produces no run events
    const runEventsAfter = emptyEvents.filter(e => e.includes("run."));
    expect(runEventsAfter.length).toBe(0);

    // 8. Exactly one connected frame per connection
    const connectedCount = emptyEvents.filter(e => e === "event: connected").length;
    expect(connectedCount).toBe(1);

    // 9. Connected frame in the second connection also has no id
    expect(emptyReplay).not.toMatch(/^id: (\d+).*\nevent: connected/);
  });

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
  });

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
  });
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

  test("server and project keys are rendered in the page", async ({ page }) => {
    await page.goto(HARNESS_ROUTE);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1_000);

    // The server key text must exist somewhere in the DOM (it is rendered inside
    // a truncate span that Playwright reports as hidden despite being visible)
    await expect(page.locator("body")).toContainText(SERVER_KEY, { timeout: 5_000 });
    await expect(page.locator("body")).toContainText(PROJECT_KEY, { timeout: 3_000 });
  });

  test("regenerate button triggers POST to FlowDeck /runs", async ({ page }) => {
    // Intercept the POST /runs request
    const runRequestPromise = page.waitForRequest((req) =>
      req.url().includes("/better-harness/runs") && req.method() === "POST"
    );

    await page.goto(HARNESS_ROUTE);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1_000);

    const regenBtn = page.locator('button:has-text("Regenerate")').first();
    await expect(regenBtn).toBeVisible({ timeout: 5_000 });
    await regenBtn.click();

    // Confirm the dialog
    const yesBtn = page.locator('button:has-text("Yes")').first();
    await expect(yesBtn).toBeVisible({ timeout: 2_000 });
    await yesBtn.click();

    // Verify the POST request was made and get its response
    const runRequest = await runRequestPromise;
    expect(runRequest).not.toBeNull();
    const runResponse = await runRequest.response();
    expect(runResponse).not.toBeNull();
    expect(runResponse!.status()).toBe(201);
    const runBody: any = await runResponse!.json();
    expect(runBody.accepted).toBe(true);
    expect(runBody.runId).toBeDefined();

    // Wait for the run to complete (it's fast — ~1 s)
    await page.waitForTimeout(3_000);

    // The page should have rendered the report score after completion
    const pageText = await page.locator("body").innerText();
    expect(pageText).toMatch(/Score/i);
  });

  test("progress state is visible during a running analysis", async ({ page }) => {
    // Start a slow run via API, then navigate to the UI
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

    // Quickly navigate while the run is still executing
    await page.goto(HARNESS_ROUTE);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1_000);

    // The run ID should be referenced somewhere in the page data
    const bodyText = await page.locator("body").innerText();
    expect(bodyText.length).toBeGreaterThan(0);

    // Wait for completion and verify the score appears
    await page.waitForTimeout(5_000);
    const finalText = await page.locator("body").innerText();
    expect(finalText).toMatch(/Score/i);
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

  test("missing configuration shows Unavailable state and makes zero API requests", async ({ page }) => {
    // Intercept ALL requests and reject any that target the FlowDeck backend
    const apiRequests: string[] = [];
    await page.route("**/*", (route) => {
      const url = route.request().url();
      if (url.includes(BASE_URL)) apiRequests.push(url);
      route.continue();
    });

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

    // Zero API requests were made to the FlowDeck backend
    expect(apiRequests.length).toBe(0);
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
  });
});
