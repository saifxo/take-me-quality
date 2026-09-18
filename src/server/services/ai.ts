/**
 * Gemini-powered writing help. Listening and scoring stay human; AI summarises and suggests.
 * Guardrails: server-side key only, customer data scrubbed before sending, outputs validated against a schema,
 * saved with model + prompt version, reused for identical inputs, and capped per user per day.
 * With no GEMINI_API_KEY the same features return rule-based summaries, clearly labelled.
 */
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { and, desc, eq, gte, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { aiSummaries, users } from "@/db/schema";
import { fingerprint } from "@/server/crypto";
import { londonWallTimeToUtc, londonParts, weekLabel } from "@/lib/dates";
import { audit, type Actor } from "@/server/audit";
import { AppError, forbidden, invalid } from "@/server/errors";
import { agentProfile, agentTable, issueLog, kpis, previousPeriod, criteriaHeatmap, type DashFilter } from "./analytics";
import { getActiveScorecard } from "./scorecard";
import { getAgent } from "./roster";

export const HOUSE_STYLE = "Write in UK English. Do not use dashes of any kind. Be specific, warm and practical. Never invent facts that are not in the data.";

export function aiStatus() {
  return { enabled: !!process.env.GEMINI_API_KEY?.trim(), model: process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash" };
}

/**
 * "manual" (the default) builds summaries from the scores with fixed rules — nothing leaves our servers.
 * "ai" asks Gemini, with customer data scrubbed first.
 */
export type SummaryMode = "manual" | "ai";
type SummaryOpts = { force?: boolean; mode?: SummaryMode };

export const PRIVACY_NOTE =
  "Customer numbers, addresses, postcodes and emails are removed before anything is sent to Gemini, and agents are referred to by first name only, so UK GDPR compliance is maintained.";

function shouldUseAi(mode: SummaryMode | undefined): boolean {
  if (mode !== "ai") return false;
  if (!aiStatus().enabled) throw new AppError("AI summaries need a Gemini API key. Choose Manual, or ask an admin to add GEMINI_API_KEY.", "unavailable");
  return true;
}

/** Remove anything that could identify a customer before text leaves our servers. */
export function scrub(text: string): string {
  return text
    .replace(/\b[\w.+-]+@[\w-]+\.[\w.]+\b/g, "[email]")
    .replace(/(\+?\d[\d\s-]{6,}\d)/g, "[number]")
    .replace(/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/gi, "[postcode]")
    .slice(0, 800);
}

const firstName = (full: string) => full.trim().split(/\s+/)[0] ?? full;

async function callGemini<T>(schema: z.ZodType<T, unknown>, jsonSchema: object, system: string, prompt: string): Promise<T> {
  const { model } = aiStatus();
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  let text: string | undefined;
  try {
    const res = await ai.models.generateContent({
      model,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        systemInstruction: `${system}\n${HOUSE_STYLE}`,
        responseMimeType: "application/json",
        responseJsonSchema: jsonSchema,
        temperature: 0.4,
        // Keep 2.5-series "thinking" short so answers arrive in seconds, not half a minute.
        ...(/2\.5/.test(model) ? { thinkingConfig: { thinkingBudget: 512 } } : {}),
        maxOutputTokens: 8192,
      },
    });
    text = res.text;
  } catch (err) {
    console.error("[ai] Gemini request failed", err instanceof Error ? err.message : err);
    const msg = err instanceof Error ? err.message : "";
    if (/api key|permission|401|403/i.test(msg)) throw new AppError("Gemini rejected the API key. Check GEMINI_API_KEY.", "unavailable");
    if (/not found|404/i.test(msg)) throw new AppError(`The Gemini model “${model}” isn’t available. Set GEMINI_MODEL to a current model.`, "unavailable");
    if (/quota|429|rate/i.test(msg)) throw new AppError("Gemini is rate-limiting requests right now. Try again in a minute.", "rate_limited");
    throw new AppError("Gemini didn’t respond. Try again shortly.", "unavailable");
  }
  if (!text) throw new AppError("Gemini returned an empty answer. Try again.", "unavailable");
  let json: unknown;
  try {
    json = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ""));
  } catch {
    throw new AppError("Gemini’s answer was cut short. Try again.", "unavailable");
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    console.error("[ai] unexpected shape", parsed.error.issues.slice(0, 3));
    throw new AppError("Gemini’s answer wasn’t in the expected shape. Try again.", "unavailable");
  }
  return parsed.data;
}

