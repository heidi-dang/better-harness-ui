import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { HttpHarnessDataSource, HttpHarnessDataSourceConfig } from "./api/http-harness-data-source";

const BASE_CONFIG: HttpHarnessDataSourceConfig = {
  baseUrl: "http://localhost:8080",
  serverKey: "srv-01",
  projectKey: "test-project",
};

/**
 * Create a mock Response for SSE events from an array of string chunks.
 */
function sseResponseFromChunks(chunks: string[]): Response {
  const encoder = new TextEncoder();
  let index = 0;
  const mockReader = {
    read: vi.fn().mockImplementation(() => {
      if (index >= chunks.length) {
        return Promise.resolve({ done: true, value: undefined });
      }
      const value = encoder.encode(chunks[index]);
      index++;
      return Promise.resolve({ done: false, value });
    }),
    cancel: vi.fn(),
    releaseLock: vi.fn(),
  };
  return {
    ok: true,
    status: 200,
    body: { getReader: () => mockReader },
    headers: new Headers({ "Content-Type": "text/event-stream" }),
  } as unknown as Response;
}

/**
 * Build an SSE frame in FlowDeck envelope format.
 *
 * FlowDeck wire format:
 *   event: <type>
 *   data: {"type":"<type>","timestamp":"<iso>","data":<innerPayload>}
 *
 * The `id:` line is optional — include it for replay tests.
 */
function flowdeckEvent(
  eventType: string,
  innerPayload: Record<string, unknown>,
  timestamp = "2026-07-28T12:00:00.000Z",
  eventId?: string,
): string {
  const envelope = JSON.stringify({ type: eventType, timestamp, data: innerPayload });
  const idLine = eventId ? `id: ${eventId}\n` : "";
  return `${idLine}event: ${eventType}\ndata: ${envelope}\n\n`;
}

/**
 * Resolves when the callback fires. Used in SSE tests where `onEvent`
 * is called from a fire-and-forget async stream processor.
 */
