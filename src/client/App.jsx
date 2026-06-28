import React, { useEffect, useMemo, useState } from 'react'
import StationPicker from './components/StationPicker.jsx'
import StationsMap from './components/StationsMap.jsx'
import RangeSlider from './components/RangeSlider.jsx'
import WarmingStripes from './components/WarmingStripes.jsx'
import YearlyTempChart from './components/YearlyTempChart.jsx'
import AnnualBarChart from './components/AnnualBarChart.jsx'
import DayCountChart from './components/DayCountChart.jsx'
import Imprint from './components/Imprint.jsx'
import { getStations, getStationData, fmtTemp, fmtDate, linregByDecade } from './lib.js'

// ---- URL <-> state ---------------------------------------------------------
// Selection + chart range live in the path (deep-linkable & shareable):
//   /station/<id>                — full range
//   /station/<id>/<lo>-<hi>      — narrowed to those years
function idFromPath() {
  const m = window.location.pathname.match(/^\/station\/(\d{1,5})/)
  return m ? m[1].padStart(5, '0') : null
}
// Range segment, if any. Returns [lo, hi] (unclamped) or null.
function rangeFromPath() {
  const m = window.location.pathname.match(/^\/station\/\d{1,5}\/(\d{3,4})-(\d{3,4})/)
  return m ? [+m[1], +m[2]] : null
}
function clampRange([lo, hi], min, max) {
  const a = Math.max(min, Math.min(lo, max))
  const b = Math.max(min, Math.min(hi, max))
  return a <= b ? [a, b] : [min, max]
}
function stationPath(id, range, isFull) {
  if (!id) return '/'
  return range && !isFull ? `/station/${id}/${range[0]}-${range[1]}` : `/station/${id}`
}
function pushStation(id) {
  const path = id ? `/station/${id}` : '/'
  if (window.location.pathname !== path) window.history.pushState({ id }, '', path)
}

// ---- map (MapTiler) consent -----------------------------------------------
// The only third-party that sets a cookie / sees the user's IP is MapTiler, and
// only when the map loads. We gate that behind explicit consent, remembered in
// localStorage (not a cookie). Values: 'granted' | 'denied' | null (undecided).
const CONSENT_KEY = 'map-consent'
function readConsent() {
  try {
    return localStorage.getItem(CONSENT_KEY)
  } catch {
    return null
  }
}
function writeConsent(v) {
  try {
    localStorage.setItem(CONSENT_KEY, v)
  } catch {
    /* private mode / storage disabled — fall back to in-memory only */
  }
}

