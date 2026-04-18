import { log } from './logger.js';

export async function withRetry<T>(
  label: string,
  fn: () => Promise<T>,
  maxRetries: number,
): Promise<T> {
  let lastError: unknown;
  const attempts = maxRetries + 1;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      const msg = e instanceof Error ? e.message : String(e);
      if (i < attempts - 1) {
        log.warn(`Retrying after failure (${label})`, {
          attempt: i + 1,
          nextAttempt: i + 2,
          error: msg,
        });
        await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`${label} failed after ${attempts} attempts: ${String(lastError)}`);
}
