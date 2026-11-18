import { useCallback, useEffect, useState } from 'react'

/**
 * How this person likes CAzen to look, on this device.
 *
 * These are view preferences, not project data — which way a list is grouped, how wide a column
 * is. They belong to the person at the keyboard rather than to the firm or the project, so they
 * stay in this browser and are never written to the database or shared with anyone.
 *
 * The event is what keeps two parts of the app honest with each other: change the setting in
 * Settings and the sheet list regroups without a reload, because both are reading the same key.
 */

const EVENT = 'cazen:pref'

export const PREFS = {
  /** Group the viewer's sheet list by trade, with headings that collapse. */
  groupSheetList: 'cazen.pref.groupSheetList',
  /** Column widths on the drawings register, keyed by column. */
  registerWidths: 'cazen.pref.registerWidths',
  /** Show what a stylus is reporting while drawing — pressure, tilt, samples a second. */
  stylusReadout: 'cazen.pref.stylusReadout',
} as const

export function readPref<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch { return fallback }
}

export function writePref<T>(key: string, value: T): void {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* a browser that won't keep it still works */ }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: key }))
}

/** A preference, and a way to change it, kept in step wherever else it is being read. */
export function usePref<T>(key: string, fallback: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => readPref(key, fallback))

  useEffect(() => {
    const sync = (e: Event) => {
      // Our own change, or another tab's.
      if (e instanceof CustomEvent && e.detail !== key) return
      if (e instanceof StorageEvent && e.key !== key) return
      setValue(readPref(key, fallback))
    }
    window.addEventListener(EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(EVENT, sync)
      window.removeEventListener('storage', sync)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const set = useCallback((v: T) => { writePref(key, v); setValue(v) }, [key])
  return [value, set]
}
