"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOffline } from "next/offline";
import { ArrowLeft, Check, CircleCheck, CloudOff, Info, Keyboard, Sparkles, TriangleAlert, Undo2 } from "lucide-react";
import { scoreEvaluation, type Answer, type Band } from "@/lib/scoring/engine";
import { CALL_TYPES, CALL_TYPE_HINTS } from "@/lib/framework/tmq";
import { formatCallTime, formatDuration } from "@/lib/dates";
import { cn, pct } from "@/lib/utils";
import { polishNotesAction, saveDraftAction, submitReviewAction, type ReviewPayloadInput } from "@/app/actions/reviews";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
import { Badge, BandPill, Card } from "@/components/ui/surface";
import { Dialog, Spinner, useToast } from "@/components/ui/client";

type CallType = (typeof CALL_TYPES)[number]["value"];
type CriterionView = {
  id: string;
  key: string;
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
type AnswerState = { answer: Answer; note: string; atTime: string };

export type StudioData = {
  id: string;
  status: "queued" | "draft" | "submitted";
  mode: "new" | "amend";
  updatedAt: string;
  call: {
    agentName: string;
    agentStatus: string;
    siteName: string;
    siteCode: string;
    teamCode: string | null;
    callAt: string | null;
    durationSec: number | null;
    callerMasked: string | null;
    queue: string | null;
    extension: string | null;
    callType: CallType;
    anonymousCaller: boolean;
    reviewerName: string;
    score: number | null;
    band: Band | null;
  };
  settings: { kpiPass: number; weights: { yes: number; partial: number; no: number }; scoreFloor: number | null };
  versionName: string;
  sections: { key: string; name: string; shortName: string; criteria: CriterionView[] }[];
  issues: { id: string; shortName: string; title: string; description: string }[];
  answers: Record<string, AnswerState>;
  selectedIssues: { issueId: string; note: string }[];
  feedback: string;
  strengths: string;
  improvements: string;
  aiEnabled: boolean;
};

const OPTIONS: { value: Answer; label: string; key: string; on: string }[] = [
  { value: "yes", label: "Yes", key: "1", on: "bg-meets text-white shadow-sm" },
  { value: "partial", label: "Partial", key: "2", on: "bg-below text-ink shadow-sm" },
  { value: "no", label: "No", key: "3", on: "bg-fail text-white shadow-sm" },
  { value: "na", label: "N/A", key: "4", on: "bg-ink-2 text-white shadow-sm" },
];

type Persisted = { callType: CallType; answers: Record<string, AnswerState>; issues: Record<string, string>; feedback: string; strengths: string; improvements: string; at: number };

export function ReviewStudio({ data }: { data: StudioData }) {
  const router = useRouter();
  const toast = useToast();
  const offline = useOffline();
  const storageKey = `tmq:review:${data.id}`;
  const criteria = useMemo(() => data.sections.flatMap((s) => s.criteria.map((c) => ({ ...c, sectionKey: s.key }))), [data.sections]);

  const [callType, setCallType] = useState<CallType>(data.call.callType);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>(data.answers);
  const [issues, setIssues] = useState<Record<string, string>>(() => Object.fromEntries(data.selectedIssues.map((i) => [i.issueId, i.note])));
  const [feedback, setFeedback] = useState(data.feedback);
  const [strengths, setStrengths] = useState(data.strengths);
  const [improvements, setImprovements] = useState(data.improvements);
  const [amendReason, setAmendReason] = useState("");
  const [focus, setFocus] = useState(0);
  const [openRubric, setOpenRubric] = useState<string | null>(null);
  const [problems, setProblems] = useState<Set<string>>(new Set());
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [showKeys, setShowKeys] = useState(false);
  const [submitting, startSubmit] = useTransition();
  const [polishing, setPolishing] = useState(false);
  const [undoFeedback, setUndoFeedback] = useState<string | null>(null);
  const dirty = useRef(false);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const noteRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  // Restore unsaved work kept on this device (e.g. after losing the connection).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as Persisted;
      if (saved.at > Date.parse(data.updatedAt) + 1000 && data.mode === "new") {
        const t = setTimeout(() => {
          setCallType(saved.callType);
          setAnswers(saved.answers);
          setIssues(saved.issues);
          setFeedback(saved.feedback);
          setStrengths(saved.strengths);
          setImprovements(saved.improvements);
          dirty.current = true;
          toast({ tone: "info", title: "Restored your unsaved changes", body: "They were kept on this device while you were away." });
        }, 0);
        return () => clearTimeout(t);
      }
    } catch {
      /* storage unavailable */
    }
  }, [storageKey, data.updatedAt, data.mode, toast]);

  const payload = useCallback(
    (): ReviewPayloadInput => ({
      callType,
      answers: Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, { answer: v.answer, note: v.note.trim() || null, atTime: v.atTime.trim() || null }])),
      issues: Object.entries(issues).map(([issueId, note]) => ({ issueId, note: note.trim() || null })),
      feedback,
      strengths,
      improvements,
    }),
    [callType, answers, issues, feedback, strengths, improvements],
  );

  // Keep a local copy on every change; autosave drafts to the server after a short pause.
  useEffect(() => {
    if (!dirty.current) return;
    try {
      const snapshot: Persisted = { callType, answers, issues, feedback, strengths, improvements, at: Date.now() };
      localStorage.setItem(storageKey, JSON.stringify(snapshot));
    } catch {
      /* ignore */
    }
    if (data.mode !== "new") return;
    const t = setTimeout(async () => {
      setSaveState("saving");
      const res = await saveDraftAction(data.id, payload());
      if (res.ok) {
        setSaveState("saved");
        setSavedAt(new Date());
      } else setSaveState("error");
    }, 1200);
    return () => clearTimeout(t);
  }, [callType, answers, issues, feedback, strengths, improvements, data.id, data.mode, storageKey, payload]);

  const touch = () => {
    dirty.current = true;
  };

  const setAnswer = useCallback(
    (cid: string, answer: Answer) => {
      touch();
      setAnswers((a) => ({ ...a, [cid]: { ...(a[cid] ?? { note: "", atTime: "" }), answer } }));
      setProblems((p) => {
        if (!p.has(cid)) return p;
        const n = new Set(p);
        n.delete(cid);
        return n;
      });
    },
    [],
  );

  function changeCallType(next: CallType) {
    touch();
    setCallType(next);
    setAnswers((prev) => {
      const out = { ...prev };
      for (const c of criteria) {
        if (!c.applicableCallTypes.length) continue;
        const applies = c.applicableCallTypes.includes(next);
        const cur = out[c.id];
        if (!cur) continue;
        if (applies && cur.answer === "na" && !cur.note) out[c.id] = { ...cur, answer: "yes" };
        if (!applies && cur.answer === "yes" && !cur.note) out[c.id] = { ...cur, answer: "na" };
      }
      return out;
    });
  }

  const result = useMemo(
    () =>
      scoreEvaluation(
        criteria.map((c) => ({ id: c.id, sectionKey: c.sectionKey, title: c.title, allowPartial: c.allowPartial, allowNa: c.allowNa, penaltyNo: c.penaltyNo, penaltyPartial: c.penaltyPartial })),
        Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, v.answer])),
        Object.keys(issues).length,
        data.settings,
      ),
    [criteria, answers, issues, data.settings],
  );

  function validate(): string | null {
    const bad = new Set<string>();
    for (const c of criteria) {
      const a = answers[c.id];
      if (!a) bad.add(c.id);
      else if (a.answer === "no" && !a.note.trim()) bad.add(c.id);
    }
    setProblems(bad);
    if (bad.size) {
      const idx = criteria.findIndex((c) => bad.has(c.id));
      setFocus(idx);
      rowRefs.current[idx]?.scrollIntoView({ block: "center", behavior: "smooth" });
      const c = criteria[idx];
      return answers[c.id] ? `Add a short note for the “No” on “${c.title}”.` : `Answer “${c.title}”.`;
    }
    const issueMissing = Object.entries(issues).find(([, n]) => !n.trim());
    if (issueMissing) return `Describe what happened for “${data.issues.find((i) => i.id === issueMissing[0])?.title}”.`;
    if (data.mode === "amend" && amendReason.trim().length < 5) return "Say briefly why you’re changing this submitted review.";
    return null;
  }

  const submit = useCallback(() => {
    const problem = validate();
    if (problem) {
      toast({ tone: "error", title: "Almost there", body: problem });
      return;
    }
    startSubmit(async () => {
      const res = await submitReviewAction(data.id, payload(), data.mode === "amend" ? amendReason : null);
      if (!res.ok) {
        toast({ tone: "error", title: "Not submitted yet", body: res.error });
        return;
      }
      try {
        localStorage.removeItem(storageKey);
      } catch {}
      const bandLabel = res.data.band === "perfect" ? "Perfect" : res.data.band === "meets" ? "Meets KPI" : res.data.band === "below" ? "Below KPI" : "Fail";
      toast({ tone: "ok", title: data.mode === "amend" ? "Review updated" : `Scored ${pct(res.data.score, 2)} · ${bandLabel}`, body: res.data.nextId ? "Opening your next call…" : undefined });
      if (data.mode === "amend") router.push(`/evaluations/${data.id}`);
      else router.push(res.data.nextId ? `/qa/review/${res.data.nextId}` : "/qa");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload, amendReason, data.id, data.mode, storageKey]);

  // Keyboard: 1–4 answer the focused check, ↑/↓ (or j/k) move, Ctrl/⌘+Enter submits, ? shows help.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        submit();
        return;
      }
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "?") {
        setShowKeys(true);
        return;
      }
      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        setFocus((f) => {
          const n = Math.min(criteria.length - 1, f + 1);
          rowRefs.current[n]?.scrollIntoView({ block: "nearest" });
          return n;
        });
        return;
      }
      if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        setFocus((f) => {
          const n = Math.max(0, f - 1);
          rowRefs.current[n]?.scrollIntoView({ block: "nearest" });
          return n;
        });
        return;
      }
      const opt = OPTIONS.find((o) => o.key === e.key);
      if (opt) {
        const c = criteria[focus];
        if (!c) return;
        if ((opt.value === "partial" && !c.allowPartial) || (opt.value === "na" && !c.allowNa)) return;
        e.preventDefault();
        setAnswer(c.id, opt.value);
        if (opt.value === "no" || opt.value === "partial") setTimeout(() => noteRefs.current[c.id]?.focus(), 30);
        else
          setFocus((f) => {
            const n = Math.min(criteria.length - 1, f + 1);
            rowRefs.current[n]?.scrollIntoView({ block: "nearest" });
            return n;
          });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [criteria, focus, setAnswer, submit]);

  async function tidyFeedback() {
    if (!feedback.trim()) {
      toast({ tone: "info", title: "Write a few words first", body: "Jot your rough notes, then let AI tidy them." });
      return;
    }
    setPolishing(true);
    const missed = criteria.filter((c) => answers[c.id]?.answer === "no" || answers[c.id]?.answer === "partial").map((c) => c.title);
    const res = await polishNotesAction(feedback, missed);
    setPolishing(false);
    if (!res.ok) {
      toast({ tone: "error", title: "AI couldn’t help this time", body: res.error });
      return;
    }
    setUndoFeedback(feedback);
    touch();
    setFeedback(res.data);
  }

  const answeredNo = criteria.filter((c) => answers[c.id]?.answer === "no").length;
  const answeredPartial = criteria.filter((c) => answers[c.id]?.answer === "partial").length;
  let rowIndex = -1;

  const saveLabel = offline ? (
    <span className="inline-flex items-center gap-1.5 text-below-ink">
      <CloudOff className="size-3.5" /> Offline · kept on this device
    </span>
  ) : saveState === "saving" ? (
    <span className="inline-flex items-center gap-1.5">
      <Spinner className="size-3.5" /> Saving…
    </span>
  ) : saveState === "saved" && savedAt ? (
    <span className="inline-flex items-center gap-1.5">
      <Check className="size-3.5 text-meets" /> Draft saved {savedAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
    </span>
  ) : saveState === "error" ? (
    <span className="text-fail">Couldn’t save the draft — it’s kept on this device</span>
  ) : data.mode === "amend" ? (
    <span>Changing a submitted review</span>
  ) : (
    <span>Drafts save automatically</span>
  );

  return (
    <div className="pb-24 lg:pb-0">
      {/* Call header */}
      <Card className="sticky top-14 z-30 mb-6 border-line/80 bg-surface/95 p-4 backdrop-blur lg:top-3">
        <div className="flex flex-wrap items-center gap-4">
          <Link href={data.mode === "amend" ? `/evaluations/${data.id}` : "/qa"} className="grid size-9 place-items-center rounded-full text-muted hover:bg-sunken hover:text-ink" aria-label="Back">
            <ArrowLeft className="size-5" />
          </Link>
          <div className="grid size-11 shrink-0 place-items-center rounded-full bg-ink text-[13px] font-bold text-white">{data.call.siteCode}</div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-[18px] font-bold">{data.call.agentName}</h1>
              {data.call.agentStatus === "pending" ? <Badge tone="warn">Pending agent</Badge> : null}
              {data.mode === "amend" ? <Badge tone="brand">Editing submitted review</Badge> : null}
            </div>
            <p className="text-[13px] text-muted">
              {data.call.siteName}
              {data.call.teamCode ? ` · ${data.call.teamCode}` : ""} · {formatCallTime(data.call.callAt ? new Date(data.call.callAt) : null, true)} · {formatDuration(data.call.durationSec)}
              {data.call.queue ? ` · Queue ${data.call.queue}` : ""}
              {data.call.callerMasked ? ` · ${data.call.callerMasked}` : ""}
            </p>
          </div>
          <div className="hidden text-right text-[12.5px] text-muted sm:block">{saveLabel}</div>
          <Button variant="brand" onClick={submit} disabled={submitting} className="hidden lg:inline-flex">
            {submitting ? <Spinner /> : <CircleCheck className="size-[18px]" />}
            {data.mode === "amend" ? "Save changes" : "Submit review"}
          </Button>
        </div>
        <div className="scrollbar-thin mt-3 flex gap-2 overflow-x-auto pb-0.5" role="radiogroup" aria-label="Call type">
          {CALL_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              role="radio"
              aria-checked={callType === t.value}
              title={CALL_TYPE_HINTS[t.value]}
              onClick={() => changeCallType(t.value)}
              className={cn(
                "shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition",
                callType === t.value ? "border-ink bg-ink text-white" : "border-line-strong text-ink-2 hover:border-ink",
              )}
            >
              {t.label}
            </button>
          ))}
          {data.call.anonymousCaller ? <Badge tone="warn" className="shrink-0 self-center">Withheld caller: was a contact number taken?</Badge> : null}
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_370px]">
        {/* Criteria */}
        <div className="grid content-start gap-5">
          {data.sections.map((s) => {
            const sectionScore = result.sections[s.key];
            return (
              <Card key={s.key} className="overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-sunken/50 px-5 py-3">
                  <div>
                    <h2 className="text-[15px] font-bold">{s.name}</h2>
                    <p className="text-[12.5px] text-muted">{s.criteria.length} checks</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold tabular text-ink-2">{sectionScore === null ? "Not scored" : pct(sectionScore)}</span>
                    <button
                      type="button"
                      className="rounded-full border border-line-strong bg-surface px-3 py-1 text-[12px] font-semibold text-ink-2 hover:border-meets hover:text-meets"
                      onClick={() => {
                        touch();
                        setAnswers((a) => {
                          const out = { ...a };
                          for (const c of s.criteria) if (out[c.id]?.answer !== "na") out[c.id] = { ...(out[c.id] ?? { note: "", atTime: "" }), answer: "yes" };
                          return out;
                        });
                      }}
                    >
                      All Yes
                    </button>
                  </div>
                </div>
                <div>
                  {s.criteria.map((c) => {
                    rowIndex++;
                    const idx = rowIndex;
                    const a = answers[c.id];
                    const isFocus = focus === idx;
                    const needsNote = a?.answer === "no" || a?.answer === "partial";
                    const problem = problems.has(c.id);
                    return (
                      <div
                        key={c.id}
                        ref={(el) => {
                          rowRefs.current[idx] = el;
                        }}
                        onClick={() => setFocus(idx)}
                        className={cn(
                          "border-b border-line px-5 py-3.5 transition-colors last:border-0",
                          isFocus && "bg-brand-50/60 shadow-[inset_3px_0_0_var(--color-brand)]",
                          problem && "bg-fail-soft/60 shadow-[inset_3px_0_0_var(--color-fail)]",
                        )}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex min-w-0 flex-1 items-start gap-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenRubric((o) => (o === c.id ? null : c.id));
                              }}
                              className={cn("mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-muted hover:bg-brand-50 hover:text-brand-700", openRubric === c.id && "bg-brand-50 text-brand-700")}
                              aria-expanded={openRubric === c.id}
                              aria-label={`What good looks like: ${c.title}`}
                              title="What good looks like"
                            >
                              <Info className="size-4" />
                            </button>
                            <div className="min-w-0">
                              <p className="text-[14.5px] leading-snug font-semibold" id={`c-${c.id}`}>
                                {c.title}
                              </p>
                              {c.penaltyNo > 0 ? (
                                <p className="mt-0.5 text-[12px] font-medium text-fail">
                                  Critical · No −{c.penaltyNo}
                                  {c.penaltyPartial ? `, Partial −${c.penaltyPartial}` : ""}
                                </p>
                              ) : null}
                            </div>
                          </div>
                          <div role="radiogroup" aria-labelledby={`c-${c.id}`} className="inline-flex shrink-0 rounded-xl bg-sunken p-1">
                            {OPTIONS.map((o) => {
                              const disabled = (o.value === "partial" && !c.allowPartial) || (o.value === "na" && !c.allowNa);
                              const on = a?.answer === o.value;
                              return (
                                <button
                                  key={o.value}
                                  type="button"
                                  role="radio"
                                  aria-checked={on}
                                  disabled={disabled}
                                  title={disabled ? "Not an option for this check" : `${o.label} (${o.key})`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setFocus(idx);
                                    setAnswer(c.id, o.value);
                                    if (o.value === "no" || o.value === "partial") setTimeout(() => noteRefs.current[c.id]?.focus(), 30);
                                  }}
                                  className={cn(
                                    "min-w-[52px] rounded-lg px-2.5 py-1.5 text-[13px] font-semibold transition",
                                    on ? o.on : "text-muted hover:bg-surface hover:text-ink",
                                    disabled && "cursor-not-allowed opacity-30 line-through hover:bg-transparent",
                                  )}
                                >
                                  {o.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {openRubric === c.id ? (
                          <div className="animate-rise mt-3 grid gap-3 rounded-2xl border border-brand-100 bg-surface p-4 text-[13.5px] leading-relaxed">
                            <p className="text-ink-2">{c.description}</p>
                            <div className="grid gap-2 md:grid-cols-3">
                              {[
                                ["Yes", c.yesDesc, "bg-meets-soft"],
                                ["Partial", c.allowPartial ? c.partialDesc : "Not used for this check — a partly completed step counts as No.", "bg-below-soft"],
                                ["No", c.noDesc, "bg-fail-soft"],
                              ].map(([label, text, bg]) => (
                                <div key={label} className={cn("rounded-xl p-3", bg)}>
                                  <p className="text-[12px] font-bold tracking-wide uppercase">{label}</p>
                                  <p className="mt-1 text-[13px] text-ink-2">{text ?? "—"}</p>
                                </div>
                              ))}
                            </div>
                            {c.markerNotes ? (
                              <p className="rounded-xl bg-brand-50 px-3 py-2 text-[13px] text-brand-900">
                                <span className="font-semibold">Marker note: </span>
                                {c.markerNotes}
                              </p>
                            ) : null}
                          </div>
                        ) : null}

                        {needsNote ? (
                          <div className="animate-rise mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_110px]">
                            <Textarea
                              ref={(el) => {
                                noteRefs.current[c.id] = el;
                              }}
                              value={a.note}
                              rows={1}
                              onChange={(e) => {
                                touch();
                                const v = e.target.value;
                                setAnswers((x) => ({ ...x, [c.id]: { ...x[c.id], note: v } }));
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Escape") (e.target as HTMLTextAreaElement).blur();
                              }}
                              placeholder={a.answer === "no" ? "What happened? (required, no customer details)" : "What happened? (optional, no customer details)"}
                              className={cn("min-h-11 resize-y py-2.5 text-[13.5px]", problem && !a.note.trim() && "border-fail")}
                              aria-label={`Note for ${c.title}`}
                            />
                            <input
                              value={a.atTime}
                              onChange={(e) => {
                                touch();
                                const v = e.target.value.replace(/[^\d:]/g, "").slice(0, 8);
                                setAnswers((x) => ({ ...x, [c.id]: { ...x[c.id], atTime: v } }));
                              }}
                              placeholder="at 01:12"
                              inputMode="numeric"
                              className="h-11 rounded-xl border border-line-strong bg-surface px-3 text-[13.5px] focus:border-brand focus:ring-4 focus:ring-brand/15 focus:outline-none"
                              aria-label={`Time in call for ${c.title}`}
                            />
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>

        {/* Live panel */}
        <div className="grid content-start gap-5 xl:sticky xl:top-40 xl:max-h-[calc(100vh-11rem)] xl:overflow-y-auto xl:pr-1 scrollbar-thin">
          <Card className="p-5">
            <p className="text-[12px] font-semibold tracking-[0.08em] text-muted uppercase">Live score</p>
            <div className="mt-1 flex items-end justify-between gap-3">
              <p className={cn("text-[52px] leading-none font-semibold tracking-[-0.03em] tabular", result.band === "fail" && "text-fail")}>{result.score === null ? "—" : pct(result.score, 2)}</p>
              <BandPill band={result.band} autoFail={result.autoFail} />
            </div>
            <p className="mt-2 font-mono text-[12px] text-muted">
              {result.autoFail
                ? "Zero-tolerance issue selected: the call scores 0%."
                : `${result.applicable} applicable · ${result.points} pts − ${result.penalty} deducted`}
            </p>
            <div className="mt-4 grid gap-2.5">
              {data.sections.map((s) => {
                const v = result.sections[s.key];
                return (
                  <div key={s.key}>
                    <div className="flex justify-between text-[12.5px]">
                      <span className="text-ink-2">{s.shortName}</span>
                      <span className="font-semibold tabular">{v === null ? "N/A" : pct(v)}</span>
                    </div>
                    <div className={cn("mt-1 h-1.5 overflow-hidden rounded-full", v === null ? "bg-sunken" : v > data.settings.kpiPass ? "bg-meets-soft" : "bg-below-soft")}>
                      <div className={cn("h-full rounded-full transition-[width] duration-300", v === null ? "" : v > data.settings.kpiPass ? "bg-meets" : "bg-below")} style={{ width: `${v ?? 0}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
            {result.deductions.length ? (
              <ul className="mt-4 grid gap-1 rounded-xl bg-fail-soft/60 p-3">
                {result.deductions.map((d) => (
                  <li key={d.criterionId} className="text-[12.5px] text-ink-2">
                    <span className="font-bold text-fail">−{d.amount}</span> {d.answer === "no" ? "No" : "Partial"} on {d.title}
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="mt-3 text-[12px] text-muted">
              {answeredPartial} partial · {answeredNo} no · KPI line above {data.settings.kpiPass}%
            </p>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-[14px] font-bold">Zero tolerance</p>
              {Object.keys(issues).length ? <Badge tone="danger">{Object.keys(issues).length} selected</Badge> : <span className="text-[12px] text-muted">Any one forces 0%</span>}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {data.issues.map((i) => {
                const on = i.id in issues;
                return (
                  <button
                    key={i.id}
                    type="button"
                    aria-pressed={on}
                    title={i.description}
                    onClick={() => {
                      touch();
                      setIssues((cur) => {
                        const n = { ...cur };
                        if (on) delete n[i.id];
                        else n[i.id] = "";
                        return n;
                      });
                    }}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition",
                      on ? "border-fail bg-fail text-white" : "border-line-strong text-ink-2 hover:border-fail hover:text-fail",
                    )}
                  >
                    {i.shortName}
                  </button>
                );
              })}
            </div>
            {Object.keys(issues).length ? (
              <div className="mt-3 grid gap-2">
                {Object.entries(issues).map(([id, note]) => {
                  const meta = data.issues.find((x) => x.id === id);
                  return (
                    <div key={id} className="rounded-xl border border-fail/30 bg-fail-soft/50 p-3">
                      <p className="flex items-center gap-1.5 text-[12.5px] font-bold text-fail">
                        <TriangleAlert className="size-3.5" /> {meta?.title}
                      </p>
                      <Textarea
                        value={note}
                        rows={2}
                        onChange={(e) => {
                          touch();
                          const v = e.target.value;
                          setIssues((cur) => ({ ...cur, [id]: v }));
                        }}
                        placeholder="Describe exactly what happened (required)"
                        className="mt-2 min-h-16 bg-surface text-[13.5px]"
                        aria-label={`What happened: ${meta?.title}`}
                      />
                    </div>
                  );
                })}
              </div>
            ) : null}
          </Card>

          <Card className="grid gap-3 p-5">
            <p className="text-[14px] font-bold">Feedback for the agent</p>
            <label className="grid gap-1 text-[12.5px] font-semibold text-ink-2">
              What went well
              <Textarea value={strengths} onChange={(e) => (touch(), setStrengths(e.target.value))} rows={2} className="min-h-14 text-[13.5px] font-normal" placeholder="e.g. Warm greeting and a clear recap" />
            </label>
            <label className="grid gap-1 text-[12.5px] font-semibold text-ink-2">
              To improve
              <Textarea value={improvements} onChange={(e) => (touch(), setImprovements(e.target.value))} rows={2} className="min-h-14 text-[13.5px] font-normal" placeholder="e.g. Confirm the pickup time before ending" />
            </label>
            <label className="grid gap-1 text-[12.5px] font-semibold text-ink-2">
              <span className="flex items-center justify-between">
                Overall comment
                {data.aiEnabled ? (
                  <span className="flex items-center gap-1">
                    {undoFeedback !== null ? (
                      <button type="button" className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] text-muted hover:bg-sunken" onClick={() => (setFeedback(undoFeedback), setUndoFeedback(null))}>
                        <Undo2 className="size-3" /> Undo
                      </button>
                    ) : null}
                    <button type="button" onClick={tidyFeedback} disabled={polishing} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-0.5 text-[12px] font-semibold text-brand-700 hover:bg-brand-100 disabled:opacity-60">
                      {polishing ? <Spinner className="size-3" /> : <Sparkles className="size-3" />} Tidy with AI
                    </button>
                  </span>
                ) : null}
              </span>
              <Textarea value={feedback} onChange={(e) => (touch(), setFeedback(e.target.value))} rows={3} className="min-h-20 text-[13.5px] font-normal" placeholder="Rough notes are fine" />
              {data.aiEnabled ? (
                <span className="text-[11.5px] leading-snug font-normal text-muted">
                  Tidy with AI removes customer numbers, addresses, postcodes and emails before sending to Gemini, so UK GDPR compliance is maintained.
                </span>
              ) : null}
            </label>
            {data.mode === "amend" ? (
              <label className="grid gap-1 text-[12.5px] font-semibold text-ink-2">
                Why are you changing this review?
                <Textarea value={amendReason} onChange={(e) => setAmendReason(e.target.value)} rows={2} className="min-h-14 border-brand-200 text-[13.5px] font-normal" placeholder="e.g. Re-listened and found a GDPR breach" />
              </label>
            ) : null}
            <Button variant="brand" size="lg" onClick={submit} disabled={submitting} className="mt-1 w-full">
              {submitting ? <Spinner /> : <CircleCheck className="size-[18px]" />}
              {data.mode === "amend" ? "Save changes" : "Submit review"}
            </Button>
            <button type="button" onClick={() => setShowKeys(true)} className="inline-flex items-center justify-center gap-1.5 text-[12.5px] text-muted hover:text-ink">
              <Keyboard className="size-3.5" /> Keyboard shortcuts <kbd className="rounded bg-sunken px-1.5 text-[11px]">?</kbd>
            </button>
          </Card>
          <p className="px-1 text-[12px] text-faint">
            Marked against {data.versionName}.
          </p>
        </div>
      </div>

      {/* Mobile submit bar */}
      <div className="no-print fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-3 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center gap-2">
          <span className="text-[22px] font-semibold tabular">{result.score === null ? "—" : pct(result.score, 1)}</span>
          <BandPill band={result.band} autoFail={result.autoFail} size="sm" />
        </div>
        <Button variant="brand" onClick={submit} disabled={submitting}>
          {submitting ? <Spinner /> : null}
          {data.mode === "amend" ? "Save" : "Submit"}
        </Button>
      </div>

      <Dialog open={showKeys} onClose={() => setShowKeys(false)} title="Keyboard shortcuts" description="Score a whole call without touching the mouse.">
        <ul className="grid gap-2 text-[14px]">
          {[
            ["1  2  3  4", "Yes · Partial · No · N/A for the highlighted check"],
            ["↑ ↓ or k j", "Move between checks"],
            ["Esc", "Leave a note field"],
            ["Ctrl + Enter", "Submit the review"],
            ["?", "Show this help"],
          ].map(([k, v]) => (
            <li key={k} className="flex items-center justify-between gap-4 rounded-xl bg-sunken/60 px-3 py-2">
              <kbd className="font-mono text-[13px] font-semibold">{k}</kbd>
              <span className="text-right text-muted">{v}</span>
            </li>
          ))}
        </ul>
      </Dialog>
    </div>
  );
}
