import { loadStations } from '../api/_dwd.js'

// Server-side <title> + Open Graph / Twitter meta for /station/* URLs, so shared
// links and crawlers (which don't run our JS) get a per-station preview like
// "DWD Weather / Hohenpeißenberg / 1940–2025". Real users still get the SPA —
// we just rewrite the head of the same index.html.

class Inner {
  constructor(value) {
    // NB: avoid naming this `text` — HTMLRewriter treats a `text` field on the
    // handler as a text-node callback and would reject a non-function.
    this.value = value
  }
  element(el) {
    el.setInnerContent(this.value) // text mode → HTML-escaped
  }
}
class Attr {
  constructor(value) {
    this.value = value
  }
  element(el) {
    el.setAttribute('content', this.value)
  }
}

export const onRequestGet = async (context) => {
  const res = await context.next() // the SPA index.html (via _redirects fallback)
  const ct = res.headers.get('content-type') || ''
  if (!ct.includes('text/html')) return res

  const url = new URL(context.request.url)
  const m = url.pathname.match(/^\/station\/(\d{1,5})(?:\/(\d{3,4})-(\d{3,4}))?/)
  if (!m) return res
  const id = m[1].padStart(5, '0')

  let name = `Station ${id}`
  let range = ''
  try {
    const s = (await loadStations(context)).find((x) => x.id === id)
    if (s) {
      name = s.name
      const lo = m[2] || s.from.slice(0, 4)
      const hi = m[3] || s.to.slice(0, 4)
      range = `${lo}–${hi}`
    }
  } catch {
    // fall back to the generic title if the catalogue can't be loaded
  }

  const title = `DWD Weather / ${name}${range ? ` / ${range}` : ''}`
  const desc =
    `Yearly temperature, precipitation, sunshine and snow records for ${name}` +
    `${range ? ` (${range})` : ''} — from the Deutscher Wetterdienst open-data archive.`

  return new HTMLRewriter()
    .on('title', new Inner(title))
    .on('meta[name="description"]', new Attr(desc))
    .on('meta[property="og:title"]', new Attr(title))
    .on('meta[property="og:description"]', new Attr(desc))
    .on('meta[property="og:url"]', new Attr(url.href))
    .on('meta[name="twitter:title"]', new Attr(title))
    .on('meta[name="twitter:description"]', new Attr(desc))
    .transform(res)
}
