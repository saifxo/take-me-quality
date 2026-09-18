/**
 * npm run ai:check — confirm Gemini works end to end against this database.
 * Writes one AI briefing, one coaching summary and one themes result for last week (saved like any other).
 */
import "./env";
import { asc, eq } from "drizzle-orm";
import { db, sql } from "../src/db";
import { agents, users } from "../src/db/schema";
import { aiStatus, agentCoaching, findThemes, weeklyBriefing } from "../src/server/services/ai";
import { addDays, lastFullWeekStart } from "../src/lib/dates";

async function main() {
  const status = aiStatus();
  if (!status.enabled) {
    console.error("GEMINI_API_KEY is not set. Add it to .env.local (or Vercel env vars) and try again.");
    process.exit(1);
  }
  const [admin] = await db.select().from(users).where(eq(users.role, "admin")).orderBy(asc(users.createdAt)).limit(1);
  if (!admin) throw new Error("No admin account yet. Run npm run db:seed first.");
  const actor = { id: admin.id, role: "admin" as const, name: admin.name };
  const to = lastFullWeekStart();
  const period = { from: addDays(to, -21), to };
  console.log(`Model: ${status.model} · period ${period.from} → ${period.to}\n`);

  const t0 = Date.now();
  const briefing = await weeklyBriefing(actor, period, { mode: "ai", force: true });
  console.log(`✓ Weekly briefing (${Date.now() - t0} ms):`, (briefing.output as { headline: string }).headline);

  const [agent] = await db.select().from(agents).where(eq(agents.status, "active")).orderBy(asc(agents.fullName)).limit(1);
  if (agent) {
    const t1 = Date.now();
    const c = await agentCoaching(actor, agent.id, period, { mode: "ai", force: true });
    console.log(`✓ Coaching for ${agent.fullName} (${Date.now() - t1} ms):`, (c.output as { summary: string }).summary.slice(0, 160), "…");
  }

  const t2 = Date.now();
  const themes = await findThemes(actor, period, { mode: "ai", force: true });
  const list = (themes.output as { themes: { title: string; count: number }[] }).themes;
  console.log(`✓ Themes (${Date.now() - t2} ms):`, list.map((t) => `${t.title} (${t.count})`).join("; "));

}

main()
  .catch((e) => {
    console.error("✗", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => sql.end({ timeout: 5 }).catch(() => {}));
