import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { db } from "@/db";
import { agents, evaluations } from "@/db/schema";
import { requireUser } from "@/server/auth/dal";
import { logoutAction } from "@/app/actions/auth";
import { Wordmark } from "@/components/brand/logo";
import { MobileNav, NavList, type NavGroup } from "@/components/shell/nav";
import { InstallAppButton } from "@/components/shell/pwa";
import { initials } from "@/lib/utils";

async function counts(userId: string, isAdmin: boolean) {
  const [[queue], pending] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(evaluations)
      .where(and(eq(evaluations.reviewerId, userId), inArray(evaluations.status, ["queued", "draft"]), isNull(evaluations.deletedAt))),
    isAdmin ? db.select({ n: sql<number>`count(*)::int` }).from(agents).where(eq(agents.status, "pending")) : Promise.resolve([{ n: 0 }]),
  ]);
  return { queue: queue.n, pendingAgents: pending[0].n };
}

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const isAdmin = user.role === "admin";
  const c = await counts(user.id, isAdmin);

  const reviewing: NavGroup = {
    title: isAdmin ? "Reviewing" : undefined,
    items: [
      { href: "/qa", label: "Today", icon: "inbox", badge: c.queue || undefined, exact: true },
      { href: "/qa/new", label: "Score a call", icon: "paste" },
      { href: "/qa/reviews", label: "My reviews", icon: "list" },
    ],
  };
  const groups: NavGroup[] = isAdmin
    ? [
        {
          title: "Insight",
          items: [
            { href: "/admin", label: "Dashboard", icon: "gauge", exact: true },
            { href: "/admin/agents", label: "Agents", icon: "users", badge: c.pendingAgents || undefined },
            { href: "/admin/evaluations", label: "Evaluations", icon: "scroll" },
            { href: "/admin/insights", label: "AI insights", icon: "sparkles" },
          ],
        },
        reviewing,
        {
          title: "Manage",
          items: [
            { href: "/admin/scorecard", label: "Scorecard & rules", icon: "sliders" },
            { href: "/admin/users", label: "Users", icon: "userCog" },
            { href: "/admin/sites", label: "Sites", icon: "building" },
            { href: "/admin/import", label: "Import & export", icon: "upload" },
            { href: "/admin/audit", label: "Audit log", icon: "shield" },
          ],
        },
        { title: "Help", items: [{ href: "/playbook", label: "Playbook", icon: "book" }] },
      ]
    : [reviewing, { title: "Help", items: [{ href: "/playbook", label: "Playbook", icon: "book" }] }];

  const footer = (
    <div className="grid gap-3">
      <InstallAppButton variant="ghost" className="justify-start text-white/80 hover:bg-white/10 hover:text-white" />
      <div className="flex items-center gap-3 rounded-2xl bg-white/[0.06] p-2.5">
        <Link href="/account" className="flex min-w-0 flex-1 items-center gap-3 rounded-xl hover:opacity-90">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand text-[13px] font-bold text-white">{initials(user.name)}</span>
          <span className="min-w-0">
            <span className="block truncate text-[13.5px] font-semibold text-white">{user.name}</span>
            <span className="block text-[12px] text-white/50">{isAdmin ? "Admin" : "Quality reviewer"}</span>
          </span>
        </Link>
        <form action={logoutAction}>
          <button type="submit" className="grid size-9 place-items-center rounded-xl text-white/60 hover:bg-white/10 hover:text-white" aria-label="Sign out" title="Sign out">
            <LogOut className="size-[18px]" />
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="no-print sticky top-0 hidden h-screen flex-col gap-8 overflow-y-auto bg-ink px-4 py-5 lg:flex">
        <Wordmark inverted href={isAdmin ? "/admin" : "/qa"} className="px-2" />
        <NavList groups={groups} />
        <div className="mt-auto">{footer}</div>
      </aside>
      <MobileNav groups={groups} footer={footer} />
      <div className="min-w-0">
        <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-10 lg:py-9">{children}</main>
      </div>
    </div>
  );
}
