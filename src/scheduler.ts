import cron from 'node-cron';
import { backupTimeToCron } from './utils/cronFromTime.js';
import { getNextRunIso } from './utils/nextRun.js';
import { log } from './utils/logger.js';

export function startScheduler(
  timezone: string,
  backupTime: string,
  task: () => Promise<void>,
): void {
  const expression = backupTimeToCron(backupTime);
  const nextRun = getNextRunIso(expression, timezone);

  log.info('Cron schedule active', {
    backupTime,
    timezone,
    expression,
    nextRunUtc: nextRun,
  });

  cron.schedule(
    expression,
    () => {
      void task();
    },
    { timezone },
  );
}
