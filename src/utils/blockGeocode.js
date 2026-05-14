const LS_KEY = 'block_geo_v1'
const UA =
  'FarmMonitoringPBHR/1.0 (internal dashboard; contact: ops@local)'

function loadCache() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    const j = raw ? JSON.parse(raw) : {}
    return j && typeof j === 'object' ? j : {}
  } catch {
    return {}
  }
}

function saveCache(cache) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(cache))
  } catch {
    /* quota */
  }
}

function cacheKey(parts) {
  return parts
    .map((p) =>
      String(p ?? '')
        .trim()
        .toUpperCase(),
    )
    .join('|')
}

/**
 * @param {string} q free-text query
 * @returns {Promise<[number, number] | null>}
 */
async function nominatimSearch(q) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`
  const res = await fetch(url, {
    headers: {
      'Accept-Language': 'en',
      'User-Agent': UA,
    },
  })
  if (!res.ok) return null
  const data = await res.json()
  if (!data?.[0]) return null
  return [parseFloat(data[0].lat), parseFloat(data[0].lon)]
}

/**
 * Block-level centroid (cached).
 * @param {{ state: string, district: string, block: string }} p
 */
export async function geocodeBlockOnce(p) {
  const key = cacheKey([p.state, p.district, p.block, ''])
  const cache = loadCache()
  if (cache[key]) return /** @type {[number, number]} */ (cache[key])

  const q = `${p.block}, ${p.district}, ${p.state}, India`
  const pos = await nominatimSearch(q)
  if (pos) {
    cache[key] = pos
    saveCache(cache)
  }
  return pos
}

/**
 * Village centroid (cached).
 * @param {{ state: string, district: string, block: string, village: string }} p
 */
export async function geocodeVillageOnce(p) {
  const key = cacheKey([p.state, p.district, p.block, p.village])
  const cache = loadCache()
  if (cache[key]) return /** @type {[number, number]} */ (cache[key])

  const q = `${p.village}, ${p.block}, ${p.district}, ${p.state}, India`
  const pos = await nominatimSearch(q)
  if (pos) {
    cache[key] = pos
    saveCache(cache)
  }
  return pos
}
