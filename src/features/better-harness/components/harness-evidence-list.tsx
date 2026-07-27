import React from "react";
import { HarnessEvidence } from "../types";
import { FileCode, Terminal, Layers, Clock, ShieldCheck } from "lucide-react";

export interface HarnessEvidenceListProps {
  evidenceList: HarnessEvidence[];
}

export function HarnessEvidenceList({ evidenceList }: HarnessEvidenceListProps) {
  if (!evidenceList || evidenceList.length === 0) {
    return (
      <p className="text-xs text-slate-500 italic p-3 bg-slate-900/50 rounded-lg">
        No specific evidence items recorded for this finding.
      </p>
    );
  }

  const getCategoryIcon = (category: HarnessEvidence["category"]) => {
    switch (category) {
      case "customization":
        return <FileCode className="w-3.5 h-3.5 text-sky-400" />;
      case "session":
        return <Terminal className="w-3.5 h-3.5 text-purple-400" />;
      case "foundation":
        return <Layers className="w-3.5 h-3.5 text-emerald-400" />;
    }
  };

  return (
    <div className="space-y-2">
      {evidenceList.map((evi) => (
        <div
          key={evi.id}
          className="bg-slate-900/80 border border-slate-800 rounded-lg p-3 text-xs space-y-1.5"
        >
          <div className="flex flex-wrap items-center justify-between gap-1">
            <div className="flex items-center gap-1.5">
              <span className="p-1 rounded bg-slate-800 border border-slate-700">
                {getCategoryIcon(evi.category)}
              </span>
              <span className="font-semibold text-slate-200 capitalize">
                {evi.category} Evidence
              </span>
              <span className="text-[10px] text-slate-500 font-mono">({evi.id})</span>
            </div>

            <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-mono">
              <ShieldCheck className="w-3 h-3 text-emerald-400" />
              <span>{Math.round(evi.confidence * 100)}% confidence</span>
            </div>
          </div>

          <p className="text-slate-300 leading-relaxed font-sans">{evi.summary}</p>

          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400 pt-1.5 border-t border-slate-800/80">
            <span className="font-mono text-slate-400 break-all max-w-full">
              Source: {evi.path || evi.sessionId || evi.source}
            </span>
            <span className="flex items-center gap-1 text-[10px] text-slate-500 shrink-0">
              <Clock className="w-3 h-3" />
              {new Date(evi.collectedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
