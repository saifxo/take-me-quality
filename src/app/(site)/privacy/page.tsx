import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy notice" };

const SECTIONS: [string, string[]][] = [
  ["What we hold", [
    "For each reviewed call: the agent, site, call time, duration, call type, the reviewer’s answers and notes, and the resulting score.",
    "Caller numbers are never stored in full. We keep a masked version (for example 077•• •••123) and a one-way keyed hash used only to spot duplicate reviews.",
    "For people who sign in: name, work email, role, and sign-in history for security.",
  ]],
  ["Why we hold it", [
    "To keep call quality consistent, to coach and support agents, and to meet our obligations to customers.",
    "Scores are one input to coaching conversations; they are always reviewed by a person.",
  ]],
  ["Who can see it", [
    "Quality reviewers see the reviews they create. Admins see all reviews, dashboards and agent profiles.",
    "Every change to a review, account or rule is recorded in an audit log.",
  ]],
  ["AI assistance", [
    "Summaries are Manual by default: they are built from the scores inside Take Me Quality and no data leaves the platform.",
    "When a manager chooses AI, Google Gemini helps summarise reviews and tidy reviewer notes. Customer numbers, addresses, postcodes and emails are removed before anything is sent, and agents are referred to by first name only, so UK GDPR compliance is maintained. AI-written text is labelled and approved by a manager before it is shared.",
  ]],
  ["Where it lives", [
    "Data is stored in a managed PostgreSQL database hosted in the United Kingdom region, encrypted in transit and at rest.",
  ]],
  ["UK GDPR", [
    "Take Me Quality is run in line with UK GDPR: we collect only what quality review needs, mask caller numbers, keep customer details out of notes and AI requests, record every change in an audit log, and host data in the UK region.",
  ]],
  ["Your rights", [
    "Agents and staff can ask their manager for a copy of the quality data held about them, or ask for anything inaccurate to be corrected.",
  ]],
];

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-16 sm:px-8">
      <p className="text-[13px] font-semibold tracking-[0.1em] text-brand-700 uppercase">Take Me Quality</p>
      <h1 className="font-display mt-2 text-[44px] leading-tight font-extrabold">Privacy notice</h1>
      <p className="mt-4 text-[17px] leading-relaxed text-ink-2">How Take Me Quality handles information about calls, customers and colleagues.</p>
      <div className="mt-10 grid gap-8">
        {SECTIONS.map(([h, ps]) => (
          <section key={h}>
            <h2 className="text-[20px] font-bold">{h}</h2>
            {ps.map((p) => (
              <p key={p} className="mt-2 text-[15.5px] leading-relaxed text-ink-2">
                {p}
              </p>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
