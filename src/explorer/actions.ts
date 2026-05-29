/**
 * Action planning + execution. Given a chosen element (or none), we pick a
 * weighted action, gate it through the safety rules (dry-run + destructive
 * classification), then perform it with Playwright. Mutating actions on
 * destructive controls are downgraded to a harmless hover.
 */
import type { Page } from 'playwright';

import type { ResolvedConfig } from '../config/load';
import { withDeadline } from '../core/async';
import { normalizeUrl } from '../core/hash';
import type { Rng } from '../core/rng';
import type { ActionKind, ElementDescriptor } from '../core/types';
import { classifyControl } from '../guardrails/destructive';
import type { SignalRecorder } from '../detectors/recorder';
import type { DetectorState } from '../detectors/page-checks';
import { FUZZ_KEYS, fuzzValue } from './fuzz';

const PAGE_LEVEL: ActionKind[] = ['scroll', 'resize', 'back', 'forward'];
const TEXT_TYPES = new Set([null, '', 'text', 'search', 'email', 'url', 'tel', 'password', 'number']);

export interface ActionContext {
  page: Page;
  rng: Rng;
  cfg: ResolvedConfig;
  runId: string;
  step: number;
  state: DetectorState;
  recorder: SignalRecorder;
}

export interface Plan {
  kind: ActionKind;
  el?: ElementDescriptor;
}

export interface ActionResult {
  kind: ActionKind;
  target?: string;
  selector?: string;
  fp?: string;
  value?: string;
  navigated: boolean;
}

function isTextEntry(el: ElementDescriptor): boolean {
  return (
    el.editable ||
    el.tag === 'textarea' ||
    el.role === 'textbox' ||
    (el.tag === 'input' && TEXT_TYPES.has(el.type))
  );
}

function isToggle(el: ElementDescriptor): boolean {
  return (
    (el.tag === 'input' && (el.type === 'checkbox' || el.type === 'radio')) ||
    el.role === 'checkbox' ||
    el.role === 'radio' ||
    el.role === 'switch'
  );
}

function elementKinds(el: ElementDescriptor): ActionKind[] {
  const kinds: ActionKind[] = ['click', 'dblclick', 'hover', 'key'];
  if (isTextEntry(el)) kinds.push('type');
  if (el.tag === 'select' || el.role === 'combobox') kinds.push('select');
  if (isToggle(el)) kinds.push('check');
  return kinds;
}

/** Build a weighted action plan from a (possibly undefined) chosen element. */
export function planAction(rng: Rng, cfg: ResolvedConfig, el?: ElementDescriptor): Plan {
  const w = cfg.explore.weights;
  const candidates: { item: Plan; weight: number }[] = [];

  for (const kind of PAGE_LEVEL) {
    candidates.push({ item: { kind }, weight: w[kind] });
  }
  if (el) {
    for (const kind of elementKinds(el)) {
      candidates.push({ item: { kind, el }, weight: w[kind] });
    }
  }
  if (candidates.length === 0) return { kind: 'scroll' };
  return rng.weightedPick(candidates);
}

const MUTATING: ReadonlySet<ActionKind> = new Set([
  'click',
  'dblclick',
  'type',
  'select',
  'check',
  'key',
]);

/**
 * Apply safety gates. Destructive controls and (in dry-run) all mutating
 * actions are downgraded to a hover so we still observe the control without
 * triggering it. Returns the (possibly downgraded) plan.
 */
export function gatePlan(plan: Plan, cfg: ResolvedConfig, recorder: SignalRecorder): Plan {
  const { el, kind } = plan;

  if (el && cfg.guardrails.destructive.enabled && !cfg.guardrails.destructive.allow) {
    const c = classifyControl(el, cfg.guardrails.destructive.extraVerbs);
    if (c.block && MUTATING.has(kind)) {
      recorder.add('custom', `skipped destructive control (${c.reason}): ${el.name || el.selector}`, {
        severity: 'info',
      });
      return { kind: 'hover', el };
    }
  }

  if (cfg.guardrails.dryRun && MUTATING.has(kind)) {
    // In read-only mode, only allow navigating same-origin GET links via click.
    const isNavLink = kind === 'click' && el?.tag === 'a' && !!el.href;
    if (!isNavLink) return el ? { kind: 'hover', el } : { kind: 'scroll' };
  }

  return plan;
}

export async function executeAction(ctx: ActionContext, plan: Plan): Promise<ActionResult> {
  const { page, rng, cfg } = ctx;
  const opTimeout = cfg.budget.interactionTimeoutMs;
  const urlBefore = page.url();
  const result: ActionResult = {
    kind: plan.kind,
    navigated: false,
    target: plan.el?.name || undefined,
    selector: plan.el?.selector,
    fp: plan.el?.fp,
  };

  const loc = plan.el ? page.locator(plan.el.selector).first() : null;

  await withDeadline(
    (async () => {
      switch (plan.kind) {
        case 'click':
          if (loc) await loc.click({ timeout: opTimeout, force: false, noWaitAfter: true });
          break;
        case 'dblclick':
          if (loc) await loc.dblclick({ timeout: opTimeout, noWaitAfter: true });
          break;
        case 'hover':
          if (loc) await loc.hover({ timeout: opTimeout, force: true });
          break;
        case 'type':
          if (loc) {
            const fv = fuzzValue(rng, ctx.runId, ctx.step);
            result.value = fv.value.length > 60 ? `${fv.value.slice(0, 57)}…` : fv.value;
            if (fv.probe) ctx.state.pendingCanaries.add(fv.canary);
            if (plan.el?.editable) {
              await loc.click({ timeout: opTimeout }).catch(() => {});
              await loc.pressSequentially(fv.value.slice(0, 2000), { timeout: opTimeout });
            } else {
              await loc.fill(fv.value.slice(0, 2000), { timeout: opTimeout });
            }
          }
          break;
        case 'key': {
          const key = rng.pick(FUZZ_KEYS);
          result.value = key;
          if (loc) await loc.press(key, { timeout: opTimeout, noWaitAfter: true });
          else await page.keyboard.press(key);
          break;
        }
        case 'select':
          if (loc) {
            const count = await loc.locator('option').count();
            if (count > 0) {
              const idx = rng.int(count);
              result.value = `option#${idx}`;
              await loc.selectOption({ index: idx }, { timeout: opTimeout }).catch(() => {});
            }
          }
          break;
        case 'check':
          if (loc) {
            const checked = rng.bool();
            result.value = String(checked);
            await loc.setChecked(checked, { timeout: opTimeout, force: true }).catch(() => {});
          }
          break;
        case 'scroll':
          await page.mouse.wheel(0, rng.intBetween(-600, 1400));
          break;
        case 'resize': {
          const vp = rng.pick([
            { width: 320, height: 568 },
            { width: 768, height: 1024 },
            { width: 1024, height: 768 },
            { width: 1440, height: 900 },
            { width: 1920, height: 1080 },
          ]);
          result.value = `${vp.width}x${vp.height}`;
          await page.setViewportSize(vp);
          break;
        }
        case 'back':
          await page.goBack({ timeout: opTimeout }).catch(() => {});
          break;
        case 'forward':
          await page.goForward({ timeout: opTimeout }).catch(() => {});
          break;
      }
    })(),
    cfg.budget.actionTimeoutMs + 5_000,
    `action:${plan.kind}`,
  );

  result.navigated = normalizeUrl(urlBefore) !== normalizeUrl(page.url());
  return result;
}
