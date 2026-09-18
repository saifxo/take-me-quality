import { and, asc, between, count, desc, eq, gte, ilike, inArray, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  agents,
  criteria,
  evaluationAnswers,
  evaluationIssues,
  evaluations,
  hihiIssues,
  sites,
  users,
  type CallType,
} from "@/db/schema";
import { parsePortalText, type ParsedCall } from "@/lib/smart-paste";
import { normalizeUkPhone, maskPhone, isAnonymousCaller } from "@/lib/phone";
import { weekStartOf } from "@/lib/dates";
import { defaultAnswers, scoreEvaluation, type Answer } from "@/lib/scoring/engine";
import { hashCaller } from "@/server/crypto";
import { audit, type Actor } from "@/server/audit";
import { forbidden, invalid, notFound } from "@/server/errors";
import { engineCriteria, engineSettings, getActiveScorecard, getScorecard, type Scorecard } from "./scorecard";
import { createAgent, matchPortalNames } from "./roster";

export type AnswerInput = { answer: Answer; note?: string | null; atTime?: string | null };
export type ReviewPayload = {
  callType: CallType;
  answers: Record<string, AnswerInput>;
  issues: { issueId: string; note?: string | null }[];
  feedback?: string | null;
  strengths?: string | null;
  improvements?: string | null;
};

const notDeleted = isNull(evaluations.deletedAt);
const DUPLICATE_WINDOW_MS = 60_000;

// ---------------------------------------------------------------- smart paste
export type PastePreviewRow =
  | { index: number; ok: false; raw: string; reason: string }
  | {
      index: number;
      ok: true;
      context: ParsedCall["context"];
      queue: string | null;
      extension: string | null;
      agentName: string;
      siteCode: string | null;
      teamCode: string | null;
      callerMasked: string | null;
      anonymousCaller: boolean;
      callAt: string;
      callWeek: string;
      durationSec: number;
      matchedAgent: { id: string; fullName: string; status: string } | null;
      site: { id: string; name: string; code: string } | null;
      duplicateOf: string | null;
    };

async function findDuplicates(rows: { callAt: Date; agentId: string | null; callerHash: string | null }[]) {
  if (!rows.length) return new Map<number, string>();
  const times = rows.map((r) => r.callAt.getTime());
  const from = new Date(Math.min(...times) - DUPLICATE_WINDOW_MS);
  const to = new Date(Math.max(...times) + DUPLICATE_WINDOW_MS);
  const existing = await db
    .select({ id: evaluations.id, agentId: evaluations.agentId, callAt: evaluations.callAt, callerHash: evaluations.callerHash })
    .from(evaluations)
    .where(and(notDeleted, between(evaluations.callAt, from, to)));
  const out = new Map<number, string>();
  rows.forEach((r, i) => {
    const hit = existing.find(
      (e) =>
        e.callAt &&
        Math.abs(e.callAt.getTime() - r.callAt.getTime()) <= DUPLICATE_WINDOW_MS &&
        ((r.agentId && e.agentId === r.agentId) || (r.callerHash && e.callerHash === r.callerHash)),
    );
    if (hit) out.set(i, hit.id);
  });
  return out;
}

