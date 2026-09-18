"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { saveAgentAction } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Select } from "@/components/ui/form";
import { Dialog, Spinner, useToast } from "@/components/ui/client";

type Agent = { id: string; fullName: string; siteId: string; teamCode: string | null; extension: string | null; status: "active" | "pending" | "inactive" };

export function AgentEditor({ sites, agent, compact }: { sites: { id: string; name: string }[]; agent?: Agent; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();

  function submit(fd: FormData) {
    setError(null);
    start(async () => {
      const res = await saveAgentAction(agent?.id ?? null, {
        fullName: String(fd.get("fullName") ?? ""),
        siteId: String(fd.get("siteId") ?? ""),
        teamCode: String(fd.get("teamCode") ?? "") || null,
        extension: String(fd.get("extension") ?? "") || null,
        status: (String(fd.get("status") ?? "active") as Agent["status"]) || "active",
      });
      if (!res.ok) return setError(res.error);
      toast({ tone: "ok", title: agent ? "Agent updated" : "Agent added" });
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      {agent ? (
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)} aria-label={`Edit ${agent.fullName}`}>
          <Pencil className="size-3.5" /> {compact ? "Edit" : "Edit agent"}
        </Button>
      ) : (
        <Button variant="brand" onClick={() => setOpen(true)}>
          <Plus className="size-4" /> Add agent
        </Button>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} title={agent ? `Edit ${agent.fullName}` : "Add an agent"} description="Use the name exactly as it appears in the recordings portal so smart paste can match it.">
        <form action={submit} className="grid gap-4">
          <FormError message={error} />
          <Field label="Full name" htmlFor="fullName">
            <Input id="fullName" name="fullName" defaultValue={agent?.fullName} required autoFocus />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Site" htmlFor="siteId">
              <Select id="siteId" name="siteId" defaultValue={agent?.siteId ?? ""} required>
                <option value="" disabled>
                  Choose…
                </option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Status" htmlFor="status">
              <Select id="status" name="status" defaultValue={agent?.status ?? "active"}>
                <option value="active">Active</option>
                <option value="pending">Pending confirmation</option>
                <option value="inactive">Inactive (left or moved)</option>
              </Select>
            </Field>
            <Field label="Team code" htmlFor="teamCode" hint="As in the portal, e.g. DE or BE">
              <Input id="teamCode" name="teamCode" defaultValue={agent?.teamCode ?? ""} maxLength={8} />
            </Field>
            <Field label="Extension" htmlFor="extension">
              <Input id="extension" name="extension" defaultValue={agent?.extension ?? ""} maxLength={12} inputMode="numeric" />
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? <Spinner /> : null} {agent ? "Save changes" : "Add agent"}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

export function ApproveAgentButton({ agent }: { agent: Agent }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  return (
    <Button
      variant="primary"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await saveAgentAction(agent.id, { fullName: agent.fullName, siteId: agent.siteId, teamCode: agent.teamCode, extension: agent.extension, status: "active" });
          if (!res.ok) return toast({ tone: "error", title: "Couldn’t confirm", body: res.error });
          toast({ tone: "ok", title: `${agent.fullName} confirmed` });
          router.refresh();
        })
      }
    >
      {pending ? <Spinner /> : null} Confirm
    </Button>
  );
}
