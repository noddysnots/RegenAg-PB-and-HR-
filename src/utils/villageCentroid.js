import L from 'leaflet'

/**
 * Best-effort synchronous lat/lng lookup for a single village in the
 * currently-selected block. Used by the block-drill village dots so
 * we can place markers without an async geocode round-trip.
 *
 * Priority:
 *   1. Find a GeoJSON feature whose `v` (lowercase) matches the
 *      village name, narrowed by `sd` (subdistrict, with optional
 *      ' ST' suffix) and `st` (state code). Compute the centroid as
 *      the centre of its bounds — cheap and good enough for marker
 *      placement on a sub-block zoom level.
 *   2. Fall back to entries in the static `villageGeoCache` keyed by
 *      `v` or `v|block` (matching the shape produced by
 *      `loadVillageGeocodes`).
 *
 * Returns `null` when no plausible coordinate is available.
 * @param {object} args
 * @param {string} args.villageName  spreadsheet village name (any case)
 * @param {string} [args.blockName]  spreadsheet block name (any case)
 * @param {Array<import('geojson').Feature>} [args.villageFeatures]
 * @param {Record<string, [number, number]>} [args.villageGeoCache]
 * @param {string} [args.subdist]    resolved `sd` value (uppercase)
 * @param {string} [args.stateAbbr]  `HR` | `PB` | ''
 * @returns {{ coords: [number, number], feature: import('geojson').Feature | null } | null}
 */
export function findVillageCentroidSync({
  villageName,
  blockName,
  villageFeatures = [],
  villageGeoCache = {},
  subdist = '',
  stateAbbr = '',
}) {
  if (!villageName) return null
  const targetV = String(villageName).trim().toLowerCase()
  if (!targetV) return null
  const subdistU = String(subdist || '').trim().toUpperCase()
  const subdistSt = subdistU ? `${subdistU} ST` : ''
  const stU = String(stateAbbr || '').trim().toUpperCase()

  // Tier 1 — GeoJSON polygon centroid.
  for (const f of villageFeatures) {
    const v = String(f.properties?.v ?? '').trim().toLowerCase()
    if (v !== targetV) continue
    if (subdistU) {
      const sd = String(f.properties?.sd ?? '').trim().toUpperCase()
      if (sd !== subdistU && sd !== subdistSt) continue
    }
    if (stU) {
      const st = String(f.properties?.st ?? '').trim().toUpperCase()
      if (st !== stU) continue
    }
    try {
      const bounds = L.geoJSON(f).getBounds()
      if (bounds.isValid()) {
        const c = bounds.getCenter()
        if (Number.isFinite(c.lat) && Number.isFinite(c.lng)) {
          return { coords: [c.lat, c.lng], feature: f }
        }
      }
    } catch {
      /* malformed feature — try next */
    }
  }

  // Tier 2 — static cache (legacy `v|block` shape, then bare `v`).
  if (villageGeoCache && typeof villageGeoCache === 'object') {
    const b = String(blockName || '')
      .trim()
      .toLowerCase()
    const keys = [b ? `${targetV}|${b}` : '', targetV]
    for (const key of keys) {
      if (!key) continue
      const hit = villageGeoCache[key]
      if (
        Array.isArray(hit) &&
        hit.length === 2 &&
        Number.isFinite(hit[0]) &&
        Number.isFinite(hit[1]) &&
        hit[0] >= 25 &&
        hit[0] <= 35 &&
        hit[1] >= 70 &&
        hit[1] <= 80
      ) {
        return { coords: [hit[0], hit[1]], feature: null }
      }
    }
  }

  return null
}
