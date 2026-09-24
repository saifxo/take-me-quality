/** Sites and the agent roster. */
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { agents, evaluations, sites } from "@/db/schema";
import { nameKey } from "@/lib/smart-paste";
import { audit, type Actor } from "@/server/audit";
import { AppError, forbidden, notFound } from "@/server/errors";
import { assertCanCreateAgentAtSite, reviewerAgentCondition, reviewerSiteCondition } from "./assignments";

function assertAdmin(actor: Actor) {
  if (actor.role !== "admin") throw forbidden();
}

// ---------------------------------------------------------------- sites
export async function listSites(opts: { activeOnly?: boolean; reviewerId?: string } = {}) {
  const conds = [opts.activeOnly ? eq(sites.active, true) : undefined, opts.reviewerId ? reviewerSiteCondition(opts.reviewerId) : undefined].filter(Boolean);
  return db
    .select({
      id: sites.id,
      name: sites.name,
      code: sites.code,
      region: sites.region,
      active: sites.active,
      agents: sql<number>`(select count(*)::int from ${agents} a where a.site_id = ${sites.id} and a.status <> 'inactive')`,
    })
    .from(sites)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(asc(sites.name));
}

export async function createSite(actor: Actor, input: { name: string; code: string; region: string }) {
  assertAdmin(actor);
  const code = input.code.trim().toUpperCase();
  const [dupe] = await db.select({ id: sites.id }).from(sites).where(eq(sites.code, code)).limit(1);
  if (dupe) throw new AppError(`Site code ${code} is already in use.`, "conflict");
  const [row] = await db.insert(sites).values({ name: input.name.trim(), code, region: input.region.trim() || "West Midlands" }).returning();
  await audit(actor, { action: "site.created", entity: "site", entityId: row.id, after: row });
  return row;
}

export async function updateSite(actor: Actor, id: string, input: { name: string; code: string; region: string; active: boolean }) {
  assertAdmin(actor);
  const code = input.code.trim().toUpperCase();
  const [dupe] = await db.select({ id: sites.id }).from(sites).where(eq(sites.code, code)).limit(1);
  if (dupe && dupe.id !== id) throw new AppError(`Site code ${code} is already in use.`, "conflict");
  const [row] = await db
    .update(sites)
    .set({ name: input.name.trim(), code, region: input.region.trim(), active: input.active })
    .where(eq(sites.id, id))
    .returning();
  if (!row) throw notFound("That site doesn’t exist.");
  await audit(actor, { action: "site.updated", entity: "site", entityId: id, after: row });
  return row;
}

// ---------------------------------------------------------------- agents
export type AgentListItem = Awaited<ReturnType<typeof listAgents>>[number];

export async function listAgents(opts: { siteId?: string; status?: "active" | "pending" | "inactive"; includeInactive?: boolean; reviewerId?: string } = {}) {
  const conds = [
    opts.siteId ? eq(agents.siteId, opts.siteId) : undefined,
    opts.status ? eq(agents.status, opts.status) : opts.includeInactive ? undefined : inArray(agents.status, ["active", "pending"]),
    opts.reviewerId ? reviewerAgentCondition(opts.reviewerId) : undefined,
  ].filter(Boolean);
  return db
    .select({
      id: agents.id,
      fullName: agents.fullName,
      teamCode: agents.teamCode,
      extension: agents.extension,
      status: agents.status,
      siteId: agents.siteId,
      siteName: sites.name,
      siteCode: sites.code,
    })
    .from(agents)
    .innerJoin(sites, eq(sites.id, agents.siteId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(asc(agents.fullName));
}

export async function getAgent(id: string) {
  const [row] = await db
    .select({
      id: agents.id,
      fullName: agents.fullName,
      teamCode: agents.teamCode,
      extension: agents.extension,
      status: agents.status,
      siteId: agents.siteId,
      siteName: sites.name,
      siteCode: sites.code,
      createdAt: agents.createdAt,
    })
    .from(agents)
    .innerJoin(sites, eq(sites.id, agents.siteId))
    .where(eq(agents.id, id))
    .limit(1);
  if (!row) throw notFound("That agent doesn’t exist.");
  return row;
}

export type AgentInput = { fullName: string; siteId: string; teamCode?: string | null; extension?: string | null; status?: "active" | "pending" | "inactive" };

export async function createAgent(actor: Actor, input: AgentInput) {
  // Reviewers may add agents they meet in the portal; those wait for an admin to confirm.
  const status = actor.role === "admin" ? (input.status ?? "active") : "pending";
  const [site] = await db.select({ id: sites.id }).from(sites).where(eq(sites.id, input.siteId)).limit(1);
  if (!site) throw notFound("Pick a valid site for this agent.");
  await assertCanCreateAgentAtSite(actor, site.id);
  const existing = await findAgentByName(input.fullName, input.siteId);
  if (existing) return existing;
  const [row] = await db
    .insert(agents)
    .values({
      fullName: input.fullName.replace(/\s+/g, " ").trim(),
      siteId: input.siteId,
      teamCode: input.teamCode?.trim().toUpperCase() || null,
      extension: input.extension?.trim() || null,
      status,
    })
    .returning();
  await audit(actor, { action: "agent.created", entity: "agent", entityId: row.id, after: row });
  return row;
}

export async function updateAgent(actor: Actor, id: string, input: AgentInput) {
  assertAdmin(actor);
  const [before] = await db.select().from(agents).where(eq(agents.id, id)).limit(1);
  if (!before) throw notFound("That agent doesn’t exist.");
  const [row] = await db
    .update(agents)
    .set({
      fullName: input.fullName.replace(/\s+/g, " ").trim(),
      siteId: input.siteId,
      teamCode: input.teamCode?.trim().toUpperCase() || null,
      extension: input.extension?.trim() || null,
      status: input.status ?? before.status,
      updatedAt: new Date(),
    })
    .where(eq(agents.id, id))
    .returning();
  await audit(actor, { action: "agent.updated", entity: "agent", entityId: id, before, after: row });
  return row;
}

export async function findAgentByName(fullName: string, siteId?: string) {
  const key = nameKey(fullName);
  const rows = await db
    .select()
    .from(agents)
    .where(siteId ? eq(agents.siteId, siteId) : undefined);
  return rows.find((a) => nameKey(a.fullName) === key) ?? null;
}

/** Match portal agent names (and site codes) to the roster. */
export async function matchPortalNames(entries: { agentName: string; siteCode: string | null }[], reviewerId?: string) {
  const [roster, siteRows] = await Promise.all([
    db
      .select({ id: agents.id, fullName: agents.fullName, siteId: agents.siteId, status: agents.status })
      .from(agents)
      .where(reviewerId ? reviewerAgentCondition(reviewerId) : undefined),
    db.select({ id: sites.id, code: sites.code, name: sites.name }).from(sites),
  ]);
  const siteByCode = new Map(siteRows.map((s) => [s.code.toUpperCase(), s]));
  return entries.map((e) => {
    const site = e.siteCode ? (siteByCode.get(e.siteCode.toUpperCase()) ?? null) : null;
    const key = nameKey(e.agentName);
    const candidates = roster.filter((a) => nameKey(a.fullName) === key && a.status !== "inactive");
    const agent = candidates.find((a) => !site || a.siteId === site.id) ?? candidates[0] ?? null;
    return { agent, site };
  });
}

export async function agentHasEvaluations(id: string) {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(evaluations).where(eq(evaluations.agentId, id));
  return r.n > 0;
}
