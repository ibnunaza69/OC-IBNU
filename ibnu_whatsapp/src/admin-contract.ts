export interface AdminOverviewResponse {
  service: {
    name: string
    version: string
    uptimeSec: number
  }
  config: {
    defaultAccountId: string
    webhookPath: string
    sessionDir: string
  }
  accounts: {
    accountId: string
    connected: boolean
    registered: boolean
    phoneNumber?: string
    platform?: string
    lastConnection?: string
    lastConnectionAt?: string
    lastDisconnectReason?: string
    lastDisconnectCode?: number
    lastError?: string
    lastQrAt?: string
    pairingNumberConfigured?: boolean
    pairingRequested?: boolean
    lastPairingAttemptAt?: string
    lastPairingCodeAt?: string
    authStateSummary?: {
      registered: boolean
      meId?: string
      accountSyncCounter?: number
      deviceId?: string
    }
  }[]
}
