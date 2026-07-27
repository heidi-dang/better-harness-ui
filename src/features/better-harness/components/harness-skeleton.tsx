import React from "react";

export function HarnessSkeleton() {
  return (
    <div className="space-y-6 animate-pulse p-4 sm:p-6" aria-label="Loading Better Harness data">
      {/* Overall Score Skeleton */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 h-32" />

      {/* Dimensions Grid Skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="bg-slate-900/80 border border-slate-800 rounded-xl h-28" />
        ))}
      </div>

      {/* Tabs Skeleton */}
      <div className="bg-slate-900/50 border-b border-slate-800 h-12 rounded-t-lg" />

      {/* Split Pane Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 h-96">
        <div className="md:col-span-5 bg-slate-900/80 border border-slate-800 rounded-xl" />
        <div className="hidden md:block md:col-span-7 bg-slate-900/80 border border-slate-800 rounded-xl" />
      </div>
    </div>
  );
}
