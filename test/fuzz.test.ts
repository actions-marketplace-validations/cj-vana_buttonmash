import { describe, it, expect } from 'vitest';
import { fuzzValue, FUZZ_KEYS } from '../src/explorer/fuzz';
import { Rng } from '../src/core/rng';

describe('fuzz', () => {
  it('is deterministic for the same seed + step', () => {
    const a = fuzzValue(new Rng('s'), 'run', 3);
    const b = fuzzValue(new Rng('s'), 'run', 3);
    expect(a).toEqual(b);
  });

  it('produces a stable canary token per run+step', () => {
    const v = fuzzValue(new Rng('s'), 'run', 7);
    expect(v.canary).toMatch(/^cnry[0-9a-f]{8}zz$/);
    const again = fuzzValue(new Rng('other-seed'), 'run', 7);
    expect(again.canary).toBe(v.canary); // canary depends on run+step, not rng
  });

  it('marks probe values that contain the canary', () => {
    // Sweep steps until we hit a probe value, then verify the flag is correct.
    let sawProbe = false;
    for (let step = 0; step < 50; step++) {
      const v = fuzzValue(new Rng(`seed-${step}`), 'run', step);
      expect(v.probe).toBe(v.value.includes(v.canary));
      if (v.probe) sawProbe = true;
    }
    expect(sawProbe).toBe(true);
  });

  it('exposes a non-empty key corpus', () => {
    expect(FUZZ_KEYS.length).toBeGreaterThan(5);
    expect(FUZZ_KEYS).toContain('Enter');
  });
});
