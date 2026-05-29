/** Compile user-supplied regex strings, skipping (and warning on) bad ones. */
import { logger } from './logger';

export function compileRegexes(patterns: readonly string[], flags = 'i'): RegExp[] {
  const out: RegExp[] = [];
  for (const p of patterns) {
    try {
      out.push(new RegExp(p, flags));
    } catch (err) {
      logger.warn(`Ignoring invalid regex "${p}": ${(err as Error).message}`);
    }
  }
  return out;
}

/** Combine path patterns into one alternation, or null if none. */
export function combineRegexes(regexes: readonly RegExp[]): RegExp | null {
  if (regexes.length === 0) return null;
  return new RegExp(regexes.map((r) => `(?:${r.source})`).join('|'), 'i');
}

export function anyMatch(text: string, regexes: readonly RegExp[]): boolean {
  return regexes.some((r) => {
    r.lastIndex = 0;
    return r.test(text);
  });
}
