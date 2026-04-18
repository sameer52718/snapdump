import path from 'node:path';
import { runCmd } from '../utils/shell.js';
import { pathForCliArg } from '../utils/cliPaths.js';
import type { BackupArtifacts } from './types.js';

function normalizeMongoUri(uri: string): string {
  return uri.replace(/^\uFEFF/, '').trim();
}

/**
 * Full logical dump using mongodump (not manual queries).
 * Uses archive output for a single artifact suitable for mongorestore --archive.
 */
export async function backupMongo(workDir: string, databaseUrl: string): Promise<BackupArtifacts> {
  const uri = normalizeMongoUri(databaseUrl);
  const outFile = path.join(workDir, 'mongodb.archive');
  const archive = pathForCliArg(outFile);
  // Use = form so Windows cmd wrappers (if any) do not split on '+' inside mongodb+srv://
  await runCmd('mongodump', [`--uri=${uri}`, `--archive=${archive}`]);

  return {
    zipEntries: [{ absolutePath: outFile, entryName: 'mongodb.archive' }],
  };
}
