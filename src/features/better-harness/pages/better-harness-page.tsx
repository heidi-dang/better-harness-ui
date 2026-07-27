import React, { useEffect } from "react";
import { useHarness, HarnessProvider } from "../context/harness-context";
import { HttpHarnessDataSourceConfig } from "../api/http-harness-data-source";
import { HarnessHeader } from "../components/harness-header";
import { HarnessOverallScore } from "../components/harness-overall-score";
import { HarnessDimensionGrid } from "../components/harness-dimension-grid";
import { HarnessProgress } from "../components/harness-progress";
import { HarnessTabs } from "../components/harness-tabs";
import { HarnessFindingFilters } from "../components/harness-finding-filters";
import { HarnessFindingList } from "../components/harness-finding-list";
import { HarnessFindingDetail } from "../components/harness-finding-detail";
import { HarnessSessionSummary } from "../components/harness-session-summary";
import { HarnessAssetsPanel } from "../components/harness-assets-panel";
import { HarnessHistoryView } from "../components/harness-history-view";
import { HarnessEmptyState } from "../components/harness-empty-state";
import { HarnessUnavailableState } from "../components/harness-unavailable-state";
import { HarnessErrorState } from "../components/harness-error-state";
import { HarnessSkeleton } from "../components/harness-skeleton";
import { X } from "lucide-react";

function BetterHarnessPageContent() {
  const {
    report,
    isLoading,
    isError,
    isUnsupportedSchema,
    availability,
    activeTab,
    isMobileDrawerOpen,
    setIsMobileDrawerOpen,
    selectedFinding,
  } = useHarness();

  const drawerRef = React.useRef<HTMLDivElement>(null);
  const closeBtnRef = React.useRef<HTMLButtonElement>(null);
  const previousFocusRef = React.useRef<HTMLElement | null>(null);

  // Focus placement and focus restoration for mobile drawer
  useEffect(() => {
    if (isMobileDrawerOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      setTimeout(() => {
        closeBtnRef.current?.focus();
      }, 50);
    } else if (previousFocusRef.current) {
      previousFocusRef.current.focus();
    }
  }, [isMobileDrawerOpen]);

  // Focus trapping and Escape key handler for mobile drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isMobileDrawerOpen) return;

      if (e.key === "Escape") {
        setIsMobileDrawerOpen(false);
        return;
      }

      if (e.key === "Tab" && drawerRef.current) {
        const focusables = drawerRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMobileDrawerOpen, setIsMobileDrawerOpen]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--v2-bg-surface,#0e0f12)] text-[var(--v2-text-primary,#f8fafc)]">
        <HarnessHeader />
        <main className="max-w-7xl mx-auto py-6">
          <HarnessSkeleton />
        </main>
      </div>
    );
  }

  if (isError || isUnsupportedSchema) {
    return (
      <div className="min-h-screen bg-[var(--v2-bg-surface,#0e0f12)] text-[var(--v2-text-primary,#f8fafc)]">
        <HarnessHeader />
        <main className="max-w-7xl mx-auto px-4 py-6">
          <HarnessErrorState />
        </main>
      </div>
    );
  }

  if (!availability.available) {
    return (
      <div className="min-h-screen bg-[var(--v2-bg-surface,#0e0f12)] text-[var(--v2-text-primary,#f8fafc)]">
        <HarnessHeader />
        <main className="max-w-7xl mx-auto px-4 py-6">
          <HarnessUnavailableState />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--v2-bg-surface,#0e0f12)] text-[var(--v2-text-primary,#f8fafc)] font-sans antialiased">
      {/* Main Page Container (hidden from AT when mobile drawer modal is open) */}
      <div aria-hidden={isMobileDrawerOpen ? "true" : undefined}>
        {/* Header */}
        <HarnessHeader />

        {/* Main Content Shell */}
        <main className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-6">
          {/* Progress Bar for Running Analysis */}
          <HarnessProgress />

          {/* Top Summary + Dimension Grid (always visible if report loaded) */}
          {report && (
            <div className="space-y-4 sm:space-y-6">
              <HarnessOverallScore />
              <HarnessDimensionGrid />
            </div>
          )}

          {/* Navigation Tabs */}
          <HarnessTabs />

          {/* Tab Content Panels */}
          <div className="mt-4">
            {/* OVERVIEW / FINDINGS TAB */}
            {(activeTab === "overview" || activeTab === "findings") && (
              <div className="space-y-4">
                {report?.findings.length === 0 ? (
                  <HarnessEmptyState />
                ) : (
                  <>
                    <HarnessFindingFilters />

                    {/* Desktop Two-Panel Split Layout */}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
                      {/* Left Panel: Findings List */}
                      <div className="md:col-span-5 lg:col-span-5">
                        <HarnessFindingList />
                      </div>

                      {/* Right Panel: Sticky Finding Detail (Desktop) */}
                      <div className="hidden md:block md:col-span-7 lg:col-span-7 sticky top-6">
                        <HarnessFindingDetail />
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* SESSIONS TAB */}
            {activeTab === "sessions" && <HarnessSessionSummary />}

            {/* ASSETS TAB */}
            {activeTab === "assets" && <HarnessAssetsPanel />}

            {/* HISTORY TAB */}
            {activeTab === "history" && <HarnessHistoryView />}
          </div>
        </main>
      </div>

      {/* Mobile Finding Detail Drawer / Overlay (for viewports < 768px) */}
      {isMobileDrawerOpen && selectedFinding && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Finding Detail: ${selectedFinding.title}`}
          className="fixed inset-0 z-50 md:hidden bg-black/70 backdrop-blur-xs flex justify-end animate-fade-in"
        >
          <div
            ref={drawerRef}
            className="w-full max-w-lg bg-[var(--v2-bg-surface-raised,#16181d)] h-full overflow-y-auto p-4 space-y-4 shadow-2xl relative flex flex-col"
            style={{ paddingTop: "max(1rem, env(safe-area-inset-top, 0px))", paddingRight: "max(1rem, env(safe-area-inset-right, 0px))", paddingBottom: "max(1rem, env(safe-area-inset-bottom, 0px))", paddingLeft: "max(1rem, env(safe-area-inset-left, 0px))" }}
          >
            {/* Sticky Mobile Header */}
            <div className="sticky top-0 bg-[var(--v2-bg-surface-raised,#16181d)] z-10 py-2 border-b border-slate-800 flex items-center justify-between">
              <span className="text-xs font-bold text-sky-400 font-mono">
                {selectedFinding.id}
              </span>
              <button
                ref={closeBtnRef}
                onClick={() => setIsMobileDrawerOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg bg-slate-900 border border-slate-800 min-h-[44px] min-w-[44px] flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-sky-500"
                aria-label="Close details drawer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mobile Detail Content */}
            <div className="flex-1">
              <HarnessFindingDetail />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export interface BetterHarnessPageProps {
  serverKey?: string;
  projectKey: string;
  displayProjectPath?: string;
  httpConfig?: HttpHarnessDataSourceConfig;
}

export function BetterHarnessPage({
  serverKey,
  projectKey,
  displayProjectPath,
  httpConfig,
}: BetterHarnessPageProps) {
  return (
    <HarnessProvider
      serverKey={serverKey}
      projectKey={projectKey}
      displayProjectPath={displayProjectPath}
      httpConfig={httpConfig}
    >
      <BetterHarnessPageContent />
    </HarnessProvider>
  );
}

export default BetterHarnessPage;
