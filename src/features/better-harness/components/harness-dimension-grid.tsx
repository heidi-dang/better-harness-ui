import React from "react";
import { useHarness } from "../context/harness-context";
import { HarnessDimensionCard } from "./harness-dimension-card";

export function HarnessDimensionGrid() {
  const { report, filters } = useHarness();

  if (!report) return null;

  return (
    <section aria-label="Harness Dimensions Score Grid">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-2">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
          Five Harness Dimensions
        </h2>
        <span className="text-[11px] text-slate-400">
          Click any dimension to filter findings
        </span>
      </div>

      <div className="flex sm:grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 overflow-x-auto snap-x snap-mandatory pb-2 sm:pb-0 custom-scrollbar">
        {report.dimensions.map((dim) => (
          <div
            key={dim.dimension}
            className="min-w-[200px] sm:min-w-0 flex-shrink-0 snap-start"
          >
            <HarnessDimensionCard
              scoreItem={dim}
              isSelected={filters.dimension === dim.dimension}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
