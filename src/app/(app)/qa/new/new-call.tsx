"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardPaste, Keyboard as KeyboardIcon, PenLine, TriangleAlert, Wand } from "lucide-react";
import { parsePortalText } from "@/lib/smart-paste";
import { formatCallTime, formatDuration, toLocalInputValue, weekLabel } from "@/lib/dates";
import { CALL_TYPES, CALL_TYPE_HINTS } from "@/lib/framework/tmq";
import { createManualAction, previewPasteAction, queuePasteAction } from "@/app/actions/reviews";
import type { PastePreviewRow } from "@/server/services/evaluations";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/form";
import { Badge, Card } from "@/components/ui/surface";
import { Spinner, useToast } from "@/components/ui/client";
import { cn } from "@/lib/utils";

type AgentOpt = { id: string; fullName: string; siteId: string; siteName: string; siteCode: string; status: string };
type SiteOpt = { id: string; name: string; code: string };

const EXAMPLE = `Queue\t561 / 1465 - Sarah Patel - SOL - DE\t07700900123\t2026-08-31 02:12:07\t00:01:25\t» Play « » Download « » Email «`;

export function NewCall({ initialTab, agents, sites }: { initialTab: "paste" | "manual"; agents: AgentOpt[]; sites: SiteOpt[] }) {
  const [tab, setTab] = useState(initialTab);
  return (
    <div className="grid gap-5">
      <div role="tablist" aria-label="How to add calls" className="inline-flex w-fit rounded-full bg-sunken p-1">
        {(
          [
            ["paste", "Paste from portal", ClipboardPaste],
            ["manual", "Enter manually", PenLine],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-5 py-2 text-[14px] font-semibold transition",
              tab === key ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink",
            )}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </div>
      {tab === "paste" ? <SmartPaste agents={agents} sites={sites} onManual={() => setTab("manual")} /> : <ManualEntry agents={agents} />}
    </div>
  );
}

// ---------------------------------------------------------------- smart paste
type RowChoice = { sig: string; include: boolean; agentId: string | "new" | ""; newName: string; newSiteId: string };
const rowSig = (r: { agentName: string; callAt: string; context: string }) => `${r.agentName}|${r.callAt}|${r.context}`;

function SmartPaste({ agents, sites, onManual }: { agents: AgentOpt[]; sites: SiteOpt[]; onManual: () => void }) {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<PastePreviewRow[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [choices, setChoices] = useState<Record<number, RowChoice>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const seq = useRef(0);

  // Instant, local parse for the count; the server preview adds roster matches and duplicate checks.
  const local = useMemo(() => parsePortalText(text), [text]);
  const localOk = local.filter((r) => r.ok).length;

  useEffect(() => {
    if (!text.trim()) {
      const t = setTimeout(() => setPreview(null), 0);
      return () => clearTimeout(t);
    }
    const id = ++seq.current;
    const t = setTimeout(async () => {
      setChecking(true);
      const res = await previewPasteAction(text);
      if (id !== seq.current) return;
      setChecking(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setError(null);
      setPreview(res.data);
      setChoices((prev) => {
        const next: Record<number, RowChoice> = {};
        for (const r of res.data) {
          if (!r.ok) continue;
          const sig = rowSig(r);
          // Keep what the reviewer chose only if it's the same call in the same place.
          const old = prev[r.index]?.sig === sig ? prev[r.index] : undefined;
          next[r.index] = old ?? {
            sig,
            include: r.context === "queue" && !r.duplicateOf && !!r.matchedAgent,
            agentId: r.matchedAgent?.id ?? "",
            newName: r.agentName,
            newSiteId: r.site?.id ?? "",
          };
        }
        return next;
      });
    }, 350);
    return () => clearTimeout(t);
  }, [text]);

  const okRows = (preview ?? []).filter((r): r is Extract<PastePreviewRow, { ok: true }> => r.ok);
  const selected = okRows.filter((r) => choices[r.index]?.include);
  const blockers = selected.filter((r) => {
    const c = choices[r.index];
    return !c.agentId || (c.agentId === "new" && (!c.newName.trim() || !c.newSiteId));
  });

  function update(index: number, patch: Partial<RowChoice>) {
    setChoices((c) => ({ ...c, [index]: { ...c[index], ...patch } }));
  }

  async function pasteFromClipboard() {
    try {
      const t = await navigator.clipboard.readText();
      if (t) setText(t);
    } catch {
      toast({ tone: "info", title: "Press Ctrl+V to paste", body: "Your browser didn’t allow reading the clipboard directly." });
    }
  }

  function queue(openFirst: boolean) {
    setError(null);
    const payload: Record<number, unknown> = {};
    for (const r of okRows) {
      const c = choices[r.index];
      if (!c?.include) payload[r.index] = { action: "skip" };
      else if (c.agentId === "new") payload[r.index] = { action: "create", fullName: c.newName.trim(), siteId: c.newSiteId, teamCode: r.teamCode };
      else payload[r.index] = { action: "use", agentId: c.agentId };
    }
    start(async () => {
      const res = await queuePasteAction(text, payload);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const { created } = res.data;
      if (!created.length) {
        setError("None of the selected calls could be queued. Check the agent for each row.");
        return;
      }
      toast({ tone: "ok", title: `${created.length} ${created.length === 1 ? "call" : "calls"} added to your queue` });
      router.push(openFirst ? `/qa/review/${created[0]}` : "/qa");
    });
  }

  const agentsBySite = useMemo(() => {
    const m = new Map<string, AgentOpt[]>();
    for (const a of agents) m.set(a.siteName, [...(m.get(a.siteName) ?? []), a]);
    return [...m.entries()];
  }, [agents]);

  return (
    <div className="grid gap-5">
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[16px] font-semibold">Paste calls from the recordings portal</h2>
            <p className="mt-0.5 text-[13.5px] text-muted">Select one or more rows in the portal table, copy them (Ctrl+C) and paste here. Up to 50 at a time.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={pasteFromClipboard}>
              <ClipboardPaste className="size-4" /> Paste from clipboard
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setText(EXAMPLE)}>
              <Wand className="size-4" /> Try an example
            </Button>
          </div>
        </div>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"Queue   561 / 1465 - Agent Name - SOL - DE   07700 900123   2026-08-31 02:12:07   00:01:25"}
          className="mt-4 min-h-36 font-mono text-[13px] whitespace-pre"
          spellCheck={false}
          aria-label="Portal rows"
        />
        <div className="mt-3 flex flex-wrap items-center gap-3 text-[13px] text-muted">
          {text.trim() ? (
            <>
              <span className="inline-flex items-center gap-1.5">
                {checking ? <Spinner className="size-3.5" /> : <span className="size-2 rounded-full bg-meets" />}
                {localOk} {localOk === 1 ? "call" : "calls"} recognised
              </span>
              {local.length - localOk > 0 ? <span className="text-below-ink">{local.length - localOk} unreadable</span> : null}
              <button type="button" className="font-semibold text-ink-2 underline-offset-2 hover:underline" onClick={() => setText("")}>
                Clear
              </button>
            </>
          ) : (
            <span>
              Portal format not matching?{" "}
              <button type="button" onClick={onManual} className="font-semibold text-brand-700 underline-offset-2 hover:underline">
                Enter the call manually
              </button>
            </span>
          )}
        </div>
      </Card>

      <FormError message={error} />

      {preview && preview.length > 0 ? (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-3">
            <div>
              <h2 className="text-[16px] font-semibold">Check the calls</h2>
              <p className="mt-0.5 text-[13.5px] text-muted">Tick the calls to review. Internal extension calls and calls already reviewed are unticked.</p>
            </div>
            <Badge tone="brand">{selected.length} selected</Badge>
          </div>
          <ul className="divide-y divide-line border-t border-line">
            {preview.map((r) =>
              !r.ok ? (
                <li key={r.index} className="flex items-start gap-3 bg-below-soft/40 px-5 py-3">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0 text-below-ink" />
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-semibold text-ink">{r.reason}</p>
                    <p className="truncate font-mono text-[12px] text-muted">{r.raw}</p>
                  </div>
                </li>
              ) : (
                <li key={r.index} className={cn("grid gap-3 px-5 py-3.5 md:grid-cols-[auto_minmax(0,1.3fr)_minmax(0,1.4fr)] md:items-center", !choices[r.index]?.include && "bg-sunken/40")}>
                  <input
                    type="checkbox"
                    className="size-5 accent-[#00a6eb]"
                    checked={!!choices[r.index]?.include}
                    onChange={(e) => update(r.index, { include: e.target.checked })}
                    aria-label={`Include call from ${r.agentName}`}
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[14.5px] font-semibold">{r.agentName}</p>
                      {r.siteCode ? <Badge tone="outline">{r.site ? r.site.name : `${r.siteCode} · unknown site`}</Badge> : null}
                      {r.context === "extension" ? <Badge tone="neutral">Internal call</Badge> : null}
                      {r.duplicateOf ? <Badge tone="warn">Already reviewed</Badge> : null}
                      {r.anonymousCaller ? <Badge tone="neutral">Withheld number</Badge> : null}
                    </div>
                    <p className="mt-0.5 text-[13px] text-muted">
                      {formatCallTime(new Date(r.callAt))} · {formatDuration(r.durationSec)} · {r.queue ? `Queue ${r.queue} · ext ${r.extension}` : "Extension"}
                      {r.callerMasked ? ` · ${r.callerMasked}` : ""} · {weekLabel(r.callWeek, false)}
                    </p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2">
                    <Select
                      aria-label="Agent"
                      value={choices[r.index]?.agentId ?? ""}
                      onChange={(e) => update(r.index, { agentId: e.target.value, include: true })}
                      className={cn("h-10 text-[13.5px]", !choices[r.index]?.agentId && choices[r.index]?.include && "border-below")}
                      wrapperClassName={choices[r.index]?.agentId === "new" ? "" : "lg:col-span-2"}
                    >
                      <option value="">{r.matchedAgent ? "Choose agent…" : "Not on the roster — choose…"}</option>
                      <option value="new">＋ Add “{r.agentName}” as a new agent</option>
                      {agentsBySite.map(([site, list]) => (
                        <optgroup key={site} label={site}>
                          {list.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.fullName}
                              {a.status === "pending" ? " (pending)" : ""}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </Select>
                    {choices[r.index]?.agentId === "new" ? (
                      <Select aria-label="Site for new agent" value={choices[r.index]?.newSiteId ?? ""} onChange={(e) => update(r.index, { newSiteId: e.target.value })} className="h-10 text-[13.5px]">
                        <option value="">Site…</option>
                        {sites.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </Select>
                    ) : null}
                  </div>
                </li>
              ),
            )}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-sunken/40 px-5 py-4">
            <p className="text-[13px] text-muted">
              {blockers.length ? `${blockers.length} selected ${blockers.length === 1 ? "call needs" : "calls need"} an agent.` : "New agents you add are marked pending until an admin confirms them."}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" disabled={!selected.length || !!blockers.length || pending} onClick={() => queue(false)}>
                Add to queue
              </Button>
              <Button variant="brand" disabled={!selected.length || !!blockers.length || pending} onClick={() => queue(true)}>
                {pending ? <Spinner /> : null}
                Queue {selected.length || ""} &amp; start scoring
              </Button>
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- manual entry
function ManualEntry({ agents }: { agents: AgentOpt[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [callType, setCallType] = useState<(typeof CALL_TYPES)[number]["value"]>("booking");
  const [defaultTime] = useState(() => toLocalInputValue(new Date(Date.now() - 60 * 60_000)));
  const [maxTime] = useState(() => toLocalInputValue(new Date()));

  const agentsBySite = useMemo(() => {
    const m = new Map<string, AgentOpt[]>();
    for (const a of agents) m.set(a.siteName, [...(m.get(a.siteName) ?? []), a]);
    return [...m.entries()];
  }, [agents]);

  function submit(fd: FormData) {
    setError(null);
    setFieldErrors({});
    start(async () => {
      const res = await createManualAction({
        agentId: String(fd.get("agentId") ?? ""),
        callAt: String(fd.get("callAt") ?? ""),
        duration: String(fd.get("duration") ?? ""),
        callType,
        queue: String(fd.get("queue") ?? ""),
        extension: String(fd.get("extension") ?? ""),
        caller: String(fd.get("caller") ?? ""),
      });
      if (!res.ok) {
        setError(res.fieldErrors?.agentId ? "Choose the agent who took the call." : res.error);
        setFieldErrors(res.fieldErrors ?? {});
        return;
      }
      if (res.data.duplicateOf) toast({ tone: "info", title: "Heads up: this looks like a call that’s already been reviewed", body: "Carry on if it’s a different call." });
      router.push(`/qa/review/${res.data.id}`);
    });
  }

  return (
    <Card className="p-5 sm:p-6">
      <form action={submit} className="grid gap-5">
        <FormError message={error} />
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Agent" htmlFor="agentId" error={fieldErrors.agentId ? "Choose the agent who took the call." : null}>
            <Select id="agentId" name="agentId" required defaultValue="">
              <option value="" disabled>
                Choose the agent…
              </option>
              {agentsBySite.map(([site, list]) => (
                <optgroup key={site} label={site}>
                  {list.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.fullName}
                      {a.status === "pending" ? " (pending)" : ""}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-[1.6fr_1fr] gap-3">
            <Field label="Call date and time (UK)" htmlFor="callAt" error={fieldErrors.callAt}>
              <Input id="callAt" name="callAt" type="datetime-local" required defaultValue={defaultTime} max={maxTime} />
            </Field>
            <Field label="Duration" htmlFor="duration" hint="e.g. 1:25" error={fieldErrors.duration}>
              <Input id="duration" name="duration" placeholder="m:ss" inputMode="numeric" />
            </Field>
          </div>
        </div>

        <fieldset className="grid gap-2">
          <legend className="text-[13px] font-semibold text-ink-2">Call type</legend>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {CALL_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                aria-pressed={callType === t.value}
                onClick={() => setCallType(t.value)}
                title={CALL_TYPE_HINTS[t.value]}
                className={cn(
                  "rounded-full border px-4 py-2 text-[13.5px] font-semibold transition",
                  callType === t.value ? "border-ink bg-ink text-white" : "border-line-strong bg-surface text-ink-2 hover:border-ink",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <p className="text-[12.5px] text-muted">{CALL_TYPE_HINTS[callType]} — checks that can’t apply are pre-set to N/A.</p>
        </fieldset>

        <div className="grid gap-5 md:grid-cols-3">
          <Field label="Queue (optional)" htmlFor="queue">
            <Input id="queue" name="queue" placeholder="561" inputMode="numeric" />
          </Field>
          <Field label="Extension (optional)" htmlFor="extension">
            <Input id="extension" name="extension" placeholder="1465" inputMode="numeric" />
          </Field>
          <Field label="Caller number (optional)" htmlFor="caller" hint="Only a masked version is kept." error={fieldErrors.caller}>
            <Input id="caller" name="caller" placeholder="07700 900123 or Withheld" autoComplete="off" />
          </Field>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
          <p className="inline-flex items-center gap-2 text-[13px] text-muted">
            <KeyboardIcon className="size-4" /> Tip: pasting from the portal fills all of this in for you.
          </p>
          <Button type="submit" variant="brand" size="lg" disabled={pending}>
            {pending ? <Spinner /> : null}
            Start scoring
          </Button>
        </div>
      </form>
    </Card>
  );
}
