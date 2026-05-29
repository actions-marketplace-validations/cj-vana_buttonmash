/** Collects raw signals during a run, tagged with the current step + URL. */
import type { Severity, Signal, SignalKind } from '../core/types';

export interface AddOptions {
  severity?: Severity;
  url?: string;
  step?: number;
  meta?: Record<string, string | number | boolean>;
}

export class SignalRecorder {
  readonly signals: Signal[] = [];
  private step = 0;
  private url = '';

  /** Update the "current action" context so signals attribute correctly. */
  setContext(step: number, url: string): void {
    this.step = step;
    this.url = url;
  }

  add(kind: SignalKind, detail: string, opts: AddOptions = {}): void {
    this.signals.push({
      kind,
      detail,
      url: opts.url ?? this.url,
      at: Date.now(),
      step: opts.step ?? this.step,
      severity: opts.severity,
      meta: opts.meta,
    });
  }

  count(): number {
    return this.signals.length;
  }

  /** Signals captured since index `from` (used to attribute per-action). */
  since(from: number): Signal[] {
    return this.signals.slice(from);
  }
}
