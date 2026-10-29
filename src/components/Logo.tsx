/**
 * CAzen logo: a dark brushed disc with "CA" wiped out of it (transparent), followed by "zen".
 * The CA is ONE continuous flat-brush stroke — the C's bowl rises into the A's left leg,
 * peaks, drops down the right leg and hooks back as the crossbar — built by stamping a tilted
 * elliptical nib along a smooth centreline, so thick and thin come from the brush angle.
 * Computed once at load; identical on every render.
 */
import { useMemo } from 'react'

type Pt = [number, number]

const CENTRELINE: [Pt, Pt, Pt, Pt][] = [
  [[33, 15], [27, 6], [8, 7], [6, 30]],     // C: top, over and down the left
  [[6, 30], [4, 50], [20, 60], [34, 50]],   // C: bowl, swinging up into…
  [[34, 50], [40, 38], [46, 20], [51, 7]],  // A: left leg, rising to the apex
  [[51, 7], [56, 22], [61, 42], [67, 57]],  // A: right leg, the heavy down-stroke
  [[67, 57], [69, 62], [58, 44], [41, 39]], // A: hook back as the crossbar, brush lifting
]

function brushPath(segments: [Pt, Pt, Pt, Pt][], nib = 8, nibRatio = 0.32, angle = -38, spacing = 0.35): string {
  const pts: Pt[] = []
  for (const [p0, p1, p2, p3] of segments) {
    for (let i = 0; i <= 60; i++) {
      const t = i / 60, u = 1 - t
      pts.push([
        u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
        u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
      ])
    }
  }
  // Resample at even spacing so the nib leaves a smooth, even mark.
  const even: Pt[] = [pts[0]]
  let acc = 0
  for (let i = 1; i < pts.length; i++) {
    let [x0, y0] = even[even.length - 1]
    const [x1, y1] = pts[i]
    let d = Math.hypot(x1 - x0, y1 - y0)
    while (acc + d >= spacing) {
      const f = (spacing - acc) / d
      x0 += (x1 - x0) * f
      y0 += (y1 - y0) * f
      even.push([x0, y0])
      d = Math.hypot(x1 - x0, y1 - y0)
      acc = 0
    }
    acc += d
  }
  const ease = (x: number) => x * x * (3 - 2 * x)
  const th = (angle * Math.PI) / 180
  let out = ''
  even.forEach(([x, y], i) => {
    const t = i / (even.length - 1)
    const press = 0.25 + 0.75 * ease(Math.min(1, t / 0.06)) * ease(Math.min(1, (1 - t) / 0.14))
    const rx = (nib / 2) * press
    const ry = rx * nibRatio + 0.35
    const px = rx * Math.cos(th), py = rx * Math.sin(th)
    out += `M${(x - px).toFixed(2)} ${(y - py).toFixed(2)}a${rx.toFixed(2)} ${ry.toFixed(2)} ${angle} 1 0 ${(2 * px).toFixed(2)} ${(2 * py).toFixed(2)}a${rx.toFixed(2)} ${ry.toFixed(2)} ${angle} 1 0 ${(-2 * px).toFixed(2)} ${(-2 * py).toFixed(2)}`
  })
  return out
}

const CA_PATH = brushPath(CENTRELINE, 8.5)

/** A dark brushed disc with a softly irregular edge that feathers out on the right, where the CA wipes through. */
function discPath(cx = 50, cy = 50, R = 45, fringe = 3): string {
  const pts: string[] = []
  const N = 540
  for (let i = 0; i < N; i++) {
    const th = (i / N) * Math.PI * 2
    let r = R + 0.9 * Math.sin(5 * th + 0.7) + 0.6 * Math.sin(11 * th + 2.1) + 0.35 * Math.sin(23 * th)
    const d = Math.atan2(Math.sin(th), Math.cos(th))         // 0 = right-hand side
    const w = Math.exp(-(d * d) / (2 * 0.55 * 0.55))
    const comb = 0.5 + 0.5 * Math.sin(th * 90 + 3 * Math.sin(th * 7))
    r -= fringe * w * comb * (0.6 + 0.4 * Math.sin(th * 13))
    pts.push(`${(cx + r * Math.cos(th)).toFixed(2)} ${(cy + r * Math.sin(th)).toFixed(2)}`)
  }
  return `M${pts.join('L')}Z`
}

const DISC_PATH = discPath()
const CA_IN_DISC = 'translate(30 21) scale(0.86)'

let maskSeq = 0

/** The mark: brushed disc with "CA" knocked out, so the page shows through the letters. */
export function Mark({ size = 28, className = '' }: { size?: number; className?: string }) {
  const id = useMemo(() => `ca-mask-${++maskSeq}`, [])
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={`mark ${className}`} aria-hidden="true">
      <defs>
        <mask id={id} maskUnits="userSpaceOnUse">
          <rect width="100" height="100" fill="white" />
          <path transform={CA_IN_DISC} d={CA_PATH} fill="black" />
        </mask>
      </defs>
      <path d={DISC_PATH} fill="currentColor" mask={`url(#${id})`} />
    </svg>
  )
}

export function Logo({ size = 22 }: { size?: number }) {
  return (
    <span className="logo" style={{ fontSize: size }} aria-label="CAzen" role="img">
      <Mark className="logo-mark" />
      <span className="wordmark" aria-hidden="true">zen</span>
    </span>
  )
}
