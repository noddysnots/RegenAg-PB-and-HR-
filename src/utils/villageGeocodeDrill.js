const LS_KEY = 'village_geo_v1'
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

/**
 * @param {string} village
 * @param {string} block
 * @param {string} district
 */
function drillCacheKey(village, block, district) {
  const seg = (s) =>
    String(s ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_')
  return `${seg(village)}|${seg(block)}|${seg(district)}`
}

/**
 * @param {string} q
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
 * Village centroid for cluster drill map (separate cache from filter `block_geo_v1`).
 * @param {{ village: string, block: string, district: string, state: string }} p
 * @returns {Promise<[number, number] | null>}
 */
export async function geocodeVillageDrillOnce(p) {
  const key = drillCacheKey(p.village, p.block, p.district)
  const cache = loadCache()
  if (Object.prototype.hasOwnProperty.call(cache, key)) {
    const hit = cache[key]
    return hit == null ? null : /** @type {[number, number]} */ (hit)
  }

  await new Promise((r) => setTimeout(r, 100))

  const state = String(p.state ?? '').trim() || 'Punjab'
  const q = `${p.village}, ${p.block}, ${p.district}, ${state}, India`
  let pos = null
  try {
    pos = await nominatimSearch(q)
  } catch {
    pos = null
  }
  cache[key] = pos ?? null
  saveCache(cache)
  return pos
}
