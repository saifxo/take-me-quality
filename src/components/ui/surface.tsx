import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Band } from "@/lib/scoring/engine";

export function Card({ className, ...props }: ComponentProps<"section">) {
  return <section className={cn("rounded-[var(--radius-card)] border border-line bg-surface shadow-[var(--shadow-card)]", className)} {...props} />;
}

export function CardHeader({ title, description, action, className }: { title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <header className={cn("flex flex-wrap items-start justify-between gap-3 px-5 pt-5 pb-3", className)}>
      <div className="min-w-0">
        <h2 className="text-[15.5px] font-semibold tracking-[-0.005em] text-ink">{title}</h2>
        {description ? <p className="mt-0.5 text-[13px] text-muted">{description}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </header>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-6 flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="min-w-0 max-w-3xl">
        {eyebrow ? <p className="mb-1.5 text-[12px] font-semibold tracking-[0.08em] text-brand-700 uppercase">{eyebrow}</p> : null}
        <h1 className="font-display text-[30px] leading-[1.05] font-extrabold tracking-[-0.01em] text-ink sm:text-[34px]">{title}</h1>
        {description ? <p className="mt-2 text-[15px] leading-relaxed text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Badge({ className, tone = "neutral", ...props }: ComponentProps<"span"> & { tone?: "neutral" | "brand" | "warn" | "danger" | "ok" | "outline" }) {
  const tones = {
    neutral: "bg-sunken text-ink-2",
    brand: "bg-brand-50 text-brand-700",
    warn: "bg-below-soft text-below-ink",
    danger: "bg-fail-soft text-fail",
    ok: "bg-meets-soft text-meets",
    outline: "border border-line-strong text-ink-2",
  } as const;
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] font-semibold whitespace-nowrap", tones[tone], className)} {...props} />;
}

const BAND_META: Record<Band, { label: string; icon: string; pill: string; dot: string }> = {
  perfect: { label: "Perfect", icon: "★", pill: "bg-perfect-soft", dot: "bg-perfect" },
  meets: { label: "Meets KPI", icon: "✓", pill: "bg-meets-soft", dot: "bg-meets" },
  below: { label: "Below KPI", icon: "!", pill: "bg-below-soft", dot: "bg-below" },
  fail: { label: "Fail", icon: "✕", pill: "bg-fail-soft", dot: "bg-fail" },
};

/** Status is never colour alone: every band shows an icon and a label. */
export function BandPill({ band, autoFail, size = "md", className }: { band: Band | null | undefined; autoFail?: boolean; size?: "sm" | "md"; className?: string }) {
  if (!band) return <span className="text-[13px] text-faint">Not scored</span>;
  const m = BAND_META[band];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full font-semibold whitespace-nowrap text-ink", m.pill, size === "sm" ? "py-0.5 pr-2 pl-1 text-[11.5px]" : "py-1 pr-3 pl-1.5 text-[12.5px]", className)}>
      <i aria-hidden className={cn("grid place-items-center rounded-full text-[10px] font-extrabold not-italic text-white", m.dot, size === "sm" ? "size-4" : "size-[18px]")}>
        {m.icon}
      </i>
      {band === "fail" && autoFail ? "Auto-fail" : m.label}
    </span>
  );
}

export function bandTextClass(band: Band | null | undefined) {
  return band === "fail" ? "text-fail" : band === "below" ? "text-below-ink" : band === "perfect" ? "text-perfect" : band === "meets" ? "text-meets" : "text-muted";
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton", className)} />;
}

export function EmptyState({ icon, title, children, action, className }: { icon?: ReactNode; title: ReactNode; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 px-6 py-12 text-center", className)}>
      {icon ? <div className="grid size-14 place-items-center rounded-2xl bg-brand-50 text-brand-700">{icon}</div> : null}
      <h3 className="text-[16px] font-semibold">{title}</h3>
      {children ? <div className="max-w-md text-[14px] leading-relaxed text-muted">{children}</div> : null}
      {action}
    </div>
  );
}

export function StatTile({
  label,
  value,
  delta,
  deltaGood,
  hint,
  className,
  children,
}: {
  label: ReactNode;
  value: ReactNode;
  delta?: string | null;
  deltaGood?: boolean | null;
  hint?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <Card className={cn("flex flex-col gap-1.5 p-5", className)}>
      <p className="text-[13px] font-medium text-muted">{label}</p>
      <div className="flex items-baseline gap-2">
        <p className="text-[30px] leading-none font-semibold tracking-[-0.02em] text-ink">{value}</p>
        {delta ? (
          <span className={cn("text-[12.5px] font-semibold tabular", deltaGood === null || deltaGood === undefined ? "text-muted" : deltaGood ? "text-meets" : "text-fail")}>{delta}</span>
        ) : null}
      </div>
      {hint ? <p className="text-[12.5px] text-muted">{hint}</p> : null}
      {children}
    </Card>
  );
}

export function TableWrap({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("scrollbar-thin overflow-x-auto", className)}>{children}</div>;
}

export const th = "bg-sunken/70 px-4 py-2.5 text-left text-[11.5px] font-semibold tracking-[0.05em] whitespace-nowrap text-muted uppercase first:rounded-l-lg last:rounded-r-lg";
export const td = "border-b border-line px-4 py-3 align-middle text-[14px]";
