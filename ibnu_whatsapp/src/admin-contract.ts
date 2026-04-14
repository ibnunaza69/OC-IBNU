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
    lastQrAt?: string
  }[]
}
