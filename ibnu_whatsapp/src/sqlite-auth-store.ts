import { DatabaseSync } from 'node:sqlite'
import { BufferJSON, initAuthCreds, type AuthenticationCreds } from '@whiskeysockets/baileys'
import * as fs from 'fs'
import * as path from 'path'

export class SqliteAuthStore {
  private readonly db: DatabaseSync

  constructor(private readonly filePath: string) {
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    this.db = new DatabaseSync(filePath)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS auth_store (
        account_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        key_id TEXT NOT NULL,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (account_id, kind, key_id)
      );

      CREATE TABLE IF NOT EXISTS auth_creds (
        account_id TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `)
  }

  private serialize(value: unknown) {
    return JSON.stringify(value, BufferJSON.replacer)
  }

  private deserialize<T>(value: string) {
    return JSON.parse(value, BufferJSON.reviver) as T
  }

  getCreds(accountId: string): AuthenticationCreds {
    const row = this.db.prepare('SELECT value FROM auth_creds WHERE account_id = ?').get(accountId) as { value?: string } | undefined
    if (!row?.value) {
      return initAuthCreds()
    }

    return this.deserialize<AuthenticationCreds>(row.value)
  }

  saveCreds(accountId: string, creds: AuthenticationCreds) {
    const now = new Date().toISOString()
    this.db.prepare(
      `INSERT INTO auth_creds (account_id, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(account_id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    ).run(accountId, this.serialize(creds), now)
  }

  getKeys(accountId: string, type: string, ids: string[]) {
    const result: Record<string, unknown> = {}

    if (!ids.length) {
      return result
    }

    const stmt = this.db.prepare(
      'SELECT key_id, value FROM auth_store WHERE account_id = ? AND kind = ? AND key_id = ?'
    )

    for (const id of ids) {
      const row = stmt.get(accountId, type, id) as { key_id?: string; value?: string } | undefined
      if (!row?.value) {
        result[id] = null
        continue
      }
      result[id] = this.deserialize(row.value)
    }

    return result
  }

  setKeys(accountId: string, data: Record<string, Record<string, unknown | null>>) {
    const now = new Date().toISOString()
    const insertStmt = this.db.prepare(
      `INSERT INTO auth_store (account_id, kind, key_id, value, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(account_id, kind, key_id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    const deleteStmt = this.db.prepare(
      'DELETE FROM auth_store WHERE account_id = ? AND kind = ? AND key_id = ?'
    )

    for (const kind of Object.keys(data)) {
      for (const keyId of Object.keys(data[kind] ?? {})) {
        const value = data[kind][keyId]
        if (value === null || value === undefined) {
          deleteStmt.run(accountId, kind, keyId)
        } else {
          insertStmt.run(accountId, kind, keyId, this.serialize(value), now)
        }
      }
    }
  }

  async load(accountId: string) {
    const creds = this.getCreds(accountId)
    const state = {
      creds,
      keys: {
        get: async (type: any, ids: string[]) => this.getKeys(accountId, type, ids),
        set: async (data: Record<string, Record<string, unknown | null>>) => {
          this.setKeys(accountId, data)
        },
      },
    }

    return {
      state: state as any,
      saveCreds: async () => {
        this.saveCreds(accountId, state.creds)
      },
    }
  }

  remove(accountId: string) {
    this.db.prepare('DELETE FROM auth_store WHERE account_id = ?').run(accountId)
    this.db.prepare('DELETE FROM auth_creds WHERE account_id = ?').run(accountId)
  }

  reset(accountId: string) {
    this.remove(accountId)
  }

  listAccountIds() {
    const rows = this.db.prepare('SELECT DISTINCT account_id FROM auth_creds ORDER BY account_id').all() as Array<{ account_id: string }>
    return rows.map((row) => row.account_id)
  }
}
