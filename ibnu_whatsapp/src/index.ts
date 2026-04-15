import * as fs from 'fs'
import http from 'http'
import dns from 'node:dns'
import { createApi } from './api.js'
import { APP_CONFIG } from './config.js'
import { GatewayManager } from './gateway-manager.js'
import { WebhookDispatcher } from './webhook-dispatcher.js'

async function main() {
  if (APP_CONFIG.preferIpv4) {
    dns.setDefaultResultOrder('ipv4first')
  }

  console.log('🚀 ibnu_whatsapp starting...')
  console.log(`   Port: ${APP_CONFIG.port}`)
  console.log(`   Session dir: ${APP_CONFIG.sessionDir}`)
  console.log(`   Registry DB: ${APP_CONFIG.accountRegistryPath}`)
  console.log(`   Pairing number: ${APP_CONFIG.pairingNumber ? 'set' : 'not set'}`)
  console.log(`   Default account: ${APP_CONFIG.defaultAccountId}`)
  console.log(`   Webhook target: ${APP_CONFIG.webhookUrl || 'not set'}`)
  console.log(`   DNS preference: ${APP_CONFIG.preferIpv4 ? 'ipv4first' : 'system default'}`)

  if (!fs.existsSync(APP_CONFIG.sessionDir)) {
    fs.mkdirSync(APP_CONFIG.sessionDir, { recursive: true })
  }

  const manager = new GatewayManager(APP_CONFIG.sessionDir)
  const dispatcher = new WebhookDispatcher()

  manager.getEventBus().onWebhook(async (envelope) => {
    try {
      const result = await dispatcher.dispatch(envelope)
      if (!result.skipped) {
        console.log('[webhook.dispatch]', result)
      }
    } catch (error) {
      console.error('[webhook.dispatch] failed', error)
    }
  })

  await manager.startAccount(APP_CONFIG.defaultAccountId, APP_CONFIG.pairingNumber)

  const app = createApi(manager)
  const server = http.createServer(app)

  server.listen(APP_CONFIG.port, () => {
    console.log(`\n🌐 REST API listening on http://localhost:${APP_CONFIG.port}`)
    console.log(`   GET  /health               — gateway health`)
    console.log(`   GET  /status               — all account statuses`)
    console.log(`   GET  /diagnostics          — service + registry diagnostics`)
    console.log(`   GET  /accounts             — list known accounts + registry`)
    console.log(`   POST /accounts             — start/init account`)
    console.log(`   POST /send                 — send message`)
    console.log(`   POST ${APP_CONFIG.webhookPath}         — inbound webhook placeholder`)
    console.log(`   GET  /admin                — simple admin page`)
    console.log(`   GET  /admin/overview       — admin summary JSON`)
    console.log(`   GET  /admin/contracts      — API/webhook contracts`)
    console.log(`\n📡 Gateway running. Press Ctrl+C to stop.\n`)
  })

  process.on('SIGINT', () => {
    console.log('\nShutting down...')
    server.close(() => {
      console.log('HTTP server closed.')
      process.exit(0)
    })
  })
}

main().catch((error) => {
  console.error('[fatal]', error)
  process.exitCode = 1
})
