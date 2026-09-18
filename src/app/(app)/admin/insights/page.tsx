import type { Metadata } from "next";
import { ShieldCheck, Sparkles } from "lucide-react";
import { requireAdmin } from "@/server/auth/dal";
import { aiStatus, latestBriefing } from "@/server/services/ai";
import { listSites } from "@/server/services/roster";
import { resolveFilter } from "@/lib/filters";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui/surface";
import { FiltersBar } from "@/components/admin/filters-bar";
import { BriefingCard, ThemesCard } from "@/components/admin/ai-cards";

export const metadata: Metadata = { title: "AI insights" };

export default async function InsightsPage(props: PageProps<"/admin/insights">) {
  await requireAdmin();
  const sp = await props.searchParams;
  const f = resolveFilter(sp, "4w");
  const [sites, briefing] = await Promise.all([listSites(), latestBriefing(f.from, f.to)]);
  const ai = aiStatus();
  const period = { from: f.from, to: f.to, siteId: f.siteId };
  return (
    <>
      <PageHeader
        eyebrow={f.label}
        title="AI insights"
        description="Choose Manual (built from the scores, and the default) or AI (written by Gemini) for briefings, themes and coaching notes. People still do all the listening and scoring."
        actions={ai.enabled ? <Badge tone="ok">Gemini connected · {ai.model}</Badge> : <Badge tone="warn">AI not configured: manual summaries only</Badge>}
      />
      <FiltersBar sites={sites.map((s) => ({ id: s.id, name: s.name }))} show={{ site: true }} from={f.from} to={f.to} defaultPeriod="4w" className="mb-6" />
      <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
        <Card className="bg-ink p-5 text-white">
          <BriefingCard key={`${f.from}-${f.to}-${f.siteId}`} period={period} initial={briefing ? { output: briefing.output as never, model: briefing.model, createdAt: briefing.createdAt.toISOString() } : null} aiEnabled={ai.enabled} />
        </Card>
        <Card>
          <CardHeader title={<span className="inline-flex items-center gap-2"><Sparkles className="size-4 text-brand" /> Recurring themes</span>} description="What keeps coming up in the notes on missed checks" />
          <div className="px-5 pb-5">
            <ThemesCard key={`${f.from}-${f.to}-${f.siteId}`} period={period} aiEnabled={ai.enabled} />
          </div>
        </Card>
      </div>
      <Card className="mt-6 p-5">
        <div className="flex gap-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-700">
            <ShieldCheck className="size-5" />
          </span>
          <div className="text-[14px] leading-relaxed text-ink-2">
            <p className="font-semibold text-ink">How AI is kept safe and UK GDPR compliant</p>
            <ul className="mt-2 grid list-disc gap-1 pl-5">
              <li>Manual is the default: those summaries are built from the scores inside Take Me Quality and nothing is sent anywhere.</li>
              <li>
                In AI mode, customer numbers, addresses, postcodes and emails are removed before anything is sent to Gemini, and agents are referred to by first name only, so UK GDPR
                compliance is maintained.
              </li>
              <li>The Gemini key stays on the server; browsers never see it.</li>
              <li>Every answer is checked against a fixed format, saved with its model and prompt version, and reused for identical data so costs stay low.</li>
              <li>Each person has a daily AI limit, and coaching notes need a manager’s approval before they’re shared.</li>
            </ul>
          </div>
        </div>
      </Card>
    </>
  );
}
