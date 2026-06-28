import { handleData, json } from './_dwd.js'

// GET /api/data?station=ID — yearly temperature aggregates for one station
export async function onRequestGet(context) {
  try {
    return await handleData(new URL(context.request.url), context)
  } catch (err) {
    return json({ error: String(err && err.message ? err.message : err) }, 500)
  }
}
