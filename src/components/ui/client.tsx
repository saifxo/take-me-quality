"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useOffline } from "next/offline";
import { buttonClass } from "./button";
import { cn } from "@/lib/utils";

export function Spinner({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={cn("size-4 animate-spin", className)} fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** Submit button that reflects the form's pending state (and says so when offline). */
export function SubmitButton({
  children,
  pendingText,
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { pendingText?: string; variant?: Parameters<typeof buttonClass>[0]; size?: Parameters<typeof buttonClass>[1] }) {
  const { pending } = useFormStatus();
  const offline = useOffline();
  return (
    <button type="submit" disabled={pending || props.disabled} aria-busy={pending} className={buttonClass(variant, size, className)} {...props}>
      {pending ? <Spinner /> : null}
      {pending ? (offline ? "Waiting for connection…" : (pendingText ?? children)) : children}
    </button>
  );
}

// ---------------------------------------------------------------- toasts
type Toast = { id: number; tone: "ok" | "error" | "info"; title: string; body?: string };
const ToastCtx = createContext<(t: Omit<Toast, "id">) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((xs) => [...xs.slice(-3), { ...t, id }]);
    setTimeout(() => setToasts((xs) => xs.filter((x) => x.id !== id)), t.tone === "error" ? 7000 : 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className={cn(
              "animate-rise pointer-events-auto flex gap-3 rounded-2xl border bg-surface p-4 shadow-[var(--shadow-float)]",
              t.tone === "error" ? "border-fail/30" : t.tone === "ok" ? "border-meets/30" : "border-line",
            )}
          >
            <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white", t.tone === "error" ? "bg-fail" : t.tone === "ok" ? "bg-meets" : "bg-brand")}>
              {t.tone === "error" ? "!" : t.tone === "ok" ? "✓" : "i"}
            </span>
            <div className="min-w-0">
              <p className="text-[14px] font-semibold">{t.title}</p>
              {t.body ? <p className="mt-0.5 text-[13px] text-muted">{t.body}</p> : null}
            </div>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

// ---------------------------------------------------------------- dialog
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={cn(
        "m-auto w-[min(560px,calc(100vw-2rem))] rounded-3xl border border-line bg-surface p-0 text-ink shadow-[var(--shadow-float)] backdrop:bg-ink/40 backdrop:backdrop-blur-[2px] open:animate-pop",
        className,
      )}
    >
      {open ? (
        <div className="p-6">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-[18px] font-semibold">{title}</h2>
              {description ? <p className="mt-1 text-[14px] text-muted">{description}</p> : null}
            </div>
            <button type="button" onClick={onClose} className="grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-sunken hover:text-ink" aria-label="Close">
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
          {children}
        </div>
      ) : null}
    </dialog>
  );
}

// ---------------------------------------------------------------- connectivity
export function OfflineBanner() {
  const offline = useOffline();
  if (!offline) return null;
  return (
    <div role="status" className="animate-rise fixed inset-x-0 top-0 z-[70] flex items-center justify-center gap-2 bg-ink px-4 py-2 text-[13px] font-medium text-white">
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-below opacity-75" />
        <span className="relative inline-flex size-2 rounded-full bg-below" />
      </span>
      You’re offline. Your work is kept here and anything pending will send when the connection returns.
    </div>
  );
}

export function CopyButton({ value, label = "Copy", className }: { value: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={buttonClass("outline", "sm", className)}
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? "Copied" : label}
    </button>
  );
}
