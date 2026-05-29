/** Write every configured report format from the canonical RunResult. */
import { join } from 'node:path';

import type { ResolvedConfig } from '../config/load';
import { logger } from '../core/logger';
import type { RunResult } from '../core/types';
import { emitGitHub } from './github';
import { writeHtmlReport } from './html';
import { writeJsonReport } from './json';
import { writeJUnitReport } from './junit';
import { writeSarifReport } from './sarif';

export async function writeReports(
  result: RunResult,
  outDir: string,
  cfg: ResolvedConfig,
): Promise<string[]> {
  const written: string[] = [];
  const formats = new Set(cfg.report.formats);

  // results.json is always written — it is the source of truth.
  written.push(await writeJsonReport(result, outDir));
  if (formats.has('junit')) written.push(await writeJUnitReport(result, outDir));
  if (formats.has('html')) written.push(await writeHtmlReport(result, outDir));
  if (formats.has('sarif')) written.push(await writeSarifReport(result, outDir));

  if (cfg.report.github) emitGitHub(result);

  for (const rel of written) logger.step(`Report: ${join(outDir, rel)}`);
  return written;
}

export { writeJsonReport, writeJUnitReport, writeHtmlReport, writeSarifReport, emitGitHub };
