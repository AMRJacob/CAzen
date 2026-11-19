import { wordsInRegion, type PageText } from '../src/lib/pdf/pageText.ts'
let bad = 0
const eq = (n: string, g: unknown, w: unknown) => { const ok = JSON.stringify(g) === JSON.stringify(w); if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}${ok ? '' : ` got ${JSON.stringify(g)}`}`) }
const W = (str: string, x: number, y: number, w: number, h = 0.01, vertical = false) => ({ str, x, y, w, h, vertical })
const page: PageText = { width: 2592, height: 1728, words: [
  W('TITLE:', 0.70, 0.940, 0.02),
  // drawn 0.70–0.78, but the font says it is three times that long
  W('PLANTING PLAN', 0.70, 0.955, 0.26),
  W('L1.01', 0.95, 0.955, 0.03),
  W('GENERAL NOTES', 0.05, 0.05, 0.08),
] }
const box = { x: 0.69, y: 0.950, w: 0.11, h: 0.02 }
eq('a run whose reported length overshoots the box is still taken by where it starts', wordsInRegion(page, box).map((w) => w.str), ['PLANTING PLAN'])
eq('a run that only passes through a box is not taken', wordsInRegion(page, { x: 0.86, y: 0.950, w: 0.06, h: 0.02 }).map((w) => w.str), [])
eq('ordinary words still go by their middle', wordsInRegion(page, { x: 0.94, y: 0.95, w: 0.05, h: 0.02 }).map((w) => w.str), ['L1.01'])
eq('the label above is left out', wordsInRegion(page, box).some((w) => w.str === 'TITLE:'), false)
if (bad) process.exit(1)
