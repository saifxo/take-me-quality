import type { Metadata } from "next";
import { requireAdmin } from "@/server/auth/dal";
import { listUsers } from "@/server/services/users";
import { listAgents, listSites } from "@/server/services/roster";
import { listReviewerAssignments } from "@/server/services/assignments";
import { relativeTime } from "@/lib/dates";
import { initials } from "@/lib/utils";
import { Badge, Card, PageHeader, TableWrap, td, th } from "@/components/ui/surface";
import { CreateUserButton, UserRowActions } from "./user-actions";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage() {
  const me = await requireAdmin();
  const [users, sites, agents, assignments] = await Promise.all([
    listUsers(me),
    listSites({ activeOnly: true }),
    listAgents(),
    listReviewerAssignments(me),
  ]);
  return (
    <>
      <PageHeader
        eyebrow="Access"
        title="Users"
        description="Create accounts for quality reviewers and admins. There is no public sign-up: new people get a one-time password and choose their own at first sign-in."
        actions={<CreateUserButton />}
      />
      <Card>
        <TableWrap>
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <th className={th}>Person</th>
                <th className={th}>Role</th>
                <th className={th}>Status</th>
                <th className={`${th} text-right`}>Reviews</th>
                <th className={th}>Last sign-in</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-sunken/40">
                  <td className={td}>
                    <div className="flex items-center gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-ink text-[12.5px] font-bold text-white">{initials(u.name)}</span>
                      <div className="min-w-0">
                        <p className="font-semibold">
                          {u.name} {u.id === me.id ? <span className="text-[12px] font-normal text-muted">(you)</span> : null}
                        </p>
                        <p className="text-[12.5px] text-muted">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className={td}>
                    <Badge tone={u.role === "admin" ? "brand" : "neutral"}>{u.role === "admin" ? "Admin" : "Quality reviewer"}</Badge>
                  </td>
                  <td className={td}>
                    {u.status === "disabled" ? <Badge tone="danger">Switched off</Badge> : u.mustChangePassword ? <Badge tone="warn">Awaiting first sign-in</Badge> : <Badge tone="ok">Active</Badge>}
                  </td>
                  <td className={`${td} text-right tabular`}>{u.reviews}</td>
                  <td className={`${td} text-[13px] text-ink-2`}>{u.lastLoginAt ? relativeTime(u.lastLoginAt) : "Never"}</td>
                  <td className={`${td} text-right`}>
                    <UserRowActions
                      user={{ id: u.id, name: u.name, role: u.role, status: u.status }}
                      isSelf={u.id === me.id}
                      assignmentOptions={
                        u.role === "qa"
                          ? {
                              sites: sites.map((s) => ({ id: s.id, name: s.name, code: s.code })),
                              agents: agents.map((a) => ({ id: a.id, fullName: a.fullName, siteId: a.siteId, siteCode: a.siteCode })),
                              siteIds: assignments.sites.filter((a) => a.reviewerId === u.id).map((a) => a.siteId),
                              agentIds: assignments.agents.filter((a) => a.reviewerId === u.id).map((a) => a.agentId),
                            }
                          : undefined
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Card>
    </>
  );
}
