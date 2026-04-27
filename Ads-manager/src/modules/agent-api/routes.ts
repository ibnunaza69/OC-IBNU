import type { FastifyInstance } from 'fastify';
import { registerMetaAgentRoutes } from './meta-ads.routes.js';
import { registerGoogleAgentRoutes } from './google-ads.routes.js';

export async function registerAgentApiRoutes(app: FastifyInstance) {
  app.register(async (api) => {
    // Register Meta Ads Agent endpoints
    await registerMetaAgentRoutes(api);
    
    // Register Google Ads Agent endpoints
    await registerGoogleAgentRoutes(api);
  }, { prefix: '/api/agents' });
}
