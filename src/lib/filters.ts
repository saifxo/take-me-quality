import { addDays, currentWeekStart, isValidIsoDate, lastFullWeekStart, weekLabel, weekStartOf } from "./dates";

export const PERIODS = [
  { value: "last", label: "Last week" },
  { value: "this", label: "This week" },
  { value: "4w", label: "Last 4 weeks" },
  { value: "12w", label: "Last 12 weeks" },
  { value: "custom", label: "Custom weeks" },
] as const;
export type PeriodKey = (typeof PERIODS)[number]["value"];

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const uuidish = (v: string | undefined) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined);

export type ResolvedFilter = {
  period: PeriodKey;
  from: string;
  to: string;
  siteId?: string;
  reviewerId?: string;
  callType?: string;
  label: string;
  weeks: number;
};

/** Turn dashboard search params into a validated reporting period (UK weeks, Monday-based). */
export function resolveFilter(sp: SP, defaultPeriod: PeriodKey = "last"): ResolvedFilter {
  const raw = one(sp.period) as PeriodKey | undefined;
  const period: PeriodKey = PERIODS.some((p) => p.value === raw) ? raw! : defaultPeriod;
  const thisWeek = currentWeekStart();
  const last = lastFullWeekStart();
  let from = last;
  let to = last;
  if (period === "this") from = to = thisWeek;
  if (period === "4w") [from, to] = [addDays(last, -21), last];
  if (period === "12w") [from, to] = [addDays(last, -77), last];
  if (period === "custom") {
    const f = one(sp.from);
    const t = one(sp.to);
    if (isValidIsoDate(f) && isValidIsoDate(t)) {
      from = weekStartOf(new Date(`${f}T12:00:00Z`));
      to = weekStartOf(new Date(`${t}T12:00:00Z`));
      if (from > to) [from, to] = [to, from];
      if (to > thisWeek) to = thisWeek;
    }
  }
  const weeks = Math.round((Date.parse(to) - Date.parse(from)) / (7 * 86_400_000)) + 1;
  const type = one(sp.type);
  return {
    period,
    from,
    to,
    siteId: uuidish(one(sp.site)),
    reviewerId: uuidish(one(sp.reviewer)),
    callType: type && /^[a-z]+$/.test(type) ? type : undefined,
    label: from === to ? weekLabel(from) : `${weekLabel(from, false)} – ${weekLabel(to)}`,
    weeks,
  };
}

/** Trend window: at least 12 weeks ending at the selected period. */
export function trendWindow(f: ResolvedFilter) {
  return { from: f.weeks >= 12 ? f.from : addDays(f.to, -77), to: f.to };
}
