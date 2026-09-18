/**
 * Reporting queries for the admin dashboard, agent profiles and reviewer home.
 * Every metric follows the definitions in the platform plan (Metrics dictionary):
 * weeks are UK Monday–Sunday by call date; averages are call-weighted.
 */
import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { agents, criteria, evaluationAnswers, evaluationIssues, evaluations, hihiIssues, sites, users } from "@/db/schema";
import { addDays } from "@/lib/dates";
import { getActiveScorecard } from "./scorecard";

export type DashFilter = {
  from: string; // Monday, inclusive
  to: string; // Monday, inclusive
  siteId?: string;
  reviewerId?: string;
  callType?: string;
  agentId?: string;
};

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const round = (v: number | null, dp = 2) => (v === null || Number.isNaN(v) ? null : Math.round(v * 10 ** dp) / 10 ** dp);

function where(f: DashFilter): SQL {
  const parts: SQL[] = [
    sql`${evaluations.status} = 'submitted'`,
    sql`${evaluations.deletedAt} is null`,
    sql`${evaluations.callWeek} between ${f.from} and ${f.to}`,
  ];
  if (f.siteId) parts.push(sql`${evaluations.siteId} = ${f.siteId}`);
  if (f.reviewerId) parts.push(sql`${evaluations.reviewerId} = ${f.reviewerId}`);
  if (f.callType) parts.push(sql`${evaluations.callType} = ${f.callType}`);
  if (f.agentId) parts.push(sql`${evaluations.agentId} = ${f.agentId}`);
  return sql.join(parts, sql` and `);
}

const hasIssue = sql`exists (select 1 from ${evaluationIssues} where ${evaluationIssues.evaluationId} = ${evaluations.id})`;

export function previousPeriod(f: DashFilter): DashFilter {
  const weeks = Math.round((Date.parse(f.to) - Date.parse(f.from)) / (7 * 86_400_000)) + 1;
  return { ...f, from: addDays(f.from, -7 * weeks), to: addDays(f.to, -7 * weeks) };
}

// ---------------------------------------------------------------- KPIs
export type Kpis = {
  evaluations: number;
  avgScore: number | null;
  meetsShare: number | null;
  belowShare: number | null;
  perfectShare: number | null;
  autoFails: number;
  avgDuration: number | null;
  agentsReviewed: number;
};

export async function kpis(f: DashFilter): Promise<Kpis> {
  const [r] = await db.execute<Record<string, unknown>>(sql`
    select count(*)::int as n,
      avg(${evaluations.score}) as avg,
      avg(case when ${evaluations.band} in ('meets','perfect') then 1.0 else 0 end) as meets,
      avg(case when ${evaluations.band} in ('below','fail') then 1.0 else 0 end) as below,
      avg(case when ${evaluations.band} = 'perfect' then 1.0 else 0 end) as perfect,
      sum(case when ${hasIssue} then 1 else 0 end)::int as fails,
      avg(${evaluations.durationSec}) as aht,
      count(distinct ${evaluations.agentId})::int as agents
    from ${evaluations} where ${where(f)}`);
  return {
    evaluations: Number(r.n),
    avgScore: round(num(r.avg)),
    meetsShare: round(num(r.meets) === null ? null : num(r.meets)! * 100, 1),
    belowShare: round(num(r.below) === null ? null : num(r.below)! * 100, 1),
    perfectShare: round(num(r.perfect) === null ? null : num(r.perfect)! * 100, 1),
    autoFails: Number(r.fails ?? 0),
    avgDuration: round(num(r.aht), 0),
    agentsReviewed: Number(r.agents),
  };
}

// ---------------------------------------------------------------- trends
export type TrendPoint = { week: string; overall: number | null; count: number; [site: string]: number | string | null };

export async function weeklyTrend(f: DashFilter): Promise<{ points: TrendPoint[]; series: string[] }> {
  const rows = await db.execute<{ week: string; site: string; avg: string | null; n: number }>(sql`
    select ${evaluations.callWeek}::text as week, ${sites.name} as site, avg(${evaluations.score}) as avg, count(*)::int as n
    from ${evaluations} join ${sites} on ${sites.id} = ${evaluations.siteId}
    where ${where(f)}
    group by 1, 2 order by 1`);
  const series = [...new Set(rows.map((r) => r.site))].sort();
  const weeks: string[] = [];
  for (let w = f.from; w <= f.to; w = addDays(w, 7)) weeks.push(w);
  const points = weeks.map((week) => {
    const inWeek = rows.filter((r) => r.week === week);
    const total = inWeek.reduce((s, r) => s + r.n, 0);
    const weighted = inWeek.reduce((s, r) => s + Number(r.avg ?? 0) * r.n, 0);
    const p: TrendPoint = { week, overall: total ? round(weighted / total) : null, count: total };
    for (const s of series) {
      const hit = inWeek.find((r) => r.site === s);
      p[s] = hit ? round(num(hit.avg)) : null;
    }
    return p;
  });
  return { points, series };
}

