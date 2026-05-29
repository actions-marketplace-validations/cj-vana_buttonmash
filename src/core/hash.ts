/**
 * Hashing and fingerprinting used for state coverage and dedup.
 *
 * - `fnv1a` is a fast, stable, non-cryptographic hash.
 * - element fingerprints identify the same logical control across runs.
 * - state fingerprints bucket near-duplicate UI states so the explorer can
 *   measure coverage and avoid looping forever on volatile content.
 */

import type { ElementDescriptor } from './types';

/** FNV-1a 32-bit hash → 8-char hex. */
export function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

const VOLATILE_PARAM = /^(utm_|_|sid|session|sess|token|ts|cb|nonce|csrf|xsrf|v|cache)/i;

/**
 * Normalize a URL for state comparison: drop the hash, strip volatile query
 * params (session ids, cache-busters, csrf tokens), and sort the rest. Invalid
 * URLs are returned unchanged.
 */
export function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    for (const k of [...u.searchParams.keys()]) {
      if (VOLATILE_PARAM.test(k)) u.searchParams.delete(k);
    }
    u.searchParams.sort();
    u.hash = '';
    return u.origin + u.pathname + (u.search || '');
  } catch {
    return raw;
  }
}

/**
 * A stable fingerprint for a logical control, identical across runs for the
 * same element. Derived from structural + semantic attributes, never from
 * volatile text alone.
 */
export function elementFingerprint(
  d: Pick<ElementDescriptor, 'tag' | 'type' | 'role' | 'name' | 'path'>,
): string {
  return fnv1a([d.tag, d.type ?? '', d.role ?? '', d.name, d.path].join('|'));
}

/**
 * A fingerprint for the current UI state: normalized URL plus an
 * order-independent multiset of the interactive elements present.
 */
export function stateFingerprint(url: string, elementFps: readonly string[]): string {
  const structural = [...elementFps].sort().join(',');
  return fnv1a(normalizeUrl(url) + '#' + structural);
}

/**
 * Build a stable dedup key for a finding from its category, normalized
 * location, and a normalized detail signature (line numbers / addresses /
 * volatile ids stripped) so the "same bug" collapses across actions and runs.
 */
export function findingDedupKey(category: string, url: string, signature: string): string {
  const normSig = signature
    .replace(/0x[0-9a-f]+/gi, '0x_')
    .replace(/:\d+:\d+/g, ':_:_')
    .replace(/\b\d{3,}\b/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
  return fnv1a([category, normalizeUrl(url), normSig].join('|'));
}
