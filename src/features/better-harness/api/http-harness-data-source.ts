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
  SSEEvent,
} from "../schemas/harness-api";

export interface HttpHarnessDataSourceConfig {
  baseUrl: string;
  serverKey: string;
  projectKey: string;
  projectDir?: string;
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
   * Generic fetch + Zod validation.
   * - 204 / 404 → returns `undefined` (resource does not exist yet)
   * - 401/403 with onAuthFailure → coalesces concurrent refreshes, retries ONCE
   * - Other non-ok → throws Error with status and body
   * - OK → validates JSON against the provided Zod validator
   */
  private async validatedRequest<T>(
    method: string,
    path: string,
    validate: (data: unknown) => { valid: true; value: T } | { valid: false; error: string },
    body?: unknown,
    signal?: AbortSignal,
    isRetry?: boolean
  ): Promise<T> {
    const url = `${this.apiBase}${path}`;
    const res = await fetch(url, {
      method,
      headers: this.getHeaders(),
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });

    // 204/404 → expected empty state, not an error
    if (res.status === 204 || res.status === 404) return undefined as T;

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

    return (validation as { valid: true; value: T }).value;
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
      return await this.validatedRequest(
        "GET",
        "/availability",
        validateAvailabilityResponse
      );
    } catch (err) {
      return {
        available: false,
        reason: err instanceof Error ? err.message : "Failed to check availability",
      };
    }
  }

  async getReport(): Promise<HarnessReport | undefined> {
    // 404/204 → undefined (validatedRequest returns undefined)
    // Other errors → propagate to caller
    return this.validatedRequest(
      "GET",
      "/report",
      validateHarnessReportResponse
    );
  }

  async getHistory(): Promise<HarnessReport[]> {
    return this.validatedRequest(
      "GET",
      "/history",
      validateHarnessReportArrayResponse
    );
  }

  async getRunProgress(): Promise<HarnessRunProgress | undefined> {
    return this.validatedRequest(
      "GET",
      "/runs/current",
      validateRunProgressResponse
    );
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
        this.runAbortController.signal
      );
      if (result.accepted && result.runId) {
        this.currentRunId = result.runId;
      }
      return { accepted: result.accepted, runId: result.runId };
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
      { findingIds: [findingId] }
    );

    if (result.results && result.results.length > 0) {
      return {
        accepted: result.results[0].accepted,
        repairSessionId: result.results[0].repairSessionId,
      };
    }

    return {
      accepted: result.accepted,
      repairSessionId: result.repairSessionId,
    };
  }

  async verify(findingId: string): Promise<{ accepted: boolean }> {
    const result = await this.validatedRequest(
      "POST",
      "/findings/verify",
      validateVerifyResponse,
      { findingIds: [findingId] }
    );

    if (result.results && result.results.length > 0) {
      return { accepted: result.results[0].accepted };
    }

    return { accepted: result.accepted };
  }

  async ignore(findingId: string, reason: string): Promise<{ accepted: boolean }> {
    const result = await this.validatedRequest(
      "POST",
      "/findings/ignore",
      validateIgnoreResponse,
      { findingIds: [findingId], reason }
    );

    if (result.results && result.results.length > 0) {
      return { accepted: result.results[0].accepted };
    }

    return { accepted: result.accepted };
  }

  async batchPlanFix(findingIds: string[]): Promise<BatchPlanFixResult[]> {
    if (findingIds.length === 0) return [];

    const result = await this.validatedRequest(
      "POST",
      "/findings/plan-fix",
      validatePlanFixResponse,
      { findingIds }
    );

    if (result.results) {
      return result.results.map((r) => ({
        findingId: r.findingId,
        accepted: r.accepted,
        repairSessionId: r.repairSessionId,
        error: r.error,
      }));
    }

    return findingIds.map((id) => ({
      findingId: id,
      accepted: result.accepted,
      repairSessionId: result.repairSessionId,
    }));
  }

  async batchIgnore(
    findingIds: string[],
    reason: string
  ): Promise<BatchIgnoreResult[]> {
    if (findingIds.length === 0) return [];

    const result = await this.validatedRequest(
      "POST",
      "/findings/ignore",
      validateIgnoreResponse,
      { findingIds, reason }
    );

    if (result.results) {
      return result.results.map((r) => ({
        findingId: r.findingId,
        accepted: r.accepted,
        error: r.error,
      }));
    }

    return findingIds.map((id) => ({
      findingId: id,
      accepted: result.accepted,
    }));
  }

  async batchVerify(findingIds: string[]): Promise<BatchVerifyResult[]> {
    if (findingIds.length === 0) return [];

    const result = await this.validatedRequest(
      "POST",
      "/findings/verify",
      validateVerifyResponse,
      { findingIds }
    );

    if (result.results) {
      return result.results.map((r) => ({
        findingId: r.findingId,
        accepted: r.accepted,
        error: r.error,
      }));
    }

    return findingIds.map((id) => ({
      findingId: id,
      accepted: result.accepted,
    }));
  }

  async cancel(): Promise<void> {
    // Cancel via the current run ID first
    if (this.currentRunId) {
      await this.validatedRequest(
        "POST",
        `/runs/${encodeURIComponent(this.currentRunId)}/cancel`,
        validateCancelResponse
      );
    }

    // Cancel any in-flight regeneration
    if (this.runAbortController) {
      this.runAbortController.abort();
      this.runAbortController = null;
    }

    // Cancel fetch-based SSE reader
    this.cancelSSE();

    this.currentRunId = undefined;
  }

  // ── Fetch-based SSE (supports Authorization headers) ────────────────

  private cancelSSE(): void {
    if (this.sseAbortController) {
      this.sseAbortController.abort();
      this.sseAbortController = null;
    }
  }

  /**
   * Subscribe to SSE progress events using fetch() so we can pass
   * Authorization headers that native EventSource cannot set.
   *
   * Returns an unsubscribe function.
   */
  subscribeToProgress(
    runId: string,
    onEvent: (event: SSEEvent) => void,
    onError?: (error: Event) => void
  ): () => void {
    // Cancel any existing SSE connection
    this.cancelSSE();

    const abortController = new AbortController();
    this.sseAbortController = abortController;
    const signal = abortController.signal;

    const url = `${this.apiBase}/runs/${encodeURIComponent(runId)}/events`;

    const startStream = async () => {
      try {
        const response = await fetch(url, {
          headers: {
            ...this.getHeaders(),
            Accept: "text/event-stream",
          },
          signal,
        });

        if (!response.ok) {
          throw new Error(`SSE connection failed: ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("SSE response body is not readable");
        }

        const decoder = new TextDecoder();
        let buffer = "";
        let currentEventType = "message";
        let currentData = "";

        const processLines = (text: string) => {
          const lines = text.split("\n");
          for (const line of lines) {
            if (line.startsWith("event: ")) {
              currentEventType = line.slice(7).trim();
            } else if (line.startsWith("data: ")) {
              currentData = line.slice(6);
            } else if (line === "" && currentData) {
              // Empty line = end of event, dispatch
              try {
                const parsed = JSON.parse(currentData);
                onEvent({ type: currentEventType, data: parsed });
              } catch {
                onEvent({ type: currentEventType, data: currentData });
              }
              currentEventType = "message";
              currentData = "";
            }
          }
        };

        while (!signal.aborted) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Split on double newline (SSE event boundary)
          const parts = buffer.split("\n\n");
          buffer = parts.pop() || "";

          for (const part of parts) {
            processLines(part);
          }
        }

        // Process remaining buffer
        if (buffer.trim()) {
          processLines(buffer);
        }
      } catch {
        if (signal.aborted) return; // Intentional cancellation, not an error
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
}

export type { SSEEvent };
