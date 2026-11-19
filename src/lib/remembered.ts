/**
 * The last answer the server gave, kept on the device.
 *
 * Who the firm is and which projects it has change a few times a year, and the app can't draw a
 * single screen without them. So the last good answer is shown at once and the server is asked
 * behind it: with signal the screen is right a moment later, and without it the app still opens.
 */
export function remembered<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch { return null }
}

export function remember(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* full, or private mode */ }
}

export function forget(prefix: string): void {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(prefix)) localStorage.removeItem(k)
  } catch { /* ignore */ }
}
