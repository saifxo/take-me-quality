import type { Metadata } from "next";
import { TakeMeMark } from "@/components/brand/logo";

export const metadata: Metadata = { title: "You’re offline" };
export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <main className="grid min-h-screen place-items-center bg-ink px-6 text-center text-white">
      <div className="grid max-w-md justify-items-center gap-5">
        <TakeMeMark inverted className="size-16" />
        <h1 className="font-display text-[36px] leading-tight font-extrabold">You’re offline</h1>
        <p className="text-[16px] leading-relaxed text-white/75">
          Take Me Quality needs a connection to load this page. Reviews you were working on are kept in this browser and will carry on when you’re back online.
        </p>
        <a href="/qa" className="inline-flex h-11 items-center rounded-full bg-brand px-6 text-[14px] font-semibold text-white">
          Try again
        </a>
      </div>
    </main>
  );
}
