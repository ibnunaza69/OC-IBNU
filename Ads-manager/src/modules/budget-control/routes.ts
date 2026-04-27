import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { BudgetControlService } from './budget-control.service.js';

export async function registerBudgetControlRoutes(app: FastifyInstance) {
  const service = new BudgetControlService();

  const budgetControlSchema = z.object({
    targetType: z.enum(['campaign', 'adset']),
    targetId: z.string().min(1),
    mutationType: z.enum([
      'set_amount',
      'increase_amount',
      'decrease_amount',
      'increase_percent',
      'decrease_percent'
    ]),
    value: z.number().positive(),
    reason: z.string().min(5),
    dryRun: z.boolean().optional(),
    actor: z.string().optional(),
    secret: z.string().optional(),
    approvalId: z.string().optional(),
    approvalToken: z.string().optional()
  });

  const handler = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = budgetControlSchema.parse(request.body);
    const result = await service.adjustBudget(body);
    return result;
  };

  app.post('/api/budget-control/adjust', handler);
  app.patch('/api/budget-control/adjust', handler);
}
