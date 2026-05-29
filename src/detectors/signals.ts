/**
 * Live signal capture. Attaches harness-side listeners that turn browser events
 * into {@link Signal}s. The harness (not the page) owns pass/fail, which is the
 * thing gremlins.js famously gets wrong. All persisted detail is redacted.
 */
import type { Page } from 'playwright';

import type { ResolvedConfig } from '../config/load';
import { anyMatch } from '../core/regex';
import type { Severity } from '../core/types';
import { inspectRequestForLiveMode } from '../guardrails/billing';
import { redactString, scanForSecrets } from '../guardrails/secrets';
import type { SignalRecorder } from './recorder';

export interface CustomConsoleRule {
  name: string;
  re: RegExp;
  severity: Severity;
}

export interface SignalDeps {
  page: Page;
  recorder: SignalRecorder;
  cfg: ResolvedConfig;
  /** Compiled allowlist of benign console/network noise. */
  ignore: RegExp[];
  /** Custom console text rules. */
  customConsole: CustomConsoleRule[];
  /** Called when live billing mode is detected via an outbound request. */
  onBillingLive: (reasons: string[]) => void;
}

export function attachSignalListeners(deps: SignalDeps): void {
  const { page, recorder, cfg, ignore, customConsole, onBillingLive } = deps;
  const redact = cfg.guardrails.secrets.redact ? redactString : (s: string) => s;
  const ignored = (text: string) => anyMatch(text, ignore);

  page.on('console', (msg) => {
    const type = msg.type();
    const text = msg.text();
    if (ignored(text)) return;

    if (type === 'error' && cfg.detectors.consoleErrors) {
      recorder.add('console.error', redact(text), { severity: 'high' });
    } else if (type === 'warning' && cfg.detectors.consoleWarnings) {
      recorder.add('console.warn', redact(text), { severity: 'low' });
    }

    for (const rule of customConsole) {
      if (rule.re.test(text)) {
        recorder.add('custom', `${rule.name}: ${redact(text)}`, { severity: rule.severity });
      }
    }

    if (cfg.guardrails.secrets.report) {
      for (const hit of scanForSecrets(text)) {
        recorder.add('secret-leak', `${hit.ruleId} (console): ${hit.context}`, {
          severity: 'high',
        });
      }
    }
  });

  page.on('pageerror', (err) => {
    const detail = `${err.message}\n${err.stack ?? ''}`.trim();
    if (ignored(detail)) return;
    recorder.add('pageerror', redact(detail), { severity: 'high' });
  });

  page.on('requestfailed', (req) => {
    const errorText = req.failure()?.errorText ?? 'unknown';
    // Ignore the navigations/resources WE aborted via the fence.
    if (/ERR_ABORTED|BLOCKED_BY_CLIENT|blockedbyclient/i.test(errorText)) return;
    if (!cfg.detectors.httpErrors) return;
    const line = `${req.method()} ${req.url()} — ${errorText}`;
    if (ignored(line)) return;
    recorder.add('requestfailed', redact(line), {
      severity: 'medium',
      meta: { resourceType: req.resourceType() },
    });
  });

  page.on('response', (res) => {
    if (!cfg.detectors.httpErrors) return;
    const status = res.status();
    if (status < 400) return;
    if (cfg.detectors.ignoreHttpStatuses.includes(status)) return;
    const url = res.url();
    if (ignored(url)) return;
    const type = res.request().resourceType();
    const isMain = type === 'document' || type === 'xhr' || type === 'fetch';
    const kind = status >= 500 ? 'http.5xx' : 'http.4xx';
    const severity: Severity = status >= 500 ? (isMain ? 'high' : 'medium') : isMain ? 'medium' : 'low';
    recorder.add(kind, redact(`${status} ${url}`), {
      severity,
      meta: { status, resourceType: type },
    });
  });

  page.on('request', (req) => {
    if (cfg.guardrails.billing.mode === 'off') return;
    let postData: string | null = null;
    try {
      postData = req.postData();
    } catch {
      postData = null;
    }
    const reasons = inspectRequestForLiveMode(req.url(), postData);
    if (reasons.length) {
      const severity: Severity = cfg.guardrails.billing.mode === 'refuse' ? 'critical' : 'medium';
      recorder.add('billing-live', reasons.join(', '), { severity });
      onBillingLive(reasons);
    }
  });

  page.on('crash', () => {
    recorder.add('crash', 'renderer crashed (likely OOM/segfault)', { severity: 'critical' });
  });
}
