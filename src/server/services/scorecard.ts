import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { db, type Tx } from "@/db";
import {
  criteria,
  evaluationAnswers,
  evaluationIssues,
  evaluations,
  hihiIssues,
  scorecardVersions,
  sections,
  type Criterion,
  type HihiIssue,
  type ScorecardSettings,
  type Section,
} from "@/db/schema";
import { DEFAULT_SETTINGS, TMQ_ISSUES, TMQ_SECTIONS } from "@/lib/framework/tmq";
import { scoreEvaluation, type Answer, type EngineCriterion, type EngineSettings } from "@/lib/scoring/engine";
import { addDays, currentWeekStart } from "@/lib/dates";
import { audit, type Actor } from "@/server/audit";
import { AppError, forbidden, invalid, notFound } from "@/server/errors";

export type ScorecardCriterion = Criterion & { sectionKey: string; sectionName: string };
export type Scorecard = {
  id: string;
  version: number;
  name: string;
  status: "draft" | "active" | "retired";
  settings: ScorecardSettings;
  notes: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  sections: (Section & { criteria: Criterion[] })[];
  criteria: ScorecardCriterion[];
  issues: HihiIssue[];
};

async function load(where: { id?: string; status?: "active" | "draft" }): Promise<Scorecard | null> {
  const row = await db.query.scorecardVersions.findFirst({
    where: (v, ops) => (where.id ? ops.eq(v.id, where.id) : ops.eq(v.status, where.status!)),
    orderBy: (v, ops) => [ops.desc(v.version)],
    with: {
      sections: { orderBy: (s, ops) => [ops.asc(s.position)], with: { criteria: { orderBy: (c, ops) => [ops.asc(c.position)] } } },
      issues: { orderBy: (i, ops) => [ops.asc(i.position)] },
    },
  });
  if (!row) return null;
  const flat: ScorecardCriterion[] = row.sections.flatMap((s) => s.criteria.map((c) => ({ ...c, sectionKey: s.key, sectionName: s.name })));
  return { ...row, settings: { ...DEFAULT_SETTINGS, ...row.settings }, criteria: flat };
}

export async function getActiveScorecard(): Promise<Scorecard> {
  const sc = await load({ status: "active" });
  if (!sc) throw new AppError("No active scorecard yet. Run `npm run db:seed` to install the TMQ framework.", "unavailable");
  return sc;
}

export async function getScorecard(id: string): Promise<Scorecard> {
  const sc = await load({ id });
  if (!sc) throw notFound("That scorecard version doesn’t exist.");
  return sc;
}

export async function getDraftScorecard(): Promise<Scorecard | null> {
  return load({ status: "draft" });
}

export function engineCriteria(sc: Pick<Scorecard, "criteria">): EngineCriterion[] {
  return sc.criteria.map((c) => ({
    id: c.id,
    sectionKey: c.sectionKey,
    title: c.title,
    allowPartial: c.allowPartial,
    allowNa: c.allowNa,
    penaltyNo: c.penaltyNo,
    penaltyPartial: c.penaltyPartial,
  }));
}

export function engineSettings(sc: Pick<Scorecard, "settings">): EngineSettings {
  return { kpiPass: sc.settings.kpiPass, weights: sc.settings.weights, scoreFloor: sc.settings.scoreFloor };
}

export async function listVersions() {
  return db
    .select({
      id: scorecardVersions.id,
      version: scorecardVersions.version,
      name: scorecardVersions.name,
      status: scorecardVersions.status,
      notes: scorecardVersions.notes,
      createdAt: scorecardVersions.createdAt,
      publishedAt: scorecardVersions.publishedAt,
      evaluations: sql<number>`(select count(*)::int from ${evaluations} e where e.version_id = ${scorecardVersions.id} and e.deleted_at is null)`,
    })
    .from(scorecardVersions)
    .orderBy(desc(scorecardVersions.version));
}

/** Install the TMQ framework as a scorecard version (used by the seed script). */
export async function installFramework(tx: Tx | typeof db, opts: { version: number; status: "active" | "draft"; createdBy?: string | null }) {
  const [v] = await tx
    .insert(scorecardVersions)
    .values({
      version: opts.version,
      name: `TMQ framework v${opts.version}`,
      status: opts.status,
      settings: DEFAULT_SETTINGS,
      notes: "Imported from the Birmingham TMQ Scorecard workbook (TMQ Framework sheet).",
      createdBy: opts.createdBy ?? null,
      publishedAt: opts.status === "active" ? new Date() : null,
    })
    .returning();
  let pos = 0;
  for (const [si, s] of TMQ_SECTIONS.entries()) {
    const [sec] = await tx.insert(sections).values({ versionId: v.id, key: s.key, name: s.name, shortName: s.shortName, position: si }).returning();
    for (const c of s.criteria) {
      await tx.insert(criteria).values({
        versionId: v.id,
        sectionId: sec.id,
        key: c.key,
        sheetColumn: c.sheetColumn,
        title: c.title,
        description: c.description,
        yesDesc: c.yesDesc,
        partialDesc: c.partialDesc,
        noDesc: c.noDesc,
        markerNotes: c.markerNotes ?? null,
        allowPartial: c.allowPartial ?? true,
        allowNa: true,
        penaltyNo: c.penaltyNo ?? 0,
        penaltyPartial: c.penaltyPartial ?? 0,
        applicableCallTypes: c.applicableCallTypes ?? [],
        position: pos++,
      });
    }
  }
  for (const [i, issue] of TMQ_ISSUES.entries()) {
    await tx.insert(hihiIssues).values({ versionId: v.id, ...issue, position: i });
  }
  return v;
}