function onCallGate() {
  let resolve: (value: unknown) => void;
  const gate = new Promise((r) => { resolve = r; });
  return { gate, resolve: resolve! };
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("Better Harness SSE", () => {
  let source: HttpHarnessDataSource;

  beforeEach(() => {
    source = new HttpHarnessDataSource(BASE_CONFIG);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── SSE Frame Parser ───────────────────────────────────────────────

  describe("SSE frame parser", () => {
    it("delivers a complete LF-framed event", async () => {
      const payload = { runId: "r1", status: "running", progressPercent: 50 };
      const response = sseResponseFromChunks([
        flowdeckEvent("run.progress", payload),
      ]);
      vi.spyOn(global, "fetch").mockResolvedValue(response);

      const { gate, resolve } = onCallGate();
      const onEvent = vi.fn().mockImplementation(() => resolve(undefined));
      const unsubscribe = source.subscribeToProgress("r1", onEvent);

      await gate;
      expect(onEvent).toHaveBeenCalledTimes(1);
      expect(onEvent).toHaveBeenCalledWith({
        type: "run.progress",
        data: payload,
      });
      unsubscribe();
    });

    it("delivers a complete CRLF-framed event", async () => {
      const payload = { runId: "r1" };
      const envelope = JSON.stringify({
        type: "report.completed",
        timestamp: "2026-07-28T12:00:00.000Z",
        data: payload,
      });
      const crlfChunk = "event: report.completed\r\ndata: " + envelope + "\r\n\r\n";
      const response = sseResponseFromChunks([crlfChunk]);
      vi.spyOn(global, "fetch").mockResolvedValue(response);

      const { gate, resolve } = onCallGate();
      const onEvent = vi.fn().mockImplementation(() => resolve(undefined));
      const unsubscribe = source.subscribeToProgress("r1", onEvent);

      await gate;
      expect(onEvent).toHaveBeenCalledWith({
        type: "report.completed",
        data: payload,
      });
      unsubscribe();
    });

    it("delivers multiple events in one chunk", async () => {
      const response = sseResponseFromChunks([
        flowdeckEvent("run.progress", { runId: "r1", status: "running", progressPercent: 30 }) +
        flowdeckEvent("run.progress", { runId: "r1", status: "running", progressPercent: 60 }),
      ]);
      vi.spyOn(global, "fetch").mockResolvedValue(response);

      const { gate, resolve } = onCallGate();
      let callCount = 0;
      const onEvent = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount >= 2) resolve(undefined);
      });
      const unsubscribe = source.subscribeToProgress("r1", onEvent);

      await gate;
      expect(onEvent).toHaveBeenCalledTimes(2);
      unsubscribe();
    });

    it("handles one event split across two chunks", async () => {
      const envelope = JSON.stringify({
        type: "run.progress",
        timestamp: "2026-07-28T12:00:00.000Z",
        data: { runId: "r1", status: "running" },
      });
      const mid = Math.ceil(envelope.length / 2);
      const part1 = `event: run.progress\ndata: ${envelope.slice(0, mid)}`;
      const part2 = `${envelope.slice(mid)}\n\n`;
      const response = sseResponseFromChunks([part1, part2]);
      vi.spyOn(global, "fetch").mockResolvedValue(response);

      const { gate, resolve } = onCallGate();
      const onEvent = vi.fn().mockImplementation(() => resolve(undefined));
      const unsubscribe = source.subscribeToProgress("r1", onEvent);

      await gate;
      expect(onEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: "run.progress" }),
      );
      unsubscribe();
    });

    it("handles one event split across several chunks", async () => {
      const envelope = JSON.stringify({
        type: "run.progress",
        timestamp: "2026-07-28T12:00:00.000Z",
        data: { runId: "r1", status: "running" },
      });
      const response = sseResponseFromChunks([
        "event: ru",
        "n.progress\nda",
        `ta: ${envelope.slice(0, 15)}`,
        `${envelope.slice(15)}\n\n`,
      ]);
      vi.spyOn(global, "fetch").mockResolvedValue(response);

      const { gate, resolve } = onCallGate();
      const onEvent = vi.fn().mockImplementation(() => resolve(undefined));
      const unsubscribe = source.subscribeToProgress("r1", onEvent);

      await gate;
      expect(onEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: "run.progress" }),
      );
      unsubscribe();
    });

    it("handles multiple data lines joined correctly", async () => {
      // Multiple data: lines within one event are joined with "\n"
      const response = sseResponseFromChunks([
        "event: run.progress\ndata: {\"type\":\"run.progress\"\ndata: ,\"timestamp\":\"...\",\"data\":{}}\n\n",
      ]);
      vi.spyOn(global, "fetch").mockResolvedValue(response);

      const onEvent = vi.fn();
      const unsubscribe = source.subscribeToProgress("r1", onEvent);

      // The invalid JSON from concatenated fragments should fail validation
      await new Promise<void>((r) => setTimeout(r, 0));
      expect(onEvent).not.toHaveBeenCalled();
      unsubscribe();
    });

    it("ignores comment lines", async () => {
      const response = sseResponseFromChunks([
        ": this is a comment\n" +
        flowdeckEvent("run.progress", { runId: "r1", status: "running" }),
      ]);
      vi.spyOn(global, "fetch").mockResolvedValue(response);

      const { gate, resolve } = onCallGate();
      const onEvent = vi.fn().mockImplementation(() => resolve(undefined));
      const unsubscribe = source.subscribeToProgress("r1", onEvent);

      await gate;
      expect(onEvent).toHaveBeenCalledTimes(1);
      unsubscribe();
    });

    it("retains incomplete final frame", async () => {
      const response = sseResponseFromChunks([
        "event: run.progress\ndata: {\"type\":\"run.progress\"",
      ]);
      vi.spyOn(global, "fetch").mockResolvedValue(response);

      const onEvent = vi.fn();
      const unsubscribe = source.subscribeToProgress("r1", onEvent);

      await new Promise<void>((r) => setTimeout(r, 0));
      expect(onEvent).not.toHaveBeenCalled();
      unsubscribe();
    });

    it("rejects malformed JSON in the data line", async () => {
      const response = sseResponseFromChunks([
        "event: run.progress\ndata: this is not json\n\n",
      ]);
      vi.spyOn(global, "fetch").mockResolvedValue(response);

      const onEvent = vi.fn();
      const unsubscribe = source.subscribeToProgress("r1", onEvent);

      await new Promise<void>((r) => setTimeout(r, 0));
      expect(onEvent).not.toHaveBeenCalled();
      unsubscribe();
    });

    it("delivers run.progress event with nested backend payload", async () => {
      const payload = {
        runId: "r1",
        status: "running",
        stage: "Analyzing sessions",
        progressPercent: 64,
        startedAt: "2026-07-28T00:00:00Z",
      };
      const response = sseResponseFromChunks([
        flowdeckEvent("run.progress", payload),
      ]);
      vi.spyOn(global, "fetch").mockResolvedValue(response);

      const { gate, resolve } = onCallGate();
      const onEvent = vi.fn().mockImplementation(() => resolve(undefined));
      const unsubscribe = source.subscribeToProgress("r1", onEvent);

      await gate;
      expect(onEvent).toHaveBeenCalledWith({
        type: "run.progress",
        data: expect.objectContaining({
          runId: "r1",
          status: "running",
        }),
      });
      unsubscribe();
    });
  });

  // ── SSE Contract ───────────────────────────────────────────────────

  describe("SSE contract", () => {
    it("rejects named event that does not match envelope type", async () => {
      // event says "report.completed" but envelope.type says "run.progress"
      const mismatched = "event: report.completed\ndata: " + JSON.stringify({
        type: "run.progress",
        timestamp: "2026-07-28T12:00:00.000Z",
        data: { runId: "r1" },
      }) + "\n\n";
      const response = sseResponseFromChunks([mismatched]);
      vi.spyOn(global, "fetch").mockResolvedValue(response);

      const onEvent = vi.fn();
      const unsubscribe = source.subscribeToProgress("r1", onEvent);

      await new Promise<void>((r) => setTimeout(r, 0));
      expect(onEvent).not.toHaveBeenCalled();
      unsubscribe();
    });

    it("rejects wrong run ID", async () => {
      const response = sseResponseFromChunks([
        flowdeckEvent("run.progress", { runId: "wrong-run", status: "running" }),
      ]);
      vi.spyOn(global, "fetch").mockResolvedValue(response);

      const onEvent = vi.fn();
      const unsubscribe = source.subscribeToProgress("r1", onEvent);

      await new Promise<void>((r) => setTimeout(r, 0));
      expect(onEvent).not.toHaveBeenCalled();
      unsubscribe();
    });

    it("delivers valid run.progress for correct run ID", async () => {
      const response = sseResponseFromChunks([
        flowdeckEvent("run.progress", { runId: "r1", status: "running" }),
      ]);
      vi.spyOn(global, "fetch").mockResolvedValue(response);

      const { gate, resolve } = onCallGate();
      const onEvent = vi.fn().mockImplementation(() => resolve(undefined));
      const unsubscribe = source.subscribeToProgress("r1", onEvent);

      await gate;
      expect(onEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: "run.progress" }),
      );
      unsubscribe();
    });

    it("handles report.completed terminally", async () => {
      const response = sseResponseFromChunks([
        flowdeckEvent("report.completed", { runId: "r1" }),
      ]);
      vi.spyOn(global, "fetch").mockResolvedValue(response);

      const { gate, resolve } = onCallGate();
      const onEvent = vi.fn().mockImplementation(() => resolve(undefined));
      const unsubscribe = source.subscribeToProgress("r1", onEvent);

      await gate;
      expect(onEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: "report.completed" }),
      );
      unsubscribe();
    });

    it("handles run.failed terminally", async () => {
      const response = sseResponseFromChunks([
        flowdeckEvent("run.failed", { runId: "r1", errorMessage: "Failed" }),
      ]);
      vi.spyOn(global, "fetch").mockResolvedValue(response);

      const { gate, resolve } = onCallGate();
      const onEvent = vi.fn().mockImplementation(() => resolve(undefined));
      const unsubscribe = source.subscribeToProgress("r1", onEvent);

      await gate;
      expect(onEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: "run.failed" }),
      );
      unsubscribe();
    });

    it("handles run.cancelled terminally", async () => {
      const response = sseResponseFromChunks([
        flowdeckEvent("run.cancelled", { runId: "r1" }),
      ]);
      vi.spyOn(global, "fetch").mockResolvedValue(response);

      const { gate, resolve } = onCallGate();
      const onEvent = vi.fn().mockImplementation(() => resolve(undefined));
      const unsubscribe = source.subscribeToProgress("r1", onEvent);

      await gate;
      expect(onEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: "run.cancelled" }),
      );
      unsubscribe();
    });
  });

  // ── Replay and event ID tracking ───────────────────────────────────

  describe("Replay and Event ID", () => {
    it("ignores duplicate event ID", async () => {
      const response = sseResponseFromChunks([
        flowdeckEvent("run.progress", { runId: "r1", status: "running", progressPercent: 30 }, "2026-07-28T12:00:00.000Z", "1") +
        flowdeckEvent("run.progress", { runId: "r1", status: "running", progressPercent: 60 }, "2026-07-28T12:00:01.000Z", "1"),
      ]);
      vi.spyOn(global, "fetch").mockResolvedValue(response);

      const { gate, resolve } = onCallGate();
      let callCount = 0;
      const onEvent = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount >= 1) resolve(undefined);
      });
      const unsubscribe = source.subscribeToProgress("r1", onEvent);

      await gate;
      // Only one event delivered because the second has duplicate ID "1"
      expect(onEvent).toHaveBeenCalledTimes(1);
      unsubscribe();
    });

    it("ignores older event ID", async () => {
      const response = sseResponseFromChunks([
        flowdeckEvent("run.progress", { runId: "r1", status: "running", progressPercent: 50 }, "2026-07-28T12:00:00.000Z", "5") +
        flowdeckEvent("run.progress", { runId: "r1", status: "running", progressPercent: 60 }, "2026-07-28T12:00:01.000Z", "3"),
      ]);
      vi.spyOn(global, "fetch").mockResolvedValue(response);

      const { gate, resolve } = onCallGate();
      let callCount = 0;
      const onEvent = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount >= 1) resolve(undefined);
      });
      const unsubscribe = source.subscribeToProgress("r1", onEvent);

      await gate;
      expect(onEvent).toHaveBeenCalledTimes(1);
      unsubscribe();
    });
  });

  // ── SSE Authentication ─────────────────────────────────────────────

  describe("SSE authentication", () => {
    it("calls onError on 401 for SSE connection", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue(
        new Response("Unauthorized", { status: 401 }),
      );

      const { gate, resolve } = onCallGate();
      const onEvent = vi.fn();
      const onError = vi.fn().mockImplementation(() => resolve(undefined));
      source.subscribeToProgress("r1", onEvent, onError);

      await gate;
      expect(onError).toHaveBeenCalled();
    });

    it("uses the latest auth token on SSE connect", async () => {
      const authSource = new HttpHarnessDataSource({
        ...BASE_CONFIG,
        authToken: "latest-token",
      });

      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
        new Response(null, { status: 200, headers: { "Content-Type": "text/event-stream" } }),
      );

      const onEvent = vi.fn();
      const unsubscribe = authSource.subscribeToProgress("r1", onEvent);

      const options = fetchSpy.mock.calls[0][1] as RequestInit;
      expect(options.headers).toMatchObject({
        Authorization: "Bearer latest-token",
      });

      unsubscribe();
    });
  });
});
