/** @typedef {import('./parseExcel').FarmRecord} FarmRecord */

/**
 * @typedef {Object} GeoSelection
 * @property {string} stateKey
 * @property {string} districtKey
 * @property {string} blockKey
 * @property {string} villageKey
 */

export function farmFullyAccepted(r) {
  return r.farmerAuth === 'ACCEPTED' && r.farmAuth === 'ACCEPTED'
}

export function farmRejectedAuth(r) {
  return r.farmerAuth === 'REJECTED' || r.farmAuth === 'REJECTED'
}

/**
 * @param {FarmRecord[]} records
 * @param {GeoSelection} sel
 * @returns {FarmRecord[]}
 */
export function applyGeoFilters(records, sel) {
  return records.filter((r) => {
    if (sel.stateKey && r._stateKey !== sel.stateKey) return false
    if (sel.districtKey && r._districtKey !== sel.districtKey) return false
    if (sel.blockKey && r._blockKey !== sel.blockKey) return false
    if (sel.villageKey && r._villageKey !== sel.villageKey) return false
    return true
  })
}

/**
 * @param {FarmRecord[]} records
 * @returns {{ value: string, label: string }[]}
 */
function uniqueStateOptions(records) {
  const map = new Map()
  for (const r of records) {
    if (!r._stateKey) continue
    if (!map.has(r._stateKey)) map.set(r._stateKey, r.state || r._stateKey)
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([value, label]) => ({ value, label: label || value }))
}

/**
 * @param {FarmRecord[]} records
 * @param {GeoSelection} partial
 * @returns {{ value: string, label: string }[]}
 */
export function districtOptions(records, partial) {
  const filtered = applyGeoFilters(records, {
    stateKey: partial.stateKey,
    districtKey: '',
    blockKey: '',
    villageKey: '',
  })
  const map = new Map()
  for (const r of filtered) {
    if (!r._districtKey) continue
    if (!map.has(r._districtKey)) map.set(r._districtKey, r.district || r._districtKey)
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([value, label]) => ({ value, label: label || value }))
}

/**
 * @param {FarmRecord[]} records
 * @param {GeoSelection} partial
 */
export function blockOptions(records, partial) {
  const filtered = applyGeoFilters(records, {
    stateKey: partial.stateKey,
    districtKey: partial.districtKey,
    blockKey: '',
    villageKey: '',
  })
  const map = new Map()
  for (const r of filtered) {
    if (!r._blockKey) continue
    if (!map.has(r._blockKey)) map.set(r._blockKey, r.block || r._blockKey)
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([value, label]) => ({ value, label: label || value }))
}

/**
 * @param {FarmRecord[]} records
 * @param {GeoSelection} partial
 */
export function villageOptions(records, partial) {
  const filtered = applyGeoFilters(records, {
    stateKey: partial.stateKey,
    districtKey: partial.districtKey,
    blockKey: partial.blockKey,
    villageKey: '',
  })
  const map = new Map()
  for (const r of filtered) {
    if (!r._villageKey) continue
    if (!map.has(r._villageKey)) map.set(r._villageKey, r.village || r._villageKey)
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([value, label]) => ({ value, label: label || value }))
}

export { uniqueStateOptions }

/**
 * @param {FarmRecord[]} filtered
 */
export function summaryStats(filtered) {
  const farmIds = new Set(filtered.map((r) => r.farmId))
  const surveyors = new Set(filtered.map((r) => r.surveyorKey))
  const acceptedBoth = filtered.filter((r) => farmFullyAccepted(r))
  const acceptedFarms = new Set(acceptedBoth.map((r) => r.farmId))

  let totalArea = 0
  const areaByFarm = new Map()
  for (const r of filtered) {
    if (!areaByFarm.has(r.farmId)) {
      areaByFarm.set(r.farmId, r.areaAcres)
    }
  }
  for (const v of areaByFarm.values()) totalArea += v

  return {
    totalFarms: farmIds.size,
    totalSurveyors: surveyors.size,
    dsrEligibleCount: acceptedFarms.size,
    totalAreaAcres: totalArea,
  }
}

/**
 * @param {FarmRecord[]} filtered
 */
export function buildSurveyorAggregates(filtered) {
  /** @type {Map<string, { label: string, farms: Map<string, FarmRecord> }>} */
  const map = new Map()

  for (const r of filtered) {
    const key = r.surveyorKey
    if (!map.has(key)) {
      map.set(key, { label: r.surveyor, farms: new Map() })
    }
    const entry = map.get(key)
    if (!entry.farms.has(r.farmId)) entry.farms.set(r.farmId, r)
  }

  /** @type {Array<{ surveyorKey: string, surveyorLabel: string, farmsCovered: number, villages: number, totalArea: number, eligible: number, rejectedAuthFarms: number }>} */
  const rows = []

  for (const [surveyorKey, { label, farms }] of map) {
    const farmList = [...farms.values()]
    const villageSet = new Set(
      farmList.map((x) => x._villageKey).filter(Boolean),
    )
    let totalArea = 0
    let eligible = 0
    let rejectedAuthFarms = 0

    for (const r of farmList) {
      totalArea += r.areaAcres
      if (farmFullyAccepted(r)) eligible += 1
      if (farmRejectedAuth(r)) rejectedAuthFarms += 1
    }

    rows.push({
      surveyorKey,
      surveyorLabel: label,
      farmsCovered: farms.size,
      villages: villageSet.size,
      totalArea,
      eligible,
      rejectedAuthFarms,
    })
  }

  rows.sort((a, b) => a.surveyorLabel.localeCompare(b.surveyorLabel))
  return rows
}

/**
 * @param {FarmRecord[]} filtered
 * @param {string} surveyorKey
 */
export function farmsForSurveyor(filtered, surveyorKey) {
  return filtered.filter((r) => r.surveyorKey === surveyorKey)
}
