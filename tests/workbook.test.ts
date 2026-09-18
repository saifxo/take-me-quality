/**
 * Imports a real TMQ Scorecard workbook into the test database and checks parity with the sheet.
 * Set TMQ_WORKBOOK to the .xlsx path; skipped when the file isn't on this machine.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, sql } from "@/db";
import { evaluations } from "@/db/schema";
import { makeUser, resetTestDb } from "./helpers/db";
import { importWorkbook } from "@/server/services/import";
import { kpis } from "@/server/services/analytics";

const file = process.env.TMQ_WORKBOOK ?? path.join(os.homedir(), "Desktop", "20260907 - Birmingham TMQ Scorecard.xlsx");
const exists = fs.existsSync(file);

describe.skipIf(!exists)("real workbook import", () => {
  let admin: Awaited<ReturnType<typeof makeUser>>;
  beforeAll(async () => {
    await resetTestDb();
    admin = await makeUser("admin", "wb-admin@test.local");
  });
  afterAll(async () => {
    await sql.end({ timeout: 5 });
  });

  it("imports every scored row and matches the sheet’s own scores", async () => {
    const buf = fs.readFileSync(file);
    const report = await importWorkbook(admin.actor, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), path.basename(file));
    expect(report.sheet).toBe("Analysis");
    expect(report.rowsRead).toBe(40);
    expect(report.imported).toBe(40);
    expect(report.skipped).toEqual([]);
    expect(report.scoreMatches).toBe(report.scoreCompared);
    expect(report.createdAgents.length).toBe(4);
    const rows = await db.select().from(evaluations).where(eq(evaluations.source, "import"));
    expect(rows.every((r) => r.score === 100 && r.band === "perfect")).toBe(true);
    // Reviewed on Mon 7 and Mon 14 Sep 2026 → calls from the weeks before.
    expect([...new Set(rows.map((r) => r.callWeek))].sort()).toEqual(["2026-08-31", "2026-09-07"]);
    const k = await kpis({ from: "2026-08-31", to: "2026-09-07" });
    expect(k.evaluations).toBe(40);
    expect(k.avgScore).toBe(100);
  });
});
