import React from "react";
import { CheckCircle2, RefreshCw } from "lucide-react";
import { useHarness } from "../context/harness-context";

export function HarnessEmptyState() {
  const { regenerateAnalysis, isLoading } = useHarness();

  return (
    <div className="bg-[var(--v2-bg-surface-raised,#16181d)] border border-[var(--v2-border-subtle,#262930)] rounded-xl p-8 sm:p-12 text-center my-6 max-w-2xl mx-auto space-y-4">
      <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400 shadow-md">
        <CheckCircle2 className="w-8 h-8" />
      </div>

      <div className="space-y-2">
        <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
          Perfect Harness Score (100 / 100)
        </h2>
        <p className="text-xs sm:text-sm text-slate-300 max-w-md mx-auto leading-relaxed">
          Zero open findings or rule violations detected across all 5 Better Harness dimensions.
          Task understanding, execution controls, change validation, delivery, and learning capture are in full compliance.
        </p>
      </div>

      <div className="pt-2">
        <button
          onClick={regenerateAnalysis}
          disabled={isLoading}
          className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-lg shadow-sm transition-colors inline-flex items-center gap-2"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
          <span>Run Fresh Analysis</span>
        </button>
      </div>
    </div>
  );
}
