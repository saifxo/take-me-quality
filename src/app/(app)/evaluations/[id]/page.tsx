import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Pencil, TriangleAlert } from "lucide-react";
import { requireUser } from "@/server/auth/dal";
import { getEvaluationView } from "@/server/services/evaluations";
import { AppError } from "@/server/errors";
import { formatCallTime, formatDuration, weekLabel } from "@/lib/dates";
import { CALL_TYPE_LABEL, cn, pct } from "@/lib/utils";
import { Badge, BandPill, Card, CardHeader, bandTextClass } from "@/components/ui/surface";
import { ButtonLink } from "@/components/ui/button";
import { AdminEvaluationActions, PrintButton } from "./evaluation-actions";

export const metadata: Metadata = { title: "Evaluation" };

const ANSWER_STYLE = {
  yes: { label: "Yes", cls: "bg-meets-soft text-meets" },
  partial: { label: "Partial", cls: "bg-below-soft text-below-ink" },
  no: { label: "No", cls: "bg-fail-soft text-fail" },
  na: { label: "N/A", cls: "bg-sunken text-muted" },
} as const;

export default async function EvaluationPage(props: PageProps<"/evaluations/[id]">) {
  const { id } = await props.params;
  const user = await requireUser();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  let view: Awaited<ReturnType<typeof getEvaluationView>>;
  try {
    view = await getEvaluationView(user, id);
  } catch (err) {
    if (err instanceof AppError && err.code === "not_found") notFound();
    if (err instanceof AppError && err.code === "forbidden") redirect(user.role === "admin" ? "/admin/evaluations" : "/qa/reviews");
    throw err;
  }
  const ev = view.evaluation;
  if (ev.status !== "submitted") redirect(`/qa/review/${id}`);
  const sc = view.scorecard;
  const autoFail = view.issues.length > 0;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link href={user.role === "admin" ? "/admin/evaluations" : "/qa/reviews"} className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-muted hover:text-ink">
          <ArrowLeft className="size-4" /> Back to {user.role === "admin" ? "evaluations" : "my reviews"}
        </Link>
        <div className="flex flex-wrap gap-2">
          <PrintButton />
          {view.edit.canEdit ? (
            <ButtonLink href={`/qa/review/${id}`} variant="outline" size="sm">
              <Pencil className="size-3.5" /> {user.role === "admin" && ev.reviewerId !== user.id ? "Amend review" : "Change review"}
            </ButtonLink>
          ) : null}
          {user.role === "admin" ? <AdminEvaluationActions id={id} /> : null}
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="grid gap-6 p-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <div className="min-w-0">
            <p className="text-[12px] font-semibold tracking-[0.08em] text-brand-700 uppercase">
              {view.agent?.siteName} · {ev.callWeek ? weekLabel(ev.callWeek) : ""}
            </p>
            <h1 className="font-display mt-1 text-[32px] leading-tight font-extrabold">
              {user.role === "admin" && view.agent ? <Link href={`/admin/agents/${ev.agentId}`} className="hover:underline">{view.agent.fullName}</Link> : view.agent?.fullName}
            </h1>
            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-[13.5px] sm:grid-cols-4">
              {[
                ["Call", formatCallTime(ev.callAt, true)],
                ["Duration", formatDuration(ev.durationSec)],
                ["Type", CALL_TYPE_LABEL[ev.callType]],
                ["Caller", ev.callerMasked ?? "—"],
                ["Queue / ext", [ev.queue, ev.extension].filter(Boolean).join(" / ") || "—"],
                ["Reviewer", view.reviewerName],
                ["Submitted", formatCallTime(ev.submittedAt, true)],
                ["Scorecard", sc.name],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[12px] text-muted">{k}</dt>
                  <dd className="font-medium">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="flex flex-col items-start gap-2 md:items-end">
            <p className={cn("text-[56px] leading-none font-semibold tracking-[-0.03em] tabular", bandTextClass(ev.band))}>{pct(ev.score, 2)}</p>
            <BandPill band={ev.band} autoFail={autoFail} />
            <p className="font-mono text-[12px] text-muted">
              {ev.applicableCount} applicable · {ev.points} pts − {ev.penalty} deducted
            </p>
          </div>
        </div>
        {ev.amendedAt ? (
          <div className="border-t border-line bg-brand-50/60 px-6 py-3 text-[13.5px] text-brand-900">
            Changed on {formatCallTime(ev.amendedAt, true)}
            {view.amendedByName ? ` by ${view.amendedByName}` : ""}: “{ev.amendReason}”
          </div>
        ) : null}
        <div className="grid gap-px border-t border-line bg-line sm:grid-cols-4">
          {sc.sections.map((s) => {
            const v = ev.sectionScores?.[s.key] ?? null;
            return (
              <div key={s.key} className="bg-surface px-5 py-4">
                <p className="text-[12.5px] text-muted">{s.shortName}</p>
                <p className="mt-0.5 text-[20px] font-semibold tabular">{v === null ? "N/A" : pct(v)}</p>
              </div>
            );
          })}
        </div>
      </Card>

      {view.issueDetails.length ? (
        <Card className="mt-6 border-fail/40 bg-fail-soft/40">
          <CardHeader title={<span className="inline-flex items-center gap-2 text-fail"><TriangleAlert className="size-4" /> Zero-tolerance issues</span>} description="Any one of these fails the call." />
          <ul className="grid gap-2 px-5 pb-5">
            {view.issueDetails.map((i) => (
              <li key={i.issueId} className="rounded-xl bg-surface p-3.5">
                <p className="font-semibold">{i.issue?.title}</p>
                {i.note ? <p className="mt-1 text-[14px] text-ink-2">{i.note}</p> : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {ev.strengths || ev.improvements || ev.feedback ? (
        <Card className="mt-6">
          <CardHeader title="Feedback" />
          <div className="grid gap-4 px-5 pb-5 md:grid-cols-3">
            {[
              ["What went well", ev.strengths],
              ["To improve", ev.improvements],
              ["Overall", ev.feedback],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-sunken/50 p-4">
                <p className="text-[12px] font-semibold tracking-wide text-muted uppercase">{k}</p>
                <p className="mt-1.5 text-[14px] leading-relaxed whitespace-pre-line text-ink-2">{v || "—"}</p>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <div className="mt-6 grid gap-5">
        {sc.sections.map((s) => (
          <Card key={s.key}>
            <CardHeader title={s.name} />
            <ul className="border-t border-line">
              {s.criteria.map((c) => {
                const a = view.answers[c.id];
                const style = a ? ANSWER_STYLE[a.answer] : null;
                return (
                  <li key={c.id} className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-3 last:border-0">
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-medium">
                        {c.title}
                        {c.penaltyNo > 0 ? <Badge tone="danger" className="ml-2 align-middle">Critical</Badge> : null}
                      </p>
                      {a?.note ? (
                        <p className="mt-1 text-[13.5px] text-ink-2">
                          {a.atTime ? <span className="mr-1.5 font-mono text-[12px] text-muted">{a.atTime}</span> : null}
                          {a.note}
                        </p>
                      ) : null}
                    </div>
                    {style ? <span className={cn("rounded-full px-3 py-1 text-[12.5px] font-bold", style.cls)}>{style.label}</span> : <span className="text-faint">—</span>}
                  </li>
                );
              })}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}
