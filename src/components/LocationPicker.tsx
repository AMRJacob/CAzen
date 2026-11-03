import { useEffect, useRef, useState } from 'react'
import type * as Leaflet from 'leaflet'

/**
 * A project's location: the address as it should read on forms, found on a map and pinned.
 *
 * Search uses OpenStreetMap's Nominatim. Its usage policy allows at most one request a second for
 * the whole app and rules out search-as-you-type, so CAzen searches only when you click Find,
 * spaces requests at least a second apart and remembers answers in this browser.
 * Map tiles come from OpenStreetMap, credited on the map as their policy requires.
 */
export interface Location { address: string; lat: number | null; lng: number | null }

interface Hit { label: string; address: string; lat: number; lng: number }

const CACHE = 'cazen.geocode.'
let lastRequest = 0

async function geocode(q: string): Promise<Hit[]> {
  const key = CACHE + q.trim().toLowerCase()
  try {
    const hit = localStorage.getItem(key)
    if (hit) return JSON.parse(hit) as Hit[]
  } catch { /* no cache */ }
  const wait = lastRequest + 1100 - Date.now()
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastRequest = Date.now()
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('q', q)
  url.searchParams.set('limit', '5')
  url.searchParams.set('addressdetails', '1')
  url.searchParams.set('countrycodes', 'us')
  const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`The map search answered ${res.status}. Try again in a moment.`)
  type Raw = { display_name: string; lat: string; lon: string; address?: Record<string, string> }
  const hits: Hit[] = ((await res.json()) as Raw[]).map((r) => ({
    label: r.display_name,
    address: tidyAddress(r.address) || r.display_name,
    lat: Number(r.lat),
    lng: Number(r.lon),
  }))
  try { localStorage.setItem(key, JSON.stringify(hits)) } catch { /* fine */ }
  return hits
}

/** "1310 West Daisy L Gatson Bates Drive, Little Rock, AR 72202" from Nominatim's parts. */
function tidyAddress(a?: Record<string, string>): string {
  if (!a) return ''
  const street = [a.house_number, a.road].filter(Boolean).join(' ')
  const city = a.city || a.town || a.village || a.hamlet || a.county || ''
  const state = a['ISO3166-2-lvl4']?.replace(/^US-/, '') || a.state || ''
  const tail = [state, a.postcode].filter(Boolean).join(' ')
  return [street, city, tail].filter(Boolean).join(', ')
}

export function LocationPicker({ value, onChange }: { value: Location; onChange: (v: Location) => void }) {
  const [query, setQuery] = useState(value.address)
  const [hits, setHits] = useState<Hit[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mapEl = useRef<HTMLDivElement>(null)
  const mapRef = useRef<{ L: typeof Leaflet; map: Leaflet.Map; marker: Leaflet.Marker | null } | null>(null)
  const latest = useRef(value)
  latest.current = value

  // Build the map once, the first time there's a point to show.
  const hasPoint = value.lat != null && value.lng != null
  useEffect(() => {
    if (!hasPoint || mapRef.current || !mapEl.current) return
    let cancelled = false
    ;(async () => {
      const L = (await import('leaflet')).default
      await import('leaflet/dist/leaflet.css')
      if (cancelled || !mapEl.current) return
      const map = L.map(mapEl.current, { scrollWheelZoom: false }).setView([value.lat!, value.lng!], 16)
      map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>')
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        referrerPolicy: 'strict-origin-when-cross-origin',
      }).addTo(map)
      mapRef.current = { L, map, marker: null }
      place(value.lat!, value.lng!)
      map.on('click', (e: Leaflet.LeafletMouseEvent) => move(e.latlng.lat, e.latlng.lng))
    })()
    return () => { cancelled = true }
  }, [hasPoint])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { mapRef.current?.map.remove(); mapRef.current = null }, [])

  function place(lat: number, lng: number) {
    const m = mapRef.current
    if (!m) return
    if (!m.marker) {
      const icon = m.L.divIcon({ className: 'loc-pin', html: '<span></span>', iconSize: [22, 30], iconAnchor: [11, 30] })
      m.marker = m.L.marker([lat, lng], { icon, draggable: true, keyboard: true, title: 'Drag to adjust' }).addTo(m.map)
      m.marker.on('dragend', () => { const p = m.marker!.getLatLng(); move(p.lat, p.lng) })
    } else m.marker.setLatLng([lat, lng])
  }
  function move(lat: number, lng: number) {
    place(lat, lng)
    onChange({ ...latest.current, lat: round(lat), lng: round(lng) })
  }

  // When a search result is chosen, recentre.
  useEffect(() => {
    const m = mapRef.current
    if (m && hasPoint) { place(value.lat!, value.lng!); m.map.setView([value.lat!, value.lng!], Math.max(m.map.getZoom(), 16)) }
  }, [value.lat, value.lng])  // eslint-disable-line react-hooks/exhaustive-deps

  async function find() {
    if (!query.trim()) return
    setBusy(true)
    setError(null)
    try {
      const h = await geocode(query)
      setHits(h)
      if (!h.length) setError('No match. Try adding the city and state, or a nearby street.')
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }

  function choose(h: Hit) {
    setHits(null)
    setQuery(h.address)
    onChange({ address: h.address, lat: round(h.lat), lng: round(h.lng) })
  }

  const mapsLink = hasPoint ? `https://maps.apple.com/?ll=${value.lat},${value.lng}&q=${encodeURIComponent(value.address || 'Project')}` : null

  return (
    <div className="loc">
      <div className="loc-search">
        <input
          value={query}
          placeholder="Street address, city, state"
          onChange={(e) => { setQuery(e.target.value); onChange({ ...value, address: e.target.value }) }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); find() } }}
          aria-label="Location"
        />
        <button type="button" onClick={find} disabled={busy || !query.trim()}>{busy ? 'Finding…' : 'Find on map'}</button>
      </div>
      {hits && hits.length > 0 && (
        <ul className="loc-hits" role="listbox" aria-label="Matches">
          {hits.map((h, i) => (
            <li key={i}><button type="button" onClick={() => choose(h)}><strong>{h.address}</strong><span className="muted small">{h.label}</span></button></li>
          ))}
        </ul>
      )}
      {error && <p className="small bad-text">{error}</p>}
      {hasPoint ? (
        <>
          <div className="loc-map" ref={mapEl} />
          <p className="muted small loc-foot">
            Drag the pin, or click the map, to put it on the site entrance or the building.
            {mapsLink && <> <a href={mapsLink} target="_blank" rel="noreferrer">Open in Maps</a></>}
          </p>
        </>
      ) : (
        <p className="muted small">Type the address and click <strong>Find on map</strong> to pin it. The address text is what appears on forms; you can edit it after picking a match.</p>
      )}
    </div>
  )
}

const round = (n: number) => Math.round(n * 1e6) / 1e6
