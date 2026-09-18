import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

const control =
  "w-full rounded-xl border border-line-strong bg-surface px-3.5 text-[14.5px] text-ink placeholder:text-faint shadow-[inset_0_1px_0_rgb(11_15_18/0.03)] transition focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15 disabled:bg-sunken disabled:text-muted aria-[invalid=true]:border-fail aria-[invalid=true]:ring-fail/15";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(control, "h-11", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(control, "min-h-24 py-2.5 leading-relaxed", className)} {...props} />;
}

export function Select({ className, children, wrapperClassName, ...props }: ComponentProps<"select"> & { wrapperClassName?: string }) {
  return (
    <div className={cn("relative", wrapperClassName)}>
      <select className={cn(control, "h-11 appearance-none pr-9", className)} {...props}>
        {children}
      </select>
      <svg aria-hidden viewBox="0 0 24 24" className="pointer-events-none absolute top-1/2 right-3.5 size-3.5 -translate-y-1/2 text-muted" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="m6 9 6 6 6-6" />
      </svg>
    </div>
  );
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={cn("text-[13px] font-semibold text-ink-2", className)} {...props} />;
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p className="text-[12.5px] font-medium text-fail" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[12.5px] text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="animate-pop rounded-xl border border-fail/30 bg-fail-soft px-4 py-3 text-sm font-medium text-ink">
      {message}
    </div>
  );
}
