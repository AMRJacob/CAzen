/**
 * Arrows and leaders on a pad, as lines: a shaft through some points and a head at the last.
 * Dependency-free; everything is in whatever units the caller draws in.
 */
export type Pt = [number, number]

/** The arrowhead at the end of a shaft: a triangle, `width` being the shaft's line width. */
export function headOf(shaft: Pt[], width: number): Pt[] {
  const n = shaft.length
  if (n < 2) return []
  const [x1, y1] = shaft[n - 1]
  // Direction from the last point that is not on top of the tip.
  let k = n - 2
  while (k > 0 && Math.hypot(shaft[k][0] - x1, shaft[k][1] - y1) < width * 0.5) k--
  const [x0, y0] = shaft[k]
  const len = Math.hypot(x1 - x0, y1 - y0) || 1
  const ux = (x1 - x0) / len, uy = (y1 - y0) / len
  const long = Math.max(width * 4.2, 0), wide = Math.max(width * 1.9, 0)
  const bx = x1 - ux * long, by = y1 - uy * long
  return [[x1, y1], [bx - uy * wide, by + ux * wide], [bx + uy * wide, by - ux * wide]]
}

/** The shaft stops where the head begins, so a wide line does not poke through the point. */
export function shaftOf(shaft: Pt[], width: number): Pt[] {
  const n = shaft.length
  if (n < 2) return shaft
  const [x1, y1] = shaft[n - 1], [x0, y0] = shaft[n - 2]
  const len = Math.hypot(x1 - x0, y1 - y0)
  const cut = Math.min(len * 0.9, width * 3.6)
  if (!len) return shaft
  return [...shaft.slice(0, -1), [x1 - ((x1 - x0) / len) * cut, y1 - ((y1 - y0) / len) * cut]]
}

/**
 * A text box's leader, the way a drafter draws one: it leaves the box at the side facing what
 * it points to, level with the first line of text, runs out a short shoulder, then goes to the
 * point. `size` is the box's type size; the box's height is not needed.
 */
export function leaderFrom(box: { x: number; y: number; w: number }, size: number, to: Pt): Pt[] {
  const left = to[0] < box.x + box.w / 2
  const y = box.y + size * 0.62
  const x = left ? box.x - size * 0.25 : box.x + box.w + size * 0.25
  const shoulder: Pt = [x + (left ? -1 : 1) * size * 0.9, y]
  // No shoulder when the point is tucked in close beside the box.
  const beyond = left ? to[0] < shoulder[0] : to[0] > shoulder[0]
  return beyond ? [[x, y], shoulder, to] : [[x, y], to]
}

/** How wide a leader is drawn for a box of this type size. */
export const leaderWidth = (size: number) => size * 0.08
