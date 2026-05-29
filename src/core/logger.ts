/** Tiny leveled logger with optional color. */
import pc from 'picocolors';

export type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug';

const ORDER: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
};

export class Logger {
  constructor(private level: LogLevel = 'info') {}

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  private enabled(level: Exclude<LogLevel, 'silent'>): boolean {
    return ORDER[this.level] >= ORDER[level];
  }

  banner(msg: string): void {
    if (this.enabled('info')) console.log(pc.bold(pc.magenta(msg)));
  }

  info(msg: string): void {
    if (this.enabled('info')) console.log(msg);
  }

  step(msg: string): void {
    if (this.enabled('info')) console.log(pc.dim('· ') + msg);
  }

  success(msg: string): void {
    if (this.enabled('info')) console.log(pc.green('✓ ') + msg);
  }

  warn(msg: string): void {
    if (this.enabled('warn')) console.warn(pc.yellow('⚠ ') + msg);
  }

  error(msg: string): void {
    if (this.enabled('error')) console.error(pc.red('✗ ') + msg);
  }

  debug(msg: string): void {
    if (this.enabled('debug')) console.log(pc.dim('  ' + msg));
  }
}

export const logger = new Logger();
