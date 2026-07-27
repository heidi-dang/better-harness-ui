import React from "react";
import { useHarness } from "../context/harness-context";
import { getScoreColorClass, getScreenReaderScoreLabel } from "../utils/score-format";
import { TrendingUp, Activity, AlertTriangle, ShieldCheck, CheckCircle2 } from "lucide-react";

export function HarnessOverallScore() {
  const { report } = useHarness();

  if (!report) return null;

  const score = report.overallScore;
  const colors = getScoreColorClass(score);
  const diff = report.previousOverallScore !== undefined ? score - report.previousOverallScore : null;
  const srLabel = getScreenReaderScoreLabel("Overall Harness", score);

  return (
    <div className="bg-[var(--v2-bg-surface-raised,#16181d)] border border-[var(--v2-border-subtle,#262930)] rounded-xl p-3 sm:p-5 shadow-sm">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 sm:gap-4 items-center">
        {/* Main Score Display */}
        <div className="md:col-span-5 lg:col-span-4 flex flex-col xs:flex-row items-center xs:items-center text-center xs:text-left gap-2.5 sm:gap-4">
          <div
            className={`flex flex-col items-center justify-center w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 rounded-2xl border flex-shrink-0 ${colors.bg} ${colors.border}`}
            aria-label={srLabel}
          >
            <span className={`text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight ${colors.text}`}>
              {score}
            </span>
            <span className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              / 100
            </span>
          </div>

          <div className="w-full min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h2 className="text-xs sm:text-sm font-semibold text-slate-200 uppercase tracking-wider">
                Overall Harness Score
              </h2>
              {diff !== null && (
                <span
                  className={`text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-0.5 ${
                    diff >= 0
                      ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                      : "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                  }`}
                >
                  <TrendingUp className={`w-3 h-3 ${diff < 0 ? "rotate-180" : ""}`} />
                  {diff >= 0 ? `+${diff}` : diff}
                </span>
              )}
            </div>

            {/* Score Bar */}
            <div
              className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden mb-1.5"
              role="progressbar"
              aria-valuenow={score}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={srLabel}
            >
              <div
                className={`h-full transition-all duration-500 rounded-full ${colors.bar}`}
                style={{ width: `${score}%` }}
              />
            </div>

            <p className="text-xs text-slate-400 leading-normal">
              {diff !== null
                ? `${diff >= 0 ? `+${diff}` : diff} points since previous analysis run`
                : "Initial baseline analysis run"}
            </p>
          </div>
        </div>

        {/* Supporting Metric Cards */}
        <div className="md:col-span-7 lg:col-span-8 grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3 pt-3 md:pt-0 border-t md:border-t-0 md:border-l border-[var(--v2-border-subtle,#262930)] md:pl-5">
          {/* Sessions Analysed */}
          <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-800/80 space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <Activity className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span>Sessions Analysed</span>
            </div>
            <div className="text-lg sm:text-xl font-bold text-slate-100 font-mono">{report.sessions.analyzed}</div>
            <p className="text-[11px] text-slate-500 truncate">
              {report.sessions.longSessions} long • {report.sessions.failedSessions} failed
            </p>
          </div>

          {/* Open Findings */}
          <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-800/80 space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Open Findings</span>
            </div>
            <div className="text-lg sm:text-xl font-bold text-slate-100 font-mono">
              {report.findings.filter((f) => f.status !== "fixed" && f.status !== "ignored").length}
            </div>
            <p className="text-[11px] text-slate-500 truncate">
              {report.findings.filter((f) => f.priority === "high").length} high priority
            </p>
          </div>

          {/* Evidence Coverage */}
          <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-800/80 space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Evidence Coverage</span>
            </div>
            <div className="text-lg sm:text-xl font-bold text-slate-100 font-mono">{report.evidenceCoverage}%</div>
            <p className="text-[11px] text-slate-500 truncate">
              Across all 5 dimensions
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