function assertAdmin(actor: Actor) {
  if (actor.role !== "admin") throw forbidden();
}

/** Start editing: copy the active version into a draft (or return the existing draft). */
export async function createDraft(actor: Actor): Promise<string> {
  assertAdmin(actor);
  const existing = await getDraftScorecard();
  if (existing) return existing.id;
  const active = await getActiveScorecard();
  return db.transaction(async (tx) => {
    const [{ max }] = await tx.select({ max: sql<number>`coalesce(max(${scorecardVersions.version}), 0)::int` }).from(scorecardVersions);
    const [v] = await tx
      .insert(scorecardVersions)
      .values({ version: max + 1, name: `TMQ framework v${max + 1}`, status: "draft", settings: active.settings, createdBy: actor.id })
      .returning();
    for (const s of active.sections) {
      const [sec] = await tx.insert(sections).values({ versionId: v.id, key: s.key, name: s.name, shortName: s.shortName, position: s.position }).returning();
      for (const c of s.criteria) {
        const { id: _id, versionId: _v, sectionId: _s, ...rest } = c;
        await tx.insert(criteria).values({ ...rest, versionId: v.id, sectionId: sec.id });
      }
    }
    for (const i of active.issues) {
      const { id: _id, versionId: _v, ...rest } = i;
      await tx.insert(hihiIssues).values({ ...rest, versionId: v.id });
    }
    await audit(actor, { action: "scorecard.draft_created", entity: "scorecard", entityId: v.id, after: { version: v.version } }, tx);
    return v.id;
  });
}

async function requireDraft(id: string) {
  const [v] = await db.select().from(scorecardVersions).where(eq(scorecardVersions.id, id)).limit(1);
  if (!v) throw notFound("That draft no longer exists.");
  if (v.status !== "draft") throw invalid("Only a draft can be edited. Start a new draft from the active version.");
  return v;
}

export async function updateDraftSettings(actor: Actor, draftId: string, settings: ScorecardSettings, name?: string, notes?: string) {
  assertAdmin(actor);
  const v = await requireDraft(draftId);
  await db
    .update(scorecardVersions)
    .set({ settings, name: name?.trim() || v.name, notes: notes?.trim() || null })
    .where(eq(scorecardVersions.id, draftId));
  await audit(actor, { action: "scorecard.settings_updated", entity: "scorecard", entityId: draftId, before: v.settings, after: settings });
}

export type CriterionPatch = Partial<
  Pick<Criterion, "title" | "description" | "yesDesc" | "partialDesc" | "noDesc" | "markerNotes" | "allowPartial" | "allowNa" | "penaltyNo" | "penaltyPartial" | "applicableCallTypes">
>;

export async function updateDraftCriterion(actor: Actor, draftId: string, criterionId: string, patch: CriterionPatch) {
  assertAdmin(actor);
  await requireDraft(draftId);
  const [before] = await db.select().from(criteria).where(and(eq(criteria.id, criterionId), eq(criteria.versionId, draftId))).limit(1);
  if (!before) throw notFound("That criterion isn’t part of this draft.");
  await db.update(criteria).set(patch).where(eq(criteria.id, criterionId));
  await audit(actor, { action: "scorecard.criterion_updated", entity: "criterion", entityId: criterionId, before, after: patch });
}

export async function updateDraftIssue(actor: Actor, draftId: string, issueId: string, patch: { shortName: string; title: string; description: string }) {
  assertAdmin(actor);
  await requireDraft(draftId);
  const res = await db.update(hihiIssues).set(patch).where(and(eq(hihiIssues.id, issueId), eq(hihiIssues.versionId, draftId))).returning();
  if (!res.length) throw notFound("That issue isn’t part of this draft.");
  await audit(actor, { action: "scorecard.issue_updated", entity: "hihi_issue", entityId: issueId, after: patch });
}

