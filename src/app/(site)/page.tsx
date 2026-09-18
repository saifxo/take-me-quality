import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { HeroScene } from "@/components/brand/hero-scene";
import { TMQ_ISSUES, TMQ_SECTIONS } from "@/lib/framework/tmq";

const STEPS = [
  {
    title: "Listen",
    body: "Reviewers pick calls from the recordings portal and listen in full, exactly as they do today.",
    icon: <path d="M4 14v-2a8 8 0 0 1 16 0v2M4 14h3v6H5a1 1 0 0 1-1-1zm16 0h-3v6h2a1 1 0 0 0 1-1z" />,
  },
  {
    title: "Score",
    body: "Paste the call row, then one tap per check. The rubric sits beside every question and the score updates live.",
    icon: <path d="M9 11l2 2 4-4M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />,
  },
  {
    title: "Coach",
    body: "Managers see every agent’s week at a glance, with clear strengths, focus areas and coaching notes.",
    icon: <path d="M17 20h5v-2a3 3 0 0 0-5.4-1.8M9 20H2v-2a4 4 0 0 1 7.6-1.7M15 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm6 3a2 2 0 1 1-4 0 2 2 0 0 1 4 0z" />,
  },
  {
    title: "Improve",
    body: "Trends by site and by check show where training lands, week on week, across every Take Me town.",
    icon: <path d="M3 17l6-6 4 4 8-8M15 7h6v6" />,
  },
];

const PILLAR_ICONS: Record<string, React.ReactNode> = {
  greeting: <path d="M7 8h10M7 12h6m-9 8 3-3h11a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v14z" />,
  booking: <path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" />,
  interaction: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z" />,
  closure: <path d="M20 6 9 17l-5-5" />,
};

