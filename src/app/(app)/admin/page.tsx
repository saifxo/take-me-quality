import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, TriangleAlert } from "lucide-react";
import { requireAdmin } from "@/server/auth/dal";
import {
  agentTable,
  criteriaHeatmap,
  distribution,
  issueLog,
  kpis,
  previousPeriod,
  reviewerCalibration,
  sectionAverages,
  weeklyCoverage,
  weeklyTrend,
} from "@/server/services/analytics";
import { getActiveScorecard } from "@/server/services/scorecard";
import { listSites } from "@/server/services/roster";
import { listReviewers } from "@/server/services/users";
import { aiStatus, latestBriefing } from "@/server/services/ai";
import { resolveFilter, trendWindow } from "@/lib/filters";
import { currentWeekStart, formatCallTime, formatDuration } from "@/lib/dates";
import { cn, pct, signed } from "@/lib/utils";
import { Card, CardHeader, PageHeader, StatTile } from "@/components/ui/surface";
import { FiltersBar } from "@/components/admin/filters-bar";
import { DistributionChart, TrendChart } from "@/components/charts/charts";
import { CriteriaHeatmap } from "@/components/admin/heatmap";
import { AgentTable } from "@/components/admin/agent-table";
import { BriefingCard } from "@/components/admin/ai-cards";

export const metadata: Metadata = { title: "Dashboard" };