/** Server-side preview: parse, match agents to the roster, flag calls already reviewed. */
export async function previewPaste(actor: Actor, text: string): Promise<PastePreviewRow[]> {
  void actor;
  const parsed = parsePortalText(text);
  const okRows = parsed.filter((r): r is ParsedCall => r.ok);
  const matches = await matchPortalNames(okRows.map((r) => ({ agentName: r.agentName, siteCode: r.siteCode })));
  const dupes = await findDuplicates(
    okRows.map((r, i) => ({
      callAt: new Date(r.callAt),
      agentId: matches[i].agent?.id ?? null,
      callerHash: r.callerNumber ? hashCaller(r.callerNumber) : null,
    })),
  );
  let okIndex = 0;
  return parsed.map((r) => {
    if (!r.ok) return { index: r.index, ok: false as const, raw: r.raw.slice(0, 200), reason: r.reason };
    const i = okIndex++;
    const m = matches[i];
    return {
      index: r.index,
      ok: true as const,
      context: r.context,
      queue: r.queue,
      extension: r.extension,
      agentName: r.agentName,
      siteCode: r.siteCode,
      teamCode: r.teamCode,
      callerMasked: r.callerMasked,
      anonymousCaller: r.anonymousCaller,
      callAt: r.callAt,
      callWeek: r.callWeek,
      durationSec: r.durationSec,
      matchedAgent: m.agent ? { id: m.agent.id, fullName: m.agent.fullName, status: m.agent.status } : null,
      site: m.site,
      duplicateOf: dupes.get(i) ?? null,
    };
  });
}

export type PasteChoice =
  | { action: "use"; agentId: string }
  | { action: "create"; fullName: string; siteId: string; teamCode?: string | null }
  | { action: "skip" };

/** Queue the pasted calls for review. The text is re-parsed here — the client's preview is never trusted. */
export async function queueFromPaste(actor: Actor, text: string, choices: Record<number, PasteChoice>) {
  const scorecard = await getActiveScorecard();
  const parsed = parsePortalText(text);
  const preview = await previewPaste(actor, text);
  const created: string[] = [];
  const skipped: { index: number; reason: string }[] = [];

  for (const row of parsed) {
    const p = preview[row.index];
    if (!row.ok || !p.ok) {
      skipped.push({ index: row.index, reason: row.ok ? "Couldn’t read this row." : row.reason });
      continue;
    }
    const choice = choices[row.index];
    if (choice?.action === "skip") {
      skipped.push({ index: row.index, reason: "Skipped" });
      continue;
    }
    if (!choice && row.context === "extension") {
      skipped.push({ index: row.index, reason: "Internal extension call" });
      continue;
    }
    if (!choice && p.duplicateOf) {
      skipped.push({ index: row.index, reason: "Already reviewed" });
      continue;
    }

    let agentId: string | null = null;
    if (choice?.action === "use") agentId = choice.agentId;
    else if (choice?.action === "create") {
      const a = await createAgent(actor, { fullName: choice.fullName || row.agentName, siteId: choice.siteId, teamCode: choice.teamCode ?? row.teamCode });
      agentId = a.id;
    } else agentId = p.matchedAgent?.id ?? null;

    if (!agentId) {
      skipped.push({ index: row.index, reason: `No agent on the roster matches “${row.agentName}”` });
      continue;
    }
    const [agent] = await db.select({ id: agents.id, siteId: agents.siteId }).from(agents).where(eq(agents.id, agentId)).limit(1);
    if (!agent) {
      skipped.push({ index: row.index, reason: "That agent no longer exists" });
      continue;
    }

    const callAt = new Date(row.callAt);
    const [ev] = await db
      .insert(evaluations)
      .values({
        versionId: scorecard.id,
        agentId: agent.id,
        siteId: agent.siteId,
        reviewerId: actor.id,
        status: "queued",
        source: "smart_paste",
        callType: row.anonymousCaller ? "special" : "booking",
        callAt,
        callWeek: weekStartOf(callAt),
        durationSec: row.durationSec,
        queue: row.queue,
        extension: row.extension,
        callerMasked: row.callerMasked,
        callerHash: row.callerNumber ? hashCaller(row.callerNumber) : null,
        anonymousCaller: row.anonymousCaller,
      })
      .returning({ id: evaluations.id });
    created.push(ev.id);
  }
  if (created.length) await audit(actor, { action: "evaluation.queued", entity: "evaluation", after: { count: created.length, ids: created } });
  return { created, skipped };
}

// ---------------------------------------------------------------- manual entry
export type ManualCallInput = {
  agentId: string;
  callAt: Date;
  durationSec: number | null;
  callType: CallType;
  queue?: string | null;
  extension?: string | null;
  caller?: string | null;
};

