import { validateHarnessReport } from "./schemas/harness-report";
import { validateHarnessRun } from "./schemas/harness-run";
import { FixtureHarnessDataSource } from "./api/fixture-harness-data-source";
import { UnavailableHarnessDataSource } from "./api/unavailable-harness-data-source";
import { filterAndSortFindings } from "./utils/finding-filters";
import { encodeProjectDir, decodeProjectDir, parseHarnessRoute, buildHarnessRoute } from "./utils/harness-route";
import { COMPLETED_HARNESS_REPORT, FIXTURE_FINDINGS } from "./fixtures/harness-fixtures";

// Self-contained test suite runner for tsc and runtime verification
export async function runBetterHarnessTests(): Promise<void> {
  console.log("Running Better Harness unit tests...");

  // 1. Report Schema Validation (Valid payload)
  const resValid = validateHarnessReport(COMPLETED_HARNESS_REPORT);
  if (!resValid.valid) throw new Error("Expected valid report");

  // 2. Report Schema Validation (Malformed schemaVersion)
  const resInvalid = validateHarnessReport({ schemaVersion: 2 });
  if (resInvalid.valid) throw new Error("Expected invalid schema version error");

  // 3. Report Schema Validation (Malformed score range)
  const resBadScore = validateHarnessReport({
    ...COMPLETED_HARNESS_REPORT,
    overallScore: 150, // exceeds max 100
  });
  if (resBadScore.valid) throw new Error("Expected invalid overallScore range error");

  // 4. Run Progress Schema Validation
  const validRun = validateHarnessRun({
    runId: "run-101",
    status: "running",
    progressPercent: 65,
  });
  if (!validRun.valid) throw new Error("Expected valid run progress");

  const invalidRun = validateHarnessRun({
    runId: "",
    status: "invalid-status",
  });
  if (invalidRun.valid) throw new Error("Expected invalid run progress status error");

  // 5. Fixture Adapter Verification
  const fixtureSource = new FixtureHarnessDataSource("completed");
  const report = await fixtureSource.getReport();
  if (!report || report.findings.length < 15) throw new Error("Expected 15+ findings");

  const history = await fixtureSource.getHistory();
  if (!history || history.length === 0) throw new Error("Expected historical reports");

  // 6. Batch Ignore Validation
  const ignoreRes = await fixtureSource.ignore("FND-001", "False positive analysis");
  if (!ignoreRes.accepted) throw new Error("Expected ignore action to be accepted");

  // 7. Unavailable Adapter Verification
  const unavailableSource = new UnavailableHarnessDataSource();
  const avail = await unavailableSource.availability();
  if (avail.available) throw new Error("Expected unavailable status");

  // 8. Finding Filters
  const filtered = filterAndSortFindings(FIXTURE_FINDINGS, {
    searchQuery: "",
    dimension: "task-understanding",
    priority: "all",
    status: "all",
    recommendedVehicle: "all",
    sortBy: "priority",
    sortOrder: "desc",
  });
  if (!filtered.every((f) => f.dimension === "task-understanding")) {
    throw new Error("Dimension filter failed");
  }

  // 9. Route Utilities
  const dir = "/workspace/project-alpha";
  const encoded = encodeProjectDir(dir);
  const decoded = decodeProjectDir(encoded);
  if (decoded !== dir) throw new Error("Route encoding/decoding mismatch");

  const route = "/server/srv-01/project/L3dvcmtzcGFjZS9vcGVuY29kZS13ZWItdWk/better-harness";
  const parsed = parseHarnessRoute(route);
  if (!parsed.isValid || parsed.serverKey !== "srv-01") {
    throw new Error("Route parsing failed");
  }

  const generatedRoute = buildHarnessRoute("srv-01", dir);
  if (!generatedRoute.includes("/server/srv-01/project/")) {
    throw new Error("Route generation failed");
  }

  console.log("All Better Harness unit tests passed successfully!");
}

// Auto-run when executed directly via tsx/node
if (typeof process !== "undefined" && process.argv && process.argv[1] && process.argv[1].includes("harness-page.test")) {
  runBetterHarnessTests().catch((err) => {
    console.error("Test execution failed:", err);
    process.exit(1);
  });
}
