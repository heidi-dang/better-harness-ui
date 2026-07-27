import React from "react";
import { useHarness } from "../context/harness-context";
import { Loader2, StopCircle, Clock } from "lucide-react";

export function HarnessProgress() {
  const { progress, cancelAnalysis } = useHarness();

  if (!progress || (progress.status !== "running" && progress.status !== "queued")) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-slate-900/90 border border-sky-500/30 rounded-xl p-4 sm:p-5 shadow-lg my-4"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-white">
                Harness Analysis In Progress
              </h3>
              <span className="text-xs px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 font-mono font-medium">
                {progress.status.toUpperCase()}
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-0.5">{progress.stage}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 self-end sm:self-center">
          {progress.estimatedTimeRemainingSeconds !== undefined && (
            <span className="text-xs text-slate-400 flex items-center gap-1 font-mono">
              <Clock className="w-3.5 h-3.5" />
              ~{progress.estimatedTimeRemainingSeconds}s remaining
            </span>
          )}

          <button
            onClick={cancelAnalysis}
            className="px-3 py-1.5 text-xs font-medium text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 rounded-md border border-rose-500/30 transition-colors flex items-center gap-1.5 min-h-[36px]"
          >
            <StopCircle className="w-3.5 h-3.5 text-rose-400" />
            <span>Cancel Run</span>
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
        <div
          className="bg-sky-500 h-full rounded-full transition-all duration-300"
          style={{ width: `${progress.progressPercent}%` }}
        />
      </div>
      <div className="flex justify-between items-center text-[11px] text-slate-400 mt-1 font-mono">
        <span>Started at {new Date(progress.startedAt).toLocaleTimeString()}</span>
        <span>{progress.progressPercent}% complete</span>
      </div>
    </div>
  );
}