export async function addDraftIssue(actor: Actor, draftId: string, input: { shortName: string; title: string; description: string }) {
  assertAdmin(actor);
  await requireDraft(draftId);
  const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${hihiIssues.position}), -1)::int` }).from(hihiIssues).where(eq(hihiIssues.versionId, draftId));
  const key = input.shortName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || `issue_${max + 1}`;
  const [row] = await db.insert(hihiIssues).values({ versionId: draftId, key: `${key}_${max + 1}`, ...input, position: max + 1 }).returning();
  await audit(actor, { action: "scorecard.issue_added", entity: "hihi_issue", entityId: row.id, after: input });
}

export async function removeDraftIssue(actor: Actor, draftId: string, issueId: string) {
  assertAdmin(actor);
  await requireDraft(draftId);
  await db.delete(hihiIssues).where(and(eq(hihiIssues.id, issueId), eq(hihiIssues.versionId, draftId)));
  await audit(actor, { action: "scorecard.issue_removed", entity: "hihi_issue", entityId: issueId });
}

export async function discardDraft(actor: Actor, draftId: string) {
  assertAdmin(actor);
  await requireDraft(draftId);
  await db.delete(scorecardVersions).where(eq(scorecardVersions.id, draftId));
  await audit(actor, { action: "scorecard.draft_discarded", entity: "scorecard", entityId: draftId });
}

export async function publishDraft(actor: Actor, draftId: string) {
  assertAdmin(actor);
  const draft = await requireDraft(draftId);
  await db.transaction(async (tx) => {
    await tx.update(scorecardVersions).set({ status: "retired" }).where(eq(scorecardVersions.status, "active"));
    await tx.update(scorecardVersions).set({ status: "active", publishedAt: new Date() }).where(eq(scorecardVersions.id, draftId));
    await audit(actor, { action: "scorecard.published", entity: "scorecard", entityId: draftId, after: { version: draft.version } }, tx);
  });
}

export type WhatIfSummary = { evaluations: number; avg: number | null; perfect: number; meets: number; below: number; fail: number };
export type WhatIfResult = { weeks: number; current: WhatIfSummary; draft: WhatIfSummary; changedBand: number };

/** Re-score recent submitted evaluations under the draft's rules (matching criteria by key). */
export async function whatIf(actor: Actor, draftId: string, weeks = 4): Promise<WhatIfResult> {
  assertAdmin(actor);
  const draft = await getScorecard(draftId);
  const since = addDays(currentWeekStart(), -7 * weeks);
  const evals = await db
    .select({ id: evaluations.id, score: evaluations.score, band: evaluations.band })
    .from(evaluations)
    .where(and(eq(evaluations.status, "submitted"), isNull(evaluations.deletedAt), gte(evaluations.callWeek, since)));
  const empty = (): WhatIfSummary => ({ evaluations: 0, avg: null, perfect: 0, meets: 0, below: 0, fail: 0 });
  const current = empty();
  const next = empty();
  if (!evals.length) return { weeks, current, draft: next, changedBand: 0 };

  const ids = evals.map((e) => e.id);
  const answers = await db
    .select({ evaluationId: evaluationAnswers.evaluationId, answer: evaluationAnswers.answer, key: criteria.key })
    .from(evaluationAnswers)
    .innerJoin(criteria, eq(criteria.id, evaluationAnswers.criterionId))
    .where(inArray(evaluationAnswers.evaluationId, ids));
  const issueCounts = await db
    .select({ evaluationId: evaluationIssues.evaluationId, n: sql<number>`count(*)::int` })
    .from(evaluationIssues)
    .where(inArray(evaluationIssues.evaluationId, ids))
    .groupBy(evaluationIssues.evaluationId);

  const byEval = new Map<string, Record<string, Answer>>();
  for (const a of answers) {
    if (!byEval.has(a.evaluationId)) byEval.set(a.evaluationId, {});
    byEval.get(a.evaluationId)![a.key] = a.answer;
  }
  const issues = new Map(issueCounts.map((i) => [i.evaluationId, i.n]));
  const crit = draft.criteria.map((c) => ({ ...engineCriteria({ criteria: [c] })[0], id: c.key }));
  const settings = engineSettings(draft);

  let curSum = 0;
  let nextSum = 0;
  let changed = 0;
  for (const e of evals) {
    const r = scoreEvaluation(crit, byEval.get(e.id) ?? {}, issues.get(e.id) ?? 0, settings);
    current.evaluations++;
    next.evaluations++;
    curSum += e.score ?? 0;
    nextSum += r.score ?? 0;
    if (e.band) current[e.band]++;
    if (r.band) next[r.band]++;
    if (r.band !== e.band) changed++;
  }
  current.avg = Math.round((curSum / evals.length) * 100) / 100;
  next.avg = Math.round((nextSum / evals.length) * 100) / 100;
  return { weeks, current, draft: next, changedBand: changed };
}
