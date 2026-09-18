import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/server/auth/dal";
import { getReview } from "@/server/services/evaluations";
import { aiStatus } from "@/server/services/ai";
import { AppError } from "@/server/errors";
import { ReviewStudio, type StudioData } from "./review-studio";

export const metadata: Metadata = { title: "Review Studio" };

export default async function ReviewPage(props: PageProps<"/qa/review/[id]">) {
  const { id } = await props.params;
  const user = await requireUser();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  let review: Awaited<ReturnType<typeof getReview>>;
  try {
    review = await getReview(user, id);
  } catch (err) {
    if (err instanceof AppError && err.code === "not_found") notFound();
    if (err instanceof AppError && err.code === "forbidden") redirect("/qa");
    throw err;
  }
  if (!review.edit.canEdit) redirect(`/evaluations/${id}`);

  const { evaluation: ev, scorecard: sc } = review;
  const data: StudioData = {
    id: ev.id,
    status: ev.status,
    mode: review.edit.mode,
    updatedAt: ev.updatedAt.toISOString(),
    call: {
      agentName: review.agent?.fullName ?? "Unknown agent",
      agentStatus: review.agent?.status ?? "active",
      siteName: review.agent?.siteName ?? "",
      siteCode: review.agent?.siteCode ?? "",
      teamCode: review.agent?.teamCode ?? null,
      callAt: ev.callAt?.toISOString() ?? null,
      durationSec: ev.durationSec,
      callerMasked: ev.callerMasked,
      queue: ev.queue,
      extension: ev.extension,
      callType: ev.callType,
      anonymousCaller: ev.anonymousCaller,
      reviewerName: review.reviewerName,
      score: ev.score,
      band: ev.band,
    },
    settings: { kpiPass: sc.settings.kpiPass, weights: sc.settings.weights, scoreFloor: sc.settings.scoreFloor },
    versionName: sc.name,
    sections: sc.sections.map((s) => ({
      key: s.key,
      name: s.name,
      shortName: s.shortName,
      criteria: s.criteria.map((c) => ({
        id: c.id,
        key: c.key,
        title: c.title,
        description: c.description,
        yesDesc: c.yesDesc,
        partialDesc: c.partialDesc,
        noDesc: c.noDesc,
        markerNotes: c.markerNotes,
        allowPartial: c.allowPartial,
        allowNa: c.allowNa,
        penaltyNo: c.penaltyNo,
        penaltyPartial: c.penaltyPartial,
        applicableCallTypes: c.applicableCallTypes,
      })),
    })),
    issues: sc.issues.map((i) => ({ id: i.id, shortName: i.shortName, title: i.title, description: i.description })),
    answers: Object.fromEntries(Object.entries(review.answers).map(([k, v]) => [k, { answer: v.answer, note: v.note ?? "", atTime: v.atTime ?? "" }])),
    selectedIssues: review.issues.map((i) => ({ issueId: i.issueId, note: i.note ?? "" })),
    feedback: ev.feedback ?? "",
    strengths: ev.strengths ?? "",
    improvements: ev.improvements ?? "",
    aiEnabled: aiStatus().enabled,
  };
  return <ReviewStudio data={data} />;
}
