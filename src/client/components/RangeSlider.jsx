import React from 'react'

// Dual-handle range slider built from two overlaid native range inputs.
// `active` toggles the coloured (vs. greyed-out) look — greyed when the range
// spans everything, since that selection filters nothing.
export default function RangeSlider({ min, max, value, onChange, active = true }) {
  const [lo, hi] = value
  const span = max - min || 1
  const loPct = ((lo - min) / span) * 100
  const hiPct = ((hi - min) / span) * 100

  return (
    <div className={`range-slider${active ? '' : ' is-inactive'}`}>
      <div className="range-track" />
      <div className="range-fill" style={{ left: `${loPct}%`, right: `${100 - hiPct}%` }} />
      <input
        type="range"
        min={min}
        max={max}
        value={lo}
        aria-label="From year"
        // keep the active thumb on top so handles never lock together
        style={{ zIndex: lo > max - (max - min) * 0.04 ? 5 : 3 }}
        onChange={(e) => onChange([Math.min(+e.target.value, hi), hi])}
      />
      <input
        type="range"
        min={min}
        max={max}
        value={hi}
        aria-label="To year"
        style={{ zIndex: 4 }}
        onChange={(e) => onChange([lo, Math.max(+e.target.value, lo)])}
      />
    </div>
  )
}
