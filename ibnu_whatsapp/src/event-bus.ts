import { EventEmitter } from 'node:events'
import type { GatewayWebhookEnvelope } from './webhook-contract.js'

export class GatewayEventBus extends EventEmitter {
  emitWebhook(envelope: GatewayWebhookEnvelope) {
    this.emit('webhook', envelope)
  }

  onWebhook(listener: (envelope: GatewayWebhookEnvelope) => void | Promise<void>) {
    this.on('webhook', listener)
  }
}
