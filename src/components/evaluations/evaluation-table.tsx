import Link from "next/link";
import { ChevronRight, TriangleAlert } from "lucide-react";
import type { Band } from "@/lib/scoring/engine";
import { formatCallTime, formatDuration } from "@/lib/dates";
import { CALL_TYPE_LABEL, pct } from "@/lib/utils";
import { BandPill, TableWrap, bandTextClass, td, th } from "@/components/ui/surface";

export type EvalRow = {
  id: string;
  callAt: Date | null;
  durationSec: number | null;
  callType: string;
  score: number | null;
  band: Band | null;
  agentName: string;
  siteName: string;
  reviewerName: string;
  issueCount: number;
  amendedAt: Date | null;
};

/** Shared list of evaluations; rows link to the read-only view. */
export function EvaluationTable({ rows, showReviewer = true }: { rows: EvalRow[]; showReviewer?: boolean }) {
  return (
    <TableWrap>
      <table className="w-full border-separate border-spacing-0">
        <thead>
          <tr>
            <th className={th}>Call</th>
            <th className={th}>Agent</th>
            <th className={th}>Type</th>
            {showReviewer ? <th className={th}>Reviewer</th> : null}
            <th className={`${th} text-right`}>Score</th>
            <th className={th}>Band</th>
            <th className={th} aria-label="Open" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="group hover:bg-sunken/40">
              <td className={td}>
                <Link href={`/evaluations/${r.id}`} className="font-medium text-ink hover:underline">
                  {formatCallTime(r.callAt, true)}
                </Link>
                <p className="text-[12.5px] text-muted">{formatDuration(r.durationSec)}</p>
              </td>
              <td className={td}>
                <p className="font-medium">{r.agentName}</p>
                <p className="text-[12.5px] text-muted">{r.siteName}</p>
              </td>
              <td className={`${td} text-ink-2`}>{CALL_TYPE_LABEL[r.callType] ?? r.callType}</td>
              {showReviewer ? <td className={`${td} text-ink-2`}>{r.reviewerName}</td> : null}
              <td className={`${td} text-right font-semibold tabular ${bandTextClass(r.band)}`}>{pct(r.score, 2)}</td>
              <td className={td}>
                <div className="flex flex-wrap items-center gap-1.5">
                  <BandPill band={r.band} autoFail={r.issueCount > 0} size="sm" />
                  {r.issueCount > 0 ? <TriangleAlert className="size-4 text-fail" aria-label="Zero-tolerance issue" /> : null}
                  {r.amendedAt ? <span className="text-[11.5px] text-muted">edited</span> : null}
                </div>
              </td>
              <td className={`${td} w-8`}>
                <Link href={`/evaluations/${r.id}`} aria-label="Open review" className="text-faint group-hover:text-ink">
                  <ChevronRight className="size-4" />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  );
}

export function Pager({ page, pageSize, total, hrefFor }: { page: number; pageSize: number; total: number; hrefFor: (p: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <nav aria-label="Pages" className="flex items-center justify-between gap-3 border-t border-line px-5 py-3 text-[13px] text-muted">
      <span>
        {(page - 1) * pageSize + 1}–{Math.min(total, page * pageSize)} of {total.toLocaleString("en-GB")}
      </span>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={hrefFor(page - 1)} className="rounded-full border border-line-strong px-3 py-1 font-semibold text-ink hover:border-ink">
            Previous
          </Link>
        ) : null}
        {page < pages ? (
          <Link href={hrefFor(page + 1)} className="rounded-full border border-line-strong px-3 py-1 font-semibold text-ink hover:border-ink">
            Next
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
