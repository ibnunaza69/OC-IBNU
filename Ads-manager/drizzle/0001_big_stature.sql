CREATE TABLE "meta_ad_account_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" varchar(64) NOT NULL,
	"name" text,
	"account_status" integer,
	"currency" varchar(16),
	"raw_payload" jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meta_campaign_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" varchar(64) NOT NULL,
	"account_id" varchar(64) NOT NULL,
	"name" text,
	"objective" varchar(64),
	"status" varchar(64),
	"effective_status" varchar(64),
	"buying_type" varchar(64),
	"daily_budget" varchar(64),
	"lifetime_budget" varchar(64),
	"start_time" timestamp with time zone,
	"stop_time" timestamp with time zone,
	"provider_updated_time" timestamp with time zone,
	"raw_payload" jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "meta_ad_account_snapshots_account_idx" ON "meta_ad_account_snapshots" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "meta_campaign_snapshots_campaign_idx" ON "meta_campaign_snapshots" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "meta_campaign_snapshots_account_idx" ON "meta_campaign_snapshots" USING btree ("account_id");