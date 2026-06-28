import React, { useMemo, useState } from 'react'
import useMeasure from './useMeasure.js'
import { movingAverage, niceStep } from '../lib.js'

// Annual totals as bars (grounded at zero) with a 10-year average overlay.
// Reused for precipitation, sunshine and snow depth — only the field/unit/colour
// differ. `extra` adds a second value to the hover tooltip (e.g. snow days).
const H = 300
const M = { top: 16, right: 16, bottom: 30, left: 48 }

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

export default function AnnualBarChart({
  years,
  field,
  unit,
  label,
  color = 'var(--cold)',
  decimals = 0,
  avg = true,
  extra = null,
}) {
  const [ref, width] = useMeasure()
  const [active, setActive] = useState(null)

  const data = useMemo(() => years.filter((y) => y[field] != null), [years, field])

  const model = useMemo(() => {
    if (!width || data.length === 0) return null
    const W = width
    const plotW = W - M.left - M.right
    const plotH = H - M.top - M.bottom

    const ma = movingAverage(data.map((d) => ({ year: d.year, value: d[field] })), 10)
    const hi = Math.max(...data.map((d) => d[field]), 0)
    const step = niceStep(hi || 1, 6)
    const yMax = Math.max(step, Math.ceil(hi / step) * step)

    const x = (i) => M.left + (plotW * (i + 0.5)) / data.length
    const y = (v) => M.top + plotH * (1 - v / yMax)
    const bw = Math.max(1.5, (plotW / data.length) * 0.66)

    const ticks = []
    for (let v = 0; v <= yMax + 1e-9; v += step) ticks.push(v)

    const avgPath = avg
      ? linePath(ma.map((m, i) => (m.value == null ? null : { x: x(i), y: y(m.value) })))
      : ''

    return { W, plotW, plotH, x, y, bw, ticks, yMax, avgPath, top: M.top }
  }, [width, data, field, avg])

  function onMove(e) {
    if (!model) return
    const rect = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * model.W
    const idx = Math.floor(((px - M.left) / model.plotW) * data.length)
    setActive(idx >= 0 && idx < data.length ? idx : null)
  }

  const hovered = active != null ? data[active] : null
  const fmt = (v) => (v == null ? '–' : v.toLocaleString('en', { maximumFractionDigits: decimals }))

  if (data.length === 0) {
    return (
      <div className="chart-card">
        <div className="chart-empty">No {label.toLowerCase()} recorded at this station.</div>
      </div>
    )
  }

  return (
    <div className="chart-card" ref={ref} style={{ position: 'relative' }}>
      {model && (
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
                {v.toLocaleString('en')}
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
              x={model.x(active) - model.bw / 2 - 2}
              y={model.top}
              width={model.bw + 4}
              height={model.plotH}
            />
          )}

          {data.map((d, i) => {
            const yTop = model.y(d[field])
            const yBot = model.y(0)
            return (
              <rect
                key={d.year}
                className="bar"
                x={model.x(i) - model.bw / 2}
                y={yTop}
                width={model.bw}
                height={Math.max(1, yBot - yTop)}
                rx={Math.min(model.bw / 2, 2.5)}
                fill={color}
                stroke={active === i ? 'var(--ink)' : 'none'}
                strokeWidth={active === i ? 1 : 0}
                style={{ animationDelay: `${Math.min(i * 5, 650)}ms` }}
              />
            )
          })}

          {avg && model.avgPath && (
            <>
              <path className="avg-halo" d={model.avgPath} />
              <path className="avg-line" d={model.avgPath} style={{ stroke: 'var(--ink)' }} />
            </>
          )}
        </svg>
      )}

      {hovered && model && (
        <div
          className="tooltip"
          style={{
            left: `${(model.x(active) / model.W) * 100}%`,
            top: `${(model.y(hovered[field]) / H) * 100}%`,
          }}
        >
          <div className="t-year">{hovered.year}</div>
          <div className="t-row">
            <span className="k">{label}</span>
            <span className="v">
              {fmt(hovered[field])} {unit}
            </span>
          </div>
          {extra && hovered[extra.field] != null && (
            <div className="t-row">
              <span className="k">{extra.label}</span>
              <span className="v">
                {hovered[extra.field]} {extra.unit}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
