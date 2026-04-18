import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { detectDbType } from './detectDb.js';
import { backupMongo } from './mongoBackup.js';
import { backupMysql } from './mysqlBackup.js';
import { backupPostgres } from './postgresBackup.js';
import { fileSizeBytes, zipFilesToPath } from '../utils/zipStream.js';
import { log } from '../utils/logger.js';
import type { BackupArtifacts } from './types.js';

async function mkWorkDir(): Promise<string> {
  const dir = path.join(os.tmpdir(), `db-backup-${randomBytes(8).toString('hex')}`);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function runEngineBackup(
  type: ReturnType<typeof detectDbType>,
  workDir: string,
  databaseUrl: string,
): Promise<BackupArtifacts> {
  if (type === 'mongodb') {
    return backupMongo(workDir, databaseUrl);
  }
  if (type === 'postgresql') {
    return backupPostgres(workDir, databaseUrl);
  }
  return backupMysql(workDir, databaseUrl);
}

export interface BackupZipResult {
  zipPath: string;
  sizeBytes: number;
  /** Deletes the local zip (call after successful upload if KEEP_LOCAL_COPY=false). */
  removeLocalZip: () => Promise<void>;
}

/**
 * Creates a temp work dir, runs the correct CLI dump, streams a zip, cleans dump artifacts.
 */
export async function createBackupZip(databaseUrl: string): Promise<BackupZipResult> {
  const type = detectDbType(databaseUrl);
  const workDir = await mkWorkDir();
  let artifacts: BackupArtifacts | undefined;

  const disposeAll = async () => {
    if (artifacts?.dispose) {
      await artifacts.dispose().catch(() => undefined);
    }
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  };

  let zipPath: string | undefined;

  try {
    log.info('Backup started...', { engine: type });
    artifacts = await runEngineBackup(type, workDir, databaseUrl);
    log.info('Dump completed...', { engine: type });

    const ts = Math.floor(Date.now() / 1000);
    zipPath = path.join(os.tmpdir(), `backup-${ts}-${randomBytes(4).toString('hex')}.zip`);
    await zipFilesToPath(zipPath, artifacts.zipEntries);

    if (artifacts.dispose) {
      await artifacts.dispose().catch(() => undefined);
      artifacts.dispose = undefined;
    }

    await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);

    const sizeBytes = await fileSizeBytes(zipPath);
    log.info('Zip created', { path: zipPath, sizeBytes });

    return {
      zipPath,
      sizeBytes,
      removeLocalZip: async () => {
        await fs.unlink(zipPath!).catch(() => undefined);
      },
    };
  } catch (e) {
    if (zipPath) {
      await fs.unlink(zipPath).catch(() => undefined);
    }
    await disposeAll();
    throw e;
  }
}
