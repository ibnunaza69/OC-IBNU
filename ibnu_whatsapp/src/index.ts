import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import * as fs from 'fs'
import * as path from 'path'

// ── Config ────────────────────────────────────────────────────────────────────

const SESSION_DIR = process.env.SESSION_DIR || './sessions'
const WA_PAIRING_NUMBER = process.env.WA_PAIRING_NUMBER?.replace(/[^0-9]/g, '')

// ── Auth state helpers ─────────────────────────────────────────────────────────

async function getAuthState(accountId: string) {
  const accountDir = path.join(SESSION_DIR, accountId)
  if (!fs.existsSync(accountDir)) {
    fs.mkdirSync(accountDir, { recursive: true })
  }
  return useMultiFileAuthState(accountDir)
}

function removeSessionDir(accountId: string) {
  const accountDir = path.join(SESSION_DIR, accountId)
  if (fs.existsSync(accountDir)) {
    fs.rmSync(accountDir, { recursive: true, force: true })
  }
}

// ── Create socket for one account ─────────────────────────────────────────────

async function createSocket(accountId: string) {
  const { state, saveCreds } = await getAuthState(accountId)

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    // Emulate desktop for more message history
    browser: ['Ubuntu', 'Chrome', '102.0'],
  })

  let pairingRequested = false

  // ── Connection events ──────────────────────────────────────────────────────

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update

    if (connection === 'open') {
      console.log(`[${accountId}] ✅ Connected to WhatsApp`)

      if (!sock.authState.creds.registered && WA_PAIRING_NUMBER && !pairingRequested) {
        pairingRequested = true
        void sock
          .requestPairingCode(WA_PAIRING_NUMBER)
          .then((code) => {
            console.log(`[${accountId}] 🔐 Pairing code: ${code}`)
            console.log(
              `[${accountId}] Use WhatsApp > Linked devices > Link with phone number`
            )
          })
          .catch((error) => {
            pairingRequested = false
            console.error(`[${accountId}] pairing code error`, error)
          })
      } else if (!sock.authState.creds.registered && !WA_PAIRING_NUMBER) {
        console.log(
          `[${accountId}] 🔐 Not registered yet. Set WA_PAIRING_NUMBER to generate a pairing code.`
        )
      }
    }

    if (connection === 'close') {
      const shouldReconnect =
        (lastDisconnect?.error as Boom)?.output?.statusCode !==
        DisconnectReason.loggedOut

      console.log(
        `[${accountId}] 🔌 Connection closed: ${lastDisconnect?.error}` +
          ` | Reconnecting: ${shouldReconnect}`
      )

      if (shouldReconnect) {
        void createSocket(accountId) // restart
      } else {
        // Session invalidated — delete stored creds and re-pair later
        console.warn(`[${accountId}] ⚠️ Session logged out. Removing session folder for re-pair.`)
        removeSessionDir(accountId)
      }
    }
  })

  // ── Save creds when updated ─────────────────────────────────────────────────

  sock.ev.on('creds.update', saveCreds)

  // ── Message events ─────────────────────────────────────────────────────────

  sock.ev.on('messages.upsert', ({ messages }) => {
    for (const msg of messages) {
      const fromMe = msg.key.fromMe
      const jid = msg.key.remoteJid
      const body = msg.message?.conversation
        || msg.message?.extendedTextMessage?.text
        || ''

      if (!fromMe && jid && body) {
        console.log(`[${accountId}] 📩 ${jid}: ${body}`)

        // Auto-reply demo — remove or replace with your logic
        // sock.sendMessage(jid, { text: `Echo: ${body}` })
      }
    }
  })

  return sock
}

// ── Send message (exported for API use) ───────────────────────────────────────

async function sendTextMessage(
  sock: ReturnType<typeof makeWASocket>,
  jid: string,
  text: string
) {
  const result = await sock.sendMessage(jid, { text })
  console.log(`[message] Sent to ${jid}, ID: ${result?.key?.id ?? 'unknown'}`)
  return result
}

// ── Bootstrap ────────────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 ibnu_whatsapp starting...')

  // Ensure session dir exists
  if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true })
  }

  // Default account ID (expand to multi-account later)
  const ACCOUNT_ID = 'default'

  const sock = await createSocket(ACCOUNT_ID)

  // Demo: send a message after 5s (remove in production)
  setTimeout(() => {
    // Example: void sendTextMessage(sock, '6281234567890@s.whatsapp.net', 'Hello from gateway!')
    console.log('[demo] Skipping auto-send. Uncomment to test.')
  }, 5000)

  console.log(`📡 Gateway running. Press Ctrl+C to stop.`)
}

main().catch((error) => {
  console.error('[fatal]', error)
  process.exitCode = 1
})
