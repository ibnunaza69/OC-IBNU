declare module 'node:sqlite' {
  export class DatabaseSync {
    constructor(path: string)
    exec(sql: string): void
    prepare(sql: string): {
      get(...params: unknown[]): unknown
      all(...params: unknown[]): unknown[]
      run(...params: unknown[]): unknown
    }
    transaction<T extends (...args: unknown[]) => unknown>(fn: T): T
    close(): void
  }

  export const constants: Record<string, unknown>
  export function backup(): unknown
  export class StatementSync {}
}
