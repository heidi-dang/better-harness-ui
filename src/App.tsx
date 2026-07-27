import React, { useState, useEffect, useMemo } from "react";
import BetterHarnessPage from "./features/better-harness/pages/better-harness-page";
import { parseHarnessRoute, buildHarnessRoute } from "./features/better-harness/utils/harness-route";
import { HttpHarnessDataSourceConfig } from "./features/better-harness/api/http-harness-data-source";
import { Command, Server, FolderGit2, Sparkles, RefreshCw } from "lucide-react";

export default function App() {
  const [currentPath, setCurrentPath] = useState(() =>
    typeof window !== "undefined" ? window.location.pathname : "/"
  );
  const [showCommandPalette, setShowCommandPalette] = useState(false);

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // Keyboard shortcut for command palette (Cmd+K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setShowCommandPalette((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Parse route — extract serverKey (opaque), projectKey (opaque), displayProjectPath (cosmetic)
  const routeInfo = parseHarnessRoute(currentPath);
  const serverKey = routeInfo.serverKey;
  const projectKey = routeInfo.projectKey;
  const displayProjectPath = routeInfo.displayProjectPath;

  // Build httpConfig ONLY when both serverKey and projectKey are present.
  // Missing configuration selects UnavailableHarnessDataSource and makes zero requests.
  const httpConfig = useMemo<HttpHarnessDataSourceConfig | undefined>(() => {
    const baseUrl = import.meta.env.VITE_HARNESS_API_URL;
    if (!baseUrl || !serverKey || !projectKey) return undefined;

    return {
      baseUrl,
      serverKey,
      projectKey,
      displayProjectPath,
      authToken: import.meta.env.VITE_HARNESS_AUTH_TOKEN || undefined,
    };
  }, [serverKey, projectKey, displayProjectPath]);

  const navigateTo = (
    newServer: string | undefined,
    newProjectKey: string,
    newDisplayPath?: string,
  ) => {
    const newRoute = buildHarnessRoute(newServer, newProjectKey, newDisplayPath);
    window.history.pushState({}, "", newRoute);
    setCurrentPath(newRoute);
    setShowCommandPalette(false);
  };

  return (
    <div className="relative min-h-screen bg-[#0e0f12] overflow-x-hidden">
      {/* Top OpenCode App Navigation Header */}
      <nav className="bg-[#121418] border-b border-[#22252c] px-3 sm:px-4 py-2 text-xs text-slate-300">
        {/* Mobile: Two-row stacked layout below 640px */}
        <div className="flex flex-col sm:hidden gap-1.5 min-w-0">
          {/* Row 1: Identity + Command Palette trigger */}
          <div className="flex items-center justify-between min-w-0">
            <div className="flex items-center gap-1.5 font-bold text-white text-sm min-w-0">
              <span className="w-2.5 h-2.5 rounded-full bg-sky-500 animate-pulse shrink-0" />
              <span className="truncate">OpenCode Web UI</span>
            </div>
            <button
              onClick={() => setShowCommandPalette(true)}
              className="shrink-0 ml-2 p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg border border-slate-700 transition-colors flex items-center justify-center min-h-[44px] min-w-[44px]"
              aria-label="Open command palette"
            >
              <Command className="w-4 h-4" />
            </button>
          </div>
          {/* Row 2: Server + Project path */}
          <div className="flex items-center gap-1 min-w-0 overflow-hidden">
            {serverKey && (
              <>
                <div className="flex items-center gap-1 text-slate-300 bg-slate-900 px-2 py-1 rounded border border-slate-800 min-w-0 max-w-[45%]">
                  <Server className="w-3 h-3 text-sky-400 shrink-0" />
                  <span className="font-mono text-slate-200 truncate block min-w-0">{serverKey}</span>
                </div>
                <span className="text-slate-600 shrink-0">/</span>
              </>
            )}
            <div className="flex items-center gap-1 text-slate-300 bg-slate-900 px-2 py-1 rounded border border-slate-800 min-w-0 max-w-[50%]">
              <FolderGit2 className="w-3 h-3 text-purple-400 shrink-0" />
              <span className="font-mono text-slate-200 truncate block min-w-0">
                {displayProjectPath || projectKey || "No project configured"}
              </span>
            </div>
          </div>
        </div>

        {/* Desktop: Single row layout above 640px */}
        <div className="hidden sm:flex items-center justify-between min-w-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center gap-1.5 font-bold text-white text-sm shrink-0">
              <span className="w-2.5 h-2.5 rounded-full bg-sky-500 animate-pulse" />
              <span>OpenCode Web UI</span>
            </div>

            {serverKey && (
              <>
                <span className="text-slate-600 shrink-0">/</span>
                <div className="flex items-center gap-1.5 text-slate-300 bg-slate-900 px-2.5 py-1 rounded border border-slate-800 min-w-0 max-w-[180px]">
                  <Server className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  <span className="font-mono text-slate-200 truncate block min-w-0">{serverKey}</span>
                </div>
              </>
            )}

            <span className="text-slate-600 shrink-0">/</span>

            <div className="flex items-center gap-1.5 text-slate-300 bg-slate-900 px-2.5 py-1 rounded border border-slate-800 min-w-0 max-w-[240px]">
              <FolderGit2 className="w-3.5 h-3.5 text-purple-400 shrink-0" />
              <span className="font-mono text-slate-200 truncate block min-w-0">
                {displayProjectPath || projectKey || "No project configured"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Command Palette Trigger */}
            <button
              onClick={() => setShowCommandPalette(true)}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded border border-slate-700 transition-colors flex items-center gap-1.5 min-h-[44px]"
            >
              <Command className="w-3.5 h-3.5 text-slate-400" />
              <span>Command Palette</span>
              <kbd className="bg-slate-900 text-[10px] text-slate-400 px-1.5 py-0.5 rounded font-mono border border-slate-800 ml-1">
                ⌘K
              </kbd>
            </button>
          </div>
        </div>
      </nav>

      {/* Main Page Component */}
      <BetterHarnessPage
        serverKey={serverKey}
        projectKey={projectKey}
        displayProjectPath={displayProjectPath}
        httpConfig={httpConfig}
      />

      {/* Command Palette Modal */}
      {showCommandPalette && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Command Palette"
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-start justify-center pt-20 p-4"
          style={{ paddingTop: "max(5rem, env(safe-area-inset-top, 0px))", paddingRight: "max(1rem, env(safe-area-inset-right, 0px))", paddingBottom: "max(1rem, env(safe-area-inset-bottom, 0px))", paddingLeft: "max(1rem, env(safe-area-inset-left, 0px))" }}
          onClick={() => setShowCommandPalette(false)}
        >
          <div
            className="w-full max-w-xl bg-[#16181d] border border-slate-700 rounded-xl p-4 shadow-2xl space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="text-xs font-bold text-slate-300 flex items-center gap-2 uppercase tracking-wider">
                <Command className="w-4 h-4 text-sky-400" />
                OpenCode Command Palette
              </span>
              <button
                onClick={() => setShowCommandPalette(false)}
                className="text-slate-400 hover:text-white text-xs px-2"
              >
                Esc
              </button>
            </div>

            <div className="space-y-1">
              <button
                onClick={() => navigateTo(serverKey || "main", "opencode-web-ui", "/workspace/opencode-web-ui")}
                className="w-full text-left p-3 rounded-lg hover:bg-slate-800/80 transition-colors text-xs text-slate-200 flex items-center justify-between group"
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-sky-400" />
                  <div>
                    <div className="font-bold text-white group-hover:text-sky-300">
                      Open Better Harness
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Open Better Harness dashboard for this project
                    </div>
                  </div>
                </div>
                <span className="font-mono text-[10px] text-slate-500">Enter</span>
              </button>

              <button
                onClick={() => {
                  window.dispatchEvent(new CustomEvent("better-harness-regenerate"));
                  setShowCommandPalette(false);
                }}
                className="w-full text-left p-3 rounded-lg hover:bg-slate-800/80 transition-colors text-xs text-slate-200 flex items-center justify-between group"
              >
                <div className="flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-emerald-400" />
                  <div>
                    <div className="font-bold text-white group-hover:text-emerald-300">
                      Regenerate Better Harness
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Trigger re-analysis run for current project
                    </div>
                  </div>
                </div>
                <span className="font-mono text-[10px] text-slate-500">Enter</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
