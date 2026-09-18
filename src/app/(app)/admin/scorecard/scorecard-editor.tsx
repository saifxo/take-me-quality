"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, FlaskConical, Plus, Rocket, Trash } from "lucide-react";
import {
  createDraftAction,
  discardDraftAction,
  publishDraftAction,
  removeIssueAction,
  saveCriterionAction,
  saveDraftSettingsAction,
  saveIssueAction,
  whatIfAction,
} from "@/app/actions/admin";
import type { ScorecardSettings } from "@/db/schema";
import type { WhatIfResult } from "@/server/services/scorecard";
import { CALL_TYPES } from "@/lib/framework/tmq";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { Badge, Card, CardHeader } from "@/components/ui/surface";
import { Spinner, useToast } from "@/components/ui/client";
import { cn, pct } from "@/lib/utils";

type Crit = {
  id: string;
  title: string;
  description: string;
  yesDesc: string | null;
  partialDesc: string | null;
  noDesc: string | null;
  markerNotes: string | null;
  allowPartial: boolean;
  allowNa: boolean;
  penaltyNo: number;
  penaltyPartial: number;
  applicableCallTypes: string[];
};
export type EditorScorecard = {
  id: string;
  version: number;
  name: string;
  notes: string;
  settings: ScorecardSettings;
  sections: { key: string; name: string; criteria: Crit[] }[];
  issues: { id: string; shortName: string; title: string; description: string }[];
};

export function StartDraftButton() {
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  return (
    <Button
      variant="brand"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await createDraftAction();
          if (!res.ok) return toast({ tone: "error", title: "Couldn’t start a draft", body: res.error });
          router.refresh();
        })
      }
    >
      {pending ? <Spinner /> : null} Edit rules (start a draft)
    </Button>
  );
}

const num = (v: FormDataEntryValue | null) => Number(String(v ?? "").replace(",", "."));

