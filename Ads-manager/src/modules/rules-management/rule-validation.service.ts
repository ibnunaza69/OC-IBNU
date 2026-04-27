import { RuleDraftService } from './rule-draft.service.js';

export class RuleValidationService {
  private readonly draftService = new RuleDraftService();

  validateDraft(input: unknown) {
    const { normalizedDraft, summary } = this.draftService.buildDraft(input);
    const warnings: string[] = [];

    const hasTimePresetFilter = normalizedDraft.evaluation_spec.filters.some((filter) => filter.field === 'time_preset');
    const hasEntityTypeFilter = normalizedDraft.evaluation_spec.filters.some((filter) => filter.field === 'entity_type');

    if (summary.evaluationType === 'SCHEDULE' && !normalizedDraft.schedule_spec) {
      warnings.push('SCHEDULE evaluation should include schedule_spec before submit.');
    }

    if (summary.evaluationType === 'TRIGGER' && normalizedDraft.schedule_spec) {
      warnings.push('TRIGGER evaluation usually does not need schedule_spec; keep it only if explicitly required.');
    }

    if (!hasEntityTypeFilter) {
      warnings.push('entity_type filter is missing; target scope may be ambiguous.');
    }

    if (summary.evaluationType === 'SCHEDULE' && !hasTimePresetFilter) {
      warnings.push('time_preset filter is missing; many schedule-based rules use MAXIMUM for clearer evaluation scope.');
    }

    if (summary.targetCount === 0) {
      warnings.push('No explicit campaign/adset/ad target list was detected in evaluation filters.');
    }

    if (summary.massOperation) {
      warnings.push('Draft targets more than 10 entities; treat as mass operation and require explicit review.');
    }

    if (summary.touchesBudget) {
      warnings.push('This rule can affect budget and should require explicit owner review before enable/write.');
    }

    if (summary.touchesDelivery) {
      warnings.push('This rule can affect delivery state and should be reviewed before enable/write.');
    }

    if (normalizedDraft.status === 'ENABLED' && summary.explicitApprovalRecommended) {
      warnings.push('Draft is ENABLED while impact is non-trivial; consider submitting as DISABLED first for controlled rollout.');
    }

    return {
      ok: true,
      valid: true,
      normalizedDraft,
      summary,
      warnings
    };
  }
}
