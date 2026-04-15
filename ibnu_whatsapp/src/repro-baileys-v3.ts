import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import dns from 'node:dns'
import makeWASocket, {
  Browsers,
  DisconnectReason,
  type ConnectionState,
  type SocketConfig,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import QRCode from 'qrcode'

type ReproMode = 'pairing-only' | 'qr-only' | 'auto'
type BrowserProfile =
  | 'mac-desktop'
  | 'mac-safari'
  | 'ubuntu-desktop'
  | 'ubuntu-chrome'
  | 'windows-desktop'
  | 'windows-chrome'

const pairingNumber =
  process.env.BAILEYS_REPRO_PAIRING_NUMBER?.replace(/[^0-9]/g, '') ||
  process.env.WA_PAIRING_NUMBER?.replace(/[^0-9]/g, '') ||
  ''
const profile = (process.env.BAILEYS_REPRO_PROFILE ?? 'mac-desktop').trim().toLowerCase() as BrowserProfile
const mode = (process.env.BAILEYS_REPRO_MODE ?? 'auto').trim().toLowerCase() as ReproMode
const preferIpv4 = (process.env.PREFER_IPV4 ?? 'true').toLowerCase() !== 'false'
const syncFullHistory = parseOptionalBoolean(process.env.BAILEYS_REPRO_SYNC_FULL_HISTORY)
const fireInitQueries = parseOptionalBoolean(process.env.BAILEYS_REPRO_FIRE_INIT_QUERIES)
const markOnlineOnConnect = parseOptionalBoolean(process.env.BAILEYS_REPRO_MARK_ONLINE)
const qrTimeout = parseOptionalNumber(process.env.BAILEYS_REPRO_QR_TIMEOUT_MS)
const defaultQueryTimeoutMs = parseOptionalNumber(process.env.BAILEYS_REPRO_DEFAULT_QUERY_TIMEOUT_MS)
const connectTimeoutMs = parseOptionalNumber(process.env.BAILEYS_REPRO_CONNECT_TIMEOUT_MS)
const qrPath = path.resolve(
  process.env.BAILEYS_REPRO_QR_PATH ?? `./sessions/repro-v3/${profile}-${mode}/qr.png`
)
const sessionDir = path.resolve(
  process.env.BAILEYS_REPRO_SESSION_DIR ?? `./sessions/repro-v3/${profile}-${mode}`
)

function parseOptionalBoolean(value: string | undefined) {
  if (value == null || value === '') {
    return undefined
  }

  const normalized = value.trim().toLowerCase()
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) {
    return true
  }
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) {
    return false
  }

  throw new Error(`Invalid boolean value: ${value}`)
}

