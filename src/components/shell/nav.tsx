"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BookOpen,
  Building,
  ClipboardPaste,
  Gauge,
  Inbox,
  ListChecks,
  Menu,
  ScrollText,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Upload,
  UserCog,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Wordmark } from "@/components/brand/logo";

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS; badge?: number; exact?: boolean };
export type NavGroup = { title?: string; items: NavItem[] };

const ICONS = {
  gauge: Gauge,
  users: Users,
  list: ListChecks,
  sparkles: Sparkles,
  inbox: Inbox,
  paste: ClipboardPaste,
  book: BookOpen,
  building: Building,
  userCog: UserCog,
  sliders: SlidersHorizontal,
  upload: Upload,
  scroll: ScrollText,
  shield: ShieldCheck,
  user: UserRound,
} satisfies Record<string, LucideIcon>;

function PendingDot() {
  const { pending } = useLinkStatus();
  return <span aria-hidden className={cn("ml-auto size-1.5 rounded-full bg-cyan transition-opacity", pending ? "animate-pulse opacity-100" : "opacity-0")} />;
}

function NavLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
  const Icon = ICONS[item.icon];
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex items-center gap-3 rounded-xl px-3 py-2 text-[14px] font-medium transition-colors",
        active ? "bg-white text-ink shadow-sm" : "text-white/70 hover:bg-white/[0.07] hover:text-white",
      )}
    >
      <Icon className={cn("size-[18px] shrink-0", active ? "text-brand" : "text-white/50 group-hover:text-white/80")} strokeWidth={1.9} />
      <span className="truncate">{item.label}</span>
      {item.badge ? (
        <span className={cn("ml-auto rounded-full px-1.5 text-[11px] leading-5 font-bold tabular", active ? "bg-brand text-white" : "bg-cyan text-ink")}>{item.badge}</span>
      ) : (
        <PendingDot />
      )}
    </Link>
  );
}

export function NavList({ groups, onNavigate }: { groups: NavGroup[]; onNavigate?: () => void }) {
  return (
    <nav aria-label="App" className="grid gap-6">
      {groups.map((g, i) => (
        <div key={g.title ?? i} className="grid gap-1">
          {g.title ? <p className="px-3 pb-1 text-[11px] font-semibold tracking-[0.12em] text-white/35 uppercase">{g.title}</p> : null}
          {g.items.map((it) => (
            <NavLink key={it.href} item={it} onNavigate={onNavigate} />
          ))}
        </div>
      ))}
    </nav>
  );
}

/** Top bar + slide-over menu for small screens. */
export function MobileNav({ groups, footer }: { groups: NavGroup[]; footer: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <>
      <div className="no-print sticky top-0 z-40 flex h-14 items-center justify-between border-b border-white/10 bg-ink px-4 lg:hidden">
        <Wordmark inverted href="/qa" className="[&_svg]:size-8" />
        <button type="button" onClick={() => setOpen(true)} className="grid size-10 place-items-center rounded-xl text-white hover:bg-white/10" aria-label="Open menu">
          <Menu className="size-5" />
        </button>
      </div>
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu" key={pathname}>
          <button type="button" className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]" aria-label="Close menu" onClick={() => setOpen(false)} />
          <div className="animate-rise absolute inset-y-0 left-0 flex w-[min(300px,85vw)] flex-col gap-6 overflow-y-auto bg-ink p-4">
            <div className="flex items-center justify-between">
              <Wordmark inverted href="/qa" />
              <button type="button" onClick={() => setOpen(false)} className="grid size-9 place-items-center rounded-xl text-white hover:bg-white/10" aria-label="Close menu">
                <X className="size-5" />
              </button>
            </div>
            <NavList groups={groups} onNavigate={() => setOpen(false)} />
            <div className="mt-auto">{footer}</div>
          </div>
        </div>
      ) : null}
    </>
  );
}
