import ExcelJS from "exceljs";
import { getCurrentUser } from "@/server/auth/session";
import { exportEvaluations } from "@/server/services/evaluations";
import { explorerFilters } from "@/lib/explorer-filters";
import { formatCallTime, formatDuration } from "@/lib/dates";
import { CALL_TYPE_LABEL } from "@/lib/utils";
import { audit } from "@/server/audit";

export const dynamic = "force-dynamic";

// Stop spreadsheet apps treating exported text as a formula (CSV injection).
const safe = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
};
const csvCell = (v: unknown) => {
  const s = safe(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin" || user.mustChangePassword) return new Response("Not allowed", { status: 403 });
  const url = new URL(request.url);
  const sp = Object.fromEntries(url.searchParams.entries());
  const { filters, period } = explorerFilters(sp);
  const format = sp.format === "csv" ? "csv" : "xlsx";
  const data = await exportEvaluations({ id: user.id, role: user.role, name: user.name }, filters);

  const header = ["Call time (UK)", "Week", "Agent", "Site", "Call type", "Duration", "Reviewer", "Score %", "Band", "Zero tolerance", ...data.criteriaKeys.map((c) => c.title), "Feedback"];
  const rows = data.rows.map((r) => [
    formatCallTime(r.callAt, true),
    r.callWeek ?? "",
    r.agentName,
    r.siteName,
    CALL_TYPE_LABEL[r.callType] ?? r.callType,
    formatDuration(r.durationSec),
    r.reviewerName,
    r.score ?? "",
    r.band ?? "",
    (data.issues.get(r.id) ?? []).join(", "),
    ...data.criteriaKeys.map((c) => ({ yes: "Yes", partial: "Partial", no: "No", na: "N/a" })[data.answers.get(r.id)?.[c.key] as "yes"] ?? ""),
    data.feedback.get(r.id)?.feedback ?? "",
  ]);
  await audit({ id: user.id, role: user.role, name: user.name }, { action: "export.evaluations", entity: "evaluation", after: { format, rows: rows.length, from: period.from, to: period.to } });
  const name = `tmq-evaluations-${period.from}-to-${period.to}`;

  if (format === "csv") {
    const body = "\uFEFF" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
    return new Response(body, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.csv"`, "Cache-Control": "no-store" },
    });
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "Take Me Quality";
  const ws = wb.addWorksheet("Evaluations", { views: [{ state: "frozen", ySplit: 1, xSplit: 3 }] });
  ws.addRow(header);
  for (const r of rows) ws.addRow(r.map((v) => (typeof v === "number" ? v : safe(v))));
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF000000" } };
  head.height = 30;
  head.alignment = { vertical: "middle", wrapText: true };
  ws.columns.forEach((c, i) => {
    c.width = i < 10 ? [20, 12, 22, 16, 13, 10, 18, 9, 11, 18][i] : i === header.length - 1 ? 60 : 14;
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: header.length } };
  const fills: Record<string, string> = { perfect: "FFF6EFDC", meets: "FFE0F2E7", below: "FFFDF1DD", fail: "FFFBE8E6" };
  rows.forEach((r, i) => {
    const band = String(r[8]);
    if (fills[band]) ws.getRow(i + 2).getCell(8).fill = { type: "pattern", pattern: "solid", fgColor: { argb: fills[band] } };
  });
  const buffer = await wb.xlsx.writeBuffer();
  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
