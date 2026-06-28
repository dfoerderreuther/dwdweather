import React, { useEffect, useMemo, useRef, useState } from 'react'
import RangeSlider from './RangeSlider.jsx'

// Normalise for accent/case-insensitive matching (München ~ munchen).
function norm(s) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

function highlight(name, q) {
  if (!q) return name
  const i = norm(name).indexOf(norm(q))
  if (i < 0) return name
  return (
    <>
      {name.slice(0, i)}
      <mark>{name.slice(i, i + q.length)}</mark>
      {name.slice(i + q.length)}
    </>
  )
}

export default function StationPicker({ stations, selected, onSelect, onFiltered }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)

  // filters
  const [activeOnly, setActiveOnly] = useState(false)
  const [stateFilter, setStateFilter] = useState('')
  const [minYears, setMinYears] = useState(0)
  const [yrRange, setYrRange] = useState(null) // [lo, hi] when narrowed, else null

  const boxRef = useRef(null)
  const popRef = useRef(null)

  useEffect(() => {
    if (selected) setQuery(selected.name)
  }, [selected])

  // decorate stations with numeric years once
  const rows = useMemo(
    () =>
      stations.map((s) => ({
        ...s,
        fromYear: +s.from.slice(0, 4),
        toYear: +s.to.slice(0, 4),
      })),
    [stations],
  )

  // "active" = record runs up to (almost) the most recent date in the dataset
  const activeThreshold = useMemo(
    () => Math.max(...rows.map((r) => r.toYear)) - 1,
    [rows],
  )

  const states = useMemo(
    () => [...new Set(rows.map((r) => r.state).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de')),
    [rows],
  )

  // overall year bounds for the slider
  const [minYear, maxYear] = useMemo(() => {
    let lo = Infinity
    let hi = -Infinity
    for (const r of rows) {
      if (r.fromYear < lo) lo = r.fromYear
      if (r.toYear > hi) hi = r.toYear
    }
    return [Number.isFinite(lo) ? lo : 1781, Number.isFinite(hi) ? hi : 2026]
  }, [rows])

  const filtered = useMemo(() => {
    const lo = yrRange ? yrRange[0] : null
    const hi = yrRange ? yrRange[1] : null
    return rows.filter((r) => {
      if (activeOnly && r.toYear < activeThreshold) return false
      if (stateFilter && r.state !== stateFilter) return false
      if (minYears && r.toYear - r.fromYear < minYears) return false
      // record must fully cover the selected [lo, hi] window
      if (lo != null && (r.fromYear > lo || r.toYear < hi)) return false
      return true
    })
  }, [rows, activeOnly, stateFilter, minYears, yrRange, activeThreshold])

  const results = useMemo(() => {
    const q = norm(query.trim())
    if (!q) return filtered.slice(0, 60)
    const starts = []
    const contains = []
    for (const s of filtered) {
      const n = norm(s.name)
      if (n.startsWith(q)) starts.push(s)
      else if (n.includes(q) || norm(s.state).includes(q) || s.id.includes(q)) contains.push(s)
      if (starts.length + contains.length > 80) break
    }
    return [...starts, ...contains].slice(0, 60)
  }, [query, filtered])

  useEffect(() => setActive(0), [query, filtered])

  // surface the filtered set (structured filters only) to the parent / map
  useEffect(() => {
    if (onFiltered) onFiltered(filtered)
  }, [filtered, onFiltered])

  useEffect(() => {
    function onDoc(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  function choose(s) {
    onSelect(s)
    setQuery(s.name)
    setOpen(false)
  }

  function onKey(e) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setOpen(true)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      if (results[active]) choose(results[active])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  useEffect(() => {
    if (!open || !popRef.current) return
    const el = popRef.current.querySelector('[data-active="true"]')
    if (el) el.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  const hasFilters = activeOnly || stateFilter || minYears || yrRange
  function reset() {
    setActiveOnly(false)
    setStateFilter('')
    setMinYears(0)
    setYrRange(null)
  }

  const yrValue = yrRange || [minYear, maxYear]
  function onYrChange(next) {
    if (next[0] <= minYear && next[1] >= maxYear) setYrRange(null)
    else setYrRange(next)
  }

  return (
    <div ref={boxRef}>
      <div className="combo">
        <input
          className="combo-input"
          value={query}
          placeholder="Search a station — Berlin, München, Zugspitze…"
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          spellCheck={false}
          autoComplete="off"
        />
        <span className="combo-glyph" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="11" cy="11" r="7" />
            <line x1="16.5" y1="16.5" x2="21" y2="21" />
          </svg>
        </span>

        {open && (
          <div className="combo-pop" ref={popRef} role="listbox">
            {results.length === 0 && (
              <div className="combo-empty">No station matches these filters.</div>
            )}
            {results.map((s, i) => (
              <div
                key={s.id}
                className="combo-opt"
                role="option"
                aria-selected={i === active}
                data-active={i === active}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  choose(s)
                }}
              >
                <span className="opt-name">{highlight(s.name, query.trim())}</span>
                <span className="opt-meta">
                  №{s.id} · {s.fromYear}–{s.toYear}
                  {s.toYear >= activeThreshold ? ' · active' : ''}
                </span>
                <span className="opt-state">{s.state}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="filters">
        <button
          className="toggle"
          data-on={activeOnly}
          onClick={() => setActiveOnly((v) => !v)}
          aria-pressed={activeOnly}
        >
          <i className="t-swatch" style={{ background: activeOnly ? '#1fae74' : 'var(--ink-soft)' }} />
          Active only
        </button>

        <label className="filter">
          <span className="flabel">State</span>
          <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}>
            <option value="">All</option>
            {states.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>
        </label>

        <label className="filter">
          <span className="flabel">Min. record</span>
          <select value={minYears} onChange={(e) => setMinYears(+e.target.value)}>
            <option value={0}>Any</option>
            <option value={25}>25+ yrs</option>
            <option value={50}>50+ yrs</option>
            <option value={100}>100+ yrs</option>
          </select>
        </label>

        <div className="filter filter-years">
          <span className="flabel">Years</span>
          <RangeSlider min={minYear} max={maxYear} value={yrValue} onChange={onYrChange} active={!!yrRange} />
          <span className="year-readout" data-on={!!yrRange}>
            {yrValue[0]}–{yrValue[1]}
          </span>
        </div>

        <span className="filter-count">
          {filtered.length.toLocaleString('en')} stations
          {hasFilters && (
            <button className="reset" onClick={reset}>
              reset
            </button>
          )}
        </span>
      </div>
    </div>
  )
}
