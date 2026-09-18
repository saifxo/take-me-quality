"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { saveSiteAction } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/form";
import { Dialog, Spinner, useToast } from "@/components/ui/client";

type Site = { id: string; name: string; code: string; region: string; active: boolean };

export function SiteEditor({ site }: { site?: Site }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  return (
    <>
      {site ? (
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <Pencil className="size-3.5" /> Edit site
        </Button>
      ) : (
        <Button variant="brand" onClick={() => setOpen(true)}>
          <Plus className="size-4" /> Add site
        </Button>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} title={site ? `Edit ${site.name}` : "Add a site"}>
        <form
          action={(fd) =>
            start(async () => {
              setError(null);
              const res = await saveSiteAction(site?.id ?? null, {
                name: String(fd.get("name") ?? ""),
                code: String(fd.get("code") ?? ""),
                region: String(fd.get("region") ?? ""),
                active: fd.get("active") === "on",
              });
              if (!res.ok) return setError(res.error);
              toast({ tone: "ok", title: site ? "Site updated" : "Site added" });
              setOpen(false);
              router.refresh();
            })
          }
          className="grid gap-4"
        >
          <FormError message={error} />
          <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
            <Field label="Name" htmlFor="name">
              <Input id="name" name="name" defaultValue={site?.name} required autoFocus placeholder="e.g. Solihull" />
            </Field>
            <Field label="Portal code" htmlFor="code">
              <Input id="code" name="code" defaultValue={site?.code} required maxLength={8} className="font-mono uppercase" placeholder="SOL" />
            </Field>
          </div>
          <Field label="Region" htmlFor="region">
            <Input id="region" name="region" defaultValue={site?.region ?? "West Midlands"} />
          </Field>
          <label className="flex items-center gap-2 text-[14px]">
            <input type="checkbox" name="active" defaultChecked={site?.active ?? true} className="size-4 accent-[#00a6eb]" /> Active (shown in forms and filters)
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Spinner /> : null} Save
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
