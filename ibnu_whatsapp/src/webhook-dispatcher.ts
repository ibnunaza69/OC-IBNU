import crypto from 'node:crypto'
import type { GatewayWebhookEnvelope } from './webhook-contract.js'
import { APP_CONFIG } from './config.js'

type DispatchResult = {
  skipped: boolean
  ok?: boolean
  status?: number
  attempts?: number
  reason?: string
}

export class WebhookDispatcher {
  private buildSignature(payload: string) {
    if (!APP_CONFIG.webhookSecret) {
      return ''
    }

    return crypto
      .createHmac('sha256', APP_CONFIG.webhookSecret)
      .update(payload)
      .digest('hex')
  }

  private async post(payload: string) {
    const signature = this.buildSignature(payload)

    return fetch(APP_CONFIG.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-secret': APP_CONFIG.webhookSecret,
        'x-webhook-signature': signature,
      },
      body: payload,
    })
  }

  async dispatch(envelope: GatewayWebhookEnvelope): Promise<DispatchResult> {
    if (!APP_CONFIG.webhookUrl) {
      return { skipped: true, reason: 'WEBHOOK_URL not configured' }
    }

    const payload = JSON.stringify(envelope)
    const maxAttempts = 3
    let lastStatus: number | undefined

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const response = await this.post(payload)
        lastStatus = response.status

        if (response.ok) {
          return {
            skipped: false,
            ok: true,
            status: response.status,
            attempts: attempt,
          }
        }
      } catch {
        // ignore and retry below
      }

      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 500))
      }
    }

    return {
      skipped: false,
      ok: false,
      status: lastStatus,
      attempts: maxAttempts,
      reason: 'dispatch failed after retries',
    }
  }
}
