export interface BackupArtifacts {
  /** Files to place inside the zip (absolute paths + archive entry names). */
  zipEntries: Array<{ absolutePath: string; entryName: string }>;
  /** Remove sensitive or intermediate paths after backup completes. */
  dispose?: () => Promise<void>;
}
