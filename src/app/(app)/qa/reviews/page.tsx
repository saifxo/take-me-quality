import type { Metadata } from "next";
import { ListChecks } from "lucide-react";
import { requireUser } from "@/server/auth/dal";
import { listMyReviews } from "@/server/services/evaluations";
import { Card, EmptyState, PageHeader } from "@/components/ui/surface";
import { ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { EvaluationTable, Pager } from "@/components/evaluations/evaluation-table";

export const metadata: Metadata = { title: "My reviews" };

export default async function MyReviewsPage(props: PageProps<"/qa/reviews">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 100) : "";
  const page = Math.max(1, Number(sp.page) || 1);
  const { rows, total, pageSize } = await listMyReviews(user, { page, q });
  const href = (p: number) => `/qa/reviews?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) })}`;

  return (
    <>
      <PageHeader eyebrow="Your work" title="My reviews" description="Every call you’ve submitted. You can change a review for 24 hours after submitting it." />
      <Card>
        <form className="flex flex-wrap items-center gap-3 border-b border-line p-4" role="search">
          <Input name="q" defaultValue={q} placeholder="Search by agent or anything in your notes" className="max-w-md" aria-label="Search your reviews" />
          <button className="h-11 rounded-full bg-ink px-5 text-[14px] font-semibold text-white">Search</button>
          <span className="ml-auto text-[13px] text-muted">{total.toLocaleString("en-GB")} reviews</span>
        </form>
        {rows.length ? (
          <>
            <EvaluationTable rows={rows} showReviewer={false} />
            <Pager page={page} pageSize={pageSize} total={total} hrefFor={href} />
          </>
        ) : (
          <EmptyState icon={<ListChecks className="size-6" />} title={q ? "No reviews match that search" : "No reviews yet"} action={<ButtonLink href="/qa/new">Score a call</ButtonLink>}>
            {q ? "Try an agent’s name or a word from your notes." : "Reviews you submit will appear here."}
          </EmptyState>
        )}
      </Card>
    </>
  );
}