export async function createManual(actor: Actor, input: ManualCallInput) {
  const scorecard = await getActiveScorecard();
  const [agent] = await db.select({ id: agents.id, siteId: agents.siteId }).from(agents).where(eq(agents.id, input.agentId)).limit(1);
  if (!agent) throw notFound("Pick an agent from the roster.");
  if (input.callAt.getTime() > Date.now() + 5 * 60_000) throw invalid("The call time is in the future.");
  const anonymous = isAnonymousCaller(input.caller);
  const normalised = anonymous ? null : normalizeUkPhone(input.caller);
  if (input.caller && !anonymous && !normalised) throw invalid("That caller number doesn’t look right. Leave it blank if you don’t have it.");
  const [dupe] = [...(await findDuplicates([{ callAt: input.callAt, agentId: agent.id, callerHash: normalised ? hashCaller(normalised) : null }])).values()];

  const [ev] = await db
    .insert(evaluations)
    .values({
      versionId: scorecard.id,
      agentId: agent.id,
      siteId: agent.siteId,
      reviewerId: actor.id,
      status: "draft",
      source: "manual",
      callType: input.callType,
      callAt: input.callAt,
      callWeek: weekStartOf(input.callAt),
      durationSec: input.durationSec,
      queue: input.queue?.trim() || null,
      extension: input.extension?.trim() || null,
      callerMasked: anonymous ? "Withheld" : normalised ? maskPhone(normalised) : null,
      callerHash: normalised ? hashCaller(normalised) : null,
      anonymousCaller: anonymous,
    })
    .returning({ id: evaluations.id });
  await audit(actor, { action: "evaluation.created", entity: "evaluation", entityId: ev.id, after: { source: "manual" } });
  return { id: ev.id, duplicateOf: dupe ?? null };
}

// ---------------------------------------------------------------- review studio
async function loadEvaluation(id: string) {
  const [ev] = await db.select().from(evaluations).where(and(eq(evaluations.id, id), notDeleted)).limit(1);
  if (!ev) throw notFound("That review doesn’t exist or was deleted.");
  return ev;
}

function canView(actor: Actor, ev: { reviewerId: string }) {
  return actor.role === "admin" || ev.reviewerId === actor.id;
}

export function editState(
  actor: Actor,
  ev: { reviewerId: string; status: string; submittedAt: Date | null },
  editWindowHours: number,
): { canEdit: boolean; mode: "new" | "amend"; reason?: string } {
  if (ev.status !== "submitted") {
    return canView(actor, ev) ? { canEdit: true, mode: "new" } : { canEdit: false, mode: "new", reason: "Only the reviewer can finish this review." };
  }
  if (actor.role === "admin") return { canEdit: true, mode: "amend" };
  if (ev.reviewerId !== actor.id) return { canEdit: false, mode: "amend", reason: "You can only change your own reviews." };
  const hours = ev.submittedAt ? (Date.now() - ev.submittedAt.getTime()) / 3_600_000 : 0;
  return hours <= editWindowHours
    ? { canEdit: true, mode: "amend" }
    : { canEdit: false, mode: "amend", reason: `Reviews can be changed for ${editWindowHours} hours after submitting. Ask an admin to amend it.` };
}

