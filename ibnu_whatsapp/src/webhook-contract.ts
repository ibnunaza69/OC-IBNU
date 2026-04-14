export type GatewayWebhookEventName =
  | 'gateway.started'
  | 'gateway.connection.update'
  | 'gateway.qr.received'
  | 'gateway.message.received'
  | 'gateway.creds.updated'

export interface GatewayWebhookEnvelope<TData = unknown> {
  event: GatewayWebhookEventName
  accountId: string
  timestamp: string
  data: TData
}

export interface GatewayConnectionUpdateData {
  connection?: string
  lastConnection?: string
  registered: boolean
  phoneNumber?: string
  platform?: string
}

export interface GatewayQrReceivedData {
  qrPath: string
}

export interface GatewayMessageReceivedData {
  jid: string
  text: string
}
