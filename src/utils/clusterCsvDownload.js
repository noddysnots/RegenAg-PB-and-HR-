import Papa from 'papaparse'

function normalizeHeader(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

/**
 * @param {Record<string, unknown>[]} rows
 * @param {string} clusterId
 */
export function downloadClusterRowsAsCsv(rows, clusterId) {
  if (!rows.length) return
  const keys = Object.keys(rows[0])
  const idKey =
    keys.find((k) => normalizeHeader(k) === 'cluster_id') ??
    keys.find((k) => normalizeHeader(k).includes('cluster')) ??
    'cluster_id'
  const sub = rows.filter(
    (r) => String(r[idKey] ?? '').trim() === String(clusterId).trim(),
  )
  const csv = Papa.unparse(sub)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `cluster_${clusterId}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
