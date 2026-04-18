import fs from 'node:fs';
import { stat } from 'node:fs/promises';
import { PutObjectCommand, S3Client, type StorageClass } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import type { AppConfig } from '../config.js';

/** S3 single-object PUT limit; below this we use PutObject (works with IAM that only allows s3:PutObject). */
const MULTIPART_THRESHOLD_BYTES = 5 * 1024 * 1024 * 1024;

function toUploadError(err: unknown, ctx: { bucket: string; key: string }): Error {
  if (err !== null && typeof err === 'object' && '$metadata' in err) {
    const e = err as {
      name?: string;
      message?: string;
      Code?: string;
      $metadata?: { requestId?: string; httpStatusCode?: number; extendedRequestId?: string };
    };
    const bits = [
      e.Code ?? e.name ?? 'S3Error',
      e.message,
      `bucket=${ctx.bucket}`,
      `key=${ctx.key}`,
    ];
    if (e.$metadata?.requestId) {
      bits.push(`requestId=${e.$metadata.requestId}`);
    }
    if (e.$metadata?.extendedRequestId) {
      bits.push(`xAmzId2=${e.$metadata.extendedRequestId}`);
    }
    if (e.$metadata?.httpStatusCode !== undefined) {
      bits.push(`httpStatus=${e.$metadata.httpStatusCode}`);
    }
    return new Error(bits.filter(Boolean).join(' | '));
  }
  return err instanceof Error ? err : new Error(String(err));
}

export function createS3Client(
  config: Pick<AppConfig, 'awsRegion' | 's3Endpoint' | 's3ForcePathStyle'>,
): S3Client {
  return new S3Client({
    region: config.awsRegion,
    ...(config.s3Endpoint ? { endpoint: config.s3Endpoint } : {}),
    ...(config.s3ForcePathStyle ? { forcePathStyle: true } : {}),
  });
}

/**
 * S3 object key: BASE_BACKUP_FOLDER/YYYY/MM/DD/backup-<unix>.zip
 */
export function buildBackupObjectKey(
  baseFolder: string,
  year: string,
  month: string,
  day: string,
  unixSeconds: number,
): string {
  const base = baseFolder
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .replace(/\\/g, '/');
  const segments = [base, year, month, day, `backup-${unixSeconds}.zip`].filter((s) => s.length > 0);
  return segments.join('/').replace(/\/+/g, '/');
}

/**
 * Upload zip via stream. Files under 5 GiB use a single PutObject (no multipart APIs), so a minimal
 * IAM policy with only `s3:PutObject` on `bucket/*` is enough for typical database backups.
 * Larger archives use `@aws-sdk/lib-storage` multipart upload.
 */
export async function uploadZipToS3(
  client: S3Client,
  bucket: string,
  key: string,
  zipPath: string,
  options: { storageClass?: string; contentLength?: number } = {},
): Promise<{ bucket: string; key: string }> {
  const contentLength = options.contentLength ?? (await stat(zipPath)).size;

  if (contentLength < MULTIPART_THRESHOLD_BYTES) {
    try {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: fs.createReadStream(zipPath),
          ContentLength: contentLength,
          ContentType: 'application/zip',
          ...(options.storageClass
            ? { StorageClass: options.storageClass as StorageClass }
            : {}),
        }),
      );
    } catch (e) {
      throw toUploadError(e, { bucket, key });
    }
    return { bucket, key };
  }

  const upload = new Upload({
    client,
    params: {
      Bucket: bucket,
      Key: key,
      Body: fs.createReadStream(zipPath),
      ContentType: 'application/zip',
      ...(options.storageClass
        ? { StorageClass: options.storageClass as StorageClass }
        : {}),
    },
  });

  try {
    await upload.done();
  } catch (e) {
    throw toUploadError(e, { bucket, key });
  }
  return { bucket, key };
}
