import {
  HarnessDimension,
  HarnessPriority,
  HarnessFindingStatus,
  HarnessFixVehicle,
} from "../types";

export function formatDimensionName(dimension: HarnessDimension): string {
  switch (dimension) {
    case "task-understanding":
      return "Task Understanding";
    case "controlled-execution":
      return "Controlled Execution";
    case "change-validation":
      return "Change Validation";
    case "reliable-delivery":
      return "Reliable Delivery";
    case "learning-capture":
      return "Learning Capture";
    default:
      return dimension;
  }
}

export function getScoreColorClass(score: number): {
  text: string;
  bg: string;
  border: string;
  bar: string;
} {
  if (score >= 85) {
    return {
      text: "text-emerald-400 dark:text-emerald-400",
      bg: "bg-emerald-500/10 dark:bg-emerald-500/15",
      border: "border-emerald-500/30",
      bar: "bg-emerald-500",
    };
  }
  if (score >= 70) {
    return {
      text: "text-amber-400 dark:text-amber-400",
      bg: "bg-amber-500/10 dark:bg-amber-500/15",
      border: "border-amber-500/30",
      bar: "bg-amber-500",
    };
  }
  return {
    text: "text-rose-400 dark:text-rose-400",
    bg: "bg-rose-500/10 dark:bg-rose-500/15",
    border: "border-rose-500/30",
    bar: "bg-rose-500",
  };
}

export function getPriorityBadge(priority: HarnessPriority): {
  label: string;
  badgeClass: string;
} {
  switch (priority) {
    case "high":
      return {
        label: "High Priority",
        badgeClass:
          "bg-rose-500/15 text-rose-300 border border-rose-500/30 font-medium",
      };
    case "medium":
      return {
        label: "Medium Priority",
        badgeClass:
          "bg-amber-500/15 text-amber-300 border border-amber-500/30 font-medium",
      };
    case "low":
      return {
        label: "Low Priority",
        badgeClass:
          "bg-slate-500/15 text-slate-300 border border-slate-500/30 font-medium",
      };
  }
}

export function getStatusBadge(status: HarnessFindingStatus): {
  label: string;
  badgeClass: string;
} {
  switch (status) {
    case "pending":
      return {
        label: "Pending",
        badgeClass: "bg-sky-500/15 text-sky-300 border border-sky-500/30",
      };
    case "planning":
      return {
        label: "Planning Fix",
        badgeClass: "bg-indigo-500/15 text-indigo-300 border border-indigo-500/30",
      };
    case "processing":
      return {
        label: "Processing",
        badgeClass: "bg-purple-500/15 text-purple-300 border border-purple-500/30 animate-pulse",
      };
    case "fixed":
      return {
        label: "Fixed",
        badgeClass: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30",
      };
    case "ignored":
      return {
        label: "Ignored",
        badgeClass: "bg-slate-500/15 text-slate-400 border border-slate-500/20 opacity-75",
      };
    case "regressed":
      return {
        label: "Regressed",
        badgeClass: "bg-rose-500/20 text-rose-300 border border-rose-500/40 font-semibold",
      };
  }
}

export function getVehicleLabel(vehicle: HarnessFixVehicle): string {
  switch (vehicle) {
    case "rule":
      return "Rule (AGENTS.md)";
    case "skill":
      return "Skill (SKILL.md)";
    case "hook":
      return "Git Hook";
    case "script":
      return "Automation Script";
    case "command":
      return "Command Palette";
    case "agent":
      return "Sub-Agent Policy";
    case "ci-workflow":
      return "CI/CD Workflow";
    case "automation":
      return "Automation Runner";
    case "human-gate":
      return "Human Gate Policy";
    case "documentation":
      return "Documentation";
  }
}

export function getScreenReaderScoreLabel(name: string, score: number): string {
  return `${name} score is ${score} out of 100 points`;
}
