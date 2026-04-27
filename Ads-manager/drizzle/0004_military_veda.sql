CREATE TABLE "meta_rule_history_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"history_key" varchar(128) NOT NULL,
	"account_id" varchar(64) NOT NULL,
	"rule_id" varchar(64),
	"provider_entry_id" varchar(64),
	"evaluation_spec" jsonb,
	"execution_spec" jsonb,
	"schedule_spec" jsonb,
	"provider_created_time" timestamp with time zone,
	"provider_updated_time" timestamp with time zone,
	"raw_payload" jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meta_rule_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_id" varchar(64) NOT NULL,
	"account_id" varchar(64) NOT NULL,
	"name" text,
	"status" varchar(64),
	"evaluation_spec" jsonb,
	"execution_spec" jsonb,
	"schedule_spec" jsonb,
	"provider_created_time" timestamp with time zone,
	"provider_updated_time" timestamp with time zone,
	"raw_payload" jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "meta_rule_history_snapshots_history_key_idx" ON "meta_rule_history_snapshots" USING btree ("history_key");--> statement-breakpoint
CREATE INDEX "meta_rule_history_snapshots_account_idx" ON "meta_rule_history_snapshots" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "meta_rule_history_snapshots_rule_idx" ON "meta_rule_history_snapshots" USING btree ("rule_id");--> statement-breakpoint
CREATE INDEX "meta_rule_history_snapshots_provider_entry_idx" ON "meta_rule_history_snapshots" USING btree ("provider_entry_id");--> statement-breakpoint
CREATE INDEX "meta_rule_snapshots_rule_idx" ON "meta_rule_snapshots" USING btree ("rule_id");--> statement-breakpoint
CREATE INDEX "meta_rule_snapshots_account_idx" ON "meta_rule_snapshots" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "meta_rule_snapshots_status_idx" ON "meta_rule_snapshots" USING btree ("status");