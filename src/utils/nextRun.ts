import { parseExpression } from 'cron-parser';

export function getNextRunIso(cronExpression: string, timeZone: string): string {
  return parseExpression(cronExpression, { tz: timeZone }).next().toDate().toISOString();
}
