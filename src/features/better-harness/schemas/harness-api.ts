import { z } from "zod";
import { HarnessReport } from "../types";
import { HarnessReportSchema } from "./harness-report";
import { HarnessRunProgressSchema } from "./harness-run";

/**
 * Canonical FlowDeck SSE Event Contract.
 * Aligned with backend SSE_CONTRACT_VERSION "1.0.0".
 *
 * Every named SSE event uses the canonical wire envelope:
 *
 *   id: <decimal-sequence-id>
 *   event: <named-event-type>
 *   data: {"type":"<named-event-type>","timestamp":"<ISO-8601>","data":<event-specific-payload>}
 */

// ── Discriminated HTTP result for empty-state semantics ───────────────

export type ValidatedHttpResult<T> =
  | { kind: "value"; value: T }
  | { kind: "empty"; status: 204 | 404 };

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
    error: z.string().optional(),
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

// FlowDeck CancelRunResponseSchema: { accepted: boolean, error?: string }
// UI validates with accepted: literal(true) for success confirmation.
export const CancelResponseSchema = z
  .object({
    accepted: z.literal(true),
    error: z.string().optional(),
  })
  .strict();

export type CancelResponse = z.infer<typeof CancelResponseSchema>;

// ── SSE Event Contract ─────────────────────────────────────────────────

export const SSESupportedEventEnum = z.enum([
  "connected",
  "heartbeat",
  "run.queued",
  "run.started",
  "collector.started",
  "collector.completed",
  "analysis.started",
  "finding.created",
  "run.progress",
  "report.completed",
  "run.cancelled",
  "run.failed",
]);

export type SSESupportedEvent = z.infer<typeof SSESupportedEventEnum>;

