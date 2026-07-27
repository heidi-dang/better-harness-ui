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
  projectDir: string;
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
  private projectDir: string;
  private encodedProjectDir: string;
  private runAbortController: AbortController | null = null;
  private progressEventSource: EventSource | null = null;

  constructor(config: HttpHarnessDataSourceConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.serverKey = config.serverKey;
    this.encodedServerKey = encodeURIComponent(config.serverKey);
    this.projectDir = config.projectDir;
    this.encodedProjectDir = encodeURIComponent(config.projectDir);
  }

  private get apiBase(): string {
    return `${this.baseUrl}/api/v1/servers/${this.encodedServerKey}/projects/${this.encodedProjectDir}/better-harness`;
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
      headers: { "Content-Type": "application/json" },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });

    if (!res.ok) {
      let errorBody: string;
      try {
        errorBody = await res.text();
      } catch {
        errorBody = "";
      }
      throw new Error(`Harness API error (${res.status}): ${errorBody || res.statusText}`);
    }

    if (res.status === 204) return undefined as T;

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

    // Also notify the server
    try {
      await this.jsonRequest<void>("POST", "/runs/current/cancel");
    } catch {
      // Best-effort cancellation; network errors are acceptable
    }
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

    const handleMessage = (event: MessageEvent) => {
      try {
        const parsed = JSON.parse(event.data) as SSEEvent;
        onEvent(parsed);
      } catch {
        onEvent({ type: "raw", data: event.data });
      }
    };

    eventSource.onmessage = handleMessage;
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
