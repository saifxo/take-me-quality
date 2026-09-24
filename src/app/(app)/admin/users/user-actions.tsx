"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, ListChecks, LogOut, MoreHorizontal, Plus, UserRound } from "lucide-react";
import { createUserAction, resetPasswordAction, saveReviewerAssignmentsAction, signOutEverywhereAction, updateUserAction } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Select } from "@/components/ui/form";
import { CopyButton, Dialog, Spinner, useToast } from "@/components/ui/client";

function TempPassword({ name, email, password, onDone }: { name: string; email: string; password: string; onDone: () => void }) {
  const text = `Take Me Quality sign-in\nEmail: ${email}\nOne-time password: ${password}\nYou’ll choose your own password when you first sign in.`;
  return (
    <div className="grid gap-4">
      <p className="text-[14px] text-ink-2">Share these details with {name.split(" ")[0]} privately. The password is shown only once.</p>
      <div className="rounded-2xl bg-ink p-4 font-mono text-[14px] text-white">
        <p className="text-white/60">Email</p>
        <p>{email}</p>
        <p className="mt-2 text-white/60">One-time password</p>
        <p className="text-[18px] font-semibold tracking-wide text-cyan">{password}</p>
      </div>
      <div className="flex justify-end gap-2">
        <CopyButton value={text} label="Copy details" />
        <Button onClick={onDone}>Done</Button>
      </div>
    </div>
  );
}

export function CreateUserButton() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ name: string; email: string; tempPassword: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function close() {
    setOpen(false);
    setCreated(null);
    setError(null);
  }

  return (
    <>
      <Button variant="brand" onClick={() => setOpen(true)}>
        <Plus className="size-4" /> Add person
      </Button>
      <Dialog open={open} onClose={close} title={created ? "Account created" : "Add a person"} description={created ? undefined : "They’ll get a one-time password to sign in with."}>
        {created ? (
          <TempPassword name={created.name} email={created.email} password={created.tempPassword} onDone={close} />
        ) : (
          <form
            action={(fd) =>
              start(async () => {
                setError(null);
                const res = await createUserAction({ name: String(fd.get("name") ?? ""), email: String(fd.get("email") ?? ""), role: String(fd.get("role") ?? "qa") });
                if (!res.ok) return setError(res.error);
                setCreated(res.data);
                router.refresh();
              })
            }
            className="grid gap-4"
          >
            <FormError message={error} />
            <Field label="Full name" htmlFor="name">
              <Input id="name" name="name" required autoFocus />
            </Field>
            <Field label="Work email" htmlFor="email">
              <Input id="email" name="email" type="email" required placeholder="name@takeme.taxi" />
            </Field>
            <Field label="Role" htmlFor="role" hint="Reviewers score calls and see their own work. Admins see everything and manage the platform.">
              <Select id="role" name="role" defaultValue="qa">
                <option value="qa">Quality reviewer</option>
                <option value="admin">Admin</option>
              </Select>
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? <Spinner /> : null} Create account
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </>
  );
}

type AssignmentOptions = {
  sites: { id: string; name: string; code: string }[];
  agents: { id: string; fullName: string; siteId: string; siteCode: string }[];
  siteIds: string[];
  agentIds: string[];
};

function AssignmentEditor({ user, options, onClose }: { user: { id: string; name: string }; options: AssignmentOptions; onClose: () => void }) {
  const [siteIds, setSiteIds] = useState(options.siteIds);
  const [agentIds, setAgentIds] = useState(options.agentIds);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const totalCovered = new Set([
    ...agentIds,
    ...options.agents.filter((agent) => siteIds.includes(agent.siteId)).map((agent) => agent.id),
  ]).size;

  function toggleSite(siteId: string, checked: boolean) {
    setSiteIds((ids) => (checked ? [...ids, siteId] : ids.filter((id) => id !== siteId)));
    if (checked) {
      const includedAgents = new Set(options.agents.filter((agent) => agent.siteId === siteId).map((agent) => agent.id));
      setAgentIds((ids) => ids.filter((id) => !includedAgents.has(id)));
    }
  }

  function toggleAgent(agentId: string, checked: boolean) {
    setAgentIds((ids) => (checked ? [...ids, agentId] : ids.filter((id) => id !== agentId)));
  }

  return (
    <div className="grid gap-4">
      <FormError message={error} />
      <div className="rounded-2xl border border-brand/20 bg-brand-50 px-4 py-3 text-[13px] leading-relaxed text-ink-2">
        A site includes all of its current and future agents. Individual agents can be added from other sites. With nothing selected, this reviewer cannot start new reviews.
      </div>
      <div className="max-h-[55vh] space-y-5 overflow-y-auto pr-1">
        <fieldset>
          <legend className="mb-2 text-[13px] font-semibold text-ink-2">Whole sites</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {options.sites.map((site) => (
              <label key={site.id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-line px-3 py-2.5 transition hover:bg-sunken focus-within:ring-4 focus-within:ring-brand/15">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 accent-brand"
                  checked={siteIds.includes(site.id)}
                  onChange={(e) => toggleSite(site.id, e.target.checked)}
                />
                <span className="min-w-0 text-[13.5px] font-medium">
                  {site.name} <span className="text-muted">({site.code})</span>
                </span>
              </label>
            ))}
          </div>
          {options.sites.length === 0 ? <p className="text-[13px] text-muted">No active sites are available.</p> : null}
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-[13px] font-semibold text-ink-2">Individual agents</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {options.agents.map((agent) => {
              const includedBySite = siteIds.includes(agent.siteId);
              return (
                <label
                  key={agent.id}
                  className={`flex items-start gap-3 rounded-xl border border-line px-3 py-2.5 transition ${includedBySite ? "cursor-default bg-sunken text-muted" : "cursor-pointer hover:bg-sunken focus-within:ring-4 focus-within:ring-brand/15"}`}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 accent-brand"
                    checked={includedBySite || agentIds.includes(agent.id)}
                    disabled={includedBySite}
                    onChange={(e) => toggleAgent(agent.id, e.target.checked)}
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-[13.5px] font-medium">{agent.fullName}</span>
                    <span className="text-[12px] text-muted">{includedBySite ? `Included with ${agent.siteCode}` : agent.siteCode}</span>
                  </span>
                </label>
              );
            })}
          </div>
          {options.agents.length === 0 ? <p className="text-[13px] text-muted">No active or pending agents are available.</p> : null}
        </fieldset>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <p className="text-[13px] text-muted">{totalCovered} agent{totalCovered === 1 ? "" : "s"} covered</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                setError(null);
                const res = await saveReviewerAssignmentsAction(user.id, { siteIds, agentIds });
                if (!res.ok) return setError(res.error);
                toast({ tone: "ok", title: "Coverage updated", body: `${user.name} can now review ${totalCovered} agent${totalCovered === 1 ? "" : "s"}.` });
                onClose();
                router.refresh();
              })
            }
          >
            {pending ? <Spinner /> : null} Save assignments
          </Button>
        </div>
      </div>
    </div>
  );
}

