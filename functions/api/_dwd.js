import { unzipSync, strFromU8 } from 'fflate'

// ---------------------------------------------------------------------------
// DWD Open Data — daily climate (KL) endpoints
//
// Shared logic for the Pages Functions in this directory. The leading
// underscore keeps this file out of Pages' file-based routing — it is imported
// by stations.js / data.js, never served directly.
// ---------------------------------------------------------------------------
const DWD_BASE =
  'https://opendata.dwd.de/climate_environment/CDC/observations_germany/climate/daily/kl'
const STATIONS_URL = `${DWD_BASE}/historical/KL_Tageswerte_Beschreibung_Stationen.txt`
const HIST_DIR = `${DWD_BASE}/historical/`
const RECENT_DIR = `${DWD_BASE}/recent/`

const ONE_DAY = 86400
// Short *browser* cache so data/schema changes propagate within minutes, but a
// long *shared* cache (s-maxage) keeps the Cloudflare edge serving for a day and
// shields DWD's servers. The in-function caches.default also honours s-maxage.
const CACHE_CONTROL = `public, max-age=600, s-maxage=${ONE_DAY}`

// ---------------------------------------------------------------------------
// /api/stations  — the catalogue of weather stations
// ---------------------------------------------------------------------------
export async function handleStations(ctx) {
  const cache = caches.default
  const cacheKey = new Request('https://dwd.cache/v1/stations')
  const hit = await cache.match(cacheKey)
  if (hit) return hit

  const res = await fetch(STATIONS_URL, { cf: { cacheTtl: ONE_DAY } })
  if (!res.ok) throw new Error(`Station list unavailable (${res.status})`)
  // DWD text files are ISO-8859-1 (umlauts). Decode bytes 1:1 to code points.
  const text = latin1(new Uint8Array(await res.arrayBuffer()))

  const stations = parseStations(text)
  const out = json({ count: stations.length, stations }, 200, {
    'Cache-Control': CACHE_CONTROL,
  })
  ctx.waitUntil(cache.put(cacheKey, out.clone()))
  return out
}

// The parsed station catalogue as an array (shares the same cache as the
// /api/stations endpoint). Used server-side to resolve a station name for meta
// tags without an extra round trip.
export async function loadStations(ctx) {
  const out = await handleStations(ctx)
  const { stations } = await out.json()
  return stations
}

function parseStations(text) {
  const lines = text.split(/\r?\n/)
  const stations = []
  // First two lines are the header and the dashed separator.
  for (let i = 2; i < lines.length; i++) {
    const line = lines[i]
    if (!line || !line.trim()) continue
    // id  von_datum  bis_datum  hoehe  breite  laenge  <name> <bundesland> Frei
    const m = line.match(
      /^(\d+)\s+(\d{8})\s+(\d{8})\s+(-?\d+)\s+(-?\d+\.\d+)\s+(-?\d+\.\d+)\s+(.+)$/,
    )
    if (!m) continue
    // Name and Bundesland are padded apart by 2+ spaces.
    const parts = m[7].split(/\s{2,}/).filter(Boolean)
    const name = parts[0] ? parts[0].trim() : ''
    const state = parts[1] ? parts[1].trim() : ''
    stations.push({
      id: m[1].padStart(5, '0'),
      name,
      state,
      from: m[2],
      to: m[3],
      elevation: Number(m[4]),
      lat: Number(m[5]),
      lon: Number(m[6]),
    })
  }
  stations.sort((a, b) => a.name.localeCompare(b.name, 'de'))
  return stations
}

// ---------------------------------------------------------------------------
// /api/data?station=ID  — yearly temperature aggregates for one station
// ---------------------------------------------------------------------------
export async function handleData(url, ctx) {
  const raw = url.searchParams.get('station')
  if (!raw) return json({ error: 'Missing ?station=' }, 400)
  const id = raw.padStart(5, '0')
  if (!/^\d{5}$/.test(id)) return json({ error: 'Invalid station id' }, 400)

  const cache = caches.default
  const cacheKey = new Request(`https://dwd.cache/v2/data/${id}`)
  const hit = await cache.match(cacheKey)
  if (hit) return hit

  const file = await resolveDataFile(id)
  if (!file) return json({ error: `No daily KL data found for station ${id}` }, 404)

  const res = await fetch(file.url, { cf: { cacheTtl: ONE_DAY } })
  if (!res.ok) throw new Error(`Data download failed (${res.status})`)

  const buf = new Uint8Array(await res.arrayBuffer())
  const files = unzipSync(buf)
  const entryName = Object.keys(files).find((n) => n.startsWith('produkt'))
  if (!entryName) throw new Error('Archive contained no produkt file')

  const years = aggregateYears(strFromU8(files[entryName]))

  const out = json(
    { id, source: file.url, kind: file.kind, years },
    200,
    { 'Cache-Control': CACHE_CONTROL },
  )
  ctx.waitUntil(cache.put(cacheKey, out.clone()))
  return out
}

// Find the historical archive for a station; fall back to "recent".
async function resolveDataFile(id) {
  const histIndex = await getDirIndex(HIST_DIR, /tageswerte_KL_(\d{5})_\d{8}_\d{8}_hist\.zip/g)
  if (histIndex[id]) return { url: HIST_DIR + histIndex[id], kind: 'historical' }

  const recentIndex = await getDirIndex(RECENT_DIR, /tageswerte_KL_(\d{5})_akt\.zip/g)
  if (recentIndex[id]) return { url: RECENT_DIR + recentIndex[id], kind: 'recent' }

  return null
}

