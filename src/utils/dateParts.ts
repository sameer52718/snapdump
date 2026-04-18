export function ymdInTimeZone(
  timeZone: string,
  d: Date = new Date(),
): { year: string; month: string; day: string } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = fmt.formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value;

  const year = get('year');
  const month = get('month');
  const day = get('day');

  if (!year || !month || !day) {
    throw new Error(`Could not format date in timezone "${timeZone}"`);
  }

  return { year, month, day };
}
