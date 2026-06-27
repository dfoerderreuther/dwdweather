// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------
export async function getStations() {
  const r = await fetch('/api/stations')
  if (!r.ok) throw new Error(`Could not load stations (${r.status})`)
  const j = await r.json()
  return j.stations
}

export async function getStationData(id) {
  const r = await fetch(`/api/data?station=${encodeURIComponent(id)}`)
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || `Could not load data (${r.status})`)
  return j
}

// ---------------------------------------------------------------------------
// formatting
// ---------------------------------------------------------------------------
export function fmtDate(yyyymmdd) {
  if (!yyyymmdd || yyyymmdd.length < 8) return ''
  const y = yyyymmdd.slice(0, 4)
  const m = +yyyymmdd.slice(4, 6)
  const d = +yyyymmdd.slice(6, 8)
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ]
  return `${d} ${months[m - 1]} ${y}`
}

export function fmtTemp(t) {
  if (t == null) return '–'
  return (t > 0 ? '+' : '') + t.toFixed(1)
}

// ---------------------------------------------------------------------------
// color — a perceptual cold→hot scale for temperature values (°C)
// ---------------------------------------------------------------------------
const TEMP_STOPS = [
  [-22, [20, 55, 82]], //  deep cold blue
  [-8, [38, 92, 130]],
  [-1, [62, 120, 150]],
  [6, [110, 148, 132]], //  muted sage — stays distinct from the cream paper
  [12, [196, 158, 92]], //  ochre
  [20, [202, 112, 50]],
  [28, [188, 72, 38]],
  [37, [140, 40, 18]], //  deep hot
]

export function tempColor(t) {
  return interp(TEMP_STOPS, t)
}

// diverging blue–neutral–red scale around an anomaly (°C vs reference)
const ANOM_STOPS = [
  [-2.5, [23, 60, 87]],
  [-1, [70, 120, 158]],
  [-0.3, [150, 178, 188]],
  [0, [226, 214, 186]],
  [0.3, [214, 168, 120]],
  [1, [200, 96, 52]],
  [2.5, [143, 42, 19]],
]

export function anomalyColor(a) {
  return interp(ANOM_STOPS, a)
}

function interp(stops, v) {
  if (v <= stops[0][0]) return rgb(stops[0][1])
  if (v >= stops[stops.length - 1][0]) return rgb(stops[stops.length - 1][1])
  for (let i = 0; i < stops.length - 1; i++) {
    const [a, ca] = stops[i]
    const [b, cb] = stops[i + 1]
    if (v >= a && v <= b) {
      const t = (v - a) / (b - a)
      return rgb([
        ca[0] + (cb[0] - ca[0]) * t,
        ca[1] + (cb[1] - ca[1]) * t,
        ca[2] + (cb[2] - ca[2]) * t,
      ])
    }
  }
  return rgb(stops[stops.length - 1][1])
}

function rgb(c) {
  return `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`
}

// ---------------------------------------------------------------------------
// stats — least-squares slope (°C per decade) over yearly means
// ---------------------------------------------------------------------------
export function linregByDecade(points) {
  const pts = points.filter((p) => p.y != null)
  const n = pts.length
  if (n < 3) return null
  let sx = 0, sy = 0, sxx = 0, sxy = 0
  for (const p of pts) {
    sx += p.x
    sy += p.y
    sxx += p.x * p.x
    sxy += p.x * p.y
  }
  const denom = n * sxx - sx * sx
  if (denom === 0) return null
  const slope = (n * sxy - sx * sy) / denom
  const intercept = (sy - slope * sx) / n
  return { slopePerYear: slope, perDecade: slope * 10, intercept }
}

// Centered moving average over a window of `win` years.
// points: [{ year, value }] sorted ascending. Returns aligned [{ year, value }]
// where value is null when fewer than half the window has data.
export function movingAverage(points, win = 10) {
  const half = Math.floor(win / 2)
  const need = Math.ceil(win / 2)
  return points.map((p) => {
    let sum = 0
    let n = 0
    for (const q of points) {
      if (q.value == null) continue
      if (q.year >= p.year - (half - 1) && q.year <= p.year + half) {
        sum += q.value
        n++
      }
    }
    return { year: p.year, value: n >= need ? sum / n : null }
  })
}

export function niceStep(range, target = 6) {
  const raw = range / target
  const pow = Math.pow(10, Math.floor(Math.log10(raw)))
  const candidates = [1, 2, 2.5, 5, 10].map((m) => m * pow)
  return candidates.find((c) => c >= raw) || candidates[candidates.length - 1]
}
