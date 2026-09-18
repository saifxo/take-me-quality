import type { ReactNode } from "react";
import Link from "next/link";
import { TakeMeMark } from "@/components/brand/logo";

const BARS = [0.4, 0.7, 1, 0.55, 0.85, 0.45, 0.95, 0.6, 0.8, 0.5, 0.9, 0.65, 0.4, 0.75, 1, 0.5];

/** Split-screen frame for sign-in pages: brand panel on the left, form on the right. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-ink p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -bottom-40 -left-24 size-[520px] rounded-full bg-brand" aria-hidden />
        <div className="absolute -bottom-16 left-40 size-[300px] rounded-full bg-cyan/50 blur-3xl" aria-hidden />
        <Link href="/" className="relative flex items-center gap-3">
          <TakeMeMark inverted className="size-12" />
          <span className="font-display text-[24px] font-extrabold">Quality</span>
        </Link>
        <div className="relative max-w-md">
          <div className="mb-8 flex h-16 items-center gap-1" aria-hidden>
            {BARS.map((h, i) => (
              <span key={i} className="animate-wave block w-2 rounded-full bg-white/90" style={{ height: `${h * 100}%`, animationDelay: `${(i % 6) * -0.2}s` }} />
            ))}
          </div>
          <p className="font-display text-[44px] leading-[1.02] font-extrabold tracking-tight">Every call, the Take Me standard.</p>
          <p className="mt-4 text-[16px] leading-relaxed text-white/75">Score calls in about a minute, coach with clarity, and see quality across every site as it happens.</p>
        </div>
        <p className="font-display relative text-[20px] font-extrabold tracking-tight text-white italic">YES WE CAN!</p>
      </aside>
      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-[400px]">
          <Link href="/" className="mb-10 flex items-center gap-3 lg:hidden">
            <TakeMeMark className="size-11" />
            <span className="font-display text-[22px] font-extrabold">Quality</span>
          </Link>
          {children}
        </div>
      </section>
    </main>
  );
}
