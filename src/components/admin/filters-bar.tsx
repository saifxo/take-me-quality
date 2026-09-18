"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CALL_TYPES } from "@/lib/framework/tmq";
import { PERIODS } from "@/lib/filters";
import { Select } from "@/components/ui/form";
import { Spinner } from "@/components/ui/client";
import { cn } from "@/lib/utils";

type Opt = { id: string; name: string };

/** One row of filters above the charts; state lives in the URL so views can be shared. */
export function FiltersBar({
  sites,
  reviewers,
  show = { site: true, reviewer: true, type: true },
  className,
  from,
  to,
  defaultPeriod = "last",
}: {
  sites?: Opt[];
  reviewers?: Opt[];
  show?: { site?: boolean; reviewer?: boolean; type?: boolean };
  className?: string;
  from: string;
  to: string;
  defaultPeriod?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();

  function set(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    if (key === "period" && value === "custom") {
      next.set("from", from);
      next.set("to", to);
    }
    if (key === "period" && value !== "custom") {
      next.delete("from");
      next.delete("to");
    }
    next.delete("page");
    start(() => router.push(`${pathname}?${next.toString()}`, { scroll: false }));
  }

  const period = params.get("period") ?? defaultPeriod;
  return (
    <div className={cn("no-print flex flex-wrap items-center gap-2", className)} aria-busy={pending}>
      <div className="inline-flex flex-wrap rounded-full bg-sunken p-1" role="radiogroup" aria-label="Period">
        {PERIODS.map((p) => (
          <button
            key={p.value}
            type="button"
            role="radio"
            aria-checked={period === p.value}
            onClick={() => set("period", p.value)}
            className={cn("rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition", period === p.value ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink")}
          >
            {p.label}
          </button>
        ))}
      </div>
      {period === "custom" ? (
        <div className="flex items-center gap-1.5 text-[13px]">
          <input type="date" defaultValue={params.get("from") ?? from} onChange={(e) => e.target.value && set("from", e.target.value)} className="h-9 rounded-full border border-line-strong bg-surface px-3" aria-label="From week" />
          <span className="text-muted">to</span>
          <input type="date" defaultValue={params.get("to") ?? to} onChange={(e) => e.target.value && set("to", e.target.value)} className="h-9 rounded-full border border-line-strong bg-surface px-3" aria-label="To week" />
        </div>
      ) : null}
      {show.site && sites ? (
        <Select value={params.get("site") ?? ""} onChange={(e) => set("site", e.target.value)} className="h-9 rounded-full py-0 text-[13px]" aria-label="Site">
          <option value="">All sites</option>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      ) : null}
      {show.reviewer && reviewers ? (
        <Select value={params.get("reviewer") ?? ""} onChange={(e) => set("reviewer", e.target.value)} className="h-9 rounded-full py-0 text-[13px]" aria-label="Reviewer">
          <option value="">All reviewers</option>
          {reviewers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      ) : null}
      {show.type ? (
        <Select value={params.get("type") ?? ""} onChange={(e) => set("type", e.target.value)} className="h-9 rounded-full py-0 text-[13px]" aria-label="Call type">
          <option value="">All call types</option>
          {CALL_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </Select>
      ) : null}
      {pending ? <Spinner className="text-brand" /> : null}
    </div>
  );
}
