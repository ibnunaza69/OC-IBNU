import type { GatewayWebhookEnvelope } from './webhook-contract.js'
import { APP_CONFIG } from './config.js'

export class WebhookDispatcher {
  async dispatch(envelope: GatewayWebhookEnvelope) {
    if (!APP_CONFIG.webhookUrl) {
      return { skipped: true, reason: 'WEBHOOK_URL not configured' }
    }

    const response = await fetch(APP_CONFIG.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-secret': APP_CONFIG.webhookSecret,
      },
      body: JSON.stringify(envelope),
    })

    return {
      skipped: false,
      ok: response.ok,
      status: response.status,
    }
  }
}
