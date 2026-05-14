import { computeConvexHullLatLng } from './convexHull'
import { placeClusterVillagePoints } from './geocodeBlocks'

/**
 * Muted 12-colour palette, cycled by cluster index so each cluster
 * gets a stable colour without overlapping bubble fills (which use a
 * farm-count scale).
 */
export const TERRITORY_COLORS = [
  '#4E79A7',
  '#F28E2B',
  '#E15759',
  '#76B7B2',
  '#59A14F',
  '#EDC948',
  '#B07AA1',
  '#FF9DA7',
  '#9C755F',
  '#BAB0AC',
  '#499894',
  '#86BCB6',
]

/**
 * @param {number} index
 * @returns {string}
 */
export function getTerritoryColor(index) {
  return TERRITORY_COLORS[
    ((index % TERRITORY_COLORS.length) + TERRITORY_COLORS.length) %
      TERRITORY_COLORS.length
  ]
}

/**
 * @typedef {object} ClusterTerritory
 * @property {import('../components/ClusterLayer.jsx').Cluster} cluster
 * @property {Array<[number, number]>} hull
 * @property {string} color
 */

/**
 * Build convex-hull territory polygons for every cluster that has at
 * least three distinct village coordinates in the block-geocode cache.
 * Clusters with fewer points are skipped silently.
 * @param {import('../components/ClusterLayer.jsx').Cluster[]} clusters
 * @returns {ClusterTerritory[]}
 */
export function buildClusterTerritories(clusters) {
  if (!clusters?.length) return []

  /** @type {ClusterTerritory[]} */
  const out = []
  for (let i = 0; i < clusters.length; i += 1) {
    const cluster = clusters[i]
    if (!cluster?.villages?.length) continue

    const points = placeClusterVillagePoints(cluster.villages)
    if (points.length < 3) continue

    const hull = computeConvexHullLatLng(
      points.map((p) => /** @type {[number, number]} */ ([p.lat, p.lon])),
    )
    if (hull.length < 3) continue

    out.push({
      cluster,
      hull,
      color: getTerritoryColor(i),
    })
  }
  return out
}
