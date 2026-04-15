import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import dns from 'node:dns'
import makeWASocket, {
  Browsers,
  DisconnectReason,
  useMultiFileAuthState,
  type ConnectionState,
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import QRCode from 'qrcode'

const sessionDir = path.resolve(process.env.BAILEYS_REPRO_SESSION_DIR ?? './sessions/repro')
const qrPath = path.resolve(process.env.BAILEYS_REPRO_QR_PATH ?? './sessions/repro-qr.png')
const pairingNumber =
  process.env.BAILEYS_REPRO_PAIRING_NUMBER?.replace(/[^0-9]/g, '') ||
  process.env.WA_PAIRING_NUMBER?.replace(/[^0-9]/g, '') ||
  ''
const preferIpv4 = (process.env.PREFER_IPV4 ?? 'true').toLowerCase() !== 'false'

async function ensureParentDir(filePath: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
}

function summarizeCreds(sock: ReturnType<typeof makeWASocket>) {
  return {
    registered: !!sock.authState.creds.registered,
    meId: sock.authState.creds.me?.id,
    lid: sock.authState.creds.me?.lid,
    platform: sock.authState.creds.platform,
    accountSyncCounter: sock.authState.creds.accountSyncCounter,
  }
}

async function main() {
  if (preferIpv4) {
    dns.setDefaultResultOrder('ipv4first')
  }

  await fs.mkdir(sessionDir, { recursive: true })

  console.log('=== Baileys Minimal Repro ===')
  console.log(`sessionDir        : ${sessionDir}`)
  console.log(`qrPath            : ${qrPath}`)
  console.log(`pairingNumber     : ${pairingNumber ? pairingNumber : 'not set'}`)
  console.log(`dnsPreference     : ${preferIpv4 ? 'ipv4first' : 'system default'}`)

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir)

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

  let pairingRequested = false

  console.log('initialCreds       :', JSON.stringify(summarizeCreds(sock)))

  sock.ev.on('creds.update', async () => {
    await saveCreds()
    console.log('creds.update       :', JSON.stringify(summarizeCreds(sock)))
  })

  sock.ev.on('connection.update', async (update: Partial<ConnectionState>) => {
    const { connection, lastDisconnect, qr } = update

    if (connection) {
      console.log('connection.update  :', connection)
    }

    if (qr) {
      try {
        await ensureParentDir(qrPath)
        await QRCode.toFile(qrPath, qr, {
          type: 'png',
          margin: 1,
          width: 512,
        })
        console.log(`qr.saved           : ${qrPath}`)
      } catch (error) {
        console.log('qr.save.error      :', error instanceof Error ? error.message : String(error))
      }
    }

    if (connection === 'open') {
      console.log('connection.open    :', JSON.stringify(summarizeCreds(sock)))

      if (!sock.authState.creds.registered && pairingNumber && !pairingRequested) {
        pairingRequested = true
        console.log(`pairing.request    : ${pairingNumber}`)

        void sock
          .requestPairingCode(pairingNumber)
          .then((code) => {
            pairingRequested = false
            console.log(`pairing.code       : ${code}`)
            console.log('pairing.help       : WhatsApp > Linked devices > Link with phone number')
          })
          .catch((error: unknown) => {
            pairingRequested = false
            console.log(
              'pairing.error      :',
              error instanceof Error ? error.stack ?? error.message : String(error)
            )
          })
      }
    }

    if (connection === 'close') {
      const disconnectError = lastDisconnect?.error as Boom | undefined
      const disconnectCode = disconnectError?.output?.statusCode
      const disconnectMessage =
        disconnectError?.message ?? disconnectError?.output?.payload?.message ?? 'unknown'
      const shouldReconnect = disconnectCode !== DisconnectReason.loggedOut

      console.log('disconnect.code    :', disconnectCode ?? 'unknown')
      console.log('disconnect.message :', disconnectMessage)
      console.log(
        'disconnect.details :',
        disconnectError?.stack ?? String(lastDisconnect?.error ?? 'unknown')
      )
      console.log('shouldReconnect    :', shouldReconnect)
      console.log('creds.afterClose   :', JSON.stringify(summarizeCreds(sock)))
    }
  })

  process.on('SIGINT', () => {
    console.log('\nreceived SIGINT, closing repro socket...')
    try {
      sock.end(undefined)
    } finally {
      process.exit(0)
    }
  })
}

main().catch((error) => {
  console.error('fatal.repro.error  :', error)
  process.exit(1)
})
