/**
 * Tiered village geocoder:
 *   1. Static Census 2011 lookup  (instant, no network)
 *   2. Nominatim search           (one request per unseen village,
 *                                  cached in localStorage so it
 *                                  becomes instant on re-selection)
 *
 * Designed to be safe when the static cache hasn't loaded yet — an
 * empty `staticCache` (or `null`) simply skips Tier-1.
 */

const NOMINATIM_CACHE_KEY = 'village_nominatim_v1'
const UA =
  'FarmMonitoringPBHR/1.0 (internal dashboard; contact: ops@local)'

const norm = (s) => String(s ?? '').trim().toLowerCase()

function loadNomCache() {
  try {
    const raw = localStorage.getItem(NOMINATIM_CACHE_KEY)
    const j = raw ? JSON.parse(raw) : {}
    return j && typeof j === 'object' ? j : {}
  } catch {
    return {}
  }
}

function saveNomCache(cache) {
  try {
    localStorage.setItem(NOMINATIM_CACHE_KEY, JSON.stringify(cache))
  } catch {
    /* storage quota / private mode */
  }
}

/**
 * @typedef {[number, number]} LatLng
 *
 * @param {string} villageName
 * @param {string} blockName
 * @param {string} districtName
 * @param {string} stateName
 * @param {Record<string, LatLng>} [staticCache]  Loaded from /data/village_geocodes.json
 * @returns {Promise<{ coords: LatLng | null, source: 'static' | 'nominatim-cache' | 'nominatim' | 'none' }>}
 */
export async function getVillageCoords(
  villageName,
  blockName,
  districtName,
  stateName,
  staticCache,
) {
  if (!villageName) return { coords: null, source: 'none' }

  const v = norm(villageName)
  const b = norm(blockName)
  const d = norm(districtName)

  // ── Tier 1: static census lookup (instant) ────────────────────
  // Only accept entries that look like real lat/lng (rough Punjab+
  // Haryana envelope, with a generous margin). Files generated from
  // shapefiles in projected coordinate systems sometimes ship with
  // EPSG:3857-style metres instead of degrees — reject those so we
  // don't drop pins thousands of kilometres away.
  if (staticCache && typeof staticCache === 'object') {
    const keys = [v && b ? `${v}|${b}` : '', v && d ? `${v}|${d}` : '', v]
    for (const key of keys) {
      if (!key) continue
      const hit = staticCache[key]
      if (
        Array.isArray(hit) &&
        hit.length === 2 &&
        Number.isFinite(hit[0]) &&
        Number.isFinite(hit[1]) &&
        Math.abs(hit[0]) <= 90 &&
        Math.abs(hit[1]) <= 180 &&
        // Punjab + Haryana envelope (with a few degrees of slack)
        hit[0] >= 25 && hit[0] <= 35 &&
        hit[1] >= 70 && hit[1] <= 80
      ) {
        return { coords: /** @type {LatLng} */ ([hit[0], hit[1]]), source: 'static' }
      }
    }
  }

  // ── Tier 2: Nominatim (cached per (village, block, district)) ─
  const nomCache = loadNomCache()
  const nomKey = `${v}|${b}|${d}`

  if (Object.prototype.hasOwnProperty.call(nomCache, nomKey)) {
    const cached = nomCache[nomKey]
    return {
      coords: Array.isArray(cached) ? /** @type {LatLng} */ (cached) : null,
      source: 'nominatim-cache',
    }
  }

  try {
    const q = [villageName, blockName, districtName, stateName, 'India']
      .filter(Boolean)
      .join(', ')
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`
    const res = await fetch(url, {
      headers: { 'Accept-Language': 'en', 'User-Agent': UA },
    })
    const data = res.ok ? await res.json() : []
    const hit = Array.isArray(data) && data[0]
    const coords = hit
      ? /** @type {LatLng} */ ([parseFloat(hit.lat), parseFloat(hit.lon)])
      : null
    nomCache[nomKey] = coords
    saveNomCache(nomCache)
    return { coords, source: 'nominatim' }
  } catch {
    nomCache[nomKey] = null
    saveNomCache(nomCache)
    return { coords: null, source: 'nominatim' }
  }
}

/**
 * Fetch and parse the static village-geocode JSON. Tries
 * `/geo/village_geocodes.json` first (where the file currently
 * lives) and falls back to `/data/village_geocodes.json` for the
 * canonical location. Returns an empty map (rather than throwing)
 * when the file is missing or malformed so the Nominatim tier still
 * works on its own.
 * @param {string} [url] Override the default fetch URL (testing only).
 * @returns {Promise<Record<string, LatLng>>}
 */
export async function loadVillageGeocodes(url) {
  const candidates = url
    ? [url]
    : ['/geo/village_geocodes.json', '/data/village_geocodes.json']
  for (const u of candidates) {
    try {
      const res = await fetch(u)
      if (!res.ok) continue
      const data = await res.json()
      if (data && typeof data === 'object') return data
    } catch {
      /* try next candidate */
    }
  }
  return {}
}