function parseOptionalNumber(value: string | undefined) {
  if (value == null || value === '') {
    return undefined
  }

  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid numeric value: ${value}`)
  }

  return parsed
}

async function ensureParentDir(filePath: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
}

function getBrowser(profileName: BrowserProfile): SocketConfig['browser'] {
  switch (profileName) {
    case 'mac-desktop':
      return Browsers.macOS('Desktop')
    case 'mac-safari':
      return Browsers.macOS('Safari')
    case 'ubuntu-desktop':
      return Browsers.ubuntu('Desktop')
    case 'ubuntu-chrome':
      return Browsers.ubuntu('Chrome')
    case 'windows-desktop':
      return Browsers.windows('Desktop')
    case 'windows-chrome':
      return Browsers.windows('Chrome')
    default:
      throw new Error(`Unsupported profile: ${profileName}`)
  }
}

function getProfileDefaults(profileName: BrowserProfile): Partial<SocketConfig> {
  switch (profileName) {
    case 'mac-desktop':
      return {
        browser: getBrowser(profileName),
        syncFullHistory: false,
        fireInitQueries: false,
        markOnlineOnConnect: false,
        qrTimeout: 60_000,
        defaultQueryTimeoutMs: 60_000,
      }
    case 'mac-safari':
      return {
        browser: getBrowser(profileName),
        syncFullHistory: false,
        fireInitQueries: true,
        markOnlineOnConnect: false,
        qrTimeout: 60_000,
        defaultQueryTimeoutMs: 60_000,
      }
    case 'ubuntu-desktop':
      return {
        browser: getBrowser(profileName),
        syncFullHistory: false,
        fireInitQueries: false,
        markOnlineOnConnect: false,
        qrTimeout: 60_000,
        defaultQueryTimeoutMs: 45_000,
      }
    case 'ubuntu-chrome':
      return {
        browser: getBrowser(profileName),
        syncFullHistory: true,
        fireInitQueries: true,
        markOnlineOnConnect: false,
        qrTimeout: 60_000,
        defaultQueryTimeoutMs: 45_000,
      }
    case 'windows-desktop':
      return {
        browser: getBrowser(profileName),
        syncFullHistory: false,
        fireInitQueries: false,
        markOnlineOnConnect: true,
        qrTimeout: 60_000,
        defaultQueryTimeoutMs: 60_000,
      }
    case 'windows-chrome':
      return {
        browser: getBrowser(profileName),
        syncFullHistory: true,
        fireInitQueries: true,
        markOnlineOnConnect: true,
        qrTimeout: 60_000,
        defaultQueryTimeoutMs: 45_000,
      }
  }
}

function mergeSocketOptions(profileName: BrowserProfile): Partial<SocketConfig> {
  const defaults = getProfileDefaults(profileName)

  return {
    ...defaults,
    syncFullHistory: syncFullHistory ?? defaults.syncFullHistory,
    fireInitQueries: fireInitQueries ?? defaults.fireInitQueries,
    markOnlineOnConnect: markOnlineOnConnect ?? defaults.markOnlineOnConnect,
    qrTimeout: qrTimeout ?? defaults.qrTimeout,
    defaultQueryTimeoutMs: defaultQueryTimeoutMs ?? defaults.defaultQueryTimeoutMs,
    connectTimeoutMs,
  }
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

function summarizeSocketOptions(profileName: BrowserProfile, options: Partial<SocketConfig>) {
  return {
    profile: profileName,
    browser: options.browser,
    syncFullHistory: options.syncFullHistory,
    fireInitQueries: options.fireInitQueries,
    markOnlineOnConnect: options.markOnlineOnConnect,
    qrTimeout: options.qrTimeout,
    defaultQueryTimeoutMs: options.defaultQueryTimeoutMs,
    connectTimeoutMs: options.connectTimeoutMs,
  }
}

function shouldRequestPairing(selectedMode: ReproMode) {
  if (selectedMode === 'qr-only') {
    return false
  }
  if (selectedMode === 'pairing-only') {
    return true
  }
  return Boolean(pairingNumber)
}

async function main() {
  if (preferIpv4) {
    dns.setDefaultResultOrder('ipv4first')
  }

  await fs.mkdir(sessionDir, { recursive: true })

  const socketOptions = mergeSocketOptions(profile)
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir)

  console.log('=== Baileys Repro V3 ===')
  console.log(`mode              : ${mode}`)
  console.log(`profile           : ${profile}`)
  console.log(`sessionDir        : ${sessionDir}`)
  console.log(`qrPath            : ${qrPath}`)
  console.log(`pairingNumber     : ${pairingNumber ? pairingNumber : 'not set'}`)
  console.log(`dnsPreference     : ${preferIpv4 ? 'ipv4first' : 'system default'}`)
  console.log('socket.options    :', JSON.stringify(summarizeSocketOptions(profile, socketOptions)))

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    ...socketOptions,
  })

  let pairingRequested = false

  console.log('initialCreds      :', JSON.stringify(summarizeCreds(sock)))

  sock.ev.on('creds.update', async () => {
    await saveCreds()
    console.log('creds.update      :', JSON.stringify(summarizeCreds(sock)))
  })

  sock.ev.on('connection.update', async (update: Partial<ConnectionState>) => {
    const { connection, lastDisconnect, qr, isNewLogin, receivedPendingNotifications } = update

    if (connection) {
      console.log('connection.update :', connection)
    }

    if (typeof isNewLogin === 'boolean') {
      console.log('isNewLogin        :', isNewLogin)
    }

    if (typeof receivedPendingNotifications === 'boolean') {
      console.log('pendingNotifs     :', receivedPendingNotifications)
    }

    if (qr) {
      try {
        await ensureParentDir(qrPath)
        await QRCode.toFile(qrPath, qr, {
          type: 'png',
          margin: 1,
          width: 512,
        })
        console.log(`qr.saved          : ${qrPath}`)
      } catch (error) {
        console.log('qr.save.error     :', error instanceof Error ? error.message : String(error))
      }
    }

    if (connection === 'open') {
      console.log('connection.open   :', JSON.stringify(summarizeCreds(sock)))

      if (!sock.authState.creds.registered && shouldRequestPairing(mode) && pairingNumber && !pairingRequested) {
        pairingRequested = true
        console.log(`pairing.request   : ${pairingNumber}`)

        void sock
          .requestPairingCode(pairingNumber)
          .then((code) => {
            pairingRequested = false
            console.log(`pairing.code      : ${code}`)
            console.log('pairing.help      : WhatsApp > Linked devices > Link with phone number')
          })
          .catch((error: unknown) => {
            pairingRequested = false
            console.log(
              'pairing.error     :',
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

      console.log('disconnect.code   :', disconnectCode ?? 'unknown')
      console.log('disconnect.message:', disconnectMessage)
      console.log(
        'disconnect.details:',
        disconnectError?.stack ?? String(lastDisconnect?.error ?? 'unknown')
      )
      console.log('shouldReconnect   :', shouldReconnect)
      console.log('creds.afterClose  :', JSON.stringify(summarizeCreds(sock)))
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
  console.error('fatal.repro.error :', error)
  process.exit(1)
})
