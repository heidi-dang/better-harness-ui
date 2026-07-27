import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from "react";
import {
  HarnessReport,
  HarnessRunProgress,
  HarnessFindingFilterState,
  HarnessDimension,
  HarnessDemoMode,
  HarnessFinding,
} from "../types";
import { HarnessDataSource } from "../api/harness-data-source";
import { FixtureHarnessDataSource } from "../api/fixture-harness-data-source";
import { UnavailableHarnessDataSource } from "../api/unavailable-harness-data-source";
import { filterAndSortFindings } from "../utils/finding-filters";
import { validateHarnessReport } from "../schemas/harness-report";

export type HarnessTab = "overview" | "findings" | "sessions" | "assets" | "history";

export interface HarnessContextValue {
  serverKey?: string;
  projectDir: string;
  report: HarnessReport | undefined;
  rawReport: unknown;
  progress: HarnessRunProgress | undefined;
  availability: { available: boolean; reason?: string };
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
  isUnsupportedSchema: boolean;
  activeTab: HarnessTab;
  setActiveTab: (tab: HarnessTab) => void;
  filters: HarnessFindingFilterState;
  setFilters: React.Dispatch<React.SetStateAction<HarnessFindingFilterState>>;
  filteredFindings: HarnessFinding[];
  selectedFindingId: string | undefined;
  selectedFinding: HarnessFinding | undefined;
  setSelectedFindingId: (id: string | undefined) => void;
  isMobileDrawerOpen: boolean;
  setIsMobileDrawerOpen: (open: boolean) => void;
  demoMode: HarnessDemoMode | undefined;
  setDemoMode: (mode: HarnessDemoMode | undefined) => void;
  actionMessage: { text: string; type: "info" | "success" | "warning" } | null;
  setActionMessage: (msg: { text: string; type: "info" | "success" | "warning" } | null) => void;
  // Selection & Batch State
  selectedFindingIds: string[];
  isBatchProcessing: boolean;
  toggleSelectFinding: (id: string) => void;
  selectAllFindings: () => void;
  clearFindingSelection: () => void;
  batchPlanFix: () => Promise<void>;
  batchIgnore: (reason: string) => Promise<void>;
  // Actions
  refreshReport: () => Promise<void>;
  regenerateAnalysis: () => Promise<void>;
  planFixForFinding: (findingId: string) => Promise<void>;
  verifyFixForFinding: (findingId: string) => Promise<void>;
  ignoreFinding: (findingId: string, reason: string) => Promise<void>;
  cancelAnalysis: () => Promise<void>;
  selectDimensionFilter: (dimension: HarnessDimension) => void;
  clearFilters: () => void;
  dataSource: HarnessDataSource;
}

const DEFAULT_FILTERS: HarnessFindingFilterState = {
  searchQuery: "",
  dimension: "all",
  priority: "all",
  status: "all",
  recommendedVehicle: "all",
  sortBy: "priority",
  sortOrder: "desc",
};

const HarnessContext = createContext<HarnessContextValue | undefined>(undefined);

export interface HarnessProviderProps {
  children: React.ReactNode;
  serverKey?: string;
  projectDir: string;
  initialDemoMode?: HarnessDemoMode;
}