// Models sometimes return a little more than asked; keep the answer and trim it rather than failing.
const clip = (n: number) => z.string().transform((s) => s.trim().slice(0, n));
const list = (items: number, len: number) =>
  z.array(z.string()).transform((a) =>
    a
      .map((s) => s.trim().slice(0, len))
      .filter(Boolean)
      .slice(0, items),
  );

async function enforceQuota(actor: Actor) {
  const limit = Number(process.env.AI_DAILY_LIMIT_PER_USER || 40);
  const p = londonParts(new Date());
  const since = londonWallTimeToUtc(p.y, p.m, p.d);
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(aiSummaries)
    .where(and(eq(aiSummaries.createdBy, actor.id), gte(aiSummaries.createdAt, since), ne(aiSummaries.model, "rules")));
  if (r.n >= limit) throw new AppError(`You’ve used today’s ${limit} AI requests. The limit resets at midnight UK time.`, "rate_limited");
}

type Kind = "agent_coaching" | "weekly_briefing" | "themes" | "polish";

async function cached(kind: Kind, inputHash: string, agentId: string | null) {
  const [row] = await db
    .select()
    .from(aiSummaries)
    .where(and(eq(aiSummaries.kind, kind), eq(aiSummaries.inputHash, inputHash), agentId ? eq(aiSummaries.agentId, agentId) : sql`true`))
    .orderBy(desc(aiSummaries.createdAt))
    .limit(1);
  return row ?? null;
}

async function save(actor: Actor, kind: Kind, input: { agentId?: string | null; periodStart?: string; periodEnd?: string; model: string; promptVersion: string; inputHash: string; output: Record<string, unknown> }) {
  const [row] = await db
    .insert(aiSummaries)
    .values({ kind, agentId: input.agentId ?? null, periodStart: input.periodStart ?? null, periodEnd: input.periodEnd ?? null, model: input.model, promptVersion: input.promptVersion, inputHash: input.inputHash, output: input.output, createdBy: actor.id })
    .returning();
  await audit(actor, { action: `ai.${kind}`, entity: "ai_summary", entityId: row.id, after: { model: input.model } });
  return row;
}

// ---------------------------------------------------------------- agent coaching
const coachingSchema = z.object({
  summary: clip(1500).pipe(z.string().min(10)),
  strengths: list(4, 300),
  tips: list(3, 400).pipe(z.array(z.string()).min(1)),
  focus: clip(200),
});
export type Coaching = z.infer<typeof coachingSchema>;
const coachingJson = {
  type: "object",
  properties: {
    summary: { type: "string", description: "Three to five sentences summarising the agent's calls in the period." },
    strengths: { type: "array", items: { type: "string" }, description: "Up to three specific strengths." },
    tips: { type: "array", items: { type: "string" }, description: "One or two practical, actionable tips." },
    focus: { type: "string", description: "The single TMQ criterion to focus on next." },
  },
  required: ["summary", "strengths", "tips", "focus"],
};

export async function agentCoaching(actor: Actor, agentId: string, f: DashFilter, opts: SummaryOpts = {}) {
  if (actor.role !== "admin") throw forbidden();
  const agent = await getAgent(agentId);
  const profile = await agentProfile(agentId, f);
  if (profile.summary.evaluations === 0) throw invalid("There are no submitted reviews for this agent in the selected period.");
  const sc = await getActiveScorecard();

  const input = {
    agent: firstName(agent.fullName),
    site: agent.siteName,
    period: `${weekLabel(f.from)} to ${weekLabel(f.to)}`,
    calls: profile.summary.evaluations,
    averageScore: profile.summary.avgScore,
    kpiLinePercent: sc.settings.kpiPass,
    percentOfCallsAboveKpiLine: profile.summary.meetsShare,
    zeroToleranceBreaches: profile.issues.map((i) => i.issues),
    sections: Object.fromEntries(sc.sections.map((s) => [s.shortName, profile.sections[s.key] ?? null])),
    teamSections: Object.fromEntries(sc.sections.map((s) => [s.shortName, profile.teamSections[s.key] ?? null])),
    missedCriteria: profile.criteria.filter((c) => c.misses > 0).slice(0, 6).map((c) => ({ criterion: c.title, misses: c.misses, reviewerNotes: c.notes ? scrub(c.notes) : null })),
    reviewerFeedback: profile.recent.map((r) => r.feedback).filter(Boolean).slice(0, 12).map((t) => scrub(t!)),
  };
  const enabled = shouldUseAi(opts.mode);
  const { model } = aiStatus();
  const promptVersion = "coaching-v1";
  const inputHash = fingerprint({ promptVersion, model: enabled ? model : "rules", input });
  if (!opts.force) {
    const hit = await cached("agent_coaching", inputHash, agentId);
    if (hit) return hit;
  }

  let output: Coaching;
  if (enabled) {
    await enforceQuota(actor);
    output = await callGemini(
      coachingSchema,
      coachingJson,
      "You are a quality coach for Take Me, a UK taxi company's booking call centre. You write coaching notes for agents based on the Take Me Quality (TMQ) framework. kpiLinePercent is the score every call must beat; it is a target, not the agent's result. percentOfCallsAboveKpiLine is the agent's actual share of calls that beat it.",
      `Summarise this agent's quality reviews and give coaching. Data (JSON):\n${JSON.stringify(input)}`,
    );
  } else {
    output = ruleCoaching(input, profile.criteria, sc.criteria);
  }
  return save(actor, "agent_coaching", { agentId, periodStart: f.from, periodEnd: f.to, model: enabled ? model : "rules", promptVersion, inputHash, output });
}

