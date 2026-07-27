import { HarnessReport, HarnessRunProgress } from "../types";

export interface HarnessDataSource {
  availability(): Promise<{
    available: boolean;
    reason?: string;
  }>;

  getReport(): Promise<HarnessReport | undefined>;

  getHistory?(): Promise<HarnessReport[]>;

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

  cancel(): Promise<void>;
}
