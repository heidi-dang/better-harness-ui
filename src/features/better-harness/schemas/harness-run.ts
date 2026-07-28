import { z } from "zod";
import { HarnessRunProgress } from "../types";

export const HarnessRunProgressSchema = z
  .object({
    runId: z.string().min(1),
    status: z.enum(["queued", "running", "completed", "failed", "cancelled"]),
    stage: z.string().min(1).optional(),
    progressPercent: z.number().min(0).max(100).optional(),
    startedAt: z.string().min(1).optional(),
    updatedAt: z.string().min(1).optional(),
    estimatedTimeRemainingSeconds: z.number().nonnegative().optional(),
    errorMessage: z.string().min(1).optional(),
  })
  .strict();

export function validateHarnessRun(data: unknown): { valid: boolean; progress?: HarnessRunProgress; error?: string } {
  const result = HarnessRunProgressSchema.safeParse(data);
  if (result.success) {
    return { valid: true, progress: result.data as HarnessRunProgress };
  }
  const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  return { valid: false, error: `Invalid run progress schema: ${issues}` };
}
