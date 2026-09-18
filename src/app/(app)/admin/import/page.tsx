import type { Metadata } from "next";
import { Download, FileSpreadsheet } from "lucide-react";
import { requireAdmin } from "@/server/auth/dal";
import { Card, CardHeader, PageHeader } from "@/components/ui/surface";
import { buttonClass } from "@/components/ui/button";
import { ImportForm } from "./import-form";

export const metadata: Metadata = { title: "Import & export" };

export default async function ImportPage() {
  await requireAdmin();
  return (
    <>
      <PageHeader
        eyebrow="Data"
        title="Import & export"
        description="Bring in history from the old weekly TMQ Scorecard workbooks, and take data out to Excel whenever you need it."
      />
      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title="Import a TMQ Scorecard workbook" description="In Google Sheets: File → Download → Microsoft Excel (.xlsx). Then upload it here." />
          <div className="px-5 pb-5">
            <ImportForm />
            <ul className="mt-5 grid gap-1.5 text-[13.5px] text-muted">
              <li>• Reads the “Analysis” sheet: one row per reviewed call.</li>
              <li>• Creates any campaigns (sites) and agents it hasn’t seen before.</li>
              <li>• Re-scores every row with the platform and reports how many match the sheet’s own score.</li>
              <li>• Rows with a blank answer are skipped, not silently scored as No.</li>
              <li>• Importing the same file again won’t duplicate anything.</li>
            </ul>
          </div>
        </Card>
        <Card>
          <CardHeader title="Export" description="Every export is logged in the audit trail." />
          <div className="grid gap-3 px-5 pb-5">
            <a href="/api/export/evaluations?period=4w&format=xlsx" className={buttonClass("outline", "md", "justify-start")}>
              <FileSpreadsheet className="size-4" /> Last 4 weeks · Excel
            </a>
            <a href="/api/export/evaluations?period=12w&format=xlsx" className={buttonClass("outline", "md", "justify-start")}>
              <FileSpreadsheet className="size-4" /> Last 12 weeks · Excel
            </a>
            <a href="/api/export/evaluations?period=12w&format=csv" className={buttonClass("ghost", "md", "justify-start")}>
              <Download className="size-4" /> Last 12 weeks · CSV
            </a>
            <p className="text-[12.5px] text-muted">For any other filter, use Export on the Evaluations page.</p>
          </div>
        </Card>
      </div>
    </>
  );
}
