# Database Backup Service

Automated **daily database backups** for **MongoDB**, **PostgreSQL**, and **MySQL**. The service detects the engine from `DATABASE_URL`, runs the official CLI tools (`mongodump`, `pg_dump`, `mysqldump`), compresses the result into a **ZIP** (streaming, low memory), and uploads to **Amazon S3** with retries and structured logging.

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## Table of contents

- [Features](#features)
- [How it works](#how-it-works)
- [Requirements](#requirements)
- [Setup guide](#setup-guide)
  - [1. Clone and install](#1-clone-and-install)
  - [2. Install database CLI tools](#2-install-database-cli-tools)
  - [3. Create an S3 bucket](#3-create-an-s3-bucket)
  - [4. Create an IAM identity and policy](#4-create-an-iam-identity-and-policy)
  - [5. Configure environment variables](#5-configure-environment-variables)
  - [6. Build and run](#6-build-and-run)
- [Environment reference](#environment-reference)
- [`DATABASE_URL` examples](#database_url-examples)
- [S3 object layout](#s3-object-layout)
- [Backup and restore](#backup-and-restore)
- [Running in production](#running-in-production)
- [Troubleshooting](#troubleshooting)
- [Security](#security)
- [Project structure](#project-structure)
- [Contributing](#contributing)
- [License](#license)

---

## Features

- **Auto-detect database type** from `DATABASE_URL` (`mongodb`, `mongodb+srv`, `postgres`, `postgresql`, `mysql`, `mariadb`).
- **Production-oriented CLI flags** (e.g. PostgreSQL custom format, MySQL `--single-transaction` and routines/triggers).
- **ZIP via streaming** (`archiver`); temp artifacts cleaned up after success.
- **S3 upload**: single `PutObject` for archives **under 5 GiB** (minimal IAM: `s3:PutObject`); **multipart** for larger files.
- **Daily schedule** with `node-cron`, timezone-aware (`TIMEZONE`), next-run logging via `cron-parser`.
- **Retries** on backup and upload steps (configurable minimum retries).
- **TypeScript**, ESM, modular layout.

---

## How it works

1. On each scheduled run, `DATABASE_URL` is validated and the engine is selected.
2. A temporary working directory is created; the matching dump command writes files there.
3. Dump output is zipped to a temp `.zip` path.
4. The ZIP is uploaded to S3 at  
   `{BASE_BACKUP_FOLDER}/{YYYY}/{MM}/{DD}/backup-{unixTimestamp}.zip`.
5. Unless `KEEP_LOCAL_COPY=true`, the local zip is deleted after a successful upload.

The process stays alive and runs **once per day** at `BACKUP_TIME` in `TIMEZONE`.

---

## Requirements

| Component | Notes |
|-----------|--------|
| **Node.js** | **18+** (see `engines` in `package.json`). |
| **Database tools** | The matching tool must be on your **`PATH`**: `mongodump`, `pg_dump`, or `mysqldump`. |
| **AWS** | An S3 **bucket** and an identity (IAM user/role) allowed to **`s3:PutObject`** (and multipart actions if backups can exceed **5 GiB**). |
| **Network** | Outbound access to your database and to **AWS S3** (or your S3-compatible endpoint). |

---

## Setup guide

### 1. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/database-backup-script.git
cd database-backup-script
npm install
```

### 2. Install database CLI tools

Install the tools for **your** database engine and ensure they work in a terminal:

| Engine | Tool | Typical install |
|--------|------|-----------------|
| MongoDB | `mongodump` | [MongoDB Database Tools](https://www.mongodb.com/docs/database-tools/) |
| PostgreSQL | `pg_dump` | PostgreSQL client packages (`postgresql-client`, etc.) |
| MySQL / MariaDB | `mysqldump` | MySQL / MariaDB client packages |

**Windows:** add the `bin` folder of each tool to your **PATH**, then open a **new** terminal and run `mongodump --version` (or `pg_dump --version`, `mysqldump --version`).

### 3. Create an S3 bucket

1. Open **AWS Console → S3 → Create bucket**.
2. Choose a **bucket name** (globally unique) and a **Region** (e.g. `ap-south-1`, `eu-west-1`, `us-east-1`).
3. Note the **region** — you must set `AWS_REGION` (or `AWS_DEFAULT_REGION`) to **the same region** as the bucket.

Optional: enable **default encryption** (SSE-S3 or SSE-KMS). If you use **SSE-KMS**, your IAM identity may need extra **KMS** permissions (see [Troubleshooting](#troubleshooting)).

### 4. Create an IAM identity and policy

**Recommended for servers:** attach an **IAM role** to EC2 / ECS / Lambda and **do not** put long-lived keys in `.env`.

**For local or simple setups:** create an **IAM user** with **programmatic access**, then attach an **inline** or **customer managed** policy.

**Minimal policy** (typical DB backups are **under 5 GiB** — one `PutObject` per run):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "BackupPutObject",
      "Effect": "Allow",
      "Action": ["s3:PutObject"],
      "Resource": "arn:aws:s3:::YOUR_BUCKET_NAME/*"
    }
  ]
}
```

Replace `YOUR_BUCKET_NAME` with your real bucket name.

**If a single backup zip can exceed 5 GiB**, add **multipart** permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "BackupMultipartObject",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:AbortMultipartUpload",
        "s3:ListMultipartUploadParts"
      ],
      "Resource": "arn:aws:s3:::YOUR_BUCKET_NAME/*"
    },
    {
      "Sid": "BackupMultipartListBucket",
      "Effect": "Allow",
      "Action": ["s3:ListBucketMultipartUploads"],
      "Resource": "arn:aws:s3:::YOUR_BUCKET_NAME"
    }
  ]
}
```

Create **access keys** for the IAM user (if you use keys), or rely on the instance **role** / `AWS_PROFILE` on your machine.

### 5. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` with your real values. **Never commit `.env`** (it is listed in `.gitignore`).

At minimum set:

- `DATABASE_URL`
- `S3_BUCKET`
- `AWS_REGION` **or** `AWS_DEFAULT_REGION`
- And **either** `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` **or** an IAM role / `AWS_PROFILE` (see [Environment reference](#environment-reference)).

See [`.env.example`](.env.example) for all variables and comments.

### 6. Build and run

**Production:**

```bash
npm run build
npm start
```

**Development** (TypeScript watch):

```bash
npm run dev
```

**Typecheck only:**

```bash
npm run typecheck
```

On startup you should see logs for the service, validated `DATABASE_URL`, and the **cron** schedule with the **next run** time (UTC ISO in logs).

---

## Environment reference

### Required

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Connection string; scheme selects MongoDB / PostgreSQL / MySQL (see [examples](#database_url-examples)). |
| `S3_BUCKET` | Bucket name only (no `s3://` prefix). |
| `AWS_REGION` or `AWS_DEFAULT_REGION` | Must match the **bucket region**. |

### Credentials (choose one)

The app uses the **AWS SDK default credential provider chain**.

| Variable | When to use |
|----------|-------------|
| `AWS_ACCESS_KEY_ID` | With `AWS_SECRET_ACCESS_KEY` for IAM user keys. |
| `AWS_SECRET_ACCESS_KEY` | Pair with `AWS_ACCESS_KEY_ID`. |
| `AWS_SESSION_TOKEN` | Temporary credentials (e.g. assumed role). |
| `AWS_PROFILE` | Named profile in `~/.aws/credentials`. |
| *(omit keys)* | **EC2 / ECS / Lambda** with an **IAM role** attached. |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `BACKUP_TIME` | `02:00` | Daily time `HH:mm` (24h) in `TIMEZONE`. |
| `TIMEZONE` | `Asia/Karachi` | IANA timezone (used for cron and date segments in the S3 key). |
| `BASE_BACKUP_FOLDER` | `MyAppBackups` | First segment of the S3 object key. |
| `KEEP_LOCAL_COPY` | `false` | `true` = keep local zip after upload. |
| `S3_ENDPOINT` | — | Custom S3 API URL (e.g. LocalStack, MinIO). |
| `S3_FORCE_PATH_STYLE` | `false` | Often `true` for MinIO / path-style endpoints. |
| `S3_STORAGE_CLASS` | — | e.g. `STANDARD_IA` (must be valid for the bucket). |
| `BACKUP_MAX_RETRIES` | `2` | Retries after the first failure; code enforces a **minimum of 2**. |

---

## `DATABASE_URL` examples

**MongoDB (including Atlas):**

```env
DATABASE_URL=mongodb+srv://user:password@cluster.example.mongodb.net/mydb
```

**PostgreSQL:**

```env
DATABASE_URL=postgresql://user:password@db.example.com:5432/mydb
```

Use `sslmode=require` (or your provider’s SSL query params) in the URL if needed.

**MySQL / MariaDB:**

```env
DATABASE_URL=mysql://user:password@db.example.com:3306/mydb
```

The database name must be in the **path** (e.g. `/mydb`). Special characters in the password should be **URL-encoded**.

---

## S3 object layout

Example with `BASE_BACKUP_FOLDER=MyAppBackups`, `TIMEZONE=Asia/Karachi`, date **2026-04-18**:

```text
s3://YOUR_BUCKET/MyAppBackups/2026/04/18/backup-1713423434.zip
```

S3 keys use `/` as a **prefix**; there are no real folders.

---

## Backup and restore

| Engine | Backup artifact inside ZIP | Restore (high level) |
|--------|----------------------------|----------------------|
| MongoDB | `mongodb.archive` | `mongorestore --uri="..." --archive=...` |
| PostgreSQL | `postgres.dump` (custom format) | `pg_restore` with connection params |
| MySQL | `mysql.sql` | `mysql` client / `mysql < backup.sql` |

Download the object from S3, unzip locally, then use the appropriate tool. Always test restores on a **non-production** copy first.

---

## Running in production

- Run **one process** per distinct backup configuration if you need strictly ordered runs.
- Use a **process manager** or **supervisor** so the Node process restarts on failure (e.g. **systemd**, **PM2**, **Kubernetes**).
- Prefer **IAM roles** over static access keys on AWS.
- Ensure the host has a **correct system clock** (NTP) so cron and S3 paths by date behave as expected.

---

## Troubleshooting

### `AccessDenied` / `403` on S3

1. **Region** — `AWS_REGION` must match the bucket’s region.
2. **Identity** — Confirm which AWS account and principal your credentials use (install [AWS CLI](https://aws.amazon.com/cli/) and run `aws sts get-caller-identity` with the same environment as the app).
3. **IAM** — For zips **under 5 GiB**, `s3:PutObject` on `arn:aws:s3:::bucket/*` is enough. Larger zips need **multipart** actions (see [IAM policies](#4-create-an-iam-identity-and-policy)).
4. **Bucket policy / SCP / KMS** — Explicit **Deny**, organization **SCP**, or **KMS key policy** can block writes even with broad IAM.
5. **Cross-account bucket** — The bucket owner must allow your principal in the **bucket policy**.

Error logs from this service include **bucket**, **object key**, and **requestId** when S3 returns an error.

### `mongodump` / `pg_dump` / `mysqldump` not found

Install the tools and ensure they are on **`PATH`** for the same user that runs `npm start`.

### Windows path / URI issues

The code normalizes CLI paths for Windows where needed; if a tool still fails, check the tool’s stderr in logs.

---

## Security

- Do **not** commit `.env`, database passwords, or AWS keys.
- Use **least-privilege** IAM (ideally only `s3:PutObject` on your backup prefix).
- Restrict **S3 bucket policies**; avoid public **write**; be careful with public **read** on backup buckets.
- Rotate credentials if they are ever exposed.

---

## Project structure

```text
src/
  index.ts              # Entry point
  scheduler.ts          # Cron schedule
  config.ts             # Environment loading
  backup/
    detectDb.ts         # URL → engine
    mongoBackup.ts
    postgresBackup.ts
    mysqlBackup.ts
    runBackup.ts        # Dump + zip + temp cleanup
  s3/
    upload.ts           # S3 client + PutObject / multipart upload
  services/
    backupJob.ts        # Orchestration + retries
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

---

## Contributing

Issues and pull requests are welcome. Please keep changes focused and match existing TypeScript style.

---

## License

[MIT](LICENSE)
