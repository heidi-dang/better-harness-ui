import React, { useState } from "react";
import { useHarness } from "../context/harness-context";
import { HarnessFindingCard } from "./harness-finding-card";
import { FilterX, CheckSquare, Square, Wrench, EyeOff, X, RefreshCw } from "lucide-react";

export function HarnessFindingList() {
  const {
    filteredFindings,
    selectedFindingId,
    setSelectedFindingId,
    selectedFindingIds,
    isBatchProcessing,
    toggleSelectFinding,
    selectAllFindings,
    clearFindingSelection,
    batchPlanFix,
    batchIgnore,
    setIsMobileDrawerOpen,
    clearFilters,
  } = useHarness();

  const [showIgnoreReasonInput, setShowIgnoreReasonInput] = useState(false);
  const [ignoreReason, setIgnoreReason] = useState("");

  const allSelected =
    filteredFindings.length > 0 &&
    filteredFindings.every((f) => selectedFindingIds.includes(f.id));

  if (filteredFindings.length === 0) {
    return (
      <div className="bg-[var(--v2-bg-surface-raised,#16181d)] border border-[var(--v2-border-subtle,#262930)] rounded-xl p-8 text-center my-4">
        <div className="w-10 h-10 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto mb-3 text-slate-400">
          <FilterX className="w-5 h-5" />
        </div>
        <h3 className="text-sm font-bold text-slate-200 mb-1">No findings match active filters</h3>
        <p className="text-xs text-slate-400 max-w-sm mx-auto mb-4">
          Try broadening your search query or resetting the dimension, priority, and status filters.
        </p>
        <button
          onClick={clearFilters}
          className="px-3 py-1.5 text-xs font-semibold text-sky-400 bg-sky-500/10 hover:bg-sky-500/20 rounded-lg border border-sky-500/30 transition-colors min-h-[38px]"
        >
          Reset All Filters
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Selection Header & Batch Toolbar */}
      <div className="bg-[var(--v2-bg-surface-raised,#16181d)] border border-[var(--v2-border-subtle,#262930)] rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
        <button
          onClick={selectAllFindings}
          className="flex items-center gap-2 text-slate-300 hover:text-white font-medium transition-colors min-h-[44px] px-2 rounded-md hover:bg-slate-800/60"
        >
          {allSelected ? (
            <CheckSquare className="w-4 h-4 text-sky-400" />
          ) : (
            <Square className="w-4 h-4 text-slate-500" />
          )}
          <span>{allSelected ? "Deselect All" : "Select All"}</span>
          <span className="text-[10px] text-slate-400 font-mono">
            ({filteredFindings.length})
          </span>
        </button>

        {selectedFindingIds.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-bold text-purple-400 bg-purple-500/10 px-2 py-1 rounded border border-purple-500/20">
              {selectedFindingIds.length} selected
            </span>

            <button
              disabled={isBatchProcessing}
              onClick={() => batchPlanFix()}
              className="px-3 py-2 text-[11px] font-bold text-sky-300 bg-sky-600/20 hover:bg-sky-600/30 rounded-lg border border-sky-500/40 transition-colors flex items-center gap-1.5 min-h-[44px] disabled:opacity-50"
            >
              {isBatchProcessing ? (
                <RefreshCw className="w-3.5 h-3.5 text-sky-400 animate-spin" />
              ) : (
                <Wrench className="w-3.5 h-3.5 text-sky-400" />
              )}
              <span>Plan Fix ({selectedFindingIds.length})</span>
            </button>

            <button
              disabled={isBatchProcessing}
              onClick={() => setShowIgnoreReasonInput(true)}
              className="px-3 py-2 text-[11px] font-bold text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 transition-colors flex items-center gap-1.5 min-h-[44px] disabled:opacity-50"
            >
              <EyeOff className="w-3.5 h-3.5 text-slate-400" />
              <span>Ignore Selected</span>
            </button>

            <button
              disabled={isBatchProcessing}
              onClick={clearFindingSelection}
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 disabled:opacity-50 min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Clear selection"
              title="Clear selection"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Batch Ignore Prompt Box */}
      {showIgnoreReasonInput && (
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-3.5 space-y-2.5 animate-fade-in">
          <div className="flex justify-between items-center text-xs">
            <span className="font-bold text-white">Batch Ignore Reason</span>
            <button
              disabled={isBatchProcessing}
              onClick={() => setShowIgnoreReasonInput(false)}
              className="text-slate-400 hover:text-white text-xs disabled:opacity-50 p-1"
            >
              Cancel
            </button>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={ignoreReason}
              disabled={isBatchProcessing}
              onChange={(e) => setIgnoreReason(e.target.value)}
              placeholder="Enter reason for ignoring (min 3 chars)..."
              className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 disabled:opacity-50 min-h-[44px]"
            />
            <button
              disabled={isBatchProcessing || ignoreReason.trim().length < 3}
              onClick={async () => {
                const reasonToUse = ignoreReason.trim();
                if (reasonToUse.length < 3) return;
                await batchIgnore(reasonToUse);
                setShowIgnoreReasonInput(false);
                setIgnoreReason("");
              }}
              className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 rounded-lg transition-colors whitespace-nowrap flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed min-h-[44px]"
            >
              {isBatchProcessing && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
              <span>Apply Ignore</span>
            </button>
          </div>
        </div>
      )}

      {/* Scrollable Findings List */}
      <div
        role="region"
        aria-label="Filtered Harness Findings List"
        className="space-y-2.5 max-h-[calc(100vh-320px)] overflow-y-auto pr-1 custom-scrollbar"
      >
        {filteredFindings.map((finding) => (
          <HarnessFindingCard
            key={finding.id}
            finding={finding}
            isSelected={selectedFindingId === finding.id}
            isChecked={selectedFindingIds.includes(finding.id)}
            onToggleCheck={toggleSelectFinding}
            onSelect={(item) => {
              setSelectedFindingId(item.id);
              // Open drawer on mobile viewports
              setIsMobileDrawerOpen(true);
            }}
          />
        ))}
      </div>
    </div>
  );
}
