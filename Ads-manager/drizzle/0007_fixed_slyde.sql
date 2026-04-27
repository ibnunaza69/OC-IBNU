DROP INDEX "meta_ad_account_snapshots_account_idx";--> statement-breakpoint
DROP INDEX "meta_adset_snapshots_adset_idx";--> statement-breakpoint
DROP INDEX "meta_ad_snapshots_ad_idx";--> statement-breakpoint
DROP INDEX "meta_campaign_snapshots_campaign_idx";--> statement-breakpoint
DROP INDEX "meta_rule_history_snapshots_history_key_idx";--> statement-breakpoint
DROP INDEX "meta_rule_snapshots_rule_idx";--> statement-breakpoint
ALTER TABLE "meta_ad_account_snapshots" ADD CONSTRAINT "meta_ad_account_snapshots_account_id_unique" UNIQUE("account_id");--> statement-breakpoint
ALTER TABLE "meta_adset_snapshots" ADD CONSTRAINT "meta_adset_snapshots_adset_id_unique" UNIQUE("adset_id");--> statement-breakpoint
ALTER TABLE "meta_ad_snapshots" ADD CONSTRAINT "meta_ad_snapshots_ad_id_unique" UNIQUE("ad_id");--> statement-breakpoint
ALTER TABLE "meta_campaign_snapshots" ADD CONSTRAINT "meta_campaign_snapshots_campaign_id_unique" UNIQUE("campaign_id");--> statement-breakpoint
ALTER TABLE "meta_rule_history_snapshots" ADD CONSTRAINT "meta_rule_history_snapshots_history_key_unique" UNIQUE("history_key");--> statement-breakpoint
ALTER TABLE "meta_rule_snapshots" ADD CONSTRAINT "meta_rule_snapshots_rule_id_unique" UNIQUE("rule_id");