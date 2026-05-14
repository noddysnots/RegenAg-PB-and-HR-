import * as XLSX from 'xlsx'
import { normalise, resolveDistrict } from './districtNameMap'

/**
 * @typedef {Object} FarmRecord
 * @property {string} state
 * @property {string} district
 * @property {string} block
 * @property {string} village
 * @property {string} _stateKey
 * @property {string} _districtKey
 * @property {string} _blockKey
 * @property {string} _villageKey
 * @property {string} surveyor
 * @property {string} surveyorKey
 * @property {string} farmId
 * @property {string} farmerId
 * @property {string} farmerName
 * @property {string} partnerName
 * @property {number} areaAcres
 * @property {string} finalStatus
 * @property {string} farmerAuth
 * @property {string} farmAuth
 * @property {Date | null} onboardingDate
 * @property {Record<string, unknown>} _raw
 */

const UNASSIGNED = 'Unassigned'
const UNASSIGNED_KEY = '__UNASSIGNED__'

function normalizeHeader(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function geoGroupKey(value) {
  return normalise(value)
}

function excelSerialToDate(serial) {
  if (serial == null || serial === '') return null
  const n = Number(serial)
  if (!Number.isFinite(n)) {
    const d = new Date(serial)
    return Number.isNaN(d.getTime()) ? null : d
  }
  return new Date((n - 25569) * 86400 * 1000)
}

function parseOnboardedDate(v) {
  if (v == null || v === '') return null
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v
  if (typeof v === 'number' && Number.isFinite(v)) return excelSerialToDate(v)
  return excelSerialToDate(v)
}

const FIELD_ALIASES = {
  state: ['state'],
  district: ['district'],
  block: ['block'],
  village: ['village'],
  surveyor: [
    'surveyor name',
    'name of surveyor',
    'surveyor',
    'name of surveyor who conducted the survey',
  ],
  farmId: ['farm id', 'farmid', 'farm_id'],
  farmerId: ['farmer id', 'farmerid', 'farmer_id'],
  farmerName: ['farmer name', 'name of farmer', 'farmername'],
  partnerName: ['partner name', 'name of tenant', 'tenant name', 'tenant'],
  area: [
    'cal. farm area (acres)',
    'cal farm area (acres)',
    'calculated farm area (acres)',
    'calculated farm area',
    'farm area',
  ],
  finalStatus: ['final status', 'finalstatus'],
  farmerAuth: ['farmer authentication', 'farmer auth'],
  farmAuth: ['farm authentication', 'farm auth'],
  onboardingDate: [
    'farmer onboarded date',
    'date of onboarding',
    'onboarding date',
  ],
}

function buildHeaderLookup(headerRow) {
  const lookup = new Map()
  for (const key of Object.keys(headerRow)) {
    const nk = normalizeHeader(key)
    if (nk) lookup.set(nk, key)
  }
  return lookup
}

function resolveColumn(lookup, aliases) {
  for (const alias of aliases) {
    const nk = normalizeHeader(alias)
    if (lookup.has(nk)) return lookup.get(nk)
  }
  for (const alias of aliases) {
    const na = normalizeHeader(alias)
    for (const [hk, orig] of lookup.entries()) {
      if (hk === na || hk.includes(na) || na.includes(hk)) return orig
    }
  }
  return null
}

function getField(row, columnOriginal) {
  if (!columnOriginal) return null
  return row[columnOriginal]
}

function stringish(v) {
  if (v == null) return ''
  return String(v).trim()
}

function parseArea(v) {
  if (v == null || v === '') return 0
  const n = Number(String(v).replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

/** Normalise auth to ACCEPTED | REJECTED | '' */
function authToken(v) {
  const s = stringish(v).toLowerCase()
  if (s === 'accepted' || s === 'accept') return 'ACCEPTED'
  if (s === 'rejected' || s === 'reject') return 'REJECTED'
  if (!s) return ''
  const u = s.toUpperCase()
  if (u === 'ACCEPTED' || u === 'PENDING' || u === 'REJECTED') {
    if (u === 'PENDING') return 'PENDING'
    return u
  }
  return ''
}

/**
 * @param {ArrayBuffer} arrayBuffer
 * @returns {{ records: FarmRecord[], errors: string[] }}
 */
export function parseExcelBuffer(arrayBuffer) {
  const errors = []
  let wb
  try {
    wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true })
  } catch (e) {
    errors.push(e instanceof Error ? e.message : 'Failed to read workbook')
    return { records: [], errors }
  }

  const sheetName = wb.SheetNames.includes('Sheet1')
    ? 'Sheet1'
    : wb.SheetNames[0]

  if (!sheetName) {
    errors.push('No sheets found in workbook')
    return { records: [], errors }
  }

  const sheet = wb.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json(sheet, {
    defval: null,
    raw: true,
  })

  if (!rows.length) {
    return { records: [], errors }
  }

  const lookup = buildHeaderLookup(rows[0])
  const optionalFields = new Set(['finalStatus', 'partnerName'])

  const col = {}
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    col[field] = resolveColumn(lookup, aliases)
    if (!col[field] && !optionalFields.has(field)) {
      errors.push(`Could not resolve column for "${field}"`)
    }
  }

  /** @type {FarmRecord[]} */
  const records = []

  rows.forEach((row, idx) => {
    const stateDisp = stringish(getField(row, col.state))
    const districtDisp = stringish(getField(row, col.district))
    const blockDisp = stringish(getField(row, col.block))
    const villageDisp = stringish(getField(row, col.village))

    const surveyorRaw = getField(row, col.surveyor)
    const surveyorDisp =
      surveyorRaw == null || String(surveyorRaw).trim() === ''
        ? UNASSIGNED
        : String(surveyorRaw).trim()

    const farmIdRaw = getField(row, col.farmId)
    const farmerIdRaw = getField(row, col.farmerId)
    const farmId =
      farmIdRaw == null || farmIdRaw === ''
        ? `__synthetic_farm_${idx}`
        : String(farmIdRaw).trim()
    const farmerId =
      farmerIdRaw == null || farmerIdRaw === ''
        ? ''
        : String(farmerIdRaw).trim()

    const farmerName = stringish(getField(row, col.farmerName))
    const partnerName = stringish(getField(row, col.partnerName))
    const areaAcres = parseArea(getField(row, col.area))
    const finalStatus = col.finalStatus
      ? stringish(getField(row, col.finalStatus))
      : ''
    const farmerAuth = authToken(getField(row, col.farmerAuth))
    const farmAuth = authToken(getField(row, col.farmAuth))
    const onboardingDate = parseOnboardedDate(getField(row, col.onboardingDate))

    const surveyorKey =
      surveyorDisp === UNASSIGNED ? UNASSIGNED_KEY : geoGroupKey(surveyorDisp)

    const districtKey = resolveDistrict(districtDisp)

    const rawDetails = { ...row }

    records.push({
      state: stateDisp,
      district: districtDisp,
      block: blockDisp,
      village: villageDisp,
      _stateKey: geoGroupKey(stateDisp),
      _districtKey: districtKey,
      _blockKey: geoGroupKey(blockDisp),
      _villageKey: geoGroupKey(villageDisp),
      surveyor: surveyorDisp,
      surveyorKey,
      farmId,
      farmerId,
      farmerName,
      partnerName,
      areaAcres,
      finalStatus,
      farmerAuth,
      farmAuth,
      onboardingDate,
      _raw: rawDetails,
    })
  })

  return { records, errors }
}

export { UNASSIGNED, UNASSIGNED_KEY }
