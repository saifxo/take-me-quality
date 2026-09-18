import {
  bigserial,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ---------------------------------------------------------------- enums
export const userRole = pgEnum("user_role", ["admin", "qa"]);
export const userStatus = pgEnum("user_status", ["active", "disabled"]);
export const agentStatus = pgEnum("agent_status", ["active", "pending", "inactive"]);
export const scorecardStatus = pgEnum("scorecard_status", ["draft", "active", "retired"]);
export const evaluationStatus = pgEnum("evaluation_status", ["queued", "draft", "submitted"]);
export const evaluationSource = pgEnum("evaluation_source", ["smart_paste", "manual", "import"]);
export const answerValue = pgEnum("answer_value", ["yes", "partial", "no", "na"]);
export const scoreBand = pgEnum("score_band", ["perfect", "meets", "below", "fail"]);
export const callType = pgEnum("call_type", [
  "booking",
  "airport",
  "account",
  "special",
  "enquiry",
  "complaint",
  "cancellation",
  "other",
]);
export const aiKind = pgEnum("ai_kind", ["agent_coaching", "weekly_briefing", "themes", "polish"]);

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

// ---------------------------------------------------------------- identity
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: userRole("role").notNull().default("qa"),
    status: userStatus("status").notNull().default("active"),
    mustChangePassword: boolean("must_change_password").notNull().default(true),
    lastLoginAt: ts("last_login_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_uq").on(t.email)],
);

export const sessions = pgTable(
  "sessions",
  {
    // SHA-256 of the cookie token — the raw token never touches the database.
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: ts("expires_at").notNull(),
    lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
    createdAt: ts("created_at").notNull().defaultNow(),
    userAgent: text("user_agent"),
    ip: text("ip"),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    ip: text("ip"),
    success: boolean("success").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("login_attempts_email_idx").on(t.email, t.createdAt), index("login_attempts_ip_idx").on(t.ip, t.createdAt)],
);

// ---------------------------------------------------------------- organisation
export const sites = pgTable(
  "sites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    code: text("code").notNull(),
    region: text("region").notNull().default("West Midlands"),
    active: boolean("active").notNull().default(true),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("sites_code_uq").on(t.code)],
);

export const agents = pgTable(
  "agents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fullName: text("full_name").notNull(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id),
    teamCode: text("team_code"),
    extension: text("extension"),
    status: agentStatus("status").notNull().default("active"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("agents_site_idx").on(t.siteId), index("agents_name_idx").on(t.fullName)],
);

// ---------------------------------------------------------------- scorecard (versioned rules)
export type ScorecardSettings = {
  /** A score must be strictly above this to meet KPI (the sheet: > 90%). */
  kpiPass: number;
  /** Agent needs attention when more than this % of calls are below KPI. */
  attentionShare: number;
  /** Calls to review per agent per week. */
  weeklyTarget: number;
  weights: { yes: number; partial: number; no: number };
  /** Lowest possible score. null = no floor (the sheet's behaviour). */
  scoreFloor: number | null;
  /** Hours a reviewer may change their own submitted review. */
  editWindowHours: number;
};

export const scorecardVersions = pgTable(
  "scorecard_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    version: integer("version").notNull(),
    name: text("name").notNull(),
    status: scorecardStatus("status").notNull().default("draft"),
    settings: jsonb("settings").$type<ScorecardSettings>().notNull(),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: ts("created_at").notNull().defaultNow(),
    publishedAt: ts("published_at"),
  },
  (t) => [uniqueIndex("scorecard_versions_version_uq").on(t.version)],
);

export const sections = pgTable(
  "sections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    versionId: uuid("version_id")
      .notNull()
      .references(() => scorecardVersions.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    shortName: text("short_name").notNull(),
    position: integer("position").notNull(),
  },
  (t) => [uniqueIndex("sections_version_key_uq").on(t.versionId, t.key)],
);

