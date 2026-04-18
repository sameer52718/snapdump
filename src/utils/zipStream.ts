import fs from 'node:fs';
import path from 'node:path';
import archiver from 'archiver';

/**
 * Stream files into a zip without loading the archive into memory.
 */
export async function zipFilesToPath(
  zipPath: string,
  entries: Array<{ absolutePath: string; entryName: string }>,
): Promise<void> {
  await fs.promises.mkdir(path.dirname(zipPath), { recursive: true });

  const output = fs.createWriteStream(zipPath);
  const archive = archiver('zip', { zlib: { level: 6 } });

  const archiveDone = new Promise<void>((resolve, reject) => {
    archive.on('error', reject);
    output.on('error', reject);
    output.on('close', () => resolve());
  });

  archive.pipe(output);

  for (const e of entries) {
    archive.file(e.absolutePath, { name: e.entryName });
  }

  await archive.finalize();
  await archiveDone;
}

export async function fileSizeBytes(filePath: string): Promise<number> {
  const st = await fs.promises.stat(filePath);
  return st.size;
}
