import React, { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY || '5iaJ8LB3u9JfQ7WUYQF9'
const STYLE_URL = `https://api.maptiler.com/maps/dataviz/style.json?key=${MAPTILER_KEY}`

function toFeatureCollection(stations) {
  return {
    type: 'FeatureCollection',
    features: stations.map((s, i) => ({
      type: 'Feature',
      id: i,
      properties: { id: s.id, name: s.name, state: s.state, elevation: s.elevation },
      geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
    })),
  }
}

export default function StationsMap({ stations, selectedId, onSelect }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const readyRef = useRef(false)
  const stationsRef = useRef(stations)
  stationsRef.current = stations
  const [mapError, setMapError] = useState(false)

  // create the map once
  useEffect(() => {
    let map
    try {
      // new Map() throws synchronously if WebGL can't be created — must not
      // be allowed to bubble up and unmount the whole app
      map = new maplibregl.Map({
        container: containerRef.current,
        style: STYLE_URL,
        center: [10.45, 51.16],
        zoom: 4.7,
        minZoom: 3,
        maxZoom: 12,
        attributionControl: { compact: true },
      })
    } catch (err) {
      setMapError(true)
      return undefined
    }
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')

    // surface auth/tile failures (e.g. a domain-restricted MapTiler key) instead
    // of showing a blank canvas
    map.on('error', (e) => {
      const err = e && e.error
      const status = err && err.status
      if (status === 401 || status === 403 || (err && /restrict|forbidden|key/i.test(err.message || ''))) {
        setMapError(true)
      }
    })

    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12 })

    map.on('load', () => {
      map.addSource('stations', { type: 'geojson', data: toFeatureCollection(stationsRef.current) })

      map.addLayer({
        id: 'stations',
        type: 'circle',
        source: 'stations',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 2, 5, 3, 8, 5.5, 11, 8],
          'circle-color': [
            'interpolate', ['linear'], ['get', 'elevation'],
            0, '#2f9e6e',
            700, '#c2a83e',
            1500, '#e0773a',
            3000, '#b3372a',
          ],
          'circle-opacity': 0.85,
          'circle-stroke-width': 0.6,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-opacity': 0.7,
        },
      })

      map.addLayer({
        id: 'stations-selected',
        type: 'circle',
        source: 'stations',
        filter: ['==', ['get', 'id'], selectedId || '__none__'],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 5, 5, 7, 8, 11, 11, 15],
          'circle-color': '#f4503c',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      })

      readyRef.current = true

      map.on('mouseenter', 'stations', () => (map.getCanvas().style.cursor = 'pointer'))
      map.on('mouseleave', 'stations', () => {
        map.getCanvas().style.cursor = ''
        popup.remove()
      })
      map.on('mousemove', 'stations', (e) => {
        const f = e.features && e.features[0]
        if (!f) return
        const p = f.properties
        popup
          .setLngLat(f.geometry.coordinates)
          .setHTML(
            `<div class="map-pop-name">${p.name}</div><div class="map-pop-meta">${p.state} · ${p.elevation} m · №${p.id}</div>`,
          )
          .addTo(map)
      })
      map.on('click', 'stations', (e) => {
        const f = e.features && e.features[0]
        if (!f) return
        const s = stationsRef.current.find((x) => x.id === f.properties.id)
        if (s) onSelect(s)
      })
    })

    return () => map.remove()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // update points when the filtered set changes
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    const src = map.getSource('stations')
    if (src) src.setData(toFeatureCollection(stations))
  }, [stations])

  // highlight + fly to the selected station
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    map.setFilter('stations-selected', ['==', ['get', 'id'], selectedId || '__none__'])
    if (!selectedId) return
    const s = stationsRef.current.find((x) => x.id === selectedId)
    if (s) map.easeTo({ center: [s.lon, s.lat], zoom: Math.max(map.getZoom(), 7), duration: 700 })
  }, [selectedId])

  return (
    <div className="map-card">
      {mapError && (
        <div className="map-error">
          <div className="map-error-title">Map unavailable</div>
          <div className="map-error-body">
            The map couldn’t load. Most often the MapTiler key is restricted to other domains — add
            this site’s origin to the key’s allowed origins at{' '}
            <a href="https://cloud.maptiler.com/account/keys/" target="_blank" rel="noreferrer">
              cloud.maptiler.com
            </a>{' '}
            (or set <code>VITE_MAPTILER_KEY</code>). It can also mean WebGL is disabled in this
            browser. Station search and filters above still work.
          </div>
        </div>
      )}
      <div className="map-hint">Click a station to load its stats</div>
      <div className="map-legend">
        <div className="l-title">Elevation</div>
        <div className="l-bar" />
        <div className="l-scale">
          <span>0 m</span>
          <span>3000 m</span>
        </div>
      </div>
      <div className="map-canvas" ref={containerRef} />
    </div>
  )
}
