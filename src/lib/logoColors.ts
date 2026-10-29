/**
 * Suggest accent colours from a logo: the most common distinct colours in the image,
 * ignoring transparency, near-white paper and flat greys.
 */
export async function logoColors(bytes: Uint8Array, type: 'png' | 'jpg', max = 4): Promise<string[]> {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: type === 'png' ? 'image/png' : 'image/jpeg' }))
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = reject
      i.src = url
    })
    const size = 96
    const canvas = document.createElement('canvas')
    const scale = Math.min(1, size / Math.max(img.width, img.height))
    canvas.width = Math.max(1, Math.round(img.width * scale))
    canvas.height = Math.max(1, Math.round(img.height * scale))
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data

    // Count colours in coarse buckets, keeping a running average of the real colour in each.
    const buckets = new Map<number, { n: number; r: number; g: number; b: number }>()
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]]
      if (a < 200) continue
      const hi = Math.max(r, g, b), lo = Math.min(r, g, b)
      if (hi > 240 && lo > 225) continue                    // paper / white
      const sat = hi === 0 ? 0 : (hi - lo) / hi
      if (sat < 0.18 && hi > 60) continue                  // flat greys (keep near-black)
      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
      const bk = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 }
      bk.n++; bk.r += r; bk.g += g; bk.b += b
      buckets.set(key, bk)
    }
    const ranked = [...buckets.values()].sort((a, b) => b.n - a.n).map((c) => [c.r / c.n, c.g / c.n, c.b / c.n])
    const picked: number[][] = []
    for (const c of ranked) {
      if (picked.every((p) => Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]) > 60)) picked.push(c)
      if (picked.length >= max) break
    }
    return picked.map(([r, g, b]) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join(''))
  } catch {
    return []
  } finally {
    URL.revokeObjectURL(url)
  }
}
