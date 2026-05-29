/**
 * Destructive-control classification. Before the monkey clicks anything, we
 * decide whether the control is likely to delete data, spend money, or end the
 * session. Classification reads the FULL accessible name (not just visible
 * text), the action target (href / form action+method), and a multilingual
 * verb denylist — because destructive buttons are often icon-only.
 */
import type { ElementDescriptor } from '../core/types';

/** Destructive verbs across a few common languages (extend via config). */
export const DESTRUCTIVE_VERBS: string[] = [
  // English
  'delete',
  'remove',
  'destroy',
  'erase',
  'wipe',
  'purge',
  'clear all',
  'reset',
  'pay',
  'purchase',
  'buy',
  'checkout',
  'place order',
  'confirm payment',
  'subscribe',
  'upgrade plan',
  'cancel subscription',
  'cancel plan',
  'unsubscribe',
  'close account',
  'deactivate',
  'delete account',
  'logout',
  'log out',
  'sign out',
  'signout',
  'transfer',
  'withdraw',
  'send money',
  'revoke',
  'disable',
  'archive',
  'ban',
  'suspend',
  // Spanish
  'eliminar',
  'borrar',
  'pagar',
  'comprar',
  'cancelar',
  'cerrar sesion',
  'desactivar',
  // German
  'loschen',
  'entfernen',
  'bezahlen',
  'abmelden',
  'kundigen',
  // French
  'supprimer',
  'payer',
  'acheter',
  'se deconnecter',
  'annuler l abonnement',
  'desactiver',
];

/** Paths that are hard-blocked even on an allowed origin. */
export const DANGEROUS_PATH_RE =
  /(log[-_]?out|sign[-_]?out|\/logout|\/signout|auth\/logout|account\/(?:close|delete|deactivate)|billing\/cancel|subscription\/cancel|\/delete(?:\b|\/)|\/destroy\b)/i;

/** Normalize text for verb matching: lowercase, strip accents/punctuation. */
export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface Classification {
  block: boolean;
  /** Why it was blocked (or 'none'). */
  reason: string;
}

/**
 * Classify a discovered control. Returns `block: true` for anything matching a
 * destructive verb, a dangerous path, or a POST/DELETE form to a dangerous
 * target.
 */
export function classifyControl(
  el: ElementDescriptor,
  extraVerbs: readonly string[] = [],
): Classification {
  const verbs = [...DESTRUCTIVE_VERBS, ...extraVerbs.map((v) => normalizeName(v))];
  const name = normalizeName(el.name);

  const verbHit = name ? verbs.find((v) => name.includes(normalizeName(v))) : undefined;
  if (verbHit) return { block: true, reason: `verb:${verbHit}` };

  const href = el.href ?? '';
  const formAction = el.formAction ?? '';
  if (DANGEROUS_PATH_RE.test(href)) return { block: true, reason: `path:${href}` };
  if (DANGEROUS_PATH_RE.test(formAction)) return { block: true, reason: `form-action:${formAction}` };

  const method = (el.formMethod ?? '').toUpperCase();
  if ((method === 'POST' || method === 'DELETE') && DANGEROUS_PATH_RE.test(formAction)) {
    return { block: true, reason: `post-form:${formAction}` };
  }

  return { block: false, reason: 'none' };
}
