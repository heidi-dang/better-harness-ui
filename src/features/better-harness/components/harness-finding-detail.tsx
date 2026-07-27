import React, { useState } from "react";
import { useHarness } from "../context/harness-context";
import { HarnessEvidenceList } from "./harness-evidence-list";
import {
  formatDimensionName,
  getPriorityBadge,
  getStatusBadge,
  getVehicleLabel,
} from "../utils/score-format";
import {
  Wrench,
  AlertTriangle,
  Target,
  CheckSquare,
  Clock,
  ExternalLink,
  ShieldAlert,
  XCircle,
  PlayCircle,
  CheckCircle2,
  FileCode,
  Sparkles,
} from "lucide-react";

export function HarnessFindingDetail() {
  const {
    selectedFinding,
    planFixForFinding,
    verifyFixForFinding,
    ignoreFinding,
    setActionMessage,
  } = useHarness();

  const [ignoreReason, setIgnoreReason] = useState("");
  const [showIgnoreDialog, setShowIgnoreDialog] = useState(false);

  if (!selectedFinding) {
    return (
      <div className="bg-[var(--v2-bg-surface-raised,#16181d)] border border-[var(--v2-border-subtle,#262930)] rounded-xl p-8 text-center">
        <AlertTriangle className="w-8 h-8 text-slate-500 mx-auto mb-2" />
        <p className="text-sm font-semibold text-slate-300">Select a finding to inspect detail</p>
      </div>
    );
  }

  const finding = selectedFinding;
  const priorityInfo = getPriorityBadge(finding.priority);
  const statusInfo = getStatusBadge(finding.status);
  const vehicleLabel = getVehicleLabel(finding.recommendedVehicle);
  const dimensionName = formatDimensionName(finding.dimension);

  const handleIgnoreSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ignoreReason.trim()) return;
    await ignoreFinding(finding.id, ignoreReason);
    setShowIgnoreDialog(false);
    setIgnoreReason("");
  };

  return (
    <div className="bg-[var(--v2-bg-surface-raised,#16181d)] border border-[var(--v2-border-subtle,#262930)] rounded-xl p-5 sm:p-6 space-y-6">
      {/* Header Badges */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-800">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs font-bold text-sky-400 bg-sky-500/10 px-2.5 py-1 rounded-md border border-sky-500/20">
            {finding.id}
          </span>
          <span className={`text-xs px-2.5 py-1 rounded-md ${priorityInfo.badgeClass}`}>
            {priorityInfo.label}
          </span>
          <span className={`text-xs px-2.5 py-1 rounded-md ${statusInfo.badgeClass}`}>
            {statusInfo.label}
          </span>
        </div>

        <span className="text-xs font-semibold text-slate-300 bg-slate-900 px-3 py-1 rounded-md border border-slate-800">
          {dimensionName}
        </span>
      </div>

      {/* Finding Title */}
      <div>
        <h2 className="text-base sm:text-lg font-extrabold text-white leading-tight">
          {finding.title}
        </h2>
        <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs text-slate-400 mt-2 font-mono">
          <span>First seen: {new Date(finding.firstSeenAt).toLocaleDateString()}</span>
          <span className="hidden sm:inline">•</span>
          <span>Last seen: {new Date(finding.lastSeenAt).toLocaleDateString()}</span>
        </div>
      </div>

      {/* Action Bar */}
      <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
          <Wrench className="w-4 h-4 text-sky-400 shrink-0" />
          <span>Recommended Fix: <strong>{vehicleLabel}</strong></span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {finding.repairSessionId ? (
            <button
              onClick={() => {
                setActionMessage({
                  text: `Opening repair session ${finding.repairSessionId} in preview mode.`,
                  type: "info",
                });
              }}
              className="px-3.5 py-2 text-xs font-semibold text-sky-300 bg-sky-500/20 hover:bg-sky-500/30 rounded-lg border border-sky-500/40 transition-colors flex items-center gap-1.5 min-h-[44px]"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Open Repair Session</span>
            </button>
          ) : (
            <button
              onClick={() => planFixForFinding(finding.id)}
              className="px-3.5 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-lg transition-colors flex items-center gap-1.5 shadow-sm min-h-[44px]"
            >
              <PlayCircle className="w-4 h-4" />
              <span>Plan a Fix</span>
            </button>
          )}

          <button
            onClick={() => verifyFixForFinding(finding.id)}
            className="px-3.5 py-2 text-xs font-semibold text-emerald-300 bg-emerald-500/15 hover:bg-emerald-500/25 rounded-lg border border-emerald-500/30 transition-colors flex items-center gap-1.5 min-h-[44px]"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>Verify</span>
          </button>

          <button
            onClick={() => setShowIgnoreDialog(true)}
            className="px-3.5 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 transition-colors flex items-center gap-1.5 min-h-[44px]"
          >
            <XCircle className="w-4 h-4 text-slate-400" />
            <span>Ignore</span>
          </button>
        </div>
      </div>

      {/* Ignore Reason Modal Dialog */}
      {showIgnoreDialog && (
        <form
          onSubmit={handleIgnoreSubmit}
          className="bg-slate-900 border border-amber-500/30 p-4 rounded-xl space-y-3"
        >
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4" />
              Ignore Finding Reason
            </h4>
            <button
              type="button"
              onClick={() => setShowIgnoreDialog(false)}
              className="text-slate-400 hover:text-white text-xs"
            >
              ✕
            </button>
          </div>
          <p className="text-xs text-slate-400">
            Please provide a short justification for ignoring finding {finding.id} in this harness report.
          </p>
          <input
            type="text"
            value={ignoreReason}
            onChange={(e) => setIgnoreReason(e.target.value)}
            placeholder="e.g. False positive due to local dev test environment or accepted risk..."
            className="w-full bg-slate-950 border border-slate-700 rounded-md p-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
            required
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowIgnoreDialog(false)}
              className="px-3 py-1.5 text-xs text-slate-400 bg-slate-800 rounded-md"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-3 py-1.5 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-md"
            >
              Confirm Ignore
            </button>
          </div>
        </form>
      )}

      {/* Root Cause & Impact */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-xl space-y-1">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            Root Cause
          </h3>
          <p className="text-xs text-slate-200 leading-relaxed">{finding.cause}</p>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-xl space-y-1">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5 text-rose-400" />
            System Impact
          </h3>
          <p className="text-xs text-slate-200 leading-relaxed">{finding.impact}</p>
        </div>
      </div>

      {/* Expected Output */}
      <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-xl space-y-1">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-sky-400" />
          Expected Output
        </h3>
        <p className="text-xs text-slate-200 leading-relaxed font-mono bg-slate-950 p-2.5 rounded-lg border border-slate-800">
          {finding.expectedOutput}
        </p>
      </div>

      {/* Evidence Items */}
      <div className="space-y-2">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
          Evidence Items ({finding.evidence.length})
        </h3>
        <HarnessEvidenceList evidenceList={finding.evidence} />
      </div>

      {/* Allowed Scope Paths */}
      {finding.allowedPaths.length > 0 && (
        <div className="space-y-1.5">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <FileCode className="w-3.5 h-3.5 text-slate-400" />
            Allowed Repair Scope Paths
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {finding.allowedPaths.map((p) => (
              <span
                key={p}
                className="text-xs font-mono bg-slate-900 text-sky-300 px-2.5 py-1 rounded-md border border-slate-800"
              >
                {p}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Validation Requirements & Acceptance Criteria */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Validation Requirements
          </h3>
          <ul className="space-y-1.5 text-xs text-slate-300">
            {finding.validationRequirements.map((req, i) => (
              <li key={i} className="flex items-start gap-2 bg-slate-900/50 p-2 rounded-lg">
                <CheckSquare className="w-3.5 h-3.5 text-sky-400 flex-shrink-0 mt-0.5" />
                <span>{req}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-2">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Acceptance Criteria
          </h3>
          <ul className="space-y-1.5 text-xs text-slate-300">
            {finding.acceptanceCriteria.map((crit, i) => (
              <li key={i} className="flex items-start gap-2 bg-slate-900/50 p-2 rounded-lg">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                <span>{crit}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