export async function getReview(actor: Actor, id: string) {
  const ev = await loadEvaluation(id);
  if (!canView(actor, ev)) throw forbidden("This review belongs to another reviewer.");
  const scorecard = await getScorecard(ev.versionId);
  const [agent] = await db
    .select({ id: agents.id, fullName: agents.fullName, teamCode: agents.teamCode, status: agents.status, siteName: sites.name, siteCode: sites.code })
    .from(agents)
    .innerJoin(sites, eq(sites.id, agents.siteId))
    .where(eq(agents.id, ev.agentId))
    .limit(1);
  const [reviewer] = await db.select({ name: users.name }).from(users).where(eq(users.id, ev.reviewerId)).limit(1);
  const answerRows = await db.select().from(evaluationAnswers).where(eq(evaluationAnswers.evaluationId, id));
  const issueRows = await db.select().from(evaluationIssues).where(eq(evaluationIssues.evaluationId, id));

  let answers: Record<string, AnswerInput> = {};
  if (answerRows.length) {
    for (const a of answerRows) answers[a.criterionId] = { answer: a.answer, note: a.note, atTime: a.atTime };
  } else {
    const d = defaultAnswers(scorecard.criteria, ev.callType);
    answers = Object.fromEntries(Object.entries(d).map(([k, v]) => [k, { answer: v }]));
  }
  return {
    evaluation: ev,
    agent,
    reviewerName: reviewer?.name ?? "—",
    scorecard,
    answers,
    issues: issueRows.map((i) => ({ issueId: i.issueId, note: i.note })),
    edit: editState(actor, ev, scorecard.settings.editWindowHours),
  };
}

function cleanText(v: string | null | undefined, max = 4000) {
  const t = v?.trim();
  return t ? t.slice(0, max) : null;
}

async function writeAnswers(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], id: string, scorecard: Scorecard, payload: ReviewPayload) {
  const validIds = new Set(scorecard.criteria.map((c) => c.id));
  const validIssues = new Set(scorecard.issues.map((i) => i.id));
  await tx.delete(evaluationAnswers).where(eq(evaluationAnswers.evaluationId, id));
  const answerRows = Object.entries(payload.answers)
    .filter(([cid]) => validIds.has(cid))
    .map(([criterionId, a]) => ({
      evaluationId: id,
      criterionId,
      answer: a.answer,
      note: cleanText(a.note, 1000),
      atTime: a.atTime && /^\d{1,2}:\d{2}(:\d{2})?$/.test(a.atTime.trim()) ? a.atTime.trim() : null,
    }));
  if (answerRows.length) await tx.insert(evaluationAnswers).values(answerRows);
  await tx.delete(evaluationIssues).where(eq(evaluationIssues.evaluationId, id));
  const issueRows = payload.issues.filter((i) => validIssues.has(i.issueId)).map((i) => ({ evaluationId: id, issueId: i.issueId, note: cleanText(i.note, 1000) }));
  if (issueRows.length) await tx.insert(evaluationIssues).values(issueRows);
}

export async function saveDraft(actor: Actor, id: string, payload: ReviewPayload) {
  const ev = await loadEvaluation(id);
  if (!canView(actor, ev)) throw forbidden();
  if (ev.status === "submitted") throw invalid("This review is already submitted. Use Save changes to amend it.");
  const scorecard = await getScorecard(ev.versionId);
  await db.transaction(async (tx) => {
    await writeAnswers(tx, id, scorecard, payload);
    await tx
      .update(evaluations)
      .set({
        status: "draft",
        callType: payload.callType,
        feedback: cleanText(payload.feedback),
        strengths: cleanText(payload.strengths),
        improvements: cleanText(payload.improvements),
        updatedAt: new Date(),
      })
      .where(eq(evaluations.id, id));
  });
  return { savedAt: new Date().toISOString() };
}

