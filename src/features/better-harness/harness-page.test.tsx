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
    it("constructs with valid config", () => {
      const source = new HttpHarnessDataSource({
        baseUrl: "http://localhost:8080",
        serverKey: "main-server",
        projectKey: "test-project",
      });
      expect(source).toBeDefined();
    });

    it("returns unavailable when backend is unreachable", async () => {
      const source = new HttpHarnessDataSource({
        baseUrl: "http://localhost:1",
        serverKey: "main-server",
        projectKey: "test-project",
      });
      const avail = await source.availability();
      expect(avail.available).toBe(false);
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
