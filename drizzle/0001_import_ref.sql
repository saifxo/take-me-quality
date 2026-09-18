ALTER TABLE "evaluations" ADD COLUMN "import_ref" text;--> statement-breakpoint
CREATE INDEX "evaluations_import_ref_idx" ON "evaluations" USING btree ("import_ref");