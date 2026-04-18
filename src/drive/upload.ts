import fs from 'node:fs';
import type { drive_v3 } from 'googleapis';

export async function uploadZipFile(
  drive: drive_v3.Drive,
  parentFolderId: string,
  localZipPath: string,
  driveFileName: string,
): Promise<string> {
  const res = await drive.files.create({
    requestBody: {
      name: driveFileName,
      parents: [parentFolderId],
    },
    media: {
      mimeType: 'application/zip',
      body: fs.createReadStream(localZipPath),
    },
    fields: 'id,name,size',
    supportsAllDrives: true,
  });

  const id = res.data.id;
  if (!id) {
    throw new Error('Drive upload failed: missing file id');
  }
  return id;
}
