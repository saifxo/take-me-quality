"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actorFor } from "@/server/auth/dal";
import { runAction, invalid } from "@/server/errors";
import { createUser, resetPassword, signOutEverywhere, updateUser } from "@/server/services/users";
import { createAgent, createSite, updateAgent, updateSite } from "@/server/services/roster";
import {
  addDraftIssue,
  createDraft,
  discardDraft,
  publishDraft,
  removeDraftIssue,
  updateDraftCriterion,
  updateDraftIssue,
  updateDraftSettings,
  whatIf,
} from "@/server/services/scorecard";
import { agentCoaching, approveSummary, editCoaching, findThemes, weeklyBriefing } from "@/server/services/ai";
import { importWorkbook } from "@/server/services/import";
import { isValidIsoDate } from "@/lib/dates";

const uuid = z.string().uuid();
const role = z.enum(["admin", "qa"]);
const period = z.object({ from: z.string().refine(isValidIsoDate), to: z.string().refine(isValidIsoDate), siteId: uuid.optional() });
const mode = z.enum(["manual", "ai"]).default("manual");

// ---------------------------------------------------------------- users
export async function createUserAction(input: { name: string; email: string; role: string }) {
  return runAction(async () => {
    const actor = await actorFor("admin");
    const v = z
      .object({ name: z.string().trim().min(2, "Enter their full name.").max(80), email: z.string().trim().email("Enter a valid email address.").max(160), role })
      .parse(input);
    const res = await createUser(actor, v);
    revalidatePath("/admin/users");
    return { tempPassword: res.tempPassword, email: res.user.email, name: res.user.name };
  });
}

export async function updateUserAction(id: string, patch: { name?: string; role?: string; status?: string }) {
  return runAction(async () => {
    const actor = await actorFor("admin");
    const v = z.object({ name: z.string().trim().min(2).max(80).optional(), role: role.optional(), status: z.enum(["active", "disabled"]).optional() }).parse(patch);
    await updateUser(actor, uuid.parse(id), v);
    revalidatePath("/admin/users");
    return true;
  });
}

export async function resetPasswordAction(id: string) {
  return runAction(async () => {
    const actor = await actorFor("admin");
    const res = await resetPassword(actor, uuid.parse(id));
    revalidatePath("/admin/users");
    return res;
  });
}

export async function signOutEverywhereAction(id: string) {
  return runAction(async () => {
    const actor = await actorFor("admin");
    await signOutEverywhere(actor, uuid.parse(id));
    return true;
  });
}

// ---------------------------------------------------------------- sites & agents
const siteSchema = z.object({
  name: z.string().trim().min(2, "Enter the site name.").max(60),
  code: z.string().trim().min(2, "Use a 2–8 letter code, as in the portal (e.g. SOL).").max(8).regex(/^[A-Za-z0-9]+$/, "Letters and numbers only."),
  region: z.string().trim().max(60).default("West Midlands"),
  active: z.boolean().default(true),
});

export async function saveSiteAction(id: string | null, input: z.input<typeof siteSchema>) {
  return runAction(async () => {
    const actor = await actorFor("admin");
    const v = siteSchema.parse(input);
    const row = id ? await updateSite(actor, uuid.parse(id), v) : await createSite(actor, v);
    revalidatePath("/admin/sites");
    return { id: row.id };
  });
}

const agentSchema = z.object({
  fullName: z.string().trim().min(2, "Enter the agent’s full name.").max(80),
  siteId: uuid,
  teamCode: z.string().trim().max(8).nullish(),
  extension: z.string().trim().max(12).nullish(),
  status: z.enum(["active", "pending", "inactive"]).optional(),
});

export async function saveAgentAction(id: string | null, input: z.input<typeof agentSchema>) {
  return runAction(async () => {
    const actor = await actorFor("admin");
    const v = agentSchema.parse(input);
    const row = id ? await updateAgent(actor, uuid.parse(id), v) : await createAgent(actor, v);
    revalidatePath("/admin/agents");
    if (id) revalidatePath(`/admin/agents/${id}`);
    return { id: row.id };
  });
}

// ---------------------------------------------------------------- scorecard
export async function createDraftAction() {
  return runAction(async () => {
    const actor = await actorFor("admin");
    const id = await createDraft(actor);
    revalidatePath("/admin/scorecard");
    return id;
  });
}

const settingsSchema = z.object({
  kpiPass: z.number().min(0).max(100),
  attentionShare: z.number().min(0).max(100),
  weeklyTarget: z.number().int().min(1).max(100),
  weights: z.object({ yes: z.number().min(0.1).max(10), partial: z.number().min(0).max(10), no: z.number().min(0).max(10) }),
  scoreFloor: z.number().min(-100).max(100).nullable(),
  editWindowHours: z.number().int().min(0).max(24 * 30),
});

export async function saveDraftSettingsAction(draftId: string, settings: z.input<typeof settingsSchema>, name: string, notes: string) {
  return runAction(async () => {
    const actor = await actorFor("admin");
    const v = settingsSchema.parse(settings);
    if (v.weights.partial > v.weights.yes || v.weights.no > v.weights.partial) throw invalid("Points must go Yes ≥ Partial ≥ No.");
    await updateDraftSettings(actor, uuid.parse(draftId), v, z.string().max(80).parse(name), z.string().max(1000).parse(notes));
    revalidatePath("/admin/scorecard");
    return true;
  });
}

