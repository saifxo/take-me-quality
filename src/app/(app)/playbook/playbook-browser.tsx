"use client";

import { useMemo, useState } from "react";
import { Printer, Search } from "lucide-react";
import { Input } from "@/components/ui/form";
import { Badge, Card, CardHeader } from "@/components/ui/surface";
import { Button } from "@/components/ui/button";
import { CALL_TYPE_LABEL, cn } from "@/lib/utils";
import type { ScorecardSettings } from "@/db/schema";

type C = {
  id: string;
  title: string;
  description: string;
  yesDesc: string | null;
  partialDesc: string | null;
  noDesc: string | null;
  markerNotes: string | null;
  allowPartial: boolean;
  penaltyNo: number;
  penaltyPartial: number;
  applicableCallTypes: string[];
};

const EXAMPLES = [
  ["Typical booking, all Yes", "18 applicable · 18 ÷ 18", "100%", "Perfect"],
  ["Asked to spell “Tesco” (Address Partial, Spelling No)", "16.5 ÷ 18", "91.67%", "Meets KPI"],
  ["Missed the full address (critical No)", "(17 − 2) ÷ 18", "83.33%", "Below KPI"],
  ["Airport, terminal not confirmed (critical Partial)", "(19.5 − 1) ÷ 20", "92.50%", "Meets KPI"],
  ["Two non-critical Nos on an airport call", "18 ÷ 20", "90.00%", "Below KPI"],
  ["Any zero-tolerance issue", "forced", "0%", "Fail"],
];

