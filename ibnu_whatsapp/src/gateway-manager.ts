import makeWASocket, {
  DisconnectReason,
  Browsers,
  type ConnectionState,
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import QRCode from 'qrcode'
import { APP_CONFIG } from './config.js'
import { AuthStore } from './auth-store.js'

export type GatewayAccountStatus = {
  accountId: string
  connected: boolean
  registered: boolean
  phoneNumber?: string
  platform?: string
  lastConnection?: string
  lastQrAt?: string
}

type ManagedSock = ReturnType<typeof makeWASocket>

type ManagedAccount = {
  sock?: ManagedSock
  status: GatewayAccountStatus
}

export class GatewayManager {
  private readonly accounts = new Map<string, ManagedAccount>()
  private readonly startingAccounts = new Set<string>()
  private readonly authStore: AuthStore

  constructor(sessionDir: string = APP_CONFIG.sessionDir) {
    this.authStore = new AuthStore(sessionDir)
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
    }

    this.accounts.set(accountId, created)
    return created
  }

  private updateStatus(accountId: string, patch: Partial<GatewayAccountStatus>) {
    const account = this.getOrCreateAccount(accountId)
    account.status = {
      ...account.status,
      ...patch,
    }
    return account.status
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

    try {
      const { state, saveCreds } = await this.authStore.load(accountId)

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
      account.sock = sock

      let pairingRequested = false

      sock.ev.on('connection.update', (update: Partial<ConnectionState>) => {
        const { connection, lastDisconnect, qr } = update

        if (connection) {
          console.log(`[${accountId}] connection.update → ${connection}`)
          this.updateStatus(accountId, {
            connected: connection === 'open',
            lastConnection: connection,
          })
        }

        if (qr) {
          console.log(`[${accountId}] 📷 QR received`)
          this.updateStatus(accountId, { lastQrAt: new Date().toISOString() })
          void this.saveQr(qr)
            .then(() => {
              console.log(`[${accountId}] QR saved to ${APP_CONFIG.qrOutputPath}`)
            })
            .catch((error: unknown) => {
              console.error(`[${accountId}] failed to save QR`, error)
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
                console.error(`[${accountId}] pairing code error`, error)
              })
          }
        }

        if (connection === 'close') {
          const shouldReconnect =
            (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut

          console.log(
            `[${accountId}] 🔌 Connection closed: ${lastDisconnect?.error}` +
              ` | Reconnecting: ${shouldReconnect}`
          )

          this.updateStatus(accountId, {
            connected: false,
            registered: !!sock.authState.creds.registered,
            phoneNumber: sock.authState.creds.me?.id ?? undefined,
            platform: sock.authState.creds.platform,
          })

          if (shouldReconnect) {
            void this.startAccount(accountId, pairingNumber)
          } else {
            console.warn(`[${accountId}] ⚠️ Session logged out. Removing session folder for re-pair.`)
            this.authStore.remove(accountId)
          }
        }
      })

      sock.ev.on('creds.update', async () => {
        await saveCreds()
        this.updateStatus(accountId, {
          registered: !!sock.authState.creds.registered,
          phoneNumber: sock.authState.creds.me?.id ?? undefined,
          platform: sock.authState.creds.platform,
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
          }
        }
      })

      return sock
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

    return Array.from(ids).sort()
  }

  async sendText(accountId: string, jid: string, text: string) {
    const sock = this.getSock(accountId)
    if (!sock) {
      throw new Error(`Account '${accountId}' is not initialized`)
    }

    if (!sock.authState.creds.registered) {
      throw new Error(`Account '${accountId}' is not connected to WhatsApp`)
    }

    return sock.sendMessage(jid, { text })
  }
}
