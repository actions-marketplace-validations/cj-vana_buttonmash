/**
 * Shared domain types for buttonmash. This module is the contract every other
 * module depends on; keep it dependency-free.
 */

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export const SEVERITY_ORDER: Record<Severity, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

/** Every kind of action the monkey can perform on a control. */
export type ActionKind =
  | 'click'
  | 'dblclick'
  | 'type'
  | 'key'
  | 'hover'
  | 'scroll'
  | 'select'
  | 'check'
  | 'back'
  | 'forward'
  | 'resize';

/** A serializable description of a discovered interactive element. */
export interface ElementDescriptor {
  /** Stable, run-independent fingerprint of this logical control. */
  fp: string;
  tag: string;
  type: string | null;
  role: string | null;
  /** Trimmed accessible name (text + aria-label), capped. */
  name: string;
  editable: boolean;
  /** Structural DOM path used as part of the fingerprint. */
  path: string;
  /** A Playwright-friendly selector to (re-)locate the element this step. */
  selector: string;
  /** Anchor href, when present — used by the destructive-control classifier. */
  href?: string;
  /** Owning form's action target. */
  formAction?: string;
  /** Owning form's HTTP method (uppercased). */
  formMethod?: string;
  /** True when discovery saw the element as disabled. */
  disabled?: boolean;
}

/** A single action the explorer took, forming a replayable trace. */
export interface LoggedAction {
  step: number;
  kind: ActionKind;
  stateHash: string;
  /** Element fingerprint, when the action targeted an element. */
  fp?: string;
  /** Human-readable target name, for reports. */
  target?: string;
  selector?: string;
  /** Value typed/selected, if any (already redacted before persistence). */
  value?: string;
  url: string;
  ts: number;
  navigated?: boolean;
}

/** Raw kinds of signal the harness captures from the browser. */
export type SignalKind =
  | 'pageerror'
  | 'console.error'
  | 'console.warn'
  | 'http.4xx'
  | 'http.5xx'
  | 'requestfailed'
  | 'crash'
  | 'dialog'
  | 'hang'
  | 'blank-screen'
  | 'broken-image'
  | 'a11y'
  | 'reflected-input'
  | 'secret-leak'
  | 'billing-live'
  | 'custom'
  | 'driver';

/** A raw observation captured during the run, tagged with where/when. */
export interface Signal {
  kind: SignalKind;
  detail: string;
  url: string;
  at: number;
  /** Step index of the action that most likely caused it. */
  step?: number;
  severity?: Severity;
  /** Extra structured context (status code, selector, etc.). */
  meta?: Record<string, string | number | boolean>;
}

export type ArtifactType =
  | 'screenshot'
  | 'thumbnail'
  | 'trace'
  | 'video'
  | 'dom'
  | 'console'
  | 'har';

export interface Artifact {
  type: ArtifactType;
  /** Path relative to the report root. */
  path: string;
  mime: string;
  /** Inlined data URI for small thumbnails embedded in the HTML report. */
  dataUri?: string;
}

/** A deduplicated, reportable problem. */
export interface Finding {
  id: string;
  /** Stable signature for cross-run dedup (SARIF fingerprint, HTML collapse). */
  dedupKey: string;
  severity: Severity;
  category: string;
  title: string;
  description: string;
  /** How many raw signals collapsed into this finding. */
  count: number;
  location: {
    url: string;
    selector?: string;
    fp?: string;
  };
  /** Minimal action trace to reproduce, newest-relevant first. */
  reproSteps: LoggedAction[];
  firstSeenStep: number;
  artifacts: Artifact[];
}

export interface RunStats {
  actionsTaken: number;
  pagesVisited: number;
  statesDiscovered: number;
  findingsBySeverity: Record<Severity, number>;
}

/** The canonical in-memory result; every report format derives from this. */
export interface RunResult {
  schemaVersion: 1;
  tool: { name: string; version: string };
  run: {
    id: string;
    startedAt: string;
    finishedAt: string;
    durationMs: number;
    target: string;
    browser: string;
    viewport: { width: number; height: number };
    exitCode: number;
    dryRun: boolean;
  };
  config: {
    seed: string;
    maxActions: number;
    maxDurationMs: number;
    failOn: Severity;
  };
  stats: RunStats;
  actions: LoggedAction[];
  findings: Finding[];
}

/** Exit codes follow the pytest/ESLint convention. */
export const EXIT = {
  /** No findings at or above the fail threshold. */
  CLEAN: 0,
  /** Findings at or above the fail threshold — the build-failing signal. */
  FINDINGS: 1,
  /** The tool itself errored (bad config, usage, internal failure). */
  ERROR: 2,
} as const;
