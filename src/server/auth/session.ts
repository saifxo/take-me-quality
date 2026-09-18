import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import {
  revokeSessionToken,
  SESSION_MAX_AGE_HOURS,
  validateSessionToken,
  type RequestMeta,
  type SessionUser,
} from "@/server/services/auth";

const secure = process.env.NODE_ENV === "production";
// The __Host- prefix pins the cookie to this exact host over HTTPS (not available on plain-http localhost).
export const SESSION_COOKIE = secure ? "__Host-tmq_session" : "tmq_session";

export async function setSessionCookie(token: string) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_HOURS * 3600,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  await revokeSessionToken(token);
  jar.delete(SESSION_COOKIE);
}

/** The signed-in user for this request (deduplicated across the render). */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  return validateSessionToken(jar.get(SESSION_COOKIE)?.value);
});

export async function requestMeta(): Promise<RequestMeta> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  return {
    ip: (fwd ? fwd.split(",")[0] : h.get("x-real-ip"))?.trim() || null,
    userAgent: h.get("user-agent"),
  };
}
