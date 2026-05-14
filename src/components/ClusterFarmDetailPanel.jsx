import { useEffect, useMemo, useRef } from 'react'

/**
 * @param {import('../utils/parseExcel.js').FarmRecord} farm
 */
function authChipClass(status) {
  const u = String(status ?? '').toUpperCase()
  if (u === 'ACCEPTED')
    return 'bg-emerald-100 text-emerald-800'
  if (u === 'REJECTED') return 'bg-red-100 text-red-800'
  if (u === 'PENDING') return 'bg-amber-100 text-amber-900'
  return 'bg-[#1C3A2A]/10 text-[#1C3A2A]/80'
}

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {string} props.clusterName
 * @param {import('../utils/parseExcel.js').FarmRecord[]} props.farms
 * @param {number} [props.clusterRollupFarms] farm total from cluster CSV (for data-gap copy)
 * @param {string | null} [props.focusedVillageNorm] lowercase village name — highlight & scroll rows
 * @param {() => void} props.onBack
 * @param {() => void} props.onClose
 */
export function ClusterFarmDetailPanel({
  open,
  clusterName,
  farms,
  clusterRollupFarms,
  focusedVillageNorm = null,
  onBack,
  onClose,
}) {
  const focusRowElRef = useRef(/** @type {HTMLTableRowElement | null} */ (null))

  const sorted = useMemo(
    () =>
      [...(farms ?? [])].sort((a, b) =>
        String(a.farmId).localeCompare(String(b.farmId)),
      ),
    [farms],
  )

  const firstFocusFarmId = useMemo(() => {
    if (!focusedVillageNorm) return null
    const n = focusedVillageNorm.toLowerCase()
    const hit = sorted.find(
      (f) => String(f.village ?? '').trim().toLowerCase() === n,
    )
    return hit?.farmId ?? null
  }, [focusedVillageNorm, sorted])

  useEffect(() => {
    if (!firstFocusFarmId || !open) return
    const id = window.requestAnimationFrame(() => {
      focusRowElRef.current?.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      })
    })
    return () => window.cancelAnimationFrame(id)
  }, [firstFocusFarmId, open])

  if (!open) return null

  return (
    <div
      className="pointer-events-auto absolute bottom-0 left-0 right-0 z-[1000] flex flex-col border-t-2 border-[#1C3A2A] bg-white shadow-[0_-6px_24px_rgba(28,58,42,0.12)]"
      style={{ height: '220px' }}
    >
      <div className="flex flex-shrink-0 items-center justify-between bg-[#1C3A2A] px-4 py-2 text-white">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="shrink-0 rounded bg-white/20 px-2 py-1 text-xs transition hover:bg-white/30"
          >
            ← Back
          </button>
          <span className="truncate text-sm font-semibold">{clusterName}</span>
          <span className="shrink-0 text-xs opacity-60">
            {sorted.length} farms
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 text-xs opacity-60 transition hover:opacity-100"
        >
          ✕
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {sorted.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm italic text-gray-400">
            <div>
              <p>
                Farm records for this cluster are not in the loaded spreadsheet.
              </p>
              {clusterRollupFarms != null && clusterRollupFarms > 0 ? (
                <p className="mt-2 not-italic text-[#1C3A2A]/70">
                  This cluster has{' '}
                  {clusterRollupFarms.toLocaleString('en-IN')} farms per cluster
                  data.
                </p>
              ) : (
                <p className="mt-2 not-italic text-[#1C3A2A]/60">
                  No spreadsheet rows matched these villages (load the farm file
                  and ensure village / block / district names align).
                </p>
              )}
            </div>
          </div>
        ) : (
          <table className="w-full min-w-[640px] text-xs">
            <thead className="sticky top-0 z-[1] border-b border-[#1C3A2A]/10 bg-[#F7F6F2]">
              <tr>
                {[
                  'Farm ID',
                  'Farmer name',
                  'Village',
                  'Block',
                  'Area (ac)',
                  'Surveyor',
                  'Farmer auth',
                  'Farm auth',
                ].map((h) => (
                  <th
                    key={h}
                    className="whitespace-nowrap px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-[#1C3A2A]/55"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="text-[#1C3A2A]">
              {sorted.map((farm) => {
                const rowHl =
                  Boolean(focusedVillageNorm) &&
                  String(farm.village ?? '').trim().toLowerCase() ===
                    focusedVillageNorm.toLowerCase()
                return (
                  <tr
                    key={farm.farmId}
                    ref={
                      farm.farmId === firstFocusFarmId
                        ? (el) => {
                            focusRowElRef.current = el
                          }
                        : undefined
                    }
                    className={`border-t border-[#1C3A2A]/8 hover:bg-[#1C3A2A]/[0.04] ${rowHl ? 'bg-amber-50/90 ring-1 ring-inset ring-amber-200/90' : ''}`}
                  >
                  <td className="px-3 py-1.5 font-mono text-[11px] text-[#1C3A2A]/90">
                    {farm.farmId}
                  </td>
                  <td className="max-w-[140px] truncate px-3 py-1.5">
                    {farm.farmerName}
                  </td>
                  <td className="max-w-[100px] truncate px-3 py-1.5">
                    {farm.village}
                  </td>
                  <td className="max-w-[100px] truncate px-3 py-1.5">
                    {farm.block}
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 tabular-nums text-[#1C3A2A]/85">
                    {Number(farm.areaAcres ?? 0).toLocaleString('en-IN', {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 2,
                    })}
                  </td>
                  <td className="max-w-[120px] truncate px-3 py-1.5">
                    {farm.surveyor}
                  </td>
                  <td className="px-3 py-1.5">
                    <span
                      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${authChipClass(farm.farmerAuth)}`}
                    >
                      {farm.farmerAuth || '—'}
                    </span>
                  </td>
                  <td className="px-3 py-1.5">
                    <span
                      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${authChipClass(farm.farmAuth)}`}
                    >
                      {farm.farmAuth || '—'}
                    </span>
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