// ---------------------------------------------------------------- sections
export async function sectionAverages(f: DashFilter): Promise<Record<string, number | null>> {
  const rows = await db.execute<{ key: string; avg: string | null }>(sql`
    select s.key as key, avg((s.value #>> '{}')::float) as avg
    from ${evaluations}, jsonb_each(${evaluations.sectionScores}) s
    where ${where(f)} and jsonb_typeof(s.value) = 'number'
    group by s.key`);
  return Object.fromEntries(rows.map((r) => [r.key, round(num(r.avg))]));
}

// ---------------------------------------------------------------- criteria heatmap
export type HeatCell = { key: string; groupId: string; value: number | null; scored: number; misses: number };

export async function criteriaHeatmap(f: DashFilter, groupBy: "site" | "agent" = "site") {
  const groupCol = groupBy === "site" ? sql`${sites.id}` : sql`${agents.id}`;
  const groupName = groupBy === "site" ? sql`${sites.name}` : sql`${agents.fullName}`;
  const rows = await db.execute<{ key: string; gid: string; gname: string; pts: string; scored: number; misses: number }>(sql`
    select ${criteria.key} as key, ${groupCol} as gid, ${groupName} as gname,
      sum(case ${evaluationAnswers.answer} when 'yes' then 1 when 'partial' then 0.5 else 0 end) as pts,
      count(*) filter (where ${evaluationAnswers.answer} <> 'na')::int as scored,
      count(*) filter (where ${evaluationAnswers.answer} in ('no','partial'))::int as misses
    from ${evaluationAnswers}
      join ${evaluations} on ${evaluations.id} = ${evaluationAnswers.evaluationId}
      join ${criteria} on ${criteria.id} = ${evaluationAnswers.criterionId}
      join ${sites} on ${sites.id} = ${evaluations.siteId}
      join ${agents} on ${agents.id} = ${evaluations.agentId}
    where ${where(f)}
    group by 1, 2, 3`);
  const sc = await getActiveScorecard();
  const rowsMeta = sc.criteria.map((c) => ({ key: c.key, title: c.title, section: c.sectionKey, critical: c.penaltyNo > 0 }));
  const groups = [...new Map(rows.map((r) => [r.gid, { id: r.gid, name: r.gname }])).values()].sort((a, b) => a.name.localeCompare(b.name));
  const cells: HeatCell[] = rows.map((r) => ({
    key: r.key,
    groupId: r.gid,
    value: r.scored ? round((Number(r.pts) / r.scored) * 100, 1) : null,
    scored: r.scored,
    misses: r.misses,
  }));
  return { criteria: rowsMeta, groups, cells };
}

// ---------------------------------------------------------------- zero tolerance
export async function issueLog(f: DashFilter, limit = 12) {
  const rows = await db.execute<{ id: string; call_at: Date | null; agent: string; agent_id: string; site: string; issues: string; reviewer: string }>(sql`
    select ${evaluations.id} as id, ${evaluations.callAt} as call_at, ${agents.fullName} as agent, ${agents.id} as agent_id,
      ${sites.name} as site, ${users.name} as reviewer,
      string_agg(${hihiIssues.shortName}, ', ' order by ${hihiIssues.position}) as issues
    from ${evaluations}
      join ${evaluationIssues} on ${evaluationIssues.evaluationId} = ${evaluations.id}
      join ${hihiIssues} on ${hihiIssues.id} = ${evaluationIssues.issueId}
      join ${agents} on ${agents.id} = ${evaluations.agentId}
      join ${sites} on ${sites.id} = ${evaluations.siteId}
      join ${users} on ${users.id} = ${evaluations.reviewerId}
    where ${where(f)}
    group by 1, 2, 3, 4, 5, 6
    order by ${evaluations.callAt} desc nulls last
    limit ${limit}`);
  const counts = await db.execute<{ name: string; n: number }>(sql`
    select ${hihiIssues.shortName} as name, count(*)::int as n
    from ${evaluationIssues}
      join ${hihiIssues} on ${hihiIssues.id} = ${evaluationIssues.issueId}
      join ${evaluations} on ${evaluations.id} = ${evaluationIssues.evaluationId}
    where ${where(f)}
    group by 1 order by 2 desc`);
  return {
    rows: rows.map((r) => ({ ...r, callAt: r.call_at ? new Date(r.call_at) : null })),
    counts: counts.map((c) => ({ name: c.name, count: c.n })),
  };
}

