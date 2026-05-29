/** results.json — the canonical machine-readable output every other format
 *  derives from. Detail is already redacted at capture time. */
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { RunResult } from '../core/types';

export async function writeJsonReport(result: RunResult, outDir: string): Promise<string> {
  const rel = 'results.json';
  await writeFile(join(outDir, rel), JSON.stringify(result, null, 2), 'utf8');
  return rel;
}
