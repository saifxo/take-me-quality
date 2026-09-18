"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, TriangleAlert, Upload } from "lucide-react";
import { importWorkbookAction } from "@/app/actions/admin";
import type { ImportReport } from "@/server/services/import";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form";
import { Spinner, useToast } from "@/components/ui/client";

export function ImportForm() {
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();

  return (
    <div className="grid gap-4">
      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line-strong bg-sunken/40 px-6 py-10 text-center transition hover:border-brand hover:bg-brand-50/40">
        <Upload className="size-7 text-brand" />
        <span className="text-[15px] font-semibold">{file ? file.name : "Choose the .xlsx workbook"}</span>
        <span className="text-[13px] text-muted">{file ? `${(file.size / 1024).toFixed(0)} KB` : "Up to 5 MB"}</span>
        <input
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setReport(null);
            setError(null);
          }}
        />
      </label>
      <FormError message={error} />
      <Button
        variant="brand"
        disabled={!file || pending}
        className="w-fit"
        onClick={() =>
          start(async () => {
            if (!file) return;
            setError(null);
            const fd = new FormData();
            fd.set("file", file);
            const res = await importWorkbookAction(fd);
            if (!res.ok) return setError(res.error);
            setReport(res.data);
            toast({ tone: "ok", title: `Imported ${res.data.imported} ${res.data.imported === 1 ? "review" : "reviews"}` });
            router.refresh();
          })
        }
      >
        {pending ? <Spinner /> : <Upload className="size-4" />} Import workbook
      </Button>

      {report ? (
        <div className="animate-rise grid gap-3 rounded-2xl border border-line p-4">
          <p className="flex items-center gap-2 text-[15px] font-semibold">
            <CircleCheck className="size-5 text-meets" /> {report.imported} imported from “{report.sheet}”
          </p>
          <dl className="grid grid-cols-2 gap-3 text-[13.5px] sm:grid-cols-4">
            {[
              ["Rows read", report.rowsRead],
              ["Already imported", report.alreadyImported],
              ["Skipped", report.skipped.length],
              ["Scores matching the sheet", report.scoreCompared ? `${report.scoreMatches}/${report.scoreCompared}` : "—"],
            ].map(([k, v]) => (
              <div key={String(k)} className="rounded-xl bg-sunken/60 p-3">
                <dt className="text-muted">{k}</dt>
                <dd className="text-[18px] font-semibold tabular">{v}</dd>
              </div>
            ))}
          </dl>
          {report.createdSites.length ? <p className="text-[13.5px]">New sites: {report.createdSites.join(", ")}</p> : null}
          {report.createdAgents.length ? <p className="text-[13.5px]">New agents: {report.createdAgents.join(", ")}</p> : null}
          {report.skipped.length ? (
            <details className="text-[13px]">
              <summary className="cursor-pointer font-semibold text-below-ink">
                <TriangleAlert className="mr-1 inline size-3.5" /> {report.skipped.length} rows skipped
              </summary>
              <ul className="mt-2 grid gap-1 text-muted">
                {report.skipped.slice(0, 30).map((s) => (
                  <li key={s.row}>
                    Row {s.row}: {s.reason}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          {report.mismatches.length ? (
            <p className="text-[13px] text-muted">
              Differences from the sheet (usually rows the sheet let go below 0%): {report.mismatches.slice(0, 5).map((m) => `row ${m.row} ${m.sheet}% → ${m.platform}%`).join("; ")}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
