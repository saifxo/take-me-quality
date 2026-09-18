import type { Metadata } from "next";
import { requireUser } from "@/server/auth/dal";
import { getActiveScorecard } from "@/server/services/scorecard";
import { APPROVED_GREETINGS, NOT_APPROVED_GREETINGS } from "@/lib/framework/tmq";
import { PageHeader } from "@/components/ui/surface";
import { PlaybookBrowser } from "./playbook-browser";

export const metadata: Metadata = { title: "Playbook" };

export default async function PlaybookPage() {
  await requireUser();
  const sc = await getActiveScorecard();
  return (
    <>
      <PageHeader
        eyebrow={`${sc.name} · ${sc.criteria.length} checks`}
        title="The TMQ Playbook"
        description="How to mark every check, what good looks like, and the rules that make a call fail outright. The same guidance appears beside each question while you score."
      />
      <PlaybookBrowser
        settings={sc.settings}
        sections={sc.sections.map((s) => ({
          key: s.key,
          name: s.name,
          criteria: s.criteria.map((c) => ({
            id: c.id,
            title: c.title,
            description: c.description,
            yesDesc: c.yesDesc,
            partialDesc: c.partialDesc,
            noDesc: c.noDesc,
            markerNotes: c.markerNotes,
            allowPartial: c.allowPartial,
            penaltyNo: c.penaltyNo,
            penaltyPartial: c.penaltyPartial,
            applicableCallTypes: c.applicableCallTypes,
          })),
        }))}
        issues={sc.issues.map((i) => ({ id: i.id, shortName: i.shortName, title: i.title, description: i.description }))}
        approved={APPROVED_GREETINGS}
        notApproved={NOT_APPROVED_GREETINGS}
      />
    </>
  );
}
