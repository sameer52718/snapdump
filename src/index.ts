import 'dotenv/config';
import { loadConfig } from './config.js';
import { startScheduler } from './scheduler.js';
import { runScheduledBackup } from './services/backupJob.js';
import { log } from './utils/logger.js';

process.on('unhandledRejection', (reason) => {
  log.error('unhandledRejection', { reason: String(reason) });
});

process.on('SIGINT', () => {
  log.info('Received SIGINT, exiting');
  process.exit(0);
});

process.on('SIGTERM', () => {
  log.info('Received SIGTERM, exiting');
  process.exit(0);
});

function main(): void {
  const config = loadConfig();

  log.info('Database backup service starting', {
    timezone: config.timezone,
    backupTime: config.backupTime,
    baseBackupFolder: config.baseBackupFolder,
    keepLocalCopy: config.keepLocalCopy,
    awsRegion: config.awsRegion,
    s3Bucket: config.s3Bucket,
  });

  startScheduler(config.timezone, config.backupTime, async () => {
    try {
      await runScheduledBackup(config);
    } catch {
      // Errors are logged inside the job; keep the scheduler process alive.
    }
  });
}

main();
