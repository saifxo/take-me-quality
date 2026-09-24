import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ClipboardPaste, Keyboard } from "lucide-react";
import { requireUser } from "@/server/auth/dal";
import { listMyQueue } from "@/server/services/evaluations";
import { reviewerWeek, weeklyCoverage } from "@/server/services/analytics";
import { currentWeekStart, formatCallTime, formatDuration, isoDate, londonParts, weekLabel } from "@/lib/dates";
import { ButtonLink } from "@/components/ui/button";
import { Badge, Card, CardHeader, EmptyState, PageHeader, StatTile } from "@/components/ui/surface";
import { QueueActions } from "./queue-actions";
import { CALL_TYPE_LABEL, cn, pct } from "@/lib/utils";

export const metadata: Metadata = { title: "Today" };

function greeting() {
  const h = londonParts(new Date()).h;
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default async function TodayPage() {
  const user = await requireUser();
  const week = currentWeekStart();
  const [queue, mine, coverage] = await Promise.all([
    listMyQueue(user),
    reviewerWeek(user.id, week),
    weeklyCoverage(week, undefined, user.role === "qa" ? user.id : undefined),
  ]);
  const maxDay = Math.max(1, ...mine.days.map((d) => d.count));
  const behind = coverage.agents.filter((a) => a.reviews < coverage.target);
  const lp = londonParts(new Date());
  const todayIso = isoDate(lp.y, lp.m, lp.d);

  return (
    <>
      <PageHeader
        eyebrow={weekLabel(week)}
        title={`${greeting()}, ${user.name.split(" ")[0]}`}
        description={
          queue.length
            ? `You have ${queue.length} ${queue.length === 1 ? "call" : "calls"} waiting to be scored.`
            : "Your queue is clear. Paste calls from the recordings portal to start scoring."
        }
        actions={
          <ButtonLink href="/qa/new" variant="brand" size="lg">
            <ClipboardPaste className="size-[18px]" />
            Score a call
          </ButtonLink>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Reviews this week" value={mine.total} hint="Submitted since Monday">
          <div className="mt-2 flex h-10 items-end gap-1.5" aria-hidden>
            {mine.days.map((d) => (
              <div key={d.day} className="flex flex-1 flex-col items-center gap-1">
                <div className={cn("w-full rounded-md", d.day === todayIso ? "bg-brand" : "bg-brand-100")} style={{ height: `${Math.max(6, (d.count / maxDay) * 100)}%` }} />
              </div>
            ))}
          </div>
        </StatTile>
        <StatTile label="In your queue" value={queue.length} hint={queue.filter((q) => q.status === "draft").length ? `${queue.filter((q) => q.status === "draft").length} started as drafts` : "Queued from the portal"} />
        <StatTile label="Average score you gave" value={pct(mine.avgGiven28d)} hint={`Across your ${mine.reviews28d} reviews in the last 28 days`} />
        <StatTile label="Agents at weekly target" value={`${coverage.met}/${coverage.total}`} hint={`Target: ${coverage.target} reviewed calls per agent`} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader title="Your queue" description="Calls you’ve pulled from the portal, oldest first." action={queue.length ? <Badge tone="brand">{queue.length}</Badge> : null} />
          {queue.length === 0 ? (
            <EmptyState
              icon={<ClipboardPaste className="size-6" />}
              title="Nothing waiting"
              action={
                <ButtonLink href="/qa/new" variant="primary">
                  Paste calls from the portal
                </ButtonLink>
              }
            >
              Copy rows from the recordings table and paste them in. Agent, time and duration fill in automatically.
            </EmptyState>
          ) : (
            <ul className="divide-y divide-line border-t border-line">
              {queue.map((q) => (
                <li key={q.id} className="group flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 hover:bg-sunken/40">
                  <div className="grid size-10 shrink-0 place-items-center rounded-full bg-sunken text-[13px] font-bold text-ink-2">{q.siteCode}</div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14.5px] font-semibold">{q.agentName}</p>
                    <p className="text-[13px] text-muted">
                      {formatCallTime(q.callAt)} · {formatDuration(q.durationSec)} · {CALL_TYPE_LABEL[q.callType]}
                      {q.callerMasked ? ` · ${q.callerMasked}` : ""}
                    </p>
                  </div>
                  <Badge tone={q.status === "draft" ? "warn" : "neutral"}>{q.status === "draft" ? "Draft" : "Queued"}</Badge>
                  <div className="flex items-center gap-1">
                    <QueueActions id={q.id} />
                    <ButtonLink href={`/qa/review/${q.id}`} size="sm" variant={q.status === "draft" ? "primary" : "outline"}>
                      {q.status === "draft" ? "Continue" : "Start"}
                      <ArrowRight className="size-3.5" />
                    </ButtonLink>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="grid content-start gap-6">
          <Card>
            <CardHeader
              title="Who still needs calls this week"
              description={coverage.total ? `${behind.length} of ${coverage.total} assigned agents are below ${coverage.target} reviews` : "Your admin controls which agents appear here"}
            />
            <ul className="grid gap-3 px-5 pb-5">
              {behind.slice(0, 8).map((a) => (
                <li key={a.id}>
                  <div className="flex items-center justify-between text-[13.5px]">
                    <span className="truncate font-medium">{a.name}</span>
                    <span className="shrink-0 text-muted tabular">
                      {a.reviews}/{coverage.target} · {a.siteCode}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-brand-50">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, (a.reviews / coverage.target) * 100)}%` }} />
                  </div>
                </li>
              ))}
              {behind.length === 0 ? (
                <li className="text-[14px] text-muted">{coverage.total ? "Every assigned agent has reached this week’s target." : "No agents are assigned to you yet."}</li>
              ) : null}
              {behind.length > 8 ? <li className="text-[13px] text-muted">…and {behind.length - 8} more</li> : null}
            </ul>
          </Card>
          <Card className="bg-ink text-white">
            <div className="flex gap-4 p-5">
              <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white/10">
                <Keyboard className="size-5 text-cyan" />
              </div>
              <div>
                <p className="text-[15px] font-semibold">Score faster with the keyboard</p>
                <p className="mt-1 text-[13.5px] leading-relaxed text-white/70">
                  In a review, press <kbd className="rounded bg-white/15 px-1.5">1</kbd>–<kbd className="rounded bg-white/15 px-1.5">4</kbd> for Yes, Partial, No, N/A,{" "}
                  <kbd className="rounded bg-white/15 px-1.5">↑</kbd> <kbd className="rounded bg-white/15 px-1.5">↓</kbd> to move, and{" "}
                  <kbd className="rounded bg-white/15 px-1.5">Ctrl</kbd>+<kbd className="rounded bg-white/15 px-1.5">Enter</kbd> to submit.
                </p>
                <Link href="/playbook" className="mt-3 inline-flex items-center gap-1 text-[13.5px] font-semibold text-cyan hover:underline">
                  Open the Playbook <ArrowRight className="size-3.5" />
                </Link>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
