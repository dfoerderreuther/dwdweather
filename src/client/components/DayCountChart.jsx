import React, { useMemo, useState } from 'react'
import useMeasure from './useMeasure.js'
import { movingAverage, niceStep } from '../lib.js'

// Threshold day-counts per year (multi-line, toggleable) — the clearest visual
// of a warming climate: frost days fall as hot/summer days rise.
const H = 380
const M = { top: 16, right: 16, bottom: 30, left: 40 }

const SERIES = [
  { key: 'frostDays', label: 'Frost days', sub: 'min < 0°C', color: 'var(--cold)' },
  { key: 'iceDays', label: 'Ice days', sub: 'max < 0°C', color: 'var(--cold-deep)' },
  { key: 'summerDays', label: 'Summer days', sub: 'max ≥ 25°C', color: 'var(--gold)' },
  { key: 'hotDays', label: 'Hot days', sub: 'max ≥ 30°C', color: 'var(--hot)' },
  { key: 'tropNights', label: 'Tropical nights', sub: 'min ≥ 20°C', color: '#8b46c9' },
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

export default function DayCountChart({ years }) {
  const [ref, width] = useMeasure()
  const [active, setActive] = useState(null)
  const [on, setOn] = useState({
    frostDays: true,
    iceDays: false,
    summerDays: true,
    hotDays: true,
    tropNights: false,
    avg: true,
  })

  // a series is only offered if the station actually has that data
  const available = useMemo(
    () => SERIES.filter((s) => years.some((y) => y[s.key] != null)),
    [years],
  )
  const data = useMemo(
    () => years.filter((y) => available.some((s) => y[s.key] != null)),
    [years, available],
  )

  const model = useMemo(() => {
    if (!width || data.length === 0) return null
    const W = width
    const plotW = W - M.left - M.right
    const plotH = H - M.top - M.bottom
    const visible = available.filter((s) => on[s.key])

    const vals = []
    for (const d of data) for (const s of visible) if (d[s.key] != null) vals.push(d[s.key])
    if (vals.length === 0) return { W, empty: true }

    const hi = Math.max(...vals, 0)
    const step = niceStep(hi || 1, 6)
    const yMax = Math.max(step, Math.ceil(hi / step) * step)

    const x = (i) => M.left + (plotW * (i + 0.5)) / data.length
    const y = (v) => M.top + plotH * (1 - v / yMax)

    const ticks = []
    for (let v = 0; v <= yMax + 1e-9; v += step) ticks.push(v)

    const lines = visible.map((s) => {
      const raw = linePath(data.map((d, i) => (d[s.key] == null ? null : { x: x(i), y: y(d[s.key]) })))
      const ma = movingAverage(data.map((d) => ({ year: d.year, value: d[s.key] })), 10)
      const avgPath = linePath(ma.map((m, i) => (m.value == null ? null : { x: x(i), y: y(m.value) })))
      return { ...s, raw, avgPath }
    })

    return { W, plotW, plotH, x, y, ticks, yMax, lines, visible, top: M.top }
  }, [width, data, available, on])

  function toggle(key) {
    setOn((s) => ({ ...s, [key]: !s[key] }))
  }
  function onMove(e) {
    if (!model || model.empty) return
    const rect = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * model.W
    const idx = Math.floor(((px - M.left) / model.plotW) * data.length)
    setActive(idx >= 0 && idx < data.length ? idx : null)
  }

  const hovered = active != null ? data[active] : null

  if (available.length === 0) {
    return (
      <div className="chart-card">
        <div className="chart-empty">No temperature series to derive day-counts from.</div>
      </div>
    )
  }

  return (
    <div className="chart-card" ref={ref} style={{ position: 'relative' }}>
      <div className="series-toggles">
        {available.map((s) => (
          <button
            key={s.key}
            className="toggle"
            data-on={on[s.key]}
            onClick={() => toggle(s.key)}
            aria-pressed={on[s.key]}
            title={s.sub}
          >
            <i className="t-swatch" style={{ background: s.color }} />
            {s.label}
          </button>
        ))}
        <button className="toggle" data-on={on.avg} onClick={() => toggle('avg')} aria-pressed={on.avg}>
          <i className="t-swatch" style={{ background: 'var(--ink-soft)' }} />
          10-yr avg
        </button>
      </div>

      {model && model.empty && <div className="chart-empty">Select at least one series to plot.</div>}

      {model && !model.empty && (
        <svg
          className="chart-svg"
          viewBox={`0 0 ${model.W} ${H}`}
          onMouseMove={onMove}
          onMouseLeave={() => setActive(null)}
        >
          {model.ticks.map((v) => (
            <g key={v}>
              <line className="grid-line" x1={M.left} x2={model.W - M.right} y1={model.y(v)} y2={model.y(v)} />
              <text className="axis-text" x={M.left - 8} y={model.y(v) + 3} textAnchor="end">
                {v}
              </text>
            </g>
          ))}

          {data.map((d, i) =>
            d.year % 10 === 0 ? (
              <text key={d.year} className="axis-text" x={model.x(i)} y={H - 10} textAnchor="middle">
                {d.year}
              </text>
            ) : null,
          )}

          {hovered && (
            <rect
              className="hover-band"
              x={model.x(active) - 3}
              y={model.top}
              width={6}
              height={model.plotH}
            />
          )}

          {model.lines.map((l) => (
            <path
              key={l.key}
              d={l.raw}
              fill="none"
              stroke={l.color}
              strokeWidth={1.4}
              strokeOpacity={on.avg ? 0.35 : 0.9}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}

          {on.avg &&
            model.lines.map((l) => (
              <g key={l.key}>
                <path className="avg-halo" d={l.avgPath} />
                <path className="avg-line" d={l.avgPath} style={{ stroke: l.color }} />
              </g>
            ))}
        </svg>
      )}

      {hovered && model && !model.empty && (
        <div
          className="tooltip"
          style={{
            left: `${(model.x(active) / model.W) * 100}%`,
            top: '12%',
          }}
        >
          <div className="t-year">{hovered.year}</div>
          {model.visible.map((s) =>
            hovered[s.key] != null ? (
              <div className="t-row" key={s.key}>
                <span className="k">
                  <i className="t-swatch" style={{ background: s.color, marginRight: 6 }} />
                  {s.label}
                </span>
                <span className="v">{hovered[s.key]} d</span>
              </div>
            ) : null,
          )}
        </div>
      )}
    </div>
  )
}
