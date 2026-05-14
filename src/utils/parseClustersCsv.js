import Papa from 'papaparse'
import { getClusterCoords } from './districtCentroids'
import { resolveDistrict } from './districtNameMap'

function normalizeHeader(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function isBlank(v) {
  return v == null || String(v).trim() === ''
}

function num(v) {
  const n = Number(String(v ?? '').replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

function parseFarmCount(v) {
  const f = parseFloat(String(v ?? '').replace(/,/g, ''))
  return Number.isFinite(f) ? f : Infinity
}

function buildLookup(headerRow) {
  const lookup = new Map()
  for (const key of Object.keys(headerRow)) {
    const nk = normalizeHeader(key)
    if (nk) lookup.set(nk, key)
  }
  return lookup
}

function resolveCol(lookup, aliases) {
  for (const a of aliases) {
    const nk = normalizeHeader(a)
    if (lookup.has(nk)) return lookup.get(nk)
  }
  for (const a of aliases) {
    const na = normalizeHeader(a)
    for (const [hk, orig] of lookup.entries()) {
      if (hk === na || hk.includes(na) || na.includes(hk)) return orig
    }
  }
  return null
}

const COL_ALIASES = {
  clusterId: ['cluster_id', 'cluster id', 'clusterid'],
  clusterName: ['cluster_name', 'cluster name', 'clustername'],
  state: ['state'],
  district: ['district'],
  block: ['block'],
  village: ['village'],
  centroidFarms: ['centroid_farms', 'centroid farms', 'farms'],
  centroidAcres: ['centroid_acres', 'centroid acres', 'acres'],
  category: ['category'],
}

function getVal(row, col) {
  if (!col) return null
  return row[col]
}

/**
 * @typedef {object} ParsedCluster
 * @property {string} cluster_id
 * @property {string} cluster_name
 * @property {string} state
 * @property {number} farms
 * @property {number} acres
 * @property {Array<{ district: string, block: string, village: string, state: string, farms: number, acres: number }>} villages
 * @property {number} [lat]
 * @property {number} [lon]
 * @property {string} [districtKey] canonical district key for jitter grouping
 */

/**
 * @param {string} csvText
 * @returns {{ clusters: ParsedCluster[], rows: Record<string, unknown>[], errors: string[], clusterVillagesById: Record<string, ParsedCluster['villages']> }}
 */
export function parseClustersCsv(csvText) {
  const errors = []
  const parsed = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => String(h).trim(),
  })

  if (parsed.errors?.length) {
    for (const e of parsed.errors) {
      errors.push(e.message || 'CSV parse error')
    }
  }

  const data = /** @type {Record<string, unknown>[]} */ (parsed.data ?? [])
  if (!data.length) {
    return {
      clusters: [],
      rows: [],
      errors: [...errors, 'No rows in clusters CSV'],
      clusterVillagesById: {},
    }
  }

  const lookup = buildLookup(data[0])
  const col = {}
  for (const [field, aliases] of Object.entries(COL_ALIASES)) {
    col[field] = resolveCol(lookup, aliases)
    if (!col[field]) {
      errors.push(`Clusters CSV: missing column for "${field}"`)
    }
  }

  if (!col.clusterId) {
    return { clusters: [], rows: data, errors, clusterVillagesById: {} }
  }

  /** Blank rollup / summary rows (district, block, village all empty). */
  const blankRows = data.filter(
    (r) =>
      isBlank(getVal(r, col.district)) &&
      isBlank(getVal(r, col.block)) &&
      isBlank(getVal(r, col.village)),
  )

  /** Pick the blank row with minimum centroid_farms per cluster_id (cluster total, not state rollup). */
  /** @type {Record<string, Record<string, unknown>>} */
  const clusterSummaries = {}
  for (const row of blankRows) {
    const id = String(getVal(row, col.clusterId) ?? '').trim()
    if (!id) continue
    const f = parseFarmCount(getVal(row, col.centroidFarms))
    const existing = clusterSummaries[id]
    const exF = existing
      ? parseFarmCount(getVal(existing, col.centroidFarms))
      : Infinity
    if (!existing || f < exF) {
      clusterSummaries[id] = row
    }
  }

  /** @type {Map<string, Record<string, unknown>[]>} */
  const byId = new Map()
  for (const row of data) {
    const id = String(getVal(row, col.clusterId) ?? '').trim()
    if (!id) continue
    if (!byId.has(id)) byId.set(id, [])
    byId.get(id).push(row)
  }

  /** @type {ParsedCluster[]} */
  const clusters = []

  for (const [clusterId, rows] of byId) {
    const summaryRow = clusterSummaries[clusterId] ?? null

    const villageRows = rows.filter(
      (r) =>
        !isBlank(getVal(r, col.village)) && isBlank(getVal(r, col.category)),
    )

    const nameRow = summaryRow ?? villageRows[0] ?? rows[0]
    const clusterName = String(getVal(nameRow, col.clusterName) ?? clusterId).trim()
    const state = String(getVal(nameRow, col.state) ?? '').trim()

    const farms = summaryRow
      ? num(getVal(summaryRow, col.centroidFarms))
      : villageRows.reduce((s, r) => s + num(getVal(r, col.centroidFarms)), 0)

    const acres = summaryRow
      ? num(getVal(summaryRow, col.centroidAcres))
      : villageRows.reduce((s, r) => s + num(getVal(r, col.centroidAcres)), 0)

    const villages = villageRows.map((r) => ({
      district: String(getVal(r, col.district) ?? '').trim(),
      block: String(getVal(r, col.block) ?? '').trim(),
      village: String(getVal(r, col.village) ?? '').trim(),
      state:
        String(getVal(r, col.state) ?? '').trim() ||
        state,
      farms: num(getVal(r, col.centroidFarms)),
      acres: num(getVal(r, col.centroidAcres)),
    }))

    const firstDist = villages[0]?.district ?? ''
    const districtKey = firstDist ? resolveDistrict(firstDist) : ''
    const coords = firstDist ? getClusterCoords(districtKey) : null

    clusters.push({
      cluster_id: clusterId,
      cluster_name: clusterName,
      state,
      farms,
      acres,
      villages,
      districtKey,
      lat: coords?.[0],
      lon: coords?.[1],
    })
  }

  clusters.sort((a, b) => a.cluster_name.localeCompare(b.cluster_name))

  /** @type {Record<string, ParsedCluster['villages']>} */
  const clusterVillagesById = {}
  for (const c of clusters) {
    clusterVillagesById[c.cluster_id] = c.villages
  }

  console.log('[clusters] parsed count:', clusters.length)

  return { clusters, rows: data, errors, clusterVillagesById }
}
