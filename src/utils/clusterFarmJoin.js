import { getClusterFarms } from './joinFarms'

/**
 * @param {import('./parseExcel.js').FarmRecord[]} records
 * @param {Array<{ village: string, block: string, district: string, state?: string }>} villages
 */
export function getFarmsForClusterVillages(records, villages) {
  if (!records?.length || !villages?.length) return []
  const { farms } = getClusterFarms(villages, records)
  return /** @type {import('./parseExcel.js').FarmRecord[]} */ (farms)
}

export { getClusterFarms } from './joinFarms'
