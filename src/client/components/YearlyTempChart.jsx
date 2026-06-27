import React, { useMemo, useState } from 'react'
import useMeasure from './useMeasure.js'
import { tempColor, linregByDecade, movingAverage, niceStep, fmtTemp, fmtDate } from '../lib.js'

const H = 430
const M = { top: 18, right: 16, bottom: 30, left: 42 }

const SERIES = [
  { key: 'max', label: 'Hottest day', color: 'var(--hot)' },
  { key: 'min', label: 'Coldest night', color: 'var(--cold)' },
  { key: 'mean', label: 'Annual mean', color: 'var(--ink)' },
  { key: 'avg', label: '10-yr average', color: 'var(--gold)' },
  { key: 'trend', label: 'Trend', color: 'var(--ink-soft)' },
]

function linePath(pts) {
  let d = ''
  let pen = false
  for (const p of pts) {
    if (!p) {
      pen = false
      continue
    }
    d += `${pen ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)} `
    pen = true
  }
  return d
}

export default function YearlyTempChart({ years }) {
  const [ref, width] = useMeasure()
  const [active, setActive] = useState(null)
  const [series, setSeries] = useState({ max: true, min: true, mean: true, avg: true, trend: false })

  const data = useMemo(
    () => years.filter((y) => y.tmax != null || y.tmin != null),
    [years],
  )

  const model = useMemo(() => {
    if (!width || data.length === 0) return null
    const W = width
    const plotW = W - M.left - M.right
    const plotH = H - M.top - M.bottom

    // 10-year moving average of each series (max / min / mean)
    const maMax = movingAverage(data.map((d) => ({ year: d.year, value: d.tmax })), 10)
    const maMin = movingAverage(data.map((d) => ({ year: d.year, value: d.tmin })), 10)
    const maMean = movingAverage(data.map((d) => ({ year: d.year, value: d.tmean })), 10)
    const reg = linregByDecade(data.map((d) => ({ x: d.year, y: d.tmean })))

    // y-domain follows whatever series are currently visible
    const vals = []
    for (const d of data) {
      if (series.max && d.tmax != null) vals.push(d.tmax)
      if (series.min && d.tmin != null) vals.push(d.tmin)
      if (series.mean && d.tmean != null) vals.push(d.tmean)
    }
    if (series.avg) {
      if (series.max) for (const m of maMax) if (m.value != null) vals.push(m.value)
      if (series.min) for (const m of maMin) if (m.value != null) vals.push(m.value)
      if (series.mean) for (const m of maMean) if (m.value != null) vals.push(m.value)
    }
    if (series.trend && reg) {
      vals.push(reg.intercept + reg.slopePerYear * data[0].year)
      vals.push(reg.intercept + reg.slopePerYear * data[data.length - 1].year)
    }
    if (vals.length === 0) return { W, empty: true }

    const lo = Math.min(...vals)
    const hi = Math.max(...vals)
    const pad = Math.max(1, (hi - lo) * 0.08)
    const step = niceStep(hi - lo + 2 * pad, 7)
    const yMin = Math.floor((lo - pad) / step) * step
    const yMax = Math.ceil((hi + pad) / step) * step

    const x = (i) => M.left + (plotW * (i + 0.5)) / data.length
    const y = (v) => M.top + plotH * (1 - (v - yMin) / (yMax - yMin))
    const bw = Math.max(1.5, (plotW / data.length) * 0.66)

    const ticks = []
    for (let v = yMin; v <= yMax + 1e-9; v += step) ticks.push(v)

    let trend = null
    if (reg) {
      trend = {
        x1: x(0),
        y1: y(reg.intercept + reg.slopePerYear * data[0].year),
        x2: x(data.length - 1),
        y2: y(reg.intercept + reg.slopePerYear * data[data.length - 1].year),
      }
    }

    const toPath = (mm) => linePath(mm.map((m, i) => (m.value == null ? null : { x: x(i), y: y(m.value) })))
    const avgMaxPath = toPath(maMax)
    const avgMinPath = toPath(maMin)
    const avgMeanPath = toPath(maMean)
    const maxPath = linePath(data.map((d, i) => (d.tmax == null ? null : { x: x(i), y: y(d.tmax) })))
    const minPath = linePath(data.map((d, i) => (d.tmin == null ? null : { x: x(i), y: y(d.tmin) })))

    const stops = []
    const N = 12
    for (let i = 0; i <= N; i++) {
      const t = i / N
      stops.push({ offset: t, color: tempColor(yMax - t * (yMax - yMin)) })
    }

    return {
      W, plotW, plotH, x, y, bw, ticks, yMin, yMax,
      trend, avgMaxPath, avgMinPath, avgMeanPath, maxPath, minPath, stops,
      top: M.top, bottom: H - M.bottom,
    }
  }, [width, data, series])

  function toggle(key) {
    setSeries((s) => ({ ...s, [key]: !s[key] }))
  }

  function onMove(e) {
    if (!model || model.empty) return
    const rect = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * model.W
    const idx = Math.floor(((px - M.left) / model.plotW) * data.length)
    setActive(idx >= 0 && idx < data.length ? idx : null)
  }

  const showEnvelope = series.max && series.min
  const hovered = active != null ? data[active] : null

  return (
    <div className="chart-card" ref={ref} style={{ position: 'relative' }}>
      <div className="series-toggles">
        {SERIES.map((s) => (
          <button
            key={s.key}
            className="toggle"
            data-on={series[s.key]}
            onClick={() => toggle(s.key)}
            aria-pressed={series[s.key]}
          >
            <i className="t-swatch" style={{ background: s.color }} />
            {s.label}
          </button>
        ))}
      </div>

      {model && model.empty && (
        <div className="chart-empty">Select at least one series to plot.</div>
      )}

      {model && !model.empty && (
        <svg
          className="chart-svg"
          viewBox={`0 0 ${model.W} ${H}`}
          onMouseMove={onMove}
          onMouseLeave={() => setActive(null)}
        >
          <defs>
            <linearGradient id="tempscale" gradientUnits="userSpaceOnUse" x1="0" y1={model.top} x2="0" y2={model.bottom}>
              {model.stops.map((s, i) => (
                <stop key={i} offset={s.offset} stopColor={s.color} />
              ))}
            </linearGradient>
          </defs>

          {/* horizontal grid + y labels */}
          {model.ticks.map((v) => (
            <g key={v}>
              <line
                className={v === 0 ? 'grid-zero' : 'grid-line'}
                x1={M.left}
                x2={model.W - M.right}
                y1={model.y(v)}
                y2={model.y(v)}
              />
              <text className="axis-text" x={M.left - 8} y={model.y(v) + 3} textAnchor="end">
                {v}
              </text>
            </g>
          ))}

          {/* x labels at decade marks */}
          {data.map((d, i) =>
            d.year % 10 === 0 ? (
              <text key={d.year} className="axis-text" x={model.x(i)} y={H - 10} textAnchor="middle">
                {d.year}
              </text>
            ) : null,
          )}

          {/* hover band */}
          {hovered && (
            <rect
              className="hover-band"
              x={model.x(active) - model.bw / 2 - 2}
              y={model.top}
              width={model.bw + 4}
              height={model.plotH}
            />
          )}

          {/* envelope bars when both extremes are shown */}
          {showEnvelope &&
            data.map((d, i) => {
              if (d.tmax == null || d.tmin == null) return null
              const yTop = model.y(d.tmax)
              const yBot = model.y(d.tmin)
              return (
                <rect
                  key={d.year}
                  className="bar"
                  x={model.x(i) - model.bw / 2}
                  y={yTop}
                  width={model.bw}
                  height={Math.max(1, yBot - yTop)}
                  rx={Math.min(model.bw / 2, 2.5)}
                  fill="url(#tempscale)"
                  stroke={active === i ? 'var(--ink)' : 'none'}
                  strokeWidth={active === i ? 1 : 0}
                  style={{ animationDelay: `${Math.min(i * 5, 650)}ms` }}
                />
              )
            })}

          {/* single-extreme series render as a line */}
          {series.max && !showEnvelope && (
            <path className="series-line max" d={model.maxPath} />
          )}
          {series.min && !showEnvelope && (
            <path className="series-line min" d={model.minPath} />
          )}

          {/* yearly mean dots */}
          {series.mean &&
            data.map((d, i) =>
              d.tmean != null ? (
                <circle key={d.year} className="mean-dot" cx={model.x(i)} cy={model.y(d.tmean)} r={Math.min(model.bw / 2.4, 1.9)} />
              ) : null,
            )}

          {/* 10-year moving averages, one per visible series */}
          {series.avg && (
            <>
              {series.min && <AvgCurve d={model.avgMinPath} color="var(--cold)" />}
              {series.mean && <AvgCurve d={model.avgMeanPath} color="var(--gold)" />}
              {series.max && <AvgCurve d={model.avgMaxPath} color="var(--hot)" />}
            </>
          )}

          {/* warming trend */}
          {series.trend && model.trend && (
            <line
              className="trend-line"
              x1={model.trend.x1}
              y1={model.trend.y1}
              x2={model.trend.x2}
              y2={model.trend.y2}
            />
          )}
        </svg>
      )}

      {hovered && model && !model.empty && (
        <div
          className="tooltip"
          style={{
            left: `${(model.x(active) / model.W) * 100}%`,
            top: `${(model.y(tooltipAnchor(hovered, series)) / H) * 100}%`,
          }}
        >
          <div className="t-year">{hovered.year}</div>
          {series.max && hovered.tmax != null && (
            <div className="t-row max">
              <span className="k">Hottest day</span>
              <span className="v">{fmtTemp(hovered.tmax)}°C</span>
            </div>
          )}
          {series.min && hovered.tmin != null && (
            <div className="t-row min">
              <span className="k">Coldest night</span>
              <span className="v">{fmtTemp(hovered.tmin)}°C</span>
            </div>
          )}
          {series.mean && hovered.tmean != null && (
            <div className="t-row">
              <span className="k">Mean</span>
              <span className="v">{fmtTemp(hovered.tmean)}°C</span>
            </div>
          )}
          {series.max && hovered.maxDate && (
            <div className="t-row">
              <span className="k">Max on</span>
              <span className="v">{fmtDate(hovered.maxDate).replace(/ \d{4}$/, '')}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function AvgCurve({ d, color }) {
  if (!d) return null
  return (
    <>
      <path className="avg-halo" d={d} />
      <path className="avg-line" d={d} style={{ stroke: color }} />
    </>
  )
}

// pick a sensible vertical anchor for the tooltip based on visible series
function tooltipAnchor(d, series) {
  if (series.max && d.tmax != null) return d.tmax
  if (series.min && d.tmin != null) return d.tmin
  if (series.mean && d.tmean != null) return d.tmean
  return d.tmax ?? d.tmin ?? 0
}
