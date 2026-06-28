import { handleStations, json } from './_dwd.js'

// GET /api/stations — catalogue of DWD weather stations
export async function onRequestGet(context) {
  try {
    return await handleStations(context)
  } catch (err) {
    return json({ error: String(err && err.message ? err.message : err) }, 500)
  }
}
