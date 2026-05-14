import { useEffect, useRef } from 'react'

/**
 * @param {string} status
 */
function authChipClass(status) {
  const u = String(status ?? '').toUpperCase()
  if (u === 'ACCEPTED')
    return 'rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800'
  if (u === 'REJECTED')
    return 'rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-800'
  if (u === 'PENDING')
    return 'rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900'
  return 'rounded bg-[#1C3A2A]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#1C3A2A]/80'
}

/**
 * Bottom-left translucent drawer that pops up once the user has
 * drilled into a village inside a selected block. Lists every farm
 * in that village and auto-scrolls the focused row (the one whose
 * pin/popup is currently open) into view, highlighting it amber.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {string} props.title          village name (display case)
 * @param {string} [props.blockLabel]   block name shown in the header
 * @param {Array<import('../utils/parseExcel.js').FarmRecord>} props.farms
 * @param {string | null} props.focusedFarmId
 * @param {(farmId: string) => void} [props.onFarmRowClick]
 * @param {() => void} [props.onClose]
 */
export function BlockDrillPanel({
  open,
  title,
  blockLabel,
  farms,
  focusedFarmId,
  onFarmRowClick,
  onClose,
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

  return (
    <section
      className="absolute bottom-3 left-3 z-[450] flex max-h-[260px] w-[440px] flex-col overflow-hidden rounded-lg border border-[#1C3A2A]/15 bg-white/95 shadow-lg backdrop-blur-md"
      role="region"
      aria-label={`Farms in ${title || 'selected village'}`}
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[#1C3A2A]/10 bg-white/90 px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-[#1C3A2A]/55">
            {blockLabel || 'Block'}
          </p>
          <p className="truncate font-['Sora',sans-serif] text-sm font-semibold text-[#1C3A2A]">
            {title || 'Village'} ·{' '}
            <span className="font-medium text-[#1C3A2A]/70">
              {farms.length} farm{farms.length === 1 ? '' : 's'}
            </span>
          </p>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded border border-[#1C3A2A]/15 bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#1C3A2A]/75 transition hover:bg-[#F7F6F2]"
            aria-label="Close village farm list"
          >
            Close
          </button>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 z-10 bg-white/95 text-[10px] font-semibold uppercase tracking-wide text-[#1C3A2A]/55 backdrop-blur-sm">
            <tr className="border-b border-[#1C3A2A]/10">
              <th className="px-2 py-1.5 text-left">Farm ID</th>
              <th className="px-2 py-1.5 text-left">Farmer</th>
              <th className="px-2 py-1.5 text-right">Acres</th>
              <th className="px-2 py-1.5 text-left">Auth</th>
            </tr>
          </thead>
          <tbody>
            {farms.map((farm) => {
              const isFocused =
                focusedFarmId && farm.farmId === focusedFarmId
              return (
                <tr
                  key={farm.farmId || `${farm.farmerName}-${Math.random()}`}
                  ref={isFocused ? focusedRowRef : null}
                  onClick={() => onFarmRowClick?.(farm.farmId)}
                  className={`cursor-pointer border-t border-[#1C3A2A]/8 transition-colors ${
                    isFocused
                      ? 'border-l-2 border-l-[#D97706] bg-amber-50/80'
                      : 'hover:bg-[#F7F6F2]'
                  }`}
                >
                  <td className="px-2 py-1.5 font-mono text-[11px] font-semibold text-[#1C3A2A]">
                    {farm.farmId || '—'}
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="truncate">{farm.farmerName || '—'}</div>
                    {farm.surveyor ? (
                      <div className="truncate text-[10px] text-[#1C3A2A]/55">
                        {farm.surveyor}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-[#1C3A2A]/85">
                    {Number(farm.areaAcres ?? 0).toLocaleString('en-IN', {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 2,
                    })}
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex flex-wrap gap-1">
                      <span className={authChipClass(farm.farmerAuth)}>
                        {farm.farmerAuth || '—'}
                      </span>
                      <span className={authChipClass(farm.farmAuth)}>
                        {farm.farmAuth || '—'}
                      </span>
                    </div>
                  </td>
                </tr>
              )
            })}
            {farms.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-3 py-4 text-center text-[11px] italic text-[#1C3A2A]/60"
                >
                  No farms in this village.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  )
}
