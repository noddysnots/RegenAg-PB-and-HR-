/**
 * Monotone chain convex hull on [lat, lon] pairs (lon treated as x, lat as y).
 * @param {Array<[number, number]>} points
 * @returns {Array<[number, number]>} hull vertices in CCW order (no repeated first point)
 */
export function computeConvexHullLatLng(points) {
  if (!points?.length) return []
  const uniq = []
  const seen = new Set()
  for (const p of points) {
    if (!Array.isArray(p) || p.length < 2) continue
    const lat = p[0]
    const lon = p[1]
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
    const k = `${lat.toFixed(6)},${lon.toFixed(6)}`
    if (seen.has(k)) continue
    seen.add(k)
    uniq.push([lat, lon])
  }
  if (uniq.length <= 1) return uniq
  if (uniq.length === 2) return uniq

  const sorted = [...uniq].sort((a, b) => a[1] - b[1] || a[0] - b[0])
  const cross = (O, A, B) =>
    (A[1] - O[1]) * (B[0] - O[0]) - (A[0] - O[0]) * (B[1] - O[1])

  const lower = []
  for (const p of sorted) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0
    ) {
      lower.pop()
    }
    lower.push(p)
  }
  const upper = []
  for (const p of [...sorted].reverse()) {
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0
    ) {
      upper.pop()
    }
    upper.push(p)
  }
  upper.pop()
  lower.pop()
  return [...lower, ...upper]
}
