// node --experimental-strip-types phone.test.ts — phone numbers hyphenated as typed.
import { formatPhone, caretAfter, isPhoneField } from '../src/lib/phone.ts'
let bad = 0
const eq = (name: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`) }
const typed = (s: string) => { let v = ''; for (const c of s) v = formatPhone(v + c); return v }
eq('as typed, digit by digit', ['5', '50', '501', '5015', '50155', '501555', '5015550', '50155501', '501555012', '5015550123'].map((s) => typed(s)),
  ['5', '50', '501', '501-5', '501-55', '501-555', '501-5550', '501-555-01', '501-555-012', '501-555-0123'])
eq('pasted forms', ['(501) 555-0123', '501.555.0123', '501 555 0123', '15015550123', '555-0123'].map(formatPhone),
  ['501-555-0123', '501-555-0123', '501-555-0123', '1-501-555-0123', '555-0123'])
eq('extension kept', [formatPhone('5015550123 x204'), typed('5015550123 ext. 12')], ['501-555-0123 x204', '501-555-0123 ext. 12'])
eq('international left alone', formatPhone('+44 20 7946 0958'), '+44 20 7946 0958')
eq('backspace over a hyphen still deletes a digit next time', formatPhone('501-55'), '501-55')
eq('caret after the 4th digit', caretAfter('501-555-0123', 4), 5)
eq('phone fields', [isPhoneField('sub.contact_phone'), isPhoneField('x', 'Contact #'), isPhoneField('fr.time', 'Time')], [true, true, false])
console.log(bad ? `${bad} failed` : 'all passed'); process.exit(bad ? 1 : 0)