export const criteria = pgTable(
  "criteria",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    versionId: uuid("version_id")
      .notNull()
      .references(() => scorecardVersions.id, { onDelete: "cascade" }),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => sections.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    /** Column letter in the original Analysis sheet (I..AC). */
    sheetColumn: text("sheet_column"),
    title: text("title").notNull(),
    description: text("description").notNull(),
    yesDesc: text("yes_desc"),
    partialDesc: text("partial_desc"),
    noDesc: text("no_desc"),
    markerNotes: text("marker_notes"),
    allowPartial: boolean("allow_partial").notNull().default(true),
    allowNa: boolean("allow_na").notNull().default(true),
    penaltyNo: doublePrecision("penalty_no").notNull().default(0),
    penaltyPartial: doublePrecision("penalty_partial").notNull().default(0),
    /** Pre-select N/A unless the call type is one of these (empty = always applicable). */
    applicableCallTypes: jsonb("applicable_call_types").$type<string[]>().notNull().default([]),
    position: integer("position").notNull(),
  },
  (t) => [uniqueIndex("criteria_version_key_uq").on(t.versionId, t.key), index("criteria_section_idx").on(t.sectionId)],
);

export const hihiIssues = pgTable(
  "hihi_issues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    versionId: uuid("version_id")
      .notNull()
      .references(() => scorecardVersions.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    shortName: text("short_name").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    position: integer("position").notNull(),
  },
  (t) => [uniqueIndex("hihi_version_key_uq").on(t.versionId, t.key)],
);

// ---------------------------------------------------------------- evaluations
export type SectionScores = Record<string, number | null>;

export const evaluations = pgTable(
  "evaluations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    versionId: uuid("version_id")
      .notNull()
      .references(() => scorecardVersions.id),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id),
    reviewerId: uuid("reviewer_id")
      .notNull()
      .references(() => users.id),
    status: evaluationStatus("status").notNull().default("draft"),
    source: evaluationSource("source").notNull().default("manual"),
    callType: callType("call_type").notNull().default("booking"),
    callAt: ts("call_at"),
    /** Monday (UK time) of the week the call happened — the reporting week. */
    callWeek: date("call_week", { mode: "string" }),
    durationSec: integer("duration_sec"),
    queue: text("queue"),
    extension: text("extension"),
    callerMasked: text("caller_masked"),
    /** Keyed hash of the normalised caller number, for duplicate checks only. */
    callerHash: text("caller_hash"),
    anonymousCaller: boolean("anonymous_caller").notNull().default(false),
    score: doublePrecision("score"),
    rawScore: doublePrecision("raw_score"),
    band: scoreBand("band"),
    applicableCount: integer("applicable_count"),
    points: doublePrecision("points"),
    penalty: doublePrecision("penalty"),
    sectionScores: jsonb("section_scores").$type<SectionScores>(),
    feedback: text("feedback"),
    strengths: text("strengths"),
    improvements: text("improvements"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    submittedAt: ts("submitted_at"),
    amendedAt: ts("amended_at"),
    amendedBy: uuid("amended_by").references(() => users.id),
    amendReason: text("amend_reason"),
    /** "<workbook name>#<row>" for rows brought in by the workbook importer. */
    importRef: text("import_ref"),
    deletedAt: ts("deleted_at"),
  },
  (t) => [
    index("evaluations_import_ref_idx").on(t.importRef),
    index("evaluations_agent_week_idx").on(t.agentId, t.callWeek),
    index("evaluations_reviewer_status_idx").on(t.reviewerId, t.status),
    index("evaluations_week_idx").on(t.callWeek),
    index("evaluations_status_idx").on(t.status),
    index("evaluations_site_idx").on(t.siteId),
  ],
);

export const evaluationAnswers = pgTable(
  "evaluation_answers",
  {
    evaluationId: uuid("evaluation_id")
      .notNull()
      .references(() => evaluations.id, { onDelete: "cascade" }),
    criterionId: uuid("criterion_id")
      .notNull()
      .references(() => criteria.id),
    answer: answerValue("answer").notNull(),
    note: text("note"),
    atTime: text("at_time"),
  },
  (t) => [primaryKey({ columns: [t.evaluationId, t.criterionId] })],
);

export const evaluationIssues = pgTable(
  "evaluation_issues",
  {
    evaluationId: uuid("evaluation_id")
      .notNull()
      .references(() => evaluations.id, { onDelete: "cascade" }),
    issueId: uuid("issue_id")
      .notNull()
      .references(() => hihiIssues.id),
    note: text("note"),
  },
  (t) => [primaryKey({ columns: [t.evaluationId, t.issueId] })],
);

