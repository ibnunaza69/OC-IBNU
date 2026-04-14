import express, { Request, Response, NextFunction } from 'express'
import { APP_CONFIG } from './config.js'
import { GatewayManager } from './gateway-manager.js'

interface SendRequest {
  accountId?: string
  jid: string
  text: string
}

interface WebhookPayload {
  event?: string
  data?: unknown
}

export function createApi(manager: GatewayManager) {
  const app = express()

  app.use(express.json())

  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      accounts: manager.listStatuses(),
    })
  })

  app.get('/status', (_req: Request, res: Response) => {
    res.json({
      accounts: manager.listStatuses(),
    })
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

  app.post(APP_CONFIG.webhookPath, (req: Request<{}, {}, WebhookPayload>, res: Response) => {
    const payload = req.body
    console.log('[webhook] received', payload)

    return res.json({
      success: true,
      received: true,
      path: APP_CONFIG.webhookPath,
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
