/**
 * Spread clusters that share the same district centroid in a small circle (degrees).
 * @param {Array<{ districtKey?: string, lat?: number, lon?: number, [k: string]: unknown }>} clusters
 */
export function jitterClusters(clusters) {
  /** @type {Record<string, typeof clusters>} */
  const byDistrict = {}
  for (const c of clusters) {
    const key = c.districtKey || '__none__'
    if (!byDistrict[key]) byDistrict[key] = []
    byDistrict[key].push(c)
  }

  return clusters.map((c) => {
    const key = c.districtKey || '__none__'
    const group = byDistrict[key]
    if (!group || group.length <= 1) return c
    if (c.lat == null || c.lon == null || !Number.isFinite(c.lat) || !Number.isFinite(c.lon))
      return c
    const idx = group.indexOf(c)
    if (idx < 0) return c
    const angle = (2 * Math.PI * idx) / group.length
    const radius = 0.18 * Math.sqrt(group.length)
    return {
      ...c,
      lat: c.lat + radius * Math.sin(angle),
      lon: c.lon + radius * Math.cos(angle),
    }
  })
}
