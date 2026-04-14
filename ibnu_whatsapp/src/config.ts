import path from 'path'

export const APP_CONFIG = {
  port: parseInt(process.env.PORT ?? '8080', 10),
  sessionDir: process.env.SESSION_DIR || './sessions',
  pairingNumber: process.env.WA_PAIRING_NUMBER?.replace(/[^0-9]/g, '') || '',
  defaultAccountId: process.env.DEFAULT_ACCOUNT_ID || 'default',
  qrOutputPath: path.resolve('./sessions/latest-qr.png'),
  webhookPath: process.env.WEBHOOK_PATH || '/webhook',
} as const
