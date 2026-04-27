import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AuditRepository } from '../audit/audit.repository.js';
import { WriteApprovalRepository } from '../approvals/write-approval.repository.js';
import { CredentialsStateRepository } from '../credentials/credentials.repository.js';
import { pingDb } from '../db/client.js';
import { JobsStateRepository } from '../jobs/jobs.repository.js';
import { ProviderRequestLogRepository } from '../provider-logs/provider-request-log.repository.js';
import { moduleInventory } from '../../../module-inventory.js';

const limitQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(20)
});

const credentialsQuerySchema = z.object({
  provider: z.string().optional(),
  subject: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(20)
});

export async function registerFoundationInternalRoutes(app: FastifyInstance) {
  const auditRepository = new AuditRepository();
  const writeApprovalRepository = new WriteApprovalRepository();
  const credentialsRepository = new CredentialsStateRepository();
  const jobsRepository = new JobsStateRepository();
  const providerRequestLogRepository = new ProviderRequestLogRepository();

  app.get('/internal/foundation/status', async () => {
    const dbOk = await pingDb();

    return {
      ok: true,
      foundation: {
        db: dbOk ? 'up' : 'down',
        repositories: ['audit', 'write-approvals', 'credentials-state', 'jobs-state', 'provider-request-logs', 'asset-generation-tasks', 'asset-library', 'copy-variants', 'copy-reviews']
      }
    };
  });

  app.get('/internal/foundation/module-inventory', async () => {
    return {
      ok: true,
      count: moduleInventory.length,
      items: moduleInventory
    };
  });

  app.get('/internal/foundation/audits', async (request) => {
    const query = limitQuerySchema.parse(request.query);
    const items = await auditRepository.listRecent(query.limit);

    return {
      ok: true,
      count: items.length,
      items
    };
  });

  app.get('/internal/foundation/credentials', async (request) => {
    const query = credentialsQuerySchema.parse(request.query);

    if (query.provider && query.subject) {
      const item = await credentialsRepository.findOne(query.provider, query.subject);

      return {
        ok: true,
        item: item ?? null
      };
    }

    const items = await credentialsRepository.listAll(query.limit);

    return {
      ok: true,
      count: items.length,
      items
    };
  });

  app.get('/internal/foundation/provider-request-logs', async (request) => {
    const query = limitQuerySchema.parse(request.query);
    const items = await providerRequestLogRepository.listRecent(query.limit);

    return {
      ok: true,
      count: items.length,
      items
    };
  });

  app.get('/internal/foundation/jobs', async (request) => {
    const query = limitQuerySchema.parse(request.query);
    const items = await jobsRepository.listRecent(query.limit);

    return {
      ok: true,
      count: items.length,
      items
    };
  });

  app.get('/internal/foundation/write-approvals', async (request) => {
    const query = limitQuerySchema.parse(request.query);
    const items = await writeApprovalRepository.listRecent(query.limit);

    return {
      ok: true,
      count: items.length,
      items
    };
  });
}
