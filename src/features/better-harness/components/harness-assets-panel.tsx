import React from "react";
import { useHarness } from "../context/harness-context";
import {
  Bot,
  Sparkles,
  Terminal,
  Shield,
  GitBranch,
  FileCode,
  Workflow,
  CheckCircle,
  BookOpen,
  Database,
} from "lucide-react";

export function HarnessAssetsPanel() {
  const { report } = useHarness();

  if (!report) return null;

  const { assets } = report;

  const assetTypes = [
    { label: "Sub-Agents", count: assets.agents, icon: <Bot className="w-4 h-4 text-sky-400" />, desc: "Specialized prompt agent profiles" },
    { label: "Skills (SKILL.md)", count: assets.skills, icon: <Sparkles className="w-4 h-4 text-purple-400" />, desc: "Domain skill packages" },
    { label: "Custom Commands", count: assets.commands, icon: <Terminal className="w-4 h-4 text-amber-400" />, desc: "Slash and palette shortcuts" },
    { label: "Project Rules (AGENTS.md)", count: assets.rules, icon: <Shield className="w-4 h-4 text-emerald-400" />, desc: "System constraints & mandates" },
    { label: "Git Hooks", count: assets.hooks, icon: <GitBranch className="w-4 h-4 text-rose-400" />, desc: "Pre-commit & validation gates" },
    { label: "Automation Scripts", count: assets.scripts, icon: <FileCode className="w-4 h-4 text-indigo-400" />, desc: "Helper shell & Node scripts" },
    { label: "CI/CD Workflows", count: assets.workflows, icon: <Workflow className="w-4 h-4 text-cyan-400" />, desc: "GitHub Actions & Cloud pipelines" },
    { label: "Test Suites", count: assets.tests, icon: <CheckCircle className="w-4 h-4 text-emerald-400" />, desc: "Unit, integration, & E2E tests" },
    { label: "Captured Lessons", count: assets.lessons, icon: <BookOpen className="w-4 h-4 text-amber-400" />, desc: "Retrospective error learnings" },
    { label: "Memory Nodes", count: assets.memoryNodes, icon: <Database className="w-4 h-4 text-purple-400" />, desc: "Graph persistent knowledge items" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-bold text-white">Repository Harness Assets Inventory</h2>
        <p className="text-xs text-slate-400">
          Detected harness infrastructure assets supporting agent reliability and codebase quality.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {assetTypes.map((item, idx) => (
          <div
            key={idx}
            className="bg-[var(--v2-bg-surface-raised,#16181d)] border border-[var(--v2-border-subtle,#262930)] rounded-xl p-4 space-y-2 hover:border-slate-700 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="p-2 rounded-lg bg-slate-900 border border-slate-800">{item.icon}</span>
              <span className="text-xl font-extrabold text-white font-mono">{item.count}</span>
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-200">{item.label}</h3>
              <p className="text-[11px] text-slate-500 mt-0.5">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
