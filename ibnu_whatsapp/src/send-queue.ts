type Task<T> = () => Promise<T>

export class SendQueue {
  private readonly chains = new Map<string, Promise<unknown>>()

  enqueue<T>(accountId: string, task: Task<T>): Promise<T> {
    const previous = this.chains.get(accountId) ?? Promise.resolve()

    const current = previous
      .catch(() => undefined)
      .then(task)

    this.chains.set(accountId, current)

    return current.finally(() => {
      if (this.chains.get(accountId) === current) {
        this.chains.delete(accountId)
      }
    }) as Promise<T>
  }
}
