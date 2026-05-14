/**
 * Static lookup of `Farm ID` → `[lat, lon]` captured from the field
 * survey GPS. About 16,034 of the 19,287 records ship coordinates;
 * everything else falls back to the village-centroid + spiral layout
 * that existed before.
 *
 * The cache is loaded once at app startup and then read synchronously
 * from refs inside Leaflet event handlers, so callers never wait on
 * I/O when placing pins.
 */

/** Plausible Punjab + Haryana lat/lon envelope (with margin). */
export function isValidFarmCoord(c) {
  return (
    Array.isArray(c) &&
    c.length === 2 &&
    Number.isFinite(c[0]) &&
    Number.isFinite(c[1]) &&
    c[0] > 27 &&
    c[0] < 35 &&
    c[1] > 72 &&
    c[1] < 80
  )
}

/**
 * @param {Record<string, unknown> | null | undefined} cache
 * @param {string | number | null | undefined} farmId
 * @returns {[number, number] | null}
 */
export function getFarmCoords(cache, farmId) {
  if (!cache || farmId == null) return null
  const hit = /** @type {Record<string, [number, number]>} */ (cache)[
    String(farmId)
  ]
  return isValidFarmCoord(hit) ? hit : null
}

/**
 * Average lat/lon of all farms in `farms` that have valid GPS coords,
 * or `null` when none do. Used to anchor village-level dots over the
 * actual cluster of survey points (more accurate than the geocoded
 * village centroid).
 *
 * @param {Array<{ farmId?: string | number }>} farms
 * @param {Record<string, [number, number]>} cache
 * @returns {[number, number] | null}
 */
export function farmGpsCentroid(farms, cache) {
  if (!farms?.length || !cache) return null
  let latSum = 0
  let lonSum = 0
  let n = 0
  for (const f of farms) {
    const c = getFarmCoords(cache, f.farmId)
    if (!c) continue
    latSum += c[0]
    lonSum += c[1]
    n += 1
  }
  if (!n) return null
  return [latSum / n, lonSum / n]
}

/**
 * Split a list of farms by whether the cache has valid GPS for them.
 *
 * @param {Array<{ farmId?: string | number }>} farms
 * @param {Record<string, [number, number]>} cache
 * @returns {{
 *   withGps: Array<{ farm: any, coords: [number, number] }>,
 *   withoutGps: Array<any>,
 * }}
 */
export function splitFarmsByGps(farms, cache) {
  const withGps = []
  const withoutGps = []
  for (const farm of farms ?? []) {
    const coords = getFarmCoords(cache, farm.farmId)
    if (coords) withGps.push({ farm, coords })
    else withoutGps.push(farm)
  }
  return { withGps, withoutGps }
}

/**
 * Fetch and validate the static farm-geocode JSON.
 *
 * Returns an empty map (rather than throwing) when the file is
 * missing or malformed, so the spiral-fallback path keeps working.
 *
 * @param {string} [url]
 * @returns {Promise<Record<string, [number, number]>>}
 */
export async function loadFarmGeocodes(url = '/data/farm_geocodes.json') {
  try {
    const res = await fetch(url)
    if (!res.ok) return {}
    const data = await res.json()
    if (!data || typeof data !== 'object') return {}
    /** @type {Record<string, [number, number]>} */
    const out = {}
    let kept = 0
    let dropped = 0
    for (const k of Object.keys(data)) {
      if (isValidFarmCoord(data[k])) {
        out[k] = data[k]
        kept += 1
      } else {
        dropped += 1
      }
    }
    if (import.meta.env?.DEV) {
      // eslint-disable-next-line no-console
      console.log(
        'Farm geocodes loaded:',
        kept,
        dropped ? `(dropped ${dropped} invalid)` : '',
      )
    }
    return out
  } catch {
    return {}
  }
}
