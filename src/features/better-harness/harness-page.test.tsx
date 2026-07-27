import { describe, it, expect } from "vitest";
import { validateHarnessReport } from "./schemas/harness-report";
import { validateHarnessRun } from "./schemas/harness-run";
import { FixtureHarnessDataSource } from "./api/fixture-harness-data-source";
import { UnavailableHarnessDataSource } from "./api/unavailable-harness-data-source";
import { HttpHarnessDataSource } from "./api/http-harness-data-source";
import { filterAndSortFindings } from "./utils/finding-filters";
import {
  encodeProjectDir,
  decodeProjectDir,
  parseHarnessRoute,
  buildHarnessRoute,
} from "./utils/harness-route";
import { COMPLETED_HARNESS_REPORT, FIXTURE_FINDINGS } from "./fixtures/harness-fixtures";
import type { BatchPlanFixResult, BatchIgnoreResult, BatchVerifyResult } from "./api/harness-data-source";

describe("Better Harness", () => {
  describe("Report Schema Validation", () => {
    it("validates a complete report", () => {
      const res = validateHarnessReport(COMPLETED_HARNESS_REPORT);
      expect(res.valid).toBe(true);
    });

    it("rejects malformed schema version", () => {
      const res = validateHarnessReport({ schemaVersion: 2 });
      expect(res.valid).toBe(false);
      expect(res.error).toContain("schemaVersion");
    });

    it("rejects out-of-range score", () => {
      const res = validateHarnessReport({
        ...COMPLETED_HARNESS_REPORT,
        overallScore: 150,
      });
      expect(res.valid).toBe(false);
      expect(res.error).toContain("overallScore");
    });
  });

  describe("Run Progress Schema Validation", () => {
    it("validates a complete run progress object", () => {
      const res = validateHarnessRun({
        runId: "run-101",
        status: "running",
        progressPercent: 65,
      });
      expect(res.valid).toBe(true);
    });

    it("rejects invalid run status", () => {
      const res = validateHarnessRun({
        runId: "run-102",
        status: "invalid-status",
      });
      expect(res.valid).toBe(false);
    });
  });

  describe("FixtureHarnessDataSource", () => {
    it("returns a report with 15+ findings", async () => {
      const source = new FixtureHarnessDataSource("completed");
      const report = await source.getReport();
      expect(report).toBeDefined();
      expect(report!.findings.length).toBeGreaterThanOrEqual(15);
    });

    it("returns historical reports", async () => {
      const source = new FixtureHarnessDataSource("completed");
      const history = await source.getHistory();
      expect(history.length).toBeGreaterThan(0);
    });

    it("handles batch ignore", async () => {
      const source = new FixtureHarnessDataSource("completed");
      const res = await source.ignore("FND-1001", "False positive");
      expect(res.accepted).toBe(true);
    });

    it("handles batch operations", async () => {
      const source = new FixtureHarnessDataSource("completed");

      const planResults: BatchPlanFixResult[] = await source.batchPlanFix(["FND-1001", "FND-1002"]);
      expect(planResults).toHaveLength(2);
      expect(planResults.every((r) => r.accepted)).toBe(true);

      const ignoreResults: BatchIgnoreResult[] = await source.batchIgnore(
        ["FND-1003", "FND-1004"],
        "Test batch ignore"
      );
      expect(ignoreResults).toHaveLength(2);
      expect(ignoreResults.every((r) => r.accepted)).toBe(true);

      const verifyResults: BatchVerifyResult[] = await source.batchVerify(["FND-1005"]);
      expect(verifyResults).toHaveLength(1);
      expect(verifyResults[0].accepted).toBe(true);
    });

    it("returns progress for running demo mode", async () => {
      const source = new FixtureHarnessDataSource("running");
      const progress = await source.getRunProgress();
      expect(progress).toBeDefined();
      expect(progress!.status).toBe("running");
    });

    it("returns undefined report for running demo mode", async () => {
      const source = new FixtureHarnessDataSource("running");
      const report = await source.getReport();
      expect(report).toBeUndefined();
    });
  });

  describe("UnavailableHarnessDataSource", () => {
    it("reports unavailable availability", async () => {
      const source = new UnavailableHarnessDataSource();
      const avail = await source.availability();
      expect(avail.available).toBe(false);
    });

    it("returns empty history", async () => {
      const source = new UnavailableHarnessDataSource();
      const history = await source.getHistory();
      expect(history).toEqual([]);
    });

    it("rejects all batch operations", async () => {
      const source = new UnavailableHarnessDataSource();

      const planResults = await source.batchPlanFix(["FND-1001"]);
      expect(planResults[0].accepted).toBe(false);

      const ignoreResults = await source.batchIgnore(["FND-1001"], "reason");
      expect(ignoreResults[0].accepted).toBe(false);

      const verifyResults = await source.batchVerify(["FND-1001"]);
      expect(verifyResults[0].accepted).toBe(false);
    });
  });

  describe("HttpHarnessDataSource", () => {
    let source: HttpHarnessDataSource;
    const BASE_CONFIG: HttpHarnessDataSourceConfig = {
      baseUrl: "http://localhost:8080",
      serverKey: "main-server",
      projectKey: "test-project",
    };

    function mockFetchResponse(body: unknown, status = 200, statusText = "OK") {
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status,
          statusText,
          headers: { "Content-Type": "application/json" },
        })
      );
    }

    beforeEach(() => {
      source = new HttpHarnessDataSource(BASE_CONFIG);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("constructs with valid config", () => {
      expect(source).toBeDefined();
    });

    it("returns unavailable when backend is unreachable", async () => {
      vi.spyOn(global, "fetch").mockRejectedValue(new Error("Connection refused"));
      const avail = await source.availability();
      expect(avail.available).toBe(false);
      expect(avail.reason).toContain("Connection refused");
    });

    it("availability returns available when API responds", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue(
        mockFetchResponse({ available: true })
      );
      const avail = await source.availability();
      expect(avail.available).toBe(true);
    });

    it("getReport returns parsed report on success", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue(
        mockFetchResponse(COMPLETED_HARNESS_REPORT)
      );
      const report = await source.getReport();
      expect(report).toBeDefined();
      expect(report!.overallScore).toBe(COMPLETED_HARNESS_REPORT.overallScore);
      expect(report!.findings.length).toBeGreaterThan(0);
    });

    it("getReport returns undefined on 404", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue(
        mockFetchResponse(null, 404)
      );
      const report = await source.getReport();
      expect(report).toBeUndefined();
    });

    it("getReport returns undefined on 204", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue(
        new Response(null, { status: 204 })
      );
      const report = await source.getReport();
      expect(report).toBeUndefined();
    });

    it("regenerate returns accepted with runId", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue(
        mockFetchResponse({ accepted: true, runId: "run-001" })
      );
      const res = await source.regenerate();
      expect(res.accepted).toBe(true);
      expect(res.runId).toBe("run-001");
    });

    it("cancel cleans up abort controller and SSE", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue(
        mockFetchResponse({ accepted: true })
      );
      await expect(source.cancel()).resolves.toBeUndefined();
    });

    it("planFix returns accepted", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue(
        mockFetchResponse({
          accepted: true,
          results: [{ findingId: "FND-1001", accepted: true, repairSessionId: "rs-001" }],
        })
      );
      const res = await source.planFix("FND-1001");
      expect(res.accepted).toBe(true);
      expect(res.repairSessionId).toBe("rs-001");
    });

    it("verify returns accepted", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue(
        mockFetchResponse({
          accepted: true,
          results: [{ findingId: "FND-1001", accepted: true }],
        })
      );
      const res = await source.verify("FND-1001");
      expect(res.accepted).toBe(true);
    });

    it("ignore returns accepted", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue(
        mockFetchResponse({
          accepted: true,
          results: [{ findingId: "FND-1001", accepted: true }],
        })
      );
      const res = await source.ignore("FND-1001", "False positive");
      expect(res.accepted).toBe(true);
    });

    it("batchPlanFix returns per-finding results", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue(
        mockFetchResponse({
          accepted: true,
          results: [
            { findingId: "FND-1001", accepted: true, repairSessionId: "rs-001" },
            { findingId: "FND-1002", accepted: false, error: "Stale finding" },
          ],
        })
      );
      const results = await source.batchPlanFix(["FND-1001", "FND-1002"]);
      expect(results).toHaveLength(2);
      expect(results[0].accepted).toBe(true);
      expect(results[0].repairSessionId).toBe("rs-001");
      expect(results[1].accepted).toBe(false);
      expect(results[1].error).toBe("Stale finding");
    });

    it("batchPlanFix returns empty array for empty input", async () => {
      const results = await source.batchPlanFix([]);
      expect(results).toEqual([]);
    });

    it("batchIgnore returns results", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue(
        mockFetchResponse({
          accepted: true,
          results: [
            { findingId: "FND-1001", accepted: true },
            { findingId: "FND-1002", accepted: true },
          ],
        })
      );
      const results = await source.batchIgnore(["FND-1001", "FND-1002"], "Test batch");
      expect(results).toHaveLength(2);
      expect(results.every((r) => r.accepted)).toBe(true);
    });

    it("batchVerify returns results", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue(
        mockFetchResponse({
          accepted: true,
          results: [{ findingId: "FND-1001", accepted: true }],
        })
      );
      const results = await source.batchVerify(["FND-1001"]);
      expect(results).toHaveLength(1);
      expect(results[0].accepted).toBe(true);
    });

    it("getHistory returns array of reports", async () => {
      const historyPayload = [COMPLETED_HARNESS_REPORT, COMPLETED_HARNESS_REPORT];
      vi.spyOn(global, "fetch").mockResolvedValue(
        mockFetchResponse(historyPayload)
      );
      const history = await source.getHistory();
      expect(history).toHaveLength(2);
    });

    it("getHistory propagates errors instead of swallowing them", async () => {
      vi.spyOn(global, "fetch").mockRejectedValue(new Error("Network error"));
      await expect(source.getHistory()).rejects.toThrow("Network error");
    });

    it("getRunProgress returns progress", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue(
        mockFetchResponse({
          runId: "run-001",
          status: "running",
          stage: "Collecting data",
          progressPercent: 45,
          startedAt: "2026-07-28T00:00:00Z",
        })
      );
      const progress = await source.getRunProgress();
      expect(progress).toBeDefined();
      expect(progress!.status).toBe("running");
      expect(progress!.progressPercent).toBe(45);
    });

    it("throws on non-ok non-204/404 response", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue(
        mockFetchResponse({ error: "Bad Request" }, 400)
      );
      // Use planFix — it does not catch errors internally (unlike getReport)
      await expect(source.planFix("FND-0001")).rejects.toThrow("Harness API error (400)");
    });

    describe("auth retry", () => {
      it("retries with new token on 401 when onAuthFailure returns a token", async () => {
        const onAuthFailure = vi.fn().mockResolvedValue("new-token-abc");
        const authSource = new HttpHarnessDataSource({
          ...BASE_CONFIG,
          authToken: "expired-token",
          onAuthFailure,
        });

        let callCount = 0;
        vi.spyOn(global, "fetch").mockImplementation(async (url, init) => {
          callCount++;
          if (callCount === 1) {
            // First call: 401
            expect((init as RequestInit).headers).toMatchObject({
              Authorization: "Bearer expired-token",
            });
            return mockFetchResponse({ error: "Unauthorized" }, 401);
          }
          // Second call: retry with new token
          expect((init as RequestInit).headers).toMatchObject({
            Authorization: "Bearer new-token-abc",
          });
          return mockFetchResponse({ available: true });
        });

        const avail = await authSource.availability();
        expect(avail.available).toBe(true);
        expect(onAuthFailure).toHaveBeenCalledTimes(1);
        expect(callCount).toBe(2);
      });

      it("throws on 401 when no onAuthFailure is provided", async () => {
        vi.spyOn(global, "fetch").mockResolvedValue(
          mockFetchResponse({ error: "Unauthorized" }, 401)
        );
        await expect(source.planFix("FND-0001")).rejects.toThrow("Harness API error (401)");
      });

      it("throws on 401 when onAuthFailure returns undefined", async () => {
        const onAuthFailure = vi.fn().mockResolvedValue(undefined);
        const authSource = new HttpHarnessDataSource({
          ...BASE_CONFIG,
          authToken: "expired-token",
          onAuthFailure,
        });

        vi.spyOn(global, "fetch").mockResolvedValue(
          mockFetchResponse({ error: "Unauthorized" }, 401)
        );
        await expect(authSource.planFix("FND-0001")).rejects.toThrow("Harness API error (401)");
        expect(onAuthFailure).toHaveBeenCalledTimes(1);
      });
    });

    describe("SSE (subscribeToProgress)", () => {
      function createOpenMockStream(neverEnd = false): {
        mockResponse: Response;
        readerCancel: ReturnType<typeof vi.fn>;
      } {
        const encoder = new TextEncoder();
        const readerCancel = vi.fn();

        const mockReader = {
          read: vi.fn().mockImplementation(() => {
            if (neverEnd) {
              // Return a pending promise so the stream stays open
              return new Promise<{ done: boolean; value?: Uint8Array }>(() => {});
            }
            return Promise.resolve({ done: true, value: undefined });
          }),
          cancel: readerCancel,
          releaseLock: vi.fn(),
        };

        return {
          mockResponse: {
            ok: true,
            status: 200,
            body: { getReader: () => mockReader },
            headers: new Headers({ "Content-Type": "text/event-stream" }),
          } as unknown as Response,
          readerCancel,
        };
      }

      it("returns an unsubscribe function", () => {
        const { mockResponse } = createOpenMockStream(true);
        vi.spyOn(global, "fetch").mockResolvedValue(mockResponse);

        const unsubscribe = source.subscribeToProgress("run-001", vi.fn());
        expect(typeof unsubscribe).toBe("function");
      });

      it("uses fetch with Authorization header", async () => {
        const authSource = new HttpHarnessDataSource({
          ...BASE_CONFIG,
          authToken: "test-sse-token",
        });

        const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
          new Response(null, { status: 200, headers: { "Content-Type": "text/event-stream" } })
        );

        const onEvent = vi.fn();
        const unsubscribe = authSource.subscribeToProgress("run-001", onEvent);

        // Verify the fetch was called with auth headers
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const fetchCall = fetchSpy.mock.calls[0];
        const url = fetchCall[0] as string;
        const options = fetchCall[1] as RequestInit;
        expect(url).toContain("/runs/run-001/events");
        expect(options.headers).toMatchObject({
          Authorization: "Bearer test-sse-token",
          Accept: "text/event-stream",
        });

        unsubscribe();
      });

      it("calls onError when fetch fails", async () => {
        vi.spyOn(global, "fetch").mockRejectedValue(new Error("Connection failed"));

        const onError = vi.fn();
        source.subscribeToProgress("run-001", vi.fn(), onError);

        // Wait for microtasks to drain, then check
        await new Promise((r) => setTimeout(r, 10));
        expect(onError).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe("Finding Filters", () => {
    it("filters by dimension", () => {
      const filtered = filterAndSortFindings(FIXTURE_FINDINGS, {
        searchQuery: "",
        dimension: "task-understanding",
        priority: "all",
        status: "all",
        recommendedVehicle: "all",
        sortBy: "priority",
        sortOrder: "desc",
      });
      expect(filtered.every((f) => f.dimension === "task-understanding")).toBe(true);
    });

    it("filters by priority", () => {
      const filtered = filterAndSortFindings(FIXTURE_FINDINGS, {
        searchQuery: "",
        dimension: "all",
        priority: "high",
        status: "all",
        recommendedVehicle: "all",
        sortBy: "priority",
        sortOrder: "desc",
      });
      expect(filtered.every((f) => f.priority === "high")).toBe(true);
    });

    it("returns all findings when no filter is applied", () => {
      const filtered = filterAndSortFindings(FIXTURE_FINDINGS, {
        searchQuery: "",
        dimension: "all",
        priority: "all",
        status: "all",
        recommendedVehicle: "all",
        sortBy: "priority",
        sortOrder: "desc",
      });
      expect(filtered).toHaveLength(FIXTURE_FINDINGS.length);
    });
  });

  describe("Route Utilities", () => {
    it("encodes and decodes project directories", () => {
      const dir = "/workspace/project-alpha";
      const encoded = encodeProjectDir(dir);
      const decoded = decodeProjectDir(encoded);
      expect(decoded).toBe(dir);
    });

    it("handles base64 padding characters in routes", () => {
      const dirs = [
        "/workspace/simple",
        "/workspace/with+plus",
        "/workspace/with/slashes",
        "/workspace/测试",
      ];
      for (const dir of dirs) {
        const encoded = encodeProjectDir(dir);
        const decoded = decodeProjectDir(encoded);
        expect(decoded).toBe(dir);
      }
    });

    it("parses server/project routes correctly", () => {
      const route =
        "/server/srv-01/project/L3dvcmtzcGFjZS9vcGVuY29kZS13ZWItdWk/better-harness";
      const parsed = parseHarnessRoute(route);
      expect(parsed.isValid).toBe(true);
      expect(parsed.serverKey).toBe("srv-01");
      expect(parsed.projectDir).toBe("/workspace/opencode-web-ui");
    });

    it("generates proper routes", () => {
      const dir = "/workspace/project-alpha";
      const generated = buildHarnessRoute("srv-01", dir);
      expect(generated).toContain("/server/srv-01/project/");
      expect(generated).toContain("/better-harness");
    });
  });
});
