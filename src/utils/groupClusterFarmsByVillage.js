import { normaliseDistrict, normaliseBlock } from './joinFarms'

/**
 * Stronger normalisation for village names than the cluster join uses.
 * Lower-cases, trims, collapses whitespace, and treats underscores as spaces.
 * @param {unknown} v
 */
function normaliseVillage(v) {
  if (v == null || v === '') return ''
  return String(v)
    .trim()
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
}

/**
 * Aggressive "tight key" for fuzzy village matching: lower-cased and
 * with every non-alphanumeric character stripped out. Catches the
 * common name divergences between cluster CSV and spreadsheet — e.g.
 * `"Harni Khurd"`, `"Harni-Khurd"`, `"Harni_Khurd"`, `"harnikhurd"`
 * all collapse to `"harnikhurd"`.
 *
 * Only used as a fallback after the strict tiers fail; we still
 * gate the lookup on (district, block) so the same tight name in a
 * different region can't bleed in.
 *
 * @param {unknown} v
 */
function tightVillageKey(v) {
  if (v == null || v === '') return ''
  return String(v).toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * For every cluster CSV village, return the spreadsheet rows that join to it
 * using the same 3-tier policy as `getClusterFarms` in `joinFarms.js`:
 *   tier 1 — village + district (with district aliases)
 *   tier 2 — village + block
 *   tier 3 — village + state (last resort, cluster state if village omits one)
 *
 * Indexes are built once from all records (not per-village), so the overall
 * cost is O(records + clusterVillages) and the click handler can read each
 * village's farms in O(1).
 *
 * IMPORTANT: pass the FULL spreadsheet records (not a geo-filtered slice).
 * Cluster drill-down must always join against every row.
 *
 * @param {Array<{ village: string, block?: string, district?: string, state?: string }>} clusterVillages
 * @param {import('./parseExcel.js').FarmRecord[]} records
 * @returns {{
 *   farmsByVillage: Map<string, import('./parseExcel.js').FarmRecord[]>,
 *   allFarms: import('./parseExcel.js').FarmRecord[],
 *   tierByVillage: Map<string, 0 | 1 | 2 | 3>,
 * }}
 */
export function groupClusterFarmsByVillage(clusterVillages, records) {
  /** @type {Map<string, import('./parseExcel.js').FarmRecord[]>} */
  const farmsByVillage = new Map()
  /** @type {Map<string, 0 | 1 | 2 | 3>} */
  const tierByVillage = new Map()
  if (!clusterVillages?.length || !records?.length) {
    return { farmsByVillage, allFarms: [], tierByVillage }
  }

  const clusterState =
    clusterVillages
      .map((v) => String(v.state ?? '').trim().toLowerCase())
      .find(Boolean) || ''

  /** @type {Map<string, import('./parseExcel.js').FarmRecord[]>} */
  const byVD = new Map()
  /** @type {Map<string, import('./parseExcel.js').FarmRecord[]>} */
  const byVB = new Map()
  /** @type {Map<string, import('./parseExcel.js').FarmRecord[]>} */
  const byVS = new Map()
  // Tight-key fuzzy index, scoped to (district, block). Used only when
  // every strict tier whiffs — saves cluster villages whose CSV spelling
  // disagrees slightly with the spreadsheet (`Harni-Khurd` vs `Harni Khurd`).
  /** @type {Map<string, import('./parseExcel.js').FarmRecord[]>} */
  const byTightDB = new Map()

  for (const r of records) {
    const v = normaliseVillage(r.village)
    if (!v) continue
    const d = normaliseDistrict(r.district)
    const b = normaliseBlock(r.block)
    const s = String(r.state ?? '').trim().toLowerCase()
    if (d) {
      const k = `${v}|${d}`
      const arr = byVD.get(k)
      if (arr) arr.push(r)
      else byVD.set(k, [r])
    }
    if (b) {
      const k = `${v}|${b}`
      const arr = byVB.get(k)
      if (arr) arr.push(r)
      else byVB.set(k, [r])
    }
    if (s) {
      const k = `${v}|${s}`
      const arr = byVS.get(k)
      if (arr) arr.push(r)
      else byVS.set(k, [r])
    }
    const tight = tightVillageKey(r.village)
    if (tight && d) {
      const k = `${tight}|${d}${b ? `|${b}` : ''}`
      const arr = byTightDB.get(k)
      if (arr) arr.push(r)
      else byTightDB.set(k, [r])
    }
  }

  /** @type {Set<import('./parseExcel.js').FarmRecord>} */
  const seen = new Set()
  /** @type {import('./parseExcel.js').FarmRecord[]} */
  const allFarms = []

  for (const cv of clusterVillages) {
    const vKey = normaliseVillage(cv.village)
    if (!vKey) continue
    if (farmsByVillage.has(vKey)) continue

    const d = normaliseDistrict(cv.district)
    const b = normaliseBlock(cv.block)
    const sRaw = String(cv.state ?? '').trim().toLowerCase()
    const s = sRaw || clusterState

    let matches = d ? byVD.get(`${vKey}|${d}`) : null
    /** @type {0 | 1 | 2 | 3 | 4} */
    let tier = matches && matches.length ? 1 : 0
    if (!tier) {
      matches = b ? byVB.get(`${vKey}|${b}`) : null
      if (matches && matches.length) tier = 2
    }
    if (!tier) {
      matches = s ? byVS.get(`${vKey}|${s}`) : null
      if (matches && matches.length) tier = 3
    }
    // Tier 4: fuzzy village name (separator-stripped) inside the
    // cluster village's own (district, block). Try the tighter
    // district+block key first, then district-only.
    if (!tier) {
      const tight = tightVillageKey(cv.village)
      if (tight && d) {
        if (b) {
          matches = byTightDB.get(`${tight}|${d}|${b}`) || null
        }
        if (!matches?.length) matches = byTightDB.get(`${tight}|${d}`) || null
        if (matches && matches.length) tier = 4
      }
    }

    const list = matches ? [...matches] : []
    farmsByVillage.set(vKey, list)
    tierByVillage.set(vKey, /** @type {0 | 1 | 2 | 3} */ (tier === 4 ? 3 : tier))

    for (const r of list) {
      if (!seen.has(r)) {
        seen.add(r)
        allFarms.push(r)
      }
    }
  }

  return { farmsByVillage, allFarms, tierByVillage }
}

export { normaliseVillage }
