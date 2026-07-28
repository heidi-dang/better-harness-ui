import {
  HarnessDataSource,
  BatchPlanFixResult,
  BatchIgnoreResult,
  BatchVerifyResult,
} from "./harness-data-source";
import { HarnessReport, HarnessRunProgress } from "../types";
import {
  validateAvailabilityResponse,
  validateStartRunResponse,
  validatePlanFixResponse,
  validateIgnoreResponse,
  validateVerifyResponse,
  validateCancelResponse,
  validateHarnessReportResponse,
  validateHarnessReportArrayResponse,
  validateRunProgressResponse,
  SSEEnvelopeSchema,
  getPayloadValidator,
  type SSEEnvelope,
} from "../schemas/harness-api";

export interface HttpHarnessDataSourceConfig {
  baseUrl: string;
  serverKey: string;
  projectKey: string;
  /** Cosmetic-only display path for the UI. Never used for API authorisation. */
  displayProjectPath?: string;
  authToken?: string;
  /**
   * Called when a 401/403 response is received.
   * Return a new token to retry, or undefined to fail.
   * Concurrent 401s are coalesced into a single refresh call.
   */
  onAuthFailure?: () => Promise<string | undefined>;
}

export class HttpHarnessDataSource implements HarnessDataSource {
  private baseUrl: string;
  private serverKey: string;
  private encodedServerKey: string;
  private projectKey: string;
  private encodedProjectKey: string;
  private authToken?: string;
  private onAuthFailure?: () => Promise<string | undefined>;
  private currentRunId: string | undefined;
  private runAbortController: AbortController | null = null;

  /** Active fetch-based SSE reader controller for cancellation */
  private sseAbortController: AbortController | null = null;
  /** Flag to prevent multiple concurrent auth refresh calls */
  private authRefreshInFlight: Promise<string | undefined> | null = null;

  /** Latest validated SSE event ID for replay (per active run) */
  private lastValidEventId: string | undefined;

  constructor(config: HttpHarnessDataSourceConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.serverKey = config.serverKey;
    this.encodedServerKey = encodeURIComponent(config.serverKey);
    this.projectKey = config.projectKey;
    this.encodedProjectKey = encodeURIComponent(config.projectKey);
    this.authToken = config.authToken;
    this.onAuthFailure = config.onAuthFailure;
  }

