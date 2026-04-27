export interface MetaRequestContext {
  objectType?: string;
  objectId?: string;
}

export interface MetaApiErrorShape {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
  };
}

export interface MetaAdAccountBasic {
  id: string;
  account_id?: string;
  name?: string;
  account_status?: number;
  currency?: string;
}

export interface MetaInsightActionValue {
  action_type?: string;
  value?: string;
}

export interface MetaInsightsSummary {
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  ctr?: string;
  cpc?: string;
  actions?: MetaInsightActionValue[];
  cost_per_action_type?: MetaInsightActionValue[];
  date_start?: string;
  date_stop?: string;
}

export interface MetaInsightsEdge {
  data?: MetaInsightsSummary[];
}

export interface MetaCampaignSummary {
  id: string;
  name?: string;
  objective?: string;
  status?: string;
  effective_status?: string;
  buying_type?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  start_time?: string;
  stop_time?: string;
  updated_time?: string;
  insights?: MetaInsightsEdge;
}

export interface MetaAdSetSummary {
  id: string;
  campaign_id?: string;
  name?: string;
  status?: string;
  effective_status?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  billing_event?: string;
  optimization_goal?: string;
  bid_strategy?: string;
  start_time?: string;
  end_time?: string;
  updated_time?: string;
  insights?: MetaInsightsEdge;
}

export interface MetaAdCreativeSummary {
  id?: string;
  name?: string;
}

export interface MetaAdCreativeDetail {
  id?: string;
  name?: string;
  object_type?: string;
  image_url?: string;
  thumbnail_url?: string;
  object_story_spec?: Record<string, unknown>;
}

export interface MetaPageSummary {
  id: string;
  name?: string;
  link?: string;
  category?: string;
  verification_status?: string;
  can_post?: boolean;
  is_published?: boolean;
}

export interface MetaAdVideoUploadResponse {
  upload_session_id?: string;
  video_id?: string;
  start_offset?: string;
  end_offset?: string;
  success?: boolean;
}

export interface MetaVideoDetail {
  id?: string;
  source?: string;
  picture?: string;
  length?: number;
  title?: string;
  status?: {
    video_status?: string;
    processing_phase?: string;
    processing_progress?: number;
    publishing_phase?: string;
  };
}

export interface MetaAdSummary {
  id: string;
  campaign_id?: string;
  adset_id?: string;
  name?: string;
  status?: string;
  effective_status?: string;
  creative?: MetaAdCreativeSummary;
  updated_time?: string;
  insights?: MetaInsightsEdge;
}

export interface MetaAudienceSummary {
  id: string;
  name?: string;
  subtype?: string;
  description?: string;
  approximate_count?: number | string;
  retention_days?: number;
  time_created?: string;
  time_updated?: string;
  operation_status?: Record<string, unknown>;
  delivery_status?: Record<string, unknown>;
  lookalike_spec?: Record<string, unknown>;
  rule?: string;
}

export interface MetaAdRuleSummary {
  id: string;
  name?: string;
  status?: string;
  evaluation_spec?: Record<string, unknown>;
  execution_spec?: Record<string, unknown>;
  schedule_spec?: Record<string, unknown>;
  created_time?: string;
  updated_time?: string;
}

export interface MetaAdRuleHistoryEntry {
  id?: string;
  rule_id?: string;
  ad_rule_id?: string;
  created_time?: string;
  updated_time?: string;
  evaluation_spec?: Record<string, unknown>;
  execution_spec?: Record<string, unknown>;
  schedule_spec?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface MetaPagingCursor {
  before?: string;
  after?: string;
}

export interface MetaPaging {
  cursors?: MetaPagingCursor;
  next?: string;
}

export interface MetaListResponse<T> {
  data: T[];
  paging?: MetaPaging;
}

export interface MetaWriteResult {
  success?: boolean;
  id?: string;
}

export interface MetaCopyResult extends MetaWriteResult {
  [key: string]: unknown;
}

export interface MetaRuleWriteResult extends MetaWriteResult {
  rule_id?: string;
}
