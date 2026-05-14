/**
 * Map farm-xlsx block names to the `sd` (subdistrict) value used by
 * `PB_HR_Villages.geojson`. The new pipeline unions all village
 * polygons sharing the same `sd` to draw a block outline — there is
 * no separate "block" GeoJSON file any more.
 *
 * `sd` values are always uppercase. Some Haryana subdistricts ship
 * with a trailing ` ST` suffix (Sub-Tehsil), which callers handle by
 * matching either the bare value or `value + ' ST'` — see
 * `resolveBlockToSubdist` consumers for the convention.
 *
 * Keys are uppercased and may contain underscores or hyphens; lookup
 * tries the exact spreadsheet form first, then a space-normalised
 * variant, then falls back to the space-normalised key as-is.
 * @type {Record<string, string>}
 */
export const BLOCK_TO_SUBDIST = {
  // ── Haryana — spacing / suffix fixes ─────────────────────────────
  'AMBALA-I': 'AMBALA',
  'AMBALA-II': 'AMBALA',
  'HANSI-I': 'HANSI',
  'HANSI-II': 'HANSI',
  'HISAR-I': 'HISAR',
  ASANDH: 'ASSANDH',
  'GHARAUNDA (PART)': 'GHARAUNDA',
  'GHARAUNDA_(PART)': 'GHARAUNDA',
  GHARUNDA: 'GHARAUNDA',
  NATHUSARI_CHOPTA: 'NATHUSARI CHOPTA',
  'NATHUSARI CHOPTA': 'NATHUSARI CHOPTA',
  BABAIN: 'BABAIN ST',
  BHATTU_KALAN: 'BHATTUKALAN ST',
  'BHATTU KALAN': 'BHATTUKALAN ST',
  BHUNA: 'BHUNA ST',
  DHAND: 'DHAND ST',
  HASSANPUR: 'HASSANPUR ST',
  ISMAILABAD: 'ISMAILABAD ST',
  JAKHAL: 'JAKHAL ST',
  KHIZRABAD: 'KHIZRABAD ST',
  PILLUKHERA: 'PILLUKHERA ST',
  SAHA: 'SAHA ST',
  SHAHZADPUR: 'SHAHZADPUR ST',
  SIWAN: 'SIWAN ST',
  UKLANA: 'UKLANA ST',
  PUNDRI: 'FATEHPUR PUNDRI',

  // ── Punjab — underscore / spacing / spelling fixes ───────────────
  TALWANDI_SABO: 'TALWANDI SABO',
  'TALWANDI SABO': 'TALWANDI SABO',
  TARN_TARAN: 'TARN TARAN',
  KHADOOR_SAHIB: 'KHADUR SAHIB',
  BASSI_PATHANA: 'BASSI PATHANA',
  DERA_BASSI: 'DERA BASSI',
  GURU_HAR_SAHAI: 'GURU HAR SAHAI',
  MEHAL_KALAN: 'MEHAL KALAN',
  GHALL_KHURD: 'GHALL KHURD',
  CHOHLA_SAHIB: 'CHOHLA SAHIB',
  SIDHWAN_BET: 'SIDHWAN BET',
  'MOGA-I': 'MOGA',
  'LUDHIANA-I': 'LUDHIANA 1',
  'LUDHIANA-II': 'LUDHIANA 2',
  KOTKAPURA: 'KOT KAPURA',
  JANDIALA: 'JANDIALA GURU',
  LEHRAGAGA: 'LEHRA GAGA',
  RAMPURA: 'RAMPURA PHUL',
  KALANOUR: 'KALANAUR',
  SHRI_HAR_GOBIND: 'SRI HARGOBINDPUR',
  HARSH_CHHINA: 'HARSA CHHINA',
  PHULL: 'PHUL',
}

/**
 * Resolve a spreadsheet block name to the `sd` value in the village
 * GeoJSON. Match priority:
 *   1. Exact uppercased spreadsheet form (preserves hyphens like
 *      `AMBALA-I`, `MOGA-I`).
 *   2. Same string with underscores → spaces and runs of whitespace
 *      collapsed (handles `BHATTU_KALAN` → `BHATTU KALAN`).
 *   3. Default: the space-normalised uppercased input, used as-is
 *      and combined with the optional ` ST` suffix downstream.
 *
 * Returns `null` for empty / missing input.
 * @param {string | null | undefined} farmBlock
 * @returns {string | null}
 */
export function resolveBlockToSubdist(farmBlock) {
  if (!farmBlock) return null
  const raw = String(farmBlock).trim().toUpperCase()
  if (!raw) return null

  if (Object.prototype.hasOwnProperty.call(BLOCK_TO_SUBDIST, raw)) {
    return BLOCK_TO_SUBDIST[raw]
  }

  const spaced = raw.replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
  if (
    spaced !== raw &&
    Object.prototype.hasOwnProperty.call(BLOCK_TO_SUBDIST, spaced)
  ) {
    return BLOCK_TO_SUBDIST[spaced]
  }
  return spaced
}
