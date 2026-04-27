import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AnalysisService } from './analysis.service.js';
import { PerformanceAnalysisService } from './performance-analysis.service.js';
import { RecommendationService } from './recommendation.service.js';

const hierarchyQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(25).describe('Maximum number of items to return')
});

const performersQuerySchema = z.object({
  level: z.enum(['campaign', 'adset', 'ad']).default('campaign'),
  metric: z
    .enum(['spend', 'impressions', 'reach', 'clicks', 'ctr', 'cpc', 'resultCount', 'costPerResult'])
    .default('spend'),
  direction: z.enum(['top', 'bottom']).default('top'),
  limit: z.coerce.number().int().positive().max(50).default(5)
});

const recommendationsQuerySchema = z.object({
  level: z.enum(['campaign', 'adset', 'ad']).default('campaign')
});

const timeWindowSchema = z.union([
  z.object({ datePreset: z.string().min(1) }),
  z.object({
    since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'since must be YYYY-MM-DD'),
    until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'until must be YYYY-MM-DD')
  })
]);

const comparePeriodsBodySchema = z.object({
  objectId: z.string().min(1),
  currency: z.string().min(3).max(8).nullable().optional(),
  windowA: timeWindowSchema,
  windowB: timeWindowSchema
});

export async function registerAnalysisRoutes(app: FastifyInstance) {
  const analysisService = new AnalysisService();
  const performanceService = new PerformanceAnalysisService();
  const recommendationService = new RecommendationService();

  app.get('/internal/analysis/overview', async () => {
    return analysisService.getOverview();
  });

  app.get('/internal/analysis/hierarchy', async (request) => {
    const query = hierarchyQuerySchema.parse(request.query);
    return analysisService.getCampaignHierarchy(undefined, query.limit);
  });

  app.get('/internal/analysis/performers', async (request) => {
    const query = performersQuerySchema.parse(request.query);
    return performanceService.getPerformers(query);
  });

  app.get('/internal/analysis/recommendations', async (request) => {
    const query = recommendationsQuerySchema.parse(request.query);
    return recommendationService.getRecommendations(query);
  });

  app.post('/internal/analysis/compare-periods', async (request) => {
    const body = comparePeriodsBodySchema.parse(request.body);
    return performanceService.comparePeriods(body);
  });
}