export function HarnessProvider({
  children,
  serverKey,
  projectDir,
  initialDemoMode,
}: HarnessProviderProps) {
  // Check URL query parameters for demo mode
  const getDemoModeFromUrl = (): HarnessDemoMode | undefined => {
    if (typeof window === "undefined") return initialDemoMode;
    const params = new URLSearchParams(window.location.search);
    const demoParam = params.get("betterHarnessDemo") as HarnessDemoMode | null;
    if (demoParam) return demoParam;
    return initialDemoMode;
  };

  const [demoMode, setDemoModeState] = useState<HarnessDemoMode | undefined>(getDemoModeFromUrl());
  const [activeTab, setActiveTab] = useState<HarnessTab>("overview");
  const [filters, setFilters] = useState<HarnessFindingFilterState>(DEFAULT_FILTERS);
  const [selectedFindingId, setSelectedFindingId] = useState<string | undefined>(undefined);
  const [selectedFindingIds, setSelectedFindingIds] = useState<string[]>([]);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [actionMessage, setActionMessage] = useState<{
    text: string;
    type: "info" | "success" | "warning";
  } | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const [isUnsupportedSchema, setIsUnsupportedSchema] = useState(false);

  const [availability, setAvailability] = useState<{ available: boolean; reason?: string }>({
    available: true,
  });
  const [report, setReport] = useState<HarnessReport | undefined>(undefined);
  const [rawReport, setRawReport] = useState<unknown>(undefined);
  const [progress, setProgress] = useState<HarnessRunProgress | undefined>(undefined);

  // Data source selection
  const dataSource = useMemo<HarnessDataSource>(() => {
    if (demoMode) {
      return new FixtureHarnessDataSource(demoMode);
    }
    // In production without demo parameter, default to UnavailableHarnessDataSource
    const isProd = process.env.NODE_ENV === "production";
    if (isProd) {
      return new UnavailableHarnessDataSource();
    }
    // In development environment, default to FixtureHarnessDataSource
    return new FixtureHarnessDataSource("completed");
  }, [demoMode]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setIsError(false);
    setErrorMessage(undefined);
    setIsUnsupportedSchema(false);

    try {
      const avail = await dataSource.availability();
      setAvailability(avail);

      if (!avail.available) {
        setIsLoading(false);
        setReport(undefined);
        return;
      }

      if (dataSource.getRunProgress) {
        const prog = await dataSource.getRunProgress();
        setProgress(prog);
      }

      const rep = await dataSource.getReport();
      setRawReport(rep);

      if (rep) {
        const validation = validateHarnessReport(rep);
        if (!validation.valid) {
          setIsUnsupportedSchema(true);
          setErrorMessage(validation.error || "Unsupported schema version");
          setReport(undefined);
        } else {
          setReport(validation.report);
          if (validation.report?.findings.length && !selectedFindingId) {
            setSelectedFindingId(validation.report.findings[0].id);
          }
        }
      } else {
        setReport(undefined);
      }
    } catch (err) {
      setIsError(true);
      setErrorMessage(err instanceof Error ? err.message : "Failed to load harness report");
    } finally {
      setIsLoading(false);
    }
  }, [dataSource, selectedFindingId]);

  useEffect(() => {
    loadData();
  }, [loadData, serverKey, projectDir]);

  const setDemoMode = useCallback((mode: HarnessDemoMode | undefined) => {
    setDemoModeState(mode);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (mode) {
        url.searchParams.set("betterHarnessDemo", mode);
      } else {
        url.searchParams.delete("betterHarnessDemo");
      }
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  const refreshReport = useCallback(async () => {
    await loadData();
  }, [loadData]);

  const regenerateAnalysis = useCallback(async () => {
    try {
      setActionMessage({
        text: "Regeneration requested (UI-only mode). FlowDeck engine adapter is pending next phase.",
        type: "info",
      });
      const res = await dataSource.regenerate();
      if (res.accepted) {
        await loadData();
      }
    } catch (err) {
      setActionMessage({
        text: err instanceof Error ? err.message : "Regeneration request failed",
        type: "warning",
      });
    }
  }, [dataSource, loadData]);

  const planFixForFinding = useCallback(
    async (findingId: string) => {
      try {
        const res = await dataSource.planFix(findingId);
        if (res.accepted) {
          setActionMessage({
            text: `Plan created in UI mode (Session ID: ${res.repairSessionId || "demo-session"}). No FlowDeck execution triggered.`,
            type: "success",
          });
          await loadData();
        }
      } catch (err) {
        setActionMessage({
          text: err instanceof Error ? err.message : "Plan creation failed",
          type: "warning",
        });
      }
    },
    [dataSource, loadData]
  );

  const verifyFixForFinding = useCallback(
    async (findingId: string) => {
      try {
        const res = await dataSource.verify(findingId);
        if (res.accepted) {
          setActionMessage({
            text: "Finding verified and marked as fixed in UI preview mode.",
            type: "success",
          });
          await loadData();
        }
      } catch (err) {
        setActionMessage({
          text: err instanceof Error ? err.message : "Verification failed",
          type: "warning",
        });
      }
    },
    [dataSource, loadData]
  );

  const ignoreFinding = useCallback(
    async (findingId: string, reason: string) => {
      try {
        const res = await dataSource.ignore(findingId, reason);
        if (res.accepted) {
          setActionMessage({
            text: `Finding ignored in UI preview mode: "${reason}"`,
            type: "info",
          });
          await loadData();
        }
      } catch (err) {
        setActionMessage({
          text: err instanceof Error ? err.message : "Ignore action failed",
          type: "warning",
        });
      }
    },
    [dataSource, loadData]
  );

  const toggleSelectFinding = useCallback((id: string) => {
    setSelectedFindingIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  }, []);

  const selectAllFindings = useCallback(() => {
    if (!report) return;
    const currentFiltered = filterAndSortFindings(report.findings, filters);
    const allIds = currentFiltered.map((f) => f.id);
    if (allIds.length === 0) return;

    setSelectedFindingIds((prev) => {
      const allVisibleSelected = allIds.every((id) => prev.includes(id));
      if (allVisibleSelected) {
        return prev.filter((id) => !allIds.includes(id));
      } else {
        const union = new Set([...prev, ...allIds]);
        return Array.from(union);
      }
    });
  }, [report, filters]);

  // Reconcile selection when report or filters update
  useEffect(() => {
    if (report) {
      const currentFiltered = filterAndSortFindings(report.findings, filters);
      const visibleIds = new Set(currentFiltered.map((f) => f.id));
      setSelectedFindingIds((prev) => prev.filter((id) => visibleIds.has(id)));
    }
  }, [report, filters]);

  const clearFindingSelection = useCallback(() => {
    setSelectedFindingIds([]);
  }, []);

  const batchPlanFix = useCallback(async () => {
    if (selectedFindingIds.length === 0 || isBatchProcessing) return;
    setIsBatchProcessing(true);
    let successCount = 0;
    const failedIds: string[] = [];

    try {
      for (const id of selectedFindingIds) {
        try {
          const res = await dataSource.planFix(id);
          if (res.accepted) {
            successCount++;
          } else {
            failedIds.push(id);
          }
        } catch {
          failedIds.push(id);
        }
      }

      if (failedIds.length === 0) {
        setActionMessage({
          text: `Batch fix planned for all ${successCount} selected findings.`,
          type: "success",
        });
        setSelectedFindingIds([]);
      } else if (successCount > 0) {
        setActionMessage({
          text: `Batch fix planned for ${successCount} findings (${failedIds.length} failed). Retained failed items for retry.`,
          type: "warning",
        });
        setSelectedFindingIds(failedIds);
      } else {
        setActionMessage({
          text: `Batch fix planning failed for all ${failedIds.length} selected findings.`,
          type: "warning",
        });
        setSelectedFindingIds(failedIds);
      }
      await loadData();
    } catch (err) {
      setActionMessage({
        text: err instanceof Error ? err.message : "Batch fix planning failed",
        type: "warning",
      });
    } finally {
      setIsBatchProcessing(false);
    }
  }, [selectedFindingIds, isBatchProcessing, dataSource, loadData]);

  const batchIgnore = useCallback(
    async (reason: string) => {
      const trimmedReason = reason ? reason.trim() : "";
      if (selectedFindingIds.length === 0 || isBatchProcessing || trimmedReason.length < 3) return;
      setIsBatchProcessing(true);
      let successCount = 0;
      const failedIds: string[] = [];

      try {
        for (const id of selectedFindingIds) {
          try {
            const res = await dataSource.ignore(id, trimmedReason);
            if (res.accepted) {
              successCount++;
            } else {
              failedIds.push(id);
            }
          } catch {
            failedIds.push(id);
          }
        }

        if (failedIds.length === 0) {
          setActionMessage({
            text: `Batch ignored ${successCount} findings ("${trimmedReason}").`,
            type: "info",
          });
          setSelectedFindingIds([]);
        } else if (successCount > 0) {
          setActionMessage({
            text: `Batch ignored ${successCount} findings (${failedIds.length} failed). Retained failed items for retry.`,
            type: "warning",
          });
          setSelectedFindingIds(failedIds);
        } else {
          setActionMessage({
            text: `Batch ignore failed for all ${failedIds.length} selected findings.`,
            type: "warning",
          });
          setSelectedFindingIds(failedIds);
        }
        await loadData();
      } catch (err) {
        setActionMessage({
          text: err instanceof Error ? err.message : "Batch ignore failed",
          type: "warning",
        });
      } finally {
        setIsBatchProcessing(false);
      }
    },
    [selectedFindingIds, isBatchProcessing, dataSource, loadData]
  );

  const cancelAnalysis = useCallback(async () => {
    await dataSource.cancel();
    setActionMessage({
      text: "Analysis cancelled (UI preview mode).",
      type: "info",
    });
    await loadData();
  }, [dataSource, loadData]);

  const selectDimensionFilter = useCallback((dimension: HarnessDimension) => {
    setFilters((prev) => ({
      ...prev,
      dimension,
    }));
    setActiveTab("findings");
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
  }, []);

  const filteredFindings = useMemo(() => {
    if (!report) return [];
    return filterAndSortFindings(report.findings, filters);
  }, [report, filters]);

  const selectedFinding = useMemo(() => {
    if (!report) return undefined;
    return report.findings.find((f) => f.id === selectedFindingId) || report.findings[0];
  }, [report, selectedFindingId]);

  const value: HarnessContextValue = {
    serverKey,
    projectDir,
    report,
    rawReport,
    progress,
    availability,
    isLoading,
    isError,
    errorMessage,
    isUnsupportedSchema,
    activeTab,
    setActiveTab,
    filters,
    setFilters,
    filteredFindings,
    selectedFindingId,
    selectedFinding,
    setSelectedFindingId,
    selectedFindingIds,
    isBatchProcessing,
    toggleSelectFinding,
    selectAllFindings,
    clearFindingSelection,
    batchPlanFix,
    batchIgnore,
    isMobileDrawerOpen,
    setIsMobileDrawerOpen,
    demoMode,
    setDemoMode,
    actionMessage,
    setActionMessage,
    refreshReport,
    regenerateAnalysis,
    planFixForFinding,
    verifyFixForFinding,
    ignoreFinding,
    cancelAnalysis,
    selectDimensionFilter,
    clearFilters,
    dataSource,
  };

  return <HarnessContext.Provider value={value}>{children}</HarnessContext.Provider>;
}

export function useHarness(): HarnessContextValue {
  const ctx = useContext(HarnessContext);
  if (!ctx) {
    throw new Error("useHarness must be used within a HarnessProvider");
  }
  return ctx;
}
