import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { SettingsRepository } from './settings.repository.js';

const setSettingSchema = z.object({
  value: z.string(),
  description: z.string().optional()
});

const bulkSetSettingsSchema = z.object({
  settings: z.record(z.string(), z.string())
});

const bootstrapSchema = z.object({
  brandName: z.string().min(1),
  metaAccessToken: z.string().min(1),
  metaAdAccountId: z.string().min(1),
  metaPixelId: z.string().min(1).optional()
});

const requiredBootstrapKeys = [
  'BRAND_NAME',
  'META_ACCESS_TOKEN',
  'META_AD_ACCOUNT_ID'
] as const;

export async function registerSettingsRoutes(app: FastifyInstance) {
  const settingsRepository = new SettingsRepository();

  app.get('/internal/settings', async () => {
    const settings = await settingsRepository.getAll();

    return {
      ok: true,
      settings
    };
  });

  app.get('/internal/settings/bootstrap', async () => {
    const current = await settingsRepository.getAll();
    const missingKeys = requiredBootstrapKeys.filter((key) => !current[key]);

    return {
      ok: true,
      configured: missingKeys.length === 0,
      requiredKeys: requiredBootstrapKeys,
      missingKeys
    };
  });

  app.post('/internal/settings/bootstrap', async (request) => {
    const body = bootstrapSchema.parse(request.body);

    await settingsRepository.set('BRAND_NAME', body.brandName);
    await settingsRepository.set('META_ACCESS_TOKEN', body.metaAccessToken);
    await settingsRepository.set('META_AD_ACCOUNT_ID', body.metaAdAccountId);

    if (body.metaPixelId) {
      await settingsRepository.set('META_PIXEL_ID', body.metaPixelId);
    }

    return {
      ok: true
    };
  });

  app.get('/internal/settings/:key', async (request, reply) => {
    const params = request.params as { key: string };
    const value = await settingsRepository.get(params.key);

    if (value === null) {
      return reply.status(404).send({ ok: false, error: 'Setting not found' });
    }

    return {
      ok: true,
      key: params.key,
      value
    };
  });

  app.put('/internal/settings/:key', async (request) => {
    const params = request.params as { key: string };
    const body = setSettingSchema.parse(request.body);

    await settingsRepository.set(params.key, body.value, body.description);

    return {
      ok: true,
      key: params.key,
      value: body.value
    };
  });

  app.post('/internal/settings/bulk', async (request) => {
    const body = bulkSetSettingsSchema.parse(request.body);

    for (const [key, value] of Object.entries(body.settings as Record<string, string>)) {
      await settingsRepository.set(key, value);
    }

    return {
      ok: true,
      count: Object.keys(body.settings).length
    };
  });

  app.delete('/internal/settings/:key', async (request) => {
    const params = request.params as { key: string };
    await settingsRepository.delete(params.key);

    return {
      ok: true
    };
  });
}
