import { describe, it, expect } from 'vitest';
import { DEFAULT_CONSOLE_IGNORE } from '../src/detectors/signals';
import { compileRegexes, anyMatch } from '../src/core/regex';

describe('default console-noise allowlist', () => {
  const res = compileRegexes(DEFAULT_CONSOLE_IGNORE);

  it('matches well-known benign noise', () => {
    for (const noise of [
      'ResizeObserver loop completed with undelivered notifications.',
      'Warning: Each child in a list should have a unique "key" prop.',
      'Download the React DevTools for a better development experience',
      '[vite] connecting...',
      'Warning: validateDOMNesting(...): <div> cannot appear as a child of <p>',
    ]) {
      expect(anyMatch(noise, res)).toBe(true);
    }
  });

  it('does NOT match a real application error', () => {
    for (const real of [
      "TypeError: Cannot read properties of undefined (reading 'id')",
      'Uncaught ReferenceError: foo is not defined',
      'Failed to save: 500 Internal Server Error',
    ]) {
      expect(anyMatch(real, res)).toBe(false);
    }
  });
});