export default function HomePage() {
  const totalChecks = TMQ_SECTIONS.reduce((s, x) => s + x.criteria.length, 0);
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-[#f8f8f8]">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-5 pt-14 pb-20 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:pt-20">
          <div className="animate-rise">
            <p className="inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-1.5 text-[13px] font-semibold text-ink-2 shadow-sm">
              <span className="size-2 rounded-full bg-brand" /> Take Me Quality · TMQ
            </p>
            <h1 className="font-display mt-5 text-[46px] leading-[1.02] font-extrabold tracking-[-0.02em] text-ink sm:text-[62px]">
              Listen. Score. Coach.
              <span className="block text-brand">It’s that simple!</span>
            </h1>
            <p className="mt-5 max-w-xl text-[18px] leading-relaxed text-ink-2">
              TMQ is the standard behind every Take Me booking call: {totalChecks} checks, four pillars, and zero tolerance for the moments that matter most to our
              customers.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/login" size="lg" variant="primary">
                Sign in to TMQ
              </ButtonLink>
              <ButtonLink href="/standard" size="lg" variant="brand">
                See the standard
              </ButtonLink>
            </div>
            <dl className="mt-10 grid max-w-lg grid-cols-3 gap-6">
              {[
                [String(totalChecks), "checks on every call"],
                ["4", "pillars of a great call"],
                [String(TMQ_ISSUES.length), "zero-tolerance rules"],
              ].map(([v, l]) => (
                <div key={l}>
                  <dt className="sr-only">{l}</dt>
                  <dd className="font-display text-[34px] leading-none font-extrabold">{v}</dd>
                  <dd className="mt-1 text-[13px] leading-snug text-muted">{l}</dd>
                </div>
              ))}
            </dl>
          </div>
          <HeroScene />
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="scroll-mt-20 bg-white">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
          <div className="max-w-2xl">
            <p className="text-[13px] font-semibold tracking-[0.1em] text-brand-700 uppercase">How it works</p>
            <h2 className="font-display mt-2 text-[40px] leading-[1.05] font-extrabold tracking-tight sm:text-[48px]">From one call to a better week</h2>
          </div>
          <ol className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="group relative rounded-3xl border border-line bg-white p-6 transition hover:-translate-y-1 hover:shadow-[var(--shadow-float)]">
                <div className="flex items-center justify-between">
                  <span className="grid size-12 place-items-center rounded-2xl bg-ink text-white transition group-hover:bg-brand">
                    <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      {s.icon}
                    </svg>
                  </span>
                  <span className="font-display text-[40px] leading-none font-extrabold text-sunken">{i + 1}</span>
                </div>
                <h3 className="mt-5 text-[20px] font-bold">{s.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-muted">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Pillars */}
      <section className="bg-[#f8f8f8]">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-2xl">
              <p className="text-[13px] font-semibold tracking-[0.1em] text-brand-700 uppercase">The TMQ framework</p>
              <h2 className="font-display mt-2 text-[40px] leading-[1.05] font-extrabold tracking-tight sm:text-[48px]">Four pillars of a great Take Me call</h2>
            </div>
            <ButtonLink href="/standard" variant="outline">
              Read every check
            </ButtonLink>
          </div>
          <div className="mt-12 grid gap-5 md:grid-cols-2">
            {TMQ_SECTIONS.map((s) => (
              <article key={s.key} className="rounded-[32px] bg-ink p-7 text-white">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-display text-[28px] leading-tight font-extrabold">{s.name.split(" – ")[0]}</h3>
                    <p className="mt-1 text-[14px] text-white/60">{s.criteria.length} checks</p>
                  </div>
                  <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand">
                    <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      {PILLAR_ICONS[s.key]}
                    </svg>
                  </span>
                </div>
                <ul className="mt-6 flex flex-wrap gap-2">
                  {s.criteria.slice(0, 5).map((c) => (
                    <li key={c.key} className="rounded-full bg-white/10 px-3 py-1.5 text-[13px] text-white/90">
                      {c.title.split(" – ")[0]}
                    </li>
                  ))}
                  {s.criteria.length > 5 ? <li className="rounded-full px-3 py-1.5 text-[13px] text-cyan">+{s.criteria.length - 5} more</li> : null}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Zero tolerance */}
      <section className="bg-brand text-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[1fr_1.3fr] lg:items-center">
          <div>
            <p className="text-[13px] font-semibold tracking-[0.1em] text-white/80 uppercase">Zero tolerance</p>
            <h2 className="font-display mt-2 text-[38px] leading-[1.05] font-extrabold tracking-tight">Some moments aren’t scored. They’re non-negotiable.</h2>
            <p className="mt-4 max-w-md text-[16px] leading-relaxed text-white/85">Any one of these on a call means the call fails, whatever else went right, and it reaches a manager straight away.</p>
          </div>
          <ul className="flex flex-wrap gap-2.5">
            {TMQ_ISSUES.map((i) => (
              <li key={i.key} className="rounded-full bg-black/15 px-4 py-2 text-[14px] font-semibold ring-1 ring-white/25 backdrop-blur-sm">
                {i.title}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* For teams */}
      <section id="for-teams" className="scroll-mt-20 bg-white">
        <div className="mx-auto grid max-w-7xl gap-6 px-5 py-20 sm:px-8 lg:grid-cols-2">
          {[
            {
              tag: "For quality reviewers",
              title: "Score a call in about a minute",
              points: [
                "Paste rows straight from the recordings portal. Agent, site, time and duration fill themselves in.",
                "One tap per check, keyboard shortcuts, and the rubric right beside each question.",
                "A live score with every deduction explained before you submit.",
                "Drafts save as you go, even if the connection drops.",
              ],
            },
            {
              tag: "For managers",
              title: "See every agent’s week at a glance",
              points: [
                "Live dashboards by site, agent, reviewer and check, compared with last week.",
                "Agent profiles ready for one-to-ones, with manual or AI coaching summaries you edit and approve.",
                "Customer details stay out of notes, reports and AI requests, so UK GDPR compliance is maintained.",
                "Clear alerts for zero-tolerance breaches and agents slipping below KPI.",
                "Rules and thresholds you control, with every change versioned and logged.",
              ],
            },
          ].map((b, idx) => (
            <article key={b.tag} className={idx === 0 ? "rounded-[32px] border border-line p-8" : "rounded-[32px] bg-[#f8f8f8] p-8"}>
              <p className="text-[13px] font-semibold tracking-[0.1em] text-brand-700 uppercase">{b.tag}</p>
              <h3 className="font-display mt-2 text-[32px] leading-tight font-extrabold">{b.title}</h3>
              <ul className="mt-6 grid gap-3.5">
                {b.points.map((p) => (
                  <li key={p} className="flex gap-3 text-[15.5px] leading-relaxed text-ink-2">
                    <span className="mt-1 grid size-5 shrink-0 place-items-center rounded-full bg-brand text-[11px] font-bold text-white">✓</span>
                    {p}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      {/* Values + CTA */}
      <section className="bg-[#f8f8f8]">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
          <div className="relative overflow-hidden rounded-[36px] bg-ink px-8 py-14 text-white sm:px-14">
            <div className="absolute -top-24 -right-24 size-80 rounded-full bg-brand/40 blur-3xl" aria-hidden />
            <div className="relative grid gap-8 lg:grid-cols-[1.4fr_1fr] lg:items-center">
              <div>
                <p className="text-[13px] font-semibold tracking-[0.1em] text-cyan uppercase">Integrity · Innovation · Sustainability · Customer focus</p>
                <h2 className="font-display mt-3 text-[40px] leading-[1.05] font-extrabold tracking-tight sm:text-[46px]">Every call is a Take Me promise.</h2>
                <p className="mt-4 max-w-xl text-[16px] leading-relaxed text-white/75">Reviewers and managers sign in with the account their admin created for them.</p>
              </div>
              <div className="flex flex-wrap gap-3 lg:justify-end">
                <ButtonLink href="/login" variant="brand" size="lg">
                  Sign in
                </ButtonLink>
                <Link href="/standard" className="inline-flex h-12 items-center rounded-full px-6 text-[15px] font-semibold text-white ring-1 ring-white/30 hover:bg-white/10">
                  The standard
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
