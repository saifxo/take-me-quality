CREATE TABLE "reviewer_agent_assignments" (
	"reviewer_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviewer_agent_assignments_reviewer_id_agent_id_pk" PRIMARY KEY("reviewer_id","agent_id")
);
--> statement-breakpoint
CREATE TABLE "reviewer_site_assignments" (
	"reviewer_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviewer_site_assignments_reviewer_id_site_id_pk" PRIMARY KEY("reviewer_id","site_id")
);
--> statement-breakpoint
ALTER TABLE "reviewer_agent_assignments" ADD CONSTRAINT "reviewer_agent_assignments_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviewer_agent_assignments" ADD CONSTRAINT "reviewer_agent_assignments_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviewer_site_assignments" ADD CONSTRAINT "reviewer_site_assignments_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviewer_site_assignments" ADD CONSTRAINT "reviewer_site_assignments_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reviewer_agent_assignments_agent_idx" ON "reviewer_agent_assignments" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "reviewer_site_assignments_site_idx" ON "reviewer_site_assignments" USING btree ("site_id");