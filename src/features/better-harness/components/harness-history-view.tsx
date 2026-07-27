import React, { useState, useEffect } from "react";
import { useHarness } from "../context/harness-context";
import { HISTORICAL_HARNESS_REPORTS } from "../fixtures/harness-fixtures";
import { HarnessReport } from "../types";
import { getScoreColorClass } from "../utils/score-format";
import { Calendar, TrendingUp, CheckCircle2, FileText, Sparkles, Activity } from "lucide-react";

export function HarnessHistoryView() {
  const { dataSource } = useHarness();
  const [historyRuns, setHistoryRuns] = useState<HarnessReport[]>(HISTORICAL_HARNESS_REPORTS);

  useEffect(() => {
    if (dataSource.getHistory) {
      dataSource.getHistory().then((runs) => {
        if (runs && runs.length > 0) {
          setHistoryRuns(runs);
        }
      });
    }
  }, [dataSource]);

  // Sort runs chronologically (oldest to newest) for chart plotting
  const chronologicalRuns = [...historyRuns].reverse();
  const [hoveredRunIndex, setHoveredRunIndex] = useState<number | null>(null);
  const [selectedRunIndex, setSelectedRunIndex] = useState<number>(
    Math.max(0, chronologicalRuns.length - 1)
  );

  // SVG Chart Calculations
  const svgWidth = 600;
  const svgHeight = 220;
  const paddingX = 50;
  const paddingY = 35;
  const chartWidth = svgWidth - paddingX * 2;
  const chartHeight = svgHeight - paddingY * 2;

  const minScore = 50;
  const maxScore = 100;

  // Compute (x, y) coordinates for each point
  const points = chronologicalRuns.map((run, i) => {
    const x =
      chronologicalRuns.length > 1
        ? paddingX + (i / (chronologicalRuns.length - 1)) * chartWidth
        : svgWidth / 2;
    const yRatio = (run.overallScore - minScore) / (maxScore - minScore);
    const y = paddingY + chartHeight - yRatio * chartHeight;
    return { x, y, run, index: i };
  });

  // Construct smooth SVG path (cubic bezier)
  const buildSmoothPath = () => {
    if (points.length === 0) return "";
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const curr = points[i];
      const next = points[i + 1];
      const controlX = (curr.x + next.x) / 2;
      d += ` C ${controlX} ${curr.y}, ${controlX} ${next.y}, ${next.x} ${next.y}`;
    }
    return d;
  };

  const linePathD = buildSmoothPath();
  const areaPathD =
    points.length > 0
      ? `${linePathD} L ${points[points.length - 1].x} ${paddingY + chartHeight} L ${points[0].x} ${paddingY + chartHeight} Z`
      : "";

  const totalGrowth =
    chronologicalRuns.length > 0
      ? chronologicalRuns[chronologicalRuns.length - 1].overallScore -
        chronologicalRuns[0].overallScore
      : 0;

  const avgScore =
    chronologicalRuns.length > 0
      ? (
          chronologicalRuns.reduce((acc, r) => acc + r.overallScore, 0) / chronologicalRuns.length
        ).toFixed(1)
      : "0.0";

  const activeIndex = hoveredRunIndex !== null ? hoveredRunIndex : selectedRunIndex;
  const activeRun = chronologicalRuns[activeIndex] || chronologicalRuns[0];

  if (historyRuns.length === 0) {
    return (
      <div className="bg-[#16181d] border border-slate-800 rounded-2xl p-8 text-center space-y-3">
        <Activity className="w-8 h-8 text-slate-500 mx-auto" />
        <h3 className="text-sm font-bold text-white">No Historical Analysis Runs</h3>
        <p className="text-xs text-slate-400 max-w-md mx-auto">
          Run a quality harness evaluation to begin recording historical trend metrics, score progression, and finding resolution.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header & Stats summary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Activity className="w-4 h-4 text-sky-400 shrink-0" />
            Historical Score Trend (Last 5 Runs)
          </h2>
          <p className="text-xs text-slate-400">
            Interactive visualization of quality score progression, coverage growth, and finding resolution over time.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="bg-[#16181d] border border-slate-800 rounded-xl px-3 py-1.5 text-xs font-mono flex items-center gap-2">
            <span className="text-slate-400">Total Improvement:</span>
            <span className="font-bold text-emerald-400 flex items-center gap-0.5">
              <TrendingUp className="w-3.5 h-3.5" />
              +{totalGrowth} pts
            </span>
          </div>

          <div className="bg-[#16181d] border border-slate-800 rounded-xl px-3 py-1.5 text-xs font-mono flex items-center gap-2">
            <span className="text-slate-400">5-Run Avg:</span>
            <span className="font-bold text-sky-400">{avgScore}</span>
          </div>
        </div>
      </div>

      {/* SVG Path Trend Chart Container */}
      <div className="bg-[var(--v2-bg-surface-raised,#16181d)] border border-[var(--v2-border-subtle,#262930)] rounded-2xl p-4 sm:p-6 shadow-lg space-y-4">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span className="font-semibold text-slate-300 uppercase tracking-wider text-[11px]">
            Trend Line Chart
          </span>
          <span className="sm:hidden inline-flex items-center gap-1.5 text-[11px] font-medium text-sky-400 bg-sky-500/10 px-2.5 py-1 rounded-full border border-sky-500/20">
            <span>Scroll chart horizontally</span>
            <span className="text-xs">↔</span>
          </span>
        </div>

        <div className="relative w-full overflow-x-auto custom-scrollbar touch-pan-x pb-2">
          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            className="w-full h-auto min-w-[500px] overflow-visible"
            aria-label="Harness Score Trend Line Chart"
          >
            <defs>
              <linearGradient id="scoreAreaGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0284c7" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#0284c7" stopOpacity="0.0" />
              </linearGradient>

              <linearGradient id="scoreLineGradient" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#38bdf8" />
                <stop offset="50%" stopColor="#818cf8" />
                <stop offset="100%" stopColor="#34d399" />
              </linearGradient>

              <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {/* Horizontal Gridlines & Axis Labels */}
            {[50, 65, 80, 100].map((gridVal) => {
              const y =
                paddingY + chartHeight - ((gridVal - minScore) / (maxScore - minScore)) * chartHeight;
              return (
                <g key={gridVal}>
                  <line
                    x1={paddingX}
                    y1={y}
                    x2={svgWidth - paddingX}
                    y2={y}
                    stroke="#262930"
                    strokeDasharray="4 4"
                    strokeWidth="1"
                  />
                  <text
                    x={paddingX - 10}
                    y={y + 4}
                    fill="#64748b"
                    fontSize="10"
                    fontFamily="monospace"
                    textAnchor="end"
                  >
                    {gridVal}
                  </text>
                </g>
              );
            })}

            {/* Area Fill Path */}
            <path d={areaPathD} fill="url(#scoreAreaGradient)" />

            {/* Line Path */}
            <path
              d={linePathD}
              fill="none"
              stroke="url(#scoreLineGradient)"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="url(#glow)"
            />

            {/* Interactive Data Points */}
            {points.map((pt) => {
              const isHovered = hoveredRunIndex === pt.index;
              const isSelected = selectedRunIndex === pt.index;
              const colors = getScoreColorClass(pt.run.overallScore);

              return (
                <g
                  key={pt.index}
                  tabIndex={0}
                  role="button"
                  aria-label={`Run #${pt.index + 1}: Score ${pt.run.overallScore} out of 100, ${pt.run.findings.length} findings, ${pt.run.evidenceCoverage}% coverage, generated on ${new Date(pt.run.generatedAt).toLocaleDateString()}`}
                  className="cursor-pointer transition-transform duration-200 outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-2 focus:ring-offset-slate-900 rounded"
                  onClick={() => setSelectedRunIndex(pt.index)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedRunIndex(pt.index);
                    }
                  }}
                  onMouseEnter={() => setHoveredRunIndex(pt.index)}
                  onMouseLeave={() => setHoveredRunIndex(null)}
                >
                  {/* Outer Pulsing Aura for active point */}
                  {(isSelected || isHovered) && (
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r="12"
                      fill="#38bdf8"
                      fillOpacity="0.25"
                      className="animate-ping"
                    />
                  )}

                  {/* Outer Halo */}
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={isSelected || isHovered ? "8" : "6"}
                    fill="#0f172a"
                    stroke={isSelected || isHovered ? "#38bdf8" : "#64748b"}
                    strokeWidth="2.5"
                  />

                  {/* Inner Dot */}
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r="3.5"
                    fill={isSelected || isHovered ? "#38bdf8" : "#94a3b8"}
                  />

                  {/* Score Label Badge above point */}
                  <g transform={`translate(${pt.x}, ${pt.y - 14})`}>
                    <rect
                      x="-16"
                      y="-12"
                      width="32"
                      height="16"
                      rx="4"
                      fill="#121418"
                      stroke={isSelected ? "#38bdf8" : "#334155"}
                      strokeWidth="1"
                    />
                    <text
                      x="0"
                      y="-1"
                      fill={isSelected ? "#38bdf8" : "#f1f5f9"}
                      fontSize="10"
                      fontWeight="bold"
                      fontFamily="monospace"
                      textAnchor="middle"
                    >
                      {pt.run.overallScore}
                    </text>
                  </g>

                  {/* Run Date Label below chart */}
                  <text
                    x={pt.x}
                    y={paddingY + chartHeight + 20}
                    fill={isSelected ? "#38bdf8" : "#64748b"}
                    fontSize="10"
                    fontFamily="monospace"
                    fontWeight={isSelected ? "bold" : "normal"}
                    textAnchor="middle"
                  >
                    Run #{pt.index + 1}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Selected Point Inspector Strip */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-slate-300">
              Run #{activeRun ? activeIndex + 1 : 1} Selected:
            </span>
            <span className="font-mono font-bold text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded border border-sky-500/30">
              Score {activeRun.overallScore} / 100
            </span>
            <span className="text-slate-400 font-mono text-[11px]">
              {new Date(activeRun.generatedAt).toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </span>
          </div>

          <div className="flex items-center gap-4 text-slate-400 text-[11px] font-mono">
            <span>{activeRun.findings.length} findings</span>
            <span>•</span>
            <span className="text-emerald-400">{activeRun.evidenceCoverage}% coverage</span>
          </div>
        </div>
      </div>

      {/* Historical Runs Detailed List */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
          All Run Details (Chronological History)
        </h3>

        {historyRuns.map((rep, idx) => {
          const colors = getScoreColorClass(rep.overallScore);
          const diff =
            rep.previousOverallScore !== undefined ? rep.overallScore - rep.previousOverallScore : null;
          const runNumber = historyRuns.length - idx;
          const chronologicalIndex = historyRuns.length - 1 - idx;
          const isSelected = activeIndex === chronologicalIndex;

          return (
            <div
              key={idx}
              tabIndex={0}
              role="button"
              aria-label={`Run #${runNumber}: Score ${rep.overallScore} out of 100, ${rep.findings.length} findings, ${rep.evidenceCoverage}% coverage, generated on ${new Date(rep.generatedAt).toLocaleDateString()}`}
              onClick={() => setSelectedRunIndex(chronologicalIndex)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelectedRunIndex(chronologicalIndex);
                }
              }}
              className={`bg-[var(--v2-bg-surface-raised,#16181d)] border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer transition-all outline-none focus:ring-2 focus:ring-sky-500/50 ${
                isSelected
                  ? "border-sky-500 ring-1 ring-sky-500/30 bg-slate-800/80 shadow-md"
                  : "border-[var(--v2-border-subtle,#262930)] hover:border-slate-700"
              }`}
            >
              <div className="flex items-center gap-4">
                <div
                  className={`w-12 h-12 rounded-xl border flex flex-col items-center justify-center flex-shrink-0 ${colors.bg} ${colors.border}`}
                >
                  <span className={`text-base font-bold ${colors.text}`}>{rep.overallScore}</span>
                  <span className="text-[8px] text-slate-400 font-semibold uppercase">Score</span>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white">Run #{runNumber}</span>
                    {idx === 0 && (
                      <span className="text-[10px] bg-sky-500/20 text-sky-300 font-semibold px-2 py-0.5 rounded border border-sky-500/30 flex items-center gap-1">
                        <Sparkles className="w-2.5 h-2.5" />
                        Latest
                      </span>
                    )}
                    {diff !== null && (
                      <span
                        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex items-center gap-0.5 ${
                          diff >= 0
                            ? "bg-emerald-500/15 text-emerald-400"
                            : "bg-rose-500/15 text-rose-400"
                        }`}
                      >
                        <TrendingUp className={`w-2.5 h-2.5 ${diff < 0 ? "rotate-180" : ""}`} />
                        {diff >= 0 ? `+${diff}` : diff} pts
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 font-mono">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-slate-500" />
                      {new Date(rep.generatedAt).toLocaleString(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <FileText className="w-3.5 h-3.5 text-slate-500" />
                      {rep.findings.length} findings
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1 text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {rep.evidenceCoverage}% coverage
                    </span>
                  </div>
                </div>
              </div>

              {/* Progress Bar Visual */}
              <div className="sm:w-44 space-y-1">
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>Score</span>
                  <span className="font-mono font-bold text-slate-200">{rep.overallScore} / 100</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${colors.bar}`}
                    style={{ width: `${rep.overallScore}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {/* Accessible Screen Reader Table Fallback */}
      <div className="sr-only">
        <table>
          <caption>Historical Quality Harness Runs Summary</caption>
          <thead>
            <tr>
              <th scope="col">Run Number</th>
              <th scope="col">Date</th>
              <th scope="col">Overall Score</th>
              <th scope="col">Findings Count</th>
              <th scope="col">Evidence Coverage</th>
            </tr>
          </thead>
          <tbody>
            {historyRuns.map((r, i) => (
              <tr key={i}>
                <td>Run #{historyRuns.length - i}</td>
                <td>{new Date(r.generatedAt).toLocaleString()}</td>
                <td>{r.overallScore} / 100</td>
                <td>{r.findings.length}</td>
                <td>{r.evidenceCoverage}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
