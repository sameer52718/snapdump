import path from 'node:path';
import { detectDbType, type DbType } from './backup/detectDb.js';

export interface AppConfig {
  databaseUrl: string;
  backupTime: string;
  timezone: string;
  baseBackupFolder: string;
  keepLocalCopy: boolean;
  serviceAccountKeyPath: string;
  /** Optional Google Drive folder ID to create backups under (share this folder with the service account). */
  driveParentFolderId: string | undefined;
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

export function loadConfig(): AppConfig {
  const keyPath =
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH?.trim() ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim() ||
    path.resolve(process.cwd(), 'credentials.json');

  return {
    databaseUrl: requireEnv('DATABASE_URL'),
    backupTime: optionalEnv('BACKUP_TIME', '02:00'),
    timezone: optionalEnv('TIMEZONE', 'Asia/Karachi'),
    baseBackupFolder: optionalEnv('BASE_BACKUP_FOLDER', 'MyAppBackups'),
    keepLocalCopy: boolEnv('KEEP_LOCAL_COPY', false),
    serviceAccountKeyPath: keyPath,
    driveParentFolderId: process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID?.trim() || undefined,
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
