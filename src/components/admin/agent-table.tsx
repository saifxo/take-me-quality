import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import type { AgentRow } from "@/server/services/analytics";
import { formatDuration } from "@/lib/dates";
import { cn, pct, signed } from "@/lib/utils";
import { Badge, TableWrap, td, th } from "@/components/ui/surface";

/** The Overview sheet, done properly: one row per agent, grouped by site, every number clickable. */
export function AgentTable({ rows, sections, kpi, attention, query = "" }: { rows: AgentRow[]; sections: { key: string; shortName: string }[]; kpi: number; attention: number; query?: string }) {
  const bySite = new Map<string, AgentRow[]>();
  for (const r of rows) bySite.set(r.site, [...(bySite.get(r.site) ?? []), r]);
  return (
    <TableWrap>
      <table className="w-full border-separate border-spacing-0 text-[13.5px]">
        <thead>
          <tr>
            <th className={`${th} min-w-[220px]`}>Agent</th>
            <th className={`${th} text-right`}>Calls</th>
            <th className={`${th} text-right`}>QC score</th>
            <th className={`${th} text-right`}>vs last</th>
            <th className={`${th} text-right`}>Below KPI</th>
            <th className={`${th} text-right`}>Avg AHT</th>
            {sections.map((s) => (
              <th key={s.key} className={`${th} text-right`}>
                {s.shortName}
              </th>
            ))}
            <th className={th}>Zero tolerance</th>
          </tr>
        </thead>
        {[...bySite.entries()].map(([site, list]) => {
          const reviewed = list.filter((r) => r.calls > 0);
          const calls = reviewed.reduce((s, r) => s + r.calls, 0);
          const avg = calls ? reviewed.reduce((s, r) => s + (r.avgScore ?? 0) * r.calls, 0) / calls : null;
          return (
            <tbody key={site}>
              <tr>
                <td colSpan={7 + sections.length} className="border-b border-line bg-surface px-4 pt-5 pb-2">
                  <div className="flex items-baseline gap-3">
                    <p className="text-[14px] font-bold">{site}</p>
                    <p className="text-[12.5px] text-muted">
                      {calls} calls · average {pct(avg)}
                    </p>
                  </div>
                </td>
              </tr>
              {list.map((r) => {
                const delta = r.avgScore !== null && r.prevAvg !== null ? r.avgScore - r.prevAvg : null;
                return (
                  <tr key={r.agentId} className={cn("hover:bg-sunken/40", r.needsAttention && "bg-below-soft/30")}>
                    <td className={td}>
                      <Link href={`/admin/agents/${r.agentId}${query}`} className="font-semibold hover:underline">
                        {r.name}
                      </Link>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                        {r.teamCode ? <span className="text-[12px] text-muted">{r.teamCode}</span> : null}
                        {r.status === "pending" ? <Badge tone="warn">pending</Badge> : null}
                        {r.needsAttention ? (
                          <span className="text-[12px] font-medium text-below-ink" title={r.reasons.join(" · ")}>
                            needs attention
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className={`${td} text-right tabular`}>{r.calls || <span className="text-faint">0</span>}</td>
                    <td className={cn(td, "text-right font-semibold tabular", r.avgScore === null ? "text-faint" : r.avgScore > kpi ? "text-meets" : "text-below-ink")}>{pct(r.avgScore)}</td>
                    <td className={cn(td, "text-right tabular", delta === null ? "text-faint" : delta >= 0 ? "text-meets" : "text-fail")}>{signed(delta)}</td>
                    <td className={cn(td, "text-right tabular", r.belowShare !== null && r.belowShare > attention ? "font-semibold text-fail" : "")}>{pct(r.belowShare, 0)}</td>
                    <td className={`${td} text-right tabular text-ink-2`}>{formatDuration(r.avgDuration)}</td>
                    {sections.map((s) => (
                      <td key={s.key} className={`${td} text-right tabular text-ink-2`}>
                        {pct(r.sections[s.key] ?? null)}
                      </td>
                    ))}
                    <td className={td}>
                      {r.autoFails ? (
                        <span className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-fail">
                          <TriangleAlert className="size-3.5" /> {r.autoFails} · {r.failReasons.join(", ")}
                        </span>
                      ) : (
                        <span className="text-faint">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          );
        })}
      </table>
    </TableWrap>
  );
}
