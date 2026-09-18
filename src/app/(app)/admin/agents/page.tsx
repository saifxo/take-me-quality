import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/server/auth/dal";
import { listAgents, listSites } from "@/server/services/roster";
import { agentTable } from "@/server/services/analytics";
import { getActiveScorecard } from "@/server/services/scorecard";
import { addDays, lastFullWeekStart } from "@/lib/dates";
import { cn, pct } from "@/lib/utils";
import { Badge, Card, PageHeader, TableWrap, td, th } from "@/components/ui/surface";
import { AgentEditor, ApproveAgentButton } from "./agent-editor";

export const metadata: Metadata = { title: "Agents" };

export default async function AgentsPage(props: PageProps<"/admin/agents">) {
  await requireAdmin();
  const sp = await props.searchParams;
  const siteId = typeof sp.site === "string" ? sp.site : undefined;
  const status = typeof sp.status === "string" && ["active", "pending", "inactive"].includes(sp.status) ? (sp.status as "active" | "pending" | "inactive") : undefined;
  const to = lastFullWeekStart();
  const from = addDays(to, -21);
  const [agents, sites, stats, sc] = await Promise.all([listAgents({ siteId, status, includeInactive: true }), listSites(), agentTable({ from, to }), getActiveScorecard()]);
  const statsById = new Map(stats.map((s) => [s.agentId, s]));
  const pending = agents.filter((a) => a.status === "pending");
  const siteOpts = sites.map((s) => ({ id: s.id, name: s.name }));
  const link = (params: Record<string, string | undefined>) => {
    const q = new URLSearchParams(Object.entries({ site: siteId, status, ...params }).filter(([, v]) => v) as [string, string][]);
    return `/admin/agents${q.size ? `?${q}` : ""}`;
  };

  return (
    <>
      <PageHeader
        eyebrow="Roster"
        title="Agents"
        description="Everyone whose calls are reviewed. Reviewers can add an agent they meet in the portal; you confirm them here."
        actions={<AgentEditor sites={siteOpts} />}
      />

      {pending.length ? (
        <Card className="mb-6 border-below/40 bg-below-soft/40 p-5">
          <p className="text-[15px] font-semibold">{pending.length} {pending.length === 1 ? "agent is" : "agents are"} waiting for you to confirm</p>
          <ul className="mt-3 grid gap-2">
            {pending.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface px-4 py-2.5">
                <span>
                  <span className="font-semibold">{a.fullName}</span> <span className="text-[13px] text-muted">· {a.siteName}</span>
                </span>
                <span className="flex gap-2">
                  <AgentEditor sites={siteOpts} agent={a} compact />
                  <ApproveAgentButton agent={a} />
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-4 text-[13px]">
          <Link href={link({ site: undefined })} className={cn("rounded-full px-3 py-1.5 font-semibold", !siteId ? "bg-ink text-white" : "bg-sunken text-ink-2 hover:bg-line")}>
            All sites
          </Link>
          {sites.map((s) => (
            <Link key={s.id} href={link({ site: s.id })} className={cn("rounded-full px-3 py-1.5 font-semibold", siteId === s.id ? "bg-ink text-white" : "bg-sunken text-ink-2 hover:bg-line")}>
              {s.name}
            </Link>
          ))}
          <span className="mx-2 h-5 w-px bg-line" />
          {(["active", "pending", "inactive"] as const).map((s) => (
            <Link key={s} href={link({ status: status === s ? undefined : s })} className={cn("rounded-full px-3 py-1.5 font-semibold capitalize", status === s ? "bg-brand text-white" : "bg-sunken text-ink-2 hover:bg-line")}>
              {s}
            </Link>
          ))}
        </div>
        <TableWrap>
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <th className={th}>Agent</th>
                <th className={th}>Site</th>
                <th className={th}>Team · ext</th>
                <th className={th}>Status</th>
                <th className={`${th} text-right`}>Calls (4 wks)</th>
                <th className={`${th} text-right`}>QC score</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {agents.map((a) => {
                const s = statsById.get(a.id);
                return (
                  <tr key={a.id} className="hover:bg-sunken/40">
                    <td className={td}>
                      <Link href={`/admin/agents/${a.id}`} className="font-semibold hover:underline">
                        {a.fullName}
                      </Link>
                    </td>
                    <td className={`${td} text-ink-2`}>{a.siteName}</td>
                    <td className={`${td} text-ink-2`}>{[a.teamCode, a.extension].filter(Boolean).join(" · ") || "—"}</td>
                    <td className={td}>
                      <Badge tone={a.status === "active" ? "ok" : a.status === "pending" ? "warn" : "neutral"}>{a.status}</Badge>
                    </td>
                    <td className={`${td} text-right tabular`}>{s?.calls ?? 0}</td>
                    <td className={cn(td, "text-right font-semibold tabular", s?.avgScore == null ? "text-faint" : s.avgScore > sc.settings.kpiPass ? "text-meets" : "text-below-ink")}>{pct(s?.avgScore ?? null)}</td>
                    <td className={`${td} text-right`}>
                      <AgentEditor sites={siteOpts} agent={a} compact />
                    </td>
                  </tr>
                );
              })}
              {!agents.length ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-[14px] text-muted">
                    No agents match these filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </TableWrap>
      </Card>
    </>
  );
}
