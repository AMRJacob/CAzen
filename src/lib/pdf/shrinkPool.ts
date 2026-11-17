import { canOffscreen, shrinkSheet, type OnStage, type ShrinkResult } from './shrink'
import type { ShrinkReply, ShrinkRequest } from './shrink.worker'

/**
 * A few workers, each reducing a sheet.
 *
 * Two things come of this. The page stops doing the work, so nothing it does can make the window
 * stutter while a set is being reduced; and more than one sheet can be in hand at a time, which is
 * the only way this gets faster — one thread reduces one sheet, however long it takes.
 *
 * How many is a memory question rather than a speed one. A D-size sheet at 300 dpi is around 78 MB
 * of raw pixels while it is being drawn, so three at once is already a few hundred megabytes. A
 * phone gets one.
 */

/** Conservative: leave the machine a thread, never more than three, one on a phone. */
export function poolSize(): number {
  if (typeof navigator === 'undefined') return 1
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
  if (coarse) return 1
  return Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 2) - 1))
}

const workersUsable = () => typeof Worker !== 'undefined' && canOffscreen

interface Job {
  bytes: Uint8Array
  hasText: boolean
  dpi?: number
  onStage?: OnStage
  resolve: (r: ShrinkResult) => void
  reject: (e: unknown) => void
}

export class ShrinkPool {
  private idle: Worker[] = []
  private all: Worker[] = []
  private queue: Job[] = []
  private busy = new Map<Worker, { job: Job; id: number }>()
  private nextId = 1
  private stopped = false
  /** Terminated for good: the page that owned it has gone. */
  closed = false
  private readonly size: number
  /** Set once a worker has failed in a way that means this browser can't run them for us. */
  private workersBroken = false

  constructor(size = poolSize()) {
    this.size = workersUsable() ? size : 0
  }

  /** How many sheets can be in hand at once. 1 means everything runs on the page's own thread. */
  get width(): number {
    return this.size || 1
  }

  get onMainThread(): boolean {
    return this.size === 0 || this.workersBroken || this.closed
  }

  /** Stop taking new sheets. Whatever is already in a worker finishes, and stays reduced. */
  stop() {
    this.stopped = true
    for (const job of this.queue) job.resolve({ bytes: job.bytes, before: job.bytes.length, after: job.bytes.length, note: 'stopped', changed: false })
    this.queue = []
  }

  close() {
    this.stop()
    this.closed = true
    for (const w of this.all) w.terminate()
    this.all = []
    this.idle = []
  }

  shrink(bytes: Uint8Array, hasText: boolean, opts: { dpi?: number; onStage?: OnStage } = {}): Promise<ShrinkResult> {
    // Asking for a sheet is asking for it: a previous "stop" shouldn't leave the pool refusing
    // work for the rest of the upload.
    this.stopped = false
    return new Promise((resolve, reject) => {
      const job: Job = { bytes, hasText, dpi: opts.dpi, onStage: opts.onStage, resolve, reject }
      if (this.onMainThread) { this.runHere(job); return }
      this.queue.push(job)
      this.pump()
    })
  }

  /** The fallback, and the only path when a browser has no workers or no OffscreenCanvas. */
  private runHere(job: Job) {
    shrinkSheet(job.bytes, job.hasText, { dpi: job.dpi, onStage: job.onStage }).then(job.resolve, job.reject)
  }

  private spawn(): Worker | null {
    try {
      const w = new Worker(new URL('./shrink.worker.ts', import.meta.url), { type: 'module' })
      w.onmessage = (e: MessageEvent<ShrinkReply>) => this.receive(w, e.data)
      w.onerror = () => this.giveUpOnWorkers(w)
      this.all.push(w)
      return w
    } catch {
      return null
    }
  }

  /**
   * A worker that can't start, or dies mid-sheet, means this browser won't do it this way — most
   * likely pdf.js failing to start its own worker inside ours. Fall back to the page's thread and
   * finish the work rather than failing the upload.
   */
  private giveUpOnWorkers(w: Worker) {
    const held = this.busy.get(w)
    this.busy.delete(w)
    this.workersBroken = true
    for (const worker of this.all) worker.terminate()
    this.all = []
    this.idle = []
    if (held) this.runHere(held.job)
    const waiting = this.queue
    this.queue = []
    for (const job of waiting) this.runHere(job)
  }

  private pump() {
    while (this.queue.length && !this.stopped) {
      let worker = this.idle.pop()
      if (!worker && this.all.length < this.size) worker = this.spawn() ?? undefined
      if (!worker) return
      const job = this.queue.shift()!
      const id = this.nextId++
      this.busy.set(worker, { job, id })
      // A copy, deliberately: transferring would detach the caller's bytes, and those are what
      // "undo" puts back.
      const copy = job.bytes.slice()
      const message: ShrinkRequest = { id, bytes: copy, hasText: job.hasText, dpi: job.dpi }
      worker.postMessage(message, [copy.buffer as ArrayBuffer])
    }
  }

  private receive(worker: Worker, reply: ShrinkReply) {
    const held = this.busy.get(worker)
    if (!held || held.id !== reply.id) return
    if (reply.type === 'stage') { held.job.onStage?.(reply.stage); return }

    this.busy.delete(worker)
    this.idle.push(worker)
    if (reply.type === 'done') {
      held.job.resolve({
        // Unchanged sheets come back as the bytes we sent; hand the caller its own copy back so
        // nothing downstream depends on a buffer that crossed a thread.
        bytes: reply.changed ? reply.bytes : held.job.bytes,
        before: reply.before, after: reply.after, note: reply.note, changed: reply.changed,
      })
    } else {
      held.job.resolve({ bytes: held.job.bytes, before: held.job.bytes.length, after: held.job.bytes.length, note: reply.message, changed: false })
    }
    this.pump()
  }
}
