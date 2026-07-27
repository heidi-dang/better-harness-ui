import React from "react";
import { useHarness } from "../context/harness-context";
import { Activity, Clock, AlertTriangle, Repeat, ShieldAlert, Cpu } from "lucide-react";

export function HarnessSessionSummary() {
  const { report } = useHarness();

  if (!report) return null;

  const { sessions } = report;

  const metrics = [
    {
      label: "Total Sessions Analysed",
      value: sessions.analyzed,
      subtext: "Full conversation trace scans",
      icon: <Activity className="w-4 h-4 text-sky-400" />,
      color: "border-sky-500/30 text-sky-400",
    },
    {
      label: "Long Sessions (>20 turns)",
      value: sessions.longSessions,
      subtext: "Prone to prompt drift",
      icon: <Clock className="w-4 h-4 text-amber-400" />,
      color: "border-amber-500/30 text-amber-400",
    },
    {
      label: "Failed Sessions",
      value: sessions.failedSessions,
      subtext: "Unresolved agent exceptions",
      icon: <AlertTriangle className="w-4 h-4 text-rose-400" />,
      color: "border-rose-500/30 text-rose-400",
    },
    {
      label: "Repeated Failures",
      value: sessions.repeatedFailures,
      subtext: "Identical failure pattern",
      icon: <Repeat className="w-4 h-4 text-purple-400" />,
      color: "border-purple-500/30 text-purple-400",
    },
    {
      label: "Context Compactions",
      value: sessions.compactions,
      subtext: "History truncation events",
      icon: <Cpu className="w-4 h-4 text-indigo-400" />,
      color: "border-indigo-500/30 text-indigo-400",
    },
    {
      label: "Permission Interrupts",
      value: sessions.permissionInterruptions,
      subtext: "User gate approvals required",
      icon: <ShieldAlert className="w-4 h-4 text-emerald-400" />,
      color: "border-emerald-500/30 text-emerald-400",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-white">Agent Audit Sessions Health</h2>
          <p className="text-xs text-slate-400">
            Metrics aggregated across all recorded agent conversation sessions and execution logs.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {metrics.map((m, i) => (
          <div
            key={i}
            className={`bg-[var(--v2-bg-surface-raised,#16181d)] border ${m.color} rounded-xl p-4 shadow-sm space-y-2`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300">{m.label}</span>
              <div className="p-1.5 rounded-lg bg-slate-900 border border-slate-800">{m.icon}</div>
            </div>
            <div className="text-2xl font-extrabold text-white tracking-tight">{m.value}</div>
            <p className="text-[11px] text-slate-500">{m.subtext}</p>
          </div>
        ))}
      </div>

      {/* Session Health Insights Card */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-3">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
          Harness Session Insight Analysis
        </h3>
        <p className="text-xs text-slate-400 leading-relaxed">
          {sessions.failedSessions === 0
            ? "Excellent session stability detected. Zero unhandled agent session errors were recorded in this analysis window."
            : `Analysis identified ${sessions.failedSessions} failed sessions and ${sessions.compactions} context compactions. Compactions are the primary contributor to constraint drift in sessions over 20 turns.`}
        </p>
      </div>
    </div>
  );
}
