// SIMAK-MOSA WIB Date & Time Utilities (UTC+7 / Asia/Jakarta)

export const TIMEZONE_WIB = 'Asia/Jakarta';

/**
 * Returns current Date object shifted to WIB
 */
export function getWibNow(date = new Date()): Date {
  return new Date(date.toLocaleString('en-US', { timeZone: TIMEZONE_WIB }));
}

/**
 * Format: "DD-MM-YYYY" (e.g. "24-09-2026")
 */
export function getWibDisplayDate(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE_WIB,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).formatToParts(date);
  const day = parts.find(p => p.type === 'day')?.value || '01';
  const month = parts.find(p => p.type === 'month')?.value || '01';
  const year = parts.find(p => p.type === 'year')?.value || '2026';
  return `${day}-${month}-${year}`;
}

/**
 * Format: "YYYY-MM-DD" (e.g. "2026-09-24")
 */
export function getWibIsoDate(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE_WIB,
  }).format(date);
}

/**
 * Format: "HH:mm:ss" WIB
 */
export function getWibTimeString(date = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE_WIB,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(date);
}

/**
 * Returns Indonesian day name: "Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"
 */
export function getWibDayName(date = new Date()): string {
  const HARI_INDONESIA = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const wib = getWibNow(date);
  return HARI_INDONESIA[wib.getDay()];
}

/**
 * Normalizes any date string (DD-MM-YYYY or YYYY-MM-DD) into ISO YYYY-MM-DD for PostgreSQL safety
 */
export function toSafePgDate(dateStr?: string | null): string {
  if (!dateStr || dateStr === 'today') return getWibIsoDate();
  const trimmed = String(dateStr).trim();
  const parts = trimmed.split('-');
  if (parts.length === 3) {
    if (parts[0].length === 4) return trimmed; // YYYY-MM-DD
    if (parts[2].length === 4) return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`; // DD-MM-YYYY -> YYYY-MM-DD
  }
  return trimmed;
}
