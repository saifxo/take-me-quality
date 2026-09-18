import type { Metadata } from "next";
import Link from "next/link";
import { count, desc, eq, sql } from "drizzle-orm";
import { requireAdmin } from "@/server/auth/dal";
import { db } from "@/db";
import { auditLog, users } from "@/db/schema";
import { formatCallTime } from "@/lib/dates";
import { Badge, Card, PageHeader, TableWrap, td, th } from "@/components/ui/surface";
import { Pager } from "@/components/evaluations/evaluation-table";

export const metadata: Metadata = { title: "Audit log" };

const LABELS: Record<string, string> = {
  "evaluation.submitted": "Submitted a review",
  "evaluation.amended": "Changed a submitted review",
  "evaluation.deleted": "Deleted a review",
  "evaluation.queued": "Queued calls from the portal",
  "evaluation.created": "Started a manual review",
  "user.created": "Created an account",
  "user.updated": "Updated an account",
  "user.password_reset": "Reset a password",
  "user.password_changed": "Changed their password",
  "user.sessions_revoked": "Signed someone out everywhere",
  "agent.created": "Added an agent",
  "agent.updated": "Updated an agent",
  "site.created": "Added a site",
  "site.updated": "Updated a site",
  "scorecard.draft_created": "Started a scorecard draft",
  "scorecard.settings_updated": "Changed draft thresholds",
  "scorecard.criterion_updated": "Edited a check in the draft",
  "scorecard.published": "Published a scorecard version",
  "scorecard.draft_discarded": "Discarded a scorecard draft",
  "import.workbook": "Imported a workbook",
  "export.evaluations": "Exported evaluations",
  "ai.agent_coaching": "Generated a coaching summary",
  "ai.weekly_briefing": "Generated a weekly briefing",
  "ai.themes": "Generated themes",
  "ai.polish": "Used AI to tidy notes",
  "ai.approved": "Approved a coaching summary",
};

export default async function AuditPage(props: PageProps<"/admin/audit">) {
  await requireAdmin();
  const sp = await props.searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const pageSize = 50;
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({ id: auditLog.id, action: auditLog.action, entity: auditLog.entity, entityId: auditLog.entityId, after: auditLog.after, ip: auditLog.ip, createdAt: auditLog.createdAt, actor: users.name })
      .from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.actorId))
      .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: count() }).from(auditLog).where(sql`true`),
  ]);
  return (
    <>
      <PageHeader eyebrow="Security" title="Audit log" description="Every change to reviews, accounts, agents and rules, newest first. Entries can’t be edited or deleted." />
      <Card>
        <TableWrap>
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <th className={th}>When</th>
                <th className={th}>Who</th>
                <th className={th}>What</th>
                <th className={th}>Details</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className={`${td} whitespace-nowrap text-[13px] text-ink-2`}>{formatCallTime(r.createdAt, true)}</td>
                  <td className={`${td} font-medium`}>{r.actor ?? "System"}</td>
                  <td className={td}>
                    <p>{LABELS[r.action] ?? r.action}</p>
                    <Badge tone="outline" className="mt-1 font-mono text-[11px]">
                      {r.action}
                    </Badge>
                  </td>
                  <td className={`${td} max-w-md text-[12.5px] text-muted`}>
                    {r.entity === "evaluation" && r.entityId ? (
                      <Link href={`/evaluations/${r.entityId}`} className="font-semibold text-brand-700 hover:underline">
                        Open review
                      </Link>
                    ) : null}
                    {r.after ? <span className="ml-2 line-clamp-2 font-mono">{JSON.stringify(r.after).slice(0, 180)}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
        <Pager page={page} pageSize={pageSize} total={total} hrefFor={(p) => `/admin/audit?page=${p}`} />
      </Card>
    </>
  );
}
