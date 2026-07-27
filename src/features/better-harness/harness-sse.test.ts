import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { HttpHarnessDataSource, HttpHarnessDataSourceConfig } from "./api/http-harness-data-source";

/**
 * SSE and polling tests for HttpHarnessDataSource.
 * Uses mocked fetch with controlled ReadableStream chunks.
 *
 * Since subscribeToProgress fires startStream() as a fire-and-forget
 * async function, we use a promise-based gate pattern to wait for
 * the onEvent callback rather than trying to drain the event loop:
 *
 *   let resolveEvent: (value: unknown) => void;
 *   const eventReceived = new Promise((r) => { resolveEvent = r; });
 *   const onEvent = vi.fn().mockImplementation(() => resolveEvent(undefined));
 *   source.subscribeToProgress("r1", onEvent);
 *   await eventReceived;
 */

const BASE_CONFIG: HttpHarnessDataSourceConfig = {
  baseUrl: "http://localhost:8080",
  serverKey: "srv-01",
  projectKey: "test-project",
};

/**
 * Create a mock Response for SSE events from an array of string chunks.
 * Each chunk is delivered as a separate ReadableStream read() call.
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
 * Return an SSE event in standard LF format.
 */
function sseEvent(eventType: string, data: unknown): string {
  return `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
}

describe("Better Harness SSE", () => {
  let source: HttpHarnessDataSource;

  beforeEach(() => {
    source = new HttpHarnessDataSource(BASE_CONFIG);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── SSE Parser ────────────────────────────────────────────────────

  describe("SSE Parser", () => {
    it("delivers a complete LF-framed event", async () => {
      const payload = { runId: "r1", status: "running", progressPercent: 50 };
      const response = sseResponseFromChunks([
        sseEvent("run.progress", payload),
      ]);
      vi.spyOn(global, "fetch").mockResolvedValue(response);

      let resolveEvent: (value: unknown) => void;
      const eventReceived = new Promise((r) => { resolveEvent = r; });
      const onEvent = vi.fn().mockImplementation(() => resolveEvent(undefined));
      const unsubscribe = source.subscribeToProgress("r1", onEvent);

      await eventReceived;
      expect(onEvent).toHaveBeenCalledTimes(1);
      expect(onEvent).toHaveBeenCalledWith({
        type: "run.progress",
        data: payload,
      });
      unsubscribe();
    });

    it("delivers a complete CRLF-framed event", async () => {
      const payload = { status: "completed" };
      const crlfChunk = "event: report.completed\r\ndata: " +
        JSON.stringify(payload) + "\r\n\r\n";
      const response = sseResponseFromChunks([crlfChunk]);
      vi.spyOn(global, "fetch").mockResolvedValue(response);

      let resolveEvent: (value: unknown) => void;
      const eventReceived = new Promise((r) => { resolveEvent = r; });
      const onEvent = vi.fn().mockImplementation(() => resolveEvent(undefined));
      const unsubscribe = source.subscribeToProgress("r1", onEvent);

      await eventReceived;
      expect(onEvent).toHaveBeenCalledWith({
        type: "report.completed",
        data: payload,
      });
      unsubscribe();
    });

    it("delivers multiple events in one chunk", async () => {
      const response = sseResponseFromChunks([
        sseEvent("run.progress", { runId: "r1", status: "running" }) +
        sseEvent("run.progress", { runId: "r1", status: "completed" }),
      ]);
      vi.spyOn(global, "fetch").mockResolvedValue(response);

      let callCount = 0;
      let resolveEvent: (value: unknown) => void;
      const eventReceived = new Promise((r) => { resolveEvent = r; });
      const onEvent = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount >= 2) resolveEvent(undefined);
      });
      const unsubscribe = source.subscribeToProgress("r1", onEvent);

      await eventReceived;
      expect(onEvent).toHaveBeenCalledTimes(2);
      unsubscribe();
    });

    it("handles one event split across two chunks", async () => {
      const response = sseResponseFromChunks([
        "event: run.progress\ndata: {\"runId\":",
        "\"r1\",\"status\":\"running\"}\n\n",
      ]);
      vi.spyOn(global, "fetch").mockResolvedValue(response);

      let resolveEvent: (value: unknown) => void;
      const eventReceived = new Promise((r) => { resolveEvent = r; });
      const onEvent = vi.fn().mockImplementation(() => resolveEvent(undefined));
      const unsubscribe = source.subscribeToProgress("r1", onEvent);

      await eventReceived;
      expect(onEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: "run.progress" })
      );
      unsubscribe();
    });

    it("handles one event split across several chunks", async () => {
      const response = sseResponseFromChunks([
        "event: ru",
        "n.progress\nda",
        'ta: {"runId":"r1"',
        ',"status":"running"}\n\n',
      ]);
      vi.spyOn(global, "fetch").mockResolvedValue(response);

      let resolveEvent: (value: unknown) => void;
      const eventReceived = new Promise((r) => { resolveEvent = r; });
      const onEvent = vi.fn().mockImplementation(() => resolveEvent(undefined));
      const unsubscribe = source.subscribeToProgress("r1", onEvent);

      await eventReceived;
      expect(onEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: "run.progress" })
      );
      unsubscribe();
    });

    it("handles multiple data lines in one event", async () => {
      const response = sseResponseFromChunks([
        "event: run.progress\ndata: {\"runId\":\"r1\"}\ndata: {\"status\":\"completed\"}\n\n",
      ]);
      vi.spyOn(global, "fetch").mockResolvedValue(response);

      let resolveEvent: (value: unknown) => void;
      const eventReceived = new Promise((r) => { resolveEvent = r; });
      const onEvent = vi.fn().mockImplementation(() => resolveEvent(undefined));
      const unsubscribe = source.subscribeToProgress("r1", onEvent);

      await eventReceived;
      // Multiple data lines: only the last data line is used
      expect(onEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: "run.progress" })
      );
      unsubscribe();
    });

    it("retains incomplete final frame", async () => {
      const response = sseResponseFromChunks([
        "event: run.progress\ndata: {\"runId\":\"r1\"",
      ]);
      vi.spyOn(global, "fetch").mockResolvedValue(response);

      const onEvent = vi.fn();
      const unsubscribe = source.subscribeToProgress("r1", onEvent);

      // Stream ends without a blank line — no event should fire
      // Wait a tick to ensure no delayed callback
      await new Promise<void>((r) => setTimeout(r, 0));
      expect(onEvent).not.toHaveBeenCalled();
      unsubscribe();
    });

    it("ignores comment lines", async () => {
      const response = sseResponseFromChunks([
        ": this is a comment\n" +
        sseEvent("run.progress", { runId: "r1", status: "running" }),
      ]);
      vi.spyOn(global, "fetch").mockResolvedValue(response);

      let resolveEvent: (value: unknown) => void;
      const eventReceived = new Promise((r) => { resolveEvent = r; });
      const onEvent = vi.fn().mockImplementation(() => resolveEvent(undefined));
      const unsubscribe = source.subscribeToProgress("r1", onEvent);

      await eventReceived;
      // Comment should be ignored, but the subsequent event should fire
      expect(onEvent).toHaveBeenCalledTimes(1);
      unsubscribe();
    });

    it("handles malformed JSON gracefully", async () => {
      const response = sseResponseFromChunks([
        "event: run.progress\ndata: this-is-not-json\n\n",
      ]);
      vi.spyOn(global, "fetch").mockResolvedValue(response);

      let resolveEvent: (value: unknown) => void;
      const eventReceived = new Promise((r) => { resolveEvent = r; });
      const onEvent = vi.fn().mockImplementation(() => resolveEvent(undefined));
      const unsubscribe = source.subscribeToProgress("r1", onEvent);

      await eventReceived;
      // Malformed JSON is delivered as-is (string data)
      expect(onEvent).toHaveBeenCalledWith({
        type: "run.progress",
        data: "this-is-not-json",
      });
      unsubscribe();
    });

    it("stops delivering events after stream ends", async () => {
      const response = sseResponseFromChunks([
        sseEvent("report.completed", { runId: "r1" }),
      ]);
      vi.spyOn(global, "fetch").mockResolvedValue(response);

      let resolveEvent: (value: unknown) => void;
      const eventReceived = new Promise((r) => { resolveEvent = r; });
      const onEvent = vi.fn().mockImplementation(() => resolveEvent(undefined));
      const unsubscribe = source.subscribeToProgress("r1", onEvent);

      await eventReceived;
      expect(onEvent).toHaveBeenCalledTimes(1);

      // Wait again to confirm no more events
      await new Promise<void>((r) => setTimeout(r, 0));
      expect(onEvent).toHaveBeenCalledTimes(1);
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
        sseEvent("run.progress", payload),
      ]);
      vi.spyOn(global, "fetch").mockResolvedValue(response);

      let resolveEvent: (value: unknown) => void;
      const eventReceived = new Promise((r) => { resolveEvent = r; });
      const onEvent = vi.fn().mockImplementation(() => resolveEvent(undefined));
      const unsubscribe = source.subscribeToProgress("r1", onEvent);

      await eventReceived;
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

  // ── SSE Authentication & Replay ────────────────────────────────────

  describe("SSE Authentication & Replay", () => {
    it("calls onError on 401 for SSE connection", async () => {
      vi.spyOn(global, "fetch").mockResolvedValue(
        new Response("Unauthorized", { status: 401 })
      );

      let resolveError: (value: unknown) => void;
      const errorReceived = new Promise((r) => { resolveError = r; });
      const onEvent = vi.fn();
      const onError = vi.fn().mockImplementation(() => resolveError(undefined));
      source.subscribeToProgress("r1", onEvent, onError);

      await errorReceived;
      expect(onError).toHaveBeenCalled();
    });

    it("uses the latest auth token on SSE connect", async () => {
      const authSource = new HttpHarnessDataSource({
        ...BASE_CONFIG,
        authToken: "latest-token",
      });

      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
        new Response(null, { status: 200, headers: { "Content-Type": "text/event-stream" } })
      );

      const onEvent = vi.fn();
      const unsubscribe = authSource.subscribeToProgress("r1", onEvent);

      const options = fetchSpy.mock.calls[0][1] as RequestInit;
      expect(options.headers).toMatchObject({
        Authorization: "Bearer latest-token",
      });

      unsubscribe();
    });

    it("unsubscribe prevents further event delivery", async () => {
      const response = sseResponseFromChunks([
        sseEvent("run.progress", { runId: "r1", status: "running" }),
      ]);
      vi.spyOn(global, "fetch").mockResolvedValue(response);

      const onEvent = vi.fn();
      const unsubscribe = source.subscribeToProgress("r1", onEvent);

      // Unsubscribe immediately — should cancel the stream
      unsubscribe();

      // Wait for any pending work
      await new Promise<void>((r) => setTimeout(r, 0));

      // onEvent should never have been called
      expect(onEvent).not.toHaveBeenCalled();
    });
  });
});
