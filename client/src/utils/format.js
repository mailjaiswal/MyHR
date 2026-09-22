// Shared display formatters.

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Convert an API "YYYY-MM" month key into a human-friendly "Aug 2026" label.
 * Falls back to the raw string if it can't be parsed.
 */
export function formatMonthYear(monthYear) {
  if (!monthYear) return '—';
  const [year, month] = String(monthYear).split('-');
  const mi = parseInt(month, 10);
  if (!year || !mi || mi < 1 || mi > 12) return String(monthYear);
  return `${MONTHS_SHORT[mi - 1]} ${year}`;
}
