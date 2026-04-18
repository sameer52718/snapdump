import { detectDbType, type DbType } from './backup/detectDb.js';

export interface AppConfig {
  databaseUrl: string;
  backupTime: string;
  timezone: string;
  baseBackupFolder: string;
  keepLocalCopy: boolean;
  awsRegion: string;
  s3Bucket: string;
  /** Custom endpoint (LocalStack, MinIO, etc.). */
  s3Endpoint: string | undefined;
  /** Set true for MinIO and some S3-compatible APIs. */
  s3ForcePathStyle: boolean;
  /** e.g. STANDARD_IA, GLACIER_IR — omit for STANDARD */
  s3StorageClass: string | undefined;
  maxRetries: number;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (v === undefined || v.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v.trim();
}

function optionalEnv(name: string, defaultValue: string): string {
  const v = process.env[name];
  if (v === undefined || v.trim() === '') {
    return defaultValue;
  }
  return v.trim();
}

function boolEnv(name: string, defaultValue: boolean): boolean {
  const v = process.env[name];
  if (v === undefined || v.trim() === '') {
    return defaultValue;
  }
  return ['1', 'true', 'yes', 'on'].includes(v.trim().toLowerCase());
}

function requireAwsRegion(): string {
  const r = process.env.AWS_REGION?.trim() || process.env.AWS_DEFAULT_REGION?.trim();
  if (!r) {
    throw new Error('Missing AWS region: set AWS_REGION or AWS_DEFAULT_REGION');
  }
  return r;
}

export function loadConfig(): AppConfig {
  return {
    databaseUrl: requireEnv('DATABASE_URL'),
    backupTime: optionalEnv('BACKUP_TIME', '02:00'),
    timezone: optionalEnv('TIMEZONE', 'Asia/Karachi'),
    baseBackupFolder: optionalEnv('BASE_BACKUP_FOLDER', 'MyAppBackups'),
    keepLocalCopy: boolEnv('KEEP_LOCAL_COPY', false),
    awsRegion: requireAwsRegion(),
    s3Bucket: requireEnv('S3_BUCKET'),
    s3Endpoint: process.env.S3_ENDPOINT?.trim() || undefined,
    s3ForcePathStyle: boolEnv('S3_FORCE_PATH_STYLE', false),
    s3StorageClass: process.env.S3_STORAGE_CLASS?.trim() || undefined,
    maxRetries: Math.max(2, Number.parseInt(process.env.BACKUP_MAX_RETRIES ?? '2', 10) || 2),
  };
}

export function validateDatabaseUrl(urlString: string): { type: DbType } {
  if (!urlString || urlString.trim() === '') {
    throw new Error('DATABASE_URL is empty');
  }
  try {
    const type = detectDbType(urlString);
    if (type === 'mysql' || type === 'postgresql') {
      try {
        new URL(urlString);
      } catch {
        throw new Error('DATABASE_URL is not a valid URL for this database engine');
      }
    }
    return { type };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Invalid DATABASE_URL: ${msg}`);
  }
}
