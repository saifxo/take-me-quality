import type { Metadata } from "next";
import Link from "next/link";
import { Download, FileSpreadsheet, ScrollText, X } from "lucide-react";
import { requireAdmin } from "@/server/auth/dal";
import { searchEvaluations } from "@/server/services/evaluations";
import { listAgents, listSites } from "@/server/services/roster";
import { listReviewers } from "@/server/services/users";
import { getActiveScorecard } from "@/server/services/scorecard";
import { explorerFilters } from "@/lib/explorer-filters";
import { Card, EmptyState, PageHeader } from "@/components/ui/surface";
import { Input, Select } from "@/components/ui/form";
import { buttonClass } from "@/components/ui/button";
import { FiltersBar } from "@/components/admin/filters-bar";
import { EvaluationTable, Pager } from "@/components/evaluations/evaluation-table";

export const metadata: Metadata = { title: "Evaluations" };

export default async function EvaluationsExplorer(props: PageProps<"/admin/evaluations">) {
  const user = await requireAdmin();
  const sp = await props.searchParams;
  const { period, filters, sort, page } = explorerFilters(sp);
  const [result, sites, reviewers, agents, sc] = await Promise.all([
    searchEvaluations(user, filters, { page, sort }),
    listSites(),
    listReviewers(),
    listAgents({ includeInactive: true }),
    getActiveScorecard(),
  ]);
  const flat = Object.fromEntries(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" && k !== "page" ? [[k, v]] : []))) as Record<string, string>;
  const href = (p: number) => `/admin/evaluations?${new URLSearchParams({ ...flat, page: String(p) })}`;
  const exportHref = (format: string) => `/api/export/evaluations?${new URLSearchParams({ ...flat, format })}`;
  const keep = Object.entries(flat).filter(([k]) => !["q", "band", "agent", "issue", "sort", "criterion"].includes(k));
  const criterionTitle = filters.criterionKey ? sc.criteria.find((c) => c.key === filters.criterionKey)?.title : null;
  const clearCriterion = `/admin/evaluations?${new URLSearchParams(Object.fromEntries(Object.entries(flat).filter(([k]) => k !== "criterion")))}`;

  return (
    <>
      <PageHeader
        eyebrow={period.label}
        title="Evaluations"
        description="Every submitted review. Filter, search the notes, open any call, or take the lot to Excel."
        actions={
          <div className="flex gap-2">
            <a href={exportHref("xlsx")} className={buttonClass("outline", "md")}>
              <FileSpreadsheet className="size-4" /> Excel
            </a>
            <a href={exportHref("csv")} className={buttonClass("ghost", "md")}>
              <Download className="size-4" /> CSV
            </a>
          </div>
        }
      />
      <FiltersBar sites={sites.map((s) => ({ id: s.id, name: s.name }))} reviewers={reviewers.map((r) => ({ id: r.id, name: r.name }))} from={period.from} to={period.to} defaultPeriod="4w" className="mb-4" />
      <Card>
        <form className="flex flex-wrap items-center gap-2 border-b border-line p-4" role="search">
          {keep.map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          {filters.criterionKey ? <input type="hidden" name="criterion" value={filters.criterionKey} /> : null}
          <Input name="q" defaultValue={filters.q} placeholder="Search agent or notes" className="h-10 max-w-60" aria-label="Search" />
          <Select name="agent" defaultValue={filters.agentId ?? ""} className="h-10 text-[13.5px]" aria-label="Agent">
            <option value="">All agents</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.fullName}
              </option>
            ))}
          </Select>
          <Select name="band" defaultValue={filters.band ?? ""} className="h-10 text-[13.5px]" aria-label="Band">
            <option value="">All bands</option>
            <option value="perfect">Perfect</option>
            <option value="meets">Meets KPI</option>
            <option value="below">Below KPI</option>
            <option value="fail">Fail</option>
          </Select>
          <Select name="issue" defaultValue={filters.issueKey ?? ""} className="h-10 text-[13.5px]" aria-label="Zero-tolerance issue">
            <option value="">Any zero-tolerance</option>
            {sc.issues.map((i) => (
              <option key={i.id} value={i.key}>
                {i.shortName}
              </option>
            ))}
          </Select>
          <Select name="sort" defaultValue={sort} className="h-10 text-[13.5px]" aria-label="Sort">
            <option value="recent">Newest calls</option>
            <option value="score_asc">Lowest score</option>
            <option value="score_desc">Highest score</option>
          </Select>
          <button className="h-10 rounded-full bg-ink px-5 text-[13.5px] font-semibold text-white">Apply</button>
          <span className="ml-auto text-[13px] text-muted">{result.total.toLocaleString("en-GB")} evaluations</span>
        </form>
        {criterionTitle ? (
          <div className="flex items-center gap-2 border-b border-line bg-brand-50/60 px-4 py-2 text-[13px]">
            Showing calls that missed <b>{criterionTitle}</b>
            <Link href={clearCriterion} className="ml-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-muted hover:bg-white">
              <X className="size-3" /> clear
            </Link>
          </div>
        ) : null}
        {result.rows.length ? (
          <>
            <EvaluationTable rows={result.rows} />
            <Pager page={result.page} pageSize={result.pageSize} total={result.total} hrefFor={href} />
          </>
        ) : (
          <EmptyState icon={<ScrollText className="size-6" />} title="No evaluations match">
            Try a wider period or clear a filter.
          </EmptyState>
        )}
      </Card>
    </>
  );
}
