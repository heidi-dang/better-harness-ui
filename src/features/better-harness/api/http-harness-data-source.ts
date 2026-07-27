import {
  HarnessDataSource,
  BatchPlanFixResult,
  BatchIgnoreResult,
  BatchVerifyResult,
} from "./harness-data-source";
import { HarnessReport, HarnessRunProgress } from "../types";

export interface HttpHarnessDataSourceConfig {
  baseUrl: string;
  serverKey: string;
  projectKey: string;
  projectDir?: string;
  authToken?: string;
}

interface PlanFixResponse {
  accepted: boolean;
  results?: Array<{
    findingId: string;
    accepted: boolean;
    repairSessionId?: string;
    error?: string;
  }>;
  repairSessionId?: string;
}

interface IgnoreResponse {
  accepted: boolean;
  results?: Array<{
    findingId: string;
    accepted: boolean;
    error?: string;
  }>;
}

interface VerifyResponse {
  accepted: boolean;
  results?: Array<{
    findingId: string;
    accepted: boolean;
    error?: string;
  }>;
}

interface StartRunResponse {
  accepted: boolean;
  runId?: string;
}

interface SSEEvent {
  type: string;
  data: unknown;
}

export class HttpHarnessDataSource implements HarnessDataSource {
  private baseUrl: string;
  private serverKey: string;
  private encodedServerKey: string;
  private projectKey: string;
  private encodedProjectKey: string;
  private authToken?: string;
  private currentRunId: string | undefined;
  private runAbortController: AbortController | null = null;
  private progressEventSource: EventSource | null = null;

  constructor(config: HttpHarnessDataSourceConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.serverKey = config.serverKey;
    this.encodedServerKey = encodeURIComponent(config.serverKey);
    this.projectKey = config.projectKey;
    this.encodedProjectKey = encodeURIComponent(config.projectKey);
    this.authToken = config.authToken;
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

  private async jsonRequest<T>(
    method: string,
    path: string,
    body?: unknown,
    signal?: AbortSignal
  ): Promise<T> {
    const url = `${this.apiBase}${path}`;
    const res = await fetch(url, {
      method,
      headers: this.getHeaders(),
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });

    if (res.status === 204 || res.status === 404) return undefined as T;

    if (!res.ok) {
      let errorBody: string;
      try {
        errorBody = await res.text();
      } catch {
        errorBody = "";
      }
      throw new Error(`Harness API error (${res.status}): ${errorBody || res.statusText}`);
    }

    return res.json() as Promise<T>;
  }

  async availability(): Promise<{ available: boolean; reason?: string }> {
    try {
      return await this.jsonRequest<{ available: boolean; reason?: string }>("GET", "/availability");
    } catch (err) {
      return {
        available: false,
        reason: err instanceof Error ? err.message : "Failed to check availability",
      };
    }
  }

  async getReport(): Promise<HarnessReport | undefined> {
    try {
      return await this.jsonRequest<HarnessReport | undefined>("GET", "/report");
    } catch {
      return undefined;
    }
  }

  async getHistory(): Promise<HarnessReport[]> {
    try {
      return await this.jsonRequest<HarnessReport[]>("GET", "/history");
    } catch {
      return [];
    }
  }

  async getRunProgress(): Promise<HarnessRunProgress | undefined> {
    try {
      return await this.jsonRequest<HarnessRunProgress>("GET", "/runs/current");
    } catch {
      return undefined;
    }
  }

  async regenerate(): Promise<{ accepted: boolean; runId?: string }> {
    this.runAbortController = new AbortController();
    try {
      const result = await this.jsonRequest<StartRunResponse>(
        "POST",
        "/runs",
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
    const result = await this.jsonRequest<PlanFixResponse>("POST", "/findings/plan-fix", {
      findingIds: [findingId],
    });

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
    const result = await this.jsonRequest<VerifyResponse>("POST", "/findings/verify", {
      findingIds: [findingId],
    });

    if (result.results && result.results.length > 0) {
      return { accepted: result.results[0].accepted };
    }

    return { accepted: result.accepted };
  }

  async ignore(findingId: string, reason: string): Promise<{ accepted: boolean }> {
    const result = await this.jsonRequest<IgnoreResponse>("POST", "/findings/ignore", {
      findingIds: [findingId],
      reason,
    });

    if (result.results && result.results.length > 0) {
      return { accepted: result.results[0].accepted };
    }

    return { accepted: result.accepted };
  }

  async batchPlanFix(findingIds: string[]): Promise<BatchPlanFixResult[]> {
    if (findingIds.length === 0) return [];

    const result = await this.jsonRequest<PlanFixResponse>("POST", "/findings/plan-fix", {
      findingIds,
    });

    if (result.results) {
      return result.results.map((r) => ({
        findingId: r.findingId,
        accepted: r.accepted,
        repairSessionId: r.repairSessionId,
        error: r.error,
      }));
    }

    // Fallback: single-item result without per-finding breakdown
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

    const result = await this.jsonRequest<IgnoreResponse>("POST", "/findings/ignore", {
      findingIds,
      reason,
    });

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

    const result = await this.jsonRequest<VerifyResponse>("POST", "/findings/verify", {
      findingIds,
    });

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
      try {
        await this.jsonRequest<void>("POST", `/runs/${encodeURIComponent(this.currentRunId)}/cancel`);
      } catch {
        // Best-effort cancellation
      }
    }

    // Cancel any in-flight regeneration
    if (this.runAbortController) {
      this.runAbortController.abort();
      this.runAbortController = null;
    }

    // Close SSE connection
    if (this.progressEventSource) {
      this.progressEventSource.close();
      this.progressEventSource = null;
    }

    this.currentRunId = undefined;
  }

  /**
   * Subscribe to SSE progress events for a run.
   * Returns an unsubscribe function.
   */
  subscribeToProgress(
    runId: string,
    onEvent: (event: SSEEvent) => void,
    onError?: (error: Event) => void
  ): () => void {
    // Close any existing connection
    if (this.progressEventSource) {
      this.progressEventSource.close();
    }

    const url = `${this.apiBase}/runs/${encodeURIComponent(runId)}/events`;
    const eventSource = new EventSource(url);
    this.progressEventSource = eventSource;

    // Named event listeners matching the SSE contract
    const eventTypes = ["run.queued", "run.started", "run.progress", "collector.started", "collector.completed", "analysis.started", "finding.created", "report.completed", "run.cancelled", "run.failed"];

    for (const type of eventTypes) {
      eventSource.addEventListener(type, ((e: MessageEvent) => {
        try {
          const parsed = JSON.parse(e.data) as SSEEvent;
          onEvent(parsed);
        } catch {
          onEvent({ type, data: e.data });
        }
      }) as EventListener);
    }

    // Fallback to onmessage for unnamed events
    eventSource.onmessage = (e: MessageEvent) => {
      try {
        const parsed = JSON.parse(e.data) as SSEEvent;
        onEvent(parsed);
      } catch {
        onEvent({ type: "raw", data: e.data });
      }
    };

    if (onError) {
      eventSource.onerror = onError;
    }

    return () => {
      eventSource.close();
      if (this.progressEventSource === eventSource) {
        this.progressEventSource = null;
      }
    };
  }
}

export type { SSEEvent };