export function UserRowActions({ user, isSelf, assignmentOptions }: { user: { id: string; name: string; role: "admin" | "qa"; status: "active" | "disabled" }; isSelf: boolean; assignmentOptions?: AssignmentOptions }) {
  const [menu, setMenu] = useState(false);
  const [reset, setReset] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string) =>
    start(async () => {
      setMenu(false);
      const res = await fn();
      if (!res.ok) return toast({ tone: "error", title: "That didn’t work", body: res.error });
      toast({ tone: "ok", title: success });
      router.refresh();
    });

  return (
    <div className="relative inline-block text-left">
      <Button variant="ghost" size="sm" onClick={() => setMenu((m) => !m)} aria-haspopup="menu" aria-expanded={menu} aria-label={`Actions for ${user.name}`}>
        {pending ? <Spinner /> : <MoreHorizontal className="size-4" />}
      </Button>
      {menu ? (
        <>
          <button type="button" className="fixed inset-0 z-10 cursor-default" aria-hidden tabIndex={-1} onClick={() => setMenu(false)} />
          <div role="menu" className="animate-pop absolute right-0 z-20 mt-1 grid w-60 gap-0.5 rounded-2xl border border-line bg-surface p-1.5 text-[13.5px] shadow-[var(--shadow-float)]">
            {assignmentOptions ? (
              <button
                role="menuitem"
                type="button"
                className="flex items-center gap-2 rounded-xl px-3 py-2 text-left hover:bg-sunken"
                onClick={() => {
                  setMenu(false);
                  setAssigning(true);
                }}
              >
                <ListChecks className="size-4 text-muted" /> Assign coverage
              </button>
            ) : null}
            <button
              role="menuitem"
              type="button"
              className="flex items-center gap-2 rounded-xl px-3 py-2 text-left hover:bg-sunken"
              onClick={() =>
                start(async () => {
                  setMenu(false);
                  const res = await resetPasswordAction(user.id);
                  if (!res.ok) return toast({ tone: "error", title: "Couldn’t reset", body: res.error });
                  setReset(res.data.tempPassword);
                  router.refresh();
                })
              }
            >
              <KeyRound className="size-4 text-muted" /> Reset password
            </button>
            <button role="menuitem" type="button" className="flex items-center gap-2 rounded-xl px-3 py-2 text-left hover:bg-sunken" onClick={() => run(() => signOutEverywhereAction(user.id), `${user.name} signed out everywhere`)}>
              <LogOut className="size-4 text-muted" /> Sign out everywhere
            </button>
            {!isSelf ? (
              <>
                <button
                  role="menuitem"
                  type="button"
                  className="flex items-center gap-2 rounded-xl px-3 py-2 text-left hover:bg-sunken"
                  onClick={() => run(() => updateUserAction(user.id, { role: user.role === "admin" ? "qa" : "admin" }), user.role === "admin" ? "Now a quality reviewer" : "Now an admin")}
                >
                  <UserRound className="size-4 text-muted" /> Make {user.role === "admin" ? "quality reviewer" : "admin"}
                </button>
                <button
                  role="menuitem"
                  type="button"
                  className="flex items-center gap-2 rounded-xl px-3 py-2 text-left text-fail hover:bg-fail-soft"
                  onClick={() => run(() => updateUserAction(user.id, { status: user.status === "active" ? "disabled" : "active" }), user.status === "active" ? "Account switched off" : "Account switched on")}
                >
                  {user.status === "active" ? "Switch account off" : "Switch account on"}
                </button>
              </>
            ) : null}
          </div>
        </>
      ) : null}
      <Dialog open={!!reset} onClose={() => setReset(null)} title="Password reset" description="They’ve been signed out and must choose a new password when they next sign in.">
        {reset ? <TempPassword name={user.name} email="" password={reset} onDone={() => setReset(null)} /> : null}
      </Dialog>
      <Dialog
        open={assigning}
        onClose={() => setAssigning(false)}
        title={`Assign coverage to ${user.name}`}
        description="Control which agents this reviewer can select, paste and track."
        className="w-[min(760px,calc(100vw-2rem))]"
      >
        {assigning && assignmentOptions ? <AssignmentEditor user={user} options={assignmentOptions} onClose={() => setAssigning(false)} /> : null}
      </Dialog>
    </div>
  );
}
