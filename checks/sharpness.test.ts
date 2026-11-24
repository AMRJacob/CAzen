// node --experimental-strip-types sharpness.test.ts
import assert from 'node:assert/strict'
import { sharpnessOf, sharpZoom, dpiForMaxZoom, fitPixelsHere, MAX_ZOOM } from '../src/lib/pdf/sharpness.ts'
const W = 36 * 72, H = 24 * 72
// Vector sheet with a small logo: not the drawing.
let s = sharpnessOf([{ width: 300, height: 100, drawnWidth: 144, drawnHeight: 48 }], W, H)
assert.equal(s.dpi, null); assert.equal(sharpZoom(s, 1400), Infinity)
// A whole-sheet picture at 200 dpi.
s = sharpnessOf([{ width: 7200, height: 4800, drawnWidth: W, drawnHeight: H }], W, H)
assert.equal(s.dpi, 200); assert.equal(s.pictures, 1)
assert.ok(Math.abs(sharpZoom(s, 1440) - 5) < 1e-9)          // 7200 px over 1440 px fitted: 500%
assert.equal(dpiForMaxZoom(W, 1440), Math.ceil(MAX_ZOOM * 1440 / 36))
// Drawn size not given: taken as the sheet.
s = sharpnessOf([{ width: 3600, height: 2400, drawnWidth: 0, drawnHeight: 0 }], W, H)
assert.equal(s.dpi, 100)
// The softer of two large pictures decides.
s = sharpnessOf([{ width: 5400, height: 2400, drawnWidth: W, drawnHeight: H / 2 }, { width: 3600, height: 1200, drawnWidth: W, drawnHeight: H / 2 }], W, H)
assert.equal(s.dpi, 100); assert.equal(s.pictures, 2)
// A wide sheet in a short window is limited by height.
assert.equal(fitPixelsHere(W, H, { innerWidth: 3000, innerHeight: 1080, devicePixelRatio: 1 }), 1000 * 1.5)
console.log('sharpness: ok')
