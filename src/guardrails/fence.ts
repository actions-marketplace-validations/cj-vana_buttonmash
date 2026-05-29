/**
 * URL/navigation fence: bounds the monkey's blast radius. It blocks off-origin
 * document navigations, closes stray popups/tabs, hard-blocks dangerous paths,
 * dismisses (never accepts) native dialogs, and recovers if a JS-driven
 * navigation slips off-origin.
 */
import type { BrowserContext, Page } from 'playwright';

import type { SignalRecorder } from '../detectors/recorder';

export interface FenceOptions {
  allowedOrigins: readonly string[];
  /** Combined dangerous-path regex (or null). */
  blockedPathRe: RegExp | null;
  /** Block media/font requests to cut noise. Images are kept so the
   *  broken-image detector stays meaningful. */
  blockMedia: boolean;
}

function safeOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

export function isAllowedOrigin(url: string, allowed: ReadonlySet<string>): boolean {
  const o = safeOrigin(url);
  return o === '' || allowed.has(o);
}

/** Install all fence listeners on a context + its main page. */
export async function installFence(
  context: BrowserContext,
  page: Page,
  opts: FenceOptions,
  recorder: SignalRecorder,
): Promise<void> {
  const allowed = new Set(opts.allowedOrigins);

  // Never auto-confirm destructive native dialogs — always dismiss.
  page.on('dialog', async (dialog) => {
    recorder.add('dialog', `${dialog.type()}: ${dialog.message()}`, { severity: 'low' });
    try {
      await dialog.dismiss();
    } catch {
      /* already handled */
    }
  });

  // Close any popup / new tab that escapes to a foreign origin.
  const closeStray = async (p: Page) => {
    const u = p.url();
    if (u && u !== 'about:blank' && !allowed.has(safeOrigin(u))) {
      recorder.add('custom', `closed popup/new-tab → ${u}`, { severity: 'info' });
      await p.close().catch(() => {});
    }
  };
  context.on('page', (p) => void closeStray(p));
  page.on('popup', (p) => void p.close().catch(() => {}));

  // Route-level fence.
  await context.route('**/*', (route) => {
    const req = route.request();
    const type = req.resourceType();
    let origin = '';
    let pathname = '';
    try {
      const u = new URL(req.url());
      origin = u.origin;
      pathname = u.pathname;
    } catch {
      return route.continue();
    }

    const offOrigin = origin !== '' && !allowed.has(origin);
    if (type === 'document' && offOrigin) return route.abort('blockedbyclient');
    if (type === 'document' && opts.blockedPathRe?.test(pathname)) {
      return route.abort('blockedbyclient');
    }
    if (opts.blockMedia && (type === 'media' || type === 'font')) {
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });

  // Catch JS-driven navigations that slipped through routing.
  page.on('framenavigated', async (frame) => {
    if (frame !== page.mainFrame()) return;
    const o = safeOrigin(frame.url());
    if (o !== '' && !allowed.has(o)) {
      recorder.add('custom', `recovered off-origin navigation → ${frame.url()}`, {
        severity: 'low',
      });
      await page.goBack().catch(() => {});
    }
  });
}

/** Init script (added before navigation) that keeps clicks in-page. */
export const KEEP_IN_PAGE_INIT = `
(() => {
  const strip = () => {
    for (const a of document.querySelectorAll('a[target]')) a.removeAttribute('target');
  };
  if (document.readyState !== 'loading') strip();
  document.addEventListener('DOMContentLoaded', strip);
  try {
    new MutationObserver(strip).observe(document.documentElement, { childList: true, subtree: true });
  } catch {}
  try { window.open = () => null; } catch {}
})();
`;