function ruleCoaching(
  input: { agent: string; calls: number; averageScore: number | null; percentOfCallsAboveKpiLine: number | null; zeroToleranceBreaches: string[]; sections: Record<string, number | null> },
  crit: { key: string; title: string; value: number; misses: number }[],
  scCriteria: { key: string; title: string; yesDesc: string | null }[],
): Coaching {
  const sections = Object.entries(input.sections).filter(([, v]) => v !== null) as [string, number][];
  const best = [...sections].sort((a, b) => b[1] - a[1])[0];
  const weakest = crit.find((c) => c.misses > 0);
  const strengths = crit.filter((c) => c.value >= 100).slice(-3).map((c) => `Consistently strong on ${c.title.toLowerCase()}.`);
  const yes = weakest ? scCriteria.find((c) => c.key === weakest.key)?.yesDesc : null;
  const summary = [
    `${input.agent} had ${input.calls} ${input.calls === 1 ? "call" : "calls"} reviewed, averaging ${input.averageScore ?? 0}%` +
      (input.percentOfCallsAboveKpiLine !== null ? ` with ${input.percentOfCallsAboveKpiLine}% meeting KPI.` : "."),
    best ? `The strongest area was ${best[0].toLowerCase()} at ${best[1]}%.` : "",
    weakest ? `The most frequent miss was ${weakest.title.toLowerCase()} (${weakest.misses} ${weakest.misses === 1 ? "call" : "calls"}).` : "No criteria were missed in this period.",
    input.zeroToleranceBreaches.length ? `There ${input.zeroToleranceBreaches.length === 1 ? "was one zero tolerance breach" : `were ${input.zeroToleranceBreaches.length} zero tolerance breaches`} (${input.zeroToleranceBreaches.join("; ")}), which needs a conversation straight away.` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return {
    summary,
    strengths: strengths.length ? strengths : ["Keeps calls professional and on track."],
    tips: weakest ? [`Focus on ${weakest.title.toLowerCase()}. What good looks like: ${yes ?? "follow the TMQ guidance for this criterion."}`] : ["Keep doing what you are doing and share good practice with the team."],
    focus: weakest?.title ?? "Maintain current standards",
  };
}

export async function latestCoaching(agentId: string, limit = 5) {
  return db
    .select({
      id: aiSummaries.id,
      output: aiSummaries.output,
      model: aiSummaries.model,
      periodStart: aiSummaries.periodStart,
      periodEnd: aiSummaries.periodEnd,
      createdAt: aiSummaries.createdAt,
      approvedAt: aiSummaries.approvedAt,
      createdByName: users.name,
    })
    .from(aiSummaries)
    .leftJoin(users, eq(users.id, aiSummaries.createdBy))
    .where(and(eq(aiSummaries.kind, "agent_coaching"), eq(aiSummaries.agentId, agentId)))
    .orderBy(desc(aiSummaries.createdAt))
    .limit(limit);
}

/** Let a manager rewrite a coaching summary by hand. Editing clears any earlier approval. */
export async function editCoaching(actor: Actor, id: string, output: Coaching) {
  if (actor.role !== "admin") throw forbidden();
  const clean = coachingSchema.parse(output);
  const [row] = await db
    .update(aiSummaries)
    .set({ output: { ...clean, editedBy: actor.name, editedAt: new Date().toISOString() }, approvedAt: null, approvedBy: null })
    .where(and(eq(aiSummaries.id, id), eq(aiSummaries.kind, "agent_coaching")))
    .returning({ id: aiSummaries.id });
  if (!row) throw invalid("That summary no longer exists.");
  await audit(actor, { action: "ai.edited", entity: "ai_summary", entityId: id });
}

export async function approveSummary(actor: Actor, id: string, approved: boolean) {
  if (actor.role !== "admin") throw forbidden();
  await db
    .update(aiSummaries)
    .set({ approvedAt: approved ? new Date() : null, approvedBy: approved ? actor.id : null })
    .where(eq(aiSummaries.id, id));
  await audit(actor, { action: approved ? "ai.approved" : "ai.unapproved", entity: "ai_summary", entityId: id });
}

// ---------------------------------------------------------------- weekly briefing
const briefingSchema = z.object({
  headline: clip(300),
  bullets: list(6, 400).pipe(z.array(z.string()).min(1)),
  watch: list(5, 300),
});
export type Briefing = z.infer<typeof briefingSchema>;
const briefingJson = {
  type: "object",
  properties: {
    headline: { type: "string", description: "One sentence on how the week went." },
    bullets: { type: "array", items: { type: "string" }, description: "Three to five findings with numbers." },
    watch: { type: "array", items: { type: "string" }, description: "Agents or issues to watch next week." },
  },
  required: ["headline", "bullets", "watch"],
};

export async function weeklyBriefing(actor: Actor, f: DashFilter, opts: SummaryOpts = {}) {
  if (actor.role !== "admin") throw forbidden();
  const [cur, prev, table, issues, heat] = await Promise.all([kpis(f), kpis(previousPeriod(f)), agentTable(f), issueLog(f, 20), criteriaHeatmap(f, "site")]);
  if (cur.evaluations === 0) throw invalid("No submitted reviews in this period yet.");
  const missesByCriterion = new Map<string, number>();
  for (const c of heat.cells) missesByCriterion.set(c.key, (missesByCriterion.get(c.key) ?? 0) + c.misses);
  const titleOf = new Map(heat.criteria.map((c) => [c.key, c.title]));
  const input = {
    period: `${weekLabel(f.from)} to ${weekLabel(f.to)}`,
    current: cur,
    previous: prev,
    sites: [...new Set(table.map((t) => t.site))].map((site) => {
      const rows = table.filter((t) => t.site === site && t.calls > 0);
      const calls = rows.reduce((s, r) => s + r.calls, 0);
      return { site, calls, avg: calls ? Math.round((rows.reduce((s, r) => s + (r.avgScore ?? 0) * r.calls, 0) / calls) * 10) / 10 : null };
    }),
    needsAttention: table.filter((t) => t.needsAttention).slice(0, 8).map((t) => ({ agent: firstName(t.name), site: t.site, reasons: t.reasons })),
    zeroTolerance: issues.counts,
    mostMissedCriteria: [...missesByCriterion.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, n]) => ({ criterion: titleOf.get(k) ?? k, misses: n })),
  };
  const enabled = shouldUseAi(opts.mode);
  const { model } = aiStatus();
  const promptVersion = "briefing-v1";
  const inputHash = fingerprint({ promptVersion, model: enabled ? model : "rules", input });
  if (!opts.force) {
    const hit = await cached("weekly_briefing", inputHash, null);
    if (hit) return hit;
  }
  let output: Briefing;
  if (enabled) {
    await enforceQuota(actor);
    output = await callGemini(briefingSchema, briefingJson, "You brief the quality manager of Take Me's booking call centre on the Take Me Quality (TMQ) results. Lead with numbers and changes. No filler praise. Every bullet must contain at least one figure from the data.", `Write the quality briefing for this period from this data (JSON):\n${JSON.stringify(input)}`);
  } else {
    const delta = cur.avgScore !== null && prev.avgScore !== null ? Math.round((cur.avgScore - prev.avgScore) * 10) / 10 : null;
    output = {
      headline: `${cur.evaluations} calls reviewed, averaging ${cur.avgScore}%${delta !== null ? ` (${delta >= 0 ? "up" : "down"} ${Math.abs(delta)} points on the previous period)` : ""}.`,
      bullets: [
        `${cur.meetsShare}% of calls met the KPI and ${cur.perfectShare}% were perfect.`,
        ...input.sites.filter((s) => s.calls).map((s) => `${s.site}: ${s.calls} calls at ${s.avg}%.`),
        input.mostMissedCriteria[0] ? `Most missed: ${input.mostMissedCriteria.slice(0, 3).map((m) => `${m.criterion} (${m.misses})`).join(", ")}.` : "No criteria were missed.",
        cur.autoFails ? `${cur.autoFails} zero tolerance ${cur.autoFails === 1 ? "breach" : "breaches"}: ${issues.counts.map((c) => `${c.name} ${c.count}`).join(", ")}.` : "No zero tolerance breaches.",
      ].slice(0, 6),
      watch: input.needsAttention.map((a) => `${a.agent} (${a.site}): ${a.reasons.join("; ")}`).slice(0, 5),
    };
  }
  return save(actor, "weekly_briefing", { periodStart: f.from, periodEnd: f.to, model: enabled ? model : "rules", promptVersion, inputHash, output });
}

