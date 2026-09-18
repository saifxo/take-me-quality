/**
 * Date helpers pinned to UK time (Europe/London). Timestamps are stored in UTC;
 * reporting weeks run Monday 00:00 to Sunday 23:59 UK time, decided by call date.
 */
export const TZ = "Europe/London";

type Parts = { y: number; m: number; d: number; h: number; mi: number; s: number; weekday: number };

const partsFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  weekday: "short",
});

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/** Wall-clock parts of an instant in UK time. weekday: 1 = Monday … 7 = Sunday. */
export function londonParts(date: Date): Parts {
  const map: Record<string, string> = {};
  for (const p of partsFormatter.formatToParts(date)) map[p.type] = p.value;
  return {
    y: Number(map.year),
    m: Number(map.month),
    d: Number(map.day),
    h: Number(map.hour) % 24,
    mi: Number(map.minute),
    s: Number(map.second),
    weekday: WEEKDAYS[map.weekday] ?? 1,
  };
}

function offsetMs(date: Date): number {
  const p = londonParts(date);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(date.getTime() / 1000) * 1000;
}

/** Convert a UK wall-clock time (as shown in the recordings portal) to a UTC instant. */
export function londonWallTimeToUtc(y: number, m: number, d: number, h = 0, mi = 0, s = 0): Date {
  const guess = Date.UTC(y, m - 1, d, h, mi, s);
  let result = guess - offsetMs(new Date(guess));
  // Re-check at the candidate instant so times either side of a BST change resolve correctly.
  result = guess - offsetMs(new Date(result));
  return new Date(result);
}

const pad = (n: number) => String(n).padStart(2, "0");

export function isoDate(y: number, m: number, d: number) {
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Monday (YYYY-MM-DD) of the UK week containing this instant. */
export function weekStartOf(date: Date): string {
  const p = londonParts(date);
  const base = new Date(Date.UTC(p.y, p.m - 1, p.d));
  base.setUTCDate(base.getUTCDate() - (p.weekday - 1));
  return base.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** Monday of the current UK week. */
export function currentWeekStart(now = new Date()): string {
  return weekStartOf(now);
}

/** Monday of the last complete week — the default reporting period. */
export function lastFullWeekStart(now = new Date()): string {
  return addDays(currentWeekStart(now), -7);
}

export function isValidIsoDate(v: string | undefined | null): v is string {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

const shortDay = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short" });
const longDay = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });

/** "w/c 31 Aug 2026" for a Monday ISO date. */
export function weekLabel(iso: string, withYear = true): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `w/c ${(withYear ? longDay : shortDay).format(dt)}`;
}

export function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return shortDay.format(new Date(Date.UTC(y, m - 1, d)));
}

const dateTimeFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const dateTimeYearFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function formatCallTime(date: Date | null | undefined, withYear = false): string {
  if (!date) return "—";
  return (withYear ? dateTimeYearFmt : dateTimeFmt).format(date);
}

/** Value for <input type="datetime-local"> in UK time. */
export function toLocalInputValue(date: Date): string {
  const p = londonParts(date);
  return `${isoDate(p.y, p.m, p.d)}T${pad(p.h)}:${pad(p.mi)}`;
}

/** Parse a <input type="datetime-local"> value entered in UK time. */
export function fromLocalInputValue(v: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(v);
  if (!m) return null;
  return londonWallTimeToUtc(+m[1], +m[2], +m[3], +m[4], +m[5], m[6] ? +m[6] : 0);
}

export function formatDuration(sec: number | null | undefined): string {
  if (sec === null || sec === undefined) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${pad(s)}`;
}

/** Accepts "85", "1:25", "01:25", "00:01:25". Returns seconds or null. */
export function parseDuration(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  if (/^\d+$/.test(t)) return Number(t);
  const parts = t.split(":").map((x) => x.trim());
  if (parts.some((x) => !/^\d{1,2}$/.test(x)) || parts.length < 2 || parts.length > 3) return null;
  const nums = parts.map(Number);
  const [h, m, s] = nums.length === 3 ? nums : [0, nums[0], nums[1]];
  if (m > 59 && nums.length === 3) return null;
  if (s > 59) return null;
  return h * 3600 + m * 60 + s;
}

export function relativeTime(date: Date, now = new Date()): string {
  const diff = (now.getTime() - date.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} d ago`;
  return formatCallTime(date, true);
}
