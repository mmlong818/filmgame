CREATE TABLE "nodes" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"act_id" text NOT NULL,
	"sort_order" integer NOT NULL,
	"type" text NOT NULL,
	"position" jsonb NOT NULL,
	"data" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"current_phase" text NOT NULL,
	"selected_scale_plan_id" text,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"downstream_stale" boolean DEFAULT false NOT NULL,
	"phase_progress" jsonb NOT NULL,
	"world_anchor" jsonb,
	"characters" jsonb NOT NULL,
	"scale_plan_options" jsonb NOT NULL,
	"chapters" jsonb NOT NULL,
	"acts" jsonb NOT NULL,
	"variables" jsonb NOT NULL,
	"endings" jsonb NOT NULL,
	"last_validation" jsonb,
	"director_review" jsonb
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"model" text,
	"base_url" text,
	"api_key_enc" text,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "nodes" ADD CONSTRAINT "nodes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_nodes_project" ON "nodes" USING btree ("project_id","sort_order");