import { z } from 'zod';
import { AppError } from '../../lib/errors.js';
import type {
  MetaRuleDraftPayload,
  RuleDraftFilter,
  RuleDraftInput,
  RuleDraftScheduleWindow,
  RuleDraftSummary
} from './rule-draft.types.js';

const executionTypeValues = [
  'PAUSE',
  'UNPAUSE',
  'CHANGE_BUDGET',
  'CHANGE_CAMPAIGN_BUDGET',
  'REBALANCE_BUDGET',
  'NOTIFICATION',
  'PING_ENDPOINT'
] as const;

const ruleFilterSchema = z.object({
  field: z.string().trim().min(1),
  operator: z.string().trim().min(1),
  value: z.unknown()
});

const scheduleWindowSchema = z.object({
  days: z.array(z.coerce.number().int().min(0).max(6)).min(1),
  start_minute: z.coerce.number().int().min(0).max(1440),
  end_minute: z.coerce.number().int().min(0).max(1440)
}).superRefine((value, context) => {
  if (value.end_minute < value.start_minute) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'schedule window end_minute must be >= start_minute',
      path: ['end_minute']
    });
  }
});

const ruleDraftInputSchema = z.object({
  name: z.string().trim().min(3).max(255),
  status: z.enum(['ENABLED', 'DISABLED']).optional().default('DISABLED'),
  evaluationSpec: z.object({
    evaluationType: z.enum(['SCHEDULE', 'TRIGGER']),
    filters: z.array(ruleFilterSchema).min(1)
  }),
  executionSpec: z.object({
    executionType: z.enum(executionTypeValues),
    executionOptions: z.array(ruleFilterSchema).optional().default([])
  }),
  scheduleSpec: z.object({
    scheduleType: z.string().trim().min(1),
    schedule: z.array(scheduleWindowSchema).min(1)
  }).optional()
});

function sortFilterValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return [...value].map(sortFilterValue).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }

  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortFilterValue((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }

  return value;
}

function normalizeFilters(filters: RuleDraftFilter[]) {
  return [...filters]
    .map((filter) => ({
      field: filter.field.trim(),
      operator: filter.operator.trim().toUpperCase(),
      value: sortFilterValue(filter.value)
    }))
    .sort((left, right) => `${left.field}:${left.operator}`.localeCompare(`${right.field}:${right.operator}`));
}

function normalizeSchedule(schedule: RuleDraftScheduleWindow[]) {
  return [...schedule]
    .map((window) => ({
      days: [...new Set(window.days)].sort((left, right) => left - right),
      start_minute: window.start_minute,
      end_minute: window.end_minute
    }))
    .sort((left, right) => {
      if (left.start_minute !== right.start_minute) {
        return left.start_minute - right.start_minute;
      }

      return left.end_minute - right.end_minute;
    });
}

function findFilter(filters: RuleDraftFilter[], field: string) {
  return filters.find((filter) => filter.field === field) ?? null;
}

function extractTargetInfo(filters: RuleDraftFilter[]) {
  const targetFields = ['campaign.id', 'adset.id', 'ad.id'];

  for (const targetField of targetFields) {
    const targetFilter = findFilter(filters, targetField);
    if (!targetFilter) {
      continue;
    }

    const values = Array.isArray(targetFilter.value)
      ? targetFilter.value.filter((item): item is string => typeof item === 'string')
      : typeof targetFilter.value === 'string'
        ? [targetFilter.value]
        : [];

    return {
      targetField,
      targetCount: values.length,
      targetSample: values.slice(0, 5)
    };
  }

  return {
    targetField: null,
    targetCount: 0,
    targetSample: []
  };
}

function extractEntityType(filters: RuleDraftFilter[]) {
  const entityTypeFilter = findFilter(filters, 'entity_type');
  return typeof entityTypeFilter?.value === 'string' ? entityTypeFilter.value : null;
}

export class RuleDraftService {
  parseInput(input: unknown): RuleDraftInput {
    const parsed = ruleDraftInputSchema.safeParse(input);

    if (!parsed.success) {
      throw new AppError('Invalid rule draft input', 'VALIDATION_ERROR', 400, {
        issues: parsed.error.issues
      });
    }

    return parsed.data;
  }

  buildDraft(input: unknown) {
    const parsed = this.parseInput(input);
    const normalizedFilters = normalizeFilters(parsed.evaluationSpec.filters);
    const normalizedExecutionOptions = normalizeFilters(parsed.executionSpec.executionOptions);
    const normalizedSchedule = parsed.scheduleSpec ? normalizeSchedule(parsed.scheduleSpec.schedule) : undefined;

    const targetInfo = extractTargetInfo(normalizedFilters);
    const entityType = extractEntityType(normalizedFilters);
    const touchesBudget = ['CHANGE_BUDGET', 'CHANGE_CAMPAIGN_BUDGET', 'REBALANCE_BUDGET'].includes(parsed.executionSpec.executionType);
    const touchesDelivery = ['PAUSE', 'UNPAUSE'].includes(parsed.executionSpec.executionType);
    const massOperation = targetInfo.targetCount > 10;

    const normalizedDraft: MetaRuleDraftPayload = {
      name: parsed.name.trim(),
      status: parsed.status ?? 'DISABLED',
      evaluation_spec: {
        evaluation_type: parsed.evaluationSpec.evaluationType,
        filters: normalizedFilters
      },
      execution_spec: {
        execution_type: parsed.executionSpec.executionType,
        execution_options: normalizedExecutionOptions
      },
      ...(parsed.scheduleSpec
        ? {
            schedule_spec: {
              schedule_type: parsed.scheduleSpec.scheduleType.trim().toUpperCase(),
              schedule: normalizedSchedule ?? []
            }
          }
        : {})
    };

    const summary: RuleDraftSummary = {
      status: normalizedDraft.status,
      evaluationType: normalizedDraft.evaluation_spec.evaluation_type,
      executionType: normalizedDraft.execution_spec.execution_type,
      entityType,
      targetField: targetInfo.targetField,
      targetCount: targetInfo.targetCount,
      targetSample: targetInfo.targetSample,
      scheduleWindowCount: normalizedDraft.schedule_spec?.schedule.length ?? 0,
      touchesBudget,
      touchesDelivery,
      massOperation,
      explicitApprovalRecommended: touchesBudget || touchesDelivery || massOperation
    };

    return {
      input: parsed,
      normalizedDraft,
      summary
    };
  }
}
