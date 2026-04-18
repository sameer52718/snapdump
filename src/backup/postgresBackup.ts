import path from 'node:path';
import { runCmd } from '../utils/shell.js';
import type { BackupArtifacts } from './types.js';

/**
 * Custom-format dump (-Fc) is the production default: compressed, parallel-restore friendly via pg_restore.
 * Large objects are included by default in pg_dump; --blobs kept explicit for clarity.
 */
export async function backupPostgres(workDir: string, databaseUrl: string): Promise<BackupArtifacts> {
  const outFile = path.join(workDir, 'postgres.dump');
  await runCmd('pg_dump', [
    '--format=custom',
    '--blobs',
    '--no-owner',
    '--no-acl',
    '--file',
    outFile,
    databaseUrl,
  ]);

  return {
    zipEntries: [{ absolutePath: outFile, entryName: 'postgres.dump' }],
  };
}
