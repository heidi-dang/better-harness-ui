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

      <div className="flex sm:grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 overflow-x-auto snap-x snap-mandatory pb-3 sm:pb-0 custom-scrollbar touch-pan-x -mx-3 sm:mx-0 px-3 sm:px-0">
        {report.dimensions.map((dim) => (
          <div
            key={dim.dimension}
            className="min-w-[200px] sm:min-w-0 w-full flex-shrink-0 snap-start"
          >
            <HarnessDimensionCard
              scoreItem={dim}
              isSelected={filters.dimension === dim.dimension}
            />
          </div>
        ))}
      </div>
      {/* Mobile scroll affordance indicator */}
      <div className="flex sm:hidden items-center justify-center gap-1 mt-1">
        <span className="text-[10px] text-slate-500">Scroll for more dimensions</span>
        <span className="text-xs text-slate-500">&rarr;</span>
      </div>
    </section>
  );
}
