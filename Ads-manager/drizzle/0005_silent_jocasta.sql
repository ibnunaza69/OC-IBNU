CREATE TABLE "asset_generation_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_type" varchar(16) NOT NULL,
	"task_type" varchar(32) NOT NULL,
	"provider" varchar(32) NOT NULL,
	"provider_task_id" varchar(128),
	"status" varchar(32) NOT NULL,
	"actor" varchar(128) NOT NULL,
	"reason" text,
	"source_asset_id" uuid,
	"callback_url" text,
	"input_payload" jsonb,
	"normalized_input" jsonb,
	"provider_response" jsonb,
	"output_payload" jsonb,
	"error_code" varchar(64),
	"error_message" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "asset_library" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_type" varchar(16) NOT NULL,
	"provider" varchar(32) NOT NULL,
	"status" varchar(32) NOT NULL,
	"source_task_id" uuid,
	"provider_asset_id" varchar(128),
	"title" text,
	"mime_type" varchar(128),
	"original_url" text,
	"thumbnail_url" text,
	"width" integer,
	"height" integer,
	"duration_seconds" integer,
	"prompt_version" varchar(128),
	"metadata" jsonb,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "asset_generation_tasks_asset_type_idx" ON "asset_generation_tasks" USING btree ("asset_type");--> statement-breakpoint
CREATE INDEX "asset_generation_tasks_task_type_idx" ON "asset_generation_tasks" USING btree ("task_type");--> statement-breakpoint
CREATE INDEX "asset_generation_tasks_provider_idx" ON "asset_generation_tasks" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "asset_generation_tasks_provider_task_id_idx" ON "asset_generation_tasks" USING btree ("provider_task_id");--> statement-breakpoint
CREATE INDEX "asset_generation_tasks_status_idx" ON "asset_generation_tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "asset_library_asset_type_idx" ON "asset_library" USING btree ("asset_type");--> statement-breakpoint
CREATE INDEX "asset_library_provider_idx" ON "asset_library" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "asset_library_source_task_idx" ON "asset_library" USING btree ("source_task_id");--> statement-breakpoint
CREATE INDEX "asset_library_status_idx" ON "asset_library" USING btree ("status");