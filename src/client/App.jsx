import React, { useEffect, useMemo, useState } from 'react'
import StationPicker from './components/StationPicker.jsx'
import StationsMap from './components/StationsMap.jsx'
import RangeSlider from './components/RangeSlider.jsx'
import WarmingStripes from './components/WarmingStripes.jsx'
import YearlyTempChart from './components/YearlyTempChart.jsx'
import { getStations, getStationData, fmtTemp, fmtDate, linregByDecade } from './lib.js'

// ---- URL <-> station id ----------------------------------------------------
// Selection lives in the path: /station/<id>  (deep-linkable & shareable)
function idFromPath() {
  const m = window.location.pathname.match(/^\/station\/(\d{1,5})/)
  return m ? m[1].padStart(5, '0') : null
}
function pushStation(id) {
  const path = id ? `/station/${id}` : '/'
  if (window.location.pathname !== path) window.history.pushState({ id }, '', path)
}

const SUGGESTIONS = [
  { id: '00433', name: 'Berlin-Tempelhof' },
  { id: '01975', name: 'Hamburg-Fuhlsbüttel' },
  { id: '03379', name: 'München-Stadt' },
  { id: '05792', name: 'Zugspitze' },
  { id: '02014', name: 'Hannover' },
  { id: '01443', name: 'Freiburg' },
]

export default function App() {
  const [stations, setStations] = useState(null)
  const [stationsErr, setStationsErr] = useState(null)
  const [selectedId, setSelectedId] = useState(idFromPath)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [dataErr, setDataErr] = useState(null)
  const [mapStations, setMapStations] = useState(null)

  // load catalogue once
  useEffect(() => {
    getStations().then(setStations).catch((e) => setStationsErr(e.message))
  }, [])

  // browser back/forward
  useEffect(() => {
    const onPop = () => setSelectedId(idFromPath())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

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

  function select(station) {
    setSelectedId(station.id)
    pushStation(station.id)
  }
  function selectById(id) {
    setSelectedId(id)
    pushStation(id)
  }

  const stats = useMemo(() => (data ? computeStats(data.years) : null), [data])

  return (
    <div className="page">
      <header className="masthead reveal">
        <h1>
          DWD <span className="grad">Weather</span> Stats
        </h1>
        <div className="thermal-rule" />
      </header>

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
          <StationsMap stations={mapStations || stations} selectedId={selectedId} onSelect={select} />
        </section>
      )}

      {!selectedId && stations && (
        <section className="empty-hero reveal" style={{ animationDelay: '220ms' }}>
          <p className="lead">
            {stations.length.toLocaleString('en')} stations on file. Pick one to read its
            temperature history — or start with a landmark:
          </p>
          <div className="suggestions">
            {SUGGESTIONS.map((s) => (
              <button key={s.id} className="chip" onClick={() => selectById(s.id)}>
                {s.name}
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

      <footer className="colophon">
        <span>
          Source ·{' '}
          <a href="https://opendata.dwd.de" target="_blank" rel="noreferrer">
            opendata.dwd.de
          </a>{' '}
          · CDC daily KL
        </span>
        <span>Temperatures TXK / TNK / TMK at 2 m · °C</span>
      </footer>
    </div>
  )
}

// ---------------------------------------------------------------------------
function Dossier({ data, station, stats }) {
  const firstYear = data.years[0].year
  const lastYear = data.years[data.years.length - 1].year
  const [range, setRange] = useState([firstYear, lastYear])

  const shownYears = useMemo(
    () => data.years.filter((y) => y.year >= range[0] && y.year <= range[1]),
    [data.years, range],
  )
  const isFull = range[0] <= firstYear && range[1] >= lastYear

  // mean change across the selected range (first vs last year with a mean)
  const meanChange = useMemo(() => {
    const wm = shownYears.filter((y) => y.tmean != null)
    if (wm.length < 2) return null
    const first = wm[0]
    const last = wm[wm.length - 1]
    return { first, last, delta: last.tmean - first.tmean }
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
              <span className={meanChange.delta >= 0 ? 'trend-up' : 'trend-dn'}>
                {meanChange.delta >= 0 ? '+' : '−'}
                {Math.abs(meanChange.delta).toFixed(1)}
              </span>
            ) : (
              '–'
            )}
            <span className="unit">°C</span>
          </span>
          <span className="foot">
            {meanChange ? `${meanChange.first.year} → ${meanChange.last.year}` : 'range'}
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
