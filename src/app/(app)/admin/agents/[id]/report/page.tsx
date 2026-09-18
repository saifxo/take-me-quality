import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/server/auth/dal";
import { getAgent } from "@/server/services/roster";
import { agentProfile } from "@/server/services/analytics";
import { getActiveScorecard } from "@/server/services/scorecard";
import { latestCoaching } from "@/server/services/ai";
import { AppError } from "@/server/errors";
import { resolveFilter } from "@/lib/filters";
import { formatCallTime, formatDuration } from "@/lib/dates";
import { pct } from "@/lib/utils";
import { bandFor } from "@/lib/scoring/engine";
import { TakeMeMark } from "@/components/brand/logo";
import { BandPill } from "@/components/ui/surface";
import { PrintButton } from "@/app/(app)/evaluations/[id]/evaluation-actions";

export const metadata: Metadata = { title: "1:1 report" };

type Coaching = { summary: string; strengths: string[]; tips: string[]; focus: string };

export default async function AgentReportPage(props: PageProps<"/admin/agents/[id]/report">) {
  const user = await requireAdmin();
  const { id } = await props.params;
  const sp = await props.searchParams;
  let agent: Awaited<ReturnType<typeof getAgent>>;
  try {
    agent = await getAgent(id);
  } catch (e) {
    if (e instanceof AppError) notFound();
    throw e;
  }
  const f = resolveFilter(sp, "12w");
  const [profile, sc, coaching] = await Promise.all([agentProfile(id, { from: f.from, to: f.to }), getActiveScorecard(), latestCoaching(id, 10)]);
  const approved = coaching.find((c) => c.approvedAt);
  const c = approved?.output as Coaching | undefined;
  const band = bandFor(profile.summary.avgScore, sc.settings.kpiPass);

  return (
    <div className="mx-auto max-w-[820px] rounded-3xl bg-white p-8 shadow-[var(--shadow-card)] print:max-w-none print:rounded-none print:p-0 print:shadow-none">
      <div className="no-print mb-6 flex justify-end">
        <PrintButton />
      </div>
      <header className="flex items-start justify-between gap-6 border-b border-line pb-6">
        <div className="flex items-center gap-3">
          <TakeMeMark className="size-12" />
          <div>
            <p className="text-[12px] font-semibold tracking-[0.1em] text-muted uppercase">Take Me Quality · one-to-one summary</p>
            <h1 className="font-display text-[30px] leading-tight font-extrabold">{agent.fullName}</h1>
            <p className="text-[13.5px] text-muted">
              {agent.siteName} · {f.label}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[40px] leading-none font-semibold tabular">{pct(profile.summary.avgScore)}</p>
          <div className="mt-2">
            <BandPill band={band} />
          </div>
        </div>
      </header>

      <section className="grid grid-cols-4 gap-4 border-b border-line py-5 text-[13px]">
        {[
          ["Calls reviewed", String(profile.summary.evaluations)],
          ["Meeting KPI", pct(profile.summary.meetsShare, 0)],
          ["Zero-tolerance", String(profile.summary.autoFails)],
          ["Avg handling time", formatDuration(profile.summary.avgDuration)],
        ].map(([k, v]) => (
          <div key={k}>
            <p className="text-muted">{k}</p>
            <p className="text-[20px] font-semibold tabular">{v}</p>
          </div>
        ))}
      </section>

      <section className="grid grid-cols-4 gap-4 border-b border-line py-5 text-[13px]">
        {sc.sections.map((s) => (
          <div key={s.key}>
            <p className="text-muted">{s.shortName}</p>
            <p className="text-[18px] font-semibold tabular">{pct(profile.sections[s.key] ?? null)}</p>
            <p className="text-[12px] text-faint">site {pct(profile.teamSections[s.key] ?? null)}</p>
          </div>
        ))}
      </section>

      {c ? (
        <section className="border-b border-line py-5">
          <h2 className="text-[15px] font-bold">Coaching summary</h2>
          <p className="mt-2 text-[14px] leading-relaxed">{c.summary}</p>
          <div className="mt-3 grid grid-cols-2 gap-4 text-[13.5px]">
            <div>
              <p className="font-semibold text-meets">Strengths</p>
              <ul className="mt-1 list-disc pl-5">{c.strengths.map((s) => <li key={s}>{s}</li>)}</ul>
            </div>
            <div>
              <p className="font-semibold text-brand-700">Try this</p>
              <ul className="mt-1 list-disc pl-5">{c.tips.map((s) => <li key={s}>{s}</li>)}</ul>
            </div>
          </div>
          <p className="mt-3 text-[13px]">
            <b>Focus next:</b> {c.focus}
          </p>
        </section>
      ) : (
        <p className="border-b border-line py-5 text-[13.5px] text-muted">No approved coaching summary yet. Approve one on the agent’s profile to include it here.</p>
      )}

      <section className="border-b border-line py-5">
        <h2 className="text-[15px] font-bold">Checks to work on</h2>
        <ul className="mt-2 grid gap-2 text-[13.5px]">
          {profile.criteria.filter((x) => x.misses > 0).slice(0, 5).map((x) => (
            <li key={x.key} className="flex justify-between gap-4">
              <span>{x.title}</span>
              <span className="tabular text-muted">
                missed {x.misses} of {x.scored}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="py-5">
        <h2 className="text-[15px] font-bold">Recent reviewer feedback</h2>
        <ul className="mt-2 grid gap-2 text-[13px]">
          {profile.recent.filter((r) => r.feedback).slice(0, 8).map((r) => (
            <li key={r.id} className="grid grid-cols-[120px_1fr_60px] gap-3">
              <span className="text-muted">{formatCallTime(r.callAt)}</span>
              <span>{r.feedback}</span>
              <span className="text-right tabular">{pct(r.score, 1)}</span>
            </li>
          ))}
        </ul>
      </section>
      <footer className="border-t border-line pt-4 text-[11.5px] text-faint">
        Prepared by {user.name} · {sc.name} · Confidential: for the agent and their manager only.
      </footer>
    </div>
  );
}
