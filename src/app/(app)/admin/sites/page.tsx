import type { Metadata } from "next";
import { requireAdmin } from "@/server/auth/dal";
import { listSites } from "@/server/services/roster";
import { kpis } from "@/server/services/analytics";
import { addDays, lastFullWeekStart } from "@/lib/dates";
import { pct } from "@/lib/utils";
import { Badge, Card, PageHeader } from "@/components/ui/surface";
import { SiteEditor } from "./site-editor";

export const metadata: Metadata = { title: "Sites" };

export default async function SitesPage() {
  await requireAdmin();
  const sites = await listSites();
  const to = lastFullWeekStart();
  const from = addDays(to, -21);
  const stats = await Promise.all(sites.map((s) => kpis({ from, to, siteId: s.id })));
  return (
    <>
      <PageHeader
        eyebrow="Organisation"
        title="Sites"
        description="The towns and teams whose calls are reviewed. The code must match the portal (e.g. SOL in “Sarah Patel - SOL - DE”) so smart paste can place new agents."
        actions={<SiteEditor />}
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sites.map((s, i) => (
          <Card key={s.id} className="flex flex-col gap-4 p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="grid size-12 place-items-center rounded-2xl bg-ink font-mono text-[13px] font-bold text-white">{s.code}</span>
                <div>
                  <p className="text-[16px] font-bold">{s.name}</p>
                  <p className="text-[13px] text-muted">{s.region}</p>
                </div>
              </div>
              {s.active ? <Badge tone="ok">Active</Badge> : <Badge>Inactive</Badge>}
            </div>
            <dl className="grid grid-cols-3 gap-3 border-t border-line pt-4 text-[13px]">
              <div>
                <dt className="text-muted">Agents</dt>
                <dd className="text-[18px] font-semibold tabular">{s.agents}</dd>
              </div>
              <div>
                <dt className="text-muted">Calls (4 wks)</dt>
                <dd className="text-[18px] font-semibold tabular">{stats[i].evaluations}</dd>
              </div>
              <div>
                <dt className="text-muted">QC score</dt>
                <dd className="text-[18px] font-semibold tabular">{pct(stats[i].avgScore)}</dd>
              </div>
            </dl>
            <div className="mt-auto">
              <SiteEditor site={s} />
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
