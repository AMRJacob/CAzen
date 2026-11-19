/**
 * What the weather was at the site, for a field report.
 *
 * A field report records what it was like while you were standing there, so this reads the
 * nearest weather station's *observations* rather than a forecast, and picks the one closest to
 * the meeting time. The source is the US National Weather Service (api.weather.gov), which is
 * open data, free for any purpose, and needs no key or account.
 *
 * Two limits come with that source, and both fail quietly back to typing it in:
 *  - station observations go back about seven days, so an old report gets nothing;
 *  - it covers the United States and its territories only.
 *
 * The phrasing follows how these reports are already written: "Overcast, Lower 40s°F".
 */


/** A band rather than a number, which is what a field report says. */
export function temperatureBand(f: number): string {
  const r = Math.round(f)
  if (r < 0) return `${r}°F`
  const tens = Math.floor(r / 10) * 10
  const ones = r - tens
  const where = ones <= 3 ? 'Lower' : ones <= 6 ? 'Mid' : 'Upper'
  return `${where} ${tens}s°F`
}

/** NWS writes conditions in title case already; keep its words, trimmed of its longer joins. */
function condition(text: string | null | undefined): string {
  if (!text) return ''
  return text.replace(/\s+and\s+/gi, ', ').replace(/\s+/g, ' ').trim()
}

interface Observation { time: string; text: string; tempF: number | null }

async function json(url: string, signal?: AbortSignal): Promise<any> {
  // Nothing but Accept. A header of our own turns this into a request the browser must ask
  // permission for first, and the weather service does not grant it — so the lookup failed
  // before it was ever sent, silently, every time.
  const r = await fetch(url, { signal, headers: { Accept: 'application/geo+json' } })
  if (!r.ok) throw new Error(`Weather service returned ${r.status}`)
  return r.json()
}

async function stationsNear(lat: number, lon: number, signal?: AbortSignal): Promise<string[]> {
  const point = await json(`https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`, signal)
  const list = await json(point?.properties?.observationStations, signal)
  return (list?.features ?? []).map((f: any) => f?.properties?.stationIdentifier).filter(Boolean).slice(0, 3)
}

/**
 * Weather at a place and moment, as a field report would put it, or null when it can't be had —
 * no coordinates, outside the US, too long ago, or the service didn't answer.
 *
 * `when` is the local moment of the site visit.
 */
export async function weatherAt(
  lat: number | null | undefined,
  lon: number | null | undefined,
  when: Date,
  signal?: AbortSignal,
): Promise<string | null> {
  if (lat == null || lon == null) return null
  const ageDays = (Date.now() - when.getTime()) / 86_400_000
  if (ageDays > 6.5 || ageDays < -0.5) return null // outside what observations cover

  try {
    const stations = await stationsNear(lat, lon, signal)
    for (const id of stations) {
      // A window around the visit, so a station that reports hourly still has something to give.
      const start = new Date(when.getTime() - 90 * 60_000).toISOString()
      const end = new Date(when.getTime() + 90 * 60_000).toISOString()
      const obs = await json(
        `https://api.weather.gov/stations/${id}/observations?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&limit=20`,
        signal,
      )
      const rows: Observation[] = (obs?.features ?? []).map((f: any) => ({
        time: f?.properties?.timestamp,
        text: condition(f?.properties?.textDescription),
        tempF: f?.properties?.temperature?.value == null ? null : (f.properties.temperature.value * 9) / 5 + 32,
      })).filter((o: Observation) => o.time && (o.text || o.tempF != null))
      if (!rows.length) continue

      // Closest to the time of the visit.
      rows.sort((a, b) => Math.abs(+new Date(a.time) - +when) - Math.abs(+new Date(b.time) - +when))
      const best = rows[0]
      const parts = [best.text, best.tempF == null ? '' : temperatureBand(best.tempF)].filter(Boolean)
      if (parts.length) return parts.join(', ')
    }
  } catch {
    return null // a field report is not worth blocking on the weather
  }
  return null
}

/** The local moment a field report's date and time fields describe. */
export function momentOf(usDate: string, time: string): Date | null {
  const d = usDate.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!d) return null
  const t = time.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*([AaPp])?\.?[Mm]?\.?$/)
  let hour = t ? Number(t[1]) : 12
  const min = t && t[2] ? Number(t[2]) : 0
  if (t?.[3]) {
    const pm = t[3].toLowerCase() === 'p'
    if (pm && hour < 12) hour += 12
    if (!pm && hour === 12) hour = 0
  }
  const when = new Date(Number(d[3]), Number(d[1]) - 1, Number(d[2]), hour, min)
  return Number.isNaN(+when) ? null : when
}


/** How far apart two points are, in metres. */
export function metresBetween(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180, R = 6_371_000
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/**
 * A place, in the words a report would use: number and street, then the town. From
 * OpenStreetMap, the same source the project's own address search uses. Null when it can't say.
 */
export async function placeAt(lat: number, lon: number, signal?: AbortSignal): Promise<string | null> {
  try {
    const url = new URL('https://nominatim.openstreetmap.org/reverse')
    url.searchParams.set('format', 'jsonv2')
    url.searchParams.set('lat', String(lat))
    url.searchParams.set('lon', String(lon))
    url.searchParams.set('zoom', '18')
    const res = await fetch(url, { signal, headers: { Accept: 'application/json' } })
    if (!res.ok) return null
    const a = (await res.json())?.address ?? {}
    const street = [a.house_number, a.road].filter(Boolean).join(' ')
    const town = a.city ?? a.town ?? a.village ?? a.hamlet ?? a.county ?? ''
    const place = [a.building ?? a.amenity ?? a.office ?? '', street, [town, a.state].filter(Boolean).join(', ')].filter(Boolean)
    return place.length ? place.join('\n') : null
  } catch { return null }
}