/** Canonical envelope inside the SSE data: line. */
export const SSEEnvelopeSchema = z
  .object({
    type: SSESupportedEventEnum,
    timestamp: z.string().datetime({ message: "timestamp must be ISO-8601" }),
    data: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type SSEEnvelope = z.infer<typeof SSEEnvelopeSchema>;

// ── Event-specific payload schemas (aligned with FlowDeck backend) ────

export const SSEConnectedPayloadSchema = z
  .object({
    clientId: z.string().min(1),
  })
  .strict();

export const SSEHeartbeatPayloadSchema = z
  .object({
    time: z.string().min(1),
  })
  .strict();

export const SSERunQueuedPayloadSchema = z
  .object({
    runId: z.string().min(1),
    status: z.literal("queued").optional(),
    stage: z.string().optional(),
    progressPercent: z.number().min(0).max(100).optional(),
  })
  .strict();

export const SSERunStartedPayloadSchema = z
  .object({
    runId: z.string().min(1),
    status: z.literal("running").optional(),
    stage: z.string().optional(),
    progressPercent: z.number().min(0).max(100).optional(),
  })
  .strict();

export const SSECollectorStartedPayloadSchema = z
  .object({
    runId: z.string().min(1),
  })
  .strict();

export const SSECollectorCompletedPayloadSchema = z
  .object({
    runId: z.string().min(1),
    evidenceCount: z.number().int().nonnegative(),
  })
  .strict();

export const SSEAnalysisStartedPayloadSchema = z
  .object({
    runId: z.string().min(1),
  })
  .strict();

export const SSEFindingCreatedPayloadSchema = z
  .object({
    runId: z.string().min(1),
    findingCount: z.number().int().nonnegative(),
  })
  .strict();

export const SSERunProgressPayloadSchema = z
  .object({
    runId: z.string().min(1),
    status: z.enum(["queued", "running", "completed", "failed", "cancelled"]),
    stage: z.string(),
    progressPercent: z.number().min(0).max(100),
    updatedAt: z.string(),
    errorMessage: z.string().optional(),
  })
  .strict();

export const SSEReportCompletedPayloadSchema = z
  .object({
    runId: z.string().min(1),
  })
  .strict();

export const SSERunCancelledPayloadSchema = z
  .object({
    runId: z.string().min(1),
    errorMessage: z.string().optional(),
  })
  .strict();

export const SSERunFailedPayloadSchema = z
  .object({
    runId: z.string().min(1),
    errorMessage: z.string(),
  })
  .strict();

/**
 * Map SSE envelope type to its payload validator.
 */
export function getPayloadValidator(
  eventType: SSESupportedEvent,
): z.ZodType<unknown> {
  switch (eventType) {
    case "connected":
      return SSEConnectedPayloadSchema;
    case "heartbeat":
      return SSEHeartbeatPayloadSchema;
    case "run.queued":
      return SSERunQueuedPayloadSchema;
    case "run.started":
      return SSERunStartedPayloadSchema;
    case "collector.started":
      return SSECollectorStartedPayloadSchema;
    case "collector.completed":
      return SSECollectorCompletedPayloadSchema;
    case "analysis.started":
      return SSEAnalysisStartedPayloadSchema;
    case "finding.created":
      return SSEFindingCreatedPayloadSchema;
    case "run.progress":
      return SSERunProgressPayloadSchema;
    case "report.completed":
      return SSEReportCompletedPayloadSchema;
    case "run.failed":
      return SSERunFailedPayloadSchema;
    case "run.cancelled":
      return SSERunCancelledPayloadSchema;
  }
}

/**
 * Parsed and validated SSE frame, after envelope validation.
 */
export interface ValidatedSSEFrame {
  eventId: string | undefined;
  envelope: SSEEnvelope;
  payload: unknown;
}

export interface SSEFrame {
  id?: string;
  event: string;
  data: string;
}

// ── Response validator helpers ────────────────────────────────────────

type ValidationResult<T> =
  | { valid: true; value: T }
  | { valid: false; error: string };

function formatZodIssues(label: string, issues: z.ZodIssue[]): string {
  const details = issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  return `Invalid ${label}: ${details}`;
}

function validateWith<T>(
  schema: z.ZodType<T>,
  label: string,
  data: unknown,
): ValidationResult<T> {
  const result = schema.safeParse(data);
  if (result.success) return { valid: true, value: result.data };
  return { valid: false, error: formatZodIssues(label, result.error.issues) };
}

// ── HTTP Response Validators ──────────────────────────────────────────

export function validateAvailabilityResponse(
  data: unknown,
): ValidationResult<AvailabilityResponse> {
  return validateWith(AvailabilityResponseSchema, "AvailabilityResponse", data);
}

export function validateStartRunResponse(
  data: unknown,
): ValidationResult<StartRunResponse> {
  return validateWith(StartRunResponseSchema, "StartRunResponse", data);
}

export function validatePlanFixResponse(
  data: unknown,
): ValidationResult<PlanFixResponse> {
  return validateWith(PlanFixResponseSchema, "PlanFixResponse", data);
}

export function validateIgnoreResponse(
  data: unknown,
): ValidationResult<IgnoreResponse> {
  return validateWith(IgnoreResponseSchema, "IgnoreResponse", data);
}

export function validateVerifyResponse(
  data: unknown,
): ValidationResult<VerifyResponse> {
  return validateWith(VerifyResponseSchema, "VerifyResponse", data);
}

export function validateHarnessReportResponse(
  data: unknown,
): ValidationResult<HarnessReport> {
  return validateWith(HarnessReportSchema, "HarnessReport", data);
}

export function validateHarnessReportArrayResponse(
  data: unknown,
): ValidationResult<HarnessReport[]> {
  const arrSchema = z.array(HarnessReportSchema);
  const result = arrSchema.safeParse(data);
  if (result.success) return { valid: true, value: result.data as HarnessReport[] };
  return { valid: false, error: formatZodIssues("HarnessReport[]", result.error.issues) };
}

export function validateRunProgressResponse(
  data: unknown,
): ValidationResult<z.infer<typeof HarnessRunProgressSchema>> {
  return validateWith(HarnessRunProgressSchema, "HarnessRunProgress", data);
}

export function validateCancelResponse(
  data: unknown,
): ValidationResult<CancelResponse> {
  return validateWith(CancelResponseSchema, "CancelResponse", data);
}
