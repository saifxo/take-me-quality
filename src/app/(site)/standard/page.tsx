import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";
import { APPROVED_GREETINGS, TMQ_ISSUES, TMQ_SECTIONS } from "@/lib/framework/tmq";

export const metadata: Metadata = { title: "The TMQ standard" };

const firstSentence = (s: string) => (s.match(/^.*?[.!?](\s|$)/)?.[0] ?? s).trim();

export default function StandardPage() {
  return (
    <div className="bg-white">
      <section className="bg-[#f8f8f8]">
        <div className="mx-auto max-w-5xl px-5 pt-16 pb-14 sm:px-8">
          <p className="text-[13px] font-semibold tracking-[0.1em] text-brand-700 uppercase">The TMQ standard</p>
          <h1 className="font-display mt-2 text-[44px] leading-[1.03] font-extrabold tracking-tight sm:text-[56px]">What a great Take Me call sounds like</h1>
          <p className="mt-5 max-w-2xl text-[18px] leading-relaxed text-ink-2">
            Every reviewed call is marked against the same checks. Each one is a clear Yes, Partial or No, and checks that don’t apply to the call are marked N/A so they
            never count against the agent.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {[
              ["Yes = full marks", "Partial = half, No = none"],
              ["Critical checks", "Names, addresses, accounts, special bookings and airports carry extra weight"],
              ["Above 90%", "is the KPI line every call aims for"],
            ].map(([a, b]) => (
              <div key={a} className="rounded-2xl bg-white p-5 shadow-sm">
                <p className="text-[16px] font-bold">{a}</p>
                <p className="mt-1 text-[14px] leading-snug text-muted">{b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-5 py-16 sm:px-8">
        <div className="grid gap-12">
          {TMQ_SECTIONS.map((s, si) => (
            <section key={s.key} aria-labelledby={`sec-${s.key}`}>
              <div className="flex items-baseline gap-4">
                <span className="font-display text-[44px] leading-none font-extrabold text-brand">{si + 1}</span>
                <h2 id={`sec-${s.key}`} className="font-display text-[30px] leading-tight font-extrabold">
                  {s.name}
                </h2>
              </div>
              <ul className="mt-6 grid gap-3 md:grid-cols-2">
                {s.criteria.map((c) => (
                  <li key={c.key} className="rounded-2xl border border-line p-5">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-[16px] font-bold">{c.title}</h3>
                      {c.penaltyNo ? <span className="shrink-0 rounded-full bg-fail-soft px-2.5 py-0.5 text-[11.5px] font-semibold text-fail">Critical</span> : null}
                    </div>
                    <p className="mt-1.5 text-[14.5px] leading-relaxed text-muted">{firstSentence(c.description)}</p>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          <section id="zero-tolerance" className="scroll-mt-24 rounded-[32px] bg-ink p-8 text-white sm:p-10">
            <h2 className="font-display text-[32px] leading-tight font-extrabold">Zero tolerance</h2>
            <p className="mt-2 max-w-2xl text-[15.5px] text-white/75">Any one of these means the call scores 0%, whatever else went right.</p>
            <ul className="mt-6 grid gap-3 md:grid-cols-2">
              {TMQ_ISSUES.map((i) => (
                <li key={i.key} className="rounded-2xl bg-white/[0.06] p-4 ring-1 ring-white/10">
                  <p className="font-semibold text-cyan">{i.title}</p>
                  <p className="mt-1 text-[14px] leading-relaxed text-white/75">{i.description}</p>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-[32px] border border-line p-8">
            <h2 className="text-[20px] font-bold">Our name, said the same way every time</h2>
            <p className="mt-2 text-[15px] text-muted">
              Approved greetings: {APPROVED_GREETINGS.map((g) => `“${g}”`).join(" and ")}. Older company names are not used on calls.
            </p>
            <ButtonLink href="/login" className="mt-6" variant="primary">
              Reviewers: open the full marking guide
            </ButtonLink>
          </section>
        </div>
      </div>
    </div>
  );
}
