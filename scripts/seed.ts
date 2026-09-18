/**
 * npm run db:seed          → TMQ framework, sites, first admin (safe to run repeatedly)
 * npm run db:seed:sample   → the above plus a sample roster and ~3 months of review history
 */
import "./env";
import { eq, sql } from "drizzle-orm";
import { db } from "../src/db";
import {
  agents,
  evaluationAnswers,
  evaluationIssues,
  evaluations,
  scorecardVersions,
  sites,
  users,
  type CallType,
} from "../src/db/schema";
import { installFramework, getActiveScorecard, engineCriteria, engineSettings } from "../src/server/services/scorecard";
import { hashPassword } from "../src/server/auth/password";
import { addDays, currentWeekStart, londonWallTimeToUtc, weekStartOf } from "../src/lib/dates";
import { defaultAnswers, scoreEvaluation, type Answer } from "../src/lib/scoring/engine";
import { maskPhone } from "../src/lib/phone";
import { hashCaller } from "../src/server/crypto";

const SAMPLE = process.argv.includes("--sample");

const SITES = [
  { code: "DMN", name: "Demo North" },
  { code: "DMC", name: "Demo Central" },
  { code: "DMS", name: "Demo South" },
];

// Fictional roster. skill = base chance of missing a criterion; drift = change in that chance per week.
const ROSTER: { name: string; site: string; team: string; ext: string; skill: number; drift: number; risky?: boolean }[] = [
  { name: "Demo Ava Stone", site: "DMN", team: "D1", ext: "8101", skill: 0.03, drift: 0 },
  { name: "Demo Leo Rivers", site: "DMN", team: "D1", ext: "8102", skill: 0.1, drift: -0.004 },
  { name: "Demo Mia Cloud", site: "DMN", team: "D2", ext: "8103", skill: 0.05, drift: 0 },
  { name: "Demo Noah Vale", site: "DMC", team: "D1", ext: "8201", skill: 0.08, drift: 0.005, risky: true },
  { name: "Demo Ivy Lake", site: "DMC", team: "D1", ext: "8202", skill: 0.04, drift: 0 },
  { name: "Demo Eli Brook", site: "DMC", team: "D2", ext: "8203", skill: 0.07, drift: -0.002 },
  { name: "Demo Zoe Fields", site: "DMS", team: "D1", ext: "8301", skill: 0.12, drift: -0.006 },
  { name: "Demo Max Hill", site: "DMS", team: "D2", ext: "8302", skill: 0.05, drift: 0.001 },
];

const DIFFICULTY: Record<string, number> = {
  full_address: 1.7,
  no_spelling_known_locations: 1.6,
  eta_handling: 1.5,
  booking_procedures: 1.6,
  airport_details: 1.4,
  natural_conversation: 1.3,
  confident_closure: 1.4,
  agent_introduction: 1.2,
  closing_statement: 1.1,
  commercial_authentication: 1.3,
};

const NOTES: Record<string, string[]> = {
  company_greeting: ["Greeting took around 7 seconds.", "Said “Take Me Taxis” instead of “Take Me”.", "Answered with “Hello?” and no brand name."],
  agent_introduction: ["Name was rushed and hard to catch.", "No name given at the start of the call."],
  clear_enunciation: ["Spoke quickly in the greeting and dropped words.", "Some mumbling during the opening."],
  confirming_names: ["Asked for the name three times.", "Did not confirm the passenger name."],
  full_address: ["Asked the caller to spell Demo Market.", "Did not confirm the building number.", "Asked for the postcode of Demo Station."],
  commercial_authentication: ["Did not check the account password.", "Skipped the authorised caller check."],
  avoiding_assumptions: ["Assumed an ASAP pickup without asking.", "Assumed the destination from a previous booking."],
  booking_procedures: ["Did not challenge a tight train connection.", "No contact number taken from a withheld caller.", "Did not explain the return trip terms."],
  airport_details: ["Demo Airport terminal not confirmed.", "No fictional flight number taken.", "Luggage count not asked."],
  correct_information: ["Gave two different prices during the call."],
  politeness: ["Tone was flat and transactional.", "Few please or thank yous."],
  professionalism: ["Sounded irritated with a repeat question.", "Said “I don’t know that area”."],
  holds_mutes: ["Muted for 40 seconds without explanation.", "Unexplained hold while checking availability."],
  natural_conversation: ["Overused “perfect” throughout.", "Called the caller “love” repeatedly.", "Sounded scripted."],
  engaging: ["Interrupted the caller twice.", "Missed a chance to show empathy about a late driver."],
  eta_handling: ["Promised 5 minutes with no disclaimer.", "Gave a firm ETA on a busy night."],
  call_control: ["Long silences while typing.", "Call drifted and took longer than needed."],
  no_spelling_known_locations: ["Asked the caller to spell Demo Hospital.", "Asked for the postcode of Demo Shopping Centre."],
  active_listening: ["Asked for the pickup address twice.", "Missed that the caller needed an estate car."],
  confident_closure: ["Did not recap the pickup time.", "No paraphrase of the pickup address at the end."],
  closing_statement: ["Ended with just “okay bye”.", "Line left open after the goodbye."],
};

