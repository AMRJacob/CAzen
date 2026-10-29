/**
 * CAzen logo: the "C" is an ensō — one open brush circle — followed by "Azen".
 * Drawn as a filled shape whose width swells and then thins as the brush lifts.
 * Computed once; identical on every render.
 */
function ensoPath(startDeg: number, sweepDeg: number) {
  const cx = 32, cy = 32, r = 21
  const start = (startDeg * Math.PI) / 180
  const sweep = (sweepDeg * Math.PI) / 180
  const steps = 72
  const ease = (x: number) => x * x * (3 - 2 * x)
  const outer: string[] = []
  const inner: string[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    // Press in, hold, then lift: smooth swell, both ends tapering to a point.
    const w = 0.6 + 7.6 * ease(Math.min(1, t / 0.18)) * ease(Math.min(1, (1 - t) / 0.3)) * (1 - 0.35 * t)
    const a = start - sweep * t                // counter-clockwise, like a right-handed brush
    const ro = r + w / 2, ri = r - w / 2
    outer.push(`${(cx + ro * Math.cos(a)).toFixed(2)} ${(cy + ro * Math.sin(a)).toFixed(2)}`)
    inner.push(`${(cx + ri * Math.cos(a)).toFixed(2)} ${(cy + ri * Math.sin(a)).toFixed(2)}`)
  }
  return `M${outer.join('L')}L${inner.reverse().join('L')}Z`
}

// Opening faces right, like a capital C: starts upper right, sweeps over the top and round.
const C_PATH = ensoPath(-38, 290)

/** The ensō on its own (favicon, loading marks). */
export function Enso({ size = 28, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="5 5 54 54" className={`enso ${className}`} aria-hidden="true">
      <path d={C_PATH} fill="currentColor" />
    </svg>
  )
}

export function Logo({ size = 22 }: { size?: number }) {
  return (
    <span className="logo" style={{ fontSize: size }} aria-label="CAzen" role="img">
      <svg className="logo-c" viewBox="5 5 54 54" aria-hidden="true">
        <path d={C_PATH} fill="currentColor" />
      </svg>
      <span className="wordmark" aria-hidden="true">A<span>zen</span></span>
    </span>
  )
}
