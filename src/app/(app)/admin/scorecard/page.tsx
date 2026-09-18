import type { Metadata } from "next";
import { requireAdmin } from "@/server/auth/dal";
import { getActiveScorecard, getDraftScorecard, listVersions, type Scorecard } from "@/server/services/scorecard";
import { formatCallTime } from "@/lib/dates";
import { Badge, Card, CardHeader, PageHeader, TableWrap, td, th } from "@/components/ui/surface";
import { CALL_TYPE_LABEL } from "@/lib/utils";
import { ScorecardEditor, StartDraftButton, type EditorScorecard } from "./scorecard-editor";

export const metadata: Metadata = { title: "Scorecard & rules" };

function toEditor(sc: Scorecard): EditorScorecard {
  return {
    id: sc.id,
    version: sc.version,
    name: sc.name,
    notes: sc.notes ?? "",
    settings: sc.settings,
    sections: sc.sections.map((s) => ({
      key: s.key,
      name: s.name,
      criteria: s.criteria.map((c) => ({
        id: c.id,
        title: c.title,
        description: c.description,
        yesDesc: c.yesDesc,
        partialDesc: c.partialDesc,
        noDesc: c.noDesc,
        markerNotes: c.markerNotes,
        allowPartial: c.allowPartial,
        allowNa: c.allowNa,
        penaltyNo: c.penaltyNo,
        penaltyPartial: c.penaltyPartial,
        applicableCallTypes: c.applicableCallTypes,
      })),
    })),
    issues: sc.issues.map((i) => ({ id: i.id, shortName: i.shortName, title: i.title, description: i.description })),
  };
}

export default async function ScorecardPage() {
  await requireAdmin();
  const [active, draft, versions] = await Promise.all([getActiveScorecard(), getDraftScorecard(), listVersions()]);
  const s = active.settings;

  return (
    <>
      <PageHeader
        eyebrow={`Active: ${active.name}`}
        title="Scorecard & rules"
        description="Every threshold and check is editable. Changes go into a draft; publishing makes a new version, and past reviews keep the version they were marked under."
        actions={draft ? null : <StartDraftButton />}
      />

      {draft ? (
        <ScorecardEditor draft={toEditor(draft)} />
      ) : (
        <div className="grid gap-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[
              ["KPI pass mark", `Above ${s.kpiPass}%`, `A call at exactly ${s.kpiPass}% is below KPI`],
              ["Agent needs attention", `> ${s.attentionShare}% below KPI`, "Share of an agent’s calls in the period"],
              ["Weekly review target", `${s.weeklyTarget} calls per agent`, "Drives coverage on the Today page"],
              ["Points", `Yes ${s.weights.yes} · Partial ${s.weights.partial} · No ${s.weights.no}`, "N/A is left out of the count"],
              ["Score floor", s.scoreFloor === null ? "None" : `${s.scoreFloor}%`, "Stops critical deductions going below this"],
              ["Reviewer edit window", `${s.editWindowHours} hours`, "After that, only admins can amend (with a reason)"],
            ].map(([k, v, h]) => (
              <Card key={k} className="p-5">
                <p className="text-[13px] font-medium text-muted">{k}</p>
                <p className="mt-1 text-[20px] font-semibold">{v}</p>
                <p className="mt-1 text-[12.5px] text-muted">{h}</p>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader title={`${active.criteria.length} checks in ${active.sections.length} sections`} description="Critical checks carry extra deductions. Some checks only apply to certain call types." />
            <div className="grid gap-6 px-5 pb-5 lg:grid-cols-2">
              {active.sections.map((sec) => (
                <div key={sec.key}>
                  <p className="text-[14px] font-bold">{sec.name}</p>
                  <ul className="mt-2 grid gap-1.5">
                    {sec.criteria.map((c) => (
                      <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-sunken/50 px-3 py-2 text-[13.5px]">
                        <span>{c.title}</span>
                        <span className="flex flex-wrap gap-1">
                          {c.penaltyNo ? <Badge tone="danger">No −{c.penaltyNo}{c.penaltyPartial ? ` · Partial −${c.penaltyPartial}` : ""}</Badge> : null}
                          {c.applicableCallTypes.length ? <Badge tone="brand">{c.applicableCallTypes.map((t) => CALL_TYPE_LABEL[t]).join(", ")}</Badge> : null}
                          {!c.allowPartial ? <Badge>No Partial</Badge> : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="Zero-tolerance issues" description="Any one forces the call to 0%." />
            <ul className="flex flex-wrap gap-2 px-5 pb-5">
              {active.issues.map((i) => (
                <li key={i.id} title={i.description} className="rounded-full bg-fail-soft px-3 py-1.5 text-[13px] font-semibold text-fail">
                  {i.title}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      <Card className="mt-6">
        <CardHeader title="Version history" />
        <TableWrap>
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <th className={th}>Version</th>
                <th className={th}>Status</th>
                <th className={th}>Published</th>
                <th className={`${th} text-right`}>Reviews marked</th>
                <th className={th}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {versions.map((v) => (
                <tr key={v.id}>
                  <td className={`${td} font-semibold`}>{v.name}</td>
                  <td className={td}>
                    <Badge tone={v.status === "active" ? "ok" : v.status === "draft" ? "warn" : "neutral"}>{v.status}</Badge>
                  </td>
                  <td className={`${td} text-ink-2`}>{v.publishedAt ? formatCallTime(v.publishedAt, true) : "—"}</td>
                  <td className={`${td} text-right tabular`}>{v.evaluations}</td>
                  <td className={`${td} max-w-md text-[13px] text-muted`}>{v.notes ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Card>
    </>
  );
}