const GOOD_FEEDBACK = [
  "Excellent call. Warm greeting, confident control and a clear recap at the end.",
  "Really natural and friendly. Booking details captured first time.",
  "Great local knowledge, no unnecessary spellings. Keep it up.",
  "Professional throughout and a tidy close.",
];

// Deterministic randomness so every run produces the same history.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260907);
const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
const between = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));

function callType(): CallType {
  const r = rand();
  if (r < 0.6) return "booking";
  if (r < 0.7) return "airport";
  if (r < 0.8) return "account";
  if (r < 0.88) return "special";
  if (r < 0.94) return "enquiry";
  if (r < 0.97) return "complaint";
  return "cancellation";
}

async function ensureBase() {
  const [active] = await db.select().from(scorecardVersions).where(eq(scorecardVersions.status, "active")).limit(1);
  if (!active) {
    await installFramework(db, { version: 1, status: "active" });
    console.log("✓ Installed TMQ framework v1 (21 criteria, 11 zero-tolerance issues)");
  } else console.log(`• Scorecard v${active.version} already active`);

  for (const s of SITES) {
    await db.insert(sites).values(s).onConflictDoNothing({ target: sites.code });
  }
  console.log(`✓ Sites: ${SITES.map((s) => s.name).join(", ")}`);

  const email = (process.env.SEED_ADMIN_EMAIL || "demo.admin@takeme.taxi").toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD || "Demo-Admin-2026!";
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!existing) {
    await db.insert(users).values({ name: "Demo Hassan Admin", email, role: "admin", passwordHash: await hashPassword(password), mustChangePassword: false });
    console.log(`✓ Admin account: ${email}`);
  } else console.log(`• Admin ${email} already exists`);
}

