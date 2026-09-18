import { NextResponse, type NextRequest } from "next/server";

/**
 * First, cheap gate only: bounce requests without a session cookie to sign-in.
 * The real checks (valid session, role, ownership) run in the data access layer on every request.
 */
export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has("__Host-tmq_session") || request.cookies.has("tmq_session");
  if (hasSession) return NextResponse.next();
  const url = request.nextUrl.clone();
  const next = request.nextUrl.pathname + request.nextUrl.search;
  url.pathname = "/login";
  url.search = next && next !== "/" ? `?next=${encodeURIComponent(next)}` : "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/qa/:path*", "/admin/:path*", "/account/:path*", "/playbook/:path*", "/evaluations/:path*", "/welcome", "/api/export/:path*"],
};
