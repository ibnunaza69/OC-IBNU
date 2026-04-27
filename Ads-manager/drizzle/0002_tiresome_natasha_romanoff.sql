CREATE TABLE "meta_adset_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"adset_id" varchar(64) NOT NULL,
	"account_id" varchar(64) NOT NULL,
	"campaign_id" varchar(64),
	"name" text,
	"status" varchar(64),
	"effective_status" varchar(64),
	"daily_budget" varchar(64),
	"lifetime_budget" varchar(64),
	"billing_event" varchar(64),
	"optimization_goal" varchar(64),
	"bid_strategy" varchar(64),
	"start_time" timestamp with time zone,
	"end_time" timestamp with time zone,
	"provider_updated_time" timestamp with time zone,
	"raw_payload" jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meta_ad_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ad_id" varchar(64) NOT NULL,
	"account_id" varchar(64) NOT NULL,
	"campaign_id" varchar(64),
	"adset_id" varchar(64),
	"name" text,
	"status" varchar(64),
	"effective_status" varchar(64),
	"creative_id" varchar(64),
	"creative_name" text,
	"provider_updated_time" timestamp with time zone,
	"raw_payload" jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "meta_adset_snapshots_adset_idx" ON "meta_adset_snapshots" USING btree ("adset_id");--> statement-breakpoint
CREATE INDEX "meta_adset_snapshots_account_idx" ON "meta_adset_snapshots" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "meta_adset_snapshots_campaign_idx" ON "meta_adset_snapshots" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "meta_ad_snapshots_ad_idx" ON "meta_ad_snapshots" USING btree ("ad_id");--> statement-breakpoint
CREATE INDEX "meta_ad_snapshots_account_idx" ON "meta_ad_snapshots" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "meta_ad_snapshots_campaign_idx" ON "meta_ad_snapshots" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "meta_ad_snapshots_adset_idx" ON "meta_ad_snapshots" USING btree ("adset_id");