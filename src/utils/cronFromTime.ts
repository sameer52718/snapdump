/**
 * Convert HH:mm (24h) to a node-cron expression: minute hour * * *
 */
export function backupTimeToCron(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) {
    throw new Error(`BACKUP_TIME must be HH:mm (24h), got: ${hhmm}`);
  }
  const hour = Number.parseInt(m[1], 10);
  const minute = Number.parseInt(m[2], 10);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error(`BACKUP_TIME out of range: ${hhmm}`);
  }
  return `${minute} ${hour} * * *`;
}
