/**
 * Import an existing "TMQ Scorecard" workbook (the Google Sheet exported as .xlsx).
 * Reads the Analysis sheet — one row per reviewed call — and re-scores every row with the platform engine,
 * reporting how many scores match the sheet's own column AE. Re-importing the same file skips rows already imported.
 */
import ExcelJS from "exceljs";
import { and, eq, ilike, inArray } from "drizzle-orm";
import { db } from "@/db";
import { agents, evaluationAnswers, evaluationIssues, evaluations, sites, users, type CallType } from "@/db/schema";
import { addDays, londonWallTimeToUtc, weekStartOf } from "@/lib/dates";
import { nameKey } from "@/lib/smart-paste";
import { scoreEvaluation, type Answer } from "@/lib/scoring/engine";
import { audit, type Actor } from "@/server/audit";
import { forbidden, invalid } from "@/server/errors";
import { engineCriteria, engineSettings, getActiveScorecard } from "./scorecard";

export type ImportReport = {
  sheet: string;
  rowsRead: number;
  imported: number;
  alreadyImported: number;
  skipped: { row: number; reason: string }[];
  createdSites: string[];
  createdAgents: string[];
  scoreMatches: number;
  scoreCompared: number;
  mismatches: { row: number; sheet: number; platform: number | null }[];
};

type CellValue = ExcelJS.CellValue;

function cellText(v: CellValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    if ("richText" in v && Array.isArray(v.richText)) return v.richText.map((r) => r.text).join("").trim();
    if ("result" in v) return cellText((v as { result: CellValue }).result);
    if ("text" in v) return String((v as { text: unknown }).text).trim();
  }
  return "";
}

function cellNumber(v: CellValue): number | null {
  if (typeof v === "number") return v;
  if (v && typeof v === "object" && "result" in v) return cellNumber((v as { result: CellValue }).result);
  const t = cellText(v).replace("%", "");
  return t && !Number.isNaN(Number(t)) ? Number(t) : null;
}

/** Excel stores dates as serial days since 1899-12-30; cells may also already be Date objects (read as UTC wall time). */
function cellDate(v: CellValue): Date | null {
  if (v && typeof v === "object" && "result" in v) return cellDate((v as { result: CellValue }).result);
  if (v instanceof Date) {
    return londonWallTimeToUtc(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate(), v.getUTCHours(), v.getUTCMinutes(), v.getUTCSeconds());
  }
  if (typeof v === "number" && v > 20000 && v < 80000) {
    const ms = Math.round((v - 25569) * 86_400_000);
    const d = new Date(ms);
    return londonWallTimeToUtc(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds());
  }
  const t = cellText(v);
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(t) ?? /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?: (\d{2}):(\d{2}))?/.exec(t);
  if (!m) return null;
  if (t.includes("/")) return londonWallTimeToUtc(+m[3], +m[2], +m[1], +(m[4] ?? 0), +(m[5] ?? 0));
  return londonWallTimeToUtc(+m[1], +m[2], +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
}

function cellDuration(v: CellValue): number | null {
  if (typeof v === "number") return v < 1 ? Math.round(v * 86400) : Math.round(v);
  if (v instanceof Date) return v.getUTCHours() * 3600 + v.getUTCMinutes() * 60 + v.getUTCSeconds();
  const t = cellText(v);
  const m = /^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})$/.exec(t);
  return m ? (+(m[1] ?? 0)) * 3600 + +m[2] * 60 + +m[3] : null;
}

const ANSWERS: Record<string, Answer> = { yes: "yes", y: "yes", partial: "partial", p: "partial", no: "no", n: "no", "n/a": "na", na: "na" };
const CALL_TYPES: Record<string, CallType> = {
  booking: "booking",
  airport: "airport",
  account: "account",
  commercial: "account",
  enquiry: "enquiry",
  inquiry: "enquiry",
  complaint: "complaint",
  cancellation: "cancellation",
  cancel: "cancellation",
};

