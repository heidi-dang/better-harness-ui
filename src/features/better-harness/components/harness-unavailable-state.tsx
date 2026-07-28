import React from "react";
import { PlugZap, ShieldAlert, Sparkles, SlidersHorizontal } from "lucide-react";
import { useHarness } from "../context/harness-context";

export function HarnessUnavailableState() {
  const { availability, setDemoMode } = useHarness();

  return (
    <div className="bg-[var(--v2-bg-surface-raised,#16181d)] border border-amber-500/30 rounded-xl p-8 sm:p-12 text-center my-6 max-w-2xl mx-auto space-y-6">
      <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-400 shadow-lg">
        <PlugZap className="w-8 h-8" />
      </div>

      <div className="space-y-2">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30 mb-1">
          <ShieldAlert className="w-3.5 h-3.5" />
          <span>FlowDeck Engine Pending Phase 2</span>
        </div>
        <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
          FlowDeck Harness Adapter Not Connected
        </h2>
        <p className="text-xs sm:text-sm text-slate-300 max-w-lg mx-auto leading-relaxed">
          {availability.reason ||
            "The Better Harness user interface is fully deployed in UI-only mode. The underlying FlowDeck analysis engine adapter will be connected in Phase Two."}
        </p>
      </div>

      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 text-left text-xs space-y-2">
        <h3 className="font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-sky-400" />
          Review UI Capabilities in Development / Demo Mode
        </h3>
        <p className="text-slate-400 leading-relaxed">
          You can preview all 5 dimensions, 15+ findings, responsive split-pane/mobile views, filter composition, session stats, and historical views by enabling demo mode below.
        </p>
        <div className="pt-2 flex flex-wrap gap-2">
          <button
            onClick={() => setDemoMode("completed")}
            className="px-3 py-1.5 text-xs font-semibold text-slate-900 bg-sky-400 hover:bg-sky-300 rounded-md transition-colors flex items-center gap-1.5 shadow-sm"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Enable Completed Demo Fixture</span>
          </button>
          <button
            onClick={() => setDemoMode("running")}
            className="px-3 py-1.5 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-md border border-slate-700 transition-colors"
          >
            <span>Preview Running State</span>
          </button>
        </div>
      </div>
    </div>
  );
}
