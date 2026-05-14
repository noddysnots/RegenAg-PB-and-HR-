import { useEffect, useRef } from 'react'

/**
 * @param {string} status
 */
function authChipClass(status) {
  const u = String(status ?? '').toUpperCase()
  if (u === 'ACCEPTED')
    return 'rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800'
  if (u === 'REJECTED')
    return 'rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-800'
  if (u === 'PENDING')
    return 'rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900'
  return 'rounded bg-[#1C3A2A]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#1C3A2A]/80'
}

/**
 * Bottom-anchored translucent panel that lists the farms currently in
 * scope of the dropdown filter (State › District › Block › Village).
 * It mirrors `BlockDrillPanel`'s visual language but is driven entirely
 * by `selection` + `filtered`, not by the map-drill flow.
 *
 * The panel sits to the LEFT of the right-side drawer when one is open,
 * so it never lays on top of the summary/cluster sidebars.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {string} props.path        e.g. "Haryana › Yamunanagar › Bilaspur › Malakpur"
 * @param {Array<import('../utils/parseExcel.js').FarmRecord>} props.farms
 * @param {string | null} [props.focusedFarmId]
 * @param {(farmId: string) => void} [props.onFarmRowClick]
 * @param {() => void} [props.onClose]
 * @param {number} [props.rightOffsetPx] match the open drawer's width
 */
export function FilteredFarmsPanel({
  open,
  path,
  farms,
  focusedFarmId = null,
  onFarmRowClick,
  onClose,
  rightOffsetPx = 0,
}) {
  const focusedRowRef = useRef(/** @type {HTMLTableRowElement | null} */ (null))

  useEffect(() => {
    if (!open || !focusedFarmId) return
    const row = focusedRowRef.current
    if (row && typeof row.scrollIntoView === 'function') {
      row.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [open, focusedFarmId])

  if (!open) return null

  const empty = !farms || farms.length === 0

  return (
    <aside
      className="pointer-events-auto absolute bottom-0 left-0 z-[450] flex flex-col border-t-2 border-[#1C3A2A] bg-white/95 shadow-[0_-6px_24px_rgba(28,58,42,0.12)] backdrop-blur-md"
      style={{ height: 240, right: rightOffsetPx }}
      role="region"
      aria-label="Farms matching current filter"
    >
      <header className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-white/15 bg-[#1C3A2A] px-3 py-2 text-white">
        <div className="flex min-w-0 items-baseline gap-3">
          <span className="shrink-0 rounded bg-white/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider">
            Filter
          </span>
          <span className="truncate text-sm font-semibold">
            {path || 'All records'}
          </span>
          <span className="shrink-0 text-[11px] text-white/75">
            {farms.length.toLocaleString('en-IN')} farm
            {farms.length === 1 ? '' : 's'}
          </span>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded bg-white/20 px-2 py-1 text-[11px] font-semibold transition hover:bg-white/30"
            aria-label="Close filtered farms panel"
          >
            ✕
          </button>
        ) : null}
      </header>

      {empty ? (
        <div className="flex flex-1 items-center justify-center text-sm italic text-[#1C3A2A]/55">
          No farm records for this selection.
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full border-collapse text-left text-[11px]">
            <thead className="sticky top-0 z-10 bg-white/95 text-[10px] font-semibold uppercase tracking-wider text-[#1C3A2A]/60 backdrop-blur-sm">
              <tr className="border-b border-[#1C3A2A]/15">
                <th className="whitespace-nowrap px-3 py-2 text-left">
                  Farm ID
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-left">
                  Farmer name
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-left">
                  Village
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-left">
                  Block
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-right">
                  Area (ac)
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-left">
                  Surveyor
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-left">
                  Farmer auth
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-left">
                  Farm auth
                </th>
              </tr>
            </thead>
            <tbody>
              {farms.map((farm, i) => {
                const isFocused =
                  focusedFarmId != null && farm.farmId === focusedFarmId
                return (
                  <tr
                    key={`${farm.farmId || 'no-id'}-${i}`}
                    ref={isFocused ? focusedRowRef : null}
                    onClick={() => onFarmRowClick?.(farm.farmId)}
                    className={`cursor-pointer border-t border-[#1C3A2A]/8 transition-colors ${
                      isFocused
                        ? 'border-l-2 border-l-[#D97706] bg-amber-50/85'
                        : i % 2 === 0
                          ? 'bg-white hover:bg-[#1C3A2A]/5'
                          : 'bg-[#1C3A2A]/[0.025] hover:bg-[#1C3A2A]/6'
                    }`}
                  >
                    <td className="whitespace-nowrap px-3 py-1.5 font-mono font-semibold text-[#1C3A2A]">
                      {farm.farmId || '—'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-[#1C3A2A]">
                      {farm.farmerName || '—'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-[#1C3A2A]/85">
                      {farm.village || '—'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-[#1C3A2A]/85">
                      {farm.block || '—'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-[#1C3A2A]/85">
                      {Number.isFinite(farm.areaAcres)
                        ? farm.areaAcres.toLocaleString('en-IN', {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 2,
                          })
                        : '—'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-[#1C3A2A]/85">
                      {farm.surveyor || '—'}
                    </td>
                    <td className="px-3 py-1.5">
                      <span className={authChipClass(farm.farmerAuth)}>
                        {farm.farmerAuth || '—'}
                      </span>
                    </td>
                    <td className="px-3 py-1.5">
                      <span className={authChipClass(farm.farmAuth)}>
                        {farm.farmAuth || '—'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </aside>
  )
}
