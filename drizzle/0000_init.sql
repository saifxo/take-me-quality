CREATE TYPE "public"."agent_status" AS ENUM('active', 'pending', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."ai_kind" AS ENUM('agent_coaching', 'weekly_briefing', 'themes', 'polish');--> statement-breakpoint
CREATE TYPE "public"."answer_value" AS ENUM('yes', 'partial', 'no', 'na');--> statement-breakpoint
CREATE TYPE "public"."call_type" AS ENUM('booking', 'airport', 'account', 'special', 'enquiry', 'complaint', 'cancellation', 'other');--> statement-breakpoint
CREATE TYPE "public"."evaluation_source" AS ENUM('smart_paste', 'manual', 'import');--> statement-breakpoint
CREATE TYPE "public"."evaluation_status" AS ENUM('queued', 'draft', 'submitted');--> statement-breakpoint
CREATE TYPE "public"."score_band" AS ENUM('perfect', 'meets', 'below', 'fail');--> statement-breakpoint
CREATE TYPE "public"."scorecard_status" AS ENUM('draft', 'active', 'retired');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'qa');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'disabled');--> statement-breakpoint
CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"site_id" uuid NOT NULL,
	"team_code" text,
	"extension" text,
	"status" "agent_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "ai_kind" NOT NULL,
	"agent_id" uuid,
	"period_start" date,
	"period_end" date,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"input_hash" text NOT NULL,
	"output" jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_at" timestamp with time zone,
	"approved_by" uuid
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"before" jsonb,
	"after" jsonb,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "criteria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"section_id" uuid NOT NULL,
	"key" text NOT NULL,
	"sheet_column" text,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"yes_desc" text,
	"partial_desc" text,
	"no_desc" text,
	"marker_notes" text,
	"allow_partial" boolean DEFAULT true NOT NULL,
	"allow_na" boolean DEFAULT true NOT NULL,
	"penalty_no" double precision DEFAULT 0 NOT NULL,
	"penalty_partial" double precision DEFAULT 0 NOT NULL,
	"applicable_call_types" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evaluation_answers" (
	"evaluation_id" uuid NOT NULL,
	"criterion_id" uuid NOT NULL,
	"answer" "answer_value" NOT NULL,
	"note" text,
	"at_time" text,
	CONSTRAINT "evaluation_answers_evaluation_id_criterion_id_pk" PRIMARY KEY("evaluation_id","criterion_id")
);
--> statement-breakpoint
CREATE TABLE "evaluation_issues" (
	"evaluation_id" uuid NOT NULL,
	"issue_id" uuid NOT NULL,
	"note" text,
	CONSTRAINT "evaluation_issues_evaluation_id_issue_id_pk" PRIMARY KEY("evaluation_id","issue_id")
);
--> statement-breakpoint
CREATE TABLE "evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"reviewer_id" uuid NOT NULL,
	"status" "evaluation_status" DEFAULT 'draft' NOT NULL,
	"source" "evaluation_source" DEFAULT 'manual' NOT NULL,
	"call_type" "call_type" DEFAULT 'booking' NOT NULL,
	"call_at" timestamp with time zone,
	"call_week" date,
	"duration_sec" integer,
	"queue" text,
	"extension" text,
	"caller_masked" text,
	"caller_hash" text,
	"anonymous_caller" boolean DEFAULT false NOT NULL,
	"score" double precision,
	"raw_score" double precision,
	"band" "score_band",
	"applicable_count" integer,
	"points" double precision,
	"penalty" double precision,
	"section_scores" jsonb,
	"feedback" text,
	"strengths" text,
	"improvements" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	"amended_at" timestamp with time zone,
	"amended_by" uuid,
	"amend_reason" text,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "hihi_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"key" text NOT NULL,
	"short_name" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"ip" text,
	"success" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scorecard_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer NOT NULL,
	"name" text NOT NULL,
	"status" "scorecard_status" DEFAULT 'draft' NOT NULL,
	"settings" jsonb NOT NULL,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"short_name" text NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_agent" text,
	"ip" text
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"region" text DEFAULT 'West Midlands' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" DEFAULT 'qa' NOT NULL,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"must_change_password" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_summaries" ADD CONSTRAINT "ai_summaries_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_summaries" ADD CONSTRAINT "ai_summaries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_summaries" ADD CONSTRAINT "ai_summaries_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "criteria" ADD CONSTRAINT "criteria_version_id_scorecard_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."scorecard_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "criteria" ADD CONSTRAINT "criteria_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_answers" ADD CONSTRAINT "evaluation_answers_evaluation_id_evaluations_id_fk" FOREIGN KEY ("evaluation_id") REFERENCES "public"."evaluations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_answers" ADD CONSTRAINT "evaluation_answers_criterion_id_criteria_id_fk" FOREIGN KEY ("criterion_id") REFERENCES "public"."criteria"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_issues" ADD CONSTRAINT "evaluation_issues_evaluation_id_evaluations_id_fk" FOREIGN KEY ("evaluation_id") REFERENCES "public"."evaluations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_issues" ADD CONSTRAINT "evaluation_issues_issue_id_hihi_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."hihi_issues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_version_id_scorecard_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."scorecard_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_amended_by_users_id_fk" FOREIGN KEY ("amended_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hihi_issues" ADD CONSTRAINT "hihi_issues_version_id_scorecard_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."scorecard_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scorecard_versions" ADD CONSTRAINT "scorecard_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_version_id_scorecard_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."scorecard_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agents_site_idx" ON "agents" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "agents_name_idx" ON "agents" USING btree ("full_name");--> statement-breakpoint
CREATE INDEX "ai_summaries_lookup_idx" ON "ai_summaries" USING btree ("kind","agent_id","period_start");--> statement-breakpoint
CREATE INDEX "ai_summaries_hash_idx" ON "ai_summaries" USING btree ("input_hash");--> statement-breakpoint
CREATE INDEX "ai_summaries_creator_idx" ON "ai_summaries" USING btree ("created_by","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_created_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "criteria_version_key_uq" ON "criteria" USING btree ("version_id","key");--> statement-breakpoint
CREATE INDEX "criteria_section_idx" ON "criteria" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX "evaluations_agent_week_idx" ON "evaluations" USING btree ("agent_id","call_week");--> statement-breakpoint
CREATE INDEX "evaluations_reviewer_status_idx" ON "evaluations" USING btree ("reviewer_id","status");--> statement-breakpoint
CREATE INDEX "evaluations_week_idx" ON "evaluations" USING btree ("call_week");--> statement-breakpoint
CREATE INDEX "evaluations_status_idx" ON "evaluations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "evaluations_site_idx" ON "evaluations" USING btree ("site_id");--> statement-breakpoint
CREATE UNIQUE INDEX "hihi_version_key_uq" ON "hihi_issues" USING btree ("version_id","key");--> statement-breakpoint
CREATE INDEX "login_attempts_email_idx" ON "login_attempts" USING btree ("email","created_at");--> statement-breakpoint
CREATE INDEX "login_attempts_ip_idx" ON "login_attempts" USING btree ("ip","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "scorecard_versions_version_uq" ON "scorecard_versions" USING btree ("version");--> statement-breakpoint
CREATE UNIQUE INDEX "sections_version_key_uq" ON "sections" USING btree ("version_id","key");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sites_code_uq" ON "sites" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree ("email");