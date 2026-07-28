import React from "react";
import { useHarness } from "../context/harness-context";
import { AlertOctagon, RefreshCw } from "lucide-react";

export function HarnessErrorState() {
  const { isUnsupportedSchema, errorMessage, refreshReport, isLoading } = useHarness();

  return (
    <div className="bg-[var(--v2-bg-surface-raised,#16181d)] border border-rose-500/30 rounded-xl p-8 text-center my-6 max-w-xl mx-auto space-y-4">
      <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mx-auto text-rose-400">
        <AlertOctagon className="w-7 h-7" />
      </div>

      <div className="space-y-1.5">
        <h2 className="text-lg font-bold text-white">
          {isUnsupportedSchema ? "Unsupported Schema Version" : "Harness Analysis Error"}
        </h2>
        <p className="text-xs text-slate-300 max-w-md mx-auto leading-relaxed">
          {errorMessage ||
            (isUnsupportedSchema
              ? "The loaded report schema version is incompatible with this client interface. Expected schema version 1."
              : "An unexpected error occurred while loading or parsing the Harness report.")}
        </p>
      </div>

      <div className="pt-2">
        <button
          onClick={refreshReport}
          disabled={isLoading}
          className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded-lg transition-colors inline-flex items-center gap-2"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
          <span>Retry Loading</span>
        </button>
      </div>
    </div>
  );
}
