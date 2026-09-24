import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { agents, reviewerAgentAssignments, reviewerSiteAssignments, sites, users } from "@/db/schema";
import { audit, type Actor } from "@/server/audit";
import { forbidden, invalid, notFound } from "@/server/errors";

function assertAdmin(actor: Actor) {
  if (actor.role !== "admin") throw forbidden();
}

/** SQL condition for agents covered directly or through their site. */
export function reviewerAgentCondition(reviewerId: string) {
  return sql<boolean>`(
    exists (
      select 1 from ${reviewerSiteAssignments} rsa
      where rsa.reviewer_id = ${reviewerId} and rsa.site_id = ${agents.siteId}
    ) or exists (
      select 1 from ${reviewerAgentAssignments} raa
      where raa.reviewer_id = ${reviewerId} and raa.agent_id = ${agents.id}
    )
  )`;
}

/** SQL condition for sites covered wholly or containing a directly assigned agent. */
export function reviewerSiteCondition(reviewerId: string) {
  return sql<boolean>`(
    exists (
      select 1 from ${reviewerSiteAssignments} rsa
      where rsa.reviewer_id = ${reviewerId} and rsa.site_id = ${sites.id}
    ) or exists (
      select 1 from ${reviewerAgentAssignments} raa
      join ${agents} assigned_agent on assigned_agent.id = raa.agent_id
      where raa.reviewer_id = ${reviewerId} and assigned_agent.site_id = ${sites.id}
    )
  )`;
}

export async function assertCanReviewAgent(actor: Actor, agent: { id: string; siteId: string }) {
  if (actor.role === "admin") return;
  const [allowed] = await db
    .select({ id: agents.id })
    .from(agents)
    .where(and(eq(agents.id, agent.id), eq(agents.siteId, agent.siteId), reviewerAgentCondition(actor.id)))
    .limit(1);
  if (!allowed) throw forbidden("That agent isn’t assigned to you. Ask an admin to update your coverage.");
}

/** Reviewers may add a new roster entry only inside a site assigned in full. */
export async function assertCanCreateAgentAtSite(actor: Actor, siteId: string) {
  if (actor.role === "admin") return;
  const [allowed] = await db
    .select({ siteId: reviewerSiteAssignments.siteId })
    .from(reviewerSiteAssignments)
    .where(and(eq(reviewerSiteAssignments.reviewerId, actor.id), eq(reviewerSiteAssignments.siteId, siteId)))
    .limit(1);
  if (!allowed) throw forbidden("You can add agents only at a site assigned to you.");
}

async function assignmentIds(reviewerId: string) {
  const [siteRows, agentRows] = await Promise.all([
    db.select({ siteId: reviewerSiteAssignments.siteId }).from(reviewerSiteAssignments).where(eq(reviewerSiteAssignments.reviewerId, reviewerId)),
    db.select({ agentId: reviewerAgentAssignments.agentId }).from(reviewerAgentAssignments).where(eq(reviewerAgentAssignments.reviewerId, reviewerId)),
  ]);
  return { siteIds: siteRows.map((r) => r.siteId), agentIds: agentRows.map((r) => r.agentId) };
}

export async function listReviewerAssignments(actor: Actor) {
  assertAdmin(actor);
  const [siteRows, agentRows] = await Promise.all([
    db.select({ reviewerId: reviewerSiteAssignments.reviewerId, siteId: reviewerSiteAssignments.siteId }).from(reviewerSiteAssignments),
    db.select({ reviewerId: reviewerAgentAssignments.reviewerId, agentId: reviewerAgentAssignments.agentId }).from(reviewerAgentAssignments),
  ]);
  return { sites: siteRows, agents: agentRows };
}

export async function replaceReviewerAssignments(actor: Actor, reviewerId: string, input: { siteIds: string[]; agentIds: string[] }) {
  assertAdmin(actor);
  const [reviewer] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, reviewerId)).limit(1);
  if (!reviewer) throw notFound("That account doesn’t exist.");
  if (reviewer.role !== "qa") throw invalid("Assignments apply only to quality reviewers.");

  const siteIds = [...new Set(input.siteIds)];
  const agentIds = [...new Set(input.agentIds)];
  const [siteRows, agentRows] = await Promise.all([
    siteIds.length
      ? db.select({ id: sites.id }).from(sites).where(and(inArray(sites.id, siteIds), eq(sites.active, true)))
      : Promise.resolve([]),
    agentIds.length
      ? db.select({ id: agents.id, siteId: agents.siteId }).from(agents).where(and(inArray(agents.id, agentIds), ne(agents.status, "inactive")))
      : Promise.resolve([]),
  ]);
  if (siteRows.length !== siteIds.length) throw invalid("One or more selected sites are no longer active.");
  if (agentRows.length !== agentIds.length) throw invalid("One or more selected agents are no longer available.");

  // A direct agent entry is redundant when their full site is selected.
  const selectedSites = new Set(siteIds);
  const directAgentIds = agentRows.filter((a) => !selectedSites.has(a.siteId)).map((a) => a.id);
  const before = await assignmentIds(reviewerId);
  const after = { siteIds, agentIds: directAgentIds };

  await db.transaction(async (tx) => {
    await tx.delete(reviewerSiteAssignments).where(eq(reviewerSiteAssignments.reviewerId, reviewerId));
    await tx.delete(reviewerAgentAssignments).where(eq(reviewerAgentAssignments.reviewerId, reviewerId));
    if (siteIds.length) await tx.insert(reviewerSiteAssignments).values(siteIds.map((siteId) => ({ reviewerId, siteId })));
    if (directAgentIds.length) await tx.insert(reviewerAgentAssignments).values(directAgentIds.map((agentId) => ({ reviewerId, agentId })));
    await audit(actor, { action: "reviewer.assignments_updated", entity: "user", entityId: reviewerId, before, after }, tx);
  });
  return after;
}
