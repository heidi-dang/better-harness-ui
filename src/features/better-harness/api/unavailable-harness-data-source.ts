import { HarnessDataSource, BatchPlanFixResult, BatchIgnoreResult, BatchVerifyResult } from "./harness-data-source";
import { HarnessReport, HarnessRunProgress } from "../types";

export class UnavailableHarnessDataSource implements HarnessDataSource {
  private reason: string;

  constructor(
    reason = "FlowDeck execution engine is not connected in phase one. Better Harness UI is running in disconnected production mode."
  ) {
    this.reason = reason;
  }

  async availability(): Promise<{ available: boolean; reason?: string }> {
    return {
      available: false,
      reason: this.reason,
    };
  }

  async getReport(): Promise<HarnessReport | undefined> {
    return undefined;
  }

  async getHistory(): Promise<HarnessReport[]> {
    return [];
  }

  async getRunProgress(): Promise<HarnessRunProgress | undefined> {
    return undefined;
  }

  async regenerate(): Promise<{ accepted: boolean; runId?: string }> {
    return { accepted: false };
  }

  async planFix(_findingId: string): Promise<{ accepted: boolean; repairSessionId?: string }> {
    return { accepted: false };
  }

  async verify(_findingId: string): Promise<{ accepted: boolean }> {
    return { accepted: false };
  }

  async ignore(_findingId: string, _reason: string): Promise<{ accepted: boolean }> {
    return { accepted: false };
  }

  async batchPlanFix(_findingIds: string[]): Promise<BatchPlanFixResult[]> {
    return _findingIds.map((id) => ({ findingId: id, accepted: false }));
  }

  async batchIgnore(_findingIds: string[], _reason: string): Promise<BatchIgnoreResult[]> {
    return _findingIds.map((id) => ({ findingId: id, accepted: false }));
  }

  async batchVerify(_findingIds: string[]): Promise<BatchVerifyResult[]> {
    return _findingIds.map((id) => ({ findingId: id, accepted: false }));
  }

  async cancel(): Promise<void> {}
}
