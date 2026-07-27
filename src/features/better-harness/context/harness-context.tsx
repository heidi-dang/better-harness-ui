import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  HarnessReport,
  HarnessRunProgress,
  HarnessFindingFilterState,
  HarnessDimension,
  HarnessDemoMode,
  HarnessFinding,
} from "../types";
import { HarnessDataSource } from "../api/harness-data-source";
import { HttpHarnessDataSource, HttpHarnessDataSourceConfig } from "../api/http-harness-data-source";
import { FixtureHarnessDataSource } from "../api/fixture-harness-data-source";
import { UnavailableHarnessDataSource } from "../api/unavailable-harness-data-source";
import { filterAndSortFindings } from "../utils/finding-filters";
import { validateHarnessReport } from "../schemas/harness-report";

export type HarnessTab = "overview" | "findings" | "sessions" | "assets" | "history";

export interface HarnessContextValue {
  serverKey?: string;
  /** Opaque FlowDeck-registered project identifier. Never a filesystem path. */
  projectKey: string;
  /** Cosmetic-only display path for the browser UI. Never used for API auth. */
  displayProjectPath?: string;
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
  /** Opaque FlowDeck-registered project identifier. */
  projectKey: string;
  /** Cosmetic-only display path for the UI. */
  displayProjectPath?: string;
  initialDemoMode?: HarnessDemoMode;
  httpConfig?: HttpHarnessDataSourceConfig;
}