// ---------------------------------------------------------------- per-agent table (the Overview sheet, done right)
export type AgentRow = {
  agentId: string;
  name: string;
  siteId: string;
  site: string;
  siteCode: string;
  teamCode: string | null;
  status: string;
  calls: number;
  avgScore: number | null;
  belowShare: number | null;
  autoFails: number;
  avgDuration: number | null;
  sections: Record<string, number | null>;
  prevAvg: number | null;
  failReasons: string[];
  needsAttention: boolean;
  reasons: string[];
};

export async function agentTable(f: DashFilter): Promise<AgentRow[]> {
  const sc = await getActiveScorecard();
  const prev = previousPeriod(f);
  const baseWhere = f.siteId ? sql`${agents.siteId} = ${f.siteId}` : sql`true`;
  const rows = await db.execute<Record<string, unknown>>(sql`
    select ${agents.id} as agent_id, ${agents.fullName} as name, ${agents.teamCode} as team, ${agents.status} as status,
      ${sites.id} as site_id, ${sites.name} as site, ${sites.code} as site_code,
      cur.n, cur.avg, cur.below, cur.fails, cur.aht, cur.sections, prv.avg as prev_avg, fr.reasons
    from ${agents}
      join ${sites} on ${sites.id} = ${agents.siteId}
      left join lateral (
        select count(*)::int as n, avg(${evaluations.score}) as avg,
          avg(case when ${evaluations.band} in ('below','fail') then 1.0 else 0 end) as below,
          sum(case when ${hasIssue} then 1 else 0 end)::int as fails,
          avg(${evaluations.durationSec}) as aht,
          (select jsonb_object_agg(k, v) from (
             select s.key as k, avg((s.value #>> '{}')::float) as v
             from ${evaluations} e2, jsonb_each(e2.section_scores) s
             where e2.agent_id = ${agents.id} and e2.status = 'submitted' and e2.deleted_at is null
               and e2.call_week between ${f.from} and ${f.to} and jsonb_typeof(s.value) = 'number'
             group by s.key) x) as sections
        from ${evaluations}
        where ${evaluations.agentId} = ${agents.id} and ${where({ ...f, siteId: undefined, agentId: undefined })}
      ) cur on true
      left join lateral (
        select avg(${evaluations.score}) as avg from ${evaluations}
        where ${evaluations.agentId} = ${agents.id} and ${where({ ...prev, siteId: undefined, agentId: undefined })}
      ) prv on true
      left join lateral (
        select array_agg(distinct ${hihiIssues.shortName}) as reasons
        from ${evaluationIssues}
          join ${hihiIssues} on ${hihiIssues.id} = ${evaluationIssues.issueId}
          join ${evaluations} on ${evaluations.id} = ${evaluationIssues.evaluationId}
        where ${evaluations.agentId} = ${agents.id} and ${where({ ...f, siteId: undefined, agentId: undefined })}
      ) fr on true
    where ${agents.status} <> 'inactive' and ${baseWhere}
    order by ${sites.name}, ${agents.fullName}`);

  return rows.map((r) => {
    const calls = Number(r.n ?? 0);
    const avgScore = round(num(r.avg));
    const belowShare = r.below === null || r.below === undefined ? null : round(Number(r.below) * 100, 1);
    const autoFails = Number(r.fails ?? 0);
    const prevAvg = round(num(r.prev_avg));
    const reasons: string[] = [];
    if (calls > 0 && belowShare !== null && belowShare > sc.settings.attentionShare) reasons.push(`${belowShare}% of calls below KPI`);
    if (autoFails > 0) reasons.push(`${autoFails} zero-tolerance ${autoFails === 1 ? "breach" : "breaches"}`);
    if (avgScore !== null && prevAvg !== null && avgScore < prevAvg - 5) reasons.push(`down ${round(prevAvg - avgScore, 1)} pts on last period`);
    const sectionsRaw = (r.sections ?? {}) as Record<string, number>;
    return {
      agentId: String(r.agent_id),
      name: String(r.name),
      siteId: String(r.site_id),
      site: String(r.site),
      siteCode: String(r.site_code),
      teamCode: (r.team as string) ?? null,
      status: String(r.status),
      calls,
      avgScore,
      belowShare,
      autoFails,
      avgDuration: round(num(r.aht), 0),
      sections: Object.fromEntries(Object.entries(sectionsRaw).map(([k, v]) => [k, round(v)])),
      prevAvg,
      failReasons: ((r.reasons as string[] | null) ?? []).filter(Boolean),
      needsAttention: reasons.length > 0,
      reasons,
    };
  });
}

