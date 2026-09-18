import Link from "next/link";
import { cn } from "@/lib/utils";

/** The Take Me speech-bubble mark. */
export function TakeMeMark({ className, inverted = false }: { className?: string; inverted?: boolean }) {
  const fill = inverted ? "#ffffff" : "#000000";
  const ink = inverted ? "#000000" : "#ffffff";
  return (
    <svg viewBox="0 0 64 66" className={cn("size-10", className)} role="img" aria-label="Take Me">
      <path d="M14 2h36c6.6 0 12 5.4 12 12v28c0 6.6-5.4 12-12 12H22l-11 10 1.5-10.4C6.6 52.6 2 47.6 2 42V14C2 7.4 7.4 2 14 2z" fill={fill} />
      <text x="32" y="27" textAnchor="middle" fill={ink} style={{ fontFamily: "var(--font-baloo)", fontWeight: 800, fontSize: 19, letterSpacing: "-0.5px" }}>
        take
      </text>
      <text x="32" y="45.5" textAnchor="middle" fill={ink} style={{ fontFamily: "var(--font-baloo)", fontWeight: 800, fontSize: 19, letterSpacing: "-0.5px" }}>
        me
      </text>
    </svg>
  );
}

export function Wordmark({ inverted = false, className, href = "/" }: { inverted?: boolean; className?: string; href?: string }) {
  return (
    <Link href={href} className={cn("group flex items-center gap-2.5", className)} aria-label="Take Me Quality home">
      <TakeMeMark inverted={inverted} className="size-10 transition-transform group-hover:-rotate-3" />
      <span className="flex flex-col leading-none">
        <span className={cn("font-display text-[21px] font-extrabold tracking-[-0.01em]", inverted ? "text-white" : "text-ink")}>Quality</span>
        <span className={cn("mt-0.5 text-[10.5px] font-semibold tracking-[0.14em] uppercase", inverted ? "text-white/60" : "text-muted")}>TMQ · Take Me</span>
      </span>
    </Link>
  );
}
