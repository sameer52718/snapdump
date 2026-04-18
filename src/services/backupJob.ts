import type { AppConfig } from '../config.js';
import { validateDatabaseUrl } from '../config.js';
import { createBackupZip } from '../backup/runBackup.js';
import { buildBackupObjectKey, createS3Client, uploadZipToS3 } from '../s3/upload.js';
import { ymdInTimeZone } from '../utils/dateParts.js';
import { log } from '../utils/logger.js';
import { withRetry } from '../utils/retry.js';

function isS3AccessDenied(message: string): boolean {
  return /AccessDenied|Access Denied/i.test(message);
}

function logS3AccessDeniedHint(): void {
  log.error(
    'S3 Access Denied: for zips under 5 GiB this app uses a single PutObject (needs s3:PutObject on the key). For larger zips multipart permissions are required. Also verify bucket policy, KMS, and AWS_REGION vs bucket region. See README "Troubleshooting: S3 Access Denied".',
  );
}

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

    const s3 = createS3Client(config);
    const { year, month, day } = ymdInTimeZone(config.timezone);
    const ts = Math.floor(Date.now() / 1000);
    const objectKey = buildBackupObjectKey(config.baseBackupFolder, year, month, day, ts);

    const uploaded = await withRetry(
      'uploadZipToS3',
      () =>
        uploadZipToS3(s3, config.s3Bucket, objectKey, backup.zipPath, {
          storageClass: config.s3StorageClass,
          contentLength: backup.sizeBytes,
        }),
      config.maxRetries,
    );

    log.info('Upload successful...', {
      bucket: uploaded.bucket,
      key: uploaded.key,
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
    if (isS3AccessDenied(msg)) {
      logS3AccessDeniedHint();
    }
    if (zipPath) {
      log.warn('Local zip retained for troubleshooting', { zipPath });
    }
  }
}
