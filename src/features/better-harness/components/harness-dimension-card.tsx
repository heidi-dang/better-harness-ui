import React from "react";
import { HarnessDimensionScore } from "../types";
import {
  formatDimensionName,
  getScoreColorClass,
  getScreenReaderScoreLabel,
} from "../utils/score-format";
import { useHarness } from "../context/harness-context";
import {
  Brain,
  Sliders,
  CheckCircle,
  Truck,
  BookOpen,
  TrendingUp,
  AlertCircle,
} from "lucide-react";

export interface HarnessDimensionCardProps {
  scoreItem: HarnessDimensionScore;
  isSelected?: boolean;
}

export function HarnessDimensionCard({ scoreItem, isSelected }: HarnessDimensionCardProps) {
  const { selectDimensionFilter } = useHarness();
  const name = formatDimensionName(scoreItem.dimension);
  const colors = getScoreColorClass(scoreItem.score);
  const diff =
    scoreItem.previousScore !== undefined ? scoreItem.score - scoreItem.previousScore : null;
  const srLabel = getScreenReaderScoreLabel(name, scoreItem.score);

  const getDimensionIcon = () => {
    switch (scoreItem.dimension) {
      case "task-understanding":
        return <Brain className="w-4 h-4 text-sky-400" />;
      case "controlled-execution":
        return <Sliders className="w-4 h-4 text-purple-400" />;
      case "change-validation":
        return <CheckCircle className="w-4 h-4 text-emerald-400" />;
      case "reliable-delivery":
        return <Truck className="w-4 h-4 text-indigo-400" />;
      case "learning-capture":
        return <BookOpen className="w-4 h-4 text-amber-400" />;
    }
  };

  return (
    <button
      onClick={() => selectDimensionFilter(scoreItem.dimension)}
      className={`text-left w-full h-full p-4 rounded-xl transition-all border outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 ${
        isSelected
          ? "bg-slate-800/90 border-sky-500/80 shadow-md ring-1 ring-sky-500/50"
          : "bg-[var(--v2-bg-surface-raised,#16181d)] hover:bg-slate-800/60 border-[var(--v2-border-subtle,#262930)]"
      }`}
      aria-label={`${srLabel}. Click to filter findings for ${name}.`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-slate-900 border border-slate-800">
            {getDimensionIcon()}
          </div>
          <h3 className="text-xs font-bold text-slate-200 tracking-tight leading-tight">
            {name}
          </h3>
        </div>

        {diff !== null && (
          <span
            className={`text-[11px] font-semibold px-1.5 py-0.5 rounded flex items-center gap-0.5 ${
              diff >= 0
                ? "bg-emerald-500/15 text-emerald-400"
                : "bg-rose-500/15 text-rose-400"
            }`}
          >
            <TrendingUp className={`w-3 h-3 ${diff < 0 ? "rotate-180" : ""}`} />
            {diff >= 0 ? `+${diff}` : diff}
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-1.5 my-2">
        <span className={`text-2xl font-extrabold tracking-tight ${colors.text}`}>
          {scoreItem.score}
        </span>
        <span className="text-xs font-semibold text-slate-400">/ 100</span>
      </div>

      {/* Progress Bar */}
      <div
        className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden mb-3"
        role="progressbar"
        aria-valuenow={scoreItem.score}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={srLabel}
      >
        <div
          className={`h-full rounded-full transition-all duration-300 ${colors.bar}`}
          style={{ width: `${scoreItem.score}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-800/80">
        <span className="flex items-center gap-1">
          <AlertCircle className="w-3 h-3 text-slate-500" />
          {scoreItem.findingCount} open {scoreItem.findingCount === 1 ? "finding" : "findings"}
        </span>
        <span className="text-slate-400 font-medium">
          {scoreItem.evidenceCoverage}% coverage
        </span>
      </div>
    </button>
  );
}
