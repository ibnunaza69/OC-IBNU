CREATE TABLE "credentials_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" varchar(32) NOT NULL,
	"subject" varchar(128) NOT NULL,
	"is_valid" boolean DEFAULT false NOT NULL,
	"invalid_reason" text,
	"last_checked_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_name" varchar(128) NOT NULL,
	"job_key" varchar(255),
	"status" varchar(32) NOT NULL,
	"last_error" text,
	"payload" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operation_audits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operation_type" varchar(64) NOT NULL,
	"actor" varchar(128) NOT NULL,
	"target_type" varchar(64) NOT NULL,
	"target_id" varchar(255) NOT NULL,
	"status" varchar(32) NOT NULL,
	"reason" text,
	"before_state" jsonb,
	"after_state" jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_request_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"provider" varchar(32) NOT NULL,
	"endpoint" text NOT NULL,
	"method" varchar(16) NOT NULL,
	"status_code" integer,
	"object_type" varchar(64),
	"object_id" varchar(255),
	"payload" jsonb,
	"response_body" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_locks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" varchar(64) NOT NULL,
	"resource_key" varchar(255) NOT NULL,
	"locked_by" varchar(128) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "credentials_state_provider_subject_idx" ON "credentials_state" USING btree ("provider","subject");--> statement-breakpoint
CREATE INDEX "provider_request_logs_provider_idx" ON "provider_request_logs" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "provider_request_logs_request_id_idx" ON "provider_request_logs" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "sync_locks_scope_resource_idx" ON "sync_locks" USING btree ("scope","resource_key");