// Fetch an Apache directory listing once and map station id -> filename.
async function getDirIndex(dir, regex) {
  const cache = caches.default
  const cacheKey = new Request('https://dwd.cache/v1/index?d=' + encodeURIComponent(dir))
  const hit = await cache.match(cacheKey)
  if (hit) return hit.json()

  const res = await fetch(dir, { cf: { cacheTtl: ONE_DAY } })
  if (!res.ok) throw new Error(`Directory listing failed (${res.status})`)
  const html = await res.text()

  const index = {}
  let m
  regex.lastIndex = 0
  while ((m = regex.exec(html)) !== null) index[m[1]] = m[0]

  const stored = json(index, 200, { 'Cache-Control': CACHE_CONTROL })
  await cache.put(cacheKey, stored.clone())
  return index
}

// Parse the semicolon-separated produkt file into per-year aggregates:
// temperature extremes/mean, precipitation & sunshine totals, snow, and
// threshold day-counts (frost/ice/summer/hot days, tropical nights).
function aggregateYears(text) {
  const lines = text.split(/\r?\n/)
  const header = lines[0].split(';').map((s) => s.trim())
  const iDate = header.indexOf('MESS_DATUM')
  const iMax = header.indexOf('TXK') // daily maximum air temperature (2 m)
  const iMin = header.indexOf('TNK') // daily minimum air temperature (2 m)
  const iMean = header.indexOf('TMK') // daily mean air temperature
  const iRain = header.indexOf('RSK') // daily precipitation height [mm]
  const iSun = header.indexOf('SDK') // daily sunshine duration [h]
  const iSnow = header.indexOf('SHK_TAG') // daily snow depth [cm]
  if (iDate < 0 || iMax < 0 || iMin < 0) throw new Error('Unexpected file columns')

  const blank = (year) => ({
    year,
    tmax: null, tmin: null, maxDate: null, minDate: null,
    sum: 0, n: 0, days: 0,
    rainSum: 0, rainN: 0,
    sunSum: 0, sunN: 0,
    snowMax: null, snowDays: 0, snowN: 0,
    txN: 0, tnN: 0,
    summerDays: 0, hotDays: 0, frostDays: 0, iceDays: 0, tropNights: 0,
  })

  const byYear = new Map()
  for (let k = 1; k < lines.length; k++) {
    const ln = lines[k]
    if (!ln) continue
    const c = ln.split(';')
    const date = (c[iDate] || '').trim()
    if (date.length < 8) continue
    const year = +date.slice(0, 4)

    let y = byYear.get(year)
    if (!y) {
      y = blank(year)
      byYear.set(year, y)
    }
    y.days++

    const tx = num(c[iMax])
    if (tx !== null) {
      y.txN++
      if (y.tmax === null || tx > y.tmax) {
        y.tmax = tx
        y.maxDate = date
      }
      if (tx >= 30) y.hotDays++
      if (tx >= 25) y.summerDays++
      if (tx < 0) y.iceDays++
    }
    const tn = num(c[iMin])
    if (tn !== null) {
      y.tnN++
      if (y.tmin === null || tn < y.tmin) {
        y.tmin = tn
        y.minDate = date
      }
      if (tn < 0) y.frostDays++
      if (tn >= 20) y.tropNights++
    }
    const tm = num(c[iMean])
    if (tm !== null) {
      y.sum += tm
      y.n++
    }
    if (iRain >= 0) {
      const r = num(c[iRain])
      if (r !== null && r >= 0) {
        y.rainSum += r
        y.rainN++
      }
    }
    if (iSun >= 0) {
      const s = num(c[iSun])
      if (s !== null && s >= 0) {
        y.sunSum += s
        y.sunN++
      }
    }
    if (iSnow >= 0) {
      const sh = num(c[iSnow])
      if (sh !== null && sh >= 0) {
        y.snowN++
        if (y.snowMax === null || sh > y.snowMax) y.snowMax = sh
        if (sh > 0) y.snowDays++
      }
    }
  }

  return [...byYear.values()]
    .map((y) => ({
      year: y.year,
      tmax: y.tmax,
      tmin: y.tmin,
      tmean: y.n ? round1(y.sum / y.n) : null,
      maxDate: y.maxDate,
      minDate: y.minDate,
      days: y.days,
      // totals (null when the station never measured that variable that year)
      precip: y.rainN ? round1(y.rainSum) : null,
      sun: y.sunN ? round1(y.sunSum) : null,
      snowMax: y.snowN ? y.snowMax : null,
      snowDays: y.snowN ? y.snowDays : null,
      // threshold day-counts (null when the underlying temp series is absent)
      summerDays: y.txN ? y.summerDays : null,
      hotDays: y.txN ? y.hotDays : null,
      iceDays: y.txN ? y.iceDays : null,
      frostDays: y.tnN ? y.frostDays : null,
      tropNights: y.tnN ? y.tropNights : null,
    }))
    .sort((a, b) => a.year - b.year)
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
function num(v) {
  if (v == null) return null
  const n = Number(v.trim())
  if (!Number.isFinite(n) || n <= -999) return null
  return n
}

function round1(n) {
  return Math.round(n * 10) / 10
}

function latin1(bytes) {
  let out = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK))
  }
  return out
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  })
}