const criterionSchema = z.object({
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().min(10).max(3000),
  yesDesc: z.string().trim().max(1500).nullable(),
  partialDesc: z.string().trim().max(1500).nullable(),
  noDesc: z.string().trim().max(1500).nullable(),
  markerNotes: z.string().trim().max(1500).nullable(),
  allowPartial: z.boolean(),
  allowNa: z.boolean(),
  penaltyNo: z.number().min(0).max(10),
  penaltyPartial: z.number().min(0).max(10),
  applicableCallTypes: z.array(z.enum(["booking", "airport", "account", "special", "enquiry", "complaint", "cancellation", "other"])).max(8),
});

export async function saveCriterionAction(draftId: string, criterionId: string, patch: z.input<typeof criterionSchema>) {
  return runAction(async () => {
    const actor = await actorFor("admin");
    await updateDraftCriterion(actor, uuid.parse(draftId), uuid.parse(criterionId), criterionSchema.parse(patch));
    revalidatePath("/admin/scorecard");
    return true;
  });
}

const issueSchema = z.object({ shortName: z.string().trim().min(2).max(40), title: z.string().trim().min(3).max(120), description: z.string().trim().min(5).max(1500) });

export async function saveIssueAction(draftId: string, issueId: string | null, input: z.input<typeof issueSchema>) {
  return runAction(async () => {
    const actor = await actorFor("admin");
    const v = issueSchema.parse(input);
    if (issueId) await updateDraftIssue(actor, uuid.parse(draftId), uuid.parse(issueId), v);
    else await addDraftIssue(actor, uuid.parse(draftId), v);
    revalidatePath("/admin/scorecard");
    return true;
  });
}

export async function removeIssueAction(draftId: string, issueId: string) {
  return runAction(async () => {
    const actor = await actorFor("admin");
    await removeDraftIssue(actor, uuid.parse(draftId), uuid.parse(issueId));
    revalidatePath("/admin/scorecard");
    return true;
  });
}

export async function whatIfAction(draftId: string, weeks: number) {
  return runAction(async () => {
    const actor = await actorFor("admin");
    return whatIf(actor, uuid.parse(draftId), z.number().int().min(1).max(52).parse(weeks));
  });
}

export async function publishDraftAction(draftId: string) {
  return runAction(async () => {
    const actor = await actorFor("admin");
    await publishDraft(actor, uuid.parse(draftId));
    revalidatePath("/admin", "layout");
    return true;
  });
}

export async function discardDraftAction(draftId: string) {
  return runAction(async () => {
    const actor = await actorFor("admin");
    await discardDraft(actor, uuid.parse(draftId));
    revalidatePath("/admin/scorecard");
    return true;
  });
}

// ---------------------------------------------------------------- AI
export async function briefingAction(input: z.input<typeof period>, force = false, summaryMode: "manual" | "ai" = "manual") {
  return runAction(async () => {
    const actor = await actorFor("admin");
    const row = await weeklyBriefing(actor, period.parse(input), { force, mode: mode.parse(summaryMode) });
    return { output: row.output, model: row.model, createdAt: row.createdAt.toISOString() };
  });
}

export async function coachingAction(agentId: string, input: z.input<typeof period>, force = false, summaryMode: "manual" | "ai" = "manual") {
  return runAction(async () => {
    const actor = await actorFor("admin");
    const row = await agentCoaching(actor, uuid.parse(agentId), period.parse(input), { force, mode: mode.parse(summaryMode) });
    revalidatePath(`/admin/agents/${agentId}`);
    return { id: row.id, output: row.output, model: row.model, createdAt: row.createdAt.toISOString() };
  });
}

export async function themesAction(input: z.input<typeof period>, force = false, summaryMode: "manual" | "ai" = "manual") {
  return runAction(async () => {
    const actor = await actorFor("admin");
    const row = await findThemes(actor, period.parse(input), { force, mode: mode.parse(summaryMode) });
    return { output: row.output, model: row.model, createdAt: row.createdAt.toISOString() };
  });
}

const coachingEdit = z.object({
  summary: z.string().trim().min(10, "Write at least a sentence.").max(1500),
  strengths: z.array(z.string().trim().min(1).max(300)).max(4),
  tips: z.array(z.string().trim().min(1).max(400)).min(1, "Add at least one tip.").max(3),
  focus: z.string().trim().min(2).max(200),
});

export async function editCoachingAction(id: string, agentId: string, output: z.input<typeof coachingEdit>) {
  return runAction(async () => {
    const actor = await actorFor("admin");
    await editCoaching(actor, uuid.parse(id), coachingEdit.parse(output));
    revalidatePath(`/admin/agents/${agentId}`);
    return true;
  });
}

export async function approveSummaryAction(id: string, approved: boolean, agentId?: string) {
  return runAction(async () => {
    const actor = await actorFor("admin");
    await approveSummary(actor, uuid.parse(id), approved);
    if (agentId) revalidatePath(`/admin/agents/${agentId}`);
    return true;
  });
}

// ---------------------------------------------------------------- import
export async function importWorkbookAction(formData: FormData) {
  return runAction(async () => {
    const actor = await actorFor("admin");
    const file = formData.get("file");
    if (!(file instanceof File) || !file.size) throw invalid("Choose the .xlsx workbook to import.");
    if (file.size > 5 * 1024 * 1024) throw invalid("That file is over 5 MB. Export only the scorecard workbook.");
    if (!/\.xlsx$/i.test(file.name)) throw invalid("Upload an .xlsx file (File → Download → Microsoft Excel in Google Sheets).");
    const report = await importWorkbook(actor, await file.arrayBuffer(), file.name.slice(0, 120));
    revalidatePath("/admin", "layout");
    return report;
  });
}
