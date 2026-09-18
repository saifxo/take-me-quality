/**
 * Authentication core: sign-in with rate limiting, database-backed sessions and revocation.
 * Framework-free so it can be tested directly; cookies are handled in src/server/auth/session.ts.
 */
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { loginAttempts, sessions, users } from "@/db/schema";
import { randomToken, sha256 } from "@/server/crypto";
import { verifyPassword } from "@/server/auth/password";
import { AppError } from "@/server/errors";

export const SESSION_MAX_AGE_HOURS = Number(process.env.SESSION_MAX_AGE_HOURS || 12);
export const SESSION_IDLE_MINUTES = Number(process.env.SESSION_IDLE_MINUTES || 60);
const LAST_SEEN_WRITE_EVERY_MS = 5 * 60 * 1000;

const MAX_FAILS_PER_EMAIL = 5;
const MAX_FAILS_PER_IP = 25;
const WINDOW_MINUTES = 15;

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "qa";
  mustChangePassword: boolean;
  sessionId: string;
};

export type RequestMeta = { ip?: string | null; userAgent?: string | null };

const normaliseEmail = (e: string) => e.trim().toLowerCase();

async function recentFailures(email: string, ip: string | null | undefined) {
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000);
  const [byEmail] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.email, email), eq(loginAttempts.success, false), gt(loginAttempts.createdAt, since)));
  let byIp = 0;
  if (ip) {
    const [r] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(loginAttempts)
      .where(and(eq(loginAttempts.ip, ip), eq(loginAttempts.success, false), gt(loginAttempts.createdAt, since)));
    byIp = r.n;
  }
  return { byEmail: byEmail.n, byIp };
}

/** Verify credentials and open a session. Returns the raw token for the cookie. */
export async function signIn(emailInput: string, password: string, meta: RequestMeta = {}) {
  const email = normaliseEmail(emailInput);
  const fails = await recentFailures(email, meta.ip);
  if (fails.byEmail >= MAX_FAILS_PER_EMAIL || fails.byIp >= MAX_FAILS_PER_IP) {
    throw new AppError(`Too many failed attempts. Wait ${WINDOW_MINUTES} minutes, or ask an admin to reset your password.`, "rate_limited");
  }

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const valid = await verifyPassword(password, user?.passwordHash);

  if (!user || !valid || user.status !== "active") {
    await db.insert(loginAttempts).values({ email, ip: meta.ip ?? null, success: false });
    if (user && valid && user.status !== "active") {
      throw new AppError("This account has been switched off. Contact your admin.", "forbidden");
    }
    throw new AppError("That email and password don’t match an account.", "invalid");
  }

  await db.insert(loginAttempts).values({ email, ip: meta.ip ?? null, success: true });
  const token = randomToken();
  const now = new Date();
  await db.insert(sessions).values({
    id: sha256(token),
    userId: user.id,
    expiresAt: new Date(now.getTime() + SESSION_MAX_AGE_HOURS * 3_600_000),
    lastSeenAt: now,
    userAgent: meta.userAgent?.slice(0, 300) ?? null,
    ip: meta.ip ?? null,
  });
  await db.update(users).set({ lastLoginAt: now }).where(eq(users.id, user.id));
  return { token, user: { id: user.id, role: user.role, mustChangePassword: user.mustChangePassword } };
}

/** Resolve a cookie token to its user, enforcing expiry and the idle timeout. */
export async function validateSessionToken(token: string | undefined | null): Promise<SessionUser | null> {
  if (!token || token.length < 20 || token.length > 200) return null;
  const id = sha256(token);
  const [row] = await db
    .select({
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
      lastSeenAt: sessions.lastSeenAt,
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      status: users.status,
      mustChangePassword: users.mustChangePassword,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, id))
    .limit(1);
  if (!row) return null;

  const now = Date.now();
  const idleExpired = now - row.lastSeenAt.getTime() > SESSION_IDLE_MINUTES * 60_000;
  if (row.expiresAt.getTime() <= now || idleExpired || row.status !== "active") {
    await db.delete(sessions).where(eq(sessions.id, id));
    return null;
  }
  if (now - row.lastSeenAt.getTime() > LAST_SEEN_WRITE_EVERY_MS) {
    await db.update(sessions).set({ lastSeenAt: new Date(now) }).where(eq(sessions.id, id));
  }
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    mustChangePassword: row.mustChangePassword,
    sessionId: row.sessionId,
  };
}

export async function revokeSessionToken(token: string | undefined | null) {
  if (!token) return;
  await db.delete(sessions).where(eq(sessions.id, sha256(token)));
}

/** Sign a user out everywhere (optionally keeping the current session). */
export async function revokeUserSessions(userId: string, exceptSessionId?: string) {
  const rows = await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, userId));
  for (const r of rows) {
    if (r.id !== exceptSessionId) await db.delete(sessions).where(eq(sessions.id, r.id));
  }
}

/** Housekeeping: drop expired sessions and old login attempts. Safe to call often. */
export async function pruneAuthTables() {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
  await db.delete(loginAttempts).where(lt(loginAttempts.createdAt, new Date(Date.now() - 30 * 86_400_000)));
}
