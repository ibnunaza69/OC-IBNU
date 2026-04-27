import { boolean, index, integer, jsonb, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const systemSettings = pgTable('system_settings', {
  id: uuid('id').defaultRandom().primaryKey(),
  key: varchar('key', { length: 128 }).notNull().unique(),
  value: text('value'),
  description: text('description'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const credentialsState = pgTable('credentials_state', {
  id: uuid('id').defaultRandom().primaryKey(),
  provider: varchar('provider', { length: 32 }).notNull(),
  subject: varchar('subject', { length: 128 }).notNull(),
  isValid: boolean('is_valid').notNull().default(false),
  invalidReason: text('invalid_reason'),
  lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  providerSubjectIdx: index('credentials_state_provider_subject_idx').on(table.provider, table.subject)
}));

export const operationAudits = pgTable('operation_audits', {
  id: uuid('id').defaultRandom().primaryKey(),
  operationType: varchar('operation_type', { length: 64 }).notNull(),
  actor: varchar('actor', { length: 128 }).notNull(),
  targetType: varchar('target_type', { length: 64 }).notNull(),
  targetId: varchar('target_id', { length: 255 }).notNull(),
  status: varchar('status', { length: 32 }).notNull(),
  reason: text('reason'),
  beforeState: jsonb('before_state'),
  afterState: jsonb('after_state'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const providerRequestLogs = pgTable('provider_request_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  requestId: uuid('request_id').notNull(),
  provider: varchar('provider', { length: 32 }).notNull(),
  endpoint: text('endpoint').notNull(),
  method: varchar('method', { length: 16 }).notNull(),
  statusCode: integer('status_code'),
  objectType: varchar('object_type', { length: 64 }),
  objectId: varchar('object_id', { length: 255 }),
  payload: jsonb('payload'),
  responseBody: jsonb('response_body'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  providerIdx: index('provider_request_logs_provider_idx').on(table.provider),
  requestIdx: index('provider_request_logs_request_id_idx').on(table.requestId)
}));

export const jobsState = pgTable('jobs_state', {
  id: uuid('id').defaultRandom().primaryKey(),
  jobName: varchar('job_name', { length: 128 }).notNull(),
  jobKey: varchar('job_key', { length: 255 }),
  status: varchar('status', { length: 32 }).notNull(),
  lastError: text('last_error'),
  payload: jsonb('payload'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const writeApprovals = pgTable('write_approvals', {
  id: uuid('id').defaultRandom().primaryKey(),
  operationType: varchar('operation_type', { length: 64 }).notNull(),
  targetType: varchar('target_type', { length: 64 }).notNull(),
  targetId: varchar('target_id', { length: 255 }).notNull(),
  actor: varchar('actor', { length: 128 }).notNull(),
  reason: text('reason').notNull(),
  requestFingerprint: varchar('request_fingerprint', { length: 128 }).notNull(),
  approvalTokenHash: varchar('approval_token_hash', { length: 128 }).notNull(),
  status: varchar('status', { length: 32 }).notNull(),
  payload: jsonb('payload'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  operationIdx: index('write_approvals_operation_idx').on(table.operationType),
  targetIdx: index('write_approvals_target_idx').on(table.targetType, table.targetId),
  statusIdx: index('write_approvals_status_idx').on(table.status)
}));

export const syncLocks = pgTable('sync_locks', {
  id: uuid('id').defaultRandom().primaryKey(),
  scope: varchar('scope', { length: 64 }).notNull(),
  resourceKey: varchar('resource_key', { length: 255 }).notNull(),
  lockedBy: varchar('locked_by', { length: 128 }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  scopeResourceIdx: index('sync_locks_scope_resource_idx').on(table.scope, table.resourceKey)
}));

export const metaAdAccountSnapshots = pgTable('meta_ad_account_snapshots', {
  id: uuid('id').defaultRandom().primaryKey(),
  accountId: varchar('account_id', { length: 64 }).notNull().unique(),
  name: text('name'),
  accountStatus: integer('account_status'),
  currency: varchar('currency', { length: 16 }),
  rawPayload: jsonb('raw_payload').notNull(),
  syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const metaCampaignSnapshots = pgTable('meta_campaign_snapshots', {
  id: uuid('id').defaultRandom().primaryKey(),
  campaignId: varchar('campaign_id', { length: 64 }).notNull().unique(),
  accountId: varchar('account_id', { length: 64 }).notNull(),
  name: text('name'),
  objective: varchar('objective', { length: 64 }),
  status: varchar('status', { length: 64 }),
  effectiveStatus: varchar('effective_status', { length: 64 }),
  buyingType: varchar('buying_type', { length: 64 }),
  dailyBudget: varchar('daily_budget', { length: 64 }),
  lifetimeBudget: varchar('lifetime_budget', { length: 64 }),
  startTime: timestamp('start_time', { withTimezone: true }),
  stopTime: timestamp('stop_time', { withTimezone: true }),
  providerUpdatedTime: timestamp('provider_updated_time', { withTimezone: true }),
  rawPayload: jsonb('raw_payload').notNull(),
  syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  accountIdx: index('meta_campaign_snapshots_account_idx').on(table.accountId)
}));

export const metaAdSetSnapshots = pgTable('meta_adset_snapshots', {
  id: uuid('id').defaultRandom().primaryKey(),
  adSetId: varchar('adset_id', { length: 64 }).notNull().unique(),
  accountId: varchar('account_id', { length: 64 }).notNull(),
  campaignId: varchar('campaign_id', { length: 64 }),
  name: text('name'),
  status: varchar('status', { length: 64 }),
  effectiveStatus: varchar('effective_status', { length: 64 }),
  dailyBudget: varchar('daily_budget', { length: 64 }),
  lifetimeBudget: varchar('lifetime_budget', { length: 64 }),
  billingEvent: varchar('billing_event', { length: 64 }),
  optimizationGoal: varchar('optimization_goal', { length: 64 }),
  bidStrategy: varchar('bid_strategy', { length: 64 }),
  startTime: timestamp('start_time', { withTimezone: true }),
  endTime: timestamp('end_time', { withTimezone: true }),
  providerUpdatedTime: timestamp('provider_updated_time', { withTimezone: true }),
  rawPayload: jsonb('raw_payload').notNull(),
  syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  accountIdx: index('meta_adset_snapshots_account_idx').on(table.accountId),
  campaignIdx: index('meta_adset_snapshots_campaign_idx').on(table.campaignId)
}));

export const metaAdSnapshots = pgTable('meta_ad_snapshots', {
  id: uuid('id').defaultRandom().primaryKey(),
  adId: varchar('ad_id', { length: 64 }).notNull().unique(),
  accountId: varchar('account_id', { length: 64 }).notNull(),
  campaignId: varchar('campaign_id', { length: 64 }),
  adSetId: varchar('adset_id', { length: 64 }),
  name: text('name'),
  status: varchar('status', { length: 64 }),
  effectiveStatus: varchar('effective_status', { length: 64 }),
  creativeId: varchar('creative_id', { length: 64 }),
  creativeName: text('creative_name'),
  providerUpdatedTime: timestamp('provider_updated_time', { withTimezone: true }),
  rawPayload: jsonb('raw_payload').notNull(),
  syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  accountIdx: index('meta_ad_snapshots_account_idx').on(table.accountId),
  campaignIdx: index('meta_ad_snapshots_campaign_idx').on(table.campaignId),
  adSetIdx: index('meta_ad_snapshots_adset_idx').on(table.adSetId)
}));

export const metaRuleSnapshots = pgTable('meta_rule_snapshots', {
  id: uuid('id').defaultRandom().primaryKey(),
  ruleId: varchar('rule_id', { length: 64 }).notNull().unique(),
  accountId: varchar('account_id', { length: 64 }).notNull(),
  name: text('name'),
  status: varchar('status', { length: 64 }),
  evaluationSpec: jsonb('evaluation_spec'),
  executionSpec: jsonb('execution_spec'),
  scheduleSpec: jsonb('schedule_spec'),
  providerCreatedTime: timestamp('provider_created_time', { withTimezone: true }),
  providerUpdatedTime: timestamp('provider_updated_time', { withTimezone: true }),
  rawPayload: jsonb('raw_payload').notNull(),
  syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  accountIdx: index('meta_rule_snapshots_account_idx').on(table.accountId),
  statusIdx: index('meta_rule_snapshots_status_idx').on(table.status)
}));

export const metaRuleHistorySnapshots = pgTable('meta_rule_history_snapshots', {
  id: uuid('id').defaultRandom().primaryKey(),
  historyKey: varchar('history_key', { length: 128 }).notNull().unique(),
  accountId: varchar('account_id', { length: 64 }).notNull(),
  ruleId: varchar('rule_id', { length: 64 }),
  providerEntryId: varchar('provider_entry_id', { length: 64 }),
  evaluationSpec: jsonb('evaluation_spec'),
  executionSpec: jsonb('execution_spec'),
  scheduleSpec: jsonb('schedule_spec'),
  providerCreatedTime: timestamp('provider_created_time', { withTimezone: true }),
  providerUpdatedTime: timestamp('provider_updated_time', { withTimezone: true }),
  rawPayload: jsonb('raw_payload').notNull(),
  syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  accountIdx: index('meta_rule_history_snapshots_account_idx').on(table.accountId),
  ruleIdx: index('meta_rule_history_snapshots_rule_idx').on(table.ruleId),
  providerEntryIdx: index('meta_rule_history_snapshots_provider_entry_idx').on(table.providerEntryId)
}));

export const assetGenerationTasks = pgTable('asset_generation_tasks', {
  id: uuid('id').defaultRandom().primaryKey(),
  assetType: varchar('asset_type', { length: 16 }).notNull(),
  taskType: varchar('task_type', { length: 32 }).notNull(),
  provider: varchar('provider', { length: 32 }).notNull(),
  providerTaskId: varchar('provider_task_id', { length: 128 }),
  status: varchar('status', { length: 32 }).notNull(),
  actor: varchar('actor', { length: 128 }).notNull(),
  reason: text('reason'),
  sourceAssetId: uuid('source_asset_id'),
  callbackUrl: text('callback_url'),
  inputPayload: jsonb('input_payload'),
  normalizedInput: jsonb('normalized_input'),
  providerResponse: jsonb('provider_response'),
  outputPayload: jsonb('output_payload'),
  errorCode: varchar('error_code', { length: 64 }),
  errorMessage: text('error_message'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  assetTypeIdx: index('asset_generation_tasks_asset_type_idx').on(table.assetType),
  taskTypeIdx: index('asset_generation_tasks_task_type_idx').on(table.taskType),
  providerIdx: index('asset_generation_tasks_provider_idx').on(table.provider),
  providerTaskIdx: index('asset_generation_tasks_provider_task_id_idx').on(table.providerTaskId),
  statusIdx: index('asset_generation_tasks_status_idx').on(table.status)
}));

export const assetLibrary = pgTable('asset_library', {
  id: uuid('id').defaultRandom().primaryKey(),
  assetType: varchar('asset_type', { length: 16 }).notNull(),
  provider: varchar('provider', { length: 32 }).notNull(),
  status: varchar('status', { length: 32 }).notNull(),
  sourceTaskId: uuid('source_task_id'),
  providerAssetId: varchar('provider_asset_id', { length: 128 }),
  title: text('title'),
  mimeType: varchar('mime_type', { length: 128 }),
  originalUrl: text('original_url'),
  thumbnailUrl: text('thumbnail_url'),
  width: integer('width'),
  height: integer('height'),
  durationSeconds: integer('duration_seconds'),
  promptVersion: varchar('prompt_version', { length: 128 }),
  metadata: jsonb('metadata'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  assetTypeIdx: index('asset_library_asset_type_idx').on(table.assetType),
  providerIdx: index('asset_library_provider_idx').on(table.provider),
  sourceTaskIdx: index('asset_library_source_task_idx').on(table.sourceTaskId),
  statusIdx: index('asset_library_status_idx').on(table.status)
}));

export const copyVariants = pgTable('copy_variants', {
  id: uuid('id').defaultRandom().primaryKey(),
  lineageKey: varchar('lineage_key', { length: 128 }).notNull(),
  batchId: uuid('batch_id').notNull(),
  parentVariantId: uuid('parent_variant_id'),
  versionNumber: integer('version_number').notNull(),
  sourceType: varchar('source_type', { length: 32 }).notNull(),
  style: varchar('style', { length: 64 }).notNull(),
  actor: varchar('actor', { length: 128 }).notNull(),
  reason: text('reason'),
  brief: text('brief').notNull(),
  productName: text('product_name'),
  targetAudience: text('target_audience'),
  desiredOutcome: text('desired_outcome'),
  campaignId: varchar('campaign_id', { length: 64 }),
  adSetId: varchar('adset_id', { length: 64 }),
  adId: varchar('ad_id', { length: 64 }),
  contextSummary: jsonb('context_summary'),
  toneKeywords: jsonb('tone_keywords'),
  callToActionType: varchar('call_to_action_type', { length: 64 }),
  primaryText: text('primary_text').notNull(),
  headline: text('headline').notNull(),
  description: text('description'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  lineageIdx: index('copy_variants_lineage_idx').on(table.lineageKey),
  batchIdx: index('copy_variants_batch_idx').on(table.batchId),
  campaignIdx: index('copy_variants_campaign_idx').on(table.campaignId),
  adSetIdx: index('copy_variants_adset_idx').on(table.adSetId),
  adIdx: index('copy_variants_ad_idx').on(table.adId)
}));

export const copyReviews = pgTable('copy_reviews', {
  id: uuid('id').defaultRandom().primaryKey(),
  variantId: uuid('variant_id'),
  actor: varchar('actor', { length: 128 }).notNull(),
  reviewMode: varchar('review_mode', { length: 16 }).notNull(),
  reviewInput: jsonb('review_input'),
  overallScore: integer('overall_score').notNull(),
  rubric: jsonb('rubric').notNull(),
  summary: text('summary').notNull(),
  strengths: jsonb('strengths').notNull(),
  risks: jsonb('risks').notNull(),
  suggestions: jsonb('suggestions').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  variantIdx: index('copy_reviews_variant_idx').on(table.variantId),
  reviewModeIdx: index('copy_reviews_review_mode_idx').on(table.reviewMode)
}));
