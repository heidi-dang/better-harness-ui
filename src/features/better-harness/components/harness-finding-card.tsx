import React from "react";
import { HarnessFinding } from "../types";
import {
  formatDimensionName,
  getPriorityBadge,
  getStatusBadge,
  getVehicleLabel,
} from "../utils/score-format";
import { FileText, Wrench, ChevronRight } from "lucide-react";

export interface HarnessFindingCardProps {
  key?: React.Key;
  finding: HarnessFinding;
  isSelected?: boolean;
  isChecked?: boolean;
  onSelect: (finding: HarnessFinding) => void;
  onToggleCheck?: (findingId: string) => void;
}

export function HarnessFindingCard({
  finding,
  isSelected,
  isChecked,
  onSelect,
  onToggleCheck,
}: HarnessFindingCardProps) {
  const priorityInfo = getPriorityBadge(finding.priority);
  const statusInfo = getStatusBadge(finding.status);
  const vehicleLabel = getVehicleLabel(finding.recommendedVehicle);
  const dimensionName = formatDimensionName(finding.dimension);

  return (
    <article
      aria-label={`Finding ${finding.id}: ${finding.title}`}
      className={`group w-full text-left p-3.5 rounded-xl border transition-all ${
        isChecked ? "ring-2 ring-purple-500/50 bg-slate-800/80" : ""
      } ${
        isSelected
          ? "bg-slate-800/90 border-sky-500 shadow-md ring-1 ring-sky-500/40"
          : "bg-[var(--v2-bg-surface-raised,#16181d)] hover:bg-slate-800/60 border-[var(--v2-border-subtle,#262930)]"
      }`}
    >
      {/* Header: Checkbox, ID, Priority, Status, Dimension */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 mb-2">
        <div className="flex items-center gap-2">
          {onToggleCheck && (
            <label
              className="inline-flex items-center cursor-pointer p-1 -m-1"
              title="Select finding for batch action"
            >
              <input
                type="checkbox"
                aria-label={`Select finding ${finding.id} for batch action`}
                checked={!!isChecked}
                onChange={() => {
                  onToggleCheck(finding.id);
                }}
                className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-sky-500 focus:ring-sky-500/50 cursor-pointer accent-sky-500"
              />
            </label>
          )}
          <span className="font-mono text-[11px] font-bold text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
            {finding.id}
          </span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${priorityInfo.badgeClass}`}>
            {priorityInfo.label}
          </span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${statusInfo.badgeClass}`}>
            {statusInfo.label}
          </span>
        </div>

        <span className="text-[10px] font-medium text-slate-400 bg-slate-900/80 px-2 py-0.5 rounded border border-slate-800/80">
          {dimensionName}
        </span>
      </div>

      {/* Selectable Detail Action Trigger Button */}
      <button
        type="button"
        onClick={() => onSelect(finding)}
        aria-pressed={isSelected}
        aria-label={`View details for finding ${finding.id}: ${finding.title}`}
        className="w-full text-left group/btn focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 rounded-lg p-1 -m-1 transition-colors"
      >
        {/* Finding Title */}
        <h3 className="text-xs sm:text-sm font-bold text-slate-100 group-hover/btn:text-sky-300 transition-colors leading-snug mb-1.5 break-words">
          {finding.title}
        </h3>

        {/* Cause snippet */}
        <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed mb-3">
          {finding.cause}
        </p>

        {/* Footer: Vehicle + Evidence Count */}
        <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-800/80">
          <div className="flex items-center gap-1 text-sky-400/90 font-medium truncate max-w-[70%]">
            <Wrench className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{vehicleLabel}</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-slate-400 font-mono">
              <FileText className="w-3 h-3 text-slate-500" />
              {finding.evidence.length} {finding.evidence.length === 1 ? "evidence" : "evidences"}
            </span>
            <ChevronRight className={`w-3.5 h-3.5 text-slate-500 transition-transform ${isSelected ? "text-sky-400 translate-x-0.5" : "group-hover/btn:translate-x-0.5"}`} />
          </div>
        </div>
      </button>
    </article>
  );
}