  private get apiBase(): string {
    return `${this.baseUrl}/api/v1/servers/${this.encodedServerKey}/projects/${this.encodedProjectKey}/better-harness`;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.authToken) {
      headers["Authorization"] = `Bearer ${this.authToken}`;
    }
    return headers;
  }

  /**
   * Generic fetch + Zod validation with explicit empty-state results.
   *
   * - 204 / 404 → ValidatedHttpResult.kind = "empty"
   * - 401/403 with onAuthFailure → coalesces concurrent refreshes, retries ONCE
   * - Other non-ok → throws Error
   * - OK → validates JSON, returns ValidatedHttpResult.kind = "value"
   */
  private async validatedRequest<T>(
    method: string,
    path: string,
    validate: (data: unknown) => { valid: true; value: T } | { valid: false; error: string },
    body?: unknown,
    signal?: AbortSignal,
    isRetry?: boolean,
  ): Promise<ValidatedHttpResult<T>> {
    const url = `${this.apiBase}${path}`;
    const res = await fetch(url, {
      method,
      headers: this.getHeaders(),
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });

    // 204/404 → explicit empty, not undefined as T
    if (res.status === 204) return { kind: "empty", status: 204 };
    if (res.status === 404) return { kind: "empty", status: 404 };

    // 401/403 → attempt auth refresh once
    if ((res.status === 401 || res.status === 403) && this.onAuthFailure && !isRetry) {
      const newToken = await this.refreshAuth();
      if (newToken) {
        this.authToken = newToken;
        return this.validatedRequest<T>(method, path, validate, body, signal, true);
      }
    }

    if (!res.ok) {
      let errorBody: string;
      try {
        errorBody = await res.text();
      } catch {
        errorBody = "";
      }
      throw new Error(`Harness API error (${res.status}): ${errorBody || res.statusText}`);
    }

    const json: unknown = await res.json();
    const validation = validate(json);
    if (!validation.valid) {
      throw new Error(`Harness API schema error: ${(validation as { valid: false; error: string }).error}`);
    }

    return { kind: "value", value: (validation as { valid: true; value: T }).value };
  }

  /**
   * Coalesce concurrent auth refresh calls into a single in-flight promise.
   * This prevents multiple callers from each triggering `onAuthFailure`
   * when they all receive 401 from the same expired token.
   */
  private async refreshAuth(): Promise<string | undefined> {
    if (!this.onAuthFailure) return undefined;

    if (!this.authRefreshInFlight) {
      this.authRefreshInFlight = this.onAuthFailure().finally(() => {
        this.authRefreshInFlight = null;
      });
    }

    return this.authRefreshInFlight;
  }

  // ── Data Source Implementation ──────────────────────────────────────

  async availability(): Promise<{ available: boolean; reason?: string }> {
    try {
      const result = await this.validatedRequest(
        "GET",
        "/availability",
        validateAvailabilityResponse,
      );
      if (result.kind === "empty") {
        return { available: false, reason: "No availability response" };
      }
      return result.value;
    } catch (err) {
      return {
        available: false,
        reason: err instanceof Error ? err.message : "Failed to check availability",
      };
    }
  }

  async getReport(): Promise<HarnessReport | undefined> {
    const result = await this.validatedRequest(
      "GET",
      "/report",
      validateHarnessReportResponse,
    );
    if (result.kind === "empty") return undefined;
    return result.value;
  }

  async getHistory(): Promise<HarnessReport[]> {
    const result = await this.validatedRequest(
      "GET",
      "/history",
      validateHarnessReportArrayResponse,
    );
    if (result.kind === "empty") return [];
    return result.value;
  }

  async getRunProgress(runId?: string): Promise<HarnessRunProgress | undefined> {
    // Use exact run endpoint when runId is known; fall back to /runs/current for recovery
    const path = runId
      ? `/runs/${encodeURIComponent(runId)}`
      : "/runs/current";

    const result = await this.validatedRequest(
      "GET",
      path,
      validateRunProgressResponse,
    );
    if (result.kind === "empty") return undefined;
    return result.value;
  }

  async regenerate(): Promise<{ accepted: boolean; runId?: string }> {
    this.runAbortController = new AbortController();
    try {
      const result = await this.validatedRequest(
        "POST",
        "/runs",
        validateStartRunResponse,
        {
          mode: "full",
          sourceRevision: "current",
          collectors: ["customization", "sessions", "foundations"],
        },
        this.runAbortController.signal,
      );

      if (result.kind === "empty") {
        throw new Error("Regeneration request returned empty (204/404)");
      }

      // Clear any previous replay state for the new run
      this.lastValidEventId = undefined;

      if (result.value.accepted && result.value.runId) {
        this.currentRunId = result.value.runId;
      }
      return { accepted: result.value.accepted, runId: result.value.runId };
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        return { accepted: false };
      }
      throw err;
    }
  }

  async planFix(findingId: string): Promise<{ accepted: boolean; repairSessionId?: string }> {
    const result = await this.validatedRequest(
      "POST",
      "/findings/plan-fix",
      validatePlanFixResponse,
      { findingIds: [findingId] },
    );

    if (result.kind === "empty") {
      throw new Error("Plan-fix response is empty (204/404)");
    }

    if (result.value.results && result.value.results.length > 0) {
      return {
        accepted: result.value.results[0].accepted,
        repairSessionId: result.value.results[0].repairSessionId,
      };
    }

    return {
      accepted: result.value.accepted,
      repairSessionId: result.value.repairSessionId,
    };
  }

  async verify(findingId: string): Promise<{ accepted: boolean }> {
    const result = await this.validatedRequest(
      "POST",
      "/findings/verify",
      validateVerifyResponse,
      { findingIds: [findingId] },
    );

    if (result.kind === "empty") {
      throw new Error("Verify response is empty (204/404)");
    }

    if (result.value.results && result.value.results.length > 0) {
      return { accepted: result.value.results[0].accepted };
    }

    return { accepted: result.value.accepted };
  }

  async ignore(findingId: string, reason: string): Promise<{ accepted: boolean }> {
    const result = await this.validatedRequest(
      "POST",
      "/findings/ignore",
      validateIgnoreResponse,
      { findingIds: [findingId], reason },
    );

    if (result.kind === "empty") {
      throw new Error("Ignore response is empty (204/404)");
    }

    if (result.value.results && result.value.results.length > 0) {
      return { accepted: result.value.results[0].accepted };
    }

    return { accepted: result.value.accepted };
  }

  async batchPlanFix(findingIds: string[]): Promise<BatchPlanFixResult[]> {
    if (findingIds.length === 0) return [];

    const result = await this.validatedRequest(
      "POST",
      "/findings/plan-fix",
      validatePlanFixResponse,
      { findingIds },
    );

    if (result.kind === "empty") {
      throw new Error("Batch plan-fix response is empty (204/404)");
    }

    if (result.value.results) {
      return result.value.results.map((r) => ({
        findingId: r.findingId,
        accepted: r.accepted,
        repairSessionId: r.repairSessionId,
        error: r.error,
      }));
    }

    return findingIds.map((id) => ({
      findingId: id,
      accepted: result.value.accepted,
      repairSessionId: result.value.repairSessionId,
    }));
  }

  async batchIgnore(
    findingIds: string[],
    reason: string,
  ): Promise<BatchIgnoreResult[]> {
    if (findingIds.length === 0) return [];

    const result = await this.validatedRequest(
      "POST",
      "/findings/ignore",
      validateIgnoreResponse,
      { findingIds, reason },
    );

    if (result.kind === "empty") {
      throw new Error("Batch ignore response is empty (204/404)");
    }

    if (result.value.results) {
      return result.value.results.map((r) => ({
        findingId: r.findingId,
        accepted: r.accepted,
        error: r.error,
      }));
    }

    return findingIds.map((id) => ({
      findingId: id,
      accepted: result.value.accepted,
    }));
  }

  async batchVerify(findingIds: string[]): Promise<BatchVerifyResult[]> {
    if (findingIds.length === 0) return [];

    const result = await this.validatedRequest(
      "POST",
      "/findings/verify",
      validateVerifyResponse,
      { findingIds },
    );

    if (result.kind === "empty") {
      throw new Error("Batch verify response is empty (204/404)");
    }

    if (result.value.results) {
      return result.value.results.map((r) => ({
        findingId: r.findingId,
        accepted: r.accepted,
        error: r.error,
      }));
    }

    return findingIds.map((id) => ({
      findingId: id,
      accepted: result.value.accepted,
    }));
  }

  async cancel(): Promise<void> {
    // Cancel via the current run ID — exact run, validated response
    if (!this.currentRunId) return;

    const result = await this.validatedRequest(
      "POST",
      `/runs/${encodeURIComponent(this.currentRunId)}/cancel`,
      validateCancelResponse,
    );

    if (result.kind === "empty") {
      // FlowDeck contract: cancel returns { accepted: boolean } — empty is failure
      throw new Error("Cancel response is empty (204/404) — cancellation not confirmed");
    }

    // validateCancelResponse already requires accepted: true
    // FlowDeck CancelRunResponseSchema: { accepted: boolean, error?: string }
    // We validated with accepted: literal(true)

    // Cancel any in-flight regeneration
    if (this.runAbortController) {
      this.runAbortController.abort();
      this.runAbortController = null;
    }

    // Cancel fetch-based SSE reader
    this.cancelSSE();

    // Clear run ID only after confirmed cancellation
    this.currentRunId = undefined;
    this.lastValidEventId = undefined;
  }

  // ── Fetch-based SSE (supports Authorization headers) ────────────────

  private cancelSSE(): void {
    if (this.sseAbortController) {
      this.sseAbortController.abort();
      this.sseAbortController = null;
    }
  }

  /**
   * Incremental SSE parser state.
   */
  private sseParserState: {
    buffer: string;
    currentEventType: string;
    currentData: string[];
    currentId: string | undefined;
  } | null = null;

  /**
   * Reset the SSE parser state for a new stream.
   */
  private resetSSEParser(): void {
    this.sseParserState = {
      buffer: "",
      currentEventType: "",
      currentData: [],
      currentId: undefined,
    };
  }

  /**
   * Parse an SSE frame line by line according to the SSE specification:
   *   - Lines beginning with ":" are comments (ignored)
   *   - "event:" sets the event type
   *   - "data:" appends to the data buffer
   *   - "id:" sets the event ID
   *   - Empty line dispatches the event
   *
   * Multiple data lines are joined with "\n".
   */
  private parseSSEChunk(
    chunk: string,
    onFrame: (frame: { id?: string; event: string; data: string[] }) => void,
  ): void {
    if (!this.sseParserState) return;

    // Normalize CRLF to LF (SSE spec allows both)
    this.sseParserState.buffer += chunk.replace(/\r\n/g, "\n");

    // Split on newlines, handling LF boundaries
    let lineStart = 0;
    const buf = this.sseParserState.buffer;

    for (let i = 0; i < buf.length; i++) {
      if (buf[i] !== "\n") continue;

      const line = buf.slice(lineStart, i);
      lineStart = i + 1;

      if (line === "") {
        // Empty line = end of event, dispatch
        const eventType = this.sseParserState.currentEventType || "message";
        if (this.sseParserState.currentData.length > 0) {
          onFrame({
            id: this.sseParserState.currentId,
            event: eventType,
            data: this.sseParserState.currentData,
          });
        }
        this.sseParserState.currentEventType = "";
        this.sseParserState.currentData = [];
        this.sseParserState.currentId = undefined;
      } else if (line.startsWith(":")) {
        // Comment line — ignore
      } else if (line.startsWith("event:")) {
        this.sseParserState.currentEventType = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        const dataValue = line.slice(5);
        // Leading space is stripped by convention
        this.sseParserState.currentData.push(dataValue.startsWith(" ") ? dataValue.slice(1) : dataValue);
      } else if (line.startsWith("id:")) {
        this.sseParserState.currentId = line.slice(3).trim() || undefined;
      }
      // Unknown fields: ignore per SSE spec
    }

    // Keep remaining partial line in buffer
    this.sseParserState.buffer = buf.slice(lineStart);
  }

  /**
   * Validate an SSE frame's data line as a FlowDeck envelope, then
   * extract the inner payload for the consumer.
   *
   * Returns null if the frame should be discarded (malformed, wrong run, etc.)
   */
  private validateSSEFrame(
    frame: { id?: string; event: string; data: string[] },
    expectedRunId?: string,
  ): { eventId: string | undefined; type: SSESupportedEvent; payload: unknown } | null {
    // Join multiple data lines with newline
    const rawData = frame.data.join("\n");

    // Parse JSON from the data field
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawData);
    } catch {
      // Malformed JSON: no state update
      return null;
    }

    // Validate envelope structure
    const envelopeResult = SSEEnvelopeSchema.safeParse(parsed);
    if (!envelopeResult.success) {
      return null;
    }

    const envelope: SSEEnvelope = envelopeResult.data;

    // Named SSE event must match envelope type
    if (envelope.type !== frame.event) {
      return null;
    }

    // Validate payload against event-specific schema
    const payloadValidator = getPayloadValidator(envelope.type);
    const payloadResult = payloadValidator.safeParse(envelope.data || {});
    if (!payloadResult.success) {
      return null;
    }

    // Run ID validation: if the payload has a runId, it must match the expected run
    const payloadWithRunId = envelope.data as Record<string, unknown> | undefined;
    if (payloadWithRunId?.runId && expectedRunId && payloadWithRunId.runId !== expectedRunId) {
      return null;
    }

    return {
      eventId: frame.id,
      type: envelope.type,
      payload: payloadResult.data,
    };
  }

  /**
   * Subscribe to SSE progress events using fetch() so we can pass
   * Authorization headers that native EventSource cannot set.
   *
   * Returns an unsubscribe function.
   */
  subscribeToProgress(
    runId: string,
    onEvent: (event: { type: string; data: unknown }) => void,
    onError?: (error: Event) => void,
  ): () => void {
    // Cancel any existing SSE connection
    this.cancelSSE();
    this.resetSSEParser();

    const abortController = new AbortController();
    this.sseAbortController = abortController;
    const signal = abortController.signal;

    const url = `${this.apiBase}/runs/${encodeURIComponent(runId)}/events`;

    const startStream = async () => {
      try {
        // Build headers with optional Last-Event-ID for replay
        const headers: Record<string, string> = {
          ...this.getHeaders(),
          Accept: "text/event-stream",
        };
        if (this.lastValidEventId) {
          headers["Last-Event-ID"] = this.lastValidEventId;
        }

        const response = await fetch(url, { headers, signal });

        if (!response.ok) {
          throw new Error(`SSE connection failed: ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("SSE response body is not readable");
        }

        const decoder = new TextDecoder();

        while (!signal.aborted) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = decoder.decode(value, { stream: true });
          this.parseSSEChunk(text, (rawFrame) => {
            const validated = this.validateSSEFrame(rawFrame, runId);
            if (!validated) return;

            // Event ID deduplication
            if (validated.eventId) {
              const idNum = parseInt(validated.eventId, 10);
              const lastNum = this.lastValidEventId ? parseInt(this.lastValidEventId, 10) : -1;
              if (!isNaN(idNum) && idNum <= lastNum) {
                // Duplicate or older event ID — ignore
                return;
              }
              this.lastValidEventId = validated.eventId;
            }

            // Map FlowDeck envelope to consumer event
            if (validated.type === "run.progress") {
              onEvent({ type: "run.progress", data: validated.payload });
            } else if (
              validated.type === "report.completed" ||
              validated.type === "run.failed" ||
              validated.type === "run.cancelled"
            ) {
              onEvent({ type: validated.type, data: validated.payload });
            }
            // Other event types (heartbeat, connected, etc.) are silently consumed
          });
        }

        // Finalize decoder
        decoder.decode(); // flush
      } catch (err) {
        if (signal.aborted) return; // Intentional cancellation, not an error

        // Attempt auth refresh for 401/403
        if (
          (err as Error).message?.includes("401") ||
          (err as Error).message?.includes("403")
        ) {
          if (this.onAuthFailure && this.lastValidEventId) {
            try {
              const newToken = await this.refreshAuth();
              if (newToken) {
                this.authToken = newToken;
                // Retry once — preserve current replay state
                const retryResult = await this.retrySSE(runId, onEvent, onError, abortController.signal);
                if (retryResult) return;
              }
            } catch {
              // Refresh failed — fall through to onError
            }
          }
        }

        // Fall back to polling — no more retries for auth failures
        if (onError) {
          onError(new Event("error"));
        }
      }
    };

    startStream();

    return () => {
      abortController.abort();
      if (this.sseAbortController === abortController) {
        this.sseAbortController = null;
      }
    };
  }

  /**
   * Retry SSE stream with refreshed token. Returns true if retry succeeded
   * (stream connected), false if it should fall back to polling.
   */
  private async retrySSE(
    runId: string,
    onEvent: (event: { type: string; data: unknown }) => void,
    onError?: (error: Event) => void,
    outerSignal?: AbortSignal,
  ): Promise<boolean> {
    if (outerSignal?.aborted) return false;

    try {
      const headers: Record<string, string> = {
        ...this.getHeaders(),
        Accept: "text/event-stream",
      };
      if (this.lastValidEventId) {
        headers["Last-Event-ID"] = this.lastValidEventId;
      }

      const response = await fetch(
        `${this.apiBase}/runs/${encodeURIComponent(runId)}/events`,
        { headers, signal: outerSignal },
      );

      if (!response.ok) return false;

      const reader = response.body?.getReader();
      if (!reader) return false;

      // Stream reconnected — continue reading in a new fire-and-forget loop
      // (the original startStream has already returned on error)
      const decoder = new TextDecoder();
      this.readStream(reader, decoder, runId, onEvent, outerSignal);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Continuously read from an SSE stream, dispatching validated events.
   */
  private readStream(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    decoder: TextDecoder,
    runId: string,
    onEvent: (event: { type: string; data: unknown }) => void,
    signal?: AbortSignal,
  ): void {
    const readLoop = async () => {
      try {
        while (!signal?.aborted) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = decoder.decode(value, { stream: true });
          this.parseSSEChunk(text, (rawFrame) => {
            const validated = this.validateSSEFrame(rawFrame, runId);
            if (!validated) return;

            if (validated.eventId) {
              const idNum = parseInt(validated.eventId, 10);
              const lastNum = this.lastValidEventId ? parseInt(this.lastValidEventId, 10) : -1;
              if (!isNaN(idNum) && idNum <= lastNum) return;
              this.lastValidEventId = validated.eventId;
            }

            if (validated.type === "run.progress") {
              onEvent({ type: "run.progress", data: validated.payload });
            } else if (
              validated.type === "report.completed" ||
              validated.type === "run.failed" ||
              validated.type === "run.cancelled"
            ) {
              onEvent({ type: validated.type, data: validated.payload });
            }
          });
        }
        decoder.decode(); // flush
      } catch {
        if (signal?.aborted) return;
      }
    };
    readLoop();
  }
}
