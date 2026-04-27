CREATE TABLE "write_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operation_type" varchar(64) NOT NULL,
	"target_type" varchar(64) NOT NULL,
	"target_id" varchar(255) NOT NULL,
	"actor" varchar(128) NOT NULL,
	"reason" text NOT NULL,
	"request_fingerprint" varchar(128) NOT NULL,
	"approval_token_hash" varchar(128) NOT NULL,
	"status" varchar(32) NOT NULL,
	"payload" jsonb,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "write_approvals_operation_idx" ON "write_approvals" USING btree ("operation_type");--> statement-breakpoint
CREATE INDEX "write_approvals_target_idx" ON "write_approvals" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "write_approvals_status_idx" ON "write_approvals" USING btree ("status");