/** Validate, score and submit (or amend) a review. */
export async function submitReview(actor: Actor, id: string, payload: ReviewPayload, amendReason?: string | null) {
  const ev = await loadEvaluation(id);
  const scorecard = await getScorecard(ev.versionId);
  const state = editState(actor, ev, scorecard.settings.editWindowHours);
  if (!state.canEdit) throw forbidden(state.reason);
  if (state.mode === "amend" && (!amendReason || amendReason.trim().length < 5)) {
    throw invalid("Say briefly why you’re changing a submitted review (at least 5 characters).");
  }

  const answers: Record<string, Answer> = {};
  for (const c of scorecard.criteria) {
    const a = payload.answers[c.id];
    if (a) answers[c.id] = a.answer;
  }
  const validIssues = payload.issues.filter((i) => scorecard.issues.some((x) => x.id === i.issueId));
  const result = scoreEvaluation(engineCriteria(scorecard), answers, validIssues.length, engineSettings(scorecard));

  const title = (cid: string) => scorecard.criteria.find((c) => c.id === cid)?.title ?? "a criterion";
  if (result.missing.length) throw invalid(`Answer every criterion before submitting — “${title(result.missing[0])}” is still open.`);
  if (result.invalid.length) throw invalid(`“${title(result.invalid[0])}” doesn’t allow that answer.`);
  const noWithoutNote = scorecard.criteria.find((c) => payload.answers[c.id]?.answer === "no" && !payload.answers[c.id]?.note?.trim());
  if (noWithoutNote) throw invalid(`Add a short note explaining the “No” on “${noWithoutNote.title}”.`);
  const issueWithoutNote = validIssues.find((i) => !i.note?.trim());
  if (issueWithoutNote) {
    const name = scorecard.issues.find((x) => x.id === issueWithoutNote.issueId)?.title ?? "the issue";
    throw invalid(`Describe what happened for the zero-tolerance issue “${name}”.`);
  }
  if (result.score === null) throw invalid("Every criterion is N/A, so this call can’t be scored.");

  const now = new Date();
  await db.transaction(async (tx) => {
    await writeAnswers(tx, id, scorecard, { ...payload, issues: validIssues });
    await tx
      .update(evaluations)
      .set({
        status: "submitted",
        callType: payload.callType,
        score: result.score,
        rawScore: result.raw,
        band: result.band,
        applicableCount: result.applicable,
        points: result.points,
        penalty: result.penalty,
        sectionScores: result.sections,
        feedback: cleanText(payload.feedback),
        strengths: cleanText(payload.strengths),
        improvements: cleanText(payload.improvements),
        updatedAt: now,
        ...(state.mode === "amend"
          ? { amendedAt: now, amendedBy: actor.id, amendReason: amendReason!.trim().slice(0, 500) }
          : { submittedAt: now }),
      })
      .where(eq(evaluations.id, id));
    await audit(
      actor,
      {
        action: state.mode === "amend" ? "evaluation.amended" : "evaluation.submitted",
        entity: "evaluation",
        entityId: id,
        before: state.mode === "amend" ? { score: ev.score, band: ev.band } : null,
        after: { score: result.score, band: result.band, reason: amendReason ?? undefined },
      },
      tx,
    );
  });
  return { score: result.score, band: result.band };
}

export async function deleteReview(actor: Actor, id: string, reason?: string | null) {
  const ev = await loadEvaluation(id);
  if (ev.status === "submitted" && actor.role !== "admin") throw forbidden("Only an admin can delete a submitted review.");
  if (!canView(actor, ev)) throw forbidden();
  if (ev.status === "submitted" && (!reason || reason.trim().length < 5)) throw invalid("Give a reason for deleting a submitted review.");
  await db.update(evaluations).set({ deletedAt: new Date() }).where(eq(evaluations.id, id));
  await audit(actor, { action: "evaluation.deleted", entity: "evaluation", entityId: id, before: { status: ev.status, score: ev.score }, after: { reason } });
}

// ---------------------------------------------------------------- lists
const listColumns = {
  id: evaluations.id,
  status: evaluations.status,
  callType: evaluations.callType,
  callAt: evaluations.callAt,
  callWeek: evaluations.callWeek,
  durationSec: evaluations.durationSec,
  score: evaluations.score,
  band: evaluations.band,
  source: evaluations.source,
  callerMasked: evaluations.callerMasked,
  submittedAt: evaluations.submittedAt,
  updatedAt: evaluations.updatedAt,
  amendedAt: evaluations.amendedAt,
  agentId: agents.id,
  agentName: agents.fullName,
  siteName: sites.name,
  siteCode: sites.code,
  reviewerId: users.id,
  reviewerName: users.name,
  issueCount: sql<number>`(select count(*)::int from ${evaluationIssues} ei where ei.evaluation_id = ${evaluations.id})`,
};

