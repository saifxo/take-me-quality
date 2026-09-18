import Link from "next/link";
import type { HeatCell } from "@/server/services/analytics";
import { TableWrap } from "@/components/ui/surface";
import { cn } from "@/lib/utils";

// One hue, light → dark: darker cells mean more calls missed the check.
const STEPS = [
  { min: 99, bg: "#f6f8f9", ink: "#5a6872" },
  { min: 97, bg: "#fdebe7", ink: "#0b0f12" },
  { min: 94, bg: "#f9cfc6", ink: "#0b0f12" },
  { min: 90, bg: "#f2a595", ink: "#0b0f12" },
  { min: 85, bg: "#e4735f", ink: "#ffffff" },
  { min: -1, bg: "#c23f2d", ink: "#ffffff" },
];
const step = (v: number) => STEPS.find((s) => v >= s.min)!;

export function CriteriaHeatmap({
  criteria,
  groups,
  cells,
  linkFor,
}: {
  criteria: { key: string; title: string; section: string; critical: boolean }[];
  groups: { id: string; name: string }[];
  cells: HeatCell[];
  linkFor?: (criterionKey: string, groupId: string) => string;
}) {
  const map = new Map(cells.map((c) => [`${c.key}|${c.groupId}`, c]));
  if (!groups.length) return <p className="px-5 pb-5 text-[14px] text-muted">No reviews in this period.</p>;
  return (
    <div>
      <TableWrap>
        <table className="w-full border-separate border-spacing-1 text-[12.5px]">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-surface px-2 py-1 text-left text-[11.5px] font-semibold tracking-wide text-muted uppercase">Check</th>
              {groups.map((g) => (
                <th key={g.id} className="min-w-[76px] px-1 py-1 text-center text-[12px] font-semibold text-ink-2">
                  {g.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {criteria.map((c) => (
              <tr key={c.key}>
                <th scope="row" className="sticky left-0 z-10 max-w-[260px] bg-surface px-2 py-1 text-left font-medium text-ink-2">
                  <span className="line-clamp-1" title={c.title}>
                    {c.title}
                  </span>
                  {c.critical ? <span className="ml-1 text-[10.5px] font-bold text-fail">critical</span> : null}
                </th>
                {groups.map((g) => {
                  const cell = map.get(`${c.key}|${g.id}`);
                  if (!cell || cell.value === null) {
                    return (
                      <td key={g.id} className="rounded-md bg-sunken/40 text-center text-faint">
                        —
                      </td>
                    );
                  }
                  const s = step(cell.value);
                  const label = `${c.title} · ${g.name}: ${cell.value}% (${cell.misses} of ${cell.scored} calls missed)`;
                  const inner = (
                    <span className="block rounded-md px-1 py-1.5 text-center font-semibold tabular" style={{ background: s.bg, color: s.ink }} title={label}>
                      {Math.round(cell.value)}
                    </span>
                  );
                  return (
                    <td key={g.id} className="p-0">
                      {linkFor && cell.misses ? (
                        <Link href={linkFor(c.key, g.id)} aria-label={label} className="block rounded-md ring-brand hover:ring-2">
                          {inner}
                        </Link>
                      ) : (
                        inner
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-muted">
        <span>Check score (Yes = 100, Partial = 50)</span>
        <span className="flex overflow-hidden rounded-md">
          {[...STEPS].reverse().map((s, i) => (
            <span key={i} className={cn("h-3 w-7")} style={{ background: s.bg }} />
          ))}
        </span>
        <span>darker = more calls missed it · click a cell to see those calls</span>
      </div>
    </div>
  );
}
