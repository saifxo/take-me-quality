import { beforeAll, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { eq } from "drizzle-orm";
import { db, sql } from "@/db";
import { agents, aiSummaries, auditLog, evaluations, sessions, sites, users } from "@/db/schema";
import { makeUser, resetTestDb } from "./helpers/db";
import { signIn, validateSessionToken, revokeUserSessions } from "@/server/services/auth";
import { createUser, resetPassword, updateUser, changeOwnPassword } from "@/server/services/users";
import { createAgent, listAgents, matchPortalNames } from "@/server/services/roster";
import {
  createManual,
  deleteReview,
  editState,
  getReview,
  previewPaste,
  queueFromPaste,
  saveDraft,
  searchEvaluations,
  submitReview,
  type ReviewPayload,
} from "@/server/services/evaluations";
import { createDraft, getActiveScorecard, getScorecard, publishDraft, updateDraftSettings, whatIf } from "@/server/services/scorecard";
import { agentTable, kpis, weeklyCoverage } from "@/server/services/analytics";
import { importWorkbook } from "@/server/services/import";
import { agentCoaching, approveSummary, editCoaching, scrub, weeklyBriefing } from "@/server/services/ai";
import { currentWeekStart, weekStartOf } from "@/lib/dates";
import { AppError } from "@/server/errors";

type Ctx = Awaited<ReturnType<typeof makeUser>>;
let admin: Ctx;
let qa: Ctx;
let qa2: Ctx;
let solId: string;

const PASTE = [
  "Queue\t561 / 1465 - Demo Ava Stone - SOL - DE\t07700900123\t2026-08-31 02:12:07\t00:01:25\t» Play « » Download « » Email «",
  "Queue\t557 / 1466 - New Starter - SOL - DE\t07700900456\t2026-08-31 02:28:43\t00:02:46\t» Play « » Download « » Email «",
  "Exten\tDemo Ivy Lake - BIR - BE\tDemo Ava Stone - SOL - DE\t2026-08-31 02:57:57\t00:00:10\t» Play « » Download « » Email «",
].join("\n");

async function allYesPayload(evaluationId: string): Promise<ReviewPayload> {
  const review = await getReview(qa.actor, evaluationId);
  return { callType: "booking", answers: review.answers, issues: [], feedback: "Great call." };
}

beforeAll(async () => {
  await resetTestDb();
  admin = await makeUser("admin", "admin@test.local");
  qa = await makeUser("qa", "qa@test.local", "Correct-Horse-42", { name: "Demo Hassan QA" });
  qa2 = await makeUser("qa", "qa2@test.local");
  const [sol] = await db.select().from(sites).where(eq(sites.code, "SOL"));
  solId = sol.id;
  await db.insert(agents).values({ fullName: "Demo Ava Stone", siteId: solId, teamCode: "DE", extension: "1465" });
});

describe("authentication", () => {
  it("signs in with the right password and resolves the session", async () => {
    const { token, user } = await signIn("QA@test.local ", qa.password, { ip: "10.0.0.1" });
    expect(user.id).toBe(qa.user.id);
    const s = await validateSessionToken(token);
    expect(s?.email).toBe("qa@test.local");
    expect(s?.role).toBe("qa");
  });

  it("rejects wrong passwords with one generic message and rate-limits after 5 failures", async () => {
    for (let i = 0; i < 5; i++) {
      await expect(signIn("qa2@test.local", "wrong-password-1", { ip: "10.0.0.2" })).rejects.toThrow("don’t match");
    }
    await expect(signIn("qa2@test.local", qa2.password, { ip: "10.0.0.2" })).rejects.toThrow(/Too many failed attempts/);
    await expect(signIn("nobody@test.local", "whatever-123", { ip: "10.0.0.3" })).rejects.toThrow("don’t match");
  });

  it("expires idle sessions and ignores tampered tokens", async () => {
    const { token } = await signIn("admin@test.local", admin.password);
    await db.update(sessions).set({ lastSeenAt: new Date(Date.now() - 3 * 3_600_000) });
    expect(await validateSessionToken(token)).toBeNull();
    expect(await validateSessionToken("x".repeat(43))).toBeNull();
    expect(await validateSessionToken(undefined)).toBeNull();
  });

  it("disabled accounts can’t sign in and lose their sessions", async () => {
    const created = await createUser(admin.actor, { name: "Temp Person", email: "temp@test.local", role: "qa" });
    expect(created.tempPassword).toMatch(/^[A-Z][a-z]+-[A-Z][a-z]+-\d{4}$/);
    const { token } = await signIn("temp@test.local", created.tempPassword);
    await updateUser(admin.actor, created.user.id, { status: "disabled" });
    expect(await validateSessionToken(token)).toBeNull();
    await expect(signIn("temp@test.local", created.tempPassword)).rejects.toThrow(/switched off/);
  });

  it("new accounts must change the temporary password, which must be strong", async () => {
    const created = await createUser(admin.actor, { name: "New QA", email: "newqa@test.local", role: "qa" });
    const actor = { id: created.user.id, role: "qa" as const, name: "New QA", sessionId: "s", email: "newqa@test.local" };
    await expect(changeOwnPassword(actor, { next: "short" }, { firstSignIn: true })).rejects.toThrow(/10 characters/);
    await changeOwnPassword(actor, { next: "Brand-New-Pass-9" }, { firstSignIn: true });
    const [u] = await db.select().from(users).where(eq(users.id, created.user.id));
    expect(u.mustChangePassword).toBe(false);
    await expect(signIn("newqa@test.local", "Brand-New-Pass-9")).resolves.toBeTruthy();
    const reset = await resetPassword(admin.actor, created.user.id);
    await expect(signIn("newqa@test.local", reset.tempPassword)).resolves.toBeTruthy();
  });

  it("an admin can’t lock themselves out", async () => {
    await expect(updateUser(admin.actor, admin.user.id, { role: "qa" })).rejects.toThrow(/own admin access/);
  });
});

describe("role checks in the service layer", () => {
  it("reviewers can’t use admin functions", async () => {
    await expect(createUser(qa.actor, { name: "x", email: "x@test.local", role: "admin" })).rejects.toBeInstanceOf(AppError);
    await expect(searchEvaluations(qa.actor, {})).rejects.toThrow(/access/);
    await expect(createDraft(qa.actor)).rejects.toThrow(/access/);
    await expect(weeklyBriefing(qa.actor, { from: currentWeekStart(), to: currentWeekStart() })).rejects.toThrow(/access/);
  });

  it("agents a reviewer adds wait for admin approval", async () => {
    const a = await createAgent(qa.actor, { fullName: "Portal Newbie", siteId: solId });
    expect(a.status).toBe("pending");
    const b = await createAgent(admin.actor, { fullName: "Admin Added", siteId: solId });
    expect(b.status).toBe("active");
  });
});

describe("smart paste → review → submit", () => {
  let queued: string[] = [];

  it("previews rows with roster matches, site lookup and masked numbers", async () => {
    const rows = await previewPaste(qa.actor, PASTE);
    expect(rows).toHaveLength(3);
    const [a, b, c] = rows;
    expect(a.ok && a.matchedAgent?.fullName).toBe("Demo Ava Stone");
    expect(a.ok && a.site?.code).toBe("SOL");
    expect(a.ok && a.callerMasked).toBe("077•• •••123");
    expect(JSON.stringify(rows)).not.toContain("07700900123"); // the full number never leaves the server
    expect(b.ok && b.matchedAgent).toBeNull();
    expect(c.ok && c.context).toBe("extension");
  });

  it("queues matched calls, creates chosen new agents and skips internal calls", async () => {
    const res = await queueFromPaste(qa.actor, PASTE, { 1: { action: "create", fullName: "New Starter", siteId: solId, teamCode: "DE" } });
    expect(res.created).toHaveLength(2);
    expect(res.skipped.map((s) => s.reason)).toEqual(["Internal extension call"]);
    queued = res.created;
    const [ev] = await db.select().from(evaluations).where(eq(evaluations.id, queued[0]));
    expect(ev.status).toBe("queued");
    expect(ev.callerMasked).toBe("077•• •••123");
    expect(ev.callerHash).toMatch(/^[a-f0-9]{64}$/);
    expect(ev.callWeek).toBe("2026-08-31");
    const newAgent = (await listAgents({ status: "pending" })).find((x) => x.fullName === "New Starter");
    expect(newAgent).toBeTruthy();
  });

  it("flags the same calls as already reviewed on a second paste", async () => {
    const rows = await previewPaste(qa.actor, PASTE);
    expect(rows[0].ok && rows[0].duplicateOf).toBe(queued[0]);
    const again = await queueFromPaste(qa.actor, PASTE, {});
    expect(again.created).toHaveLength(0);
  });

  it("pre-fills a typical booking and scores it on submit", async () => {
    const payload = await allYesPayload(queued[0]);
    await saveDraft(qa.actor, queued[0], payload);
    const res = await submitReview(qa.actor, queued[0], payload);
    expect(res).toEqual({ score: 100, band: "perfect" });
  });

  it("requires a note for every No and for zero-tolerance issues", async () => {
    const sc = await getActiveScorecard();
    const address = sc.criteria.find((c) => c.key === "full_address")!;
    const payload = await allYesPayload(queued[1]);
    payload.answers[address.id] = { answer: "no" };
    await expect(submitReview(qa.actor, queued[1], payload)).rejects.toThrow(/short note/);
    payload.answers[address.id] = { answer: "no", note: "Did not confirm the house number." };
    const res = await submitReview(qa.actor, queued[1], payload);
    expect(res.score).toBe(83.33);
    expect(res.band).toBe("below");

    const gdpr = sc.issues.find((i) => i.key === "gdpr")!;
    await expect(submitReview(admin.actor, queued[1], { ...payload, issues: [{ issueId: gdpr.id }] }, "Found a GDPR breach on re-listen")).rejects.toThrow(/Describe what happened/);
    const failed = await submitReview(admin.actor, queued[1], { ...payload, issues: [{ issueId: gdpr.id, note: "Read out another passenger’s address." }] }, "Found a GDPR breach on re-listen");
    expect(failed).toEqual({ score: 0, band: "fail" });
    const [ev] = await db.select().from(evaluations).where(eq(evaluations.id, queued[1]));
    expect(ev.amendReason).toBe("Found a GDPR breach on re-listen");
  });

  it("won’t submit with an unanswered criterion", async () => {
    const { id } = await createManual(qa.actor, { agentId: (await matchPortalNames([{ agentName: "Demo Ava Stone", siteCode: "SOL" }]))[0].agent!.id, callAt: new Date("2026-09-01T10:00:00Z"), durationSec: 90, callType: "airport" });
    const payload = await allYesPayload(id);
    const first = Object.keys(payload.answers)[0];
    delete payload.answers[first];
    await expect(submitReview(qa.actor, id, payload)).rejects.toThrow(/Answer every criterion/);
  });

  it("manual entry pre-selects N/A by call type and warns about duplicates", async () => {
    const agentId = (await matchPortalNames([{ agentName: "Demo Ava Stone", siteCode: "SOL" }]))[0].agent!.id;
    const { id, duplicateOf } = await createManual(qa.actor, { agentId, callAt: new Date("2026-08-31T01:12:30Z"), durationSec: 85, callType: "airport", caller: "07700 900123" });
    expect(duplicateOf).toBe(queued[0]);
    const review = await getReview(qa.actor, id);
    const airport = review.scorecard.criteria.find((c) => c.key === "airport_details")!;
    const auth = review.scorecard.criteria.find((c) => c.key === "commercial_authentication")!;
    expect(review.answers[airport.id].answer).toBe("yes");
    expect(review.answers[auth.id].answer).toBe("na");
    await expect(createManual(qa.actor, { agentId, callAt: new Date(Date.now() + 3_600_000), durationSec: 60, callType: "booking" })).rejects.toThrow(/future/);
    await expect(createManual(qa.actor, { agentId, callAt: new Date(), durationSec: 60, callType: "booking", caller: "not a number" })).rejects.toThrow(/caller number/);
  });

  it("reviewers can’t open or change someone else’s review, and edit windows apply", async () => {
    await expect(getReview(qa2.actor, queued[0])).rejects.toThrow(/another reviewer/);
    const ev = { reviewerId: qa.user.id, status: "submitted", submittedAt: new Date(Date.now() - 30 * 3_600_000) };
    expect(editState(qa.actor, ev, 24).canEdit).toBe(false);
    expect(editState(admin.actor, ev, 24)).toEqual({ canEdit: true, mode: "amend" });
    expect(editState(qa.actor, { ...ev, submittedAt: new Date() }, 24)).toEqual({ canEdit: true, mode: "amend" });
    const payload = await allYesPayload(queued[0]);
    await expect(submitReview(qa.actor, queued[0], payload)).rejects.toThrow(/why you’re changing/);
    await expect(deleteReview(qa.actor, queued[0])).rejects.toThrow(/Only an admin/);
  });

  it("writes an audit trail", async () => {
    const rows = await db.select().from(auditLog);
    const actions = rows.map((r) => r.action);
    expect(actions).toContain("evaluation.submitted");
    expect(actions).toContain("evaluation.amended");
    expect(actions).toContain("user.created");
  });
});

describe("reporting", () => {
  it("computes KPIs, the agent table and coverage", async () => {
    const week = "2026-08-31";
    const k = await kpis({ from: week, to: week });
    expect(k.evaluations).toBe(2);
    expect(k.avgScore).toBe(50);
    expect(k.autoFails).toBe(1);
    expect(k.meetsShare).toBe(50);
    const table = await agentTable({ from: week, to: week });
    const sarah = table.find((t) => t.name === "Demo Ava Stone")!;
    expect(sarah.calls).toBe(1);
    expect(sarah.avgScore).toBe(100);
    const starter = table.find((t) => t.name === "New Starter")!;
    expect(starter.needsAttention).toBe(true);
    expect(starter.failReasons).toEqual(["GDPR"]);
    const cov = await weeklyCoverage(week);
    expect(cov.target).toBe(10);
  });

  it("explorer filters by band, text and zero-tolerance type", async () => {
    const fails = await searchEvaluations(admin.actor, { band: "fail" });
    expect(fails.total).toBe(1);
    const gdpr = await searchEvaluations(admin.actor, { issueKey: "gdpr" });
    expect(gdpr.total).toBe(1);
    const text = await searchEvaluations(admin.actor, { q: "house number" });
    expect(text.total).toBe(1);
  });

  it("rule-based coaching and briefing work without a Gemini key", async () => {
    const [starter] = await db.select().from(agents).where(eq(agents.fullName, "New Starter"));
    const c = await agentCoaching(admin.actor, starter.id, { from: "2026-08-31", to: "2026-08-31" });
    expect(c.model).toBe("rules");
    expect(String((c.output as { summary: string }).summary)).toMatch(/zero tolerance/i);
    const again = await agentCoaching(admin.actor, starter.id, { from: "2026-08-31", to: "2026-08-31" });
    expect(again.id).toBe(c.id); // identical input reuses the saved result
    const b = await weeklyBriefing(admin.actor, { from: "2026-08-31", to: "2026-08-31" });
    expect((b.output as { headline: string }).headline).toMatch(/2 calls reviewed/);
  });

  it("manual is the default summary mode; AI mode needs a key", async () => {
    const [starter] = await db.select().from(agents).where(eq(agents.fullName, "New Starter"));
    const manual = await agentCoaching(admin.actor, starter.id, { from: "2026-08-31", to: "2026-08-31" }, { mode: "manual" });
    expect(manual.model).toBe("rules");
    await expect(agentCoaching(admin.actor, starter.id, { from: "2026-08-31", to: "2026-08-31" }, { mode: "ai" })).rejects.toThrow(/Gemini API key/);
    await expect(weeklyBriefing(admin.actor, { from: "2026-08-31", to: "2026-08-31" }, { mode: "ai" })).rejects.toThrow(/Gemini API key/);
  });

  it("managers can edit a coaching summary by hand, which clears approval", async () => {
    const [starter] = await db.select().from(agents).where(eq(agents.fullName, "New Starter"));
    const c = await agentCoaching(admin.actor, starter.id, { from: "2026-08-31", to: "2026-08-31" });
    await approveSummary(admin.actor, c.id, true);
    await editCoaching(admin.actor, c.id, { summary: "Rewritten by the manager after the one-to-one.", strengths: ["Warm greeting"], tips: ["Confirm the address"], focus: "Full Address Details" });
    const [row] = await db.select().from(aiSummaries).where(eq(aiSummaries.id, c.id));
    expect((row.output as { summary: string; editedBy: string }).summary).toBe("Rewritten by the manager after the one-to-one.");
    expect((row.output as { editedBy: string }).editedBy).toBe("Test Admin");
    expect(row.approvedAt).toBeNull();
    await expect(editCoaching(qa.actor, c.id, { summary: "Not allowed to do this.", strengths: [], tips: ["x"], focus: "x" })).rejects.toThrow(/access/);
  });

  it("scrubs customer details before anything could reach Gemini", () => {
    const s = scrub("Caller on 07700 900123 at B90 4SB, email jo@example.com, asked twice");
    expect(s).not.toMatch(/07700|900123|B90 4SB|jo@example\.com/);
    expect(s).toContain("[number]");
    expect(s).toContain("[postcode]");
    expect(s).toContain("[email]");
  });
});

describe("versioned scorecard rules", () => {
  it("drafts, previews and publishes a rule change without touching past scores", async () => {
    const draftId = await createDraft(admin.actor);
    const draft = await getScorecard(draftId);
    expect(draft.status).toBe("draft");
    expect(draft.criteria).toHaveLength(21);
    await updateDraftSettings(admin.actor, draftId, { ...draft.settings, kpiPass: 80 });
    const preview = await whatIf(admin.actor, draftId, 520);
    expect(preview.current.evaluations).toBeGreaterThan(0);
    expect(preview.draft.below).toBeLessThanOrEqual(preview.current.below);
    await publishDraft(admin.actor, draftId);
    const active = await getActiveScorecard();
    expect(active.id).toBe(draftId);
    expect(active.settings.kpiPass).toBe(80);
    // Stored scores keep the version they were marked under.
    const [old] = await db.select().from(evaluations).where(eq(evaluations.band, "perfect"));
    expect(old.score).toBe(100);
    expect(old.versionId).not.toBe(draftId);
  });
});

describe("workbook import", () => {
  async function workbook(rows: (string | number | null)[][]) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Analysis");
    ws.addRow(["Call Info"]);
    const sc = await getActiveScorecard();
    ws.addRow(["Agent Campaign", "Agent Name / ID", "Phone Number", "Date & Time", "Duration (MM:SS)", "Call Type", "QA Name", "Date of Review", ...sc.criteria.map((c) => c.title), "HiHi", "Score", "Feedback / Comments"]);
    for (const r of rows) ws.addRow(r);
    return wb.xlsx.writeBuffer();
  }
  const typical = (agent: string, campaign: string, hihi: string | null = null, score = 1) => [
    campaign, agent, null, null, null, "Booking", "Demo Reviewer", 46272,
    ...Array.from({ length: 21 }, (_, i) => ([5, 7, 8].includes(i) ? "N/a" : "Yes")),
    hihi, score, null,
  ];

  it("imports rows, creates sites and agents, matches the sheet’s scores and is idempotent", async () => {
    const buf = await workbook([typical("Kelly Warnock", "Nuneaton"), typical("Louise Nunn", "Solihull"), typical("Louise Nunn", "Solihull", "GDPR", 0)]);
    const report = await importWorkbook(admin.actor, buf as ArrayBuffer, "20260907 - Birmingham TMQ Scorecard.xlsx");
    expect(report.imported).toBe(3);
    expect(report.createdSites).toEqual(["Nuneaton (NUN)"]);
    expect(report.createdAgents.sort()).toEqual(["Kelly Warnock", "Louise Nunn"]);
    expect(report.scoreCompared).toBe(3);
    expect(report.scoreMatches).toBe(3);
    const [ev] = await db.select().from(evaluations).where(eq(evaluations.importRef, "20260907 - Birmingham TMQ Scorecard.xlsx#3"));
    expect(ev.callWeek).toBe("2026-08-31"); // reviewed Mon 7 Sep → calls from the week before
    const again = await importWorkbook(admin.actor, buf as ArrayBuffer, "20260907 - Birmingham TMQ Scorecard.xlsx");
    expect(again.imported).toBe(0);
    expect(again.alreadyImported).toBe(3);
  });

  it("skips rows with blank answers instead of scoring them as No", async () => {
    const row = typical("Blank Row", "Solihull");
    row[8 + 3] = null;
    const buf = await workbook([row]);
    const report = await importWorkbook(admin.actor, buf as ArrayBuffer, "blank.xlsx");
    expect(report.imported).toBe(0);
    expect(report.skipped[0].reason).toMatch(/blank/);
  });

  it("rejects files that aren’t TMQ workbooks", async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("Something else");
    await expect(importWorkbook(admin.actor, (await wb.xlsx.writeBuffer()) as ArrayBuffer, "x.xlsx")).rejects.toThrow(/Analysis/);
    await expect(importWorkbook(admin.actor, new TextEncoder().encode("not excel").buffer, "x.xlsx")).rejects.toThrow(/couldn’t be opened/);
  });
});

describe("week handling", () => {
  it("stores the UK Monday of the call as the reporting week", () => {
    expect(weekStartOf(new Date("2026-08-31T01:12:07Z"))).toBe("2026-08-31");
  });
});

// Keep the connection pool from holding the test process open.
import { afterAll } from "vitest";
afterAll(async () => {
  await revokeUserSessions(admin.user.id);
  await sql.end({ timeout: 5 });
});