export function PlaybookBrowser({
  settings,
  sections,
  issues,
  approved,
  notApproved,
}: {
  settings: ScorecardSettings;
  sections: { key: string; name: string; criteria: C[] }[];
  issues: { id: string; shortName: string; title: string; description: string }[];
  approved: string[];
  notApproved: string[];
}) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      sections
        .map((s) => ({
          ...s,
          criteria: s.criteria.filter((c) => !needle || [c.title, c.description, c.yesDesc, c.partialDesc, c.noDesc, c.markerNotes].some((t) => t?.toLowerCase().includes(needle))),
        }))
        .filter((s) => s.criteria.length),
    [sections, needle],
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="no-print lg:sticky lg:top-6 lg:self-start">
        <nav className="grid gap-1 text-[14px]" aria-label="Playbook sections">
          <a href="#scoring" className="rounded-lg px-3 py-1.5 font-medium text-ink-2 hover:bg-sunken">How scoring works</a>
          {sections.map((s) => (
            <a key={s.key} href={`#${s.key}`} className="rounded-lg px-3 py-1.5 font-medium text-ink-2 hover:bg-sunken">
              {s.name.split(" – ")[0]}
            </a>
          ))}
          <a href="#zero-tolerance" className="rounded-lg px-3 py-1.5 font-medium text-ink-2 hover:bg-sunken">Zero tolerance</a>
          <a href="#greetings" className="rounded-lg px-3 py-1.5 font-medium text-ink-2 hover:bg-sunken">Approved greetings</a>
          <a href="#smart-paste" className="rounded-lg px-3 py-1.5 font-medium text-ink-2 hover:bg-sunken">Using smart paste</a>
        </nav>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => window.print()}>
          <Printer className="size-3.5" /> Print the Playbook
        </Button>
      </aside>

      <div className="grid min-w-0 gap-6">
        <div className="no-print relative">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the guidance, e.g. postcode, ETA, airport" className="h-12 pl-11" aria-label="Search the Playbook" />
        </div>

        <Card id="scoring" className="scroll-mt-6">
          <CardHeader title="How scoring works" description="Exactly the rules from the TMQ scorecard." />
          <div className="grid gap-5 px-5 pb-5 md:grid-cols-2">
            <ul className="grid gap-2 text-[14px] leading-relaxed text-ink-2">
              <li>
                <b>Yes</b> = {settings.weights.yes}, <b>Partial</b> = {settings.weights.partial}, <b>No</b> = {settings.weights.no}. <b>N/A</b> doesn’t count at all.
              </li>
              <li>Score = (points − critical deductions) ÷ applicable checks.</li>
              <li>
                Critical checks lose extra marks: a <b>No</b> costs −2, and on accounts, special bookings and airports a <b>Partial</b> costs −1.
              </li>
              <li>
                A call <b>meets KPI above {settings.kpiPass}%</b>. Exactly {settings.kpiPass}% is below KPI.
              </li>
              <li>Any zero-tolerance issue makes the call 0%, whatever else happened.</li>
              <li>An agent needs attention when more than {settings.attentionShare}% of their calls are below KPI.</li>
            </ul>
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full text-[13px]">
                <thead className="bg-sunken/70 text-left text-[11.5px] tracking-wide text-muted uppercase">
                  <tr>
                    <th className="px-3 py-2">Example</th>
                    <th className="px-3 py-2 text-right">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {EXAMPLES.map(([ex, math, score, band]) => (
                    <tr key={ex} className="border-t border-line">
                      <td className="px-3 py-2">
                        <p className="font-medium">{ex}</p>
                        <p className="font-mono text-[11.5px] text-muted">{math}</p>
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <p className="font-semibold tabular">{score}</p>
                        <p className="text-[11.5px] text-muted">{band}</p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Card>

        {filtered.map((s) => (
          <section key={s.key} id={s.key} className="scroll-mt-6">
            <h2 className="font-display text-[26px] font-extrabold">{s.name}</h2>
            <div className="mt-3 grid gap-4">
              {s.criteria.map((c) => (
                <Card key={c.id} className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="text-[16.5px] font-bold">{c.title}</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {c.penaltyNo > 0 ? <Badge tone="danger">Critical · No −{c.penaltyNo}{c.penaltyPartial ? `, Partial −${c.penaltyPartial}` : ""}</Badge> : null}
                      {c.applicableCallTypes.length ? <Badge tone="brand">Only for: {c.applicableCallTypes.map((t) => CALL_TYPE_LABEL[t]).join(", ")}</Badge> : null}
                    </div>
                  </div>
                  <p className="mt-2 text-[14.5px] leading-relaxed text-ink-2">{c.description}</p>
                  <div className="mt-4 grid gap-2 md:grid-cols-3">
                    {[
                      ["Yes", c.yesDesc, "bg-meets-soft"],
                      ["Partial", c.allowPartial ? c.partialDesc : "Not used for this check.", "bg-below-soft"],
                      ["No", c.noDesc, "bg-fail-soft"],
                    ].map(([label, text, bg]) => (
                      <div key={label} className={cn("rounded-xl p-3.5", bg)}>
                        <p className="text-[12px] font-bold tracking-wide uppercase">{label}</p>
                        <p className="mt-1 text-[13.5px] leading-relaxed text-ink-2">{text ?? "—"}</p>
                      </div>
                    ))}
                  </div>
                  {c.markerNotes ? (
                    <p className="mt-3 rounded-xl bg-brand-50 px-3.5 py-2.5 text-[13.5px] text-brand-900">
                      <b>Marker note:</b> {c.markerNotes}
                    </p>
                  ) : null}
                </Card>
              ))}
            </div>
          </section>
        ))}
        {!filtered.length ? <p className="text-[14px] text-muted">Nothing in the Playbook matches “{q}”.</p> : null}

        <section id="zero-tolerance" className="scroll-mt-6 rounded-[var(--radius-card)] bg-ink p-6 text-white">
          <h2 className="font-display text-[26px] font-extrabold">Zero tolerance (“HiHi”)</h2>
          <p className="mt-1 text-[14px] text-white/70">High Impact Handling Issues. Select every one that happened and describe it. The call scores 0%.</p>
          <ul className="mt-4 grid gap-3 md:grid-cols-2">
            {issues.map((i) => (
              <li key={i.id} className="rounded-xl bg-white/[0.06] p-4 ring-1 ring-white/10">
                <p className="font-semibold text-cyan">
                  {i.title} <span className="text-[12px] font-normal text-white/50">· {i.shortName}</span>
                </p>
                <p className="mt-1 text-[13.5px] leading-relaxed text-white/75">{i.description}</p>
              </li>
            ))}
          </ul>
        </section>

        <Card id="greetings" className="scroll-mt-6 p-5">
          <h2 className="text-[18px] font-bold">Approved company greetings</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-meets-soft p-4">
              <p className="text-[12px] font-bold tracking-wide uppercase">Approved</p>
              <p className="mt-1 text-[15px] font-semibold">{approved.join(" · ")}</p>
            </div>
            <div className="rounded-xl bg-fail-soft p-4">
              <p className="text-[12px] font-bold tracking-wide uppercase">Not approved</p>
              <p className="mt-1 text-[15px] font-semibold">{notApproved.join(" · ")}</p>
            </div>
          </div>
          <p className="mt-3 text-[13.5px] text-muted">Example: “Good morning, Take Me, Demo Ava speaking, how can I help?” Close with “Thanks for calling Take Me, goodbye.”</p>
        </Card>

        <Card id="smart-paste" className="scroll-mt-6 p-5">
          <h2 className="text-[18px] font-bold">Using smart paste</h2>
          <ol className="mt-3 grid list-decimal gap-2 pl-5 text-[14px] leading-relaxed text-ink-2">
            <li>In the recordings portal, search for the agent and last week’s dates.</li>
            <li>Select the rows you want to review (drag across them) and press Ctrl+C.</li>
            <li>In Take Me Quality, open <b>Score a call</b> and press Ctrl+V in the paste box.</li>
            <li>Check each row’s agent, untick anything you don’t want, then choose <b>Queue &amp; start scoring</b>.</li>
            <li>If the portal layout ever changes and a row isn’t recognised, use <b>Enter manually</b> instead.</li>
            <li>
              Write notes about what the agent did. Leave out customer names, numbers and addresses: the caller’s number is masked automatically, and keeping notes free of
              customer details keeps us UK GDPR compliant.
            </li>
          </ol>
        </Card>
      </div>
    </div>
  );
}
