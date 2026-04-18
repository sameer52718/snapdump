export type DbType = 'mongodb' | 'postgresql' | 'mysql';

export function detectDbType(databaseUrl: string): DbType {
  const s = databaseUrl.trim().toLowerCase();

  if (s.startsWith('mongodb://') || s.startsWith('mongodb+srv://')) {
    return 'mongodb';
  }
  if (s.startsWith('postgres://') || s.startsWith('postgresql://')) {
    return 'postgresql';
  }
  if (s.startsWith('mysql://') || s.startsWith('mariadb://')) {
    return 'mysql';
  }

  throw new Error(
    'Unsupported DATABASE_URL scheme. Expected mongodb/mongodb+srv, postgres/postgresql, or mysql/mariadb.',
  );
}