// ---------------------------------------------------------------- distribution & calibration
export const DISTRIBUTION_LABELS = ["0%", "1–69%", "70–79%", "80–90%", "90–95%", "95–99%", "100%"] as const;

/** Bucket boundaries follow the bands: 90% sits in the Below-KPI bucket, anything above it meets KPI. */
export function distributionBucket(score: number): number {
  if (score <= 0) return 0;
  if (score >= 100) return 6;
  if (score < 70) return 1;
  if (score < 80) return 2;
  if (score <= 90) return 3;
  if (score < 95) return 4;
  return 5;
}

export async function distribution(f: DashFilter) {
  const rows = await db.execute<{ score: number }>(sql`select ${evaluations.score} as score from ${evaluations} where ${where(f)} and ${evaluations.score} is not null`);
  const counts = DISTRIBUTION_LABELS.map(() => 0);
  for (const r of rows) counts[distributionBucket(Number(r.score))]++;
  return DISTRIBUTION_LABELS.map((label, i) => ({ label, count: counts[i], band: i === 0 ? "fail" : i <= 3 ? "below" : i === 6 ? "perfect" : "meets" }));
}

export async function reviewerCalibration(f: DashFilter) {
  const rows = await db.execute<{ id: string; name: string; n: number; avg: string | null; perfect: string | null }>(sql`
    select ${users.id} as id, ${users.name} as name, count(*)::int as n, avg(${evaluations.score}) as avg,
      avg(case when ${evaluations.band} = 'perfect' then 1.0 else 0 end) as perfect
    from ${evaluations} join ${users} on ${users.id} = ${evaluations.reviewerId}
    where ${where({ ...f, reviewerId: undefined })}
    group by 1, 2 order by 3 desc`);
  const total = rows.reduce((s, r) => s + r.n, 0);
  const overall = total ? rows.reduce((s, r) => s + Number(r.avg ?? 0) * r.n, 0) / total : null;
  return {
    overall: round(overall),
    reviewers: rows.map((r) => ({
      id: r.id,
      name: r.name,
      reviews: r.n,
      avg: round(num(r.avg)),
      perfectShare: round(Number(r.perfect ?? 0) * 100, 1),
      variance: overall === null || r.avg === null ? null : round(Number(r.avg) - overall),
    })),
  };
}

// ---------------------------------------------------------------- coverage (reviews per agent this week)
export async function weeklyCoverage(week: string, siteId?: string) {
  const sc = await getActiveScorecard();
  const rows = await db.execute<{ id: string; name: string; site: string; site_code: string; n: number }>(sql`
    select ${agents.id} as id, ${agents.fullName} as name, ${sites.name} as site, ${sites.code} as site_code,
      (select count(*)::int from ${evaluations} where ${evaluations.agentId} = ${agents.id} and ${evaluations.status} = 'submitted'
        and ${evaluations.deletedAt} is null and ${evaluations.callWeek} = ${week}) as n
    from ${agents} join ${sites} on ${sites.id} = ${agents.siteId}
    where ${agents.status} = 'active' ${siteId ? sql`and ${agents.siteId} = ${siteId}` : sql``}
    order by n asc, ${agents.fullName}`);
  const target = sc.settings.weeklyTarget;
  const met = rows.filter((r) => r.n >= target).length;
  return {
    target,
    agents: rows.map((r) => ({ id: r.id, name: r.name, site: r.site, siteCode: r.site_code, reviews: r.n })),
    met,
    total: rows.length,
    share: rows.length ? round((met / rows.length) * 100, 0) : null,
  };
}

