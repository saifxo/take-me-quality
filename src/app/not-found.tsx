import Link from "next/link";
import { TakeMeMark } from "@/components/brand/logo";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f8f8f8] px-6 text-center">
      <div className="grid max-w-md justify-items-center gap-4">
        <TakeMeMark className="size-16" />
        <p className="font-display text-[64px] leading-none font-extrabold text-brand">404</p>
        <h1 className="font-display text-[30px] font-extrabold">This page took a wrong turn</h1>
        <p className="text-[15.5px] text-muted">The link may be old, or the review may have been removed.</p>
        <Link href="/" className="inline-flex h-11 items-center rounded-full bg-ink px-6 text-[14px] font-semibold text-white">
          Back to Take Me Quality
        </Link>
      </div>
    </main>
  );
}
