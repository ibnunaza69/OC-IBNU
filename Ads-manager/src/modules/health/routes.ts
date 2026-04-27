import type { FastifyInstance } from 'fastify';
import { pingDb } from '../foundation/db/client.js';

export async function registerHealthRoutes(app: FastifyInstance) {
  app.get('/health', async () => ({
    ok: true,
    service: 'meta-ads-dev',
    status: 'healthy',
    ts: new Date().toISOString()
  }));

  app.get('/health/ready', async (_request, reply) => {
    const dbOk = await pingDb();

    if (!dbOk) {
      reply.code(503);
      return {
        ok: false,
        status: 'not-ready',
        checks: {
          db: 'down'
        }
      };
    }

    return {
      ok: true,
      status: 'ready',
      checks: {
        db: 'up'
      }
    };
  });
}