function listQuery() {
  return db
    .select(listColumns)
    .from(evaluations)
    .innerJoin(agents, eq(agents.id, evaluations.agentId))
    .innerJoin(sites, eq(sites.id, evaluations.siteId))
    .innerJoin(users, eq(users.id, evaluations.reviewerId));
}

export type EvaluationListRow = Awaited<ReturnType<typeof listMyQueue>>[number];

export async function listMyQueue(actor: Actor) {
  return listQuery()
    .where(and(notDeleted, eq(evaluations.reviewerId, actor.id), inArray(evaluations.status, ["queued", "draft"])))
    .orderBy(asc(evaluations.callAt), asc(evaluations.createdAt));
}

export type EvaluationFilters = {
  from?: string; // week (Monday) inclusive
  to?: string; // week (Monday) inclusive
  siteId?: string;
  agentId?: string;
  reviewerId?: string;
  band?: "perfect" | "meets" | "below" | "fail";
  callType?: CallType;
  issueKey?: string;
  criterionKey?: string; // show calls with a No (or Partial) on this criterion
  q?: string;
};

function filterConds(f: EvaluationFilters): SQL[] {
  const conds: (SQL | undefined)[] = [notDeleted, eq(evaluations.status, "submitted")];
  if (f.from) conds.push(gte(evaluations.callWeek, f.from));
  if (f.to) conds.push(lte(evaluations.callWeek, f.to));
  if (f.siteId) conds.push(eq(evaluations.siteId, f.siteId));
  if (f.agentId) conds.push(eq(evaluations.agentId, f.agentId));
  if (f.reviewerId) conds.push(eq(evaluations.reviewerId, f.reviewerId));
  if (f.band) conds.push(eq(evaluations.band, f.band));
  if (f.callType) conds.push(eq(evaluations.callType, f.callType));
  if (f.issueKey) {
    conds.push(sql`exists (select 1 from ${evaluationIssues} ei join ${hihiIssues} hi on hi.id = ei.issue_id where ei.evaluation_id = ${evaluations.id} and hi.key = ${f.issueKey})`);
  }
  if (f.criterionKey) {
    conds.push(sql`exists (select 1 from ${evaluationAnswers} ea join ${criteria} c on c.id = ea.criterion_id where ea.evaluation_id = ${evaluations.id} and c.key = ${f.criterionKey} and ea.answer in ('no','partial'))`);
  }
  if (f.q?.trim()) {
    const like = `%${f.q.trim().replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
    conds.push(
      or(
        ilike(evaluations.feedback, like),
        ilike(evaluations.strengths, like),
        ilike(evaluations.improvements, like),
        ilike(agents.fullName, like),
        sql`exists (select 1 from ${evaluationAnswers} ea where ea.evaluation_id = ${evaluations.id} and ea.note ilike ${like})`,
      ),
    );
  }
  return conds.filter((c): c is SQL => !!c);
}

export async function listMyReviews(actor: Actor, opts: { page?: number; pageSize?: number; q?: string } = {}) {
  const pageSize = opts.pageSize ?? 25;
  const page = Math.max(1, opts.page ?? 1);
  const where = and(...filterConds({ q: opts.q }), eq(evaluations.reviewerId, actor.id));
  const [rows, [{ total }]] = await Promise.all([
    listQuery().where(where).orderBy(desc(evaluations.submittedAt)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ total: count() }).from(evaluations).innerJoin(agents, eq(agents.id, evaluations.agentId)).where(where),
  ]);
  return { rows, total, page, pageSize };
}

export async function searchEvaluations(actor: Actor, filters: EvaluationFilters, opts: { page?: number; pageSize?: number; sort?: "recent" | "score_asc" | "score_desc" } = {}) {
  if (actor.role !== "admin") throw forbidden();
  const pageSize = Math.min(opts.pageSize ?? 25, 200);
  const page = Math.max(1, opts.page ?? 1);
  const where = and(...filterConds(filters));
  const order =
    opts.sort === "score_asc" ? [asc(evaluations.score), desc(evaluations.callAt)] : opts.sort === "score_desc" ? [desc(evaluations.score), desc(evaluations.callAt)] : [desc(evaluations.callAt), desc(evaluations.submittedAt)];
  const [rows, [{ total }]] = await Promise.all([
    listQuery().where(where).orderBy(...order).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ total: count() }).from(evaluations).innerJoin(agents, eq(agents.id, evaluations.agentId)).where(where),
  ]);
  return { rows, total, page, pageSize };
}

/** Full detail for the read-only evaluation view. */
export async function getEvaluationView(actor: Actor, id: string) {
  const review = await getReview(actor, id);
  const issueMeta = new Map(review.scorecard.issues.map((i) => [i.id, i]));
  let amendedByName: string | null = null;
  if (review.evaluation.amendedBy) {
    const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, review.evaluation.amendedBy)).limit(1);
    amendedByName = u?.name ?? null;
  }
  return {
    ...review,
    amendedByName,
    issueDetails: review.issues.map((i) => ({ ...i, issue: issueMeta.get(i.issueId) ?? null })),
  };
}

/** Rows for Excel/CSV export: one row per evaluation with every criterion as a column. */
export async function exportEvaluations(actor: Actor, filters: EvaluationFilters, limit = 5000) {
  if (actor.role !== "admin") throw forbidden();
  const rows = await listQuery()
    .where(and(...filterConds(filters)))
    .orderBy(desc(evaluations.callAt))
    .limit(limit);
  const ids = rows.map((r) => r.id);
  if (!ids.length) return { rows: [], criteriaKeys: [] as { key: string; title: string }[], answers: new Map(), issues: new Map(), feedback: new Map() };
  const [answerRows, issueRows, feedbackRows] = await Promise.all([
    db
      .select({ evaluationId: evaluationAnswers.evaluationId, key: criteria.key, title: criteria.title, position: criteria.position, answer: evaluationAnswers.answer })
      .from(evaluationAnswers)
      .innerJoin(criteria, eq(criteria.id, evaluationAnswers.criterionId))
      .where(inArray(evaluationAnswers.evaluationId, ids)),
    db
      .select({ evaluationId: evaluationIssues.evaluationId, shortName: hihiIssues.shortName })
      .from(evaluationIssues)
      .innerJoin(hihiIssues, eq(hihiIssues.id, evaluationIssues.issueId))
      .where(inArray(evaluationIssues.evaluationId, ids)),
    db.select({ id: evaluations.id, feedback: evaluations.feedback, sections: evaluations.sectionScores }).from(evaluations).where(inArray(evaluations.id, ids)),
  ]);
  const keyMap = new Map<string, { key: string; title: string; position: number }>();
  const answers = new Map<string, Record<string, string>>();
  for (const a of answerRows) {
    if (!keyMap.has(a.key)) keyMap.set(a.key, { key: a.key, title: a.title, position: a.position });
    if (!answers.has(a.evaluationId)) answers.set(a.evaluationId, {});
    answers.get(a.evaluationId)![a.key] = a.answer;
  }
  const issues = new Map<string, string[]>();
  for (const i of issueRows) issues.set(i.evaluationId, [...(issues.get(i.evaluationId) ?? []), i.shortName]);
  const feedback = new Map(feedbackRows.map((f) => [f.id, f]));
  const criteriaKeys = [...keyMap.values()].sort((a, b) => a.position - b.position).map(({ key, title }) => ({ key, title }));
  return { rows, criteriaKeys, answers, issues, feedback };
}
