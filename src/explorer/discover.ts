/**
 * Interactive-element discovery. Unlike gremlins.js (which picks random screen
 * coordinates and misses anything below the fold or occluded), we enumerate
 * elements via a broad selector covering native + ARIA + tabindex +
 * contenteditable controls, filter to actionable ones, and build a stable
 * fingerprint and a locator for each.
 */
import type { Page } from 'playwright';

import { withDeadline } from '../core/async';
import { elementFingerprint } from '../core/hash';
import type { ElementDescriptor } from '../core/types';

export const INTERACTIVE_SELECTOR = [
  'a[href]',
  'button',
  'input:not([type=hidden])',
  'select',
  'textarea',
  '[role=button]',
  '[role=link]',
  '[role=checkbox]',
  '[role=radio]',
  '[role=tab]',
  '[role=menuitem]',
  '[role=switch]',
  '[role=option]',
  '[role=combobox]',
  '[role=slider]',
  '[role=textbox]',
  '[contenteditable=""]',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
  '[onclick]',
  'summary',
  'label[for]',
].join(',');

type RawDescriptor = Omit<ElementDescriptor, 'fp'>;

/** Runs in the browser; returns serializable descriptors for visible controls. */
function collect(selector: string): RawDescriptor[] {
  const isVisible = (e: Element): boolean => {
    const el = e as HTMLElement;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return (
      r.width > 0 &&
      r.height > 0 &&
      s.visibility !== 'hidden' &&
      s.display !== 'none' &&
      el.getAttribute('aria-hidden') !== 'true'
    );
  };

  const structuralPath = (e: Element): string => {
    const parts: string[] = [];
    let cur: Element | null = e;
    while (cur && cur.nodeType === 1 && parts.length < 8) {
      const parent: Element | null = cur.parentElement;
      const idx = parent ? Array.prototype.indexOf.call(parent.children, cur) : 0;
      parts.unshift(cur.tagName.toLowerCase() + ':' + idx);
      cur = parent;
    }
    return parts.join('>');
  };

  const cssSelector = (e: Element): string => {
    const id = (e as HTMLElement).id;
    if (id && /^[A-Za-z][\w-]*$/.test(id) && document.querySelectorAll('#' + (window as any).CSS.escape(id)).length === 1) {
      return '#' + (window as any).CSS.escape(id);
    }
    const parts: string[] = [];
    let cur: Element | null = e;
    while (cur && cur.nodeType === 1 && cur !== document.documentElement) {
      const parent: Element | null = cur.parentElement;
      if (!parent) break;
      const idx = Array.prototype.indexOf.call(parent.children, cur) + 1;
      parts.unshift(`${cur.tagName.toLowerCase()}:nth-child(${idx})`);
      cur = parent;
    }
    return parts.length ? parts.join(' > ') : e.tagName.toLowerCase();
  };

  const accessibleName = (e: Element): string => {
    const el = e as HTMLElement & { value?: string };
    const candidates = [
      el.getAttribute('aria-label'),
      el.getAttribute('title'),
      el.getAttribute('alt'),
      el.textContent,
      typeof el.value === 'string' ? el.value : '',
      el.getAttribute('placeholder'),
      el.getAttribute('name'),
    ];
    for (const c of candidates) {
      const t = (c || '').replace(/\s+/g, ' ').trim();
      if (t) return t.slice(0, 80);
    }
    return '';
  };

  const out: RawDescriptor[] = [];
  const seen = new Set<Element>();
  for (const e of Array.from(document.querySelectorAll(selector))) {
    if (seen.has(e) || !isVisible(e)) continue;
    seen.add(e);
    const el = e as HTMLElement & { form?: HTMLFormElement; type?: string; disabled?: boolean };
    out.push({
      tag: el.tagName.toLowerCase(),
      type: typeof el.type === 'string' ? el.type : null,
      role: el.getAttribute('role'),
      name: accessibleName(el),
      editable: el.isContentEditable,
      path: structuralPath(el),
      selector: cssSelector(el),
      href: el.getAttribute('href') || undefined,
      formAction: el.form?.getAttribute('action') || el.getAttribute('formaction') || undefined,
      formMethod: (el.form?.getAttribute('method') || el.getAttribute('formmethod') || '').toUpperCase() || undefined,
      disabled: el.disabled === true,
    });
  }
  return out;
}

export async function discoverElements(page: Page): Promise<ElementDescriptor[]> {
  let raws: RawDescriptor[];
  try {
    raws = await withDeadline(page.evaluate(collect, INTERACTIVE_SELECTOR), 8_000, 'discover');
  } catch {
    return [];
  }
  return raws
    .filter((r) => !r.disabled)
    .map((r) => ({ ...r, fp: elementFingerprint(r) }));
}
