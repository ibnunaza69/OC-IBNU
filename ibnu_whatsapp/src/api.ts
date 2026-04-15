import express, { Request, Response, NextFunction } from 'express'
import { APP_CONFIG } from './config.js'
import { GatewayManager } from './gateway-manager.js'
import type { AdminOverviewResponse } from './admin-contract.js'
import type { GatewayWebhookEnvelope } from './webhook-contract.js'
import { renderAdminPage } from './admin-page.js'
import { apiKeyMiddleware } from './api-key-middleware.js'
import { requestLogger } from './request-logger.js'

interface SendRequest {
  accountId?: string
  jid: string
  text: string
}

interface StartAccountRequest {
  accountId: string
  pairingNumber?: string
}

interface AccountActionRequest {
  pairingNumber?: string
}

interface WebhookPayload {
  event?: string
  data?: unknown
}

export function createApi(manager: GatewayManager) {
  const app = express()

  app.use(requestLogger())
  app.use(express.json())
  app.use(apiKeyMiddleware(APP_CONFIG.apiKeys))

  app.get('/health', (_req: Request, res: Response) => {
    const accounts = manager.listStatuses()
    const registry = manager.getRegistry().list()

    res.json({
      status: 'ok',
      uptime: process.uptime(),
      accountCount: accounts.length,
      registryCount: registry.length,
      connectedCount: accounts.filter((account) => account.connected).length,
      registeredCount: accounts.filter((account) => account.registered).length,
      accounts,
    })
  })

  app.get('/status', (_req: Request, res: Response) => {
    const accounts = manager.listStatuses()
    res.json({
      accountCount: accounts.length,
      connectedCount: accounts.filter((account) => account.connected).length,
      registeredCount: accounts.filter((account) => account.registered).length,
      accounts,
    })
  })

  app.get('/diagnostics', (_req: Request, res: Response) => {
    const accounts = manager.listStatuses()
    const registry = manager.getRegistry().list()

    res.json({
      service: {
        uptimeSec: process.uptime(),
        defaultAccountId: APP_CONFIG.defaultAccountId,
        sessionDir: APP_CONFIG.sessionDir,
        registryPath: APP_CONFIG.accountRegistryPath,
        qrOutputPath: APP_CONFIG.qrOutputPath,
        webhookPath: APP_CONFIG.webhookPath,
        webhookTargetConfigured: Boolean(APP_CONFIG.webhookUrl),
        apiKeyEnabled: APP_CONFIG.apiKeys.length > 0,
      },
      summary: {
        accountCount: accounts.length,
        connectedCount: accounts.filter((account) => account.connected).length,
        registeredCount: accounts.filter((account) => account.registered).length,
        accountsWithErrors: accounts.filter((account) => Boolean(account.lastError)).length,
      },
      accounts,
      registry,
    })
  })

  app.get('/accounts', (_req: Request, res: Response) => {
    res.json({
      defaultAccountId: APP_CONFIG.defaultAccountId,
      accountIds: manager.listKnownAccountIds(),
      accounts: manager.listStatuses(),
      registry: manager.getRegistry().list(),
    })
  })

  app.get('/accounts/:accountId', (req: Request, res: Response) => {
    const rawAccountId = req.params.accountId
    const accountId = Array.isArray(rawAccountId) ? rawAccountId[0] : rawAccountId
    const account = manager.getAccount(accountId)
    const registry = manager.getRegistry().get(accountId)

    if (!account && !registry) {
      return res.status(404).json({
        success: false,
        error: `Account '${accountId}' not found`,
      })
    }

    return res.json({
      success: true,
      account: account?.status,
      registry,
    })
  })

  app.post('/accounts', async (req: Request<{}, {}, StartAccountRequest>, res: Response) => {
    const { accountId, pairingNumber } = req.body

    if (!accountId) {
      return res.status(400).json({
        success: false,
        error: 'Missing accountId',
      })
    }

    manager.ensureAccount(accountId)

    try {
      await manager.startAccount(accountId, pairingNumber)
      return res.json({
        success: true,
        accountId,
        status: manager.getAccount(accountId)?.status,
        registry: manager.getRegistry().get(accountId),
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return res.status(500).json({
        success: false,
        accountId,
        error: message,
      })
    }
  })

  app.post('/accounts/:accountId/stop', async (req: Request, res: Response) => {
    const rawAccountId = req.params.accountId
    const accountId = Array.isArray(rawAccountId) ? rawAccountId[0] : rawAccountId

    try {
      const result = await manager.stopAccount(accountId)
      return res.json({ success: true, ...result })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return res.status(500).json({ success: false, accountId, error: message })
    }
  })

  app.post('/accounts/:accountId/restart', async (req: Request<{ accountId: string }, {}, AccountActionRequest>, res: Response) => {
    const rawAccountId = req.params.accountId
    const accountId = Array.isArray(rawAccountId) ? rawAccountId[0] : rawAccountId
    const { pairingNumber } = req.body

    try {
      const result = await manager.restartAccount(accountId, pairingNumber)
      return res.json({ success: true, ...result })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return res.status(500).json({ success: false, accountId, error: message })
    }
  })

  app.post('/accounts/:accountId/reset-session', async (req: Request, res: Response) => {
    const rawAccountId = req.params.accountId
    const accountId = Array.isArray(rawAccountId) ? rawAccountId[0] : rawAccountId

    try {
      const result = await manager.resetSession(accountId)
      return res.json({ success: true, ...result })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return res.status(500).json({ success: false, accountId, error: message })
    }
  })

  app.delete('/accounts/:accountId', async (req: Request, res: Response) => {
    const rawAccountId = req.params.accountId
    const accountId = Array.isArray(rawAccountId) ? rawAccountId[0] : rawAccountId

    try {
      const result = await manager.removeAccount(accountId)
      return res.json({ success: true, ...result })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return res.status(500).json({ success: false, accountId, error: message })
    }
  })

  app.post('/send', async (req: Request<{}, {}, SendRequest>, res: Response) => {
    const accountId = req.body.accountId || APP_CONFIG.defaultAccountId
    const { jid, text } = req.body

    if (!jid || !text) {
      return res.status(400).json({
        success: false,
        error: 'Missing jid or text',
      })
    }

    try {
      const result = await manager.sendText(accountId, jid, text)
      return res.json({
        success: true,
        accountId,
        messageId: result?.key?.id,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return res.status(500).json({
        success: false,
        accountId,
        error: message,
      })
    }
  })

  app.get('/admin', (_req: Request, res: Response) => {
    res.type('html').send(renderAdminPage())
  })

  app.get('/admin/overview', (_req: Request, res: Response) => {
    const accounts = manager.listStatuses()
    const response: AdminOverviewResponse = {
      service: {
        name: 'ibnu_whatsapp',
        version: '0.1.0',
        uptimeSec: process.uptime(),
      },
      config: {
        defaultAccountId: APP_CONFIG.defaultAccountId,
        webhookPath: APP_CONFIG.webhookPath,
        sessionDir: APP_CONFIG.sessionDir,
      },
      accounts,
    }

    res.json(response)
  })

  app.get('/admin/contracts', (_req: Request, res: Response) => {
    const sampleWebhook: GatewayWebhookEnvelope = {
      event: 'gateway.connection.update',
      accountId: APP_CONFIG.defaultAccountId,
      timestamp: new Date().toISOString(),
      data: {
        connection: 'connecting',
      },
    }

    res.json({
      webhook: {
        path: APP_CONFIG.webhookPath,
        targetUrl: APP_CONFIG.webhookUrl || null,
        sampleEnvelope: sampleWebhook,
        signatureHeader: 'x-webhook-signature',
      },
      security: {
        apiKeyHeader: 'x-api-key',
        apiKeyCount: APP_CONFIG.apiKeys.length,
      },
      admin: {
        overviewPath: '/admin/overview',
        contractsPath: '/admin/contracts',
        diagnosticsPath: '/diagnostics',
      },
      accounts: {
        resetSessionPath: '/accounts/:accountId/reset-session',
        stopPath: '/accounts/:accountId/stop',
        restartPath: '/accounts/:accountId/restart',
        deletePath: '/accounts/:accountId',
      },
    })
  })

  app.post(APP_CONFIG.webhookPath, (req: Request<{}, {}, WebhookPayload>, res: Response) => {
    const payload = req.body
    console.log('[webhook] received', payload)

    return res.json({
      success: true,
      received: true,
      path: APP_CONFIG.webhookPath,
      contract: {
        event: payload?.event ?? 'unknown',
        timestamp: new Date().toISOString(),
      },
    })
  })

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[api] unhandled error:', err)
    res.status(500).json({
      success: false,
      error: err.message,
    })
  })

  return app
}
