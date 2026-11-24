import { formatPhone, caretAfter } from '../lib/phone'

/**
 * A text box for a phone number that puts the hyphens in as it is typed (Jacob, 11/24), keeping
 * the caret after the same digit. Deleting just after a hyphen takes the digit before it.
 * It hands back a change event like any input, so it drops in where an <input> was.
 */
export function PhoneInput(props: React.InputHTMLAttributes<HTMLInputElement> & { value: string }) {
  const { onChange, onKeyDown, ...rest } = props
  return (
    <input {...rest} inputMode="tel" autoComplete={rest.autoComplete ?? 'tel'}
      onKeyDown={(e) => {
        // Backspace right after a hyphen: take the digit before it, not just the hyphen (which would come back).
        const el = e.currentTarget, at = el.selectionStart ?? 0
        if (e.key === 'Backspace' && at === el.selectionEnd && at > 0 && el.value[at - 1] === '-') {
          e.preventDefault()
          const raw = el.value.slice(0, at - 2) + el.value.slice(at)
          const digits = el.value.slice(0, at - 2).replace(/\D/g, '').length
          el.value = formatPhone(raw)
          const c = caretAfter(el.value, digits)
          el.setSelectionRange(c, c)
          onChange?.({ ...e, target: el, currentTarget: el } as unknown as React.ChangeEvent<HTMLInputElement>)
          return
        }
        onKeyDown?.(e)
      }}
      onChange={(e) => {
        const el = e.target, at = el.selectionStart ?? el.value.length
        const digits = el.value.slice(0, at).replace(/\D/g, '').length
        const next = formatPhone(el.value)
        if (next !== el.value) {
          el.value = next
          const c = caretAfter(next, digits)
          el.setSelectionRange(c, c)
        }
        onChange?.(e)
      }} />
  )
}
