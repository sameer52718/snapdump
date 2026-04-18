# Database backup service

Production-oriented Node.js (TypeScript) worker that runs **native CLI backups** (`mongodump`, `pg_dump`, `mysqldump`), streams them into a **`.zip`**, and uploads to **Google Drive** using a **service account**. Scheduling is **daily** via `node-cron` using `BACKUP_TIME` and `TIMEZONE`.

## Prerequisites

- **Node.js 18+**
- Database client tools on `PATH` for your engine:
  - **MongoDB**: `mongodump`
  - **PostgreSQL**: `pg_dump`
  - **MySQL/MariaDB**: `mysqldump`
- A Google Cloud **service account** with the Drive API enabled and a JSON key file (`credentials.json` or path via env).

## Quick start

1. Install dependencies:

```bash
npm install
```

2. Create a `.env` file (see variables below).

3. Place your service account JSON key at `./credentials.json` **or** set `GOOGLE_SERVICE_ACCOUNT_KEY_PATH`.

4. **Share a Drive folder** with the service account email (shown in the JSON as `client_email`). Put that folder’s ID into `GOOGLE_DRIVE_PARENT_FOLDER_ID`. The service will create `BASE_BACKUP_FOLDER/YYYY/MM/DD/` under it.

5. Build and run:

```bash
npm run build
npm start
```

Development (watch mode):

```bash
npm run dev
```

## Environment variables

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `DATABASE_URL` | **Yes** | — | Auto-detects engine from scheme (`mongodb`, `mongodb+srv`, `postgres`, `postgresql`, `mysql`, `mariadb`). |
| `BACKUP_TIME` | No | `02:00` | Local time `HH:mm` (24h) for the daily run. |
| `TIMEZONE` | No | `Asia/Karachi` | IANA timezone for cron and `Y/M/D` folder paths. |
| `BASE_BACKUP_FOLDER` | No | `MyAppBackups` | Top-level folder name inside Drive. |
| `KEEP_LOCAL_COPY` | No | `false` | If `true`, keeps the local zip after upload. |
| `GOOGLE_SERVICE_ACCOUNT_KEY_PATH` | No | `./credentials.json` | Path to service account JSON. |
| `GOOGLE_APPLICATION_CREDENTIALS` | No | — | Alternative to the above (standard Google env). |
| `GOOGLE_DRIVE_PARENT_FOLDER_ID` | **Recommended** | — | Drive folder ID shared with the service account; backups are created under this folder. If omitted, the API uses `'root'` (the service account’s own Drive), which is often **not** what you want in production. |
| `BACKUP_MAX_RETRIES` | No | `2` | Minimum `2` enforced: retries after the first failure (each operation gets **up to** `BACKUP_MAX_RETRIES + 1` attempts). |

## Drive layout

With `BASE_BACKUP_FOLDER=MyAppBackups`, `TIMEZONE=Asia/Karachi`, and run date 18 Apr 2026:

```text
MyAppBackups/2026/04/18/backup-<unixTimestamp>.zip
```

Example: `MyAppBackups/2026/04/18/backup-1713423434.zip`.

## Backup behavior (CLI)

- **MongoDB**: `mongodump --uri <DATABASE_URL> --archive <file>` (full archive; restore with `mongorestore --archive`).
- **PostgreSQL**: `pg_dump` in **custom** format (`-Fc` via `--format=custom`) with `--blobs`, `--no-owner`, `--no-acl` for portable dumps; restore with `pg_restore`.
- **MySQL**: `mysqldump` with `--single-transaction`, `--routines`, `--triggers`, `--events`, `--hex-blob`, `--default-character-set=utf8mb4`, `--set-gtid-purged=OFF`, and `--column-statistics=0` (common MySQL 8 compatibility flag). Credentials are passed via a temporary `--defaults-extra-file` to avoid putting the password on the process command line.

## Security notes

- Treat `credentials.json` and `.env` as secrets; they are listed in `.gitignore`.
- Prefer a dedicated **shared Drive folder** (`GOOGLE_DRIVE_PARENT_FOLDER_ID`) instead of relying on the service account root.
- The service account must have access to the parent folder you configure.

## Operational notes

- Run **one instance** per backup configuration. Concurrent runs can race on Drive folder creation (unlikely to corrupt data, but can create duplicate empty folders if names collide exactly at the same time).
- On failure **after** a zip is produced, the local zip may be **kept** to help debugging (see logs for the path).

## Project layout

```text
src/
  index.ts              # Entrypoint, signals, loads config
  scheduler.ts          # node-cron wiring + next-run logging
  config.ts             # Env loading / validation helpers
  backup/
    detectDb.ts         # URL scheme detection
    mongoBackup.ts
    postgresBackup.ts
    mysqlBackup.ts
    runBackup.ts        # Temp dirs, zip, cleanup
  drive/
    client.ts
    folders.ts          # Idempotent folder path creation
    upload.ts
  services/
    backupJob.ts        # End-to-end job with retries
  utils/
    cronFromTime.ts
    dateParts.ts
    logger.ts
    nextRun.ts
    retry.ts
    shell.ts
    zipStream.ts
```

## License

MIT
