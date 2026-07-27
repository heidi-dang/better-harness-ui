import { HarnessDataSource, BatchPlanFixResult, BatchIgnoreResult, BatchVerifyResult } from "./harness-data-source";
import { HarnessReport, HarnessRunProgress, HarnessDemoMode } from "../types";
import {
  COMPLETED_HARNESS_REPORT,
  EMPTY_HARNESS_REPORT,
  FIXTURE_RUN_PROGRESS,
  HISTORICAL_HARNESS_REPORTS,
} from "../fixtures/harness-fixtures";

export class FixtureHarnessDataSource implements HarnessDataSource {
  private demoMode: HarnessDemoMode;
  private currentReport: HarnessReport | undefined;
  private isCancelled = false;

  constructor(demoMode: HarnessDemoMode = "completed") {
    this.demoMode = demoMode;
    if (demoMode === "completed") {
      this.currentReport = JSON.parse(JSON.stringify(COMPLETED_HARNESS_REPORT));
    } else if (demoMode === "empty") {
      this.currentReport = JSON.parse(JSON.stringify(EMPTY_HARNESS_REPORT));
    } else if (demoMode === "incompatible-schema") {
      this.currentReport = {
        ...COMPLETED_HARNESS_REPORT,
        // @ts-expect-error simulating invalid schema version
        schemaVersion: 99,
      };
    } else {
      this.currentReport = undefined;
    }
  }

  async availability(): Promise<{ available: boolean; reason?: string }> {
    if (this.demoMode === "unavailable") {
      return {
        available: false,
        reason:
          "FlowDeck execution engine is not connected. Showing unavailable fixture state.",
      };
    }
    return { available: true };
  }

  async getReport(): Promise<HarnessReport | undefined> {
    if (this.demoMode === "failed" || this.demoMode === "unavailable" || this.demoMode === "running") {
      return undefined;
    }
    return this.currentReport;
  }

  async getHistory(): Promise<HarnessReport[]> {
    if (this.demoMode === "failed" || this.demoMode === "unavailable") {
      return [];
    }
    return HISTORICAL_HARNESS_REPORTS;
  }

  async getRunProgress(): Promise<HarnessRunProgress | undefined> {
    if (this.demoMode === "running") {
      return FIXTURE_RUN_PROGRESS;
    }
    if (this.demoMode === "failed") {
      return {
        runId: "run-failed-001",
        status: "failed",
        stage: "Failed during session log analysis",
        progressPercent: 42,
        startedAt: new Date().toISOString(),
        errorMessage: "Simulated analysis failure in demo mode.",
      };
    }
    return undefined;
  }

  async regenerate(): Promise<{ accepted: boolean; runId?: string }> {
    if (this.demoMode === "unavailable") {
      return { accepted: false };
    }
    this.isCancelled = false;
    return { accepted: true, runId: `run-demo-${Date.now()}` };
  }

  async planFix(findingId: string): Promise<{ accepted: boolean; repairSessionId?: string }> {
    if (this.currentReport) {
      const finding = this.currentReport.findings.find((f) => f.id === findingId);
      if (finding) {
        finding.status = "planning";
        finding.repairSessionId = `sess-rep-demo-${findingId}`;
        return { accepted: true, repairSessionId: finding.repairSessionId };
      }
    }
    return { accepted: true, repairSessionId: `sess-rep-demo-${findingId}` };
  }

  async verify(findingId: string): Promise<{ accepted: boolean }> {
    if (this.currentReport) {
      const finding = this.currentReport.findings.find((f) => f.id === findingId);
      if (finding) {
        finding.status = "fixed";
      }
    }
    return { accepted: true };
  }

  async ignore(findingId: string, _reason: string): Promise<{ accepted: boolean }> {
    if (this.currentReport) {
      const finding = this.currentReport.findings.find((f) => f.id === findingId);
      if (finding) {
        finding.status = "ignored";
      }
    }
    return { accepted: true };
  }

  async batchPlanFix(findingIds: string[]): Promise<BatchPlanFixResult[]> {
    const results: BatchPlanFixResult[] = [];
    for (const findingId of findingIds) {
      if (this.currentReport) {
        const finding = this.currentReport.findings.find((f) => f.id === findingId);
        if (finding) {
          finding.status = "planning";
          finding.repairSessionId = `sess-rep-demo-${findingId}`;
          results.push({ findingId, accepted: true, repairSessionId: finding.repairSessionId });
        } else {
          results.push({ findingId, accepted: false, error: "Finding not found" });
        }
      } else {
        results.push({ findingId, accepted: true, repairSessionId: `sess-rep-demo-${findingId}` });
      }
    }
    return results;
  }

  async batchIgnore(findingIds: string[], _reason: string): Promise<BatchIgnoreResult[]> {
    const results: BatchIgnoreResult[] = [];
    for (const findingId of findingIds) {
      if (this.currentReport) {
        const finding = this.currentReport.findings.find((f) => f.id === findingId);
        if (finding) {
          finding.status = "ignored";
          results.push({ findingId, accepted: true });
        } else {
          results.push({ findingId, accepted: false, error: "Finding not found" });
        }
      } else {
        results.push({ findingId, accepted: true });
      }
    }
    return results;
  }

  async batchVerify(findingIds: string[]): Promise<BatchVerifyResult[]> {
    const results: BatchVerifyResult[] = [];
    for (const findingId of findingIds) {
      if (this.currentReport) {
        const finding = this.currentReport.findings.find((f) => f.id === findingId);
        if (finding) {
          finding.status = "fixed";
          results.push({ findingId, accepted: true });
        } else {
          results.push({ findingId, accepted: false, error: "Finding not found" });
        }
      } else {
        results.push({ findingId, accepted: true });
      }
    }
    return results;
  }

  async cancel(): Promise<void> {
    this.isCancelled = true;
  }
}
