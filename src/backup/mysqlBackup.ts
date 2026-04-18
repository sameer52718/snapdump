import fs from 'node:fs/promises';
import path from 'node:path';
import { runCmd } from '../utils/shell.js';
import type { BackupArtifacts } from './types.js';

interface MysqlConn {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

function parseMysqlUrl(databaseUrl: string): MysqlConn {
  const u = new URL(databaseUrl);
  const db = u.pathname.replace(/^\//, '').split('/')[0];
  if (!db) {
    throw new Error('MySQL DATABASE_URL must include a database name in the path (e.g. mysql://user:pass@host:3306/mydb)');
  }
  const password = decodeURIComponent(u.password);
  const user = decodeURIComponent(u.username);
  const host = u.hostname;
  const port = u.port ? Number.parseInt(u.port, 10) : 3306;
  if (!user) {
    throw new Error('MySQL DATABASE_URL must include a username');
  }
  return { host, port, user, password, database: db };
}

async function writeDefaultsExtraFile(workDir: string, conn: MysqlConn): Promise<string> {
  const cnfPath = path.join(workDir, 'mysql-client.cnf');
  const lines = [
    '[client]',
    `host=${conn.host}`,
    `port=${conn.port}`,
    `user=${conn.user}`,
    `password=${conn.password}`,
  ];
  await fs.writeFile(cnfPath, `${lines.join('\n')}\n`, { mode: 0o600 });
  return cnfPath;
}

/**
 * mysqldump with transactional consistency for InnoDB and full object coverage.
 */
export async function backupMysql(workDir: string, databaseUrl: string): Promise<BackupArtifacts> {
  const conn = parseMysqlUrl(databaseUrl);
  const cnfPath = await writeDefaultsExtraFile(workDir, conn);
  const outFile = path.join(workDir, 'mysql.sql');

  const args = [
    `--defaults-extra-file=${cnfPath}`,
    '--single-transaction',
    '--routines',
    '--triggers',
    '--events',
    '--hex-blob',
    '--default-character-set=utf8mb4',
    '--set-gtid-purged=OFF',
    '--column-statistics=0',
    '--result-file',
    outFile,
    conn.database,
  ];

  await runCmd('mysqldump', args, { cwd: workDir });

  return {
    zipEntries: [{ absolutePath: outFile, entryName: 'mysql.sql' }],
    dispose: async () => {
      await fs.unlink(cnfPath).catch(() => undefined);
    },
  };
}
