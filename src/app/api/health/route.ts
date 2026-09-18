import { sql } from "@/db";

export const dynamic = "force-dynamic";

/** Deployment check: confirms the app can reach the database. Reveals nothing sensitive. */
export async function GET() {
  const started = Date.now();
  try {
    await sql`select 1`;
    return Response.json({ ok: true, db: "up", ms: Date.now() - started }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false, db: "down" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
