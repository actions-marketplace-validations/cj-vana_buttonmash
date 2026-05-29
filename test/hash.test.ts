import { describe, it, expect } from 'vitest';
import {
  fnv1a,
  normalizeUrl,
  elementFingerprint,
  structuralFingerprint,
  stateFingerprint,
  findingDedupKey,
} from '../src/core/hash';

describe('hash', () => {
  it('fnv1a is stable and 8 hex chars', () => {
    expect(fnv1a('hello')).toBe(fnv1a('hello'));
    expect(fnv1a('hello')).toMatch(/^[0-9a-f]{8}$/);
    expect(fnv1a('a')).not.toBe(fnv1a('b'));
  });

  it('normalizeUrl strips volatile params + hash, sorts the rest', () => {
    const n = normalizeUrl('https://x.test/p?b=2&utm_source=ad&a=1&session=zzz#frag');
    expect(n).toBe('https://x.test/p?a=1&b=2');
  });

  it('normalizeUrl returns invalid urls unchanged', () => {
    expect(normalizeUrl('not a url')).toBe('not a url');
  });

  it('elementFingerprint is stable across identical descriptors', () => {
    const d = { tag: 'button', type: null, role: null, name: 'Save', path: 'body:0>button:1' };
    expect(elementFingerprint(d)).toBe(elementFingerprint({ ...d }));
  });

  it('structuralFingerprint ignores text so live counters/clocks do not churn state', () => {
    const a = { tag: 'span', type: null, role: null, path: 'body:0>span:2' };
    // same structure, different visible text → same structural fp (no churn)
    expect(structuralFingerprint({ ...a })).toBe(structuralFingerprint({ ...a }));
    // but a different position is still a different control
    expect(structuralFingerprint(a)).not.toBe(structuralFingerprint({ ...a, path: 'body:0>span:3' }));
    // and elementFingerprint (which DOES include name) differs on text
    expect(elementFingerprint({ ...a, name: '3 minutes ago' })).not.toBe(
      elementFingerprint({ ...a, name: '4 minutes ago' }),
    );
  });

  it('stateFingerprint is order-independent over elements', () => {
    const url = 'https://x.test/a';
    expect(stateFingerprint(url, ['a', 'b', 'c'])).toBe(stateFingerprint(url, ['c', 'b', 'a']));
    expect(stateFingerprint(url, ['a', 'b'])).not.toBe(stateFingerprint(url, ['a', 'b', 'c']));
  });

  it('findingDedupKey collapses volatile numbers and line:col', () => {
    const a = findingDedupKey('js-error', 'https://x.test/p', 'Error at app.js:100:5');
    const b = findingDedupKey('js-error', 'https://x.test/p', 'Error at app.js:288:91');
    expect(a).toBe(b);
  });
});