// ---------------------------------------------------------------- agent profile
export async function agentProfile(agentId: string, f: DashFilter) {
  const agentF = { ...f, agentId, siteId: undefined, reviewerId: undefined };
  const [summary, trend, sections, teamSections, crit, issues, recent] = await Promise.all([
    kpis(agentF),
    db.execute<{ week: string; avg: string | null; n: number; aht: string | null }>(sql`
      select ${evaluations.callWeek}::text as week, avg(${evaluations.score}) as avg, count(*)::int as n, avg(${evaluations.durationSec}) as aht
      from ${evaluations} where ${where(agentF)} group by 1 order by 1`),
    sectionAverages(agentF),
    (async () => {
      const [a] = await db.select({ siteId: agents.siteId }).from(agents).where(sql`${agents.id} = ${agentId}`);
      return a ? sectionAverages({ ...f, siteId: a.siteId, agentId: undefined, reviewerId: undefined }) : ({} as Record<string, number | null>);
    })(),
    db.execute<{ key: string; title: string; pts: string; scored: number; misses: number; notes: string | null }>(sql`
      select ${criteria.key} as key, max(${criteria.title}) as title,
        sum(case ${evaluationAnswers.answer} when 'yes' then 1 when 'partial' then 0.5 else 0 end) as pts,
        count(*) filter (where ${evaluationAnswers.answer} <> 'na')::int as scored,
        count(*) filter (where ${evaluationAnswers.answer} in ('no','partial'))::int as misses,
        string_agg(nullif(${evaluationAnswers.note}, ''), ' | ') as notes
      from ${evaluationAnswers}
        join ${evaluations} on ${evaluations.id} = ${evaluationAnswers.evaluationId}
        join ${criteria} on ${criteria.id} = ${evaluationAnswers.criterionId}
      where ${where(agentF)}
      group by 1`),
    issueLog(agentF, 20),
    db.execute<{ id: string; call_at: Date | null; score: number | null; band: string | null; call_type: string; reviewer: string; duration: number | null; feedback: string | null }>(sql`
      select ${evaluations.id} as id, ${evaluations.callAt} as call_at, ${evaluations.score} as score, ${evaluations.band} as band,
        ${evaluations.callType} as call_type, ${users.name} as reviewer, ${evaluations.durationSec} as duration, ${evaluations.feedback} as feedback
      from ${evaluations} join ${users} on ${users.id} = ${evaluations.reviewerId}
      where ${where(agentF)} order by ${evaluations.callAt} desc nulls last limit 40`),
  ]);

  const weeks: string[] = [];
  for (let w = f.from; w <= f.to; w = addDays(w, 7)) weeks.push(w);
  const trendPoints = weeks.map((w) => {
    const hit = trend.find((t) => t.week === w);
    return { week: w, avg: hit ? round(num(hit.avg)) : null, count: hit?.n ?? 0, aht: hit ? round(num(hit.aht), 0) : null };
  });
  const criteriaScores = crit
    .filter((c) => c.scored > 0)
    .map((c) => ({ key: c.key, title: c.title, value: round((Number(c.pts) / c.scored) * 100, 1)!, scored: c.scored, misses: c.misses, notes: c.notes }))
    .sort((a, b) => a.value - b.value || b.misses - a.misses);

  return {
    summary,
    trend: trendPoints,
    sections,
    teamSections,
    criteria: criteriaScores,
    issues: issues.rows,
    recent: recent.map((r) => ({ ...r, callAt: r.call_at ? new Date(r.call_at) : null })),
  };
}

// ---------------------------------------------------------------- reviewer home
export async function reviewerWeek(reviewerId: string, week: string) {
  const rows = await db.execute<{ day: string; n: number }>(sql`
    select to_char(${evaluations.submittedAt} at time zone 'Europe/London', 'YYYY-MM-DD') as day, count(*)::int as n
    from ${evaluations}
    where ${evaluations.reviewerId} = ${reviewerId} and ${evaluations.status} = 'submitted' and ${evaluations.deletedAt} is null
      and ${evaluations.submittedAt} >= (${week}::date::timestamp at time zone 'Europe/London')
      and ${evaluations.submittedAt} < ((${week}::date + 7)::timestamp at time zone 'Europe/London')
    group by 1 order by 1`);
  const [avg] = await db.execute<{ avg: string | null; n: number }>(sql`
    select avg(${evaluations.score}) as avg, count(*)::int as n from ${evaluations}
    where ${evaluations.reviewerId} = ${reviewerId} and ${evaluations.status} = 'submitted' and ${evaluations.deletedAt} is null
      and ${evaluations.submittedAt} > now() - interval '28 days'`);
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i)).map((d) => ({ day: d, count: rows.find((r) => r.day === d)?.n ?? 0 }));
  return { days, total: days.reduce((s, d) => s + d.count, 0), avgGiven28d: round(num(avg.avg)), reviews28d: Number(avg.n) };
}