function columnLetter(n: number) {
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export async function importWorkbook(actor: Actor, buffer: ArrayBuffer | Buffer, fileName: string): Promise<ImportReport> {
  if (actor.role !== "admin") throw forbidden();
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as ArrayBuffer);
  } catch {
    throw invalid("That file couldn’t be opened. Export the Google Sheet as .xlsx and try again.");
  }
  const ws = wb.getWorksheet("Analysis") ?? wb.worksheets.find((w) => /analysis/i.test(w.name));
  if (!ws) throw invalid("No “Analysis” sheet found. Upload the TMQ Scorecard workbook.");

  // Locate columns by the header row (row 2 in the TMQ workbook), falling back to the known layout.
  let headerRow = 2;
  for (let r = 1; r <= 5; r++) {
    const vals = (ws.getRow(r).values as CellValue[]).map((v) => cellText(v).toLowerCase());
    if (vals.some((v) => v.startsWith("agent name"))) {
      headerRow = r;
      break;
    }
  }
  const header = new Map<string, number>();
  ws.getRow(headerRow).eachCell({ includeEmpty: false }, (cell, col) => header.set(cellText(cell.value).toLowerCase().replace(/\s+/g, " "), col));
  const col = (prefix: string, fallback: number) => {
    for (const [k, v] of header) if (k.startsWith(prefix)) return v;
    return fallback;
  };
  const C = {
    campaign: col("agent campaign", 1),
    agent: col("agent name", 2),
    datetime: col("date & time", 4),
    duration: col("duration", 5),
    callType: col("call type", 6),
    qa: col("qa name", 7),
    reviewDate: col("date of review", 8),
    hihi: col("hihi", 30),
    score: col("score", 31),
    feedback: col("feedback", 32),
  };

  const sc = await getActiveScorecard();
  const critCols = sc.criteria.map((c) => {
    const byHeader = [...header.entries()].find(([k]) => k.startsWith(c.title.toLowerCase().slice(0, 18)))?.[1];
    const byLetter = c.sheetColumn ? ws.getColumn(c.sheetColumn).number : undefined;
    return { criterion: c, col: byHeader ?? byLetter };
  });
  const issueByName = new Map(sc.issues.flatMap((i) => [[i.shortName.toLowerCase(), i], [i.title.toLowerCase(), i]] as const));

  const [siteRows, agentRows, userRows] = await Promise.all([db.select().from(sites), db.select().from(agents), db.select({ id: users.id, name: users.name }).from(users)]);
  const report: ImportReport = { sheet: ws.name, rowsRead: 0, imported: 0, alreadyImported: 0, skipped: [], createdSites: [], createdAgents: [], scoreMatches: 0, scoreCompared: 0, mismatches: [] };

  const refs: string[] = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) refs.push(`${fileName}#${r}`);
  const existingRefs = new Set(
    refs.length ? (await db.select({ ref: evaluations.importRef }).from(evaluations).where(inArray(evaluations.importRef, refs))).map((x) => x.ref) : [],
  );

  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const agentName = cellText(row.getCell(C.agent).value).replace(/\s+/g, " ");
    if (!agentName) continue;
    report.rowsRead++;
    const importRef = `${fileName}#${r}`;
    if (existingRefs.has(importRef)) {
      report.alreadyImported++;
      continue;
    }

    // Answers
    const answers: Record<string, Answer> = {};
    let blank: string | null = null;
    for (const { criterion, col: c } of critCols) {
      if (!c) continue;
      const raw = cellText(row.getCell(c).value).toLowerCase();
      if (!raw) {
        blank ??= `${criterion.title} (column ${columnLetter(c)}) is blank`;
        continue;
      }
      const a = ANSWERS[raw];
      if (!a) {
        blank ??= `“${raw}” isn’t a valid answer for ${criterion.title}`;
        continue;
      }
      answers[criterion.id] = a === "partial" && !criterion.allowPartial ? "no" : a;
    }
    if (blank) {
      report.skipped.push({ row: r, reason: blank });
      continue;
    }

    // Site and agent
    const campaign = cellText(row.getCell(C.campaign).value) || "Unassigned";
    let site = siteRows.find((s) => s.name.toLowerCase() === campaign.toLowerCase() || s.code.toLowerCase() === campaign.toLowerCase());
    if (!site) {
      const base = campaign.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() || "UNA";
      let code = base;
      for (let i = 2; siteRows.some((s) => s.code === code); i++) code = `${base}${i}`;
      [site] = await db.insert(sites).values({ name: campaign, code }).returning();
      siteRows.push(site);
      report.createdSites.push(`${campaign} (${code})`);
    }
    let agent = agentRows.find((a) => nameKey(a.fullName) === nameKey(agentName) && a.siteId === site!.id) ?? agentRows.find((a) => nameKey(a.fullName) === nameKey(agentName));
    if (!agent) {
      [agent] = await db.insert(agents).values({ fullName: agentName, siteId: site.id }).returning();
      agentRows.push(agent);
      report.createdAgents.push(agentName);
    }

    // Reviewer: match the QA name to an account, otherwise the importing admin
    const qaName = cellText(row.getCell(C.qa).value);
    const reviewer = qaName ? userRows.find((u) => nameKey(u.name) === nameKey(qaName) || nameKey(u.name).split(" ")[0] === nameKey(qaName)) : undefined;

    // Timing: the call time when present, otherwise the week before the review date (reviews happen the Monday after)
    const callAt = cellDate(row.getCell(C.datetime).value);
    const reviewDate = cellDate(row.getCell(C.reviewDate).value);
    const callWeek = callAt ? weekStartOf(callAt) : reviewDate ? addDays(weekStartOf(reviewDate), -7) : null;
    if (!callWeek) {
      report.skipped.push({ row: r, reason: "No call date or review date" });
      continue;
    }

    const issueName = cellText(row.getCell(C.hihi).value).toLowerCase();
    const issue = issueName ? issueByName.get(issueName) : undefined;
    if (issueName && !issue) {
      report.skipped.push({ row: r, reason: `Unknown zero-tolerance issue “${issueName}”` });
      continue;
    }

    const result = scoreEvaluation(engineCriteria(sc), answers, issue ? 1 : 0, engineSettings(sc));
    const sheetScore = cellNumber(row.getCell(C.score).value);
    if (sheetScore !== null && result.raw !== null) {
      report.scoreCompared++;
      const sheetPct = sheetScore <= 1.5 ? sheetScore * 100 : sheetScore;
      const platformForCompare = issue ? 0 : result.raw;
      if (Math.abs(sheetPct - platformForCompare) < 0.01) report.scoreMatches++;
      else report.mismatches.push({ row: r, sheet: Math.round(sheetPct * 100) / 100, platform: result.score });
    }

    const typeRaw = cellText(row.getCell(C.callType).value).toLowerCase();
    const feedback = cellText(row.getCell(C.feedback).value);
    const submittedAt = reviewDate ?? new Date();

    await db.transaction(async (tx) => {
      const [ev] = await tx
        .insert(evaluations)
        .values({
          versionId: sc.id,
          agentId: agent!.id,
          siteId: agent!.siteId,
          reviewerId: reviewer?.id ?? actor.id,
          status: "submitted",
          source: "import",
          callType: CALL_TYPES[typeRaw] ?? "booking",
          callAt,
          callWeek,
          durationSec: cellDuration(row.getCell(C.duration).value),
          score: result.score,
          rawScore: result.raw,
          band: result.band,
          applicableCount: result.applicable,
          points: result.points,
          penalty: result.penalty,
          sectionScores: result.sections,
          feedback: feedback || null,
          improvements: !reviewer && qaName ? `Imported from ${fileName}; originally reviewed by ${qaName}.` : null,
          submittedAt,
          importRef,
        })
        .returning({ id: evaluations.id });
      await tx.insert(evaluationAnswers).values(Object.entries(answers).map(([criterionId, answer]) => ({ evaluationId: ev.id, criterionId, answer })));
      if (issue) await tx.insert(evaluationIssues).values({ evaluationId: ev.id, issueId: issue.id, note: "Imported from workbook" });
    });
    report.imported++;
  }

  await audit(actor, { action: "import.workbook", entity: "evaluation", after: { fileName, imported: report.imported, skipped: report.skipped.length } });
  return report;
}

export async function importedCount() {
  const rows = await db.select({ id: evaluations.id }).from(evaluations).where(and(eq(evaluations.source, "import"), ilike(evaluations.importRef, "%#%")));
  return rows.length;
}
