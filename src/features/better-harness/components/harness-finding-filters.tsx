import React from "react";
import { useHarness } from "../context/harness-context";
import {
  HarnessDimension,
  HarnessPriority,
  HarnessFindingStatus,
  HarnessFixVehicle,
  HarnessFindingFilterState,
} from "../types";
import { formatDimensionName, getVehicleLabel } from "../utils/score-format";
import { Search, Filter, X, ArrowUpDown } from "lucide-react";

export function HarnessFindingFilters() {
  const { filters, setFilters, clearFilters, filteredFindings, report } = useHarness();

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilters((prev) => ({ ...prev, searchQuery: e.target.value }));
  };

  const hasActiveFilters =
    filters.searchQuery !== "" ||
    filters.dimension !== "all" ||
    filters.priority !== "all" ||
    filters.status !== "all" ||
    filters.recommendedVehicle !== "all";

  return (
    <div className="bg-[var(--v2-bg-surface-raised,#16181d)] border border-[var(--v2-border-subtle,#262930)] rounded-xl p-3 sm:p-4 mb-4 space-y-3">
      {/* Top Bar: Search + Quick Stats */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={filters.searchQuery}
            onChange={handleSearchChange}
            placeholder="Search findings by ID, title, cause, vehicle, or path..."
            className="w-full bg-slate-900 border border-slate-700/80 rounded-lg pl-9 pr-8 py-2 text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 min-h-[44px]"
            aria-label="Search findings"
          />
          {filters.searchQuery && (
            <button
              onClick={() => setFilters((prev) => ({ ...prev, searchQuery: "" }))}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1"
              aria-label="Clear search input"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-2 text-xs text-slate-400 flex-wrap">
          <span className="font-mono">
            Showing <strong className="text-white">{filteredFindings.length}</strong> of{" "}
            <strong className="text-slate-300">{report?.findings.length || 0}</strong> findings
          </span>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="px-2.5 py-1.5 text-[11px] font-medium text-sky-400 hover:text-sky-300 bg-sky-500/10 hover:bg-sky-500/20 rounded border border-sky-500/30 transition-colors flex items-center gap-1 min-h-[36px]"
            >
              <X className="w-3 h-3" />
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Filter Dropdowns Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 pt-2 border-t border-slate-800/80">
        {/* Dimension Filter */}
        <div>
          <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">
            Dimension
          </label>
          <select
            value={filters.dimension}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                dimension: e.target.value as HarnessDimension | "all",
              }))
            }
            className="w-full bg-slate-900 border border-slate-700 rounded-md px-2 py-2 text-xs text-slate-200 focus:ring-1 focus:ring-sky-500 min-h-[44px]"
            aria-label="Filter by dimension"
          >
            <option value="all">All Dimensions</option>
            <option value="task-understanding">Task Understanding</option>
            <option value="controlled-execution">Controlled Execution</option>
            <option value="change-validation">Change Validation</option>
            <option value="reliable-delivery">Reliable Delivery</option>
            <option value="learning-capture">Learning Capture</option>
          </select>
        </div>

        {/* Priority Filter */}
        <div>
          <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">
            Priority
          </label>
          <select
            value={filters.priority}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                priority: e.target.value as HarnessPriority | "all",
              }))
            }
            className="w-full bg-slate-900 border border-slate-700 rounded-md px-2 py-2 text-xs text-slate-200 focus:ring-1 focus:ring-sky-500 min-h-[44px]"
            aria-label="Filter by priority"
          >
            <option value="all">All Priorities</option>
            <option value="high">High Priority</option>
            <option value="medium">Medium Priority</option>
            <option value="low">Low Priority</option>
          </select>
        </div>

        {/* Status Filter */}
        <div>
          <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">
            Status
          </label>
          <select
            value={filters.status}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                status: e.target.value as HarnessFindingStatus | "all",
              }))
            }
            className="w-full bg-slate-900 border border-slate-700 rounded-md px-2 py-2 text-xs text-slate-200 focus:ring-1 focus:ring-sky-500 min-h-[44px]"
            aria-label="Filter by status"
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="planning">Planning</option>
            <option value="processing">Processing</option>
            <option value="fixed">Fixed</option>
            <option value="ignored">Ignored</option>
            <option value="regressed">Regressed</option>
          </select>
        </div>

        {/* Vehicle Filter */}
        <div>
          <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">
            Repair Vehicle
          </label>
          <select
            value={filters.recommendedVehicle}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                recommendedVehicle: e.target.value as HarnessFixVehicle | "all",
              }))
            }
            className="w-full bg-slate-900 border border-slate-700 rounded-md px-2 py-2 text-xs text-slate-200 focus:ring-1 focus:ring-sky-500 min-h-[44px]"
            aria-label="Filter by repair vehicle"
          >
            <option value="all">All Fix Vehicles</option>
            <option value="rule">Rule (AGENTS.md)</option>
            <option value="skill">Skill (SKILL.md)</option>
            <option value="hook">Git Hook</option>
            <option value="script">Automation Script</option>
            <option value="command">Command Palette</option>
            <option value="agent">Sub-Agent Policy</option>
            <option value="ci-workflow">CI/CD Workflow</option>
            <option value="automation">Automation Runner</option>
            <option value="human-gate">Human Gate Policy</option>
            <option value="documentation">Documentation</option>
          </select>
        </div>

        {/* Sort By */}
        <div className="sm:col-span-2 md:col-span-1">
          <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1 flex items-center justify-between">
            <span>Sort By</span>
            <button
              onClick={() =>
                setFilters((prev) => ({
                  ...prev,
                  sortOrder: prev.sortOrder === "asc" ? "desc" : "asc",
                }))
              }
              className="text-[10px] text-sky-400 hover:text-sky-300 flex items-center gap-1 px-2 py-1.5 rounded-md hover:bg-sky-500/10 min-h-[44px]"
              title="Toggle sort direction"
              aria-label={`Sort direction: ${filters.sortOrder === "asc" ? "ascending" : "descending"}. Click to toggle.`}
            >
              <ArrowUpDown className="w-3 h-3" />
              {filters.sortOrder.toUpperCase()}
            </button>
          </label>
          <select
            value={filters.sortBy}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                sortBy: e.target.value as HarnessFindingFilterState["sortBy"],
              }))
            }
            className="w-full bg-slate-900 border border-slate-700 rounded-md px-2 py-2 text-xs text-slate-200 focus:ring-1 focus:ring-sky-500 min-h-[44px]"
            aria-label="Sort findings by"
          >
            <option value="priority">Priority Weight</option>
            <option value="status">Status Severity</option>
            <option value="recent">Most Recent</option>
            <option value="dimension">Dimension Name</option>
            <option value="title">Title A-Z</option>
          </select>
        </div>
      </div>
    </div>
  );
}
