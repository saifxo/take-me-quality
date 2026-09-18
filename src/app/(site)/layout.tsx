import Link from "next/link";
import { Wordmark } from "@/components/brand/logo";
import { ButtonLink } from "@/components/ui/button";

export default function SiteLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="sticky top-0 z-40 border-b border-transparent bg-white/85 backdrop-blur-md supports-[backdrop-filter]:bg-white/70">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between gap-6 px-5 sm:px-8">
          <Wordmark />
          <nav className="hidden items-center gap-1 text-[15px] font-medium text-ink-2 md:flex" aria-label="Main">
            <Link href="/#how-it-works" className="rounded-full px-4 py-2 hover:bg-sunken">How it works</Link>
            <Link href="/standard" className="rounded-full px-4 py-2 hover:bg-sunken">The standard</Link>
            <Link href="/#for-teams" className="rounded-full px-4 py-2 hover:bg-sunken">For teams</Link>
          </nav>
          <ButtonLink href="/login" variant="primary" size="md" className="px-6">
            Sign in
          </ButtonLink>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="bg-ink text-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:px-8 md:grid-cols-[1.4fr_1fr_1fr]">
          <div className="grid content-start gap-4">
            <Wordmark inverted />
            <p className="max-w-sm text-[14.5px] leading-relaxed text-white/70">
              Take Me Quality is how Take Me keeps every booking call to one clear standard, across every town we serve.
            </p>
            <p className="font-display text-[22px] font-extrabold tracking-tight text-cyan italic">YES WE CAN!</p>
          </div>
          <div className="grid content-start gap-2.5 text-[14.5px]">
            <p className="text-[12px] font-semibold tracking-[0.12em] text-white/50 uppercase">Programme</p>
            <Link href="/#how-it-works" className="text-white/80 hover:text-white">How it works</Link>
            <Link href="/standard" className="text-white/80 hover:text-white">The TMQ standard</Link>
            <Link href="/standard#zero-tolerance" className="text-white/80 hover:text-white">Zero tolerance</Link>
          </div>
          <div className="grid content-start gap-2.5 text-[14.5px]">
            <p className="text-[12px] font-semibold tracking-[0.12em] text-white/50 uppercase">Team</p>
            <Link href="/login" className="text-white/80 hover:text-white">Reviewer &amp; admin sign-in</Link>
            <Link href="/privacy" className="text-white/80 hover:text-white">Privacy notice</Link>
            <a href="https://takeme.taxi" target="_blank" rel="noreferrer" className="text-white/80 hover:text-white">takeme.taxi ↗</a>
          </div>
        </div>
        <div className="border-t border-white/10">
          <p className="mx-auto max-w-7xl px-5 py-5 text-[12.5px] text-white/50 sm:px-8">© {new Date().getFullYear()} Take Me Group · Loughborough, United Kingdom · Internal quality platform</p>
        </div>
      </footer>
    </div>
  );
}
