import { DatabaseSync } from 'node:sqlite'
import { BufferJSON } from '@whiskeysockets/baileys'
import * as fs from 'fs'
import * as path from 'path'

export interface AccountRegistryEntry {
  accountId: string
  createdAt: string
  updatedAt: string
  pairingNumber?: string
  lastStartedAt?: string
  state?: 'created' | 'starting' | 'running' | 'reconnecting' | 'stopped' | 'error' | 'removed' | 'reset'
}

export class AccountRegistry {
  private readonly db: DatabaseSync

  constructor(private readonly filePath: string) {
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    this.db = new DatabaseSync(filePath)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS account_registry (
        account_id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        pairing_number TEXT,
        last_started_at TEXT,
        state TEXT
      );
    `)
  }

  private rowToEntry(row: Record<string, unknown>): AccountRegistryEntry {
    return {
      accountId: String(row.account_id),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      pairingNumber: row.pairing_number ? String(row.pairing_number) : undefined,
      lastStartedAt: row.last_started_at ? String(row.last_started_at) : undefined,
      state: row.state ? (String(row.state) as AccountRegistryEntry['state']) : undefined,
    }
  }

  list() {
    const rows = this.db.prepare('SELECT * FROM account_registry ORDER BY account_id').all() as Array<Record<string, unknown>>
    return rows.map((row) => this.rowToEntry(row))
  }

  get(accountId: string) {
    const row = this.db.prepare('SELECT * FROM account_registry WHERE account_id = ?').get(accountId) as Record<string, unknown> | undefined
    return row ? this.rowToEntry(row) : undefined
  }

  upsert(accountId: string, patch: Partial<AccountRegistryEntry> = {}) {
    const now = new Date().toISOString()
    const existing = this.get(accountId)
    const entry: AccountRegistryEntry = existing
      ? {
          ...existing,
          ...patch,
          accountId,
          updatedAt: now,
        }
      : {
          accountId,
          createdAt: now,
          updatedAt: now,
          state: 'created',
          ...patch,
        }

    this.db.prepare(
      `INSERT INTO account_registry (
        account_id, created_at, updated_at, pairing_number, last_started_at, state
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(account_id) DO UPDATE SET
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        pairing_number = excluded.pairing_number,
        last_started_at = excluded.last_started_at,
        state = excluded.state`
    ).run(
      entry.accountId,
      entry.createdAt,
      entry.updatedAt,
      entry.pairingNumber ?? null,
      entry.lastStartedAt ?? null,
      entry.state ?? null
    )

    return entry
  }

  remove(accountId: string) {
    this.db.prepare('DELETE FROM account_registry WHERE account_id = ?').run(accountId)
  }
}
