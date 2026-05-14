export const normalise = (name) =>
  String(name ?? '')
    .trim()
    .toUpperCase()
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')

/**
 * Canonical keys are `normalise(feature.properties.Dist_Name)` from the
 * bundled GeoJSON. Values are alternate spreadsheet / census spellings
 * (also normalise-comparable).
 *
 * Keys mirror the Title-Case `Dist_Name` values in the new
 * `Punjab.geojson` / `Haryana.geojson` files (uppercased).
 */
export const DISTRICT_ALIASES = {
  'SAHIBZADA AJIT SINGH NAGAR': [
    'SAS NAGAR',
    'MOHALI',
    'S.A.S. NAGAR',
  ],
  'TARN TARAN': ['TARNTARAN'],
  MUKTSAR: ['SRI MUKTSAR SAHIB', 'SHRI MUKTSAR SAHIB', 'SRI MUKTSAR'],
  FIROZPUR: ['FEROZEPUR', 'FEROZEPORE', 'FIROZEPUR'],
  'YAMUNA NAGAR': ['YAMUNANAGAR'],
  'SHAHID BHAGAT SINGH NAGAR': [
    'SHAHEED BHAGAT SINGH NAGAR',
    'NAWANSHAHR',
    'NAWAN SHAHR',
    'NAWANSHEHR',
    'NAWAN SHEHAR',
  ],
  GURGAON: ['GURUGRAM'],
  SONIPAT: ['SONEPAT'],
  DADRI: ['CHARKHI DADRI'],
  MEWAT: ['NUH'],
}

/** @param {unknown} spreadsheetName */
export const resolveDistrict = (spreadsheetName) => {
  const n = normalise(spreadsheetName)
  if (!n) return ''
  for (const [geo, aliases] of Object.entries(DISTRICT_ALIASES)) {
    if (n === geo || aliases.includes(n)) return geo
  }
  return n
}

/** GeoJSON feature.properties → map join key */
export function geoDistrictKey(props) {
  if (!props || typeof props !== 'object') return ''
  const v =
    props.Dist_Name ??
    props.DISTRICT ??
    props.District ??
    props.NAME_2 ??
    props.dtname ??
    ''
  return normalise(v)
}
