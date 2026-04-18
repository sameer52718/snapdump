import type { AppConfig } from '../config.js';
import { validateDatabaseUrl } from '../config.js';
import { createBackupZip } from '../backup/runBackup.js';
import { createDriveClient } from '../drive/client.js';
import { ensureFolderPath } from '../drive/folders.js';
import { uploadZipFile } from '../drive/upload.js';
import { ymdInTimeZone } from '../utils/dateParts.js';
import { log } from '../utils/logger.js';
import { withRetry } from '../utils/retry.js';

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const kb = n / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KiB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(2)} MiB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GiB`;
}

export async function runScheduledBackup(config: AppConfig): Promise<void> {
  try {
    const { type } = validateDatabaseUrl(config.databaseUrl);
    log.info('DATABASE_URL validated', { engine: type });
  } catch (e) {
    log.error('DATABASE_URL validation failed', {
      error: e instanceof Error ? e.message : String(e),
    });
    return;
  }

  let zipPath: string | undefined;

  try {
    const backup = await withRetry(
      'createBackupZip',
      () => createBackupZip(config.databaseUrl),
      config.maxRetries,
    );

    zipPath = backup.zipPath;
    log.info('Zip ready for upload', {
      zipPath: backup.zipPath,
      sizeBytes: backup.sizeBytes,
      size: formatBytes(backup.sizeBytes),
    });

    const drive = createDriveClient(config.serviceAccountKeyPath);
    const parent = config.driveParentFolderId ?? 'root';

    const { year, month, day } = ymdInTimeZone(config.timezone);
    const pathSegments = [config.baseBackupFolder, year, month, day];

    const leafFolderId = await withRetry(
      'ensureFolderPath',
      () => ensureFolderPath(drive, parent, pathSegments),
      config.maxRetries,
    );

    const ts = Math.floor(Date.now() / 1000);
    const name = `backup-${ts}.zip`;

    const fileId = await withRetry(
      'uploadZip',
      () => uploadZipFile(drive, leafFolderId, backup.zipPath, name),
      config.maxRetries,
    );

    log.info('Upload successful...', {
      fileId,
      name,
      sizeBytes: backup.sizeBytes,
      size: formatBytes(backup.sizeBytes),
    });

    if (!config.keepLocalCopy) {
      await backup.removeLocalZip();
      log.info('Local zip removed (KEEP_LOCAL_COPY=false)');
    } else {
      log.info('Local zip kept (KEEP_LOCAL_COPY=true)', { zipPath: backup.zipPath });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.error('Backup job failed', { error: msg });
    if (zipPath) {
      log.warn('Local zip retained for troubleshooting', { zipPath });
    }
    throw e;
  }
}
