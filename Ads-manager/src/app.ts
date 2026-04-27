import Fastify from 'fastify';
import { env } from './config/env.js';
import { registerAnalysisRoutes } from './modules/analysis/routes.js';
import { registerAssetGenerationRoutes } from './modules/asset-generation/routes.js';
import { registerCopywritingRoutes } from './modules/copywriting-lab/routes.js';
import { registerDashboardMonitoringRoutes } from './modules/dashboard-monitoring/routes.js';
import { registerFoundationInternalRoutes } from './modules/foundation/internal/routes.js';
import { registerSettingsRoutes } from './modules/foundation/settings/routes.js';
import { registerHealthRoutes } from './modules/health/routes.js';
import { registerProviderInternalRoutes } from './modules/providers/internal/routes.js';
import { registerAgentApiRoutes } from './modules/agent-api/routes.js';
import { registerStartStopAdsRoutes } from './modules/start-stop-ads/routes.js';
import { registerBudgetControlRoutes } from './modules/budget-control/routes.js';

export function buildApp() {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      base: {
        service: 'meta-ads-dev'
      }
    }
  });

  app.get('/', async () => ({
    service: 'meta-ads-dev',
    ok: true
  }));

  void registerHealthRoutes(app);
  void registerFoundationInternalRoutes(app);
  void registerSettingsRoutes(app);
  void registerAssetGenerationRoutes(app);
  void registerCopywritingRoutes(app);
  void registerDashboardMonitoringRoutes(app);
  void registerProviderInternalRoutes(app);
  void registerAnalysisRoutes(app);
  void registerAgentApiRoutes(app);
  void registerStartStopAdsRoutes(app);
  void registerBudgetControlRoutes(app);

  return app;
}
