CREATE TABLE "copy_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variant_id" uuid,
	"actor" varchar(128) NOT NULL,
	"review_mode" varchar(16) NOT NULL,
	"review_input" jsonb,
	"overall_score" integer NOT NULL,
	"rubric" jsonb NOT NULL,
	"summary" text NOT NULL,
	"strengths" jsonb NOT NULL,
	"risks" jsonb NOT NULL,
	"suggestions" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "copy_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lineage_key" varchar(128) NOT NULL,
	"batch_id" uuid NOT NULL,
	"parent_variant_id" uuid,
	"version_number" integer NOT NULL,
	"source_type" varchar(32) NOT NULL,
	"style" varchar(64) NOT NULL,
	"actor" varchar(128) NOT NULL,
	"reason" text,
	"brief" text NOT NULL,
	"product_name" text,
	"target_audience" text,
	"desired_outcome" text,
	"campaign_id" varchar(64),
	"adset_id" varchar(64),
	"ad_id" varchar(64),
	"context_summary" jsonb,
	"tone_keywords" jsonb,
	"call_to_action_type" varchar(64),
	"primary_text" text NOT NULL,
	"headline" text NOT NULL,
	"description" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "copy_reviews_variant_idx" ON "copy_reviews" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "copy_reviews_review_mode_idx" ON "copy_reviews" USING btree ("review_mode");--> statement-breakpoint
CREATE INDEX "copy_variants_lineage_idx" ON "copy_variants" USING btree ("lineage_key");--> statement-breakpoint
CREATE INDEX "copy_variants_batch_idx" ON "copy_variants" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "copy_variants_campaign_idx" ON "copy_variants" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "copy_variants_adset_idx" ON "copy_variants" USING btree ("adset_id");--> statement-breakpoint
CREATE INDEX "copy_variants_ad_idx" ON "copy_variants" USING btree ("ad_id");