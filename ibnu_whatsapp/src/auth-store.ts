import { useMultiFileAuthState } from '@whiskeysockets/baileys'
import * as fs from 'fs'
import * as path from 'path'

export class AuthStore {
  constructor(private readonly baseDir: string) {}

  ensureBaseDir() {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true })
    }
  }

  getAccountDir(accountId: string) {
    this.ensureBaseDir()
    return path.join(this.baseDir, accountId)
  }

  ensureAccountDir(accountId: string) {
    const accountDir = this.getAccountDir(accountId)
    if (!fs.existsSync(accountDir)) {
      fs.mkdirSync(accountDir, { recursive: true })
    }
    return accountDir
  }

  async load(accountId: string) {
    const accountDir = this.ensureAccountDir(accountId)
    return useMultiFileAuthState(accountDir)
  }

  remove(accountId: string) {
    const accountDir = this.getAccountDir(accountId)
    if (fs.existsSync(accountDir)) {
      fs.rmSync(accountDir, { recursive: true, force: true })
    }
  }

  reset(accountId: string) {
    this.remove(accountId)
    this.ensureAccountDir(accountId)
  }

  listAccountIds() {
    this.ensureBaseDir()
    return fs.readdirSync(this.baseDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
  }
}
