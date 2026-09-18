import "server-only";
import { redirect } from "next/navigation";
import { getCurrentUser, requestMeta } from "./session";
import type { Actor } from "@/server/audit";
import type { SessionUser } from "@/server/services/auth";
import { forbidden } from "@/server/errors";

/**
 * Data access layer guards. Every page and server action calls one of these —
 * the proxy only does a cheap "is there a cookie" check, the real decision happens here.
 */
export async function requireUser(opts: { allowPasswordChange?: boolean } = {}): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword && !opts.allowPasswordChange) redirect("/welcome");
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/qa");
  return user;
}

export async function requireReviewer(): Promise<SessionUser> {
  return requireUser();
}

export const homeFor = (role: "admin" | "qa") => (role === "admin" ? "/admin" : "/qa");

/** For server actions: resolve the caller or throw (no redirects mid-mutation). */
export async function actorFor(role?: "admin"): Promise<Actor & { sessionId: string; email: string }> {
  const user = await getCurrentUser();
  if (!user) throw forbidden("Your session has ended. Sign in again.");
  if (user.mustChangePassword) throw forbidden("Set a new password before continuing.");
  if (role === "admin" && user.role !== "admin") throw forbidden();
  const meta = await requestMeta();
  return { id: user.id, role: user.role, name: user.name, ip: meta.ip, sessionId: user.sessionId, email: user.email };
}
