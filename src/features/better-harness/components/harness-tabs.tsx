import React, { useRef } from "react";
import { useHarness, HarnessTab } from "../context/harness-context";
import { LayoutDashboard, AlertCircle, Activity, Layers, History } from "lucide-react";

export function HarnessTabs() {
  const { activeTab, setActiveTab, report } = useHarness();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const tabs: { id: HarnessTab; label: string; icon: React.ReactNode; count?: number }[] = [
    {
      id: "overview",
      label: "Overview",
      icon: <LayoutDashboard className="w-4 h-4" />,
    },
    {
      id: "findings",
      label: "Findings",
      icon: <AlertCircle className="w-4 h-4" />,
      count: report?.findings.filter((f) => f.status !== "fixed" && f.status !== "ignored").length,
    },
    {
      id: "sessions",
      label: "Sessions",
      icon: <Activity className="w-4 h-4" />,
      count: report?.sessions.analyzed,
    },
    {
      id: "assets",
      label: "Assets",
      icon: <Layers className="w-4 h-4" />,
    },
    {
      id: "history",
      label: "History",
      icon: <History className="w-4 h-4" />,
    },
  ];

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    let newIndex: number;
    if (e.key === "ArrowRight") {
      newIndex = (index + 1) % tabs.length;
    } else if (e.key === "ArrowLeft") {
      newIndex = (index - 1 + tabs.length) % tabs.length;
    } else if (e.key === "Home") {
      newIndex = 0;
    } else if (e.key === "End") {
      newIndex = tabs.length - 1;
    } else {
      return;
    }

    e.preventDefault();
    setActiveTab(tabs[newIndex].id);
    tabRefs.current[newIndex]?.focus();
  };

  return (
    <div className="border-b border-[var(--v2-border-subtle,#262930)] bg-[var(--v2-bg-surface,#0e0f12)] min-w-0">
      <nav
        role="tablist"
        aria-label="Better Harness Navigation Views"
        className="flex space-x-1 sm:space-x-2 px-2 sm:px-6 overflow-x-auto custom-scrollbar touch-pan-x min-w-0"
      >
        {tabs.map((tab, idx) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              ref={(el) => (tabRefs.current[idx] = el)}
              role="tab"
              aria-selected={isActive}
              aria-controls={`panel-${tab.id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(e) => handleKeyDown(e, idx)}
              className={`flex items-center gap-1.5 sm:gap-2 py-2.5 px-2.5 sm:px-3.5 text-xs font-semibold border-b-2 transition-all outline-none whitespace-nowrap min-h-[44px] shrink-0 ${
                isActive
                  ? "border-sky-500 text-sky-400 bg-sky-500/10"
                  : "border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700"
              }`}
            >
              {tab.icon}
              <span className="truncate">{tab.label}</span>
              {tab.count !== undefined && (
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono shrink-0 ${
                    isActive ? "bg-sky-500/20 text-sky-300" : "bg-slate-800 text-slate-400"
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
