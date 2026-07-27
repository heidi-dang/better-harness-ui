import React, { useState } from "react";
import { useHarness } from "../context/harness-context";
import { HarnessDemoMode } from "../types";
import { HarnessConfirmationDialog } from "./harness-confirmation-dialog";
import {
  Sparkles,
  RefreshCw,
  ExternalLink,
  ShieldAlert,
  Server,
  FolderGit2,
  Clock,
  CheckCircle2,
  SlidersHorizontal,
} from "lucide-react";

export function HarnessHeader() {
  const {
    serverKey,
    projectDir,
    report,
    availability,
    isLoading,
    regenerateAnalysis,
    demoMode,
    setDemoMode,
    actionMessage,
    setActionMessage,
  } = useHarness();

  const [isConfirmRegenOpen, setIsConfirmRegenOpen] = useState(false);

  const handleDemoChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === "production") {
      setDemoMode(undefined);
    } else {
      setDemoMode(val as HarnessDemoMode);
    }
  };

  const formattedDate = report?.generatedAt
    ? new Date(report.generatedAt).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "Never";

  return (
    <header className="bg-[var(--v2-bg-surface-raised,#16181d)] border-b border-[var(--v2-border-subtle,#262930)] px-4 py-3 sm:px-6">
      {/* Action Notification Toast */}
      {actionMessage && (
        <div
          role="status"
          className={`mb-3 px-3 py-2 rounded-md text-xs font-medium flex items-center justify-between transition-all ${
            actionMessage.type === "success"
              ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
              : actionMessage.type === "warning"
              ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
              : "bg-sky-500/15 text-sky-300 border border-sky-500/30"
          }`}
        >
          <span className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5" />
            {actionMessage.text}
          </span>
          <button
            onClick={() => setActionMessage(null)}
            className="text-slate-400 hover:text-white text-xs px-1"
            aria-label="Dismiss message"
          >
            ✕
          </button>
        </div>
      )}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {/* Project & Server Identity */}
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2 text-xs text-[var(--v2-text-muted,#94a3b8)] min-w-0">
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="inline-flex items-center gap-1 font-semibold text-sky-400">
                <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                Better Harness
              </span>
              {serverKey && (
                <>
                  <span className="text-slate-600">•</span>
                  <span className="inline-flex items-center gap-1 bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700 font-mono text-[11px]">
                    <Server className="w-3 h-3 text-slate-400" />
                    {serverKey}
                  </span>
                </>
              )}
            </div>
            <span className="hidden sm:inline text-slate-600">•</span>
            <div className="inline-flex items-center gap-1 min-w-0 font-mono text-[11px] text-slate-300 max-w-full">
              <FolderGit2 className="w-3 h-3 text-slate-400 shrink-0" />
              <span className="truncate block min-w-0" title={projectDir || report?.project.directory || "Current Project"}>
                {projectDir || report?.project.directory || "Current Project"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <h1 className="text-base sm:text-xl font-bold text-white tracking-tight leading-tight min-w-0 break-words">
              {report?.project.name || "Project Harness Analysis"}
            </h1>
            {report?.sourceRevision && (
              <span className="inline-flex items-center text-[11px] font-mono bg-slate-800/80 text-slate-300 px-2 py-0.5 rounded border border-slate-700 shrink-0">
                {report.sourceRevision}
              </span>
            )}
          </div>
        </div>

        {/* Status Indicators & Main Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-800/80">
          <div className="flex items-center gap-2 flex-wrap text-xs text-slate-400">
            {report && (
              <div className="inline-flex items-center gap-1.5 text-[11px] text-emerald-300 bg-emerald-500/10 px-2.5 py-1.5 rounded-md border border-emerald-500/20 shrink-0">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Coverage: {report.evidenceCoverage}%</span>
              </div>
            )}
            {report && (
              <div className="hidden md:inline-flex items-center gap-1.5 text-[11px] text-slate-400 bg-slate-900/60 px-2.5 py-1.5 rounded-md border border-slate-800 shrink-0">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>Analysed: {formattedDate}</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 w-full sm:w-auto">
            {/* Environment/Demo Mode Selector */}
            <div className="flex items-center gap-1.5 bg-slate-900/90 px-2.5 py-1.5 rounded-lg border border-slate-800 text-xs text-slate-300 min-h-[44px]">
              <SlidersHorizontal className="w-4 h-4 text-slate-400 shrink-0" />
              <select
                value={demoMode || "production"}
                onChange={handleDemoChange}
                className="bg-transparent text-slate-200 text-xs focus:outline-none cursor-pointer w-full truncate"
                aria-label="Select Harness demo state"
              >
                <option value="production" className="bg-slate-900 text-slate-200">
                  Prod Mode ({availability.available ? "Connected" : "Disconnected Engine"})
                </option>
                <option value="completed" className="bg-slate-900 text-slate-200">
                  Demo: Completed Analysis
                </option>
                <option value="running" className="bg-slate-900 text-slate-200">
                  Demo: Analysis Running
                </option>
                <option value="empty" className="bg-slate-900 text-slate-200">
                  Demo: Clean / 100% Score
                </option>
                <option value="failed" className="bg-slate-900 text-slate-200">
                  Demo: Analysis Failed
                </option>
                <option value="unavailable" className="bg-slate-900 text-slate-200">
                  Demo: FlowDeck Engine Unavailable
                </option>
                <option value="incompatible-schema" className="bg-slate-900 text-slate-200">
                  Demo: Incompatible Schema Version
                </option>
              </select>
            </div>

            {/* Action Buttons */}
            <button
              onClick={() => {
                setActionMessage({
                  text: "Opening audit session in preview mode. FlowDeck session logger will connect in next phase.",
                  type: "info",
                });
              }}
              className="px-3 py-2 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 active:bg-slate-900 rounded-lg border border-slate-700 transition-colors flex items-center justify-center gap-1.5 min-h-[44px]"
            >
              <ExternalLink className="w-4 h-4 text-slate-400" />
              <span>Audit Session</span>
            </button>

            <button
              onClick={() => setIsConfirmRegenOpen(true)}
              disabled={isLoading}
              className="px-3 py-2 text-xs font-bold text-white bg-sky-600 hover:bg-sky-500 active:bg-sky-700 disabled:opacity-50 rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-sm min-h-[44px]"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
              <span>Regenerate</span>
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation Dialog for Regenerate */}
      <HarnessConfirmationDialog
        isOpen={isConfirmRegenOpen}
        onClose={() => setIsConfirmRegenOpen(false)}
        onConfirm={regenerateAnalysis}
        title="Regenerate Analysis?"
        description={
          <span>
            This action will initiate a full re-scan of the codebase repository. Any pending or active session findings will be re-assessed against the latest rules.
          </span>
        }
        confirmText="Yes, Regenerate"
        cancelText="Cancel"
        variant="warning"
        isLoading={isLoading}
      />
    </header>
  );
}
