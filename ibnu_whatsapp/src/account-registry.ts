import * as fs from 'fs'
import * as path from 'path'

export interface AccountRegistryEntry {
  accountId: string
  createdAt: string
  updatedAt: string
  pairingNumber?: string
  lastStartedAt?: string
}

export class AccountRegistry {
  constructor(private readonly filePath: string) {}

  private ensureDir() {
    const dir = path.dirname(this.filePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
  }

  private readAll(): AccountRegistryEntry[] {
    this.ensureDir()
    if (!fs.existsSync(this.filePath)) {
      return []
    }

    const raw = fs.readFileSync(this.filePath, 'utf8')
    if (!raw.trim()) {
      return []
    }

    return JSON.parse(raw) as AccountRegistryEntry[]
  }

  private writeAll(entries: AccountRegistryEntry[]) {
    this.ensureDir()
    fs.writeFileSync(this.filePath, JSON.stringify(entries, null, 2))
  }

  list() {
    return this.readAll()
  }

  get(accountId: string) {
    return this.readAll().find((entry) => entry.accountId === accountId)
  }

  upsert(accountId: string, patch: Partial<AccountRegistryEntry> = {}) {
    const now = new Date().toISOString()
    const entries = this.readAll()
    const index = entries.findIndex((entry) => entry.accountId === accountId)

    if (index === -1) {
      const created: AccountRegistryEntry = {
        accountId,
        createdAt: now,
        updatedAt: now,
        ...patch,
      }
      entries.push(created)
      this.writeAll(entries)
      return created
    }

    const updated: AccountRegistryEntry = {
      ...entries[index],
      ...patch,
      accountId,
      updatedAt: now,
    }
    entries[index] = updated
    this.writeAll(entries)
    return updated
  }
}