export default function App() {
  const [stations, setStations] = useState(null)
  const [stationsErr, setStationsErr] = useState(null)
  const [selectedId, setSelectedId] = useState(idFromPath)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [dataErr, setDataErr] = useState(null)
  const [mapStations, setMapStations] = useState(null)
  // picker + map collapse once a station is chosen; this re-opens them to browse
  const [browseOpen, setBrowseOpen] = useState(false)
  const [route, setRoute] = useState(window.location.pathname)
  const [consent, setConsentState] = useState(readConsent)

  function decideConsent(v) {
    writeConsent(v)
    setConsentState(v)
  }

  // load catalogue once
  useEffect(() => {
    getStations().then(setStations).catch((e) => setStationsErr(e.message))
  }, [])

  // browser back/forward
  useEffect(() => {
    const onPop = () => {
      setSelectedId(idFromPath())
      setRoute(window.location.pathname)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // simple client-side navigation (used for the imprint link / back)
  function go(to) {
    if (window.location.pathname !== to) window.history.pushState({}, '', to)
    setSelectedId(idFromPath())
    setRoute(to)
  }

  // base tab title for the landing view (Dossier sets the per-station one)
  useEffect(() => {
    if (!selectedId) document.title = 'DWD Weather — German Climate Almanac'
  }, [selectedId])

  // fetch the selected station's series
  useEffect(() => {
    if (!selectedId) {
      setData(null)
      setDataErr(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setDataErr(null)
    getStationData(selectedId)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && (setDataErr(e.message), setData(null)))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [selectedId])

  const selected = useMemo(
    () => (stations && selectedId ? stations.find((s) => s.id === selectedId) : null),
    [stations, selectedId],
  )

  // Starter chips: the oldest stations that are still recording today, so the
  // landmarks double as the deepest available temperature histories.
  const suggestions = useMemo(() => {
    if (!stations) return []
    const maxTo = stations.reduce((m, s) => Math.max(m, +s.to.slice(0, 4)), 0)
    return stations
      .filter((s) => +s.to.slice(0, 4) >= maxTo - 1) // still active
      .sort((a, b) => a.from.localeCompare(b.from)) // oldest start first
      .slice(0, 6)
  }, [stations])

  function select(station) {
    setSelectedId(station.id)
    pushStation(station.id)
    setBrowseOpen(false) // collapse the picker/map back down after choosing
  }
  function selectById(id) {
    setSelectedId(id)
    pushStation(id)
    setBrowseOpen(false)
  }

  const stats = useMemo(() => (data ? computeStats(data.years) : null), [data])

  if (route === '/imprint') {
    return (
      <div className="page">
        <header className="masthead reveal">
          <h1 className="masthead-link" onClick={() => go('/')}>
            DWD <span className="grad">Weather</span> Stats
          </h1>
          <div className="thermal-rule" />
        </header>
        <Imprint onHome={() => go('/')} />
        <Footer onImprint={() => go('/imprint')} />
        {consent == null && (
          <ConsentBanner
            onAccept={() => decideConsent('granted')}
            onDecline={() => decideConsent('denied')}
            onImprint={() => go('/imprint')}
          />
        )}
      </div>
    )
  }

  return (
    <div className="page">
      <header className="masthead reveal">
        <h1>
          DWD <span className="grad">Weather</span> Stats
        </h1>
        <div className="thermal-rule" />
      </header>

      {/* Compact bar shown once a station is picked — click to browse again. */}
      {selected && (
        <button
          className="browse-bar reveal"
          onClick={() => setBrowseOpen((o) => !o)}
          aria-expanded={browseOpen}
        >
          <span className="kicker">Station</span>
          <strong className="browse-name">{selected.name}</strong>
          <span className="browse-cta">
            {browseOpen ? 'Hide' : 'Change'}
            <i className="chev" data-open={browseOpen} />
          </span>
        </button>
      )}

      {(!selected || browseOpen) && (
        <>
          <section className="finder reveal" style={{ animationDelay: '120ms' }}>
            <div className="finder-label">
              <span className="kicker">Station</span>
            </div>
            {stationsErr ? (
              <div className="error-box">Could not load the station catalogue — {stationsErr}</div>
            ) : !stations ? (
              <div className="combo">
                <div className="combo-input" style={{ color: 'var(--ink-soft)', fontStyle: 'italic' }}>
                  Loading {`${'…'}`} fetching the German station catalogue
                </div>
              </div>
            ) : (
              <StationPicker
                stations={stations}
                selected={selected}
                onSelect={select}
                onFiltered={setMapStations}
              />
            )}
          </section>

          {stations && (
            <section className="section" style={{ marginTop: '34px' }}>
              <div className="section-head">
                <h3>Station map</h3>
                <span className="desc">
                  {(mapStations || stations).length.toLocaleString('en')} stations match — coloured by
                  elevation. Click any to load it.
                </span>
              </div>
              {consent === 'granted' ? (
                <StationsMap stations={mapStations || stations} selectedId={selectedId} onSelect={select} />
              ) : (
                <MapGate onEnable={() => decideConsent('granted')} onImprint={() => go('/imprint')} />
              )}
            </section>
          )}
        </>
      )}

      {!selectedId && stations && (
        <section className="empty-hero reveal" style={{ animationDelay: '220ms' }}>
          <p className="lead">
            {stations.length.toLocaleString('en')} stations on file. Pick one to read its
            temperature history — or start with one of the oldest still recording today:
          </p>
          <div className="suggestions">
            {suggestions.map((s) => (
              <button key={s.id} className="chip" onClick={() => selectById(s.id)}>
                {s.name} <span className="chip-year">since {s.from.slice(0, 4)}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {dataErr && <div className="error-box">Could not load data — {dataErr}</div>}

      {loading && (
        <div className="state-box">
          <div className="spinner" />
          <div className="big">Reading the archive{`${'…'}`}</div>
          <div className="sub">Downloading & unpacking decades of daily records</div>
        </div>
      )}

      {data && selected && !loading && (
        <Dossier key={selected.id} data={data} station={selected} stats={stats} />
      )}

      <Footer onImprint={() => go('/imprint')} />
      {consent == null && (
        <ConsentBanner
          onAccept={() => decideConsent('granted')}
          onDecline={() => decideConsent('denied')}
          onImprint={() => go('/imprint')}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
function MapGate({ onEnable, onImprint }) {
  return (
    <div className="map-gate">
      <p className="map-gate-title">Interactive map is off</p>
      <p className="map-gate-text">
        The map is loaded from MapTiler, which sets a cookie and receives your IP address. Nothing
        else on this site uses cookies.
      </p>
      <div className="map-gate-actions">
        <button className="map-gate-btn" onClick={onEnable}>
          Load map
        </button>
        <a
          href="/imprint"
          className="map-gate-link"
          onClick={(e) => {
            e.preventDefault()
            onImprint()
          }}
        >
          Details
        </a>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
function ConsentBanner({ onAccept, onDecline, onImprint }) {
  return (
    <div className="consent" role="dialog" aria-label="Cookie consent">
      <p className="consent-text">
        This site sets no cookies of its own. The interactive map (MapTiler) sets one cookie and
        receives your IP address only if you enable it.{' '}
        <a
          href="/imprint"
          className="consent-link"
          onClick={(e) => {
            e.preventDefault()
            onImprint()
          }}
        >
          Learn more
        </a>
      </p>
      <div className="consent-actions">
        <button className="consent-btn ghost" onClick={onDecline}>
          Decline
        </button>
        <button className="consent-btn primary" onClick={onAccept}>
          Allow map
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
function Footer({ onImprint }) {
  return (
    <footer className="colophon">
      <span>
        Source ·{' '}
        <a href="https://opendata.dwd.de" target="_blank" rel="noreferrer">
          opendata.dwd.de
        </a>{' '}
        · CDC daily KL
      </span>
      <span>
        Temperatures TXK / TNK / TMK at 2 m · °C ·{' '}
        <a href="/imprint" className="imprint-link" onClick={(e) => { e.preventDefault(); onImprint() }}>
          Imprint
        </a>
      </span>
    </footer>
  )
}

// ---------------------------------------------------------------------------
function Dossier({ data, station, stats }) {
  const firstYear = data.years[0].year
  const lastYear = data.years[data.years.length - 1].year
  // Seed from the URL (/station/<id>/<lo>-<hi>), clamped to this station's span.
  const [range, setRange] = useState(() => {
    const fromUrl = rangeFromPath()
    return fromUrl ? clampRange(fromUrl, firstYear, lastYear) : [firstYear, lastYear]
  })

  const shownYears = useMemo(
    () => data.years.filter((y) => y.year >= range[0] && y.year <= range[1]),
    [data.years, range],
  )
  const isFull = range[0] <= firstYear && range[1] >= lastYear

  // Keep the path in sync with the range. replaceState (not push) so dragging
  // the slider doesn't flood the back-button history.
  useEffect(() => {
    const path = stationPath(station.id, range, isFull)
    if (window.location.pathname !== path) {
      window.history.replaceState(window.history.state, '', path)
    }
  }, [station.id, range, isFull])

  // tab title mirrors the server-rendered one: DWD Weather / <name> / <lo>–<hi>
  useEffect(() => {
    document.title = `DWD Weather / ${station.name} / ${range[0]}–${range[1]}`
  }, [station.name, range])

  // Mean change: difference between the first and last decade's average annual
  // mean — single years are too noisy. Needs two non-overlapping 10-year windows
  // (≥ 20 years with data); otherwise the range is too short to be meaningful.
  const MEAN_WINDOW = 10
  const meanChange = useMemo(() => {
    const wm = shownYears.filter((y) => y.tmean != null)
    if (wm.length < 2 * MEAN_WINDOW) return null
    const head = wm.slice(0, MEAN_WINDOW)
    const tail = wm.slice(-MEAN_WINDOW)
    const avg = (a) => a.reduce((s, y) => s + y.tmean, 0) / a.length
    return {
      delta: avg(tail) - avg(head),
      fromLabel: `${head[0].year}–${head[head.length - 1].year}`,
      toLabel: `${tail[0].year}–${tail[tail.length - 1].year}`,
    }
  }, [shownYears])

  return (
    <div className="dossier reveal">
      <div className="dossier-head">
        <div>
          <h2>{station.name}</h2>
          <div className="dossier-coords left">
            <b>{station.lat.toFixed(4)}°N</b> · <b>{station.lon.toFixed(4)}°E</b> ·{' '}
            {station.elevation} m · {station.state} · station №{station.id}
          </div>
        </div>
        <div className="chart-range">
          <span className="flabel">Chart range</span>
          <RangeSlider min={firstYear} max={lastYear} value={range} onChange={setRange} active={!isFull} />
          <span className="year-readout" data-on={!isFull}>
            {range[0]}–{range[1]}
          </span>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat hot">
          <span className="label">Record high</span>
          <span className="value">
            {fmtTemp(stats.recHigh.tmax)}
            <span className="unit">°C</span>
          </span>
          <span className="foot">{fmtDate(stats.recHigh.maxDate)}</span>
        </div>
        <div className="stat cold">
          <span className="label">Record low</span>
          <span className="value">
            {fmtTemp(stats.recLow.tmin)}
            <span className="unit">°C</span>
          </span>
          <span className="foot">{fmtDate(stats.recLow.minDate)}</span>
        </div>
        <div className="stat">
          <span className="label">Mean change</span>
          <span className="value">
            {meanChange ? (
              <>
                <span className={meanChange.delta >= 0 ? 'trend-up' : 'trend-dn'}>
                  {meanChange.delta >= 0 ? '+' : '−'}
                  {Math.abs(meanChange.delta).toFixed(1)}
                </span>
                <span className="unit">°C</span>
              </>
            ) : (
              '–'
            )}
          </span>
          <span className="foot">
            {meanChange
              ? `${meanChange.fromLabel} → ${meanChange.toLabel}`
              : `needs ≥ ${2 * MEAN_WINDOW} yrs`}
          </span>
        </div>
        <div className="stat">
          <span className="label">Warming trend</span>
          <span className="value">
            <span className={stats.trend > 0 ? 'trend-up' : 'trend-dn'}>
              {stats.trend > 0 ? '+' : ''}
              {stats.trend.toFixed(2)}
            </span>
            <span className="unit">°C/decade</span>
          </span>
          <span className="foot">least-squares · annual mean</span>
        </div>
      </div>

      <section className="section">
        <div className="section-head">
          <h3>Yearly temperature envelope</h3>
          <span className="desc">
            Each bar spans that year’s coldest night to its hottest day; the dots mark the annual
            mean, the smooth curves a 10-year average of each series. Use the toggles to focus on
            any combination — the axis rescales to fit.
          </span>
        </div>
        <YearlyTempChart years={shownYears} />
        <div className="legend">
          <span>
            <i className="swatch" style={{ background: 'var(--hot)' }} /> Hottest day (TXK)
          </span>
          <span>
            <i className="swatch" style={{ background: 'var(--cold)' }} /> Coldest day (TNK)
          </span>
          <span>
            <i className="swatch" style={{ background: 'var(--ink)' }} /> Annual mean (TMK)
          </span>
          <span>
            <i className="swatch" style={{ background: 'var(--gold)' }} /> 10-year average
          </span>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h3>Hot &amp; cold days</h3>
          <span className="desc">
            Number of days per year crossing each threshold — the sharpest fingerprint of warming.
            Frost &amp; ice days thin out as summer &amp; hot days multiply. Toggle any series.
          </span>
        </div>
        <DayCountChart years={shownYears} />
      </section>

      <section className="section">
        <div className="section-head">
          <h3>Annual precipitation</h3>
          <span className="desc">
            Total rainfall &amp; melted snow (RSK) summed per year, in millimetres; the dark curve is
            a 10-year average.
          </span>
        </div>
        <AnnualBarChart years={shownYears} field="precip" unit="mm" label="Precipitation" color="var(--cold)" />
      </section>

      <section className="section">
        <div className="section-head">
          <h3>Annual sunshine</h3>
          <span className="desc">
            Hours of bright sunshine (SDK) summed per year. Not every station measures it.
          </span>
        </div>
        <AnnualBarChart years={shownYears} field="sun" unit="h" label="Sunshine" color="var(--gold)" />
      </section>

      <section className="section">
        <div className="section-head">
          <h3>Snow</h3>
          <span className="desc">
            Deepest snow cover (SHK_TAG) reached each year, in centimetres; hover for the count of
            days with snow on the ground.
          </span>
        </div>
        <AnnualBarChart
          years={shownYears}
          field="snowMax"
          unit="cm"
          label="Max snow depth"
          color="var(--cold-deep)"
          extra={{ field: 'snowDays', label: 'Snow days', unit: 'd' }}
        />
      </section>

      <section className="section">
        <div className="section-head">
          <h3>Warming stripes</h3>
          <span className="desc">
            Annual mean temperature as colour — blue cooler, red warmer — relative to the station’s
            earliest decades.
          </span>
        </div>
        <WarmingStripes years={shownYears} />
      </section>
    </div>
  )
}

function computeStats(years) {
  const withMax = years.filter((y) => y.tmax != null)
  const withMin = years.filter((y) => y.tmin != null)
  const withMean = years.filter((y) => y.tmean != null)
  const recHigh = withMax.reduce((a, b) => (b.tmax > a.tmax ? b : a), withMax[0])
  const recLow = withMin.reduce((a, b) => (b.tmin < a.tmin ? b : a), withMin[0])
  const reg = linregByDecade(withMean.map((y) => ({ x: y.year, y: y.tmean })))
  return { recHigh, recLow, trend: reg ? reg.perDecade : 0 }
}