export default async function AdminDashboard(props: PageProps<"/admin">) {
  await requireAdmin();
  const sp = await props.searchParams;
  const f = resolveFilter(sp);
  const filter = { from: f.from, to: f.to, siteId: f.siteId, reviewerId: f.reviewerId, callType: f.callType };
  const prev = previousPeriod(filter);
  const tw = trendWindow(f);

  const [sc, sites, reviewers, cur, before, trend, sections, sectionsPrev, dist, calib, issues, table, heat, coverage, briefing] = await Promise.all([
    getActiveScorecard(),
    listSites(),
    listReviewers(),
    kpis(filter),
    kpis(prev),
    weeklyTrend({ ...filter, from: tw.from, to: tw.to }),
    sectionAverages(filter),
    sectionAverages(prev),
    distribution(filter),
    reviewerCalibration(filter),
    issueLog(filter, 8),
    agentTable(filter),
    criteriaHeatmap(filter, "site"),
    weeklyCoverage(currentWeekStart(), f.siteId),
    latestBriefing(f.from, f.to),
  ]);
  const kpi = sc.settings.kpiPass;
  const attention = table.filter((t) => t.needsAttention).sort((a, b) => b.autoFails - a.autoFails || (b.belowShare ?? 0) - (a.belowShare ?? 0));
  const d = (a: number | null, b: number | null) => (a !== null && b !== null ? a - b : null);
  const qs = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])) as [string, string][]).toString();
  const query = qs ? `?${qs}` : "";
  const explorerBase = `/admin/evaluations?${new URLSearchParams({ period: "custom", from: f.from, to: f.to })}`;

  return (
    <>
      <PageHeader
        eyebrow={f.label}
        title="Quality dashboard"
        description={`${cur.evaluations.toLocaleString("en-GB")} calls reviewed across ${cur.agentsReviewed} agents. Compared with the ${f.weeks === 1 ? "week" : `${f.weeks} weeks`} before.`}
        actions={
          <Link href={explorerBase} className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-brand-700 hover:underline">
            All evaluations <ArrowRight className="size-4" />
          </Link>
        }
      />
      <FiltersBar sites={sites.map((s) => ({ id: s.id, name: s.name }))} reviewers={reviewers.map((r) => ({ id: r.id, name: r.name }))} from={f.from} to={f.to} className="mb-6" />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatTile label="Average QC score" value={pct(cur.avgScore)} delta={d(cur.avgScore, before.avgScore) !== null ? `${signed(d(cur.avgScore, before.avgScore))} pts` : null} deltaGood={(d(cur.avgScore, before.avgScore) ?? 0) >= 0} hint={`KPI line: above ${kpi}%`} />
        <StatTile label="Calls reviewed" value={cur.evaluations.toLocaleString("en-GB")} delta={before.evaluations ? signed(cur.evaluations - before.evaluations, 0) : null} deltaGood={null} hint={`${coverage.met}/${coverage.total} agents at target this week`} />
        <StatTile label="Meeting KPI" value={pct(cur.meetsShare, 0)} delta={d(cur.meetsShare, before.meetsShare) !== null ? `${signed(d(cur.meetsShare, before.meetsShare), 0)} pts` : null} deltaGood={(d(cur.meetsShare, before.meetsShare) ?? 0) >= 0} hint={`${pct(cur.perfectShare, 0)} perfect`} />
        <StatTile
          label="Zero-tolerance breaches"
          value={<span className={cn(cur.autoFails ? "text-fail" : "")}>{cur.autoFails}</span>}
          delta={before.evaluations ? signed(cur.autoFails - before.autoFails, 0) : null}
          deltaGood={cur.autoFails <= before.autoFails}
          hint="Calls forced to 0%"
        />
        <StatTile label="Average handling time" value={formatDuration(cur.avgDuration)} delta={cur.avgDuration && before.avgDuration ? `${signed(cur.avgDuration - before.avgDuration, 0)}s` : null} deltaGood={null} hint="Of the calls reviewed" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.7fr_1fr]">
        <Card>
          <CardHeader title="Weekly average by site" description="Call-weighted QC score, with the KPI line" />
          <div className="px-4 pb-5">
            <TrendChart points={trend.points} series={trend.series} allSeries={sites.map((s) => s.name).sort()} kpi={kpi} />
          </div>
        </Card>
        <Card className="bg-ink p-5 text-white">
          <BriefingCard
            period={{ from: f.from, to: f.to, siteId: f.siteId }}
            initial={briefing ? { output: briefing.output as never, model: briefing.model, createdAt: briefing.createdAt.toISOString() } : null}
            aiEnabled={aiStatus().enabled}
          />
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader title="Where calls lose marks" description="Section scores, this period vs the one before" />
          <ul className="grid gap-4 px-5 pb-5">
            {sc.sections.map((s) => {
              const v = sections[s.key] ?? null;
              const p = sectionsPrev[s.key] ?? null;
              const delta = d(v, p);
              return (
                <li key={s.key}>
                  <div className="flex items-baseline justify-between gap-3 text-[13.5px]">
                    <span className="font-medium">{s.shortName}</span>
                    <span className="tabular">
                      <b>{pct(v)}</b> <span className={cn("text-[12px]", delta === null ? "text-faint" : delta >= 0 ? "text-meets" : "text-fail")}>{signed(delta)}</span>
                    </span>
                  </div>
                  <div className={cn("relative mt-1.5 h-2 rounded-full", v !== null && v > kpi ? "bg-meets-soft" : "bg-below-soft")}>
                    <div className={cn("h-full rounded-full", v !== null && v > kpi ? "bg-meets" : "bg-below")} style={{ width: `${v ?? 0}%` }} />
                    {p !== null ? <span className="absolute top-[-3px] h-[14px] w-0.5 rounded bg-ink/60" style={{ left: `${p}%` }} title={`Previous: ${pct(p)}`} /> : null}
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="px-5 pb-4 text-[12px] text-muted">The dark tick marks the previous period.</p>
        </Card>
        <Card>
          <CardHeader title="Score distribution" description="A wall of 100% is a calibration question" />
          <div className="px-3 pb-4">
            <DistributionChart data={dist} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Reviewer calibration" description={`Average score each reviewer gives vs the team (${pct(calib.overall)})`} />
          <ul className="grid gap-3 px-5 pb-5">
            {calib.reviewers.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 text-[13.5px]">
                <div className="min-w-0">
                  <p className="truncate font-medium">{r.name}</p>
                  <p className="text-[12px] text-muted">
                    {r.reviews} reviews · {pct(r.perfectShare, 0)} perfect
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold tabular">{pct(r.avg)}</p>
                  <p className={cn("text-[12px] tabular", r.variance === null ? "text-faint" : Math.abs(r.variance) >= 2 ? "font-semibold text-below-ink" : "text-muted")}>{signed(r.variance)} vs team</p>
                </div>
              </li>
            ))}
            {!calib.reviewers.length ? <li className="text-[13.5px] text-muted">No reviews in this period.</li> : null}
          </ul>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Agents needing attention" description={`More than ${sc.settings.attentionShare}% below KPI, a zero-tolerance breach, or a sharp drop`} />
          <ul className="divide-y divide-line border-t border-line">
            {attention.slice(0, 8).map((a) => (
              <li key={a.agentId}>
                <Link href={`/admin/agents/${a.agentId}${query}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-sunken/40">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{a.name}</p>
                    <p className="text-[12.5px] text-muted">
                      {a.site} · {a.reasons.join(" · ")}
                    </p>
                  </div>
                  <span className={cn("shrink-0 text-[15px] font-semibold tabular", a.avgScore !== null && a.avgScore > kpi ? "text-meets" : "text-below-ink")}>{pct(a.avgScore)}</span>
                </Link>
              </li>
            ))}
            {!attention.length ? <li className="px-5 py-6 text-[14px] text-muted">Nobody is flagged for this period.</li> : null}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Zero-tolerance log" description={issues.counts.length ? issues.counts.map((c) => `${c.name} ${c.count}`).join(" · ") : "No breaches in this period"} />
          <ul className="divide-y divide-line border-t border-line">
            {issues.rows.map((r) => (
              <li key={r.id}>
                <Link href={`/evaluations/${r.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-sunken/40">
                  <TriangleAlert className="size-4 shrink-0 text-fail" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">
                      {r.agent} <span className="font-normal text-muted">· {r.site}</span>
                    </p>
                    <p className="text-[12.5px] text-muted">
                      {r.issues} · {formatCallTime(r.callAt)} · reviewed by {r.reviewer}
                    </p>
                  </div>
                  <ArrowRight className="size-4 text-faint" />
                </Link>
              </li>
            ))}
            {!issues.rows.length ? <li className="px-5 py-6 text-[14px] text-muted">No zero-tolerance breaches recorded.</li> : null}
          </ul>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Agents by site" description="Every agent’s QC score, below-KPI share, handling time and section scores for the period." action={<Link href="/admin/agents" className="text-[13.5px] font-semibold text-brand-700 hover:underline">Manage roster</Link>} />
        <div className="px-1 pb-3">
          <AgentTable rows={table} sections={sc.sections} kpi={kpi} attention={sc.settings.attentionShare} query={query} />
        </div>
      </Card>

      <Card className="mt-6">
        <CardHeader title="Check-by-check heatmap" description="Where each site loses marks. Spot a training need across a whole team at a glance." />
        <div className="px-4 pb-5">
          <CriteriaHeatmap criteria={heat.criteria} groups={heat.groups} cells={heat.cells} linkFor={(key, gid) => `${explorerBase}&site=${gid}&criterion=${key}`} />
        </div>
      </Card>
    </>
  );
}
