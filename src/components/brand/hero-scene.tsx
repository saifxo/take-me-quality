/**
 * Home-page illustration: a live call waveform feeding a TMQ scorecard, set on the brand's blue disc.
 * Pure HTML/SVG, animated with CSS (respects reduced-motion).
 */
const BARS = [0.35, 0.6, 0.9, 0.5, 0.75, 1, 0.55, 0.8, 0.4, 0.95, 0.65, 0.45, 0.85, 0.55, 0.7, 0.4, 0.9, 0.6, 0.35, 0.75];

const ROWS = [
  { label: "Correct company greeting", a: "Yes" },
  { label: "Full address confirmed", a: "Yes" },
  { label: "ETA handled tactfully", a: "Partial" },
  { label: "Confident call closure", a: "Yes" },
];

export function HeroScene() {
  return (
    <div className="relative mx-auto aspect-[1.05] w-full max-w-[560px]">
      {/* Blue disc + soft waves, echoing takeme.taxi */}
      <div className="absolute inset-x-[6%] top-[8%] bottom-0 rounded-full bg-brand" />
      <div className="absolute inset-x-[14%] top-[16%] bottom-[8%] rounded-full bg-cyan/40 blur-2xl" />
      <svg className="absolute inset-x-0 bottom-0 w-full" viewBox="0 0 560 120" aria-hidden>
        <path d="M0 70c70-30 140-30 210 0s140 30 210 0 100-24 140-10v60H0z" fill="#f8f8f8" opacity="0.6" />
        <path d="M0 92c80-26 150-26 230 0s150 26 230 0 70-18 100-8v36H0z" fill="#f8f8f8" />
      </svg>

      {/* Live call card */}
      <div className="animate-float absolute top-[10%] left-0 w-[58%] rounded-3xl bg-ink p-4 text-white shadow-[var(--shadow-float)] [animation-delay:-2s]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-cyan opacity-70" />
              <span className="relative inline-flex size-2.5 rounded-full bg-cyan" />
            </span>
            <span className="text-[12px] font-semibold tracking-wide text-white/80 uppercase">Demo queue 901</span>
          </div>
          <span className="font-mono text-[12px] text-white/60">01:25</span>
        </div>
        <div className="mt-4 flex h-14 items-center gap-[3px]" aria-hidden>
          {BARS.map((h, i) => (
            <span
              key={i}
              className="animate-wave block w-full origin-center rounded-full bg-gradient-to-t from-brand to-cyan"
              style={{ height: `${h * 100}%`, animationDelay: `${(i % 7) * -0.17}s` }}
            />
          ))}
        </div>
        <p className="mt-3 text-[13px] leading-snug text-white/85">“Good morning, Take Me, Demo Ava speaking — how can I help?”</p>
      </div>

      {/* Scorecard card */}
      <div className="animate-float absolute right-0 bottom-[14%] w-[62%] rounded-3xl border border-line bg-surface p-4 shadow-[var(--shadow-float)]">
        <div className="flex items-center justify-between">
          <p className="text-[12px] font-semibold tracking-[0.08em] text-muted uppercase">TMQ scorecard</p>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-meets-soft py-0.5 pr-2.5 pl-1 text-[11.5px] font-semibold text-ink">
            <i className="grid size-4 place-items-center rounded-full bg-meets text-[9px] font-extrabold not-italic text-white">✓</i>
            Meets KPI
          </span>
        </div>
        <p className="mt-2 text-[40px] leading-none font-semibold tracking-[-0.03em]">97.2%</p>
        <ul className="mt-3 grid gap-1.5">
          {ROWS.map((r) => (
            <li key={r.label} className="flex items-center justify-between gap-2 text-[12.5px]">
              <span className="truncate text-ink-2">{r.label}</span>
              <span
                className={
                  r.a === "Yes"
                    ? "rounded-full bg-meets-soft px-2 py-0.5 text-[11px] font-semibold text-meets"
                    : "rounded-full bg-below-soft px-2 py-0.5 text-[11px] font-semibold text-below-ink"
                }
              >
                {r.a}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Headset badge */}
      <div className="absolute top-[2%] right-[8%] grid size-16 place-items-center rounded-2xl bg-surface shadow-[var(--shadow-float)]">
        <svg viewBox="0 0 24 24" className="size-8 text-ink" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
          <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
          <rect x="3" y="13" width="4" height="7" rx="1.5" fill="#00a6eb" stroke="#00a6eb" />
          <rect x="17" y="13" width="4" height="7" rx="1.5" fill="#00a6eb" stroke="#00a6eb" />
          <path d="M19 20a4 4 0 0 1-4 3h-2" />
        </svg>
      </div>
    </div>
  );
}
