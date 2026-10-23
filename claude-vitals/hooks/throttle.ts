export type After = (ms: number, fn: () => void) => { cancel: () => void }

/** Runs a job at most once per `gapMs`: what is asked while one runs or during the gap after it runs once, when the gap ends. */
export class Coalescer {
  private isBusy = false
  private pending: (() => Promise<void>) | null = null

  constructor(private readonly gapMs: number) {}

  request(job: () => Promise<void>, after: After): void {
    if (this.isBusy) {
      this.pending = job
      return
    }
    this.isBusy = true
    after(0, () => {
      void job()
        .catch(() => undefined)
        .finally(() => {
          after(this.gapMs, () => {
            this.isBusy = false
            const next = this.pending
            this.pending = null
            if (next !== null) this.request(next, after)
          })
        })
    })
  }
}

/** Runs a job once no request has come for `quietMs`. */
export class Debouncer {
  private timer: { cancel: () => void } | null = null

  constructor(private readonly quietMs: number) {}

  request(job: () => Promise<void>, after: After): void {
    this.timer?.cancel()
    this.timer = after(this.quietMs, () => {
      this.timer = null
      void job().catch(() => undefined)
    })
  }
}
