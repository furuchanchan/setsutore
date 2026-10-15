// 日付の区切りはすべて日本時間（Asia/Tokyo, UTC+9, 夏時間なし）

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

function jstParts(now: Date): { date: string; time: string } {
  const iso = new Date(now.getTime() + JST_OFFSET_MS).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

/** 日本時間の日付 YYYY-MM-DD */
export function jstDay(now: Date): string {
  return jstParts(now).date;
}

/** 日本時間の月 YYYY-MM */
export function jstMonth(now: Date): string {
  return jstParts(now).date.slice(0, 7);
}

/** 日本時間の日時 YYYY-MM-DDTHH:MM */
export function jstDateTime(now: Date): string {
  const p = jstParts(now);
  return `${p.date}T${p.time}`;
}

function parseDay(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}

export function addDays(day: string, n: number): string {
  const d = parseDay(day);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** その日を含む週の月曜日 */
export function weekStart(day: string): string {
  const dow = parseDay(day).getUTCDay(); // 0=日
  return addDays(day, -((dow + 6) % 7));
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export const MONTH_RE = /^\d{4}-\d{2}$/;

/** 実在する YYYY-MM-DD か */
export function isValidDay(day: string): boolean {
  if (!DAY_RE.test(day)) return false;
  const d = parseDay(day);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === day;
}
