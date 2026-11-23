import { useLayoutEffect, useRef, useState, type InputHTMLAttributes } from 'react'
import { asDollars, asTyped, bare, clean, whole } from '../lib/moneyTyping'

/**
 * A dollar figure being typed: "$1,234.56" as it goes in, whatever is typed.
 *
 * The dollar sign and the commas are put in while typing, and the cents are filled out to two
 * places when the box is left, so every figure in the app is entered and shown the same way.
 * What the caller gets is the bare number as text ("1234.56", "" for nothing), which is what the
 * pages already turned into a number; the caret stays after the digit it was after.
 */
export function MoneyInput({ value, onChange, onFocus, onBlur, shown: asShown, ...rest }:
  Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
    value: string | number | null | undefined
    onChange: (raw: string) => void
    /** Hand back the figure as it reads ("$1,234.56") rather than bare — for text that is printed as typed. */
    shown?: boolean
  }) {
  const box = useRef<HTMLInputElement>(null)
  const [typing, setTyping] = useState<string | null>(null)
  const caret = useRef<number | null>(null)

  const raw = typing ?? bare(value)
  const shown = typing != null ? asTyped(raw) : asDollars(raw)

  useLayoutEffect(() => {
    const el = box.current
    if (!el || caret.current == null || document.activeElement !== el) return
    el.setSelectionRange(caret.current, caret.current)
    caret.current = null
  })

  return (
    <input {...rest} ref={box} inputMode="decimal" value={shown}
      onFocus={(e) => { setTyping(bare(value)); onFocus?.(e) }}
      onChange={(e) => {
        const t = e.target.value
        const at = e.target.selectionStart ?? t.length
        // How many digits (and the point) sit before the caret: the caret goes back after as many.
        const before = t.slice(0, at).replace(/[^\d.]/g, '').length
        const next = clean(t)
        const out = asTyped(next)
        let n = 0, pos = out.length
        if (before === 0) pos = out.startsWith('-') ? 2 : out ? 1 : 0
        else for (let i = 0; i < out.length; i++) { if (/[\d.]/.test(out[i]) && ++n === before) { pos = i + 1; break } }
        caret.current = pos
        setTyping(next)
        onChange(asShown ? asTyped(next) : next)
      }}
      onBlur={(e) => {
        const done = whole(typing ?? bare(value))
        setTyping(null)
        if (asShown) onChange(asDollars(done))
        else if (done !== (typing ?? bare(value))) onChange(done)
        onBlur?.(e)
      }} />
  )
}
