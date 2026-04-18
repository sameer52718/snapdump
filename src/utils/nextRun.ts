import { createRequire } from 'node:module';
import type { CronExpression } from 'cron-parser';

const require = createRequire(import.meta.url);
/** `cron-parser` is CJS (`module.exports`); named ESM imports are not available at runtime. */
const cronParser = require('cron-parser') as {
  parseExpression(expression: string, options?: { tz?: string }): CronExpression;
};

export function getNextRunIso(cronExpression: string, timeZone: string): string {
  return cronParser.parseExpression(cronExpression, { tz: timeZone }).next().toDate().toISOString();
}
