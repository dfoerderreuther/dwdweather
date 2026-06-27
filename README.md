# Wetter·Almanach

An editorial climate almanac of German weather stations, drawn live from the
[DWD Open Data](https://opendata.dwd.de) daily-climate (KL) archive. Search any of
~1,380 stations and read its yearly temperature history — the coldest night and hottest
day of every year on record, the annual mean, and the long-term warming trend.

A **React** single-page app served by a **Cloudflare Worker** that downloads, unzips and
aggregates the DWD archives on the edge.

## Stack

- **Frontend** — Vite + React 18, custom SVG charts (no chart library). Fonts: Fraunces,
  Spectral, IBM Plex Mono.
- **Backend** — Cloudflare Worker (`src/worker/index.js`); unzips DWD `.zip` archives
  in-worker with [`fflate`](https://github.com/101arrowz/fflate); responses cached 24h.
- Wired together with [`@cloudflare/vite-plugin`](https://developers.cloudflare.com/workers/vite-plugin/).

## API

| Route | Description |
| --- | --- |
| `GET /api/stations` | Catalogue of stations (id, name, state, coords, record period). |
| `GET /api/data?station=ID` | Per-year `tmax` / `tmin` / `tmean` (°C) + extreme dates. |

The selected station lives in the URL as `/station/<id>` (deep-linkable & shareable).

## Develop

```bash
npm install
npm run dev      # http://localhost:5173  (runs the worker in workerd via Vite)
```

## Deploy

```bash
npm run deploy   # vite build && wrangler deploy
```

Requires a Cloudflare account (`npx wrangler login`).

> Note: a cold cache miss downloads and unzips a multi-megabyte archive; this can exceed
> the Workers **free**-tier 10 ms CPU limit. Results are cached for 24h, and the
> Workers Paid plan (up to 30 s CPU) removes the concern.

## Data

Deutscher Wetterdienst, Climate Data Center — `observations_germany/climate/daily/kl`.
Columns used: **TXK** (daily max), **TNK** (daily min), **TMK** (daily mean) at 2 m.
Data is © DWD, provided under their open-data terms.

## Extending

The worker already returns annual means and extreme dates, so adding views (precipitation,
monthly detail, a station map) is mostly a frontend addition — drop a new component into
`src/client/components/` and a section into `App.jsx`.
