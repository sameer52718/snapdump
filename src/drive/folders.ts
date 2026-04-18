import type { drive_v3 } from 'googleapis';

function escapeQueryName(name: string): string {
  return name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function findChildFolder(
  drive: drive_v3.Drive,
  parentId: string,
  name: string,
): Promise<string | undefined> {
  const q = [
    `name = '${escapeQueryName(name)}'`,
    `'${parentId}' in parents`,
    "mimeType = 'application/vnd.google-apps.folder'",
    'trashed = false',
  ].join(' and ');

  const res = await drive.files.list({
    q,
    fields: 'files(id,name)',
    pageSize: 5,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  return res.data.files?.[0]?.id ?? undefined;
}

export async function ensureChildFolder(
  drive: drive_v3.Drive,
  parentId: string,
  name: string,
): Promise<string> {
  const existing = await findChildFolder(drive, parentId, name);
  if (existing) {
    return existing;
  }

  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
    supportsAllDrives: true,
  });

  const id = created.data.id;
  if (!id) {
    throw new Error(`Failed to create Drive folder: ${name}`);
  }
  return id;
}

/**
 * Ensures nested folders parent -> segment1 -> segment2 -> ... and returns the last folder id.
 */
export async function ensureFolderPath(
  drive: drive_v3.Drive,
  parentId: string,
  segments: string[],
): Promise<string> {
  let current = parentId;
  for (const seg of segments) {
    current = await ensureChildFolder(drive, current, seg);
  }
  return current;
}
