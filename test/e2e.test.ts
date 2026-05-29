/**
 * End-to-end: run buttonmash against the bundled buggy app and assert it both
 * FINDS the planted bugs and RESPECTS the safety guardrails. Requires a
 * Chromium install (`npx playwright install chromium`).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buttonmash } from '../src/index';
import type { RunResult } from '../src/core/types';
import { startServer, type TestServer } from './helpers/server';

let server: TestServer;
let outDir: string;
let result: RunResult;

beforeAll(async () => {
  server = await startServer();
  outDir = mkdtempSync(join(tmpdir(), 'buttonmash-e2e-'));
  result = await buttonmash({
    target: server.url,
    seed: 'e2e-fixed',
    headless: true,
    logLevel: 'silent',
    budget: { maxActions: 160, maxDurationMs: 60_000, throttleMs: 30 },
    report: {
      outDir,
      formats: ['json'],
      github: false,
      captureScreenshots: false,
      captureTrace: false,
    },
  });
}, 90_000);

afterAll(async () => {
  await server?.close();
  if (outDir) rmSync(outDir, { recursive: true, force: true });
});

describe('e2e against the buggy app', () => {
  const categories = () => new Set(result.findings.map((f) => f.category));

  it('performs actions and fails the run', () => {
    expect(result.stats.actionsTaken).toBeGreaterThan(0);
    expect(result.run.exitCode).toBe(1);
  });

  it('detects the uncaught JS error', () => {
    expect(categories().has('js-error')).toBe(true);
  });

  it('detects the 5xx server error', () => {
    expect(categories().has('http-5xx')).toBe(true);
  });

  it('detects the broken image', () => {
    expect(categories().has('broken-image')).toBe(true);
  });

  it('does NOT trigger destructive controls (delete / pay)', () => {
    const all = result.findings.map((f) => `${f.title} ${f.description}`).join('\n');
    expect(all).not.toContain('DELETED-EVERYTHING');
    expect(all).not.toContain('PAID-REAL-MONEY');
  });

  it('does NOT false-positive on test-mode billing', () => {
    expect(categories().has('billing-live')).toBe(false);
  });

  it('stays on origin (no off-origin pages visited)', () => {
    expect(result.stats.pagesVisited).toBeGreaterThan(0);
    for (const a of result.actions) {
      expect(a.url.startsWith(server.url)).toBe(true);
    }
  });
});
