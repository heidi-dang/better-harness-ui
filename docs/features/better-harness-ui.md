# Better Harness UI Feature Documentation

## Overview

The Better Harness UI dashboard provides a project-scoped analysis system for monitoring AI coding agent harness health across five key dimensions:
1. **Task Understanding**
2. **Controlled Execution**
3. **Change Validation**
4. **Reliable Delivery**
5. **Learning Capture**

---

## 1. UI Routes

The Better Harness interface supports two primary route signatures:

* **Primary Server-Aware Route:**
  `/server/:serverKey/project/:dir/better-harness`
* **Directory-Scoped Compatibility Route:**
  `/:dir/better-harness`

`dir` is a URL-safe Base64-encoded representation of the project root directory path. Both server key and project directory are restored upon direct browser navigation or page refresh.

---

## 2. Component Architecture

```
packages/app/src/features/better-harness/
├── api/
│   ├── harness-data-source.ts              # Data source abstraction interface
│   ├── fixture-harness-data-source.ts      # Deterministic fixture adapter
│   └── unavailable-harness-data-source.ts  # Production default disconnected adapter
├── components/
│   ├── harness-header.tsx                  # Project identity, status & actions
│   ├── harness-overall-score.tsx           # Primary numeric score & score bar
│   ├── harness-dimension-card.tsx          # Single dimension score & filter toggle
│   ├── harness-dimension-grid.tsx          # 5-dimension responsive grid/scroll
│   ├── harness-progress.tsx                # Progress indicator for running analysis
│   ├── harness-tabs.tsx                    # Tab list navigation
│   ├── harness-finding-filters.tsx         # Search & filter composition controls
│   ├── harness-finding-list.tsx            # Virtualized list of findings
│   ├── harness-finding-card.tsx            # Compact finding card component
│   ├── harness-finding-detail.tsx          # Comprehensive finding inspector
│   ├── harness-evidence-list.tsx           # Category & confidence evidence list
│   ├── harness-session-summary.tsx         # Session trace health metrics
│   ├── harness-assets-panel.tsx            # Harness repository infrastructure inventory
│   ├── harness-history-view.tsx            # Historical score trend list
│   ├── harness-empty-state.tsx             # 100/100 score clean state
│   ├── harness-unavailable-state.tsx       # FlowDeck engine disconnected state
│   ├── harness-error-state.tsx             # Incompatible schema & error view
│   └── harness-skeleton.tsx                # Loading skeleton loader
├── context/
│   └── harness-context.tsx                 # React Context for state & actions
├── fixtures/
│   └── harness-fixtures.ts                 # 15+ deterministic test findings & reports
├── pages/
│   └── better-harness-page.tsx             # Main page container & mobile drawer
├── schemas/
│   ├── harness-report.ts                   # Runtime schema validator for reports
│   └── harness-run.ts                      # Runtime schema validator for run progress
├── utils/
│   ├── harness-route.ts                    # Route encoding, decoding, parsing
│   ├── finding-filters.ts                  # Finding filter and sort algorithms
│   └── score-format.ts                     # Formatting, badges & ARIA labels
├── harness-page.test.tsx                   # Unit and integration test suite
└── types.ts                                # TypeScript domain definitions
```

---

## 3. Data-Source Interface (`HarnessDataSource`)

```typescript
export interface HarnessDataSource {
  availability(): Promise<{
    available: boolean;
    reason?: string;
  }>;

  getReport(): Promise<HarnessReport | undefined>;

  getRunProgress?(): Promise<HarnessRunProgress | undefined>;

  regenerate(): Promise<{
    accepted: boolean;
    runId?: string;
  }>;

  planFix(findingId: string): Promise<{
    accepted: boolean;
    repairSessionId?: string;
  }>;

  verify(findingId: string): Promise<{
    accepted: boolean;
  }>;

  ignore(findingId: string, reason: string): Promise<{
    accepted: boolean;
  }>;

  cancel(): Promise<void>;
}
```

---

## 4. Fixture-State Query Parameters

In development or review, you can force deterministic states using the `betterHarnessDemo` query parameter:

* `?betterHarnessDemo=completed`: Loads full report with 82/100 score and 15+ findings covering all 5 dimensions.
* `?betterHarnessDemo=running`: Displays live analysis progress at 64% stage 3.
* `?betterHarnessDemo=empty`: Displays 100/100 perfect score empty state.
* `?betterHarnessDemo=failed`: Displays recoverable analysis failure state.
* `?betterHarnessDemo=unavailable`: Displays FlowDeck engine unavailable state.
* `?betterHarnessDemo=incompatible-schema`: Displays schema version mismatch error (version !== 1).

---

## 5. Current UI-Only Limitations

* FlowDeck analysis execution is not triggered in Phase 1.
* Action buttons ("Plan a Fix", "Verify", "Ignore", "Regenerate") mutate local state in fixture mode and display clear toast notifications.
* Production mode defaults to `UnavailableHarnessDataSource` until the Phase 2 backend adapter is connected.

---

## 6. Phase 2 FlowDeck Adapter Contract

In Phase 2, implement `FlowDeckHarnessDataSource implements HarnessDataSource` calling the server API:

```typescript
export class FlowDeckHarnessDataSource implements HarnessDataSource {
  constructor(private serverKey: string, private projectDir: string) {}

  async availability() {
    const res = await fetch(`/api/server/${this.serverKey}/harness/available`);
    return res.json();
  }

  async getReport() {
    const res = await fetch(`/api/server/${this.serverKey}/project/${encodeProjectDir(this.projectDir)}/harness/report`);
    if (!res.ok) return undefined;
    return res.json();
  }

  // Implement regenerate, planFix, verify, ignore, cancel via fetch calls
}
```

---

## 7. How to Remove Fixture Mode

To transition completely to production Phase 2:
1. Replace `new FixtureHarnessDataSource()` in `harness-context.tsx` with `new FlowDeckHarnessDataSource(serverKey, projectDir)`.
2. Remove the `betterHarnessDemo` query parameter handler.

---

## 8. Accessibility & Responsiveness

* **ARIA Landmarks & Roles**: Proper `<header>`, `<main>`, `<nav role="tablist">`, `role="tab"`, `role="progressbar"`, `role="dialog"`.
* **Keyboard Navigation**: Tablists support Left/Right/Home/End arrow keys. Finding list items support Enter/Space activation.
* **Focus Trap & Drawer**: Mobile viewports (< 768px) render finding details in an overlay drawer with Escape key handler and focus trapping.
* **Reduced Motion**: `@media (prefers-reduced-motion: reduce)` disables non-essential CSS transitions and pulse animations.
* **High-Contrast Badges**: Priority and score colors meet WCAG AA contrast standards and are always accompanied by numeric score labels and explicit text labels (never color alone).

---

## 9. Test Coverage

Run unit and integration tests with:
```bash
npm run lint
```
Tests verify schema validation, fixture data completeness, filter algorithms, route encoding/decoding, and adapter responses.
