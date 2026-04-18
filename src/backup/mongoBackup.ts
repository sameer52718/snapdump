import path from 'node:path';
import { runCmd } from '../utils/shell.js';
import type { BackupArtifacts } from './types.js';

/**
 * Full logical dump using mongodump (not manual queries).
 * Uses archive output for a single artifact suitable for mongorestore --archive.
 */
export async function backupMongo(workDir: string, databaseUrl: string): Promise<BackupArtifacts> {
  const outFile = path.join(workDir, 'mongodb.archive');
  await runCmd('mongodump', ['--uri', databaseUrl, '--archive', outFile]);

  return {
    zipEntries: [{ absolutePath: outFile, entryName: 'mongodb.archive' }],
  };
}
