"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, RefreshCw, ShieldCheck, Sparkles, SquarePen } from "lucide-react";
import { approveSummaryAction, briefingAction, coachingAction, editCoachingAction, themesAction } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/surface";
import { Textarea, Input, FormError } from "@/components/ui/form";
import { Spinner, useToast } from "@/components/ui/client";
import { cn } from "@/lib/utils";

type Period = { from: string; to: string; siteId?: string };
export type SummaryMode = "manual" | "ai";

export const GDPR_NOTE =
  "Customer numbers, addresses, postcodes and emails are removed before anything is sent to Gemini, and agents are referred to by first name only, so UK GDPR compliance is maintained.";

/** Manual (default): built from the scores by fixed rules, nothing leaves Take Me Quality. AI: Gemini writes it. */
export function SummaryModeToggle({ mode, onChange, aiEnabled, dark = false }: { mode: SummaryMode; onChange: (m: SummaryMode) => void; aiEnabled: boolean; dark?: boolean }) {
  return (
    <div role="radiogroup" aria-label="Summary type" className={cn("inline-flex rounded-full p-0.5 text-[12px] font-semibold", dark ? "bg-white/10" : "bg-sunken")}>
      {(
        [
          ["manual", "Manual"],
          ["ai", "AI"],
        ] as const
      ).map(([value, label]) => {
        const on = mode === value;
        const disabled = value === "ai" && !aiEnabled;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            title={disabled ? "Add a Gemini API key to enable AI summaries" : value === "manual" ? "Built from the scores by fixed rules. Nothing leaves Take Me Quality." : "Written by Google Gemini from anonymised data"}
            onClick={() => onChange(value)}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-3 py-1 transition disabled:cursor-not-allowed disabled:opacity-40",
              on ? (dark ? "bg-white text-ink" : "bg-surface text-ink shadow-sm") : dark ? "text-white/70 hover:text-white" : "text-muted hover:text-ink",
            )}
          >
            {value === "ai" ? <Sparkles className="size-3" /> : <SquarePen className="size-3" />}
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function AiPrivacyNote({ mode, dark = false, className }: { mode: SummaryMode; dark?: boolean; className?: string }) {
  return (
    <p className={cn("flex gap-1.5 text-[11.5px] leading-snug", dark ? "text-white/55" : "text-muted", className)}>
      <ShieldCheck className={cn("mt-px size-3.5 shrink-0", dark ? "text-cyan" : "text-meets")} />
      {mode === "manual" ? "Manual summaries are built from the scores inside Take Me Quality. No data is sent anywhere." : GDPR_NOTE}
    </p>
  );
}

function ModelTag({ model, createdAt, dark = false }: { model: string; createdAt?: string; dark?: boolean }) {
  const when = createdAt ? new Date(createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : null;
  return (
    <p className={cn("mt-3 text-[11.5px]", dark ? "text-white/45" : "text-faint")}>
      {model === "rules" ? "Manual summary, built from the scores" : `AI-generated with ${model}`}
      {when ? ` · ${when}` : ""}
    </p>
  );
}

// ---------------------------------------------------------------- weekly briefing
type Briefing = { headline: string; bullets: string[]; watch: string[] };

export function BriefingCard({ period, initial, aiEnabled }: { period: Period; initial: { output: Briefing; model: string; createdAt: string } | null; aiEnabled: boolean }) {
  const [data, setData] = useState(initial);
  const [mode, setMode] = useState<SummaryMode>("manual");
  const [pending, start] = useTransition();
  const toast = useToast();
  const run = (force: boolean) =>
    start(async () => {
      const res = await briefingAction(period, force, mode);
      if (!res.ok) return toast({ tone: "error", title: "Couldn’t write the briefing", body: res.error });
      setData({ output: res.data.output as Briefing, model: res.data.model, createdAt: res.data.createdAt });
    });
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-xl bg-white/10">
            <Sparkles className="size-4 text-cyan" />
          </span>
          <p className="text-[15px] font-semibold">Weekly briefing</p>
        </div>
        <div className="flex items-center gap-1.5">
          <SummaryModeToggle mode={mode} onChange={setMode} aiEnabled={aiEnabled} dark />
          {data ? (
            <button type="button" onClick={() => run(true)} disabled={pending} className="grid size-8 place-items-center rounded-full text-white/60 hover:bg-white/10 hover:text-white" aria-label={`Rewrite (${mode})`} title={`Rewrite as ${mode === "ai" ? "AI" : "manual"}`}>
              {pending ? <Spinner className="size-4" /> : <RefreshCw className="size-4" />}
            </button>
          ) : null}
        </div>
      </div>
      {data ? (
        <div className="mt-4 flex-1">
          <p className="text-[16px] leading-snug font-semibold">{data.output.headline}</p>
          <ul className="mt-3 grid gap-2">
            {data.output.bullets.map((b) => (
              <li key={b} className="flex gap-2 text-[13.5px] leading-relaxed text-white/80">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-cyan" />
                {b}
              </li>
            ))}
          </ul>
          {data.output.watch.length ? (
            <div className="mt-4 rounded-xl bg-white/[0.06] p-3">
              <p className="text-[11.5px] font-semibold tracking-wide text-white/50 uppercase">Watch next week</p>
              <ul className="mt-1.5 grid gap-1 text-[13px] text-white/85">
                {data.output.watch.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <ModelTag model={data.model} createdAt={data.createdAt} dark />
        </div>
      ) : (
        <div className="mt-4 flex flex-1 flex-col items-start justify-center gap-3">
          <p className="text-[14px] leading-relaxed text-white/75">
            {mode === "manual" ? "Get a five-point summary of this period built straight from the scores." : "Let Gemini read this period’s scores and notes and write you a five-point briefing."}
          </p>
          <Button variant="brand" size="sm" onClick={() => run(false)} disabled={pending}>
            {pending ? <Spinner /> : mode === "ai" ? <Sparkles className="size-4" /> : <SquarePen className="size-4" />} Write the briefing
          </Button>
        </div>
      )}
      <AiPrivacyNote mode={mode} dark className="mt-3" />
    </div>
  );
}

// ---------------------------------------------------------------- coaching
type Coaching = { summary: string; strengths: string[]; tips: string[]; focus: string; editedBy?: string; editedAt?: string };
type CoachingRow = { id: string; output: Coaching; model: string; createdAt: string; approvedAt: string | null; periodStart: string | null; periodEnd: string | null; createdByName: string | null };

export function CoachingPanel({ agentId, period, history, aiEnabled }: { agentId: string; period: Period; history: CoachingRow[]; aiEnabled: boolean }) {
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<SummaryMode>("manual");
  const [editing, setEditing] = useState(false);
  const toast = useToast();
  const router = useRouter();
  const latest = history[0];

  const generate = (force: boolean) =>
    start(async () => {
      const res = await coachingAction(agentId, period, force, mode);
      if (!res.ok) return toast({ tone: "error", title: "Couldn’t write the coaching summary", body: res.error });
      setEditing(false);
      router.refresh();
    });
  const approve = (id: string, approved: boolean) =>
    start(async () => {
      const res = await approveSummaryAction(id, approved, agentId);
      if (!res.ok) return toast({ tone: "error", title: "Couldn’t update approval", body: res.error });
      toast({ tone: "ok", title: approved ? "Approved for sharing with the agent" : "Approval removed" });
      router.refresh();
    });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-brand" />
          <p className="text-[15px] font-semibold">Coaching summary</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SummaryModeToggle mode={mode} onChange={setMode} aiEnabled={aiEnabled} />
          <Button variant={latest ? "ghost" : "brand"} size="sm" onClick={() => generate(!!latest)} disabled={pending}>
            {pending ? <Spinner /> : latest ? <RefreshCw className="size-3.5" /> : mode === "ai" ? <Sparkles className="size-3.5" /> : <SquarePen className="size-3.5" />}
            {latest ? "Rewrite" : mode === "ai" ? "Write with AI" : "Summarise"}
          </Button>
        </div>
      </div>
      <AiPrivacyNote mode={mode} className="mt-2" />

      {latest && editing ? (
        <CoachingEditor row={latest} agentId={agentId} onDone={() => setEditing(false)} />
      ) : latest ? (
        <div className="mt-3">
          <p className="text-[14.5px] leading-relaxed text-ink">{latest.output.summary}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-meets-soft/70 p-3.5">
              <p className="text-[11.5px] font-bold tracking-wide text-meets uppercase">Strengths</p>
              <ul className="mt-1.5 grid gap-1 text-[13.5px] text-ink-2">
                {latest.output.strengths.map((s) => (
                  <li key={s}>• {s}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl bg-brand-50 p-3.5">
              <p className="text-[11.5px] font-bold tracking-wide text-brand-700 uppercase">Try this</p>
              <ul className="mt-1.5 grid gap-1 text-[13.5px] text-ink-2">
                {latest.output.tips.map((s) => (
                  <li key={s}>• {s}</li>
                ))}
              </ul>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[13px]">
              <span className="text-muted">Focus next: </span>
              <span className="font-semibold">{latest.output.focus}</span>
            </p>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
                <Pencil className="size-3.5" /> Edit
              </Button>
              {latest.approvedAt ? (
                <button type="button" onClick={() => approve(latest.id, false)} title="Remove approval">
                  <Badge tone="ok">✓ Approved</Badge>
                </button>
              ) : (
                <Button variant="outline" size="sm" onClick={() => approve(latest.id, true)} disabled={pending}>
                  Approve for the agent
                </Button>
              )}
            </div>
          </div>
          <p className="mt-2 text-[11.5px] text-faint">
            {latest.model === "rules" ? "Manual summary, built from the scores" : `AI-generated with ${latest.model}`} ·{" "}
            {new Date(latest.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            {latest.createdByName ? ` by ${latest.createdByName}` : ""}
            {latest.output.editedBy ? ` · edited by ${latest.output.editedBy}` : ""}
          </p>
          {history.length > 1 ? (
            <details className="mt-3 text-[13px]">
              <summary className="cursor-pointer font-semibold text-muted">Earlier summaries ({history.length - 1})</summary>
              <ul className="mt-2 grid gap-2">
                {history.slice(1).map((h) => (
                  <li key={h.id} className="rounded-xl bg-sunken/60 p-3 text-ink-2">
                    <p className="text-[11.5px] text-muted">
                      {new Date(h.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} · {h.model === "rules" ? "Manual" : "AI"}
                    </p>
                    <p className="mt-1">{h.output.summary}</p>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-[14px] text-muted">
          {mode === "manual"
            ? "Build a coaching note from this agent’s scores. You can edit it before approving."
            : "Gemini reads this agent’s scores and reviewer notes for the period and drafts a coaching note you can edit and approve."}
        </p>
      )}
    </div>
  );
}

function CoachingEditor({ row, agentId, onDone }: { row: CoachingRow; agentId: string; onDone: () => void }) {
  const [summary, setSummary] = useState(row.output.summary);
  const [strengths, setStrengths] = useState(row.output.strengths.join("\n"));
  const [tips, setTips] = useState(row.output.tips.join("\n"));
  const [focus, setFocus] = useState(row.output.focus);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const lines = (s: string) => s.split("\n").map((x) => x.replace(/^[•\-*]\s*/, "").trim()).filter(Boolean);
  return (
    <div className="mt-3 grid gap-3">
      <FormError message={error} />
      <label className="grid gap-1 text-[12.5px] font-semibold text-ink-2">
        Summary
        <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={4} className="text-[14px] font-normal" />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-[12.5px] font-semibold text-ink-2">
          Strengths (one per line)
          <Textarea value={strengths} onChange={(e) => setStrengths(e.target.value)} rows={3} className="text-[13.5px] font-normal" />
        </label>
        <label className="grid gap-1 text-[12.5px] font-semibold text-ink-2">
          Tips (one per line, up to three)
          <Textarea value={tips} onChange={(e) => setTips(e.target.value)} rows={3} className="text-[13.5px] font-normal" />
        </label>
      </div>
      <label className="grid gap-1 text-[12.5px] font-semibold text-ink-2">
        Focus next
        <Input value={focus} onChange={(e) => setFocus(e.target.value)} className="font-normal" />
      </label>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const res = await editCoachingAction(row.id, agentId, { summary, strengths: lines(strengths).slice(0, 4), tips: lines(tips).slice(0, 3), focus });
              if (!res.ok) return setError(res.error);
              toast({ tone: "ok", title: "Coaching summary saved", body: "Approve it again when you’re happy." });
              onDone();
              router.refresh();
            })
          }
        >
          {pending ? <Spinner /> : null} Save changes
        </Button>
        <Button variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- themes
type Theme = { title: string; count: number; criterion: string; advice: string };

export function ThemesCard({ period, aiEnabled }: { period: Period; aiEnabled: boolean }) {
  const [data, setData] = useState<{ themes: Theme[]; model: string; createdAt: string } | null>(null);
  const [mode, setMode] = useState<SummaryMode>("manual");
  const [pending, start] = useTransition();
  const toast = useToast();
  const run = (force: boolean) =>
    start(async () => {
      const res = await themesAction(period, force, mode);
      if (!res.ok) return toast({ tone: "error", title: "Couldn’t find themes", body: res.error });
      setData({ themes: (res.data.output as { themes: Theme[] }).themes, model: res.data.model, createdAt: res.data.createdAt });
    });
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-md text-[14px] text-muted">
          {mode === "manual" ? "Groups the missed checks in this period into themes, most frequent first." : "Gemini reads every reviewer note on a missed check and groups them into recurring themes, with a training idea for each."}
        </p>
        <div className="flex items-center gap-2">
          <SummaryModeToggle mode={mode} onChange={setMode} aiEnabled={aiEnabled} />
          <Button variant={data ? "ghost" : "brand"} size="sm" onClick={() => run(!!data)} disabled={pending}>
            {pending ? <Spinner /> : mode === "ai" ? <Sparkles className="size-3.5" /> : <SquarePen className="size-3.5" />} {data ? "Refresh" : "Find themes"}
          </Button>
        </div>
      </div>
      <AiPrivacyNote mode={mode} className="mt-2" />
      {data ? (
        <>
          <ol className="mt-4 grid gap-3 md:grid-cols-2">
            {data.themes.map((t) => (
              <li key={t.title} className="rounded-2xl border border-line p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold">{t.title}</p>
                  <Badge tone="warn">{t.count}×</Badge>
                </div>
                <p className="mt-1 text-[12.5px] text-muted">{t.criterion}</p>
                <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">{t.advice}</p>
              </li>
            ))}
          </ol>
          <ModelTag model={data.model} createdAt={data.createdAt} />
        </>
      ) : null}
    </div>
  );
}
