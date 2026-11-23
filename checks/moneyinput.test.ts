import * as m from '../src/lib/moneyTyping.ts'
let bad = 0
const eq = (a: unknown, b: unknown, n: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) { bad++; console.log('FAIL', n, JSON.stringify(a), '!=', JSON.stringify(b)) } }
eq(m.clean('1234567.891'), '1234567.89', 'two places at most')
eq(m.clean('$1,234.5'), '1234.5', 'sign and commas taken out')
eq(m.clean('(2,500.00)'), '-2500.00', 'brackets are a deduction')
eq(m.clean('007'), '7', 'leading zeros')
eq(m.clean('1.2.3'), '1.23', 'one point')
eq(m.asTyped('1234567.8'), '$1,234,567.8', 'commas while typing')
eq(m.asTyped('0.5'), '$0.5', 'cents first')
eq(m.asTyped('.5'), '$0.5', 'a bare point')
eq(m.asTyped('-2500'), '-$2,500', 'negative')
eq(m.asDollars('1234.5'), '$1,234.50', 'two places when left')
eq(m.asDollars('-2500'), '-$2,500.00', 'negative when left')
eq(m.asDollars(''), '', 'nothing stays nothing')
eq(m.whole('29771'), '29771.00', 'cents filled out')
console.log(bad ? `moneyinput: ${bad} failed` : 'moneyinput: 13 checks pass')