export async function latestBriefing(from: string, to: string) {
  const [row] = await db
    .select()
    .from(aiSummaries)
    .where(and(eq(aiSummaries.kind, "weekly_briefing"), eq(aiSummaries.periodStart, from), eq(aiSummaries.periodEnd, to)))
    .orderBy(desc(aiSummaries.createdAt))
    .limit(1);
  return row ?? null;
}

// ---------------------------------------------------------------- themes
const themesSchema = z.object({
  themes: z
    .array(z.object({ title: clip(160), count: z.coerce.number().int().min(1), criterion: clip(200), advice: clip(400) }))
    .transform((a) => a.slice(0, 8)),
});
export type Themes = z.infer<typeof themesSchema>;
const themesJson = {
  type: "object",
  properties: {
    themes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          count: { type: "integer" },
          criterion: { type: "string" },
          advice: { type: "string", description: "One training suggestion." },
        },
        required: ["title", "count", "criterion", "advice"],
      },
    },
  },
  required: ["themes"],
};

export async function findThemes(actor: Actor, f: DashFilter, opts: SummaryOpts = {}) {
  if (actor.role !== "admin") throw forbidden();
  const rows = await db.execute<{ title: string; note: string }>(sql`
    select c.title as title, ea.note as note
    from evaluation_answers ea
      join criteria c on c.id = ea.criterion_id
      join evaluations e on e.id = ea.evaluation_id
    where e.status = 'submitted' and e.deleted_at is null and e.call_week between ${f.from} and ${f.to}
      ${f.siteId ? sql`and e.site_id = ${f.siteId}` : sql``}
      and ea.answer in ('no','partial') and coalesce(ea.note, '') <> ''
    order by e.call_at desc limit 150`);
  if (!rows.length) throw invalid("No reviewer notes on missed criteria in this period yet.");
  const input = { notes: rows.map((r) => ({ criterion: r.title, note: scrub(r.note) })) };
  const enabled = shouldUseAi(opts.mode);
  const { model } = aiStatus();
  const promptVersion = "themes-v1";
  const inputHash = fingerprint({ promptVersion, model: enabled ? model : "rules", input, f });
  if (!opts.force) {
    const hit = await cached("themes", inputHash, null);
    if (hit) return hit;
  }
  let output: Themes;
  if (enabled) {
    await enforceQuota(actor);
    output = await callGemini(themesSchema, themesJson, "You analyse call-centre quality review notes for Take Me and group them into recurring coaching themes.", `Group these reviewer notes into at most six recurring themes, most frequent first (JSON):\n${JSON.stringify(input)}`);
  } else {
    const counts = new Map<string, number>();
    for (const r of rows) counts.set(r.title, (counts.get(r.title) ?? 0) + 1);
    output = {
      themes: [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([title, count]) => ({ title: `Misses on ${title.toLowerCase()}`, count, criterion: title, advice: "Review the TMQ guidance for this criterion in the next team huddle." })),
    };
  }
  return save(actor, "themes", { periodStart: f.from, periodEnd: f.to, model: enabled ? model : "rules", promptVersion, inputHash, output });
}

// ---------------------------------------------------------------- tidy notes
const polishSchema = z.object({ text: clip(3000).pipe(z.string().min(1)) });

export async function polishNotes(actor: Actor, text: string, context: string[]) {
  const { enabled, model } = aiStatus();
  if (!enabled) throw new AppError("AI writing help is switched off. An admin can enable it by adding a Gemini API key.", "unavailable");
  const clean = scrub(text.trim()).slice(0, 2000);
  if (clean.length < 5) throw invalid("Write a few words first, then tidy them up.");
  await enforceQuota(actor);
  const out = await callGemini(
    polishSchema,
    { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
    "You tidy a call-centre quality reviewer's rough notes into clear, specific, respectful feedback for the agent. Keep every fact, add none, and keep it short.",
    `Criteria that were missed on this call: ${context.slice(0, 10).join("; ") || "none"}.\nRough notes:\n${clean}`,
  );
  await save(actor, "polish", { model, promptVersion: "polish-v1", inputHash: fingerprint({ clean, context }), output: { length: out.text.length } });
  return out.text;
}
