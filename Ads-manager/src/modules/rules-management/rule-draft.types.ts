export interface RuleDraftFilter {
  field: string;
  operator: string;
  value: unknown;
}

export interface RuleDraftScheduleWindow {
  days: number[];
  start_minute: number;
  end_minute: number;
}

export interface RuleDraftEvaluationSpec {
  evaluationType: 'SCHEDULE' | 'TRIGGER';
  filters: RuleDraftFilter[];
}

export interface RuleDraftExecutionSpec {
  executionType:
    | 'PAUSE'
    | 'UNPAUSE'
    | 'CHANGE_BUDGET'
    | 'CHANGE_CAMPAIGN_BUDGET'
    | 'REBALANCE_BUDGET'
    | 'NOTIFICATION'
    | 'PING_ENDPOINT';
  executionOptions: RuleDraftFilter[];
}

export interface RuleDraftScheduleSpec {
  scheduleType: string;
  schedule: RuleDraftScheduleWindow[];
}

export interface RuleDraftInput {
  name: string;
  status?: 'ENABLED' | 'DISABLED' | undefined;
  evaluationSpec: RuleDraftEvaluationSpec;
  executionSpec: RuleDraftExecutionSpec;
  scheduleSpec?: RuleDraftScheduleSpec | undefined;
}

export interface MetaRuleDraftPayload {
  name: string;
  status: 'ENABLED' | 'DISABLED';
  evaluation_spec: {
    evaluation_type: 'SCHEDULE' | 'TRIGGER';
    filters: RuleDraftFilter[];
  };
  execution_spec: {
    execution_type: RuleDraftExecutionSpec['executionType'];
    execution_options: RuleDraftFilter[];
  };
  schedule_spec?: {
    schedule_type: string;
    schedule: RuleDraftScheduleWindow[];
  };
}

export interface RuleDraftSummary {
  status: 'ENABLED' | 'DISABLED';
  evaluationType: 'SCHEDULE' | 'TRIGGER';
  executionType: RuleDraftExecutionSpec['executionType'];
  entityType: string | null;
  targetField: string | null;
  targetCount: number;
  targetSample: string[];
  scheduleWindowCount: number;
  touchesBudget: boolean;
  touchesDelivery: boolean;
  massOperation: boolean;
  explicitApprovalRecommended: boolean;
}
