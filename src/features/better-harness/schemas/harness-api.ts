import { z } from "zod";
import { HarnessReport } from "../types";
import { HarnessReportSchema } from "./harness-report";
import { HarnessRunProgressSchema } from "./harness-run";

// ── HTTP API Response Schemas ──────────────────────────────────────────

export const AvailabilityResponseSchema = z
  .object({
    available: z.boolean(),
    reason: z.string().optional(),
  })
  .strict();

export type AvailabilityResponse = z.infer<typeof AvailabilityResponseSchema>;

export const StartRunResponseSchema = z
  .object({
    accepted: z.boolean(),
    runId: z.string().min(1).optional(),
  })
  .strict();

export type StartRunResponse = z.infer<typeof StartRunResponseSchema>;

export const PlanFixResponseItemSchema = z
  .object({
    findingId: z.string().min(1),
    accepted: z.boolean(),
    repairSessionId: z.string().optional(),
    error: z.string().optional(),
  })
  .strict();

export const PlanFixResponseSchema = z
  .object({
    accepted: z.boolean(),
    results: z.array(PlanFixResponseItemSchema).optional(),
    repairSessionId: z.string().optional(),
  })
  .strict();

export type PlanFixResponse = z.infer<typeof PlanFixResponseSchema>;

export const IgnoreResponseItemSchema = z
  .object({
    findingId: z.string().min(1),
    accepted: z.boolean(),
    error: z.string().optional(),
  })
  .strict();

export const IgnoreResponseSchema = z
  .object({
    accepted: z.boolean(),
    results: z.array(IgnoreResponseItemSchema).optional(),
  })
  .strict();

export type IgnoreResponse = z.infer<typeof IgnoreResponseSchema>;

export const VerifyResponseItemSchema = z
  .object({
    findingId: z.string().min(1),
    accepted: z.boolean(),
    error: z.string().optional(),
  })
  .strict();

export const VerifyResponseSchema = z
  .object({
    accepted: z.boolean(),
    results: z.array(VerifyResponseItemSchema).optional(),
  })
  .strict();

export type VerifyResponse = z.infer<typeof VerifyResponseSchema>;

export const SSEEventSchema = z.object({
  type: z.string(),
  data: z.unknown(),
});

export type SSEEvent = z.infer<typeof SSEEventSchema>;

// ── Response validators that preserve full error context ───────────────

export const CancelResponseSchema = z
  .object({
    accepted: z.boolean(),
  })
  .strict()
  .optional()
  .or(z.null());

export type CancelResponse = z.infer<typeof CancelResponseSchema>;

export function validateCancelResponse(
  data: unknown
): { valid: true; value: void } | { valid: false; error: string } {
  const result = CancelResponseSchema.safeParse(data);
  if (result.success) return { valid: true, value: undefined };
  return { valid: false, error: formatZodIssues("CancelResponse", result.error.issues) };
}

export function validateAvailabilityResponse(
  data: unknown
): { valid: true; value: AvailabilityResponse } | { valid: false; error: string } {
  const result = AvailabilityResponseSchema.safeParse(data);
  if (result.success) return { valid: true, value: result.data };
  return { valid: false, error: formatZodIssues("AvailabilityResponse", result.error.issues) };
}

export function validateStartRunResponse(
  data: unknown
): { valid: true; value: StartRunResponse } | { valid: false; error: string } {
  const result = StartRunResponseSchema.safeParse(data);
  if (result.success) return { valid: true, value: result.data };
  return { valid: false, error: formatZodIssues("StartRunResponse", result.error.issues) };
}

export function validatePlanFixResponse(
  data: unknown
): { valid: true; value: PlanFixResponse } | { valid: false; error: string } {
  const result = PlanFixResponseSchema.safeParse(data);
  if (result.success) return { valid: true, value: result.data };
  return { valid: false, error: formatZodIssues("PlanFixResponse", result.error.issues) };
}

export function validateIgnoreResponse(
  data: unknown
): { valid: true; value: IgnoreResponse } | { valid: false; error: string } {
  const result = IgnoreResponseSchema.safeParse(data);
  if (result.success) return { valid: true, value: result.data };
  return { valid: false, error: formatZodIssues("IgnoreResponse", result.error.issues) };
}

export function validateVerifyResponse(
  data: unknown
): { valid: true; value: VerifyResponse } | { valid: false; error: string } {
  const result = VerifyResponseSchema.safeParse(data);
  if (result.success) return { valid: true, value: result.data };
  return { valid: false, error: formatZodIssues("VerifyResponse", result.error.issues) };
}

export function validateHarnessReportResponse(
  data: unknown
): { valid: true; value: HarnessReport } | { valid: false; error: string } {
  const result = HarnessReportSchema.safeParse(data);
  if (result.success) return { valid: true, value: result.data as HarnessReport };
  return { valid: false, error: formatZodIssues("HarnessReport", result.error.issues) };
}

export function validateHarnessReportArrayResponse(
  data: unknown
): { valid: true; value: HarnessReport[] } | { valid: false; error: string } {
  const arrSchema = z.array(HarnessReportSchema);
  const result = arrSchema.safeParse(data);
  if (result.success) return { valid: true, value: result.data as HarnessReport[] };
  return { valid: false, error: formatZodIssues("HarnessReport[]", result.error.issues) };
}

export function validateRunProgressResponse(
  data: unknown
): { valid: true; value: z.infer<typeof HarnessRunProgressSchema> } | { valid: false; error: string } {
  const result = HarnessRunProgressSchema.safeParse(data);
  if (result.success) return { valid: true, value: result.data };
  return { valid: false, error: formatZodIssues("HarnessRunProgress", result.error.issues) };
}

function formatZodIssues(label: string, issues: z.ZodIssue[]): string {
  const details = issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  return `Invalid ${label}: ${details}`;
}
