import { useRef, type ReactElement } from 'react'

/**
 * The toolbar over an outline field.
 *
 * Everything here works on whole lines, because that is what the template's renderer
 * understands: indentation by twos, a marker at the front, and a line set bold, italic or
 * underlined. Working on whole lines also means every button is reversible — pressing it
 * twice puts the line back — which is what makes a toolbar safe to press.
 *
 * The markers stay visible in the box. Hiding them means replacing the box with a rich text
 * editor, which would have to agree with the PDF renderer about everything; a plain box that
 * says exactly what will be printed is the smaller promise and the one kept here.
 */

type Edit = (lines: string[]) => string[]

const DEMOTE: Edit = (ls) => ls.map((l) => (l.trim() ? '  ' + l : l))
const PROMOTE: Edit = (ls) => ls.map((l) => l.replace(/^ {1,2}/, ''))

/** The marker at the front of a line — "1.", "a.", "-" — and what is left after it. */
const MARKER = /^(\s*)((?:\d+|[a-zA-Z]|[-*•])[.)]?\s+)?(.*)$/

const bulleted: Edit = (ls) => ls.map((l) => {
  const m = l.match(MARKER)!
  const [, space, marker, body] = m
  if (!body.trim()) return l
  return marker?.trim().replace(/[.)]/, '') === '-' ? `${space}${body}` : `${space}- ${body}`
})

/** Number the lines at each indent, restarting whenever the indent steps back in. */
const numbered: Edit = (ls) => {
  const counts = new Map<number, number>()
  return ls.map((l) => {
    const m = l.match(MARKER)!
    const [, space, , body] = m
    if (!body.trim()) return l
    const level = Math.floor(space.length / 2)
    for (const key of [...counts.keys()]) if (key > level) counts.delete(key)
    const n = (counts.get(level) ?? 0) + 1
    counts.set(level, n)
    // The template's own convention: numbers at the top, letters a level in, numbers again.
    const mark = level % 2 === 1 ? `${String.fromCharCode(96 + Math.min(n, 26))}.` : `${n}.`
    return `${space}${mark} ${body}`
  })
}

/** Wrap or unwrap whatever follows the marker. Pressing twice puts it back. */
const wrapper = (open: string, close = open): Edit => (ls) => ls.map((l) => {
  const m = l.match(MARKER)!
  const [, space, marker, body] = m
  const text = body.trim()
  if (!text) return l
  const had = text.startsWith(open) && text.endsWith(close) && text.length > open.length + close.length
  const next = had ? text.slice(open.length, text.length - close.length) : `${open}${text}${close}`
  return `${space}${marker ?? ''}${next}`
})

const caps: Edit = (ls) => ls.map((l) => {
  const m = l.match(MARKER)!
  const [, space, marker, body] = m
  if (!body.trim()) return l
  const upper = body === body.toUpperCase()
  return `${space}${marker ?? ''}${upper ? sentence(body) : body.toUpperCase()}`
})

/** Back out of SHOUTING: first letter up, the rest down, acronyms left alone. */
function sentence(text: string): string {
  const small = text.replace(/\b[A-Z]{2,}\b/g, (w) => `\u0000${w}\u0000`)
  const lowered = small.split('\u0000').map((part, i) => (i % 2 ? part : part.toLowerCase())).join('')
  return lowered.replace(/^(\s*)([a-z])/, (_, s, c) => s + c.toUpperCase())
}

const TOOLS: { name: string; title: string; icon: ReactElement; edit: Edit }[] = [
  { name: 'Promote', title: 'Move these lines out a level', edit: PROMOTE, icon: <><path d="M9 6h11M9 12h11M9 18h11" /><path d="M6 9 3 12l3 3" /></> },
  { name: 'Demote', title: 'Move these lines in a level', edit: DEMOTE, icon: <><path d="M9 6h11M9 12h11M9 18h11" /><path d="M3 9l3 3-3 3" /></> },
  { name: 'Bullet', title: 'Bullet these lines', edit: bulleted, icon: <><circle cx="4.5" cy="6" r="1.4" /><circle cx="4.5" cy="12" r="1.4" /><circle cx="4.5" cy="18" r="1.4" /><path d="M9 6h11M9 12h11M9 18h11" /></> },
  { name: 'Number', title: 'Number these lines, by level', edit: numbered, icon: <><path d="M9 6h11M9 12h11M9 18h11" /><path d="M3 4.5h1.5V8M3 10.5h2l-2 3h2M3 16.5h2v1.5H4h1v1.5H3" /></> },
  { name: 'Bold', title: 'Set these lines bold', edit: wrapper('**'), icon: <path d="M7 4h5.5a3.5 3.5 0 0 1 0 7H7V4Zm0 7h6.5a3.5 3.5 0 0 1 0 7H7v-7Z" /> },
  { name: 'Italic', title: 'Set these lines in italics', edit: wrapper('*'), icon: <><path d="M14 4h-4M14 20h-4M14.5 4 9.5 20" /></> },
  { name: 'Underline', title: 'Underline these lines', edit: wrapper('__'), icon: <><path d="M7 4v7a5 5 0 0 0 10 0V4" /><path d="M5 20h14" /></> },
  { name: 'Caps', title: 'All capitals, and back again', edit: caps, icon: <><path d="M3 18 7 6l4 12M4.2 14.5h5.6" /><path d="M13 18l4-12 4 12M14.2 14.5h5.6" /></> },
]

export function OutlineTools({ textarea, value, onChange }: {
  textarea: React.RefObject<HTMLTextAreaElement | null>
  value: string
  onChange: (v: string) => void
}) {
  const last = useRef<{ start: number; end: number }>({ start: 0, end: 0 })

  function apply(edit: Edit) {
    const ta = textarea.current
    // Pressing a button moves focus off the box, so where the cursor was is remembered.
    const start = ta ? ta.selectionStart : last.current.start
    const end = ta ? ta.selectionEnd : last.current.end
    const from = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1
    const toEnd = value.indexOf('\n', end)
    const to = toEnd === -1 ? value.length : toEnd
    const block = value.slice(from, to)
    const next = edit(block.split('\n')).join('\n')
    onChange(value.slice(0, from) + next + value.slice(to))
    requestAnimationFrame(() => {
      if (!ta) return
      ta.focus()
      ta.selectionStart = from
      ta.selectionEnd = from + next.length
    })
  }

  return (
    <div className="outline-tools"
      onMouseDown={() => {
        const ta = textarea.current
        if (ta) last.current = { start: ta.selectionStart, end: ta.selectionEnd }
      }}>
      {TOOLS.map((t) => (
        <button key={t.name} type="button" title={t.title} aria-label={t.name}
          onClick={() => apply(t.edit)}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
            strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {t.icon}
          </svg>
        </button>
      ))}
    </div>
  )
}