export function HarnessProvider({
  children,
  serverKey,
  projectKey,
  displayProjectPath,
  initialDemoMode,
  httpConfig,
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
  const progressUnsubscribeRef = useRef<(() => void) | null>(null);
  const progressPollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollingActiveRef = useRef(false);
  const hasSelectedInitialFinding = useRef(false);

  /** Deterministic polling cleanup: stops polling timer and clears the ref. */
  const stopPolling = useCallback(() => {
    if (progressPollingRef.current) {
      clearTimeout(progressPollingRef.current);
      progressPollingRef.current = null;
    }
    pollingActiveRef.current = false;
  }, []);

  // Data source selection
  const dataSource = useMemo<HarnessDataSource>(() => {
    if (demoMode) {
      return new FixtureHarnessDataSource(demoMode);
    }
    if (httpConfig) {
      return new HttpHarnessDataSource(httpConfig);
    }
    return new UnavailableHarnessDataSource();
  }, [demoMode, httpConfig]);

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
          if (validation.report?.findings.length && !hasSelectedInitialFinding.current) {
            hasSelectedInitialFinding.current = true;
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
  }, [dataSource]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
    // Re-fetch when serverKey or projectDir changes (mounts a different data source)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataSource, serverKey, projectKey]);

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

  const startPollingFallback = useCallback(() => {
    if (pollingActiveRef.current) return;
    pollingActiveRef.current = true;

    const poll = async () => {
      if (!pollingActiveRef.current) return;

      try {
        const prog = await dataSource.getRunProgress?.();
        if (prog) {
          setProgress(prog);
          if (prog.status === "completed" || prog.status === "failed" || prog.status === "cancelled") {
            stopPolling();
            loadData();
            return;
          }
        }
        // prog === undefined (404/204) → keep polling
        // (run may still be initializing or was just cancelled)
      } catch {
        // Request error → keep polling (but don't start overlapping loops)
      }

      // Schedule next poll only after the current one resolves
      if (pollingActiveRef.current) {
        progressPollingRef.current = setTimeout(poll, 5000);
      }
    };

    progressPollingRef.current = setTimeout(poll, 2000);
  }, [dataSource, loadData, stopPolling]);

  const regenerateAnalysis = useCallback(async () => {
    try {
      setActionMessage({
        text: "Starting analysis regeneration...",
        type: "info",
      });

      // Stop any in-flight polling from a previous regeneration
      stopPolling();

      const res = await dataSource.regenerate();
      if (res.accepted && res.runId) {
        let sseSubscribed = false;

        // Subscribe to SSE progress if the data source supports it
        if ("subscribeToProgress" in dataSource) {
          const httpSource = dataSource as HttpHarnessDataSource;
          if (typeof httpSource.subscribeToProgress === "function") {
            // Clean up any previous subscription
            if (progressUnsubscribeRef.current) {
              progressUnsubscribeRef.current();
            }

            progressUnsubscribeRef.current = httpSource.subscribeToProgress(
              res.runId,
              (event) => {
                if (event.type === "run.progress") {
                  setProgress(event.data as HarnessRunProgress);
                }
                if (event.type === "report.completed" || event.type === "run.failed" || event.type === "run.cancelled") {
                  // Run finished — stop polling, unsubscribe, and reload
                  stopPolling();
                  if (progressUnsubscribeRef.current) {
                    progressUnsubscribeRef.current();
                    progressUnsubscribeRef.current = null;
                  }
                  loadData();
                }
              },
              () => {
                // SSE error: clean up subscription, start polling fallback
                progressUnsubscribeRef.current = null;
                startPollingFallback();
              }
            );

            sseSubscribed = true;
          }
        }

        // Only load data immediately if we didn't subscribe to SSE
        // (SSE will trigger loadData via report.completed/run.failed)
        if (!sseSubscribed) {
          await loadData();
        }
      }
    } catch (err) {
      setActionMessage({
        text: err instanceof Error ? err.message : "Regeneration request failed",
        type: "warning",
      });
    }
  }, [dataSource, loadData, stopPolling, startPollingFallback]);

  const planFixForFinding = useCallback(
    async (findingId: string) => {
      try {
        const res = await dataSource.planFix(findingId);
        if (res.accepted) {
          setActionMessage({
            text: `Fix planned for finding (Session ID: ${res.repairSessionId || "pending"}).`,
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
            text: "Finding verified and marked as fixed.",
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
            text: `Finding ignored: "${reason}"`,
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

  useEffect(() => {
    if (report) {
      const currentFiltered = filterAndSortFindings(report.findings, filters);
      const visibleIds = new Set(currentFiltered.map((f) => f.id));
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedFindingIds((prev) => prev.filter((id) => visibleIds.has(id)));
    }
  }, [report, filters]);

  const clearFindingSelection = useCallback(() => {
    setSelectedFindingIds([]);
  }, []);

  const batchPlanFix = useCallback(async () => {
    if (selectedFindingIds.length === 0 || isBatchProcessing) return;
    setIsBatchProcessing(true);

    try {
      const results = await dataSource.batchPlanFix(selectedFindingIds);
      const accepted = results.filter((r) => r.accepted);
      const failed = results.filter((r) => !r.accepted);

      if (failed.length === 0) {
        setActionMessage({
          text: `Batch fix planned for all ${accepted.length} selected findings.`,
          type: "success",
        });
        setSelectedFindingIds([]);
      } else if (accepted.length > 0) {
        setActionMessage({
          text: `Batch fix planned for ${accepted.length} findings (${failed.length} failed). Retained failed items for retry.`,
          type: "warning",
        });
        setSelectedFindingIds(failed.map((r) => r.findingId));
      } else {
        setActionMessage({
          text: `Batch fix planning failed for all ${failed.length} selected findings.`,
          type: "warning",
        });
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

      try {
        const results = await dataSource.batchIgnore(selectedFindingIds, trimmedReason);
        const accepted = results.filter((r) => r.accepted);
        const failed = results.filter((r) => !r.accepted);

        if (failed.length === 0) {
          setActionMessage({
            text: `Batch ignored ${accepted.length} findings ("${trimmedReason}").`,
            type: "info",
          });
          setSelectedFindingIds([]);
        } else if (accepted.length > 0) {
          setActionMessage({
            text: `Batch ignored ${accepted.length} findings (${failed.length} failed). Retained failed items for retry.`,
            type: "warning",
          });
          setSelectedFindingIds(failed.map((r) => r.findingId));
        } else {
          setActionMessage({
            text: `Batch ignore failed for all ${failed.length} selected findings.`,
            type: "warning",
          });
          setSelectedFindingIds(failed.map((r) => r.findingId));
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
    // Stop polling and unsubscribe from SSE before cancelling
    stopPolling();
    if (progressUnsubscribeRef.current) {
      progressUnsubscribeRef.current();
      progressUnsubscribeRef.current = null;
    }
    setProgress(undefined);

    await dataSource.cancel();
    setActionMessage({
      text: "Analysis cancelled.",
      type: "info",
    });
    await loadData();
  }, [dataSource, loadData, stopPolling]);

  // Clean up SSE subscription and polling on unmount
  useEffect(() => {
    return () => {
      if (progressUnsubscribeRef.current) {
        progressUnsubscribeRef.current();
        progressUnsubscribeRef.current = null;
      }
      stopPolling();
    };
  }, [stopPolling]);

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
    projectKey,
    displayProjectPath,
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
