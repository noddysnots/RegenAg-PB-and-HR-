import { getClusterCoords } from './districtCentroids'
import { resolveDistrict } from './districtNameMap'

const BLOCK_CACHE_KEY = 'block_geo_v2'
const BATCH_SIZE = 3
const BATCH_DELAY_MS = 1200
const UA =
  'FarmMonitoringPBHR/1.0 (internal dashboard; contact: ops@local)'

/** @type {Record<string, [number, number] | null> | null} */
let liveCache = null

function loadCache() {
  if (liveCache) return liveCache
  try {
    const raw = localStorage.getItem(BLOCK_CACHE_KEY)
    const j = raw ? JSON.parse(raw) : {}
    liveCache = j && typeof j === 'object' ? j : {}
  } catch {
    liveCache = {}
  }
  return liveCache
}

function saveCache(cache) {
  liveCache = cache
  try {
    localStorage.setItem(BLOCK_CACHE_KEY, JSON.stringify(cache))
  } catch {
    /* quota */
  }
}

/**
 * @param {string} block
 * @param {string} district
 */
export function blockStorageKey(block, district) {
  return `${String(block ?? '').trim()}|${String(district ?? '').trim()}`
    .toLowerCase()
    .replace(/\s+/g, '_')
}

/**
 * @param {string} block
 * @param {string} district
 * @returns {[number, number] | null}
 */
export function getBlockCoords(block, district) {
  const cache = loadCache()
  const key = blockStorageKey(block, district)
  if (!Object.prototype.hasOwnProperty.call(cache, key)) return null
  const hit = cache[key]
  return hit == null ? null : hit
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
 * @param {Array<{ block: string, district: string, state: string }>} blocks
 * @param {(pct: number) => void} [onProgress]
 * @returns {Promise<Record<string, [number, number] | null>>}
 */
export async function preGeocodeBlocks(blocks, onProgress) {
  const cache = { ...loadCache() }

  const uncached = blocks.filter((b) => {
    const key = blockStorageKey(b.block, b.district)
    return cache[key] === undefined
  })

  if (uncached.length === 0) {
    onProgress?.(100)
    return cache
  }

  for (let i = 0; i < uncached.length; i += BATCH_SIZE) {
    const batch = uncached.slice(i, i + BATCH_SIZE)

    await Promise.all(
      batch.map(async (b) => {
        const key = blockStorageKey(b.block, b.district)
        const state = String(b.state ?? '').trim() || 'Punjab'
        const q = `${b.block}, ${b.district}, ${state}, India`
        try {
          const pos = await nominatimSearch(q)
          cache[key] =
            pos &&
            Number.isFinite(pos[0]) &&
            Number.isFinite(pos[1]) &&
            pos[0] > 15 &&
            pos[0] < 40 &&
            pos[1] > 60 &&
            pos[1] < 85
              ? pos
              : null
        } catch {
          cache[key] = null
        }
      }),
    )

    saveCache(cache)
    const pct = Math.min(
      100,
      Math.round(((i + batch.length) / uncached.length) * 100),
    )
    onProgress?.(pct)

    if (i + BATCH_SIZE < uncached.length) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS))
    }
  }

  onProgress?.(100)
  return cache
}

/**
 * @param {Array<{ villages?: Array<{ block: string, district: string, state?: string }> }>} clusters
 * @returns {Array<{ block: string, district: string, state: string }>}
 */
export function collectUniqueBlockRows(clusters) {
  const map = new Map()
  for (const c of clusters) {
    for (const v of c.villages ?? []) {
      const block = String(v.block ?? '').trim()
      const district = String(v.district ?? '').trim()
      if (!block && !district) continue
      const state = String(v.state ?? '').trim() || 'Punjab'
      const key = blockStorageKey(block, district)
      if (!map.has(key)) map.set(key, { block, district, state })
    }
  }
  return [...map.values()]
}

/**
 * Synchronous village markers: block cache + small spiral within block, else district centroid.
 *
 * @param {Array<{ village: string, block: string, district: string, state?: string, farms: number, acres: number }>} villages
 * @returns {Array<{ lat: number, lon: number, farms: number, acres: number, village: string, block: string, district: string }>}
 */
export function placeClusterVillagePoints(villages) {
  if (!villages?.length) return []

  const villagesByBlock = {}
  for (const v of villages) {
    const bk = blockStorageKey(v.block, v.district)
    if (!villagesByBlock[bk]) villagesByBlock[bk] = []
    villagesByBlock[bk].push(v)
  }

  /** @type {Array<{ lat: number, lon: number, farms: number, acres: number, village: string, block: string, district: string }>} */
  const points = []

  for (const v of villages) {
    const bk = blockStorageKey(v.block, v.district)
    const group = villagesByBlock[bk]
    const idx = group.indexOf(v)

    const blockCoords = getBlockCoords(v.block, v.district)
    const dk = resolveDistrict(v.district)
    const base =
      blockCoords ??
      (dk ? getClusterCoords(dk) : null) ??
      null

    if (!base) continue

    const angle = (idx / Math.max(group.length, 1)) * 2 * Math.PI
    const rDeg = group.length <= 1 ? 0 : 0.02
    const lat = base[0] + rDeg * Math.sin(angle)
    const lon = base[1] + rDeg * Math.cos(angle)

    if (!(lat > 20 && lat < 37 && lon > 68 && lon < 80)) continue

    points.push({
      lat,
      lon,
      farms: v.farms,
      acres: v.acres,
      village: v.village,
      block: v.block,
      district: v.district,
    })
  }

  return points
}