async function seedSample() {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(evaluations);
  if (n > 0) {
    console.log(`• ${n} evaluations already exist — sample history not added again (run npm run db:reset for a clean slate).`);
    return;
  }
  const reviewerPassword = "Demo-QA-2026!";
  const reviewerHash = await hashPassword(reviewerPassword);
  const reviewerDefs = [{ name: "Demo Hassan QA", email: "demo.qa@takeme.taxi", leniency: 0.8 }];
  const reviewers: { id: string; leniency: number }[] = [];
  for (const r of reviewerDefs) {
    const [row] = await db
      .insert(users)
      .values({ name: r.name, email: r.email, role: "qa", passwordHash: reviewerHash, mustChangePassword: false })
      .onConflictDoNothing({ target: users.email })
      .returning();
    const u = row ?? (await db.select().from(users).where(eq(users.email, r.email)))[0];
    reviewers.push({ id: u.id, leniency: r.leniency });
  }
  console.log(`✓ Reviewer account: demo.qa@takeme.taxi (password ${reviewerPassword})`);

  const siteRows = await db.select().from(sites);
  const siteId = (code: string) => siteRows.find((s) => s.code === code)!.id;
  const agentRows = [];
  for (const a of ROSTER) {
    const [row] = await db.insert(agents).values({ fullName: a.name, siteId: siteId(a.site), teamCode: a.team, extension: a.ext }).returning();
    agentRows.push({ ...a, id: row.id, siteId: row.siteId });
  }
  // One agent a reviewer met in the portal, waiting for an admin to confirm.
  await db.insert(agents).values({ fullName: "Demo Pending Agent", siteId: siteId("DMC"), teamCode: "D2", status: "pending" });
  console.log(`✓ ${agentRows.length} agents across ${SITES.length} sites`);

  const sc = await getActiveScorecard();
  const crit = engineCriteria(sc);
  const settings = engineSettings(sc);
  const issueByKey = new Map(sc.issues.map((i) => [i.key, i]));
  const thisWeek = currentWeekStart();
  const WEEKS = 12;

  type Pending = {
    ev: typeof evaluations.$inferInsert;
    answers: { criterionId: string; answer: Answer; note: string | null }[];
    issue: { issueId: string; note: string } | null;
  };
  const pending: Pending[] = [];

  for (let w = WEEKS; w >= 0; w--) {
    const week = addDays(thisWeek, -7 * w);
    const isCurrent = w === 0;
    for (const agent of agentRows) {
      const target = isCurrent ? between(0, 4) : rand() < 0.15 ? between(6, 9) : 10;
      const missBase = Math.max(0.01, agent.skill + agent.drift * (WEEKS - w));
      for (let i = 0; i < target; i++) {
        const reviewer = pick(reviewers);
        const type = callType();
        const dayOffset = isCurrent ? between(0, Math.max(0, Math.min(6, Math.floor((Date.now() - Date.parse(week)) / 86_400_000)))) : between(0, 6);
        const day = addDays(week, dayOffset);
        const [y, m, d] = day.split("-").map(Number);
        const hour = rand() < 0.2 ? between(0, 5) : between(6, 23);
        const callAt = londonWallTimeToUtc(y, m, d, hour, between(0, 59), between(0, 59));
        if (callAt.getTime() > Date.now()) continue;

        const answersMap = defaultAnswers(sc.criteria, type);
        const answers: Pending["answers"] = [];
        for (const c of sc.criteria) {
          let a: Answer = answersMap[c.id];
          let note: string | null = null;
          if (a !== "na") {
            const p = missBase * (DIFFICULTY[c.key] ?? 1) * reviewer.leniency;
            if (rand() < p) {
              a = !c.allowPartial || rand() < 0.35 ? "no" : "partial";
              note = pick(NOTES[c.key] ?? ["Missed on this call."]);
            }
          }
          answers.push({ criterionId: c.id, answer: a, note: a === "no" || rand() < 0.7 ? note : null });
        }
        let issue: Pending["issue"] = null;
        if (rand() < (agent.risky ? 0.025 : 0.004)) {
          const key = pick(["gdpr", "rudeness", "booking_error", "hang_up", "language", "business_refusal"]);
          const def = issueByKey.get(key);
          if (def) issue = { issueId: def.id, note: key === "gdpr" ? "Read a previous passenger’s address back to the wrong caller." : `Clear ${def.shortName.toLowerCase()} breach on this call.` };
        }
        const result = scoreEvaluation(crit, Object.fromEntries(answers.map((x) => [x.criterionId, x.answer])), issue ? 1 : 0, settings);
        const misses = answers.filter((x) => x.note).map((x) => x.note!);
        const phone = `07700${String(900000 + between(0, 999)).padStart(6, "0")}`;
        const submittedAt = isCurrent ? new Date(Math.min(Date.now(), callAt.getTime() + between(1, 30) * 3_600_000)) : londonWallTimeToUtc(...(addDays(week, 7 + between(0, 2)).split("-").map(Number) as [number, number, number]), between(9, 17), between(0, 59));

        // Leave a few of this week's calls in the reviewer's queue.
        const status = isCurrent && rand() < 0.25 ? (rand() < 0.5 ? "queued" : "draft") : "submitted";
        pending.push({
          ev: {
            versionId: sc.id,
            agentId: agent.id,
            siteId: agent.siteId,
            reviewerId: reviewer.id,
            status,
            source: rand() < 0.75 ? "smart_paste" : "manual",
            callType: type,
            callAt,
            callWeek: weekStartOf(callAt),
            durationSec: Math.round(45 + Math.pow(rand(), 1.8) * 360),
            queue: pick(["901", "902", "903"]),
            extension: agent.ext,
            callerMasked: maskPhone(phone),
            callerHash: hashCaller(phone),
            ...(status === "submitted"
              ? {
                  score: result.score,
                  rawScore: result.raw,
                  band: result.band,
                  applicableCount: result.applicable,
                  points: result.points,
                  penalty: result.penalty,
                  sectionScores: result.sections,
                  feedback: issue
                    ? `Zero tolerance: ${issue.note} This needs a conversation with the team leader today.`
                    : misses.length
                      ? `Good call overall. To improve: ${misses.slice(0, 2).join(" ")}`
                      : pick(GOOD_FEEDBACK),
                  submittedAt,
                }
              : {}),
          },
          answers: status === "queued" ? [] : answers,
          issue: status === "submitted" ? issue : null,
        });
      }
    }
  }

  // Insert in batches.
  let inserted = 0;
  for (let i = 0; i < pending.length; i += 250) {
    const batch = pending.slice(i, i + 250);
    const ids = await db.insert(evaluations).values(batch.map((b) => b.ev)).returning({ id: evaluations.id });
    const answerRows = batch.flatMap((b, j) => b.answers.map((a) => ({ evaluationId: ids[j].id, ...a })));
    for (let k = 0; k < answerRows.length; k += 3000) await db.insert(evaluationAnswers).values(answerRows.slice(k, k + 3000));
    const issueRows = batch.flatMap((b, j) => (b.issue ? [{ evaluationId: ids[j].id, ...b.issue }] : []));
    if (issueRows.length) await db.insert(evaluationIssues).values(issueRows);
    inserted += batch.length;
  }
  console.log(`✓ ${inserted} evaluations over ${WEEKS + 1} weeks`);
}

async function main() {
  await ensureBase();
  if (SAMPLE) await seedSample();
  console.log("Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
