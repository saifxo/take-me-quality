import { and, asc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { evaluations, users } from "@/db/schema";
import { generateTempPassword } from "@/server/crypto";
import { hashPassword, passwordProblem, verifyPassword } from "@/server/auth/password";
import { revokeUserSessions } from "@/server/services/auth";
import { audit, type Actor } from "@/server/audit";
import { AppError, forbidden, invalid, notFound } from "@/server/errors";

const publicUser = {
  id: users.id,
  name: users.name,
  email: users.email,
  role: users.role,
  status: users.status,
  mustChangePassword: users.mustChangePassword,
  lastLoginAt: users.lastLoginAt,
  createdAt: users.createdAt,
};

function assertAdmin(actor: Actor) {
  if (actor.role !== "admin") throw forbidden();
}

export async function listUsers(actor: Actor) {
  assertAdmin(actor);
  return db
    .select({
      ...publicUser,
      reviews: sql<number>`(select count(*)::int from ${evaluations} e where e.reviewer_id = ${users.id} and e.status = 'submitted' and e.deleted_at is null)`,
    })
    .from(users)
    .orderBy(asc(users.role), asc(users.name));
}

export async function listReviewers() {
  return db.select({ id: users.id, name: users.name, role: users.role }).from(users).where(eq(users.status, "active")).orderBy(asc(users.name));
}

export async function createUser(actor: Actor, input: { name: string; email: string; role: "admin" | "qa" }) {
  assertAdmin(actor);
  const email = input.email.trim().toLowerCase();
  const [dupe] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (dupe) throw new AppError("An account with that email already exists.", "conflict");
  const tempPassword = generateTempPassword();
  const [row] = await db
    .insert(users)
    .values({ name: input.name.trim(), email, role: input.role, passwordHash: await hashPassword(tempPassword), mustChangePassword: true })
    .returning(publicUser);
  await audit(actor, { action: "user.created", entity: "user", entityId: row.id, after: { name: row.name, email, role: row.role } });
  return { user: row, tempPassword };
}

async function activeAdminCount(excludeId?: string) {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(users)
    .where(and(eq(users.role, "admin"), eq(users.status, "active"), excludeId ? ne(users.id, excludeId) : undefined));
  return r.n;
}

export async function updateUser(
  actor: Actor,
  id: string,
  patch: { name?: string; role?: "admin" | "qa"; status?: "active" | "disabled" },
) {
  assertAdmin(actor);
  const [before] = await db.select(publicUser).from(users).where(eq(users.id, id)).limit(1);
  if (!before) throw notFound("That account doesn’t exist.");
  if (id === actor.id && (patch.role === "qa" || patch.status === "disabled")) {
    throw invalid("You can’t remove your own admin access or switch off your own account.");
  }
  const losingAdmin = before.role === "admin" && before.status === "active" && (patch.role === "qa" || patch.status === "disabled");
  if (losingAdmin && (await activeAdminCount(id)) === 0) throw invalid("Keep at least one active admin.");

  const [after] = await db
    .update(users)
    .set({ ...patch, name: patch.name?.trim() ?? before.name, updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning(publicUser);
  if (patch.status === "disabled" || (patch.role && patch.role !== before.role)) await revokeUserSessions(id);
  await audit(actor, { action: "user.updated", entity: "user", entityId: id, before, after });
  return after;
}

export async function resetPassword(actor: Actor, id: string) {
  assertAdmin(actor);
  const [u] = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.id, id)).limit(1);
  if (!u) throw notFound("That account doesn’t exist.");
  const tempPassword = generateTempPassword();
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(tempPassword), mustChangePassword: true, updatedAt: new Date() })
    .where(eq(users.id, id));
  await revokeUserSessions(id);
  await audit(actor, { action: "user.password_reset", entity: "user", entityId: id });
  return { tempPassword };
}

export async function signOutEverywhere(actor: Actor, id: string) {
  assertAdmin(actor);
  await revokeUserSessions(id);
  await audit(actor, { action: "user.sessions_revoked", entity: "user", entityId: id });
}

/** Change your own password. `current` is skipped for the first-sign-in flow. */
export async function changeOwnPassword(
  actor: Actor & { sessionId: string; email: string },
  input: { current?: string; next: string },
  opts: { firstSignIn?: boolean } = {},
) {
  const [u] = await db.select().from(users).where(eq(users.id, actor.id)).limit(1);
  if (!u) throw notFound();
  if (!opts.firstSignIn || !u.mustChangePassword) {
    if (!input.current || !(await verifyPassword(input.current, u.passwordHash))) throw invalid("Your current password isn’t right.");
  }
  const problem = passwordProblem(input.next, u.email);
  if (problem) throw invalid(problem);
  if (await verifyPassword(input.next, u.passwordHash)) throw invalid("Choose a password you haven’t used here before.");
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(input.next), mustChangePassword: false, updatedAt: new Date() })
    .where(eq(users.id, actor.id));
  await revokeUserSessions(actor.id, actor.sessionId);
  await audit(actor, { action: "user.password_changed", entity: "user", entityId: actor.id });
}
