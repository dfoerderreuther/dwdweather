import React from 'react'
import { anomalyColor } from '../lib.js'

// Ed-Hawkins-style "warming stripes": one bar per year, coloured by that
// year's mean-temperature anomaly versus the station's own baseline.
export default function WarmingStripes({ years }) {
  const withMean = years.filter((y) => y.tmean != null)
  if (withMean.length < 3) return null

  // Baseline = mean of the earliest 30 available years (or all if fewer).
  const base = withMean.slice(0, Math.min(30, withMean.length))
  const baseline = base.reduce((s, y) => s + y.tmean, 0) / base.length

  const first = withMean[0].year
  const last = withMean[withMean.length - 1].year

  return (
    <div>
      <div className="stripes-wrap">
        <div className="stripes">
          {withMean.map((y, i) => (
            <div
              key={y.year}
              className="stripe"
              title={`${y.year}: ${y.tmean.toFixed(1)}°C (${
                (y.tmean - baseline >= 0 ? '+' : '') + (y.tmean - baseline).toFixed(1)
              } vs baseline)`}
              style={{
                background: anomalyColor(y.tmean - baseline),
                animationDelay: `${Math.min(i * 6, 700)}ms`,
              }}
            />
          ))}
        </div>
      </div>
      <div className="stripes-axis">
        <span>{first}</span>
        <span>
          baseline {baseline.toFixed(1)}°C · {base.length}-yr mean
        </span>
        <span>{last}</span>
      </div>
    </div>
  )
}
