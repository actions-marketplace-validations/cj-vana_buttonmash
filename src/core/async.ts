/** Wall-clock helpers. Playwright will not kill runaway in-page JS, so any call
 *  that can hang on a frozen renderer (evaluate/content/screenshot) must be
 *  raced against our own deadline. */

export class TimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`HANG: ${label} exceeded ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

export function withDeadline<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const guard = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(label, ms)), ms);
  });
  return Promise.race([p.finally(() => clearTimeout(timer)), guard]);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
