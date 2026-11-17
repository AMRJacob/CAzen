import { shrinkSheet } from './shrink'

/**
 * Reducing a sheet, off the thread the page is drawn on.
 *
 * The work is unchanged — this file only moves where it happens. Decoding a 78 megapixel image
 * and re-encoding it costs what it costs; done here, it costs the page nothing, and several
 * sheets can be in hand at once.
 */

export interface ShrinkRequest {
  id: number
  bytes: Uint8Array
  hasText: boolean
  dpi?: number
}

export type ShrinkReply =
  | { id: number; type: 'stage'; stage: string }
  | { id: number; type: 'done'; bytes: Uint8Array; before: number; after: number; note: string; changed: boolean }
  | { id: number; type: 'error'; message: string }

self.onmessage = async (event: MessageEvent<ShrinkRequest>) => {
  const { id, bytes, hasText, dpi } = event.data
  const post = (reply: ShrinkReply, transfer?: Transferable[]) =>
    (self as unknown as Worker).postMessage(reply, transfer ?? [])

  try {
    const result = await shrinkSheet(bytes, hasText, {
      dpi,
      onStage: (stage) => post({ id, type: 'stage', stage }),
    })
    // Hand the bytes back without copying them again; this worker has no further use for them.
    post({
      id, type: 'done',
      bytes: result.bytes, before: result.before, after: result.after,
      note: result.note, changed: result.changed,
    }, [result.bytes.buffer as ArrayBuffer])
  } catch (e) {
    post({ id, type: 'error', message: e instanceof Error ? e.message : String(e) })
  }
}
