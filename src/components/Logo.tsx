/**
 * CAzen logo: "CA" written as ONE continuous flat-brush stroke — the C's bowl rises into
 * the A's left leg, peaks, drops down the right leg and hooks back as the crossbar —
 * followed by "zen". The stroke is built by stamping a tilted elliptical nib along a
 * smooth centreline, so thick and thin come from the brush angle, like real calligraphy.
 * Computed once at load; identical on every render.
 */
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

const CA_PATH = brushPath(CENTRELINE)

/** The brush "CA" mark on its own. */
export function Mark({ size = 28, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size * (74 / 66)} height={size} viewBox="0 0 74 66" className={`mark ${className}`} aria-hidden="true">
      <path d={CA_PATH} fill="currentColor" />
    </svg>
  )
}

export function Logo({ size = 22 }: { size?: number }) {
  return (
    <span className="logo" style={{ fontSize: size }} aria-label="CAzen" role="img">
      <svg className="logo-ca" viewBox="0 0 74 66" aria-hidden="true">
        <path d={CA_PATH} fill="currentColor" />
      </svg>
      <span className="wordmark" aria-hidden="true">zen</span>
    </span>
  )
}
