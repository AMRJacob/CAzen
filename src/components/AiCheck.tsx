import { useMemo, useState } from 'react'
import { apply, compare, forAi, readOutline, wordDiff, type Change } from '../lib/aiRevise'

/**
 * Checking a page's notes with an AI and bringing the suggestions back (Jacob, 11/24).
 * 1. Copy: the notes and a short request go on the clipboard, for any AI chat.
 * 2. Paste: the reply goes in the box (or is read from the clipboard).
 * 3. Review: every difference — new wording, a line moved in or out, one taken out or added —
 *    with Accept / Reject, and the suggested words can be changed before accepting.
 * Apply writes the notes as reviewed; the board follows (headings, subheadings, notes).
 */
export function AiCheck({ notes, kind, onApply, onClose }: {
  notes: string
  kind: 'meeting' | 'visit'
  onApply: (next: string) => void
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)
  const [reply, setReply] = useState('')
  const [reviewing, setReviewing] = useState(false)
  const [taken, setTaken] = useState<Record<number, boolean>>({})
  const [edits, setEdits] = useState<Record<number, string>>({})
  const changes = useMemo<Change[]>(() => (reviewing ? compare(readOutline(notes), readOutline(reply)) : []), [reviewing, notes, reply])
  const open = changes.map((c, i) => (c.kind === 'same' ? -1 : i)).filter((i) => i >= 0)
  // Every suggestion starts accepted; reject the ones not wanted.
  const take = (i: number) => taken[i] ?? true

  const copy = async () => {
    const text = forAi(notes, kind)
    try { await navigator.clipboard.writeText(text) } catch {
      const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove()
    }
    setCopied(true)
  }
  const pasteIn = async () => { try { setReply(await navigator.clipboard.readText()) } catch { /* the box takes a paste */ } }
  const ind = (level: number) => ({ paddingLeft: `${level * 18}px` })

  return (
    <div className="take-ask" onClick={onClose}>
      <div className="take-card aic" role="dialog" aria-label="Check with AI" onClick={(e) => e.stopPropagation()}>
        <h3>Check with AI</h3>
        {!reviewing ? (
          <>
            <ol className="aic-steps">
              <li>
                <button className="primary" onClick={() => void copy()} disabled={!notes.trim()}>{copied ? 'Copied ✓' : 'Copy the notes for AI'}</button>
                <span className="muted small"> The notes, with a short request to check organization, grammar and spelling and to reply as an outline.</span>
              </li>
              <li>Paste them into your AI chat.</li>
              <li>
                Paste its reply here:
                <textarea className="aic-reply" rows={9} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="1. Heading&#10;  a. Note…" />
                <button className="link" onClick={() => void pasteIn()}>Paste from the clipboard</button>
              </li>
            </ol>
            <div className="actions">
              <button className="primary" disabled={!readOutline(reply).length} onClick={() => setReviewing(true)}>Review the changes</button>
              <button className="link" onClick={onClose}>Cancel</button>
            </div>
          </>
        ) : (
          <>
            <div className="aic-bar">
              <span>{open.length ? `${open.length} ${open.length === 1 ? 'change' : 'changes'} · ${open.filter(take).length} accepted` : 'No changes suggested.'}</span>
              <button className="link" onClick={() => setTaken(Object.fromEntries(open.map((i) => [i, true])))}>Accept all</button>
              <button className="link" onClick={() => setTaken(Object.fromEntries(open.map((i) => [i, false])))}>Reject all</button>
            </div>
            <ul className="aic-list">
              {changes.map((c, i) => {
                if (c.kind === 'same') return <li key={i} className="aic-same" style={ind(c.old.level)}>{c.old.text}</li>
                const on = take(i)
                const level = c.kind === 'remove' ? c.old.level : c.new.level
                const words = c.kind === 'change' ? wordDiff(c.old.text, edits[i] ?? c.new.text) : null
                const moved = c.kind === 'change' && c.old.level !== c.new.level
                return (
                  <li key={i} className={`aic-ch aic-${c.kind}${on ? ' on' : ' off'}`} style={ind(level)}>
                    <span className="aic-tag">{c.kind === 'add' ? 'Added' : c.kind === 'remove' ? 'Taken out' : moved ? (c.new.level < c.old.level ? 'Moved out' : 'Moved in') : 'Reworded'}</span>
                    {c.kind === 'remove'
                      ? <span className="aic-text"><del>{c.old.text}</del></span>
                      : <span className="aic-text">
                          {words && <span className="aic-words">{words.map((w, k) => <span key={k} className={`w-${w.k}`}>{w.t}</span>)}</span>}
                          <input value={edits[i] ?? c.new.text} onChange={(e) => setEdits({ ...edits, [i]: e.target.value })} aria-label="Suggested words" />
                        </span>}
                    <span className="aic-do">
                      <button className={on ? 'on' : ''} onClick={() => setTaken({ ...taken, [i]: true })}>Accept</button>
                      <button className={!on ? 'on' : ''} onClick={() => setTaken({ ...taken, [i]: false })}>Reject</button>
                    </span>
                  </li>
                )
              })}
            </ul>
            <div className="actions">
              <button className="primary" onClick={() => onApply(apply(changes, (i) => ({ take: take(i), text: edits[i] })))}>Apply</button>
              <button className="link" onClick={() => setReviewing(false)}>Back</button>
              <button className="link" onClick={onClose}>Cancel</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
