/**
 * CAzen mark: an ensō — one open brush circle — beside a quiet wordmark.
 * Drawn as a filled shape whose width swells and then thins as the brush lifts,
 * leaving the traditional opening. Computed once; identical on every render.
 */
const ENSO_PATH = (() => {
  const cx = 32, cy = 33, r = 21
  const start = (-58 * Math.PI) / 180          // begin upper right
  const sweep = (318 * Math.PI) / 180          // stop short of a full circle
  const steps = 72
  const outer: string[] = []
  const inner: string[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    // Press in, hold, then lift: smooth swell, both ends tapering to a point.
    const ease = (x: number) => x * x * (3 - 2 * x)
    const pressIn = ease(Math.min(1, t / 0.18))
    const lift = ease(Math.min(1, (1 - t) / 0.3))
    const w = 0.6 + 7.6 * pressIn * lift * (1 - 0.35 * t)
    const a = start - sweep * t                // counter-clockwise, like a right-handed brush
    const ro = r + w / 2, ri = r - w / 2
    outer.push(`${(cx + ro * Math.cos(a)).toFixed(2)} ${(cy + ro * Math.sin(a)).toFixed(2)}`)
    inner.push(`${(cx + ri * Math.cos(a)).toFixed(2)} ${(cy + ri * Math.sin(a)).toFixed(2)}`)
  }
  return `M${outer.join('L')}L${inner.reverse().join('L')}Z`
})()

export function Enso({ size = 28, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={`enso ${className}`} aria-hidden="true">
      <path d={ENSO_PATH} fill="currentColor" />
    </svg>
  )
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="logo">
      <Enso size={size} />
      <span className="wordmark">CA<span>zen</span></span>
    </span>
  )
}
