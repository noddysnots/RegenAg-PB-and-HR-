/** @typedef {{ village: string, block: string, district: string, state?: string }} ClusterVillage */

const DISTRICT_ALIASES = {
  'sri muktsar sahib': 'muktsar',
  'shri muktsar sahib': 'muktsar',
  'sri muktsar': 'muktsar',
  muktsar: 'muktsar',
  'tarn taran': 'tarn_taran',
  tarn_taran: 'tarn_taran',
}

/**
 * @param {unknown} d
 */
export const normaliseDistrict = (d) => {
  if (d == null || d === '') return ''
  const n = String(d).trim().toLowerCase()
  return DISTRICT_ALIASES[n] || n.replace(/\s+/g, '_')
}

/**
 * @param {unknown} b
 */
export const normaliseBlock = (b) => {
  if (b == null || b === '') return ''
  return String(b)
    .trim()
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
}

/**
 * @param {Record<string, unknown>} row
 */
function villageOf(row) {
  return String(row.Village ?? row.village ?? '').trim()
}

/**
 * @param {Record<string, unknown>} row
 */
function districtOf(row) {
  return String(row.District ?? row.district ?? '').trim()
}

/**
 * @param {Record<string, unknown>} row
 */
function blockOf(row) {
  return String(row.Block ?? row.block ?? '').trim()
}

/**
 * @param {Record<string, unknown>} row
 */
function stateOf(row) {
  return String(row.State ?? row.state ?? '').trim()
}

/**
 * Three-tier join: village+district (with district aliases), then village+block,
 * then village+state as last resort.
 *
 * @param {ClusterVillage[]} clusterVillages
 * @param {Record<string, unknown>[]} spreadsheetData
 * @returns {{ farms: Record<string, unknown>[], tier: 0 | 1 | 2 | 3 }}
 */
export function getClusterFarms(clusterVillages, spreadsheetData) {
  if (!clusterVillages?.length || !spreadsheetData?.length) {
    return { farms: [], tier: 0 }
  }

  const districtKeys = new Set(
    clusterVillages.map(
      (v) =>
        `${String(v.village ?? '').trim().toLowerCase()}|${normaliseDistrict(v.district)}`,
    ),
  )
  const blockKeys = new Set(
    clusterVillages.map(
      (v) =>
        `${String(v.village ?? '').trim().toLowerCase()}|${normaliseBlock(v.block)}`,
    ),
  )
  const villageOnlyKeys = new Set(
    clusterVillages.map((v) => String(v.village ?? '').trim().toLowerCase()),
  )
  const clusterState =
    clusterVillages
      .map((v) => String(v.state ?? '').trim().toLowerCase())
      .find(Boolean) || ''

  /** @type {Record<string, unknown>[]} */
  let matches = spreadsheetData.filter((row) => {
    const key = `${villageOf(row).toLowerCase()}|${normaliseDistrict(districtOf(row))}`
    return districtKeys.has(key)
  })

  let tier = /** @type {0 | 1 | 2 | 3} */ (0)
  if (matches.length > 0) {
    tier = 1
  } else {
    matches = spreadsheetData.filter((row) => {
      const key = `${villageOf(row).toLowerCase()}|${normaliseBlock(blockOf(row))}`
      return blockKeys.has(key)
    })
    if (matches.length > 0) {
      tier = 2
    } else {
      matches = spreadsheetData.filter((row) => {
        if (!villageOnlyKeys.has(villageOf(row).toLowerCase())) return false
        if (!clusterState) return false
        return stateOf(row).trim().toLowerCase() === clusterState
      })
      tier = matches.length > 0 ? 3 : 0
    }
  }

  if (import.meta.env?.DEV) {
    // eslint-disable-next-line no-console
    console.log('tier used:', tier, 'farms:', matches.length)
  }

  return { farms: matches, tier }
}
