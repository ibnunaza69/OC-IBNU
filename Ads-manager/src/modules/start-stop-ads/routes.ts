import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { StartStopService } from './start-stop.service.js';

export async function registerStartStopAdsRoutes(app: FastifyInstance) {
  const service = new StartStopService();

  const startStopSchema = z.object({
    targetType: z.enum(['campaign', 'adset', 'ad']),
    targetId: z.string().min(1),
    action: z.enum(['START', 'STOP']),
    actor: z.string().optional(),
    reason: z.string().min(5)
  });

  const handler = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = startStopSchema.parse(request.body);
    const result = await service.changeStatus(body);
    return result;
  };

  app.post('/api/start-stop-ads/change-status', handler);
  app.patch('/api/start-stop-ads/change-status', handler);
}
