import path from "node:path";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db, sql } from "@/db";
import { sites, users } from "@/db/schema";
import { installFramework } from "@/server/services/scorecard";
import { hashPassword } from "@/server/auth/password";
import type { Actor } from "@/server/audit";

export async function resetTestDb() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url.includes("tmq_test")) throw new Error(`Refusing to reset a non-test database: ${url}`);
  await sql.unsafe("drop schema if exists public cascade; create schema public; drop schema if exists drizzle cascade;");
  await migrate(db, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
  await installFramework(db, { version: 1, status: "active" });
  await db.insert(sites).values([
    { code: "SOL", name: "Solihull" },
    { code: "BIR", name: "Birmingham" },
    { code: "BIRPK", name: "Birmingham (PK)" },
  ]);
}

export async function makeUser(role: "admin" | "qa", email: string, password = "Correct-Horse-42", opts: { mustChange?: boolean; name?: string } = {}) {
  const [u] = await db
    .insert(users)
    .values({ name: opts.name ?? (role === "admin" ? "Test Admin" : "Test Reviewer"), email, role, passwordHash: await hashPassword(password), mustChangePassword: opts.mustChange ?? false })
    .returning();
  const actor: Actor & { sessionId: string; email: string } = { id: u.id, role, name: u.name, ip: "127.0.0.1", sessionId: "test", email };
  return { user: u, actor, password };
}
