import { HarnessReport, HarnessRunProgress } from "../types";

export interface BatchPlanFixResult {
  findingId: string;
  accepted: boolean;
  repairSessionId?: string;
  error?: string;
}

export interface BatchIgnoreResult {
  findingId: string;
  accepted: boolean;
  error?: string;
}

export interface BatchVerifyResult {
  findingId: string;
  accepted: boolean;
  error?: string;
}

export interface HarnessDataSource {
  availability(): Promise<{
    available: boolean;
    reason?: string;
  }>;

  getReport(): Promise<HarnessReport | undefined>;

  getHistory(): Promise<HarnessReport[]>;

  getRunProgress?(): Promise<HarnessRunProgress | undefined>;

  regenerate(): Promise<{
    accepted: boolean;
    runId?: string;
  }>;

  planFix(findingId: string): Promise<{
    accepted: boolean;
    repairSessionId?: string;
  }>;

  verify(findingId: string): Promise<{
    accepted: boolean;
  }>;

  ignore(findingId: string, reason: string): Promise<{
    accepted: boolean;
  }>;

  batchPlanFix(findingIds: string[]): Promise<BatchPlanFixResult[]>;

  batchIgnore(findingIds: string[], reason: string): Promise<BatchIgnoreResult[]>;

  batchVerify(findingIds: string[]): Promise<BatchVerifyResult[]>;

  cancel(): Promise<void>;
}
