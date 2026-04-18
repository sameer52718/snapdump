# Database backup service

Production-oriented Node.js (TypeScript) worker that runs **native CLI backups** (`mongodump`, `pg_dump`, `mysqldump`), streams them into a **`.zip`**, and uploads to **Amazon S3**. Scheduling is **daily** via `node-cron` using `BACKUP_TIME` and `TIMEZONE`.

## Prerequisites

- **Node.js 18+**
- Database client tools on `PATH` for your engine:
  - **MongoDB**: `mongodump`
  - **PostgreSQL**: `pg_dump`
  - **MySQL/MariaDB**: `mysqldump`
- **AWS** access to an **S3 bucket** (IAM user keys, instance/profile credentials, or environment-specific auth the AWS SDK supports).

## Quick start

1. Install dependencies:

```bash
npm install
```

2. Create an S3 bucket (any region you prefer).

3. Create a `.env` file (see [Environment variables](#environment-variables)). At minimum you need `DATABASE_URL`, `AWS_REGION` (or `AWS_DEFAULT_REGION`), `S3_BUCKET`, and credentials unless you run on AWS with an **IAM role** (EC2, ECS, Lambda, etc.).

4. Build and run:

```bash
npm run build
npm start
```

Development (watch mode):

```bash
npm run dev
```

## Environment variables

### Required

| Variable | Description |
| --- | --- |
| `DATABASE_URL` | Auto-detects engine from scheme (`mongodb`, `mongodb+srv`, `postgres`, `postgresql`, `mysql`, `mariadb`). |
| `S3_BUCKET` | Target bucket name (no `s3://` prefix). |
| `AWS_REGION` **or** `AWS_DEFAULT_REGION` | Region for the S3 client (e.g. `ap-south-1`, `us-east-1`). |

### AWS credentials (pick one approach)

The app uses the **default AWS SDK credential chain**. You do **not** need all of these; use what matches your environment.

| Variable | When to use |
| --- | --- |
| `AWS_ACCESS_KEY_ID` | Long-term or IAM user access key (with `AWS_SECRET_ACCESS_KEY`). |
| `AWS_SECRET_ACCESS_KEY` | Pair with `AWS_ACCESS_KEY_ID`. |
| `AWS_SESSION_TOKEN` | Temporary credentials (e.g. assumed role). |
| `AWS_PROFILE` | Shared credentials file profile name (local dev). |
| *(none)* | On **EC2 / ECS / Lambda**, prefer an **IAM role** attached to the workload. |

For **typical backups under 5 GiB**, the app uses one **`s3:PutObject`** request per zip, so IAM can be as small as **`s3:PutObject`** on `arn:aws:s3:::YOUR_BUCKET/*`. **Larger** zips use multipart upload and need the extra actions listed in [Troubleshooting](#troubleshooting-s3-access-denied).

### Optional

| Variable | Default | Description |
| --- | --- | --- |
| `BACKUP_TIME` | `02:00` | Daily run time `HH:mm` (24h), interpreted in `TIMEZONE`. |
| `TIMEZONE` | `Asia/Karachi` | IANA timezone for cron and for `Y/M/D` in the object key. |
| `BASE_BACKUP_FOLDER` | `MyAppBackups` | First segment of the S3 key (logical “folder”). |
| `KEEP_LOCAL_COPY` | `false` | If `true`, keeps the local zip after upload. |
| `S3_ENDPOINT` | — | Custom endpoint (e.g. **LocalStack**, **MinIO**). |
| `S3_FORCE_PATH_STYLE` | `false` | Set `true` for many S3-compatible stores (e.g. MinIO). |
| `S3_STORAGE_CLASS` | — | e.g. `STANDARD_IA`, `GLACIER_IR` (must be valid for your bucket). |
| `BACKUP_MAX_RETRIES` | `2` | Minimum `2` enforced: retries after the first failure (each step gets up to `BACKUP_MAX_RETRIES + 1` attempts). |

## S3 object layout

With `BASE_BACKUP_FOLDER=MyAppBackups`, `TIMEZONE=Asia/Karachi`, and run date 18 Apr 2026:

```text
s3://YOUR_BUCKET/MyAppBackups/2026/04/18/backup-<unixTimestamp>.zip
```

Example object key: `MyAppBackups/2026/04/18/backup-1713423434.zip`.

S3 has no real folders; `/` is a **key prefix** for organization in the console.

## Backup behavior (CLI)

- **MongoDB**: `mongodump --uri <DATABASE_URL> --archive <file>` (restore with `mongorestore --archive`).
- **PostgreSQL**: `pg_dump` **custom** format with `--blobs`, `--no-owner`, `--no-acl`; restore with `pg_restore`.
- **MySQL**: `mysqldump` with `--single-transaction`, `--routines`, `--triggers`, `--events`, and related production-oriented flags; credentials via a temporary `--defaults-extra-file`.

Upload uses **`@aws-sdk/lib-storage`** so the zip is streamed (multipart for larger files) without loading the whole archive into memory.

## Troubleshooting: S3 Access Denied

The SDK returns **Access Denied** when AWS rejects the request. Common causes:

1. **IAM** — The identity needs **multipart** upload actions on the bucket, not only console access.
2. **Region** — `AWS_REGION` / `AWS_DEFAULT_REGION` must match the **bucket** region.
3. **Bucket policy** — Deny rules, IP conditions, or required encryption/KMS.
4. **SSE-KMS** — Bucket default encryption with a CMK may require **`kms:Decrypt`**, **`kms:GenerateDataKey`**, and related permissions on that key.

### Minimal IAM policy (backups **under 5 GiB** — most databases)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "BackupPutObject",
      "Effect": "Allow",
      "Action": ["s3:PutObject"],
      "Resource": "arn:aws:s3:::YOUR_BUCKET/*"
    }
  ]
}
```

### Full policy (multipart — backups **5 GiB or larger**)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "BackupWritesMultipart",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:AbortMultipartUpload",
        "s3:ListMultipartUploadParts"
      ],
      "Resource": "arn:aws:s3:::YOUR_BUCKET/*"
    },
    {
      "Sid": "BackupListMultipartOnBucket",
      "Effect": "Allow",
      "Action": ["s3:ListBucketMultipartUploads"],
      "Resource": "arn:aws:s3:::YOUR_BUCKET"
    }
  ]
}
```

If it still fails, temporarily use a broad policy (e.g. **`AmazonS3FullAccess`**) to confirm the issue is IAM, then tighten.

Error logs from this app include **bucket**, **key**, and **requestId** when S3 returns an error.

## Security notes

- Keep `.env` and any credential files out of git (see `.gitignore`).
- Prefer **IAM roles** on AWS over long-lived keys where possible.
- Restrict IAM to the bucket (or prefix) you use for backups.

## Operational notes

- Run **one instance** per backup configuration if you need strictly ordered runs.
- On failure **after** a zip is produced, the local zip may be **kept** for debugging (see logs).

## Project layout

```text
src/
  index.ts              # Entrypoint, signals, loads config
  scheduler.ts          # node-cron wiring + next-run logging
  config.ts             # Env loading / validation helpers
  backup/
    detectDb.ts
    mongoBackup.ts
    postgresBackup.ts
    mysqlBackup.ts
    runBackup.ts        # Temp dirs, zip, cleanup
  s3/
    upload.ts           # S3 client, key builder, streaming upload
  services/
    backupJob.ts        # End-to-end job with retries
  utils/
    cliPaths.ts
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
