import { db, type Tx } from "@/db";
import { auditLog } from "@/db/schema";

export type Actor = { id: string; role: "admin" | "qa"; name: string; ip?: string | null };

export type AuditEntry = {
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
};

/** Append-only audit trail. Pass a transaction so the log commits with the change it describes. */
export async function audit(actor: Actor | null, entry: AuditEntry, tx: Tx | typeof db = db) {
  await tx.insert(auditLog).values({
    actorId: actor?.id ?? null,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId ?? null,
    before: (entry.before ?? null) as never,
    after: (entry.after ?? null) as never,
    ip: actor?.ip ?? null,
  });
}
