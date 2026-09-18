"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, asc, eq, inArray, isNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { evaluations } from "@/db/schema";
import { actorFor } from "@/server/auth/dal";
import { runAction } from "@/server/errors";
import { fromLocalInputValue, parseDuration } from "@/lib/dates";
import {
  createManual,
  deleteReview,
  previewPaste,
  queueFromPaste,
  saveDraft,
  submitReview,
  type PasteChoice,
} from "@/server/services/evaluations";
import { createAgent } from "@/server/services/roster";
import { polishNotes } from "@/server/services/ai";

const CALL_TYPES = ["booking", "airport", "account", "special", "enquiry", "complaint", "cancellation", "other"] as const;
const uuid = z.string().uuid();

const payloadSchema = z.object({
  callType: z.enum(CALL_TYPES),
  answers: z.record(
    z.string().uuid(),
    z.object({ answer: z.enum(["yes", "partial", "no", "na"]), note: z.string().max(1000).nullish(), atTime: z.string().max(10).nullish() }),
  ),
  issues: z.array(z.object({ issueId: z.string().uuid(), note: z.string().max(1000).nullish() })).max(20),
  feedback: z.string().max(4000).nullish(),
  strengths: z.string().max(4000).nullish(),
  improvements: z.string().max(4000).nullish(),
});
export type ReviewPayloadInput = z.infer<typeof payloadSchema>;

const choiceSchema = z.union([
  z.object({ action: z.literal("use"), agentId: uuid }),
  z.object({ action: z.literal("create"), fullName: z.string().trim().min(2).max(80), siteId: uuid, teamCode: z.string().max(8).nullish() }),
  z.object({ action: z.literal("skip") }),
]);

export async function previewPasteAction(text: string) {
  return runAction(async () => {
    const actor = await actorFor();
    return previewPaste(actor, z.string().max(40_000).parse(text));
  });
}

export async function queuePasteAction(text: string, choices: Record<string, unknown>) {
  return runAction(async () => {
    const actor = await actorFor();
    const parsedChoices: Record<number, PasteChoice> = {};
    for (const [k, v] of Object.entries(choices)) parsedChoices[Number(k)] = choiceSchema.parse(v);
    const res = await queueFromPaste(actor, z.string().max(40_000).parse(text), parsedChoices);
    revalidatePath("/qa");
    return res;
  });
}

const manualSchema = z.object({
  agentId: uuid,
  callAt: z.string().min(1, "Enter when the call happened."),
  duration: z.string().max(10).optional().default(""),
  callType: z.enum(CALL_TYPES),
  queue: z.string().max(12).optional(),
  extension: z.string().max(12).optional(),
  caller: z.string().max(30).optional(),
});

export async function createManualAction(input: z.input<typeof manualSchema>) {
  return runAction(async () => {
    const actor = await actorFor();
    const v = manualSchema.parse(input);
    const callAt = fromLocalInputValue(v.callAt);
    if (!callAt) throw new z.ZodError([{ code: "custom", path: ["callAt"], message: "Enter a valid date and time.", input: v.callAt }]);
    const durationSec = v.duration ? parseDuration(v.duration) : null;
    if (v.duration && durationSec === null) throw new z.ZodError([{ code: "custom", path: ["duration"], message: "Use minutes and seconds, like 1:25.", input: v.duration }]);
    const res = await createManual(actor, { agentId: v.agentId, callAt, durationSec, callType: v.callType, queue: v.queue, extension: v.extension, caller: v.caller });
    revalidatePath("/qa");
    return res;
  });
}

export async function addAgentAction(input: { fullName: string; siteId: string; teamCode?: string }) {
  return runAction(async () => {
    const actor = await actorFor();
    const v = z.object({ fullName: z.string().trim().min(2, "Enter the agent’s full name.").max(80), siteId: uuid, teamCode: z.string().max(8).optional() }).parse(input);
    const agent = await createAgent(actor, v);
    revalidatePath("/admin/agents");
    return { id: agent.id, fullName: agent.fullName, status: agent.status };
  });
}

export async function saveDraftAction(id: string, payload: ReviewPayloadInput) {
  return runAction(async () => {
    const actor = await actorFor();
    return saveDraft(actor, uuid.parse(id), payloadSchema.parse(payload));
  });
}

/** Submit (or amend) a review, then point the reviewer at their next queued call. */
export async function submitReviewAction(id: string, payload: ReviewPayloadInput, amendReason?: string | null) {
  return runAction(async () => {
    const actor = await actorFor();
    const evId = uuid.parse(id);
    const result = await submitReview(actor, evId, payloadSchema.parse(payload), amendReason ?? null);
    const [next] = await db
      .select({ id: evaluations.id })
      .from(evaluations)
      .where(and(eq(evaluations.reviewerId, actor.id), inArray(evaluations.status, ["queued", "draft"]), isNull(evaluations.deletedAt), ne(evaluations.id, evId)))
      .orderBy(asc(evaluations.callAt))
      .limit(1);
    revalidatePath("/qa");
    revalidatePath("/admin");
    return { ...result, nextId: next?.id ?? null };
  });
}

export async function deleteReviewAction(id: string, reason?: string) {
  return runAction(async () => {
    const actor = await actorFor();
    await deleteReview(actor, uuid.parse(id), reason ?? null);
    revalidatePath("/qa");
    revalidatePath("/admin/evaluations");
    return true;
  });
}

export async function polishNotesAction(text: string, context: string[]) {
  return runAction(async () => {
    const actor = await actorFor();
    return polishNotes(actor, z.string().max(3000).parse(text), z.array(z.string().max(200)).max(21).parse(context));
  });
}
