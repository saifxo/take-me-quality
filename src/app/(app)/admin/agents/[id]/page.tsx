import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText, TriangleAlert } from "lucide-react";
import { requireAdmin } from "@/server/auth/dal";
import { getAgent, listSites } from "@/server/services/roster";
import { agentProfile } from "@/server/services/analytics";
import { getActiveScorecard } from "@/server/services/scorecard";
import { aiStatus, latestCoaching } from "@/server/services/ai";
import { AppError } from "@/server/errors";
import { resolveFilter } from "@/lib/filters";
import { formatCallTime, formatDuration } from "@/lib/dates";
import { CALL_TYPE_LABEL, cn, initials, pct } from "@/lib/utils";
import { bandFor } from "@/lib/scoring/engine";
import { Badge, BandPill, Card, CardHeader, StatTile, TableWrap, bandTextClass, td, th } from "@/components/ui/surface";
import { ButtonLink } from "@/components/ui/button";
import { FiltersBar } from "@/components/admin/filters-bar";
import { AgentTrendChart, SectionRadar } from "@/components/charts/charts";
import { CoachingPanel } from "@/components/admin/ai-cards";
import { AgentEditor } from "../agent-editor";

export const metadata: Metadata = { title: "Agent profile" };

export default async function AgentProfilePage(props: PageProps<"/admin/agents/[id]">) {
  await requireAdmin();
  const { id } = await props.params;
  const sp = await props.searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  let agent: Awaited<ReturnType<typeof getAgent>>;
  try {
    agent = await getAgent(id);
  } catch (e) {
    if (e instanceof AppError) notFound();
    throw e;
  }
  const f = resolveFilter(sp, "12w");
  const period = { from: f.from, to: f.to };
  const [profile, sc, coaching, sites] = await Promise.all([agentProfile(id, period), getActiveScorecard(), latestCoaching(id), listSites()]);
  const kpi = sc.settings.kpiPass;
  const band = bandFor(profile.summary.avgScore, kpi);
  const misses = profile.criteria.filter((c) => c.misses > 0).slice(0, 5);
  const strongest = [...profile.criteria].filter((c) => c.scored >= 3).sort((a, b) => b.value - a.value).slice(0, 3);
  const qs = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : [])) as [string, string][]).toString();

  return (
    <>
      <Link href="/admin/agents" className="no-print mb-4 inline-flex items-center gap-1.5 text-[14px] font-semibold text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> All agents
      </Link>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="grid size-16 place-items-center rounded-full bg-ink font-display text-[22px] font-extrabold text-white">{initials(agent.fullName)}</div>
          <div>
            <p className="text-[12px] font-semibold tracking-[0.08em] text-brand-700 uppercase">{f.label}</p>
            <h1 className="font-display text-[34px] leading-tight font-extrabold">{agent.fullName}</h1>
            <p className="text-[14px] text-muted">
              {agent.siteName}
              {agent.teamCode ? ` · ${agent.teamCode}` : ""}
              {agent.extension ? ` · ext ${agent.extension}` : ""}
              {agent.status !== "active" ? (
                <Badge tone="warn" className="ml-2">
                  {agent.status}
                </Badge>
              ) : null}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BandPill band={band} />
          <AgentEditor sites={sites.map((s) => ({ id: s.id, name: s.name }))} agent={agent} />
          <ButtonLink href={`/admin/agents/${id}/report${qs ? `?${qs}` : ""}`} variant="outline" size="sm">
            <FileText className="size-3.5" /> Export for 1:1
          </ButtonLink>
        </div>
      </div>
      <FiltersBar show={{}} from={f.from} to={f.to} defaultPeriod="12w" className="mb-6" />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatTile label="QC score" value={<span className={bandTextClass(band)}>{pct(profile.summary.avgScore)}</span>} hint={`KPI line above ${kpi}%`} />
        <StatTile label="Calls reviewed" value={profile.summary.evaluations} hint={`${f.weeks} ${f.weeks === 1 ? "week" : "weeks"}`} />
        <StatTile label="Meeting KPI" value={pct(profile.summary.meetsShare, 0)} hint={`${pct(profile.summary.perfectShare, 0)} perfect`} />
        <StatTile label="Zero-tolerance" value={<span className={profile.summary.autoFails ? "text-fail" : ""}>{profile.summary.autoFails}</span>} hint="Breaches in the period" />
        <StatTile label="Average handling time" value={formatDuration(profile.summary.avgDuration)} hint="Of reviewed calls" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader title="Weekly progress" description="Average QC score for each week, with the KPI line" />
          <div className="px-4 pb-5">
            <AgentTrendChart points={profile.trend} kpi={kpi} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Sections vs site average" description={`Compared with everyone at ${agent.siteName}`} />
          <div className="px-2 pb-4">
            <SectionRadar data={sc.sections.map((s) => ({ section: s.shortName, agent: profile.sections[s.key] ?? null, team: profile.teamSections[s.key] ?? null }))} />
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card className="p-5">
          <CoachingPanel
            agentId={id}
            period={period}
            aiEnabled={aiStatus().enabled}
            history={coaching.map((c) => ({ ...c, output: c.output as never, createdAt: c.createdAt.toISOString(), approvedAt: c.approvedAt?.toISOString() ?? null }))}
          />
        </Card>
        <Card>
          <CardHeader title="What to work on" description="The checks this agent misses most, with the reviewers’ notes" />
          <ul className="grid gap-3 px-5 pb-5">
            {misses.map((c) => (
              <li key={c.key} className="rounded-xl border border-line p-3.5">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold">{c.title}</p>
                  <span className="shrink-0 text-[12.5px] text-muted tabular">
                    missed {c.misses} of {c.scored}
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-below-soft">
                  <div className="h-full rounded-full bg-below" style={{ width: `${c.value}%` }} />
                </div>
                {c.notes ? <p className="mt-2 line-clamp-2 text-[13px] text-ink-2">“{c.notes.split(" | ").slice(0, 2).join("” · “")}”</p> : null}
              </li>
            ))}
            {!misses.length ? <li className="text-[14px] text-muted">No checks were missed in this period.</li> : null}
          </ul>
          {strongest.length ? (
            <p className="border-t border-line px-5 py-3 text-[13px] text-muted">
              Strongest: <span className="text-ink-2">{strongest.map((s) => s.title).join(" · ")}</span>
            </p>
          ) : null}
        </Card>
      </div>

      {profile.issues.length ? (
        <Card className="mt-6 border-fail/40">
          <CardHeader title={<span className="inline-flex items-center gap-2 text-fail"><TriangleAlert className="size-4" /> Zero-tolerance history</span>} />
          <ul className="divide-y divide-line border-t border-line">
            {profile.issues.map((i) => (
              <li key={i.id}>
                <Link href={`/evaluations/${i.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-sunken/40">
                  <span className="font-semibold">{i.issues}</span>
                  <span className="text-[13px] text-muted">
                    {formatCallTime(i.callAt, true)} · {i.reviewer}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card className="mt-6">
        <CardHeader title="Reviewed calls" description="Most recent first" />
        <TableWrap>
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <th className={th}>Call</th>
                <th className={th}>Type</th>
                <th className={th}>Reviewer</th>
                <th className={th}>Feedback</th>
                <th className={`${th} text-right`}>Score</th>
              </tr>
            </thead>
            <tbody>
              {profile.recent.map((r) => (
                <tr key={r.id} className="hover:bg-sunken/40">
                  <td className={td}>
                    <Link href={`/evaluations/${r.id}`} className="font-medium hover:underline">
                      {formatCallTime(r.callAt, true)}
                    </Link>
                    <p className="text-[12.5px] text-muted">{formatDuration(r.duration)}</p>
                  </td>
                  <td className={`${td} text-ink-2`}>{CALL_TYPE_LABEL[r.call_type]}</td>
                  <td className={`${td} text-ink-2`}>{r.reviewer}</td>
                  <td className={`${td} max-w-[420px] text-[13px] text-ink-2`}>
                    <span className="line-clamp-2">{r.feedback ?? "—"}</span>
                  </td>
                  <td className={cn(td, "text-right font-semibold tabular", bandTextClass(r.band as never))}>{pct(r.score, 2)}</td>
                </tr>
              ))}
              {!profile.recent.length ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-[14px] text-muted">
                    No reviewed calls in this period.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </TableWrap>
      </Card>
    </>
  );
}
