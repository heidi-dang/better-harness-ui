export type HarnessDimension =
  | "task-understanding"
  | "controlled-execution"
  | "change-validation"
  | "reliable-delivery"
  | "learning-capture";

export type HarnessPriority = "high" | "medium" | "low";

export type HarnessFindingStatus =
  | "pending"
  | "planning"
  | "processing"
  | "fixed"
  | "ignored"
  | "regressed";

export type HarnessFixVehicle =
  | "rule"
  | "skill"
  | "hook"
  | "script"
  | "command"
  | "agent"
  | "ci-workflow"
  | "automation"
  | "human-gate"
  | "documentation";

export interface HarnessDimensionScore {
  dimension: HarnessDimension;
  score: number;
  previousScore?: number;
  findingCount: number;
  evidenceCoverage: number;
}

export interface HarnessEvidence {
  id: string;
  category: "customization" | "session" | "foundation";
  source: string;
  summary: string;
  path?: string;
  sessionId?: string;
  confidence: number;
  collectedAt: string;
}

export interface HarnessFinding {
  id: string;
  title: string;
  dimension: HarnessDimension;
  priority: HarnessPriority;
  status: HarnessFindingStatus;
  cause: string;
  impact: string;
  expectedOutput: string;
  evidence: HarnessEvidence[];
  recommendedVehicle: HarnessFixVehicle;
  allowedPaths: string[];
  validationRequirements: string[];
  acceptanceCriteria: string[];
  firstSeenAt: string;
  lastSeenAt: string;
  repairSessionId?: string;
}

export interface HarnessReport {
  schemaVersion: 1;
  engineVersion: string;
  generatedAt: string;
  sourceRevision?: string;
  project: {
    name: string;
    directory: string;
  };
  overallScore: number;
  previousOverallScore?: number;
  evidenceCoverage: number;
  dimensions: HarnessDimensionScore[];
  findings: HarnessFinding[];
  sessions: {
    analyzed: number;
    longSessions: number;
    failedSessions: number;
    repeatedFailures: number;
    compactions: number;
    permissionInterruptions: number;
  };
  assets: {
    agents: number;
    skills: number;
    commands: number;
    rules: number;
    hooks: number;
    scripts: number;
    workflows: number;
    tests: number;
    lessons: number;
    memoryNodes: number;
  };
}

export interface HarnessRunProgress {
  runId: string;
  status: "queued" | "running" | "completed" | "failed";
  stage: string;
  progressPercent: number;
  startedAt: string;
  estimatedTimeRemainingSeconds?: number;
  errorMessage?: string;
}

export interface HarnessFindingFilterState {
  searchQuery: string;
  dimension: HarnessDimension | "all";
  priority: HarnessPriority | "all";
  status: HarnessFindingStatus | "all";
  recommendedVehicle: HarnessFixVehicle | "all";
  sortBy: "priority" | "status" | "dimension" | "recent" | "title";
  sortOrder: "asc" | "desc";
}

export type HarnessDemoMode =
  | "completed"
  | "running"
  | "empty"
  | "failed"
  | "unavailable"
  | "incompatible-schema";
