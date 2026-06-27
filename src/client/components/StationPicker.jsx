import React, { useEffect, useMemo, useRef, useState } from 'react'

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

export default function StationPicker({ stations, selected, onSelect }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const boxRef = useRef(null)
  const popRef = useRef(null)

  // Keep the input text in sync with the externally-selected station
  // (e.g. when the URL drives the selection).
  useEffect(() => {
    if (selected) setQuery(selected.name)
  }, [selected])

  const results = useMemo(() => {
    const q = norm(query.trim())
    if (!q) return stations.slice(0, 60)
    const starts = []
    const contains = []
    for (const s of stations) {
      const n = norm(s.name)
      if (n.startsWith(q)) starts.push(s)
      else if (n.includes(q) || norm(s.state).includes(q) || s.id.includes(q)) contains.push(s)
      if (starts.length + contains.length > 80) break
    }
    return [...starts, ...contains].slice(0, 60)
  }, [query, stations])

  useEffect(() => setActive(0), [query])

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

  // keep active option scrolled into view
  useEffect(() => {
    if (!open || !popRef.current) return
    const el = popRef.current.querySelector('[data-active="true"]')
    if (el) el.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  return (
    <div className="combo" ref={boxRef}>
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
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
          <circle cx="11" cy="11" r="7" />
          <line x1="16.5" y1="16.5" x2="21" y2="21" />
        </svg>
      </span>

      {open && (
        <div className="combo-pop" ref={popRef} role="listbox">
          {results.length === 0 && <div className="combo-empty">No station matches “{query}”.</div>}
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
                №{s.id} · {s.from.slice(0, 4)}–{s.to.slice(0, 4)}
              </span>
              <span className="opt-state">{s.state}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
