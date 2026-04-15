import makeWASocket, {
  DisconnectReason,
  Browsers,
  type ConnectionState,
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import QRCode from 'qrcode'
import * as path from 'path'
import { APP_CONFIG } from './config.js'
import { AuthStore } from './auth-store.js'
import { SqliteAuthStore } from './sqlite-auth-store.js'
import { SendQueue } from './send-queue.js'
import { AccountRegistry } from './account-registry.js'
import { GatewayEventBus } from './event-bus.js'
import type {
  GatewayConnectionUpdateData,
  GatewayErrorData,
  GatewayMessageReceivedData,
  GatewayQrReceivedData,
  GatewayWebhookEnvelope,
} from './webhook-contract.js'

export type GatewayAccountStatus = {
  accountId: string
  connected: boolean
  registered: boolean
  phoneNumber?: string
  platform?: string
  lastConnection?: string
  lastConnectionAt?: string
  lastDisconnectReason?: string
  lastError?: string
  lastQrAt?: string
}

type ManagedSock = ReturnType<typeof makeWASocket>

type ManagedAccount = {
  sock?: ManagedSock
  status: GatewayAccountStatus
  stopping?: boolean
}

export class GatewayManager {
  private readonly accounts = new Map<string, ManagedAccount>()
  private readonly startingAccounts = new Set<string>()
  private readonly authStore: AuthStore
  private readonly sqliteAuthStore: SqliteAuthStore
  private readonly sendQueue = new SendQueue()

  constructor(
    sessionDir: string = APP_CONFIG.sessionDir,
    private readonly registry: AccountRegistry = new AccountRegistry(APP_CONFIG.accountRegistryPath),
    private readonly eventBus: GatewayEventBus = new GatewayEventBus()
  ) {
    this.authStore = new AuthStore(sessionDir)
    this.sqliteAuthStore = new SqliteAuthStore(path.join(APP_CONFIG.sessionDir, 'auth.sqlite'))
  }

  getEventBus() {
    return this.eventBus
  }

  getRegistry() {
    return this.registry
  }

  private emit<TData>(envelope: GatewayWebhookEnvelope<TData>) {
    this.eventBus.emitWebhook(envelope)
  }

  private getOrCreateAccount(accountId: string) {
    const existing = this.accounts.get(accountId)
    if (existing) return existing

    const created: ManagedAccount = {
      status: {
        accountId,
        connected: false,
        registered: false,
      },
      stopping: false,
    }

    this.accounts.set(accountId, created)
    this.registry.upsert(accountId)
    return created
  }

  private hasKnownAccount(accountId: string) {
    return Boolean(this.accounts.get(accountId)) || Boolean(this.registry.get(accountId))
  }

  private updateStatus(accountId: string, patch: Partial<GatewayAccountStatus>) {
    const account = this.getOrCreateAccount(accountId)
    account.status = {
      ...account.status,
      ...patch,
    }
    return account.status
  }

  private emitError(accountId: string, code: string, message: string, options?: {
    stage?: string
    retrying?: boolean
    details?: string
  }) {
    const data: GatewayErrorData = {
      code,
      message,
      stage: options?.stage,
      retrying: options?.retrying,
      details: options?.details,
    }

    this.emit({
      event: 'gateway.error',
      accountId,
      timestamp: new Date().toISOString(),
      data,
    })
  }

  private async saveQr(qr: string) {
    this.authStore.ensureBaseDir()
    await QRCode.toFile(APP_CONFIG.qrOutputPath, qr, {
      type: 'png',
      margin: 1,
      width: 512,
    })
  }

  async startAccount(accountId: string, pairingNumber?: string): Promise<ManagedSock> {
    if (this.startingAccounts.has(accountId)) {
      const existingSock = this.getSock(accountId)
      if (existingSock) {
        return existingSock
      }
    }

    this.startingAccounts.add(accountId)
    this.registry.upsert(accountId, {
      pairingNumber,
      lastStartedAt: new Date().toISOString(),
      state: 'starting',
    })

    this.emit({
      event: 'gateway.started',
      accountId,
      timestamp: new Date().toISOString(),
      data: { pairingNumberConfigured: Boolean(pairingNumber) },
    })

    try {
      const { state, saveCreds } = await this.sqliteAuthStore.load(accountId)

      const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        browser: Browsers.macOS('Desktop'),
        syncFullHistory: false,
        fireInitQueries: false,
        markOnlineOnConnect: false,
        qrTimeout: 60_000,
        defaultQueryTimeoutMs: 60_000,
      })

      const account = this.getOrCreateAccount(accountId)
      account.stopping = false
      account.sock = sock

      let pairingRequested = false

      sock.ev.on('connection.update', (update: Partial<ConnectionState>) => {
        const { connection, lastDisconnect, qr } = update

        if (connection) {
          console.log(`[${accountId}] connection.update → ${connection}`)
          const status = this.updateStatus(accountId, {
            connected: connection === 'open',
            lastConnection: connection,
            lastConnectionAt: new Date().toISOString(),
          })

          if (connection === 'open') {
            this.registry.upsert(accountId, { state: 'running' })
          }

          const data: GatewayConnectionUpdateData = {
            connection,
            lastConnection: status.lastConnection,
            registered: status.registered,
            phoneNumber: status.phoneNumber,
            platform: status.platform,
          }

          this.emit({
            event: 'gateway.connection.update',
            accountId,
            timestamp: new Date().toISOString(),
            data,
          })
        }

        if (qr) {
          console.log(`[${accountId}] 📷 QR received`)
          this.updateStatus(accountId, { lastQrAt: new Date().toISOString() })
          void this.saveQr(qr)
            .then(() => {
              console.log(`[${accountId}] QR saved to ${APP_CONFIG.qrOutputPath}`)
              const data: GatewayQrReceivedData = {
                qrPath: APP_CONFIG.qrOutputPath,
              }
              this.emit({
                event: 'gateway.qr.received',
                accountId,
                timestamp: new Date().toISOString(),
                data,
              })
            })
            .catch((error: unknown) => {
              const message = error instanceof Error ? error.message : String(error)
              console.error(`[${accountId}] failed to save QR`, error)
              this.updateStatus(accountId, {
                lastError: message,
              })
              this.emitError(accountId, 'qr_save_failed', message, {
                stage: 'qr',
                retrying: false,
              })
            })
        }

        if (connection === 'open') {
          console.log(`[${accountId}] ✅ Connected to WhatsApp`)

          this.updateStatus(accountId, {
            connected: true,
            registered: !!sock.authState.creds.registered,
            phoneNumber: sock.authState.creds.me?.id ?? undefined,
            platform: sock.authState.creds.platform,
          })

          if (!sock.authState.creds.registered && pairingNumber && !pairingRequested) {
            pairingRequested = true
            void sock.requestPairingCode(pairingNumber)
              .then((code) => {
                console.log(`[${accountId}] 🔐 Pairing code: ${code}`)
                console.log(`[${accountId}] Use WhatsApp > Linked devices > Link with phone number`)
              })
              .catch((error: unknown) => {
                pairingRequested = false
                const message = error instanceof Error ? error.message : String(error)
                console.error(`[${accountId}] pairing code error`, error)
                this.updateStatus(accountId, {
                  lastError: message,
                })
                this.emitError(accountId, 'pairing_code_failed', message, {
                  stage: 'pairing',
                  retrying: false,
                })
              })
          }
        }

        if (connection === 'close') {
          const disconnectError = lastDisconnect?.error as Boom | undefined
          const shouldReconnect = disconnectError?.output?.statusCode !== DisconnectReason.loggedOut
          const disconnectReason =
            disconnectError?.message ?? disconnectError?.output?.payload?.message ?? 'unknown'

          console.log(
            `[${accountId}] 🔌 Connection closed: ${lastDisconnect?.error}` +
              ` | Reconnecting: ${shouldReconnect}`
          )

          this.updateStatus(accountId, {
            connected: false,
            registered: !!sock.authState.creds.registered,
            phoneNumber: sock.authState.creds.me?.id ?? undefined,
            platform: sock.authState.creds.platform,
            lastDisconnectReason: disconnectReason,
            lastError: String(lastDisconnect?.error ?? ''),
            lastConnectionAt: new Date().toISOString(),
          })

          this.registry.upsert(accountId, { state: shouldReconnect ? 'reconnecting' : 'stopped' })

          this.emitError(accountId, 'connection_closed', disconnectReason, {
            stage: 'connection',
            retrying: shouldReconnect,
            details: String(lastDisconnect?.error ?? ''),
          })

          if (shouldReconnect && !account.stopping) {
            void this.startAccount(accountId, pairingNumber)
          } else {
            console.warn(`[${accountId}] ⚠️ Session logged out. Removing auth data for re-pair.`)
            this.sqliteAuthStore.remove(accountId)
            this.authStore.remove(accountId)
          }
        }
      })

      sock.ev.on('creds.update', async () => {
        await saveCreds()
        const status = this.updateStatus(accountId, {
          registered: !!sock.authState.creds.registered,
          phoneNumber: sock.authState.creds.me?.id ?? undefined,
          platform: sock.authState.creds.platform,
        })

        this.emit({
          event: 'gateway.creds.updated',
          accountId,
          timestamp: new Date().toISOString(),
          data: {
            registered: status.registered,
            phoneNumber: status.phoneNumber,
            platform: status.platform,
          },
        })
      })

      sock.ev.on('messages.upsert', ({ messages }) => {
        for (const msg of messages) {
          const fromMe = msg.key.fromMe
          const jid = msg.key.remoteJid
          const body =
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            ''

          if (!fromMe && jid && body) {
            console.log(`[${accountId}] 📩 ${jid}: ${body}`)

            const data: GatewayMessageReceivedData = {
              jid,
              text: body,
            }

            this.emit({
              event: 'gateway.message.received',
              accountId,
              timestamp: new Date().toISOString(),
              data,
            })
          }
        }
      })

      return sock
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.updateStatus(accountId, {
        connected: false,
        lastError: message,
        lastConnection: 'start_failed',
        lastConnectionAt: new Date().toISOString(),
      })
      this.registry.upsert(accountId, { state: 'error' })
      this.emitError(accountId, 'start_failed', message, {
        stage: 'startup',
        retrying: false,
      })
      throw error
    } finally {
      this.startingAccounts.delete(accountId)
    }
  }

  ensureAccount(accountId: string) {
    return this.getOrCreateAccount(accountId).status
  }

  getAccount(accountId: string) {
    return this.accounts.get(accountId)
  }

  getSock(accountId: string): ManagedSock | undefined {
    return this.accounts.get(accountId)?.sock
  }

  listStatuses() {
    return Array.from(this.accounts.values()).map((entry) => entry.status)
  }

  listKnownAccountIds() {
    const ids = new Set<string>(this.accounts.keys())

    for (const accountId of this.authStore.listAccountIds()) {
      ids.add(accountId)
    }

    for (const entry of this.registry.list()) {
      ids.add(entry.accountId)
    }

    return Array.from(ids).sort()
  }

  async stopAccount(accountId: string) {
    const account = this.accounts.get(accountId)
    const registry = this.registry.get(accountId)

    if (!account && !registry) {
      throw new Error(`Account '${accountId}' not found`)
    }

    if (account?.stopping) {
      return {
        accountId,
        stopped: false,
        alreadyStopping: true,
      }
    }

    if (account) {
      account.stopping = true
    }

    const hadActiveSocket = Boolean(account?.sock)

    if (account?.sock) {
      try {
        account.sock.end(undefined)
      } catch {
        // ignore shutdown errors
      }
      account.sock = undefined
    }

    this.updateStatus(accountId, {
      connected: false,
      lastConnection: 'stopped',
    })
    this.registry.upsert(accountId, { state: 'stopped' })

    return {
      accountId,
      stopped: true,
      hadActiveSocket,
    }
  }

  async restartAccount(accountId: string, pairingNumber?: string) {
    if (!this.hasKnownAccount(accountId)) {
      throw new Error(`Account '${accountId}' not found`)
    }

    const stopResult = await this.stopAccount(accountId)
    await this.startAccount(accountId, pairingNumber)
    return {
      accountId,
      restarted: true,
      previousStop: stopResult,
    }
  }

  async resetSession(accountId: string) {
    if (!this.hasKnownAccount(accountId)) {
      throw new Error(`Account '${accountId}' not found`)
    }

    const stopResult = await this.stopAccount(accountId)
    this.sqliteAuthStore.reset(accountId)
    this.authStore.reset(accountId)
    this.registry.upsert(accountId, { state: 'reset' })
    this.updateStatus(accountId, {
      connected: false,
      registered: false,
      phoneNumber: undefined,
      platform: undefined,
      lastConnection: 'reset',
      lastQrAt: undefined,
    })

    return {
      accountId,
      reset: true,
      previousStop: stopResult,
    }
  }

  async removeAccount(accountId: string) {
    if (!this.hasKnownAccount(accountId)) {
      throw new Error(`Account '${accountId}' not found`)
    }

    const stopResult = await this.stopAccount(accountId)
    this.accounts.delete(accountId)
    this.sqliteAuthStore.remove(accountId)
    this.authStore.remove(accountId)
    this.registry.remove(accountId)

    return {
      accountId,
      removed: true,
      previousStop: stopResult,
    }
  }

  async sendText(accountId: string, jid: string, text: string) {
    return this.sendQueue.enqueue(accountId, async () => {
      const sock = this.getSock(accountId)
      if (!sock) {
        const message = `Account '${accountId}' is not initialized`
        this.updateStatus(accountId, { lastError: message })
        this.emitError(accountId, 'send_failed', message, {
          stage: 'send',
          retrying: false,
        })
        throw new Error(message)
      }

      if (!sock.authState.creds.registered) {
        const message = `Account '${accountId}' is not connected to WhatsApp`
        this.updateStatus(accountId, { lastError: message })
        this.emitError(accountId, 'send_failed', message, {
          stage: 'send',
          retrying: false,
        })
        throw new Error(message)
      }

      try {
        return await sock.sendMessage(jid, { text })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        this.updateStatus(accountId, { lastError: message })
        this.emitError(accountId, 'send_failed', message, {
          stage: 'send',
          retrying: false,
        })
        throw error
      }
    })
  }
}
