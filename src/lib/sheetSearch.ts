/**
 * Searching the words on sheets from the copy on this device.
 *
 * The server searches with Postgres's own text search (stems, ranking). With no signal the
 * device has the same words (`sheetText`, one row per revision) and this is a plainer search
 * over them: every word typed must appear, as the start of a word; the hits with the most
 * matches come first. It marks matches the way the server does, with « and ».
 */
export interface TextRow { id: string; body: string }
export interface Found { revision_id: string; snippet: string; score: number }

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function searchText(rows: TextRow[], query: string): Found[] {
  const words = query.toLowerCase().split(/\s+/).map((w) => w.replace(/^["']+|["']+$/g, '')).filter(Boolean)
  if (!words.length) return []
  // A typed word matches where a word on the sheet begins with it: "door" finds "doors".
  const each = words.map((w) => new RegExp(`(^|[^a-z0-9])(${escape(w)})`, 'gi'))
  const out: Found[] = []
  for (const row of rows) {
    const body = row.body ?? ''
    let score = 0, first = -1, ok = true
    for (const re of each) {
      re.lastIndex = 0
      let n = 0, m: RegExpExecArray | null
      while ((m = re.exec(body))) { if (!n && (first < 0 || m.index < first)) first = m.index + m[1].length; n++; if (n > 50) break }
      if (!n) { ok = false; break }
      score += n
    }
    if (!ok) continue
    const from = Math.max(0, first - 50), to = Math.min(body.length, first + 90)
    let piece = body.slice(from, to).replace(/\s+/g, ' ')
    for (const w of words) piece = piece.replace(new RegExp(`(^|[^a-z0-9«])(${escape(w)}[a-z0-9]*)`, 'gi'), '$1«$2»')
    out.push({ revision_id: row.id, snippet: (from > 0 ? '… ' : '') + piece.trim() + (to < body.length ? ' …' : ''), score })
  }
  return out.sort((a, b) => b.score - a.score)
}