export function ScorecardEditor({ draft }: { draft: EditorScorecard }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [floor, setFloor] = useState(draft.settings.scoreFloor !== null);
  const [preview, setPreview] = useState<WhatIfResult | null>(null);
  const [weeks, setWeeks] = useState(4);

  function saveSettings(fd: FormData) {
    setError(null);
    start(async () => {
      const res = await saveDraftSettingsAction(
        draft.id,
        {
          kpiPass: num(fd.get("kpiPass")),
          attentionShare: num(fd.get("attentionShare")),
          weeklyTarget: num(fd.get("weeklyTarget")),
          weights: { yes: num(fd.get("wYes")), partial: num(fd.get("wPartial")), no: num(fd.get("wNo")) },
          scoreFloor: floor ? num(fd.get("scoreFloor")) : null,
          editWindowHours: num(fd.get("editWindowHours")),
        },
        String(fd.get("name") ?? ""),
        String(fd.get("notes") ?? ""),
      );
      if (!res.ok) return setError(res.error);
      toast({ tone: "ok", title: "Draft settings saved" });
      setPreview(null);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-6">
      <Card className="border-below/40 bg-below-soft/30 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[15px] font-semibold">You’re editing draft v{draft.version}</p>
            <p className="text-[13.5px] text-muted">Nothing changes for reviewers until you publish. Preview the impact first.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              className="text-fail hover:bg-fail-soft"
              disabled={pending}
              onClick={() => {
                if (!confirm("Discard this draft and all its changes?")) return;
                start(async () => {
                  const res = await discardDraftAction(draft.id);
                  if (!res.ok) return toast({ tone: "error", title: "Couldn’t discard", body: res.error });
                  router.refresh();
                });
              }}
            >
              Discard draft
            </Button>
            <Button
              variant="primary"
              disabled={pending}
              onClick={() => {
                if (!confirm(`Publish ${draft.name}? New reviews will use these rules straight away.`)) return;
                start(async () => {
                  const res = await publishDraftAction(draft.id);
                  if (!res.ok) return toast({ tone: "error", title: "Couldn’t publish", body: res.error });
                  toast({ tone: "ok", title: `${draft.name} is now live` });
                  router.refresh();
                });
              }}
            >
              <Rocket className="size-4" /> Publish
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader title="Thresholds and points" />
          <form action={saveSettings} className="grid gap-4 px-5 pb-5">
            <FormError message={error} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Version name" htmlFor="name">
                <Input id="name" name="name" defaultValue={draft.name} />
              </Field>
              <Field label="KPI pass mark (%)" htmlFor="kpiPass" hint="Scores must be above this">
                <Input id="kpiPass" name="kpiPass" type="number" step="0.5" min={0} max={100} defaultValue={draft.settings.kpiPass} />
              </Field>
              <Field label="Needs attention above (% of calls below KPI)" htmlFor="attentionShare">
                <Input id="attentionShare" name="attentionShare" type="number" step="1" min={0} max={100} defaultValue={draft.settings.attentionShare} />
              </Field>
              <Field label="Weekly review target (calls per agent)" htmlFor="weeklyTarget">
                <Input id="weeklyTarget" name="weeklyTarget" type="number" min={1} max={100} defaultValue={draft.settings.weeklyTarget} />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Yes points" htmlFor="wYes">
                <Input id="wYes" name="wYes" type="number" step="0.1" defaultValue={draft.settings.weights.yes} />
              </Field>
              <Field label="Partial points" htmlFor="wPartial">
                <Input id="wPartial" name="wPartial" type="number" step="0.1" defaultValue={draft.settings.weights.partial} />
              </Field>
              <Field label="No points" htmlFor="wNo">
                <Input id="wNo" name="wNo" type="number" step="0.1" defaultValue={draft.settings.weights.no} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <label className="flex items-center gap-2 text-[13px] font-semibold text-ink-2">
                  <input type="checkbox" checked={floor} onChange={(e) => setFloor(e.target.checked)} className="size-4 accent-[#00a6eb]" /> Score floor
                </label>
                <Input name="scoreFloor" type="number" step="1" defaultValue={draft.settings.scoreFloor ?? 0} disabled={!floor} aria-label="Score floor (%)" />
                <p className="text-[12.5px] text-muted">Off = scores can go negative, as in the old workbook.</p>
              </div>
              <Field label="Reviewer edit window (hours)" htmlFor="editWindowHours">
                <Input id="editWindowHours" name="editWindowHours" type="number" min={0} max={720} defaultValue={draft.settings.editWindowHours} />
              </Field>
            </div>
            <Field label="What’s changing (shown in version history)" htmlFor="notes">
              <Textarea id="notes" name="notes" defaultValue={draft.notes} rows={2} className="min-h-16" />
            </Field>
            <Button type="submit" disabled={pending} className="w-fit">
              {pending ? <Spinner /> : null} Save settings
            </Button>
          </form>
        </Card>

        <Card className="bg-ink p-5 text-white">
          <div className="flex items-center gap-2">
            <FlaskConical className="size-5 text-cyan" />
            <p className="text-[15px] font-semibold">What-if preview</p>
          </div>
          <p className="mt-2 text-[13.5px] text-white/70">Re-score recent submitted reviews under this draft to see what would change before you publish.</p>
          <div className="mt-4 flex items-center gap-2">
            <Select value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} className="h-10 border-white/20 bg-white/10 text-[13.5px] text-white" aria-label="Weeks to re-score">
              {[1, 4, 8, 12].map((w) => (
                <option key={w} value={w} className="text-ink">
                  Last {w} {w === 1 ? "week" : "weeks"}
                </option>
              ))}
            </Select>
            <Button
              variant="brand"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await whatIfAction(draft.id, weeks);
                  if (!res.ok) return toast({ tone: "error", title: "Preview failed", body: res.error });
                  setPreview(res.data);
                })
              }
            >
              {pending ? <Spinner /> : null} Run preview
            </Button>
          </div>
          {preview ? (
            <div className="mt-5 grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                {(["current", "draft"] as const).map((k) => (
                  <div key={k} className="rounded-2xl bg-white/[0.07] p-4">
                    <p className="text-[12px] font-semibold tracking-wide text-white/60 uppercase">{k === "current" ? "As marked" : "Under this draft"}</p>
                    <p className="mt-1 text-[28px] font-semibold tabular">{pct(preview[k].avg)}</p>
                    <p className="text-[12.5px] text-white/70">
                      {preview[k].perfect + preview[k].meets} meet KPI · {preview[k].below} below · {preview[k].fail} fail
                    </p>
                  </div>
                ))}
              </div>
              <p className="text-[13.5px] text-white/80">
                {preview.current.evaluations} reviews re-scored · <b>{preview.changedBand}</b> would change band.
              </p>
            </div>
          ) : null}
        </Card>
      </div>

      <Card>
        <CardHeader title="Checks" description="Edit the wording reviewers see, the Yes/Partial/No descriptions, penalties and where each check applies." />
        <div className="grid gap-5 px-5 pb-5">
          {draft.sections.map((s) => (
            <div key={s.key}>
              <p className="mb-2 text-[14px] font-bold">{s.name}</p>
              <div className="grid gap-2">
                {s.criteria.map((c) => (
                  <CriterionEditor key={c.id} draftId={draft.id} c={c} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Zero-tolerance issues" description="Any one selected on a call forces 0%." />
        <div className="grid gap-2 px-5 pb-5">
          {draft.issues.map((i) => (
            <IssueEditor key={i.id} draftId={draft.id} issue={i} />
          ))}
          <IssueEditor draftId={draft.id} />
        </div>
      </Card>
    </div>
  );
}

function CriterionEditor({ draftId, c }: { draftId: string; c: Crit }) {
  const [open, setOpen] = useState(false);
  const [types, setTypes] = useState<string[]>(c.applicableCallTypes);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  return (
    <div className="rounded-2xl border border-line">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left" aria-expanded={open}>
        <span className="flex flex-wrap items-center gap-2 text-[14px] font-medium">
          {c.title}
          {c.penaltyNo ? <Badge tone="danger">No −{c.penaltyNo}</Badge> : null}
          {c.applicableCallTypes.length ? <Badge tone="brand">{c.applicableCallTypes.length} call types</Badge> : null}
        </span>
        <ChevronDown className={cn("size-4 text-muted transition", open && "rotate-180")} />
      </button>
      {open ? (
        <form
          action={(fd) =>
            start(async () => {
              setError(null);
              const text = (k: string) => (String(fd.get(k) ?? "").trim() ? String(fd.get(k)).trim() : null);
              const res = await saveCriterionAction(draftId, c.id, {
                title: String(fd.get("title") ?? ""),
                description: String(fd.get("description") ?? ""),
                yesDesc: text("yesDesc"),
                partialDesc: text("partialDesc"),
                noDesc: text("noDesc"),
                markerNotes: text("markerNotes"),
                allowPartial: fd.get("allowPartial") === "on",
                allowNa: fd.get("allowNa") === "on",
                penaltyNo: num(fd.get("penaltyNo")),
                penaltyPartial: num(fd.get("penaltyPartial")),
                applicableCallTypes: types as never,
              });
              if (!res.ok) return setError(res.error);
              toast({ tone: "ok", title: "Check updated in the draft" });
              router.refresh();
            })
          }
          className="grid gap-3 border-t border-line p-4"
        >
          <FormError message={error} />
          <Field label="Title" htmlFor={`t-${c.id}`}>
            <Input id={`t-${c.id}`} name="title" defaultValue={c.title} />
          </Field>
          <Field label="Guidance for markers" htmlFor={`d-${c.id}`}>
            <Textarea id={`d-${c.id}`} name="description" defaultValue={c.description} rows={3} />
          </Field>
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="What Yes looks like" htmlFor={`y-${c.id}`}>
              <Textarea id={`y-${c.id}`} name="yesDesc" defaultValue={c.yesDesc ?? ""} rows={3} />
            </Field>
            <Field label="What Partial looks like" htmlFor={`p-${c.id}`}>
              <Textarea id={`p-${c.id}`} name="partialDesc" defaultValue={c.partialDesc ?? ""} rows={3} />
            </Field>
            <Field label="What No looks like" htmlFor={`n-${c.id}`}>
              <Textarea id={`n-${c.id}`} name="noDesc" defaultValue={c.noDesc ?? ""} rows={3} />
            </Field>
          </div>
          <Field label="Marker note" htmlFor={`m-${c.id}`}>
            <Input id={`m-${c.id}`} name="markerNotes" defaultValue={c.markerNotes ?? ""} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Extra deduction for No" htmlFor={`pn-${c.id}`}>
              <Input id={`pn-${c.id}`} name="penaltyNo" type="number" step="0.5" min={0} max={10} defaultValue={c.penaltyNo} />
            </Field>
            <Field label="Extra deduction for Partial" htmlFor={`pp-${c.id}`}>
              <Input id={`pp-${c.id}`} name="penaltyPartial" type="number" step="0.5" min={0} max={10} defaultValue={c.penaltyPartial} />
            </Field>
            <label className="flex items-center gap-2 self-end pb-3 text-[13.5px]">
              <input type="checkbox" name="allowPartial" defaultChecked={c.allowPartial} className="size-4 accent-[#00a6eb]" /> Allow Partial
            </label>
            <label className="flex items-center gap-2 self-end pb-3 text-[13.5px]">
              <input type="checkbox" name="allowNa" defaultChecked={c.allowNa} className="size-4 accent-[#00a6eb]" /> Allow N/A
            </label>
          </div>
          <div>
            <p className="text-[13px] font-semibold text-ink-2">Only applies to these call types (none = every call)</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {CALL_TYPES.map((t) => {
                const on = types.includes(t.value);
                return (
                  <button
                    key={t.value}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setTypes((xs) => (on ? xs.filter((x) => x !== t.value) : [...xs, t.value]))}
                    className={cn("rounded-full border px-3 py-1 text-[12.5px] font-semibold", on ? "border-brand bg-brand text-white" : "border-line-strong text-ink-2")}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>
          <Button type="submit" size="sm" disabled={pending} className="w-fit">
            {pending ? <Spinner /> : null} Save check
          </Button>
        </form>
      ) : null}
    </div>
  );
}

function IssueEditor({ draftId, issue }: { draftId: string; issue?: { id: string; shortName: string; title: string; description: string } }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  if (!open) {
    return issue ? (
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-line px-4 py-2.5">
        <span className="text-[14px]">
          <b>{issue.title}</b> <span className="text-muted">· {issue.shortName}</span>
        </span>
        <span className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-fail hover:bg-fail-soft"
            aria-label={`Remove ${issue.title}`}
            onClick={() => {
              if (!confirm(`Remove “${issue.title}” from the draft?`)) return;
              start(async () => {
                const res = await removeIssueAction(draftId, issue.id);
                if (!res.ok) return toast({ tone: "error", title: "Couldn’t remove", body: res.error });
                router.refresh();
              });
            }}
          >
            <Trash className="size-3.5" />
          </Button>
        </span>
      </div>
    ) : (
      <Button variant="outline" size="sm" className="w-fit" onClick={() => setOpen(true)}>
        <Plus className="size-3.5" /> Add an issue
      </Button>
    );
  }
  return (
    <form
      action={(fd) =>
        start(async () => {
          setError(null);
          const res = await saveIssueAction(draftId, issue?.id ?? null, {
            shortName: String(fd.get("shortName") ?? ""),
            title: String(fd.get("title") ?? ""),
            description: String(fd.get("description") ?? ""),
          });
          if (!res.ok) return setError(res.error);
          setOpen(false);
          router.refresh();
        })
      }
      className="grid gap-3 rounded-2xl border border-brand-200 p-4"
    >
      <FormError message={error} />
      <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
        <Field label="Short name" htmlFor="shortName">
          <Input id="shortName" name="shortName" defaultValue={issue?.shortName} required />
        </Field>
        <Field label="Title" htmlFor="title">
          <Input id="title" name="title" defaultValue={issue?.title} required />
        </Field>
      </div>
      <Field label="Description" htmlFor="description">
        <Textarea id="description" name="description" defaultValue={issue?.description} rows={2} required />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? <Spinner /> : null} Save
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