// ---------------------------------------------------------------- AI + audit
export const aiSummaries = pgTable(
  "ai_summaries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: aiKind("kind").notNull(),
    agentId: uuid("agent_id").references(() => agents.id),
    periodStart: date("period_start", { mode: "string" }),
    periodEnd: date("period_end", { mode: "string" }),
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    inputHash: text("input_hash").notNull(),
    output: jsonb("output").$type<Record<string, unknown>>().notNull(),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: ts("created_at").notNull().defaultNow(),
    approvedAt: ts("approved_at"),
    approvedBy: uuid("approved_by").references(() => users.id),
  },
  (t) => [
    index("ai_summaries_lookup_idx").on(t.kind, t.agentId, t.periodStart),
    index("ai_summaries_hash_idx").on(t.inputHash),
    index("ai_summaries_creator_idx").on(t.createdBy, t.createdAt),
  ],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    actorId: uuid("actor_id").references(() => users.id),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    ip: text("ip"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("audit_log_created_idx").on(t.createdAt), index("audit_log_entity_idx").on(t.entity, t.entityId)],
);

// ---------------------------------------------------------------- relations (for db.query)
export const usersRelations = relations(users, ({ many }) => ({ sessions: many(sessions) }));
export const sessionsRelations = relations(sessions, ({ one }) => ({ user: one(users, { fields: [sessions.userId], references: [users.id] }) }));
export const sitesRelations = relations(sites, ({ many }) => ({ agents: many(agents) }));
export const agentsRelations = relations(agents, ({ one, many }) => ({
  site: one(sites, { fields: [agents.siteId], references: [sites.id] }),
  evaluations: many(evaluations),
}));
export const versionsRelations = relations(scorecardVersions, ({ many }) => ({
  sections: many(sections),
  criteria: many(criteria),
  issues: many(hihiIssues),
}));
export const sectionsRelations = relations(sections, ({ one, many }) => ({
  version: one(scorecardVersions, { fields: [sections.versionId], references: [scorecardVersions.id] }),
  criteria: many(criteria),
}));
export const criteriaRelations = relations(criteria, ({ one }) => ({
  section: one(sections, { fields: [criteria.sectionId], references: [sections.id] }),
  version: one(scorecardVersions, { fields: [criteria.versionId], references: [scorecardVersions.id] }),
}));
export const hihiRelations = relations(hihiIssues, ({ one }) => ({
  version: one(scorecardVersions, { fields: [hihiIssues.versionId], references: [scorecardVersions.id] }),
}));
export const evaluationsRelations = relations(evaluations, ({ one, many }) => ({
  agent: one(agents, { fields: [evaluations.agentId], references: [agents.id] }),
  site: one(sites, { fields: [evaluations.siteId], references: [sites.id] }),
  reviewer: one(users, { fields: [evaluations.reviewerId], references: [users.id] }),
  version: one(scorecardVersions, { fields: [evaluations.versionId], references: [scorecardVersions.id] }),
  answers: many(evaluationAnswers),
  issues: many(evaluationIssues),
}));
export const answersRelations = relations(evaluationAnswers, ({ one }) => ({
  evaluation: one(evaluations, { fields: [evaluationAnswers.evaluationId], references: [evaluations.id] }),
  criterion: one(criteria, { fields: [evaluationAnswers.criterionId], references: [criteria.id] }),
}));
export const issuesRelations = relations(evaluationIssues, ({ one }) => ({
  evaluation: one(evaluations, { fields: [evaluationIssues.evaluationId], references: [evaluations.id] }),
  issue: one(hihiIssues, { fields: [evaluationIssues.issueId], references: [hihiIssues.id] }),
}));

export type User = typeof users.$inferSelect;
export type Site = typeof sites.$inferSelect;
export type Agent = typeof agents.$inferSelect;
export type Evaluation = typeof evaluations.$inferSelect;
export type Criterion = typeof criteria.$inferSelect;
export type Section = typeof sections.$inferSelect;
export type HihiIssue = typeof hihiIssues.$inferSelect;
export type ScorecardVersion = typeof scorecardVersions.$inferSelect;
export type AnswerValue = (typeof answerValue.enumValues)[number];
export type ScoreBand = (typeof scoreBand.enumValues)[number];
export type CallType = (typeof callType.enumValues)[number];
export type Role = (typeof userRole.enumValues)[number];
